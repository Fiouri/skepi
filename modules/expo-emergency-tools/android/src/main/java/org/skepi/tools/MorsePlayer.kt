package org.skepi.tools

import android.os.Handler

/**
 * Plays an on/off timeline (ms, starting with "on"; @skepi/core `morseTimeline`) through [setOn],
 * on [handler]'s thread, optionally looping. Used for the SOS torch; the screen mode uses the same
 * timeline in JS.
 */
internal class MorsePlayer(private val handler: Handler, private val setOn: (Boolean) -> Unit) {
  private var timeline = LongArray(0)
  private var index = 0
  private var loop = true

  @Volatile
  var running = false
    private set

  private val step = object : Runnable {
    override fun run() {
      if (!running) return
      if (index >= timeline.size) {
        if (!loop) {
          running = false
          setOn(false)
          return
        }
        index = 0
      }
      setOn(index % 2 == 0)
      val delay = timeline[index]
      index += 1
      handler.postDelayed(this, delay)
    }
  }

  fun start(durations: LongArray, loop: Boolean) {
    validate(durations)
    stop()
    timeline = durations.copyOf()
    index = 0
    this.loop = loop
    running = true
    handler.post(step)
  }

  /**
   * Stops the timeline and switches off on the player thread: a step already running there finishes
   * first (it may have just switched on), so the torch always ends off.
   */
  fun stop() {
    val wasRunning = running
    running = false
    handler.removeCallbacks(step)
    if (wasRunning) handler.post { setOn(false) }
  }

  companion object {
    const val MIN_MS = 20L
    const val MAX_MS = 10_000L
    const val MAX_STEPS = 512

    fun validate(durations: LongArray) {
      require(durations.isNotEmpty() && durations.size % 2 == 0) { "timeline must have an even number of steps (on/off pairs)" }
      require(durations.size <= MAX_STEPS) { "timeline too long" }
      require(durations.all { it in MIN_MS..MAX_MS }) { "every step must be $MIN_MS..$MAX_MS ms" }
    }
  }
}
