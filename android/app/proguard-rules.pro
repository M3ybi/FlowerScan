# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve WebView JavaScript bridge entry points while still allowing class
# shrinking and obfuscation for the rest of the app and dependencies.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve source and line metadata so release mapping files can retrace
# production crash stack traces accurately.
-keepattributes SourceFile,LineNumberTable

# Keep source file names generic while retaining retraceable line numbers.
-renamesourcefileattribute SourceFile
