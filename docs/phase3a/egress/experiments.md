# WebView2 flag experiments (same release binary, arguments overridden, 40 s idle)

Base: `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,<flags> --disable-background-networking --disable-component-update --disable-domain-reliability --no-pings`

| Run | Added flags | Result |
| --- | --- | --- |
| A | `msEdgeOSAccountInfoSubstrate` |  msedgewebview2.exe (browser) → 40.104.162.242:443  |
| B | `msLoadOneAuthInBackground` |  msedgewebview2.exe (browser) → 40.99.44.66:443  |
| C | `msEdgeOSAccountInfoSubstrate,msLoadOneAuthInBackground,msPrimaryOSAccountInfoCache,msEdgeOSAccountInfoManagerCache,msOneAuthWAM` | no connection |
| D | `msOneAuthWAM` | no connection |
| E | `msPrimaryOSAccountInfoCache,msEdgeOSAccountInfoManagerCache` |  msedgewebview2.exe (browser) → 52.98.200.242:443  |

Host naming (live run, Windows DNS cache): `substrate.office.com` → `outlook.cloud.microsoft` → `shed.outlook.acdc.tm.svc.cloud.microsoft` → 40.104.162.242 / 40.104.205.82 / 52.97.152.114 / 40.101.69.210; browser process modules: `oneauth.dll`, `MicrosoftAccountWAMExtension.dll`, `WINHTTP.dll`.
