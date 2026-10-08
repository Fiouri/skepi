//! The Rust catalog port against the same expectations as tools/catalog-builder/test/fixtures-catalog.test.ts
//! (catalog/verification-expectations.json): both implementations must give the same outcome.

use desktop_core::catalog::{SequenceState, pinned_keys, verify_catalog};
use serde_json::Value;
use std::path::PathBuf;

fn repo(p: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(p)
}

#[test]
fn committed_catalogs_match_the_typescript_expectations() {
    let doc: Value =
        serde_json::from_str(&std::fs::read_to_string(repo("catalog/verification-expectations.json")).expect("read")).expect("json");
    let cases = doc["cases"].as_array().expect("cases");
    assert!(cases.len() >= 9);
    for c in cases {
        let dir = c["dir"].as_str().expect("dir");
        let bytes = std::fs::read(repo(&format!("{dir}/catalog.json"))).expect("catalog");
        let sig = std::fs::read_to_string(repo(&format!("{dir}/catalog.json.sig"))).expect("sig");
        let (_, trusted) =
            pinned_keys(&std::fs::read_to_string(repo(c["keys"].as_str().expect("keys"))).expect("keys file")).expect("pinned");
        let state = SequenceState { sequence: c["state"]["sequence"].as_u64(), sha256: c["state"]["sha256"].as_str().map(str::to_owned) };
        let got = verify_catalog(&bytes, &sig, &trusted, &state);
        let label = format!("{dir} with {}", c["keys"]);
        if c["expect"]["ok"].as_bool() == Some(true) {
            let v = got.unwrap_or_else(|e| panic!("{label}: {e}"));
            assert_eq!(v.sequence, c["expect"]["sequence"].as_u64().expect("sequence"), "{label}");
            assert_eq!(v.sha256, c["expect"]["sha256"].as_str().expect("sha"), "{label}");
            assert!(!v.value.packs.is_empty(), "{label}");
        } else {
            let e = got.err().unwrap_or_else(|| panic!("{label}: accepted"));
            assert_eq!(e.reason.as_str(), c["expect"]["reason"].as_str().expect("reason"), "{label}");
        }
    }
}
