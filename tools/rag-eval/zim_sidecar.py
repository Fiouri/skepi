"""ZIM access for tools/rag-eval: a JSON-lines server over stdin/stdout.

The app reads ZIMs through libkiwix/libzim (Kotlin, modules/expo-zim). Node has no libzim binding
with Windows binaries, so the eval talks to python-libzim (same libzim engine, same Xapian index)
through this sidecar. Search and plain-text extraction mirror ZimRegistry/ExpoZimModule.kt and
ZimContent.kt rule for rule, so the eval sees the passages the phone sees.

Request:  {"id": 1, "op": "open" | "search" | "suggest" | "plainText" | "html" | "exists", ...}
Response: {"id": 1, "ok": true, "result": ...} or {"id": 1, "ok": false, "error": "..."}

Dependencies (tools/rag-eval/requirements.txt): libzim (GPL-3.0-or-later), beautifulsoup4 (MIT).
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

from bs4 import BeautifulSoup, Tag
from libzim.reader import Archive
from libzim.search import Query, Searcher
from libzim.suggestion import SuggestionSearcher

MAX_ITEM_BYTES = 16 * 1024 * 1024
MAX_LIMIT = 100

# ZimContent.kt DROP_SELECTORS, verbatim.
DROP_SELECTORS = ",".join(
    [
        "script", "style", "noscript", "link", "meta", "iframe", "object", "embed", "svg", "math",
        "figure", "img", "audio", "video", "table", "sup.reference", "sup.noprint",
        ".infobox", ".navbox", ".vertical-navbox", ".navbox-styles", ".sidebar", ".metadata", ".ambox",
        ".hatnote", ".dablink", ".rellink", ".noprint", ".mw-editsection", ".mw-empty-elt",
        ".reflist", ".references", "ol.references", ".mw-references-wrap", ".refbegin", ".mw-cite-backlink",
        ".gallery", ".toc", "#toc", ".thumb", ".sistersitebox", ".portal", ".portalbox", ".catlinks",
        ".mwe-math-element", ".coordinates", "#coordinates", "footer", ".mw-footer",
    ]
)

DROP_HEADINGS = re.compile(
    "^(δείτε επίσης|δειτε επισης|παραπομπές|παραπομπες|σημειώσεις|σημειωσεις|εξωτερικοί σύνδεσμοι|"
    "εξωτερικοι συνδεσμοι|βιβλιογραφία|βιβλιογραφια|πηγές|πηγες|περαιτέρω ανάγνωση|"
    "see also|references|notes|external links|further reading|bibliography|sources|citations)$",
    re.IGNORECASE,
)
BLOCK_TAGS = {"p", "li", "dd", "dt", "blockquote", "pre"}
# jsoup's block-level tags (Element.text() separates them, and <br>, with a space).
JSOUP_BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "body", "canvas", "caption", "center", "col", "colgroup",
    "dd", "details", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "li", "listing", "main", "menu",
    "nav", "ol", "p", "plaintext", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th",
    "thead", "tr", "ul",
}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
WHITESPACE = re.compile(r"\s+")


def norm(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip()


class Store:
    def __init__(self) -> None:
        self.archives: dict[str, Archive] = {}
        self.searchers: dict[str, Searcher] = {}
        self.suggesters: dict[str, SuggestionSearcher] = {}

    def open(self, path: str) -> dict[str, Any]:
        file = pathlib.Path(path).resolve()
        if file.suffix.lower() != ".zim" or not file.is_file():
            raise ValueError(f"not a ZIM file: {path}")
        archive = Archive(str(file))
        # The archive UUID, like ZimRegistry.open on Android: ids (and chunk ids) match the phone's.
        archive_id = str(archive.uuid)
        if archive_id not in self.archives:
            self.archives[archive_id] = archive
        a = self.archives[archive_id]

        def meta(name: str) -> str:
            try:
                return a.get_metadata(name).decode("utf-8")
            except Exception:
                return ""

        return {
            "archiveId": archive_id,
            "name": meta("Name"),
            "title": meta("Title"),
            "language": meta("Language"),
            "articleCount": a.article_count,
            "hasFulltextIndex": a.has_fulltext_index,
            "sizeBytes": file.stat().st_size,
        }

    def get(self, archive_id: str) -> Archive:
        a = self.archives.get(archive_id)
        if a is None:
            raise ValueError(f"archive not open: {archive_id}")
        return a

    def search(self, query: str, limit: int, archive_ids: list[str] | None) -> list[dict[str, Any]]:
        limit = max(1, min(MAX_LIMIT, int(limit)))
        targets = archive_ids if archive_ids is not None else list(self.archives)
        hits: list[dict[str, Any]] = []
        for archive_id in targets:
            a = self.get(archive_id)
            if not a.has_fulltext_index:
                continue
            searcher = self.searchers.get(archive_id)
            if searcher is None:
                searcher = self.searchers[archive_id] = Searcher(a)
            results = searcher.search(Query().set_query(query)).getResults(0, limit)
            for rank, path in enumerate(results):
                try:
                    title = a.get_entry_by_path(path).title
                except KeyError:
                    title = path
                hits.append(
                    {"archiveId": archive_id, "path": path, "title": title, "snippet": None, "score": None, "rank": rank}
                )
        return hits

    def suggest(self, query: str, limit: int, archive_ids: list[str] | None) -> list[dict[str, Any]]:
        """Title suggestions (ExpoZimModule.kt "suggest"): per archive, concatenated."""
        limit = max(1, min(MAX_LIMIT, int(limit)))
        targets = archive_ids if archive_ids is not None else list(self.archives)
        hits: list[dict[str, Any]] = []
        for archive_id in targets:
            a = self.get(archive_id)
            suggester = self.suggesters.get(archive_id)
            if suggester is None:
                suggester = self.suggesters[archive_id] = SuggestionSearcher(a)
            for rank, path in enumerate(suggester.suggest(query).getResults(0, limit)):
                try:
                    title = a.get_entry_by_path(path).title
                except KeyError:
                    title = path
                hits.append(
                    {"archiveId": archive_id, "path": path, "title": title, "snippet": None, "score": None, "rank": rank}
                )
        return hits

    def read(self, archive_id: str, path: str) -> tuple[str, str, str, bytes]:
        a = self.get(archive_id)
        entry = a.get_entry_by_path(path)
        hops = 0
        while entry.is_redirect:
            entry = entry.get_redirect_entry()
            hops += 1
            if hops > 16:
                raise ValueError(f"redirect loop at {path}")
        item = entry.get_item()
        if item.size > MAX_ITEM_BYTES:
            raise ValueError(f"entry {path} is {item.size} bytes (max {MAX_ITEM_BYTES})")
        return item.path, item.title, item.mimetype, bytes(item.content)

    def exists(self, archive_id: str, path: str) -> dict[str, Any] | None:
        try:
            resolved, title, _, _ = self.read(archive_id, path)
        except KeyError:
            return None
        return {"path": resolved, "title": title}

    def html(self, archive_id: str, path: str) -> dict[str, Any]:
        resolved, title, mime, data = self.read(archive_id, path)
        return {"archiveId": archive_id, "path": resolved, "title": title, "mimeType": mime, "html": data.decode("utf-8")}

    def plain_text(self, archive_id: str, path: str) -> dict[str, Any]:
        resolved, title, mime, data = self.read(archive_id, path)
        if not mime.startswith("text/html"):
            raise ValueError(f"entry {path} is {mime}")
        title = title if title.strip() else path
        return {"archiveId": archive_id, "path": resolved, "title": title, "sections": extract_sections(data.decode("utf-8"), title)}


def has_block_ancestor(el: Tag) -> bool:
    parent = el.parent
    while parent is not None:
        if isinstance(parent, Tag) and parent.name in BLOCK_TAGS:
            return True
        parent = parent.parent
    return False


def extract_sections(html: str, title: str) -> list[dict[str, Any]]:
    """ZimContent.extractSections: HTML -> {heading, level, text}[] without boilerplate."""
    soup = BeautifulSoup(html, "html.parser")
    for el in soup.select(DROP_SELECTORS):
        el.decompose()
    body = soup.body or soup
    # jsoup's text() puts a space at <br> and around block elements ("O<br>3" -> "O 3"); get_text()
    # joins them ("O3"). Parity found this in chemical formulas (Ozone, Biogas).
    for br in body.find_all("br"):
        br.replace_with(" ")
    for el in body.find_all(list(JSOUP_BLOCK_TAGS)):
        el.insert_before(" ")
        el.insert_after(" ")

    sections: list[dict[str, Any]] = []
    state = {"heading": "", "level": 1, "dropping": False, "drop_level": 0}
    buffer: list[str] = []

    def flush() -> None:
        # One line per block element, like ZimContent.kt (paragraph breaks for the injection filter).
        text = "\n".join(line for line in (norm(b) for b in buffer) if line)
        if text and not state["dropping"]:
            sections.append({"heading": state["heading"], "level": state["level"], "text": text})
        buffer.clear()

    for el in body.find_all(list(HEADING_TAGS | BLOCK_TAGS)):
        if el.name in HEADING_TAGS:
            flush()
            level = int(el.name[1])
            heading = norm(el.get_text())
            if level == 1 and heading == title:
                continue
            if state["dropping"] and level > state["drop_level"]:
                continue
            state.update(dropping=bool(DROP_HEADINGS.match(heading)), drop_level=level, heading=heading, level=level)
            continue
        if state["dropping"] or has_block_ancestor(el):
            continue
        text = norm(el.get_text())
        if text:
            buffer.append(text)
    flush()
    return sections


def handle(store: Store, req: dict[str, Any]) -> Any:
    op = req.get("op")
    if op == "open":
        return store.open(req["path"])
    if op == "search":
        return store.search(req["query"], req.get("limit", 8), req.get("archiveIds"))
    if op == "suggest":
        return store.suggest(req["query"], req.get("limit", 10), req.get("archiveIds"))
    if op == "plainText":
        return store.plain_text(req["archiveId"], req["path"])
    if op == "html":
        return store.html(req["archiveId"], req["path"])
    if op == "exists":
        return store.exists(req["archiveId"], req["path"])
    raise ValueError(f"unknown op: {op}")


def main() -> None:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    store = Store()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            out = {"id": req_id, "ok": True, "result": handle(store, req)}
        except KeyError as e:
            out = {"id": req_id, "ok": False, "error": f"not found: {e}"}
        except Exception as e:  # reported to the caller, never swallowed
            out = {"id": req_id, "ok": False, "error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
