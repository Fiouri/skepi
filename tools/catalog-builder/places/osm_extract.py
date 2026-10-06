"""Reads an OpenStreetMap PBF extract and writes the candidate objects of a SKEPI places pack as NDJSON.

One line per object: {"t": "n"|"w"|"r", "id": <osm id>, "lat": .., "lon": .., "tags": {..}}.
Nodes use their location; ways the mean of their node locations; multipolygon relations the mean of the
first outer ring. Only a small set of tags is kept, and only objects that might be places or emergency
POIs are written: the exact classification lives in @skepi/core (classifyOsm), used by the TypeScript
builder (tools/catalog-builder/src/places.ts). Output order follows the PBF (nodes, ways, relations;
ascending ids), so a given extract always produces the same file.

usage: python osm_extract.py <extract.osm.pbf> <out.ndjson> --locale el
"""

import argparse
import json
import sys

import osmium

KEEP_KEYS = (
    "amenity", "healthcare", "emergency", "natural", "tourism", "place", "shelter_type", "drinking_water",
    "name", "name:en", "int_name",
)
AMENITIES = {"hospital", "pharmacy", "fire_station", "police", "drinking_water", "water_point", "shelter"}
PLACES = {"city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood", "locality", "island", "islet"}


def candidate(tags) -> bool:
    if tags.get("amenity") in AMENITIES:
        return True
    if tags.get("healthcare") in ("hospital", "pharmacy"):
        return True
    if tags.get("emergency") == "assembly_point":
        return True
    if tags.get("tourism") in ("alpine_hut", "wilderness_hut"):
        return True
    if tags.get("natural") in ("peak", "spring"):
        return True
    return tags.get("place") in PLACES


def kept(tags, locale_key: str) -> dict:
    out = {}
    for k in (*KEEP_KEYS, locale_key):
        v = tags.get(k)
        if v is not None:
            out[k] = v
    return out


def mean(locations):
    pts = [(p.lat, p.lon) for p in locations if p.valid()]
    if not pts:
        return None
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("out")
    ap.add_argument("--locale", required=True)
    args = ap.parse_args()
    locale_key = f"name:{args.locale}"
    written = 0
    # Areas only for relations: closed ways are handled as ways (one object, one row).
    fp = osmium.FileProcessor(args.pbf).with_locations().with_areas(osmium.filter.EntityFilter(osmium.osm.RELATION))
    with open(args.out, "w", encoding="utf-8", newline="\n") as out:
        for obj in fp:
            tags = obj.tags
            if not candidate(tags):
                continue
            if obj.is_node():
                if not obj.location.valid():
                    continue
                kind, oid, at = "n", obj.id, (obj.location.lat, obj.location.lon)
            elif obj.is_way():
                at = mean(n.location for n in obj.nodes)
                kind, oid = "w", obj.id
            elif obj.is_area():
                if obj.from_way():
                    continue
                rings = list(obj.outer_rings())
                at = mean(n.location for n in rings[0]) if rings else None
                kind, oid = "r", obj.orig_id()
            else:
                continue
            if at is None:
                continue
            row = {"t": kind, "id": oid, "lat": round(at[0], 7), "lon": round(at[1], 7), "tags": kept(tags, locale_key)}
            out.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            out.write("\n")
            written += 1
    print(f"{written} candidate objects -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
