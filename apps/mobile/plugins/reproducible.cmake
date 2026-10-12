# Reproducible native libraries (F-Droid reproducible build, docs/store-readiness.md §4).
# Every CMake build of the Android app (the app's appmodules, llama.rn, op-sqlite, React Native libraries,
# Expo modules) loads this file after its first project() call: plugins/withSkepiAndroid.js passes it as
# CMAKE_PROJECT_INCLUDE. Without it a library's bytes depend on where the repository and the Gradle user
# home are, and on a random build-id.
include_guard(GLOBAL)

# The NDK adds -Wl,--build-id=sha1 to the initial linker flags; ld.lld takes the last --build-id, and these
# flags come after the NDK's. The build-id is a hash over the whole output, so it adds nothing to a
# byte-identical build, while any other difference changes it too.
string(APPEND CMAKE_SHARED_LINKER_FLAGS " -Wl,--build-id=none")
string(APPEND CMAKE_EXE_LINKER_FLAGS " -Wl,--build-id=none")

# __FILE__ (asserts, logging) and debug info carry absolute paths: the checkout, the Gradle user home
# (prefab headers of react-android, fbjni, hermes) and the NDK. Map each to a fixed name. Clang applies
# the longest matching prefix, so the order does not matter.
set(_skepi_maps "")
if(SKEPI_REPRO_REPO_ROOT)
  list(APPEND _skepi_maps "${SKEPI_REPRO_REPO_ROOT}=/skepi")
endif()
if(SKEPI_REPRO_GRADLE_HOME)
  list(APPEND _skepi_maps "${SKEPI_REPRO_GRADLE_HOME}=/gradle-home")
endif()
if(CMAKE_ANDROID_NDK)
  file(TO_CMAKE_PATH "${CMAKE_ANDROID_NDK}" _skepi_ndk)
  list(APPEND _skepi_maps "${_skepi_ndk}=/ndk")
endif()
foreach(_skepi_map IN LISTS _skepi_maps)
  add_compile_options("-ffile-prefix-map=${_skepi_map}")
endforeach()
message(STATUS "SKEPI reproducible build: --build-id=none, prefix maps ${_skepi_maps}")
