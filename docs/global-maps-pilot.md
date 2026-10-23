# Global maps — pilot report (2026-10-23)

Owner decision 2026-10-23: the user picks a country, downloads its map and places packs, and uses them
offline. This report covers the pilot: the region and pack pipeline, the measured sizes, the eight pilot
countries built in CI, the app changes and the verification. **Nothing was uploaded or signed**: the
packs exist only in the CI runs (reports) and in the maintainer cache of this PC (Cyprus, Greece).
Design: [`architecture.md`](architecture.md) → "Offline maps" → "Global maps"; maintainer steps:
[`tools/catalog-builder/README.md`](../tools/catalog-builder/README.md) → "Country packs".

## Inputs (pinned)

| Input | Pin |
| --- | --- |
| Country boundaries | Natural Earth v5.1.2 `ne_10m_admin_0_countries` (SHA-256 `239eec57…f255`) and `ne_10m_admin_1_states_provinces` (`22d0e3ad…2fb5`), public domain |
| Basemap | Protomaps daily build `20261022` (basemap 4.15.2, 139.08 GB, MD5 `psbfbv+304fdON2I61p+Tg==`) |
| Places | Geofabrik extracts dated `261022` (publisher MD5 checked per file) |
| Tools | go-pmtiles 1.31.2 (Windows and Linux archives by SHA-256), pyosmium 4.3.1 / libosmium 2.23.1, shapely 2.2.0 (CI wheels by SHA-256), osmium-tool (Ubuntu 24.04 package, version in each report), Node 22 |

The Protomaps build of the first Greece pack (20261005) and its Geofabrik extract (`greece-261004`) were
already gone on 2026-10-23: inputs live about one to two weeks.

## Regions and the split rule

`make_regions.py` writes 239 regions (one per `ISO_A2_EH` code, plus the listed units without a code).
Dry runs (`pmtiles extract --dry-run`, build 20261022) of every region at z15:

- **Total 142.7 GB** for 239 countries (planet build 139.1 GB; the overlap of the 0.05° buffers adds ~3%).
- 116 countries ≤ 100 MB, 189 ≤ 500 MB, 220 ≤ 1.5 GB.
- Over 1.9 GB (GitHub's asset limit is 2 GB): US 17.0, CA 16.0, RU 13.0, FR 5.6, DE 5.5, CN 5.2, BR 4.3,
  IN 3.2, NO 3.0, PL 3.0, IT 2.7, GB 2.6, JP 2.6, SE 2.4, ES 2.3, AU 2.1, UA 2.0 GB; between 1.5 and
  1.9 GB: ID 1.9, FI 1.8.
- z14 is 44–52% of z15 for these countries (US 8.0, DE 2.6, IT 1.4, JP 1.2 GB), z13 about 25%.

**Rule:** ≤ 1.5 GB at z15 → one pack; larger → parts of neighbouring admin-1 subdivisions (Natural Earth
regions when each fits) by recursive bisection along the longer axis, each part measured ≤ 1.5 GB at z15;
a single subdivision over 1.5 GB → its own part at the highest zoom that fits. Lowering the max zoom for a
whole country was rejected: it would cost z15 detail for the most-used countries, while parts keep it and
let a user take only the region they need.

Pilot parts (measured, z15): PILOT_PARTS

## Pilot packs (CI, `.github/workflows/packs.yml`)

PILOT_TABLE

## Projection for every country

PROJECTION

## App

- Packs → "Maps & places" (Android, iOS, Windows/macOS): country search, sizes, free-space rule for the
  whole country, T0/T1 warning (≥ 1 GB, or < 4 GB left), download on the user's press only, update,
  delete, parts of split countries, "Use for emergency numbers".
- One map with every installed country (one vector source per pack), places search and the emergency
  POI layer over every installed country (each OSM object once), emergency number of the country of the
  live position (installed countries only, memory only).
- Catalog schema 2 (`region` on map and places packs) in TypeScript and Rust; schema 1 catalogs (Greece)
  keep working; installed `map-gr` / `places-gr` become updatable by id.
- P2P: country packs are ordinary catalog packs (unit-tested propagation of a schema 2 host catalog).

## Verification

VERIFICATION

## Open

OPEN
