package org.skepi.contentstore

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** ContentStore rules on the device: only clean HTTPS URLs, only content paths, the free-space margin. */
@RunWith(AndroidJUnit4::class)
class ContentRulesTest {
  private val root = InstrumentationRegistry.getInstrumentation().targetContext.cacheDir

  @Test
  fun onlyHttpsUrlsWithoutQueryStringsCredentialsOrFragments() {
    assertTrue(ContentRules.isAllowedUrl("https://download.kiwix.org/zim/wikipedia/x.zim"))
    assertTrue(ContentRules.isAllowedUrl("https://127.0.0.1:8443/packs/eval-smoke-en.zim"))
    assertFalse(ContentRules.isAllowedUrl("http://download.kiwix.org/zim/x.zim"))
    assertFalse(ContentRules.isAllowedUrl("https://download.kiwix.org/zim/x.zim?device=abc"))
    assertFalse(ContentRules.isAllowedUrl("https://download.kiwix.org/zim/x.zim#frag"))
    assertFalse(ContentRules.isAllowedUrl("https://user:secret@download.kiwix.org/x.zim"))
    assertFalse(ContentRules.isAllowedUrl("file:///sdcard/x.zim"))
    assertFalse(ContentRules.isAllowedUrl("not a url"))
  }

  @Test
  fun resolvesOnlyContentFoldersAndSafeFileNames() {
    assertEquals(File(root.canonicalFile, "zim/a.zim").path, ContentRules.resolve(root, "zim/a.zim").path)
    assertEquals(File(root.canonicalFile, "tmp/a.zim.partial").path, ContentRules.resolve(root, "tmp/a.zim.partial").path)
    for (bad in listOf("../a.zim", "zim/../../a.zim", "zim/../a.zim", "other/a.zim", "zim/sub/a.zim", "zim/.hidden", "/zim/a.zim", "zim/a\\..\\b.zim")) {
      assertThrows(bad, IllegalArgumentException::class.java) { ContentRules.resolve(root, bad) }
    }
  }

  @Test
  fun freeSpaceCheckKeepsTenPercentAndOneGigabyte() {
    val gib = 1024L * 1024 * 1024
    assertEquals(gib + gib / 10 + gib, ContentRules.requiredFreeBytes(gib))
    assertEquals(gib, ContentRules.requiredFreeBytes(0))
  }
}
