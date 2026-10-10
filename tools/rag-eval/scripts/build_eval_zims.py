"""Builds the rag-eval fixture ZIMs in tools/rag-eval/fixtures/.

- eval-synthetic.zim: invented articles with prompt-injection text (fixtures/synthetic-articles.json,
  written by the SKEPI project, CC0-1.0). Used by the adversarial set in full and smoke runs.
- eval-heldout.zim: held-out invented articles with prompt-injection text (fixtures/heldout-articles.json,
  CC0-1.0), written independently of the sanitizer lexicon. Used only by sets/adversarial-heldout.json.
- eval-heldout-2.zim: the second held-out set's invented articles (fixtures/heldout2-articles.json, CC0-1.0),
  written without reading the sanitizer, the structural filter or earlier sets. Used only by
  sets/adversarial-heldout-2.json (Developer Preview).
- eval-heldout-3.zim: the third held-out set's invented articles (fixtures/heldout3-articles.json, CC0-1.0),
  the pre-release gate of v0.1.0-preview. Used only by sets/adversarial-heldout-3.json.
- eval-smoke-en.zim / eval-smoke-el.zim: a fixed list of real Wikipedia articles
  (fixtures/smoke-articles.json) copied from the SHA-256-verified Kiwix packs in scripts/content.lock.json,
  for the CI smoke subset. Licence CC BY-SA 4.0, attribution in fixtures/ATTRIBUTION.md.

Same input, same content (fixed article order, single worker, fixed metadata date); the file bytes
still differ between builds because libzim assigns a random archive UUID. The CI uses the committed
files, so smoke results do not depend on a rebuild.

    python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
    .venv/Scripts/python scripts/build_eval_zims.py --cache %TEMP%/skepi/cache
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import pathlib
import re
import tempfile

from bs4 import BeautifulSoup
from libzim.reader import Archive
from libzim.writer import Creator, Hint, Item, StringProvider

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"
REPO = ROOT.parent.parent
MAX_TOTAL_BYTES = 5 * 1024 * 1024
DATE = "2026-10-05"

STRIP = "script, style, link, meta, noscript, img, picture, source, video, audio, iframe, svg, figure, .mw-editsection"


class Page(Item):
    def __init__(self, path: str, title: str, content: str) -> None:
        super().__init__()
        self._path, self._title, self._content = path, title, content

    def get_path(self) -> str:
        return self._path

    def get_title(self) -> str:
        return self._title

    def get_mimetype(self) -> str:
        return "text/html"

    def get_contentprovider(self) -> StringProvider:
        return StringProvider(self._content)

    def get_hints(self) -> dict:
        return {Hint.FRONT_ARTICLE: True, Hint.COMPRESS: True}


def page(title: str, body: str, lang: str) -> str:
    return (
        f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8"><title>{html.escape(title)}</title></head>'
        f"<body><h1>{html.escape(title)}</h1>{body}</body></html>"
    )


def write_zim(out: pathlib.Path, lang_code: str, title: str, description: str, pages: list[Page]) -> None:
    # libzim writes index scratch files next to its output: build in a temp dir, move only the ZIM.
    with tempfile.TemporaryDirectory(dir=out.parent, prefix=".build-") as scratch:
        tmp = pathlib.Path(scratch) / out.name
        _create(tmp, lang_code, title, description, pages)
        os.replace(tmp, out)


def _create(tmp: pathlib.Path, lang_code: str, title: str, description: str, pages: list[Page]) -> None:
    creator = Creator(str(tmp)).config_indexing(True, lang_code).config_nbworkers(1).config_clustersize(1024 * 1024)
    with creator as c:
        c.set_mainpath(pages[0].get_path())
        for key, value in {
            "Name": tmp.stem,
            "Title": title,
            "Description": description,
            "Language": lang_code,
            "Creator": "SKEPI project",
            "Publisher": "SKEPI project",
            "Date": DATE,
        }.items():
            c.add_metadata(key, value)
        for p in pages:
            c.add_item(p)


def build_invented(spec_name: str, out_name: str, title: str, description: str) -> pathlib.Path:
    spec = json.loads((FIXTURES / spec_name).read_text(encoding="utf-8"))
    pages = []
    for a in spec["articles"]:
        # Paragraph text is inserted escaped: the injection strings are data, exactly as in a real ZIM.
        body = "".join(f"<p>{html.escape(p)}</p>" for p in a["paragraphs"])
        pages.append(Page(a["path"], a["title"], page(a["title"], body, a["lang"])))
    out = FIXTURES / out_name
    write_zim(out, "eng", title, description, pages)
    return out


def build_synthetic() -> pathlib.Path:
    return build_invented(
        "synthetic-articles.json", "eval-synthetic.zim", "SKEPI eval: synthetic adversarial articles", "Invented articles with prompt injection (CC0)"
    )


def build_heldout() -> pathlib.Path:
    return build_invented(
        "heldout-articles.json",
        "eval-heldout.zim",
        "SKEPI eval: held-out adversarial articles",
        "Held-out invented articles with prompt injection, never used for tuning (CC0)",
    )


def build_heldout2() -> pathlib.Path:
    return build_invented(
        "heldout2-articles.json",
        "eval-heldout-2.zim",
        "SKEPI eval: held-out adversarial articles (set 2)",
        "Second held-out set of invented articles with prompt injection, never used for tuning (CC0)",
    )


def build_heldout3() -> pathlib.Path:
    return build_invented(
        "heldout3-articles.json",
        "eval-heldout-3.zim",
        "SKEPI eval: held-out adversarial articles (set 3)",
        "Third held-out set of invented articles with prompt injection, never used for tuning (CC0)",
    )


def clean_article(raw: str) -> str:
    soup = BeautifulSoup(raw, "html.parser")
    for el in soup.select(STRIP):
        el.decompose()
    body = soup.body or soup
    for a in body.find_all("a"):
        a.unwrap()
    return re.sub(r"\s+", " ", body.decode_contents()).strip()


def build_smoke(cache: pathlib.Path, lang: str) -> pathlib.Path:
    lock = json.loads((REPO / "scripts" / "content.lock.json").read_text(encoding="utf-8"))
    spec = json.loads((FIXTURES / "smoke-articles.json").read_text(encoding="utf-8"))[lang]
    pages: list[Page] = []
    seen: set[str] = set()
    for entry in spec:
        pack = lock["zim"][entry["pack"]]
        zim_path = cache / pack["file"]
        digest = hashlib.sha256(zim_path.read_bytes()).hexdigest()
        if digest != pack["sha256"]:
            raise SystemExit(f"SHA-256 mismatch for {zim_path}")
        archive = Archive(str(zim_path))
        for path in entry["paths"]:
            item = archive.get_entry_by_path(path)
            while item.is_redirect:
                item = item.get_redirect_entry()
            it = item.get_item()
            if it.path in seen:
                continue
            seen.add(it.path)
            body = clean_article(bytes(it.content).decode("utf-8"))
            pages.append(Page(it.path, it.title, page(it.title, body, lang)))
    out = FIXTURES / f"eval-smoke-{lang}.zim"
    code = {"en": "eng", "el": "ell"}[lang]
    write_zim(out, code, f"SKEPI eval smoke ({lang})", "Fixed Wikipedia article subset for the rag-eval CI smoke run (CC BY-SA 4.0)", pages)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=os.path.join(os.environ.get("TEMP", tempfile.gettempdir()), "skepi", "cache"))
    parser.add_argument("--only", choices=["synthetic", "heldout", "heldout2", "heldout3", "smoke"], default=None)
    args = parser.parse_args()
    outputs = []
    if args.only in (None, "synthetic"):
        outputs.append(build_synthetic())
    if args.only in (None, "heldout"):
        outputs.append(build_heldout())
    if args.only in (None, "heldout2"):
        outputs.append(build_heldout2())
    if args.only in (None, "heldout3"):
        outputs.append(build_heldout3())
    if args.only in (None, "smoke"):
        cache = pathlib.Path(args.cache)
        outputs += [build_smoke(cache, "en"), build_smoke(cache, "el")]
    total = sum(p.stat().st_size for p in FIXTURES.glob("eval-*.zim"))
    for p in outputs:
        print(f"{p.name}: {p.stat().st_size} bytes, sha256 {hashlib.sha256(p.read_bytes()).hexdigest()}")
    print(f"total fixture ZIMs: {total} bytes (limit {MAX_TOTAL_BYTES})")
    if total > MAX_TOTAL_BYTES:
        raise SystemExit("eval ZIMs exceed 5 MB")


if __name__ == "__main__":
    main()
