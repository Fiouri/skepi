package org.skepi.zim

import android.content.Context
import android.util.LruCache
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.kiwix.libzim.Query
import java.io.File

private const val MAX_LIMIT = 100

class ExpoZimModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  /** Plain-text extraction is the expensive part of RAG; keep recent articles in memory. */
  private val textCache = LruCache<String, Map<String, Any>>(32)

  private fun ready(): Context = context.also { ZimRegistry.ensureInitialised(it) }

  private fun targets(archiveIds: List<String>?): List<OpenArchive> =
    if (archiveIds.isNullOrEmpty()) ZimRegistry.all() else archiveIds.map { ZimRegistry.get(it) }

  private fun clampLimit(limit: Int): Int = limit.coerceIn(1, MAX_LIMIT)

  private fun elapsedMs(startNs: Long): Double = (System.nanoTime() - startNs) / 1_000_000.0

  override fun definition() = ModuleDefinition {
    Name("ExpoZim")

    AsyncFunction("getRuntimeInfo") {
      val ctx = ready()
      mapOf(
        "contentDir" to (ZimRegistry.contentRoot(ctx)?.absolutePath ?: ""),
        "icuDataDir" to ZimRegistry.icuDataDir,
        "nativeInitMs" to ZimRegistry.nativeInitMs,
      )
    }

    AsyncFunction("listContent") {
      val root = ZimRegistry.contentRoot(context) ?: return@AsyncFunction emptyList<Map<String, Any>>()
      listOf("zim", "models", "maps", "icu").flatMap { kind ->
        (File(root, kind).listFiles() ?: emptyArray()).filter { it.isFile }.sortedBy { it.name }.map {
          mapOf("kind" to kind, "name" to it.name, "path" to it.absolutePath, "sizeBytes" to it.length())
        }
      }
    }

    AsyncFunction("openArchive") { path: String ->
      val ctx = ready()
      val file = ZimRegistry.requireAllowedFile(ctx, path, ".zim")
      val start = System.nanoTime()
      val open = ZimRegistry.open(file)
      val archive = open.archive
      fun meta(key: String): String = try {
        archive.getMetadata(key)
      } catch (e: Exception) {
        ""
      }
      mapOf(
        "archiveId" to open.id,
        "path" to open.path,
        "title" to meta("Title"),
        "language" to meta("Language"),
        "name" to meta("Name"),
        "flavour" to meta("Flavour"),
        "date" to meta("Date"),
        "articleCount" to archive.articleCount,
        "hasFulltextIndex" to archive.hasFulltextIndex(),
        "hasTitleIndex" to archive.hasTitleIndex(),
        "mainPath" to (if (archive.hasMainEntry()) archive.mainEntry.getItem(true).path else null),
        "sizeBytes" to archive.filesize,
        "openMs" to elapsedMs(start),
      )
    }

    AsyncFunction("closeArchive") { archiveId: String ->
      ZimRegistry.close(archiveId)
      textCache.evictAll()
    }

    AsyncFunction("suggest") { query: String, limit: Int, archiveIds: List<String>? ->
      ready()
      val start = System.nanoTime()
      val hits = targets(archiveIds).flatMap { open ->
        synchronized(open.suggestLock) {
          val search = open.suggestionSearcher().suggest(query)
          val it = search.getResults(0, clampLimit(limit))
          try {
            val out = mutableListOf<Map<String, Any?>>()
            while (it.hasNext()) {
              val item = it.next()
              out.add(
                mapOf(
                  "archiveId" to open.id,
                  "path" to item.path,
                  "title" to item.title,
                  "snippet" to (if (item.hasSnippet()) item.snippet else null),
                  "score" to null,
                  "rank" to out.size,
                ),
              )
            }
            out
          } finally {
            it.dispose()
            search.dispose()
          }
        }
      }
      mapOf("hits" to hits, "nativeMs" to elapsedMs(start))
    }

    AsyncFunction("search") { query: String, limit: Int, archiveIds: List<String>?, withSnippets: Boolean ->
      ready()
      val start = System.nanoTime()
      var estimated = 0L
      val hits = targets(archiveIds).filter { it.archive.hasFulltextIndex() }.flatMap { open ->
        synchronized(open.searchLock) {
          val q = Query(query)
          val search = open.searcher().search(q)
          val it = search.getResults(0, clampLimit(limit))
          try {
            estimated += search.estimatedMatches
            val out = mutableListOf<Map<String, Any?>>()
            // Getters describe the item that next() is about to return.
            while (it.hasNext()) {
              val path = it.path
              val title = it.title
              val score = it.score
              val snippet = if (withSnippets) it.snippet else null
              it.next()
              out.add(
                mapOf(
                  "archiveId" to open.id,
                  "path" to path,
                  "title" to title,
                  "snippet" to snippet,
                  "score" to score,
                  "rank" to out.size,
                ),
              )
            }
            out
          } finally {
            it.dispose()
            search.dispose()
            q.dispose()
          }
        }
      }
      mapOf("hits" to hits, "nativeMs" to elapsedMs(start), "estimatedMatches" to estimated)
    }

    AsyncFunction("getArticleHtml") { archiveId: String, path: String ->
      ready()
      val start = System.nanoTime()
      val open = ZimRegistry.get(archiveId)
      val item = ZimContent.readItem(open, path)
      val html = String(item.data, Charsets.UTF_8)
      mapOf(
        "archiveId" to archiveId,
        "path" to item.path,
        "title" to item.title,
        "mimeType" to item.mimeType,
        "html" to html,
        "nativeMs" to elapsedMs(start),
      )
    }

    AsyncFunction("getPlainText") { archiveId: String, path: String ->
      ready()
      val key = "$archiveId\n$path"
      textCache.get(key)?.let { return@AsyncFunction it + ("cached" to true) }
      val start = System.nanoTime()
      val open = ZimRegistry.get(archiveId)
      val item = ZimContent.readItem(open, path)
      if (!item.mimeType.startsWith("text/html")) {
        throw ZimException("ERR_ZIM_NOT_HTML", "Entry '$path' is ${item.mimeType}")
      }
      val html = String(item.data, Charsets.UTF_8)
      val title = item.title.ifBlank { path }
      val sections = ZimContent.extractSections(html, title).map {
        mapOf("heading" to it.heading, "level" to it.level, "text" to it.text)
      }
      val result = mapOf(
        "archiveId" to archiveId,
        "path" to item.path,
        "title" to title,
        "sections" to sections,
        "nativeMs" to elapsedMs(start),
      )
      textCache.put(key, result)
      result + ("cached" to false)
    }

    AsyncFunction("getBlockedRequests") {
      ZimRegistry.blockedRequests().map { mapOf("url" to it.url, "reason" to it.reason, "atMs" to it.atMs) }
    }

    AsyncFunction("clearBlockedRequests") {
      ZimRegistry.clearBlocked()
    }

    AsyncFunction("getMemoryInfo") { DeviceInfo.memory(context) }

    AsyncFunction("getCpuInfo") { DeviceInfo.cpu() }

    AsyncFunction("getDeviceInfo") { DeviceInfo.device() }

    AsyncFunction("getDeviceSnapshot") { DeviceInfo.snapshot(context) }

    /** Writes a UTF-8 file under the content dir (bench reports). Returns the absolute path. */
    AsyncFunction("writeContentFile") { relativePath: String, text: String ->
      val root = ZimRegistry.contentRoot(context)?.canonicalFile
        ?: throw ZimException("ERR_ZIM_NO_STORAGE", "External files dir unavailable")
      val target = File(root, relativePath).canonicalFile
      if (!target.path.startsWith(root.path + File.separator)) {
        throw ZimException("ERR_ZIM_PATH", "Path escapes content dir: $relativePath")
      }
      target.parentFile?.mkdirs()
      target.writeText(text, Charsets.UTF_8)
      target.absolutePath
    }

    View(ZimArticleView::class) {
      Events("onLoadStart", "onLoadEnd", "onBlockedRequest", "onExternalLink")

      Prop("url") { view: ZimArticleView, url: String? ->
        view.setUrl(url)
      }

      OnViewDestroys { view: ZimArticleView ->
        view.destroy()
      }
    }
  }
}
