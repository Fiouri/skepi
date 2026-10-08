//! Per-session TLS identity (as `SessionCert.kt`): a fresh EC P-256 key pair kept in memory only and
//! a self-signed certificate for it. The phone pins the certificate's SHA-256 from the QR code, so no
//! CA, name or date check is involved; every session has a new key and a new pin.

use crate::catalog::sha256_hex;
use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair, PKCS_ECDSA_P256_SHA256};

pub struct SessionCert {
    pub cert_der: Vec<u8>,
    pub key_der: Vec<u8>,
    /// SHA-256 of the certificate DER, lowercase hex (the QR's `certSha256`).
    pub sha256: String,
}

impl SessionCert {
    pub fn create() -> Result<Self, String> {
        let key = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).map_err(|e| e.to_string())?;
        let mut params = CertificateParams::new(Vec::<String>::new()).map_err(|e| e.to_string())?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, "SKEPI Station session");
        params.distinguished_name = dn;
        // A short validity window around now (the receiver pins the key; dates are informative).
        let now = time::OffsetDateTime::now_utc();
        params.not_before = now - std::time::Duration::from_secs(86_400);
        params.not_after = now + std::time::Duration::from_secs(2 * 86_400);
        let cert = params.self_signed(&key).map_err(|e| e.to_string())?;
        let cert_der = cert.der().to_vec();
        Ok(Self { sha256: sha256_hex(&cert_der), cert_der, key_der: key.serialize_der() })
    }
}
