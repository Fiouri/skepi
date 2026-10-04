# SKEPI R8 keep rules (appended to android/app/proguard-rules.pro by plugins/withSkepiAndroid.js).
# Everything below is reached from native code (JNI) or by reflection, which R8 cannot see.

# libkiwix / libzim Java binding: JNI resolves classes, fields (nativeHandle) and methods by name.
-keep class org.kiwix.** { *; }
-dontwarn org.kiwix.**

# llama.rn: JNI callbacks into com.rnllama.* (token streaming, model info maps).
-keep class com.rnllama.** { *; }
-dontwarn com.rnllama.**

# MapLibre Native + its React Native wrapper: large JNI surface (peers, callbacks, style layers).
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**

# Our Expo modules: module/view classes are looked up by name from ExpoModulesPackageList and
# Kotlin function/record types are introspected at runtime.
-keep class org.skepi.** { *; }

# Expo modules core ships consumer rules; also keep generated module providers and the
# autolinking package list that instantiates every module reflectively.
-keep class expo.modules.ExpoModulesPackageList { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * extends expo.modules.kotlin.views.ExpoView { *; }
