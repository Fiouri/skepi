"""Measures map pack sizes without downloading them: `pmtiles extract --dry-run` of a pinned Protomaps
daily build over region GeoJSON files (only the archive directories are read). The CLI reports the
archive size with two or three significant digits, which is enough to plan packs and parts.

usage: python -I measure_regions.py --pmtiles <pinned pmtiles CLI> --build https://build.protomaps.com/20261022.pmtiles
                                    --maxzoom 15 --out sizes.json [--jobs 6] <region.geojson> ...
Writes {"build": .., "maxzoom": .., "sizes": {"<file stem>": {"bytes": n, "tiles": n}}} (sorted keys).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

UNITS = {"B": 1, "kB": 10**3, "MB": 10**6, "GB": 10**9, "TB": 10**12}
SIZE = re.compile(r"for an archive size of ([0-9.]+) (B|kB|MB|GB|TB)")
TILES = re.compile(r"result tile entries (\d+)")


def measure(cli: str, build: str, maxzoom: int, region: str, scratch: str, attempts: int = 3) -> dict:
    out = os.path.join(scratch, os.path.basename(region) + ".pmtiles")
    text = ""
    for _ in range(attempts):
        proc = subprocess.run(
            [cli, "extract", build, out, f"--region={region}", f"--maxzoom={maxzoom}", "--dry-run"],
            capture_output=True,
            text=True,
            check=False,
        )
        text = proc.stdout + proc.stderr
        size = SIZE.search(text)
        tiles = TILES.search(text)
        if proc.returncode == 0 and size:
            return {"bytes": int(float(size.group(1)) * UNITS[size.group(2)]), "tiles": int(tiles.group(1)) if tiles else None}
    raise RuntimeError(f"{region}: pmtiles extract --dry-run failed ({attempts} attempts):\n{text[-2000:]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pmtiles", required=True)
    ap.add_argument("--build", required=True)
    ap.add_argument("--maxzoom", type=int, default=15)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("regions", nargs="+")
    args = ap.parse_args()
    if not re.fullmatch(r"https://build\.protomaps\.com/\d{8}\.pmtiles", args.build):
        raise SystemExit("--build must be a dated Protomaps build")
    with tempfile.TemporaryDirectory() as scratch, ThreadPoolExecutor(max_workers=args.jobs) as pool:
        results = list(pool.map(lambda r: (r, measure(args.pmtiles, args.build, args.maxzoom, r, scratch)), args.regions))
    sizes = {os.path.splitext(os.path.basename(r))[0]: m for r, m in results}
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"build": args.build, "maxzoom": args.maxzoom, "sizes": sizes}, f, sort_keys=True, indent=1)
        f.write("\n")
    print(f"{len(sizes)} regions measured -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
