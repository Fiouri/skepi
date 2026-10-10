import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANDROID_RELEASE_SIGNING_SHA256 } from '@skepi/core';

describe('release signing fingerprint', () => {
  it('matches the desktop Station APK check', () => {
    const rust = readFileSync(fileURLToPath(new URL('../../../crates/desktop-core/src/station/apk.rs', import.meta.url)), 'utf8');
    expect(rust).toContain(`pub const RELEASE_SIGNING_SHA256: &str = "${ANDROID_RELEASE_SIGNING_SHA256}";`);
  });
});
