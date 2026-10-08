package org.skepi.tools

import android.content.Context
import android.location.Location

/** Release builds: no mock location, ever (the debug source set holds the E2E implementation). */
internal object MockLocation {
  const val AVAILABLE = false

  @Suppress("UNUSED_PARAMETER")
  fun read(context: Context): Location? = null
}
