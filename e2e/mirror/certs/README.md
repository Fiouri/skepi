# Local test mirror certificates (debug builds only)

- `ca.crt`: self-signed "SKEPI Test Mirror CA". Debug builds trust it **only for `127.0.0.1`**
  (`network_security_config.xml` in the debug source set, written by `apps/mobile/plugins/withSkepiAndroid.js`).
  Release builds never contain it. Its private key was deleted right after signing `server.crt`, so no
  other certificate can be issued under it.
- `server.crt` / `server.key`: the mirror's certificate for `IP:127.0.0.1` (valid 10 years). The key is
  committed on purpose: it only authenticates the local test mirror (`e2e/mirror/server.mjs`), reached on
  the phone through `adb reverse tcp:8443 tcp:8443`.
