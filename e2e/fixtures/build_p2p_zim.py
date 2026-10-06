"""Builds e2e/fixtures/p2p-propagation.zim: a tiny CC0 ZIM that only the newer test catalogs
(e2e/mirror/catalogs/good and later) know. The P2P E2E shows that a receiver can verify it only after
the host's newer signed catalog propagated. Reuses the eval-ZIM builder (python-libzim, pinned in
tools/rag-eval/requirements.txt). Run: python e2e/fixtures/build_p2p_zim.py
"""

import html
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "rag-eval" / "scripts"))

from build_eval_zims import Page, page, write_zim  # noqa: E402

ARTICLES = [
    ("Meeting_point", "Meeting point", "A family meeting point is a place everyone knows and can reach on foot. Choose one near home and one outside the neighbourhood."),
    ("Water_storage", "Water storage", "Store drinking water in clean, closed containers away from sunlight. Replace stored water every six months."),
]

if __name__ == "__main__":
    pages = [Page(path, title, page(title, f"<p>{html.escape(text)}</p>", "en")) for path, title, text in ARTICLES]
    out = ROOT / "e2e" / "fixtures" / "p2p-propagation.zim"
    write_zim(out, "eng", "SKEPI test: P2P propagation", "Two short CC0 articles for the P2P catalog-propagation test", pages)
    print(out, out.stat().st_size)
