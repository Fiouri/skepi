"""Builds src/androidTest/assets/sealing-fixture.zim for the viewer sealing instrumentation tests.

All content is written here by the SKEPI project and dedicated to the public domain (CC0-1.0).
Writer: python-libzim (GPL-3.0-or-later, https://github.com/openzim/python-libzim), run once on a
developer machine; nothing from it ships in the app.

    python -m venv .venv && .venv/Scripts/python -m pip install libzim==3.13.0
    .venv/Scripts/python make_fixture_zim.py
"""

from __future__ import annotations

import base64
import pathlib

from libzim.writer import Creator, Hint, Item, StringProvider

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "sealing-fixture.zim"

# 1x1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)

INDEX = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Sealing fixture</title>
<link rel="stylesheet" href="style.css">
<script>document.title = 'pwned';</script>
</head><body>
<h1>Sealing fixture</h1>
<p>Local image: <img id="local" src="img/dot.png" alt="dot"></p>
<p>Remote resources that must never load:
<img src="http://example.invalid/tracker.png" alt="http">
<img src="https://example.invalid/tracker.png" alt="https">
<img src="file:///system/etc/hosts" alt="file">
<img src="content://settings/system" alt="content">
<iframe src="https://example.invalid/frame"></iframe>
</p>
<p>Links: <a id="http" href="https://example.invalid/">external</a>
<a id="intent" href="intent://scan/#Intent;scheme=zxing;end">intent</a>
<a href="en/Water_purification">Water purification</a>
<a href="el/Καθαρισμός_νερού">Καθαρισμός νερού</a></p>
<button onclick="document.title='clicked'">button</button>
</body></html>
"""

STYLE = "body { font-family: sans-serif; } img#local { width: 4px; height: 4px; }\n"

EN_ARTICLE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Water purification</title></head><body>
<h1>Water purification</h1>
<p>Boiling water for one minute kills most pathogens. Let it cool before drinking.</p>
<h2>Filtering</h2>
<p>Filter cloudy water through clean cloth before boiling or disinfecting it.</p>
</body></html>
"""

EL_ARTICLE = """<!DOCTYPE html>
<html lang="el"><head><meta charset="utf-8"><title>Καθαρισμός νερού</title></head><body>
<h1>Καθαρισμός νερού</h1>
<p>Το βράσιμο του νερού για ένα λεπτό σκοτώνει τους περισσότερους μικροοργανισμούς.</p>
</body></html>
"""

NESTED = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Nested page</title></head><body>
<p>Nested page used as the base of path traversal attempts.</p>
</body></html>
"""


class Entry(Item):
    def __init__(self, path: str, title: str, mimetype: str, content: str | bytes, front: bool) -> None:
        super().__init__()
        self._path = path
        self._title = title
        self._mimetype = mimetype
        self._content = content
        self._front = front

    def get_path(self) -> str:
        return self._path

    def get_title(self) -> str:
        return self._title

    def get_mimetype(self) -> str:
        return self._mimetype

    def get_contentprovider(self) -> StringProvider:
        return StringProvider(self._content)

    def get_hints(self) -> dict[Hint, bool]:
        return {Hint.FRONT_ARTICLE: self._front, Hint.COMPRESS: True}


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    with Creator(str(OUT)).config_indexing(False, "eng") as creator:
        creator.set_mainpath("index")
        for key, value in {
            "Name": "skepi_sealing_fixture",
            "Title": "SKEPI sealing fixture",
            "Description": "Test fixture for the sealed zim:// viewer",
            "Language": "eng,ell",
            "Creator": "SKEPI",
            "Publisher": "SKEPI",
            "Date": "2026-10-04",
            "License": "CC0-1.0",
        }.items():
            creator.add_metadata(key, value)
        creator.add_item(Entry("index", "Sealing fixture", "text/html", INDEX, True))
        creator.add_item(Entry("style.css", "", "text/css", STYLE, False))
        creator.add_item(Entry("img/dot.png", "", "image/png", PNG, False))
        creator.add_item(Entry("en/Water_purification", "Water purification", "text/html", EN_ARTICLE, True))
        creator.add_item(Entry("el/Καθαρισμός_νερού", "Καθαρισμός νερού", "text/html", EL_ARTICLE, True))
        creator.add_item(Entry("a/b/page", "Nested page", "text/html", NESTED, True))
    print(f"{OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
