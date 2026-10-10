/**
 * SHA-256 of the certificate that signs SKEPI's Android release builds (the same value as
 * crates/desktop-core/src/station/apk.rs RELEASE_SIGNING_SHA256; test/release.test.ts keeps them equal).
 * Shown on the About screens so users can check an APK received from anywhere else.
 */
export const ANDROID_RELEASE_SIGNING_SHA256 = '7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e';
