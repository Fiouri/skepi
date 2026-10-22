#!/usr/bin/env python3
"""F-Droid's reproducible-build verification of a signed release APK, run before publishing.

  fdroid-signature-copy.py SIGNED UNSIGNED APKSIGNER [WORK_DIR]

Does what fdroidserver's common.verify_apks() does when a recipe has Binaries: (fdroidserver at the
commit fdroiddata pins, which vendors apksigcopier 1.1.1):
  1. apksigner verify SIGNED;
  2. apksigcopier.do_copy(SIGNED, UNSIGNED, OUT, exclude=exclude_meta): copy the signature from the
     signed APK onto the unsigned CI build;
  3. apksigner verify OUT;
and then, stricter than F-Droid: OUT must be byte-identical to SIGNED (the published APK is exactly
F-Droid's build plus our signature). APKSIGNER is the apksigner executable (apksigner.bat on
Windows). Needs apksigcopier==1.1.1 (scripts/release/apksigcopier-requirements.txt). Exit 0 only when
every step passes. docs/release-process.md.
"""
import hashlib
import os
import subprocess
import sys
import tempfile

import apksigcopier


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def verify(apksigner, apk):
    r = subprocess.run([apksigner, 'verify', '--verbose', apk], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout + r.stderr)
    return r.returncode == 0


def main(argv):
    if len(argv) not in (4, 5):
        print(__doc__, file=sys.stderr)
        return 2
    signed, unsigned, apksigner = argv[1], argv[2], argv[3]
    work = argv[4] if len(argv) == 5 else tempfile.mkdtemp(prefix='sigcp-')
    if apksigcopier.__version__ != '1.1.1':
        print(f'apksigcopier {apksigcopier.__version__}, expected 1.1.1 (fdroidserver vendors 1.1.1)')
        return 1
    if not verify(apksigner, signed):
        print(f'FAIL: apksigner verify {signed}')
        return 1
    print(f'1. apksigner verify {signed}: OK')
    out = os.path.join(work, 'sigcp_' + os.path.basename(unsigned))
    if os.path.exists(out):
        os.remove(out)
    try:
        apksigcopier.do_copy(signed, unsigned, out, v1_only=None, exclude=apksigcopier.exclude_meta)
    except apksigcopier.APKSigCopierError as e:
        print(f'FAIL: signature copying failed: {e}')
        return 1
    print(f'2. signature copied onto {unsigned}: {out}')
    if not verify(apksigner, out):
        print('FAIL: verification of the APK with the copied signature failed (what F-Droid reports as '
              '"CHUNKED_SHA512 digest mismatch")')
        return 1
    print(f'3. apksigner verify {out}: OK')
    hs, ho = sha256(signed), sha256(out)
    if hs != ho:
        print(f'FAIL: the APK with the copied signature ({ho}) is not byte-identical to the signed APK ({hs})')
        return 1
    print(f'4. byte-identical to the signed APK: {hs}')
    print('F-DROID SIGNATURE COPY: PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
