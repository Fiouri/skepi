package org.skepi.zim

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.kiwix.libzim.EntryNotFoundException
import org.kiwix.libzim.Item

internal const val MAX_ITEM_BYTES = 16L * 1024 * 1024

internal data class ResolvedItem(val path: String, val title: String, val mimeType: String, val data: ByteArray)

internal data class Section(val heading: String, val level: Int, val text: String)

internal object ZimContent {
  /** Reads an entry (following redirects) with a hard size cap. */
  fun readItem(open: OpenArchive, path: String): ResolvedItem {
    // libkiwix throws a plain java.lang.Exception ("Cannot find entry") as well as
    // EntryNotFoundException, depending on the lookup path.
    val entry = try {
      open.archive.getEntryByPath(path)
    } catch (e: EntryNotFoundException) {
      throw ZimException("ERR_ZIM_ENTRY_NOT_FOUND", "No entry '$path' in ${open.id}")
    } catch (e: Exception) {
      throw ZimException("ERR_ZIM_ENTRY_NOT_FOUND", "No entry '$path' in ${open.id}: ${e.message}")
    }
    val item: Item = entry.getItem(true)
    val size = item.size
    if (size > MAX_ITEM_BYTES) {
      throw ZimException("ERR_ZIM_TOO_LARGE", "Entry '$path' is $size bytes (max $MAX_ITEM_BYTES)")
    }
    val blob = item.data
    try {
      return ResolvedItem(item.path, item.title, item.mimetype, blob.data)
    } finally {
      blob.dispose()
    }
  }

  private val DROP_SELECTORS = listOf(
    "script", "style", "noscript", "link", "meta", "iframe", "object", "embed", "svg", "math",
    "figure", "img", "audio", "video", "table", "sup.reference", "sup.noprint",
    ".infobox", ".navbox", ".vertical-navbox", ".navbox-styles", ".sidebar", ".metadata", ".ambox",
    ".hatnote", ".dablink", ".rellink", ".noprint", ".mw-editsection", ".mw-empty-elt",
    ".reflist", ".references", "ol.references", ".mw-references-wrap", ".refbegin", ".mw-cite-backlink",
    ".gallery", ".toc", "#toc", ".thumb", ".sistersitebox", ".portal", ".portalbox", ".catlinks",
    ".mwe-math-element", ".coordinates", "#coordinates", "footer", ".mw-footer",
  ).joinToString(",")

  /** Headings whose section is dropped entirely (Greek + English Wikipedia). */
  private val DROP_HEADINGS = Regex(
    "^(δείτε επίσης|δειτε επισης|παραπομπές|παραπομπες|σημειώσεις|σημειωσεις|εξωτερικοί σύνδεσμοι|" +
      "εξωτερικοι συνδεσμοι|βιβλιογραφία|βιβλιογραφια|πηγές|πηγες|περαιτέρω ανάγνωση|" +
      "see also|references|notes|external links|further reading|bibliography|sources|citations)$",
    RegexOption.IGNORE_CASE,
  )

  private val BLOCK_TAGS = setOf("p", "li", "dd", "dt", "blockquote", "pre")
  private val HEADING_TAGS = setOf("h1", "h2", "h3", "h4", "h5", "h6")
  private val WHITESPACE = Regex("\\s+")
  private const val NEWLINE = "\n"

  fun extractTitle(doc: Document, fallback: String): String =
    doc.selectFirst("h1")?.text()?.takeIf { it.isNotBlank() }
      ?: doc.title().takeIf { it.isNotBlank() }
      ?: fallback

  /**
   * HTML -> `{heading, level, text}[]` keeping section structure, without infobox, navigation,
   * references and "See also".
   */
  fun extractSections(html: String, title: String): List<Section> {
    val doc = Jsoup.parse(html)
    doc.select(DROP_SELECTORS).remove()
    val body = doc.body()

    val sections = mutableListOf<Section>()
    var heading = ""
    var level = 1
    var dropping = false
    var dropLevel = 0
    val buffer = StringBuilder()

    // One line per block element: paragraph breaks bound the structural injection filter
    // (@skepi/core sanitizeSourceText); chunking normalises whitespace afterwards.
    fun flush() {
      val text = buffer.toString().split(NEWLINE)
        .map { it.replace(WHITESPACE, " ").trim() }
        .filter { it.isNotEmpty() }
        .joinToString(NEWLINE)
      if (text.isNotEmpty() && !dropping) sections.add(Section(heading, level, text))
      buffer.setLength(0)
    }

    for (el in body.select((HEADING_TAGS + BLOCK_TAGS).joinToString(","))) {
      val tag = el.normalName()
      if (tag in HEADING_TAGS) {
        flush()
        val headingLevel = tag.substring(1).toInt()
        val headingText = el.text().replace(WHITESPACE, " ").trim()
        if (headingLevel == 1 && headingText == title) continue
        if (dropping && headingLevel > dropLevel) continue
        dropping = DROP_HEADINGS.matches(headingText)
        dropLevel = headingLevel
        heading = headingText
        level = headingLevel
        continue
      }
      if (dropping || hasBlockAncestor(el)) continue
      val text = el.text()
      if (text.isNotBlank()) buffer.append(text).append('\n')
    }
    flush()
    return sections
  }

  private fun hasBlockAncestor(el: Element): Boolean {
    var parent = el.parent()
    while (parent != null) {
      if (parent.normalName() in BLOCK_TAGS) return true
      parent = parent.parent()
    }
    return false
  }
}
