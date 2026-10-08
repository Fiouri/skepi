package org.skepi.tools

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * The E2E mock fix (debug source set): read only from the pushed file, validated, absent otherwise.
 * Instrumentation tests run against the debug variant; release builds compile the no-op object.
 */
@RunWith(AndroidJUnit4::class)
class MockLocationTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val file = File(context.getExternalFilesDir(null), "e2e/mock-location.json")

  @After
  fun tearDown() {
    file.delete()
  }

  private fun write(text: String) {
    file.parentFile?.mkdirs()
    file.writeText(text)
  }

  @Test
  fun noFileMeansNoMock() {
    file.delete()
    assertTrue(MockLocation.AVAILABLE)
    assertNull(MockLocation.read(context))
  }

  @Test
  fun readsAFreshFixFromTheFile() {
    write("""{"latitude":38.24664,"longitude":21.73457,"accuracyM":4.5,"altitudeM":12}""")
    val before = System.currentTimeMillis()
    val fix = MockLocation.read(context)
    assertNotNull(fix)
    fix!!
    assertEquals(38.24664, fix.latitude, 1e-9)
    assertEquals(21.73457, fix.longitude, 1e-9)
    assertEquals(4.5f, fix.accuracy, 1e-6f)
    assertEquals("gps", fix.provider)
    assertTrue(fix.time >= before)
  }

  @Test
  fun rejectsInvalidFiles() {
    write("""{"latitude":91.0,"longitude":0.0}""")
    assertNull(MockLocation.read(context))
    write("not json")
    assertNull(MockLocation.read(context))
    write("""{"latitude":1.0}""")
    assertNull(MockLocation.read(context))
  }
}
