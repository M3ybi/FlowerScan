# Local build toolchain

- Use the latest security-patched, maintained JDK compatible with the checked-in Android toolchain. Currently use JDK 21 LTS with Capacitor 8 and Gradle 8.14.3.
- Keep `JAVA_HOME` configured persistently; do not switch between old JDKs for individual builds. Restart terminals after changing Windows environment variables.
- Before Android builds, verify `java -version` and `android/gradlew.bat --version`. If the agent inherited an environment from before the update, refresh `JAVA_HOME` from the Windows user environment and prepend its `bin` directory to the process PATH.
- Install or update the selected JDK if absent or outdated. Validate compatibility before changing Java major versions; newer releases may require an Android build-tool upgrade.
- Remove superseded standalone Java installations through their uninstallers. Preserve Android Studio's bundled runtime.
