package org.skepi.tools

import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** The SOS player switches the torch exactly along the timeline and always ends with the torch off. */
@RunWith(AndroidJUnit4::class)
class MorsePlayerTest {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private val events: MutableList<Pair<Boolean, Long>> = Collections.synchronizedList(mutableListOf())

  @Before
  fun setUp() {
    thread = HandlerThread("morse-test").apply { start() }
    handler = Handler(thread.looper)
    events.clear()
  }

  @After
  fun tearDown() {
    thread.quitSafely()
  }

  @Test
  fun playsTheTimelineOnceAndEndsOff() {
    val done = CountDownLatch(1)
    val player = MorsePlayer(handler) { on ->
      events.add(on to SystemClock.elapsedRealtime())
      if (events.size == 7) done.countDown()
    }
    // S = dot dot dot (on 50, off 50 …), last pause 100; then off at the end.
    player.start(longArrayOf(50, 50, 50, 50, 50, 100), loop = false)
    assertTrue(done.await(5, TimeUnit.SECONDS))
    assertEquals(listOf(true, false, true, false, true, false, false), events.map { it.first })
    assertFalse(player.running)
    val firstOnFor = events[1].second - events[0].second
    assertTrue("on step lasted $firstOnFor ms", firstOnFor in 40..250)
  }

  @Test
  fun loopsUntilStoppedAndStopSwitchesOff() {
    val looped = CountDownLatch(1)
    val player = MorsePlayer(handler) { on ->
      events.add(on to SystemClock.elapsedRealtime())
      if (events.size >= 5) looped.countDown()
    }
    player.start(longArrayOf(30, 30), loop = true)
    assertTrue(looped.await(5, TimeUnit.SECONDS))
    player.stop()
    SystemClock.sleep(150)
    val count = events.size
    SystemClock.sleep(150)
    assertEquals("no torch changes after stop", count, events.size)
    assertFalse(events.last().first)
  }

  @Test
  fun rejectsInvalidTimelines() {
    assertThrows(IllegalArgumentException::class.java) { MorsePlayer.validate(longArrayOf()) }
    assertThrows(IllegalArgumentException::class.java) { MorsePlayer.validate(longArrayOf(100)) }
    assertThrows(IllegalArgumentException::class.java) { MorsePlayer.validate(longArrayOf(100, 5)) }
    assertThrows(IllegalArgumentException::class.java) { MorsePlayer.validate(longArrayOf(100, 20_000)) }
    MorsePlayer.validate(longArrayOf(250, 250))
  }
}
