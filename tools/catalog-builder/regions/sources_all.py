"""Fills catalog/regions/sources.json -> countries for every region of catalog/regions/index.json.

Per country: the Geofabrik extract its places pack is built from, and the language of `name:<locale>`.

- Extracts: for each part of the country (each polygon of catalog/regions/<iso2>.geojson, shrunk by the
  region buffer: the border strip belongs to the neighbour's extract), largest first: an extract already
  chosen if it covers the part, else the smallest Geofabrik extract (by area) that covers it or at least
  NEAR_COVER of it (then what it misses is handled the same way: Bhutan is `bhutan` + `tibet` for the
  disputed border, not all of Asia), else the one covering most of it. "Covers": at most PART_MISS of the
  part is outside the extract once slivers narrower than 2 * SLIVER_DEG are left out (Natural Earth's
  borders and Geofabrik's polygons differ by up to a few km; Kenya's Ilemi Triangle is 0.45%). The first
  extract is the one covering the largest
  share (`geofabrik`), the rest go to `geofabrikMore` (France's overseas departments, Spain's Canary
  Islands). An extract whose parts the others cover too is dropped (Indonesia: the country extract, not
  also its islands'), and so are the SKIP_EXTRA ones. Together they must cover MIN_COVER of the country
  (slivers ignored) unless LOW_COVER says why not. Geofabrik's own ISO codes are not used: they are
  missing for ~50 countries and wrong for a few; the polygons decide. The places pack keeps only what lies inside the
  region boundary, so a larger extract changes the download, not the pack.
- Locale: CLDR territoryInfo, the official (or de facto official) language with the largest population
  share, base subtag only (OSM `name:zh`, not `name:zh-Hant`); without an official one, the most spoken;
  English where CLDR has no language ("und").

Entries already in sources.json are kept as they are (the pilot's choices; `title` stays). Both inputs are
pinned by SHA-256 (INPUTS below) and the output is deterministic (sorted keys).

usage (tools/catalog-builder/README.md, "Country packs"):
  python -I sources_all.py --geofabrik <index-v1.json> --cldr <territoryInfo.json> --regions catalog/regions [--report out.json]
"""

import argparse
import hashlib
import json
import os
import sys

from shapely.geometry import shape
from shapely.ops import unary_union

INPUTS = {
    "geofabrik": {
        "url": "https://download.geofabrik.de/index-v1.json",
        "retrieved": "2026-10-24",
        "sha256": "9b1d170b09eee255c0e56925788eb367646397c1ba1882f36b4c5c79133691fc",
    },
    "cldr": {
        "url": "https://raw.githubusercontent.com/unicode-org/cldr-json/49.0.0/cldr-json/cldr-core/supplemental/territoryInfo.json",
        "sha256": "c8aa7654c87de234118f14ada0e1466eb09467bed4048da7eab3e7e63ffe335d",
    },
}

MIN_COVER = 0.99
SLIVER_DEG = 0.02
PART_MISS = 0.005
NEAR_COVER = 0.95
# Countries whose extracts cover less, with the reason (the rest is in no Geofabrik extract).
LOW_COVER = {"UM": "uninhabited atolls (Wake, Johnston, Baker, Howland, Jarvis) outside every Geofabrik extract; Navassa Island skipped (SKIP_EXTRA)"}
# Extracts left out although they cover part of a country: a whole continent for an uninhabited island.
SKIP_EXTRA = {"NO": {"africa": "Bouvet Island, uninhabited"}, "UM": {"central-america": "Navassa Island, uninhabited"}}
DOWNLOAD_PREFIX = "https://download.geofabrik.de/"
LATEST_SUFFIX = "-latest.osm.pbf"


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pinned(path: str, key: str) -> dict:
    got = sha256_of(path)
    if got != INPUTS[key]["sha256"]:
        sys.exit(f"{path}: SHA-256 {got}, pinned {INPUTS[key]['sha256']} ({INPUTS[key]['url']})")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def extracts(index: dict) -> list:
    out = []
    for f in index["features"]:
        url = f["properties"].get("urls", {}).get("pbf", "")
        if not (url.startswith(DOWNLOAD_PREFIX) and url.endswith(LATEST_SUFFIX)) or not f.get("geometry"):
            continue
        geom = shape(f["geometry"]).buffer(0)
        out.append({"path": url[len(DOWNLOAD_PREFIX) : -len(LATEST_SUFFIX)], "geom": geom, "area": geom.area})
    return sorted(out, key=lambda e: (e["area"], e["path"]))


def parts_of(geom):
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def missed(area, geom):
    """What of `area` lies outside `geom`, slivers along the edge left out."""
    return area.difference(geom).buffer(-SLIVER_DEG)


def covers(e: dict, part) -> bool:
    return e["geom"].intersection(part).area >= 0.5 * part.area and missed(part, e["geom"]).area <= PART_MISS * part.area


def share(e: dict, part) -> float:
    return 1 - missed(part, e["geom"]).area / part.area


def choose(core, candidates: list, skip: dict) -> tuple:
    """Extracts covering the country, largest share first, and the share of the country they cover."""
    picks = []
    parts = sorted(parts_of(core), key=lambda g: -g.area)
    queue = list(parts)
    while queue:
        part = queue.pop(0)
        if any(covers(e, part) for e in picks):
            continue
        hits = [e for e in candidates if e["geom"].intersects(part) and e["path"] not in skip]
        if not hits:
            continue
        good = [e for e in hits if covers(e, part) or share(e, part) >= NEAR_COVER]
        best = good[0] if good else sorted(hits, key=lambda e: (-round(share(e, part), 4), e["area"]))[0]
        if best in picks:
            continue
        picks.append(best)
        if not covers(best, part):
            rest = missed(part, best["geom"])
            queue.extend(g for g in sorted(parts_of(rest), key=lambda g: -g.area) if not g.is_empty)
    # Drop an extract (smallest first) when the others still cover every part it covers.
    for e in sorted(picks, key=lambda e: e["area"]):
        others = [o for o in picks if o is not e]
        mine = [part for part in parts if covers(e, part)]
        if others and mine and all(any(covers(o, part) for o in others) for part in mine):
            picks = others
    picks.sort(key=lambda e: (-e["geom"].intersection(core).area, e["path"]))
    cover = 1 - missed(core, unary_union([e["geom"] for e in picks])).area / core.area if picks else 0.0
    return [e["path"] for e in picks], cover


def locale_of(territory: dict) -> str:
    langs = territory.get("languagePopulation", {})

    def share(code: str) -> float:
        return float(langs[code].get("_populationPercent", "0"))

    official = [c for c, v in langs.items() if v.get("_officialStatus") in ("official", "de_facto_official")]
    pool = official or list(langs)
    if not pool:
        return ""
    best = sorted(pool, key=lambda c: (-share(c), c))[0]
    # Antarctica, Heard Island: no resident language ("und"); their OSM names are English.
    return "en" if best == "und" else best.split("_")[0]


def dumps(sources: dict) -> str:
    """sources.json with one line per object of the top level and per country (reviewable diffs)."""
    rows = []
    for k, v in sources.items():
        if k == "countries":
            inner = ",\n".join(f"    {json.dumps(c)}: {json.dumps(e, ensure_ascii=False)}" for c, e in v.items())
            rows.append(f'  "countries": {{\n{inner}\n  }}')
        else:
            rows.append(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}")
    return "{\n" + ",\n".join(rows) + "\n}\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geofabrik", required=True)
    ap.add_argument("--cldr", required=True)
    ap.add_argument("--regions", required=True)
    ap.add_argument("--report")
    args = ap.parse_args()

    candidates = extracts(pinned(args.geofabrik, "geofabrik"))
    territories = pinned(args.cldr, "cldr")["supplemental"]["territoryInfo"]
    with open(os.path.join(args.regions, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    sources_path = os.path.join(args.regions, "sources.json")
    with open(sources_path, encoding="utf-8") as f:
        sources = json.load(f)

    countries = sources["countries"]
    report = {}
    problems = []
    for region in index["regions"]:
        iso2 = region["iso2"]
        with open(os.path.join(args.regions, region["file"]), encoding="utf-8") as f:
            feature = json.load(f)
        geom = shape(feature["geometry"]).buffer(0)
        core = geom.buffer(-index["bufferDeg"])
        if core.is_empty or core.area < geom.area * 0.05:
            core = geom
        paths, cover = choose(core, candidates, SKIP_EXTRA.get(iso2, {}))
        locale = locale_of(territories.get(iso2, {}))
        if iso2 in countries:
            report[iso2] = {"kept": countries[iso2], "computed": paths, "cover": round(cover, 4), "locale": locale}
            continue
        if (cover < MIN_COVER and iso2 not in LOW_COVER) or not paths or not locale:
            problems.append(f"{iso2} {region['name']}: extracts {paths} cover {cover:.4f}, locale {locale!r}")
            continue
        countries[iso2] = {"geofabrik": paths[0], "locale": locale, **({"geofabrikMore": paths[1:]} if len(paths) > 1 else {})}
        report[iso2] = {"geofabrik": paths, "cover": round(cover, 4), "locale": locale}
    if problems:
        sys.exit("no extract or language:\n  " + "\n  ".join(problems))

    sources["countries"] = dict(sorted(countries.items()))
    sources["inputs"] = {"geofabrikIndex": INPUTS["geofabrik"], "cldrTerritoryInfo": INPUTS["cldr"], "minCover": MIN_COVER, "lowCover": LOW_COVER, "skipExtra": SKIP_EXTRA}
    with open(sources_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(dumps(sources))
    if args.report:
        with open(args.report, "w", encoding="utf-8", newline="\n") as f:
            json.dump(report, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(f"{len(countries)} countries in {sources_path}")


if __name__ == "__main__":
    main()
