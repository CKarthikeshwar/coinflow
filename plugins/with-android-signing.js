/**
 * FILE PURPOSE
 * ------------
 * A local Expo config plugin that adds a `release` signing config to the generated
 * `android/app/build.gradle`, reading the keystore path and credentials from environment
 * variables (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
 * `ANDROID_KEY_PASSWORD`) rather than hardcoding them.
 *
 * WHERE IT FITS
 * -------------
 * `android/` is not committed to git — it's regenerated from scratch by `expo prebuild` every
 * time (locally, or in CI). Without this plugin, that regeneration produces a stock
 * `build.gradle` whose `release` build type is signed with the throwaway debug key (Expo's own
 * default template does this — it's meant to be replaced by hand or via a plugin like this one).
 * Registered in `app.json`'s `plugins` array, this plugin runs automatically on every prebuild
 * and adds a real release signing config each time — same idea as
 * `modules/coinflow-sms/app.plugin.js`, which injects manifest changes the same way, just
 * applied to `build.gradle`'s signing setup instead of `AndroidManifest.xml`.
 *
 * USED BY
 * -------
 * `.github/workflows/release.yml` sets the 4 environment variables above (from GitHub Actions
 * secrets) before running `expo prebuild` + `./gradlew assembleRelease`, so the CI-built APK is
 * signed with the project's real release key. Building a signed release APK locally works the
 * same way — set those 4 environment variables yourself before running
 * `npx expo prebuild --platform android && cd android && ./gradlew assembleRelease`.
 *
 * IMPORTANT
 * ---------
 * This matches Expo SDK 57's exact default-generated `android/app/build.gradle` text
 * (verified against a real `expo prebuild --clean` run of this project) — the debug
 * `signingConfigs` block's literal content, and the release `buildTypes` block's two-line
 * "Caution!" comment, are used as exact anchors rather than a generic pattern, specifically so
 * a mismatch fails LOUDLY (this plugin throws) instead of silently doing nothing, which is what
 * happened during an earlier, more "clever" regex-based version of this file — worth remembering
 * if a future Expo SDK upgrade ever changes this template's wording.
 * If none of the environment variables are set (e.g. a plain debug build calling this by
 * accident), `ANDROID_KEYSTORE_PATH` falls back to the literal string `"release.keystore"` — a
 * file that won't exist — so a misconfigured release build fails loudly instead of silently
 * producing a bad APK.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const DEBUG_SIGNING_CONFIG = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const RELEASE_SIGNING_CONFIG = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }`;

const RELEASE_BUILD_TYPE_DEBUG_SIGNED = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_BUILD_TYPE_RELEASE_SIGNED = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`;

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;

    // Already applied (e.g. a second prebuild without --clean) — nothing to do.
    if (contents.includes('ANDROID_KEYSTORE_PATH')) {
      return cfg;
    }

    if (!contents.includes(DEBUG_SIGNING_CONFIG)) {
      throw new Error(
        'with-android-signing: the expected default signingConfigs block was not found in ' +
          'android/app/build.gradle — Expo\'s generated template text may have changed. ' +
          'Update plugins/with-android-signing.js to match the new template before building a release.',
      );
    }
    if (!contents.includes(RELEASE_BUILD_TYPE_DEBUG_SIGNED)) {
      throw new Error(
        'with-android-signing: the expected default release buildType block was not found in ' +
          'android/app/build.gradle — Expo\'s generated template text may have changed. ' +
          'Update plugins/with-android-signing.js to match the new template before building a release.',
      );
    }

    cfg.modResults.contents = contents
      .replace(DEBUG_SIGNING_CONFIG, RELEASE_SIGNING_CONFIG)
      .replace(RELEASE_BUILD_TYPE_DEBUG_SIGNED, RELEASE_BUILD_TYPE_RELEASE_SIGNED);

    return cfg;
  });
};
