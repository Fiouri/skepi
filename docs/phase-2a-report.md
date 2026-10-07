# Phase 2a · P2P sharing and places (Android)

Date: 2026-10-08 · Devices: Galaxy S23 (SM-S911B, Android 16, T2) and two Android 16 x86_64 emulators
(`skepi-host`, `skepi-recv`, Google APIs image, arm64 app through ARM translation) on one virtual Wi-Fi LAN ·
Builds: release `org.skepi.app` (release key, R8, `-PskepiAllowDraftCards=true` for this internal build,
arm64-v8a, 50.1 MB) and debug `org.skepi.app.dev` (test catalog, JS bundled) · Evidence:
[`docs/phase2a/`](phase2a/) · iOS is Phase 2b.

## Acceptance criteria

| Criterion | Result | |
| --- | --- | --- |
| Greek removed from required gates; Greek UI hidden in release unless the developer flag is set | rag-eval, parity, bench and E2E run English only by default (`--greek` / `-IncludeGreek` for the frozen locale, reported, never gated); `dev.greekUi` (Bench, off in every build) gates the Greek UI; onboarding shows no Greek choice (`onboarding.yaml` asserts it); `localeConfig` lists `en` only; cards always English | ✓ |
| Battery labels come from unplugged measurements | S23 on battery, wireless adb, airplane mode with Wi-Fi kept for adb: AI summary ≈ 0.15% (4 runs), GNSS fix attempt ≈ 0.40% (3 × 180 s, indoors, no fix), SOS torch ≈ 0.13% per minute (3 × 86 s). Labels on the S23: "≈ 0.2%", "≈ 0.4%", "≈ 0.1%" | ✓ (see §6) |
| Place search returns results offline for English and local names; the POI layer renders from the places pack | `places.yaml` in airplane mode on the S23 (release, signed catalog sequence 2) and on the host emulator: "Patras", "Θεσσαλονίκη" and "hospital patras" found; the map opens on the place with the POI layer (29 points around Patras centre), filters work, ODbL attribution shown | ✓ |
| P2P between two emulators on the LAN: a pack transfers, every chunk verifies, a corrupted chunk is re-requested, an interrupted transfer resumes, a newer signed catalog propagates | `e2e/run-p2p.ps1`, scenario `propagate` (§3): catalog 4 adopted, the pack known only to it installed verified, chunk 2 re-requested alone, drop at chunk 3, resume from chunk 3, 4/4 chunks verified | ✓ |
| A tampered pack or a catalog with a bad signature or lower sequence is rejected on the receiver | scenarios `tampered`, `bad-signature`, `rollback` (§3); unit tests in `transfer.test.ts` | ✓ |
| A host never serves unselected packs or user data (tested) | `TransferServerTest.neverServesUnselectedPacksOrUserData` (16 paths incl. traversal and encoded variants, app.db, settings, notes, other packs: all 404; only GET); the manifest lists only selected packs (`transfer.test.ts`) | ✓ |
| Hotspot mode is implemented; if only one physical device is available, say so | LocalOnlyHotspot (host) and WifiNetworkSpecifier join (receiver) are implemented. **Only one physical device is available: the hotspot test is pending.** Emulators have no soft-AP. | implemented · test pending |

## 1. English-only until v1 (Greek frozen)

- `packages/i18n`: `enabledLocales(flag)`, `effectiveLocale`; `resolveLocale(..., enabled)` gives Greek only while
  enabled. App: `dev.greekUi` (typed setting, Bench switch "Greek UI (frozen locale)", default off in every build);
  a Greek choice made before the freeze falls back to English. Greek strings stay complete and tested.
- Emergency cards: `CARD_DISPLAY_LOCALE = 'en'`; the Greek translation stays in the data and its tests.
- rag-eval: only English items gate (`GATED_LANGUAGES`); `--greek` adds the `el` set, the Greek adversarial items
  and the `zimLocale` pack, reported as "frozen locale, not gated". Parity and provisioning: `--greek` /
  `-IncludeGreek`. Bench: Greek queries only with the flag, never gated (schema 5). E2E: `locale-el.yaml` only with
  `-IncludeGreek`; it switches the flag on and off.
- `scripts/content.lock.json`: `zimDefault` = English packs, `zimLocale` = Greek pack.

## 2. Places and map packs

- **catalog-builder**: two built source kinds. `pmtiles-extract` runs the pinned go-pmtiles CLI on a dated
  Protomaps build over `catalog/regions/greece.geojson` (Geofabrik boundary): `map-gr`, build 20261005, z0–15,
  507 MB. `osm-places` downloads a dated Geofabrik extract (MD5 checked against the publisher), extracts
  candidates with pyosmium (`places/osm_extract.py`, 44,931 objects, 7 min) and writes the pack with
  `@skepi/core` `places.ts` (schema, `classifyOsm`, folded names): `places-gr`, 37,262 places (18,822 settlements,
  5,696 pharmacies, 4,459 drinking water, 3,079 shelters incl. assembly points and huts, 464 police, 411 hospitals,
  218 fire stations, 4,113 peaks/springs), 5.3 MB, deterministic for a given extract (unit test). Test packs may use
  smaller power-of-two chunks (64 KiB) for the P2P tests.
- **Catalogs**: release sequence 2 (8 packs incl. `map-gr`, `places-gr`), signed by the maintainer with
  `cat-2026a` offline; debug sequence 3 (11 packs); mirror catalogs good 4 / wrong-key 5 / tampered / rollback 2;
  `test-propagation` (`e2e/fixtures/p2p-propagation.zim`) exists only from sequence 4. Mirror for the two built
  packs: GitHub release `packs-2026-10` (upload by the maintainer).
- **App**: only verified `pmtiles` / `places` packs open (unknown files in `maps/` are listed as ignored); places
  packs open read-only through op-sqlite (FTS5 enabled in the SQLCipher build). Home search shows places (English
  name, local name, kind) next to cards and articles; a result opens the map on it. Map: GeoJSON POI layer from
  the visible area at zoom ≥ 10, six category filters (contrast-checked colours in `ui-tokens`), tap for details,
  attribution "© OpenStreetMap contributors (ODbL 1.0) · Protomaps". Search takes ~1 ms per query on a desktop
  and is instant on the S23.

## 3. P2P (`modules/expo-transfer`, `packages/core/src/transfer.ts`)

Design and permissions: `docs/architecture.md` ("P2P content sharing" → Implementation); threats:
`docs/threat-model.md` ("P2P sharing"). Summary: QR `{ v, ssid?, psk?, host, port, token, certSha256 }`; 128-bit
token; per-session EC P-256 key and self-signed certificate (minimal DER), TLS 1.3 only, pinned by SHA-256;
`GET /manifest` and `GET /pack/:id` with Range; 30 minutes idle stop; host serves only the selected packs;
receiver adopts a host catalog only with a valid signature and a higher sequence, checks every chunk against the
catalog on arrival, re-requests a bad chunk alone (3 attempts), resumes from the verified prefix of
`tmp/<file>.p2p.partial`, and installs through ContentStore (whole-file hash, atomic rename, `source = 'p2p'`).
Unverified offers: never auto-selected; only ZIMs, by explicit choice, stay unverified. APK page: cleartext `/`
and `/skepi.apk` with the signing-certificate SHA-256, no REQUEST_INSTALL_PACKAGES.

**Two-emulator E2E** (`e2e/run-p2p.ps1`): the emulators run with `-wifi-server-port` / `-wifi-client-port` and
join one virtual access point (10.0.2.16 and 10.0.2.17). The host adopts catalog sequence 4 from the local test
mirror; the receiver keeps sequence 3. Faults come from the host's debug-only fault injection.

| Scenario | Host (debug faults) | Receiver result | |
| --- | --- | --- | --- |
| `propagate` | shares `test-smoke-en` (217 KB, 4 × 64 KiB chunks) and `test-propagation` (only in catalog 4); chunk 2 corrupted once, connection dropped at chunk 3 once | "Newer signed catalog received and verified (sequence 4)"; both packs verified by that catalog and pre-selected; `test-propagation` installed (verified); `test-smoke-en`: chunk 2 rejected and re-requested alone ("re-requested 1"), then "Interrupted" at chunk 3 with chunks 1–2 kept; second Receive: "resumed from chunk 3", "chunk 4/4 verified", installed (verified) | ✓ |
| `tampered` | every response of the pack altered | "Rejected: the file did not match the signed catalog" after 3 attempts; nothing installed, no partial file left (`tmp/` empty) | ✓ |
| `bad-signature` | its catalog sent with another signature | "catalog was not accepted (bad_signature)"; packs checked against the receiver's own catalog | ✓ |
| `rollback` | its embedded catalog (sequence 3) after the receiver adopted 4 | "catalog was not accepted (rollback)" | ✓ |
| places | host emulator, airplane mode | place search and the POI layer from the received/provisioned packs | ✓ |

Run: `e2e/run-p2p.ps1` → **P2P E2E PASS** (10/10 flows; JUnit and screenshots in
[`phase2a/e2e/p2p/`](phase2a/e2e/p2p/)). The receiver's content folder afterwards holds exactly the two verified
packs (`p2p-receiver-files.txt`).

**Instrumentation** (`TransferServerTest`, 11 tests, on the host emulator and on the S23): manifest and chunks over
pinned TLS 1.3; another certificate refused; TLS 1.2 refused; token required (401); 16 non-selected paths 404;
only GET; Range bounds; corrupt-once and drop-once faults; idle stop; non-local hosts refused; fresh certificates
per session; the APK page serves only `/` and `/skepi.apk`.

## 4. Release guards

Allowlist (`tools/release-guards`): Phase 1d + exactly CHANGE_WIFI_STATE, CHANGE_NETWORK_STATE,
NEARBY_WIFI_DEVICES (`neverForLocation`) and CAMERA; REQUEST_INSTALL_PACKAGES, RECORD_AUDIO and background location
forbidden. Release APK: **PERMISSION ALLOWLIST: PASS** (locally; CI below). The bundle-rebuild probe is unchanged
and runs in CI. ESLint: `expo-transfer` may only be imported by `apps/mobile/src/lib/transfer.ts`.

## 5. Data

Migration 3 rebuilds `packs` with `source IN ('download','import','provisioned','p2p')` and the same rules
(unit test with data kept and the CHECKs still enforced).

## 6. Battery costs without the cable

- `e2e/adb-wireless.ps1`: pair (`-Pair` + code), connect (`-Connect`, or mDNS discovery since the port changes when
  the cable is pulled), `-KeepWifiInAirplane` (removes Wi-Fi from `airplane_mode_radios`; `-Restore`).
  `run-e2e.ps1`, `run-parity.ps1` and the new `run-energy.ps1` take the wireless serial.
- Finding: the S23 updates its charge counter only every ~30 s in steps of ~3.7 mAh (≈ 0.1%), so a 6–10 s AI
  summary read as 0 and the labels said "< 0.1%". The app now integrates the battery current
  (`BATTERY_PROPERTY_CURRENT_NOW`, every 200 ms; `expo-device-profile` `EnergyMeter`) over each action and scales it
  with the capacity implied by the charge counter; the charge-counter delta stays the fallback. Labels have two
  decimals below 0.1% ("≈ 0.05%", "< 0.01%").
- `e2e/energy.yaml` (`run-energy.ps1`, release build, on battery, airplane mode, location on): clears earlier samples,
  4 AI summaries, 3 GNSS fixes, 3 SOS torch runs, export to `bench/energy-latest.json`
  ([`phase2a/energy/`](phase2a/energy/)):

| Action (T2, S23) | Samples | Values | Median | Label |
| --- | --- | --- | --- | --- |
| AI summary (on request) | 4 | 0.099, 0.131, 0.170, 0.175% (6–10 s each) | 0.151% | ≈ 0.2% |
| GNSS fix attempt | 3 | 0.396, 0.401, 0.407% (180 s timeout each, indoors) | 0.401% | ≈ 0.4% |
| SOS torch per minute | 3 | 0.126, 0.130, 0.131% | 0.130% | ≈ 0.1% |

The values are the whole phone's draw during the action (screen on), which is what the user pays. The GNSS value
is a worst case: indoors there was no fix, so each attempt ran to the 180 s timeout; a sky-view fix is an owner test.

## 7. Optional: Qwen3-1.7B

Not evaluated in this phase (the mandatory items took the time). Still open.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`: green — core 294 (incl. `transfer.test.ts`, `places.test.ts`),
  catalog-builder 17 (places pack, built sources, chunk sizes), db 16 (migration 3, energy), emergency-cards 35,
  ui-tokens 36, i18n 14, rag-eval 11, release-guards 6.
- rag-eval full (English, Qwen2.5-1.5B Q4_0, 12 CPU threads): precision **93.2%**, number/unit violations **0**,
  adversarial unsupported **0**, refusal **100%**, coverage en **72.4%** — PASS
  ([report](phase2a/rag-eval/rag-eval-full.md)); smoke (CI subset, tiny model): PASS.
- Retrieval parity (English, S23 release vs rag-eval): **108 / 108** identical ([parity.md](phase2a/parity/parity.md)).
- `./gradlew assembleRelease` (release key, `-PskepiAllowDraftCards=true`, embedded release catalog sequence 2):
  50.1 MB arm64, signing certificate SHA-256 `7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e`
  (unchanged); **PERMISSION ALLOWLIST: PASS**.
- `./gradlew connectedAndroidTest` on the S23: **32 tests, 0 failures** (TransferServerTest 11, SealingTest 12,
  MorsePlayerTest 3, FileHasherTest 3, ContentRulesTest 3) ([`phase2a/instrumentation/`](phase2a/instrumentation/)).
- Maestro on the S23 (release, airplane mode, `run-e2e.ps1 -SimulateGnss`): tools, onboarding, ask-en, ask-t1,
  medical, cards, blackout, places — **8/8** (full run: 6/8; `tools` failed on the simulated GNSS fix — the known
  test-provider flakiness of Phase 1d — and `blackout` because the new measured cost labels pushed the compass
  below the fold; the flow now scrolls; both passed on the rerun). Blocked WebView requests **0**, ContentStore
  requests **0**, bytes of the app UID on real interfaces **0**, SMS hand-off intents **1**
  ([`phase2a/e2e/s23/`](phase2a/e2e/s23/)).
- Maestro P2P between two emulators + places on the host emulator: **10/10, P2P E2E PASS** (§3).
- Unplugged energy run over wireless adb: §6.
- CI (GitHub Actions on push): see the commit status of this report's push.

## Deviations and open items

1. **Hotspot mode untested on hardware**: one physical device; emulators have no soft-AP. LocalOnlyHotspot and
   WifiNetworkSpecifier code paths are implemented and type-checked; a two-phone test is pending (owner).
2. **QR scanning** on the emulators is replaced by the pairing code (debug-only file hand-off in the E2E); the
   CameraX scanner needs a real camera and a second phone (owner test with the hotspot test).
3. **Mirror upload**: the `map-gr` and `places-gr` files must be uploaded as GitHub release assets
   (`packs-2026-10`) before downloads of those packs can work (P2P and provisioning work without it).
4. **GNSS energy** measured on timeouts indoors (worst case).
5. Emergency cards remain drafts; Maestro is not in CI; a fresh held-out adversarial set is still needed (unchanged
   from Phase 1).
6. Qwen3-1.7B not evaluated.
