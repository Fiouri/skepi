**SKEPI Developer Preview `v0.1.0-preview` — for developers and testers. Not for emergency use.**

SKEPI is an offline knowledge and emergency app: Wikipedia search and sealed article reading, answers
built from source excerpts with an optional on-device AI summary, maps and places, emergency numbers and
tools, and pack sharing between devices — no accounts, analytics or telemetry.

## Downloads

| File | Platform |
| --- | --- |
| `skepi-0.1.0-preview-arm64.apk` | Android 7.0+ (arm64), signed with the SKEPI release key |
| `SKEPI_0.1.0-preview_x64_en-US.msi` | Windows 10/11 x64, per-machine install |
| `SKEPI_0.1.0-preview_x64-setup.exe` | Windows 10/11 x64, per-user install (no administrator rights) |
| `SHA256SUMS.txt` | SHA-256 of every file above |

## Verify before installing

```sh
sha256sum -c SHA256SUMS.txt                      # Linux / macOS / Git Bash
Get-FileHash .\SKEPI_0.1.0-preview_x64-setup.exe  # Windows PowerShell; compare with SHA256SUMS.txt
apksigner verify --print-certs skepi-0.1.0-preview-arm64.apk
```

Android release signing certificate SHA-256:
`7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e` (also shown in the app's About
screen). The Windows installers are **not code-signed**: SmartScreen shows "Windows protected your PC";
choose "More info" → "Run anyway" only after the SHA-256 check. At the first Station start, allow
**private networks** only.

## What is in this preview

- Android and Windows apps with the same core: offline search, sealed article viewer, Ask with source
  excerpts ("Source excerpts — not verified advice") and an on-device AI summary (Qwen2.5-1.5B) whose
  every sentence must be supported by a cited excerpt.
- **No AI summary for emergencies**: emergency questions show the country's emergency number first, the
  emergency card, and source excerpts only. Medical questions get the AI summary only on tap, labelled
  "Unverified AI summary".
- Emergency cards ship **without their steps** ("Under professional review") until certified first-aid
  professionals review them; the emergency numbers are always shown.
- Greece map and places packs with emergency points; SOS torch, compass, GPS position, blackout mode.
- Phone-to-phone sharing and desktop **Station mode**: every chunk is verified against the signed
  catalog (release catalog sequence 3).
- About screen: licences, generated third-party notices, signing fingerprint, privacy statement.
- "Report a problem with this answer": prepares a text to copy or save; nothing is sent.

## Known limitations

- Tested on a Samsung Galaxy S23 (Android 16) and Windows 11 x64 only. English only. Greece map only.
- Source excerpts are shown verbatim: a wrong or misleading sentence in a pack is shown as written.
  Source integrity relies on the signed catalog of official packs. The pre-release adversarial test
  (invented articles) still showed injected text in excerpts for 6 of 16 items, including a fake phone
  number — in an emergency, call the number SKEPI shows first. Generic fixes are planned before v1.
- AI summaries can be wrong: check the cited excerpt.
- Windows installers are unsigned; no automatic updates.

Details: `README.md`, `CHANGELOG.md`, `docs/preview-report.md`, `SECURITY.md` (private vulnerability
reporting is enabled for this repository).

## Attributions

Wikipedia content: CC BY-SA 4.0 (via Kiwix ZIM files). Map and places data: © OpenStreetMap
contributors, ODbL 1.0. Model: Qwen2.5-1.5B-Instruct, Apache-2.0. Emergency numbers and card sources:
public-domain and official sources listed in the app. SKEPI code: GPL-3.0-or-later. Full third-party
notices are in each app's About screen.
