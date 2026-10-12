#!/usr/bin/env python3
"""Reproducible-build checks for Android APKs (stdlib only).

  apk-compare.py same A.apk B.apk         exit 0 when both files are byte-identical; otherwise list every
                                          ZIP entry that differs (name, size, SHA-256) and exit 1
  apk-compare.py unsigned APK             exit 0 when the APK carries no signature (no v1 files in
                                          META-INF, no APK Signing Block), else exit 1
  apk-compare.py contents SIGNED UNSIGNED exit 0 when SIGNED holds exactly the entries of UNSIGNED (same
                                          names, order and bytes) plus only signature files; used after
                                          signing the CI artifact locally (docs/release-process.md)
"""
import hashlib
import struct
import sys
import zipfile

SIG_BLOCK_MAGIC = b'APK Sig Block 42'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def is_v1_signature(name):
    if not name.startswith('META-INF/') or '/' in name[len('META-INF/'):]:
        return False
    return name == 'META-INF/MANIFEST.MF' or name.rsplit('.', 1)[-1].upper() in ('SF', 'RSA', 'DSA', 'EC')


def entries(path):
    with zipfile.ZipFile(path) as z:
        return [(i.filename, i.file_size, hashlib.sha256(z.read(i)).hexdigest()) for i in z.infolist()]


def has_signing_block(path):
    # The APK Signing Block (v2+) sits right before the central directory and ends with its magic. The
    # End of Central Directory record (last 22 bytes + an optional comment) holds the directory offset.
    with open(path, 'rb') as f:
        data = f.read()
    eocd = data.rfind(b'PK\x05\x06', max(0, len(data) - 22 - 0xFFFF))
    if eocd < 0:
        raise ValueError(f'{path}: no End of Central Directory record')
    cd_offset = struct.unpack_from('<I', data, eocd + 16)[0]
    return data[cd_offset - len(SIG_BLOCK_MAGIC):cd_offset] == SIG_BLOCK_MAGIC


def cmd_same(a, b):
    ha, hb = sha256_file(a), sha256_file(b)
    print(f'{ha}  {a}')
    print(f'{hb}  {b}')
    if ha == hb:
        print('identical')
        return 0
    ea, eb = entries(a), entries(b)
    print(f'DIFFERENT: {len(ea)} vs {len(eb)} entries')
    if [e[0] for e in ea] != [e[0] for e in eb]:
        print('  entry names or order differ')
        print('  only in A:', sorted({e[0] for e in ea} - {e[0] for e in eb})[:20])
        print('  only in B:', sorted({e[0] for e in eb} - {e[0] for e in ea})[:20])
    db = {e[0]: e for e in eb}
    diff = [(e, db[e[0]]) for e in ea if e[0] in db and e != db[e[0]]]
    print(f'  differing entries: {len(diff)}')
    for ea_, eb_ in diff:
        print(f'    {ea_[0]}  {ea_[1]} -> {eb_[1]} bytes')
    if not diff:
        print('  entries identical: the ZIP container differs (order, timestamps, alignment or extra fields)')
    return 1


def cmd_unsigned(path):
    v1 = [e[0] for e in entries(path) if is_v1_signature(e[0])]
    block = has_signing_block(path)
    print(f'{path}: v1 signature files {v1 or "none"}, APK Signing Block {"present" if block else "none"}')
    return 1 if v1 or block else 0


def cmd_contents(signed, unsigned):
    es = [e for e in entries(signed) if not is_v1_signature(e[0])]
    eu = entries(unsigned)
    if es == eu:
        print(f'{signed}: same {len(eu)} entries as {unsigned}, plus signature files only')
        return 0
    print(f'{signed}: entries differ from {unsigned} ({len(es)} vs {len(eu)} non-signature entries)')
    du = {e[0]: e for e in eu}
    for e in es:
        if du.get(e[0]) != e:
            print(f'  {e[0]}')
    for name in sorted(set(du) - {e[0] for e in es}):
        print(f'  missing: {name}')
    return 1


def main(argv):
    if len(argv) == 4 and argv[1] == 'same':
        return cmd_same(argv[2], argv[3])
    if len(argv) == 3 and argv[1] == 'unsigned':
        return cmd_unsigned(argv[2])
    if len(argv) == 4 and argv[1] == 'contents':
        return cmd_contents(argv[2], argv[3])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
