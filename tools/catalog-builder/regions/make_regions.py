"""Generates the country regions of SKEPI's map and places packs from Natural Earth (public domain).

One GeoJSON Feature per country, catalog/regions/<iso2>.geojson, plus catalog/regions/index.json (name,
bbox, source units, measured sizes and parts). Countries come from ne_10m_admin_0_countries, grouped by
ISO_A2_EH; the few units without an ISO code are covered by the regions listed in EXTRA_UNITS (geographic
coverage for people on the ground, not a position on sovereignty), and EXTRA_ADMIN1 adds first-level units
that Natural Earth puts in another country (Crimea: Russia and Ukraine). Each region is the union of its units,
buffered by BUFFER_DEG (coasts and border strips: the map and the places of a border town are in both
packs), simplified and snapped to a 1e-4 degree grid, clipped to the Web Mercator latitude range.

Parts (countries too large for one pack, see docs/architecture.md, "Offline maps") are groups of
ne_10m_admin_1_states_provinces units, read from catalog/regions/parts.json and written as
catalog/regions/<iso2>-<part>.geojson with the same buffer.

The inputs are pinned by SHA-256 (NATURAL_EARTH below); the output is deterministic (sorted keys,
fixed rounding), so the same inputs give the same files.

usage (tools/catalog-builder/README.md, "Country packs"):
  python -I make_regions.py regions --ne <dir with the two Natural Earth GeoJSON files> --out catalog/regions [--only gr,cy]
  python -I make_regions.py units --ne <dir> --iso US --units-out <scratch dir>
  python -I make_regions.py plan --ne <dir> --iso US --sizes us-units-z15.json --lower 14=us-units-z14.json --limit 1500000000 --out catalog/regions
  python -I make_regions.py measured --sizes all-z15.json --out catalog/regions
"""

import argparse
import hashlib
import json
import os
import math
import re
import subprocess
import sys
import tempfile
import unicodedata

import shapely
from shapely.geometry import box, mapping, shape

NATURAL_EARTH = {
    "version": "v5.1.2",
    "admin0": {
        "file": "ne_10m_admin_0_countries.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson",
        "sha256": "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255",
    },
    "admin1": {
        "file": "ne_10m_admin_1_states_provinces.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson",
        "sha256": "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5",
    },
    "license": "Public domain (Natural Earth, naturalearthdata.com)",
}

BUFFER_DEG = 0.05
SIMPLIFY_DEG = 0.005
GRID_DEG = 1e-4
WORLD = box(-180.0, -85.05112878, 180.0, 85.05112878)

# Natural Earth units without an ISO 3166-1 code (ISO_A2_EH "-99"): the regions whose packs cover them.
# Reefs and banks without a population are left out.
EXTRA_UNITS = {
    "Northern Cyprus": ["CY"],
    "Cyprus No Mans Area": ["CY"],
    "Akrotiri Sovereign Base Area": ["CY"],
    "Dhekelia Sovereign Base Area": ["CY"],
    "Somaliland": ["SO"],
    "US Naval Base Guantanamo Bay": ["CU"],
    "Siachen Glacier": ["IN", "PK"],
    "Southern Patagonian Ice Field": ["AR", "CL"],
    "Bir Tawil": ["EG", "SD"],
    "Spratly Islands": [],
    "Scarborough Reef": [],
    "Bajo Nuevo Bank (Petrel Is.)": [],
    "Serranilla Bank": [],
}

# First-level units Natural Earth puts in one country (its de facto view) that people on the ground may
# also look for in another: they are covered by both (coverage, not sovereignty). Crimea and Sevastopol
# (admin-1 of Russia in Natural Earth; Ukraine per UN General Assembly resolution 68/262).
EXTRA_ADMIN1 = {"UA": ["RUS-283", "RUS-5482"]}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load(ne_dir: str, which: str) -> list:
    meta = NATURAL_EARTH[which]
    path = os.path.join(ne_dir, meta["file"])
    digest = sha256_file(path)
    if digest != meta["sha256"]:
        raise SystemExit(f"{path}: SHA-256 {digest} is not the pinned {meta['sha256']} (Natural Earth {NATURAL_EARTH['version']})")
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


def region_geometry(geoms):
    merged = shapely.union_all([shapely.make_valid(g) for g in geoms])
    grown = merged.buffer(BUFFER_DEG, quad_segs=4)
    simple = grown.simplify(SIMPLIFY_DEG, preserve_topology=True)
    clipped = shapely.intersection(simple, WORLD)
    snapped = shapely.set_precision(clipped, GRID_DEG)
    polys = [g for g in getattr(snapped, "geoms", [snapped]) if g.geom_type == "Polygon" and not g.is_empty]
    if not polys:
        raise SystemExit("empty region geometry")
    out = shapely.MultiPolygon(polys) if len(polys) > 1 else polys[0]
    return shapely.normalize(out)


def rounded(value):
    if isinstance(value, float):
        r = round(value, 4)
        return 0.0 if r == 0 else r
    if isinstance(value, (list, tuple)):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def bbox_of(geom) -> list:
    """The smallest box around the region. West > east when it crosses the antimeridian (the
    region's polygons on both sides of +-180: United States, Russia, Fiji)."""
    _, s, _, n = geom.bounds
    spans = sorted((p.bounds[0], p.bounds[2]) for p in getattr(geom, "geoms", [geom]))
    # Merge the longitude spans, then drop the widest gap between them (around the circle).
    merged = []
    for w, e in spans:
        if merged and w <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([w, e])
    gaps = [(merged[i + 1][0] - merged[i][1], i) for i in range(len(merged) - 1)]
    wrap_gap = merged[0][0] + 360 - merged[-1][1]
    widest = max(gaps, default=(-1.0, -1))
    if widest[0] > wrap_gap:
        i = widest[1]
        w, e = merged[i + 1][0], merged[i][1]
    else:
        w, e = merged[0][0], merged[-1][1]
    return [round(w, 4), round(s, 4), round(e, 4), round(n, 4)]


def vertex_count(geom) -> int:
    return int(shapely.get_num_coordinates(geom))


def write_json(path: str, data) -> None:
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
        f.write("\n")


def feature(geom, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": rounded(mapping(geom))}


def countries(features: list) -> dict:
    """iso2 -> {name, units: [ADMIN], geoms: []}."""
    out = {}
    for f in features:
        p = f["properties"]
        admin = p["ADMIN"]
        codes = [p["ISO_A2_EH"]] if p["ISO_A2_EH"] not in ("-99", None) else EXTRA_UNITS.get(admin)
        if codes is None:
            raise SystemExit(f"Natural Earth unit without an ISO code and not in EXTRA_UNITS: {admin}")
        for code in codes:
            r = out.setdefault(code, {"units": [], "geoms": [], "named": None})
            r["units"].append(admin)
            r["geoms"].append(shape(f["geometry"]))
            # The name and the centre (label point): the unit that carries the ISO code, the most
            # populous one when several do.
            if p["ISO_A2_EH"] == code:
                pop = p.get("POP_EST") or 0
                if r["named"] is None or pop > r["named"][0]:
                    r["named"] = (pop, p.get("NAME_EN") or p["NAME"], [round(p["LABEL_X"], 4), round(p["LABEL_Y"], 4)])
    for code, r in out.items():
        if r["named"] is None:
            raise SystemExit(f"region {code} has no named unit")
    return out


def admin1_units(features: list, code: str) -> list:
    """The first-level subdivisions of a country, with the region / sub-region names Natural Earth
    gives them (a unit without one takes its nearest neighbour's), sorted region by region."""
    extra = set(EXTRA_ADMIN1.get(code, ()))
    units = [f for f in features if f["properties"]["iso_a2"] == code or f["properties"]["adm1_code"] in extra]
    if not units:
        raise SystemExit(f"{code}: no admin-1 units in Natural Earth")
    rows = []
    for f in units:
        p = f["properties"]
        rows.append({
            "code": p["adm1_code"],
            "name": p.get("name_en") or p["name"],
            "local": p["name"],
            "region": p.get("region") or None,
            "sub": p.get("region_sub") or None,
            "lon": round(p["longitude"], 4),
            "lat": round(p["latitude"], 4),
            "geom": shape(f["geometry"]),
        })
    # An English name two units share (Washington: the state and the District of Columbia) gives
    # way to the Natural Earth name.
    shared = {n for n in (r["name"] for r in rows) if sum(1 for o in rows if o["name"] == n) > 1}
    for r in rows:
        if r["name"] in shared:
            r["name"] = r["local"]
    known = [o for o in rows if o["region"] is not None]
    for r in rows:
        if r["region"] is None and known:
            near = min(known, key=lambda o: ((o["lon"] - r["lon"]) ** 2 + (o["lat"] - r["lat"]) ** 2, o["code"]))
            r["region"], r["sub"] = near["region"], near["sub"]
    rows.sort(key=lambda r: (r["region"] or "", r["sub"] or "", -r["lat"], r["lon"], r["code"]))
    return rows


def slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    out = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return out[:32].strip("-") or "part"


def names_of(group: list) -> str:
    # Natural Earth has a few units without any name (RUS+99?, a coastal strip of Yamal): left unnamed.
    return ", ".join(u["name"] for u in group if u["name"])


def part_names(label: str, rows: list) -> tuple:
    """The display name of a part and its search names. The planner named a part after its units,
    largest first (`label`; plans before 2026-10-24 cut it to three names "and N more"): Natural Earth
    regions (Italy, Japan) when the first name is a region of the part, else the admin-1 units. The
    display name lists every unit, the label's order first; the search names are the English and
    local names of every admin-1 unit, and the regions when the part is named after them ("Bayern"
    finds "Bavaria"; the census regions "West", "South" of the United States are left out)."""
    lead = [n for n in re.sub(r" and \d+ more$", "", label).split(", ") if n]
    regions = {r["region"] for r in rows if r["region"]}
    by_region = bool(lead) and lead[0] in regions and lead[0] not in {r["name"] for r in rows}
    units = []
    for r in rows:
        n = r["region"] if by_region else r["name"]
        if n and n not in units:
            units.append(n)
    missing = [n for n in lead if n not in units]
    if missing:
        raise SystemExit(f"part {label!r}: {missing} are not units of the part")
    name = ", ".join(lead + [n for n in units if n not in lead])
    search, seen = [], set()
    for n in [*units, *(x for r in rows for x in (r["name"], r["local"], r["region"] if by_region else None))]:
        if n and n.casefold() not in seen:
            seen.add(n.casefold())
            search.append(n)
    return name, search


class Sizer:
    """Size of a group of units at z15: `pmtiles extract --dry-run` of the buffered union (as the part
    would be built), cached; the sum of the units' measured sizes when no CLI is given, or when that
    sum is so far above the limit that the group must be split anyway (the sum overestimates: low-zoom
    tiles and buffers are counted once per unit, but never by more than half)."""

    def __init__(self, sizes: dict, cli, build, scratch, limit: int):
        self.sizes, self.cli, self.build, self.scratch, self.limit, self.cache = sizes, cli, build, scratch, limit, {}

    def __call__(self, group: list) -> int:
        codes = tuple(sorted(c for u in group for c in u["codes"]))
        total = sum(self.sizes[c] for c in codes)
        if len(codes) == 1 or not self.cli or total > 2 * self.limit:
            return total
        if codes not in self.cache:
            path = os.path.join(self.scratch, f"group-{len(self.cache)}.geojson")
            write_json(path, feature(region_geometry([g for u in group for g in u["geoms"]]), {}))
            self.cache[codes] = dry_run(self.cli, self.build, path, 15)
        return self.cache[codes]


def dry_run(cli: str, build: str, region: str, maxzoom: int, attempts: int = 3) -> int:
    """Archive size reported by `pmtiles extract --dry-run` (network errors are retried)."""
    text = ""
    for _ in range(attempts):
        proc = subprocess.run([cli, "extract", build, region + ".pmtiles", f"--region={region}", f"--maxzoom={maxzoom}", "--dry-run"], capture_output=True, text=True, check=False)
        text = proc.stdout + proc.stderr
        m = re.search(r"for an archive size of ([0-9.]+) (B|kB|MB|GB|TB)", text)
        if proc.returncode == 0 and m:
            return int(float(m.group(1)) * {"B": 1, "kB": 10**3, "MB": 10**6, "GB": 10**9, "TB": 10**12}[m.group(2)])
    raise SystemExit(f"pmtiles extract --dry-run failed for {region} ({attempts} attempts):\n{text[-2000:]}")


def bisect(units: list, size, limit: int) -> list:
    """Recursive bisection along the longer axis of the units' label points, at the split that best
    balances the two halves (by the units' own sizes), until every group measures at most `limit`
    bytes: compact parts of neighbouring units."""
    if len(units) == 1 or size(units) <= limit:
        return [units]
    mean_lat = sum(u["lat"] for u in units) / len(units)
    xs = [u["lon"] * math.cos(math.radians(mean_lat)) for u in units]
    ys = [u["lat"] for u in units]
    axis = 0 if max(xs) - min(xs) >= max(ys) - min(ys) else 1
    ordered = sorted(units, key=lambda u: ((u["lon"] if axis == 0 else u["lat"]), u["key"]))
    total = sum(u["bytes"] for u in ordered)
    best, best_gap, running = 1, None, 0
    for i in range(1, len(ordered)):
        running += ordered[i - 1]["bytes"]
        gap = abs(total - 2 * running)
        if best_gap is None or gap < best_gap:
            best, best_gap = i, gap
    return bisect(ordered[:best], size, limit) + bisect(ordered[best:], size, limit)


def plan_units(rows: list, sizes: dict, limit: int, use_regions: bool) -> list:
    """Planning units: Natural Earth's regions of the country (Italy's 20 regions rather than 110
    provinces, Japan's 8 regions) when every admin-1 unit has one and every region fits the limit,
    else the admin-1 units."""
    def unit(key, name, members):
        return {
            "key": key,
            "name": name,
            "codes": [m["code"] for m in members],
            "geoms": [m["geom"] for m in members],
            "lat": sum(m["lat"] for m in members) / len(members),
            "lon": sum(m["lon"] for m in members) / len(members),
            "bytes": sum(sizes[m["code"]] for m in members),
        }

    if use_regions and all(r["region"] for r in rows):
        regions = {}
        for r in rows:
            regions.setdefault(r["region"], []).append(r)
        if len(regions) > 1:
            return [unit(f"R:{name}", name, members) for name, members in sorted(regions.items())]
    return [unit(r["code"], r["name"], [r]) for r in rows]


def plan_parts(rows: list, sizes: dict, limit: int, lower_zoom: dict, size) -> list:
    """Parts of a country (bisect). A unit that alone exceeds the limit becomes a part of its own at
    the highest measured zoom that fits (`lower_zoom`: {zoom: sizes by admin-1 code})."""
    units = plan_units(rows, sizes, limit, True)
    if any(len(u["codes"]) > 1 and size([u]) > limit for u in units):
        units = plan_units(rows, sizes, limit, False)
    big = [u for u in units if len(u["codes"]) == 1 and sizes[u["codes"][0]] > limit]
    rest = [u for u in units if u not in big]
    parts = [{"units": g, "maxzoom": 15} for g in (bisect(rest, size, limit) if rest else [])]
    for u in big:
        code = u["codes"][0]
        zoom = next((z for z in sorted(lower_zoom, reverse=True) if lower_zoom[z].get(code, limit + 1) <= limit), None)
        if zoom is None:
            raise SystemExit(f"{code} ({u['name']}): over {limit} bytes at z15 and at every lower zoom measured")
        parts.append({"units": [u], "maxzoom": zoom})
    out, ids = [], set()
    for p in parts:
        group = sorted(p["units"], key=lambda u: (-u["bytes"], u["key"]))
        base = slug(next((u["name"] for u in group if u["name"]), "part"))
        pid, n = base, 2
        while pid in ids:
            pid = f"{base[:29]}-{n}"
            n += 1
        ids.add(pid)
        out.append({"id": pid, "name": names_of(group), "maxzoom": p["maxzoom"], "admin1": sorted(c for u in group for c in u["codes"]), "estimatedBytes": size(group) if p["maxzoom"] == 15 else None})
    return sorted(out, key=lambda p: p["id"])


def unit_stem(code: str) -> str:
    """File name of an admin-1 unit: Natural Earth codes such as `RUS+99?` are not valid on Windows."""
    return re.sub(r"[^A-Za-z0-9+_-]", "_", code)


def read_sizes(path: str, rows: list) -> dict:
    """measure_regions.py sizes (by file stem) of the units, by admin-1 code."""
    with open(path, encoding="utf-8") as f:
        by_stem = {k: v["bytes"] for k, v in json.load(f)["sizes"].items()}
    return {r["code"]: by_stem[unit_stem(r["code"])] for r in rows if unit_stem(r["code"]) in by_stem}


def cmd_units(args) -> int:
    code = args.iso.upper()
    rows = admin1_units(load(args.ne, "admin1"), code)
    os.makedirs(args.units_out, exist_ok=True)
    for r in rows:
        write_json(os.path.join(args.units_out, f"{unit_stem(r['code'])}.geojson"), feature(region_geometry([r["geom"]]), {"iso2": code, "admin1": r["code"], "name": r["name"]}))
    write_json(os.path.join(args.units_out, "units.json"), [{k: v for k, v in r.items() if k != "geom"} for r in rows])
    print(f"{len(rows)} admin-1 units of {code} -> {args.units_out}", file=sys.stderr)
    return 0


def cmd_plan(args) -> int:
    code = args.iso.upper()
    rows = admin1_units(load(args.ne, "admin1"), code)
    sizes = read_sizes(args.sizes, rows)
    missing = [r["code"] for r in rows if r["code"] not in sizes]
    if missing:
        raise SystemExit(f"{code}: no measured size for {missing}")
    lower = {int(z): read_sizes(p, rows) for z, p in (s.split("=", 1) for s in args.lower)}
    with open(args.sizes, encoding="utf-8") as f:
        build = json.load(f)["build"]
    with tempfile.TemporaryDirectory() as scratch:
        parts = plan_parts(rows, sizes, args.limit, lower, Sizer(sizes, args.pmtiles, build, scratch, args.limit))
    path = os.path.join(args.out, "parts.json")
    spec = {"limitBytes": args.limit, "countries": {}}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            spec = json.load(f)
    spec["limitBytes"] = args.limit
    spec["countries"][code] = {"build": build, "parts": parts}
    write_json(path, spec)
    for p in parts:
        est = p["estimatedBytes"] if p["estimatedBytes"] is not None else sum(lower[p["maxzoom"]][c] for c in p["admin1"])
        print(f"{code} {p['id']:32} z{p['maxzoom']} ~{est / 1e9:.2f} GB  {p['name']}", file=sys.stderr)
    return 0


def cmd_measured(args) -> int:
    index_path = os.path.join(args.out, "index.json")
    with open(index_path, encoding="utf-8") as f:
        index = json.load(f)
    with open(args.sizes, encoding="utf-8") as f:
        data = json.load(f)
    for entry in index["regions"]:
        targets = [(entry, os.path.splitext(entry["file"])[0])] + [(p, os.path.splitext(p["file"])[0]) for p in entry.get("parts", [])]
        for target, stem in targets:
            m = data["sizes"].get(stem)
            if m:
                target.setdefault("measured", {})[f"z{data['maxzoom']}"] = {"build": data["build"], "bytes": m["bytes"], "tiles": m["tiles"]}
    write_json(index_path, index)
    return 0


def cmd_regions(args) -> int:
    only = {c.strip().upper() for c in args.only.split(",") if c.strip()}
    os.makedirs(args.out, exist_ok=True)
    index_path = os.path.join(args.out, "index.json")
    previous = {}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            previous = {r["iso2"]: r for r in json.load(f)["regions"]}
    parts_path = os.path.join(args.out, "parts.json")
    parts_spec = {}
    if os.path.exists(parts_path):
        with open(parts_path, encoding="utf-8") as f:
            parts_spec = json.load(f)["countries"]

    regions = countries(load(args.ne, "admin0"))
    admin1 = load(args.ne, "admin1") if parts_spec or EXTRA_ADMIN1 else []
    for code, extra in EXTRA_ADMIN1.items():
        found = [f for f in admin1 if f["properties"]["adm1_code"] in extra]
        if len(found) != len(extra):
            raise SystemExit(f"EXTRA_ADMIN1 {code}: {extra} not all in Natural Earth admin-1")
        for f in found:
            regions[code]["units"].append(f"{f['properties']['name_en'] or f['properties']['name']} (admin-1 {f['properties']['adm1_code']})")
            regions[code]["geoms"].append(shape(f["geometry"]))
    parts_named = False
    source = f"Natural Earth {NATURAL_EARTH['version']} ne_10m_admin_0_countries (public domain)"
    entries = []
    for code in sorted(regions):
        r = regions[code]
        name = r["named"][1]
        lower = code.lower()
        old = previous.get(code, {})
        geom = region_geometry(r["geoms"])
        entry = {
            "iso2": code,
            "name": name,
            "bbox": bbox_of(geom),
            "center": r["named"][2],
            "file": f"{lower}.geojson",
            "units": sorted(r["units"]),
            "vertices": vertex_count(geom),
        }
        # Measured sizes (measure_regions.py, then `measured`) are kept across regenerations.
        if "measured" in old:
            entry["measured"] = old["measured"]
        if not only or code in only:
            write_json(os.path.join(args.out, entry["file"]), feature(geom, {"iso2": code, "name": name, "source": source, "units": entry["units"], "bufferDeg": BUFFER_DEG}))
        spec = parts_spec.get(code)
        if spec:
            entry["parts"] = []
            for part in spec["parts"]:
                codes = set(part["admin1"])
                units = [f for f in admin1 if f["properties"]["adm1_code"] in codes]
                found = {f["properties"]["adm1_code"] for f in units}
                missing = sorted(codes - found)
                if missing:
                    raise SystemExit(f"{code}/{part['id']}: unknown admin-1 codes {missing}")
                pgeom = region_geometry([shape(f["geometry"]) for f in units])
                rows = [r for r in admin1_units(admin1, code) if r["code"] in codes]
                pname, search = part_names(part["name"], rows)
                if pname != part["name"]:
                    part["name"] = pname
                    parts_named = True
                pentry = {
                    "id": part["id"],
                    "name": pname,
                    "regions": search,
                    "bbox": bbox_of(pgeom),
                    "file": f"{lower}-{part['id']}.geojson",
                    "maxzoom": part.get("maxzoom", 15),
                    "admin1": sorted(found),
                }
                oldp = next((p for p in old.get("parts", []) if p["id"] == part["id"]), {})
                if "measured" in oldp:
                    pentry["measured"] = oldp["measured"]
                if not only or code in only:
                    props = {"iso2": code, "name": f"{name}: {part['name']}", "source": source.replace("admin_0_countries", "admin_1_states_provinces"), "admin1": pentry["admin1"], "bufferDeg": BUFFER_DEG}
                    write_json(os.path.join(args.out, pentry["file"]), feature(pgeom, props))
                entry["parts"].append(pentry)
        entries.append(entry)
    index = {
        "naturalEarth": {k: NATURAL_EARTH[k] for k in ("version", "admin0", "admin1", "license")},
        "bufferDeg": BUFFER_DEG,
        "simplifyDeg": SIMPLIFY_DEG,
        "gridDeg": GRID_DEG,
        "extraUnits": EXTRA_UNITS,
        "extraAdmin1": EXTRA_ADMIN1,
        "regions": entries,
    }
    write_json(index_path, index)
    if parts_named:
        # Full part names (earlier plans cut them); the plan itself (units, sizes) is unchanged.
        write_json(parts_path, {**json.load(open(parts_path, encoding="utf-8")), "countries": parts_spec})
    print(f"{len(entries)} regions -> {args.out}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("regions", help="write catalog/regions/<iso2>.geojson, the parts and index.json")
    r.add_argument("--ne", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--only", default="")
    u = sub.add_parser("units", help="write one GeoJSON per admin-1 unit of a country (to measure them)")
    u.add_argument("--ne", required=True)
    u.add_argument("--iso", required=True)
    u.add_argument("--units-out", required=True)
    p = sub.add_parser("plan", help="group a country's admin-1 units into parts from their measured sizes")
    p.add_argument("--ne", required=True)
    p.add_argument("--iso", required=True)
    p.add_argument("--sizes", required=True, help="measure_regions.py output for the units at z15")
    p.add_argument("--lower", nargs="*", default=[], help="zoom=sizes.json for units too large at z15, e.g. 14=units-z14.json")
    p.add_argument("--limit", type=int, required=True)
    p.add_argument("--pmtiles", help="pinned pmtiles CLI: measure every candidate group (dry run) instead of summing its units")
    p.add_argument("--out", required=True)
    m = sub.add_parser("measured", help="record measured sizes in index.json")
    m.add_argument("--sizes", required=True)
    m.add_argument("--out", required=True)
    args = ap.parse_args()
    return {"regions": cmd_regions, "units": cmd_units, "plan": cmd_plan, "measured": cmd_measured}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
