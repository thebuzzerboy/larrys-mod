# Larry's Mod — Android project

This repository contains the gm_construct browser game and an Android WebView wrapper. The Android build bundles Three.js and Cannon.js locally during GitHub Actions, so the 3D engine itself does not need a network connection at runtime.

## Build an APK with GitHub Actions

1. Create a GitHub repository and upload the contents of the `LarrysMod` folder inside this ZIP to the root of your GitHub repository (so `app/`, `build.gradle`, and `.github/` are at the repository root).
2. Open **Actions** in GitHub.
3. Select **Build Larry's Mod Android APK** and press **Run workflow** (or push to `main`/`master`).
4. Open the completed workflow run and download the `larrys-mod-debug-apk` artifact.
5. Extract it; install `app-debug.apk` on your Android device. You may need to allow installation from your browser/file manager.

## OpenRouter AI preset

Setup defaults to OpenRouter's OpenAI-compatible endpoint and `nvidia/nemotron-3-ultra-550b-a55b:free`. Enter a newly generated OpenRouter API key in Setup. Keys are deliberately not embedded in this repository or APK and are not written to localStorage; they remain in memory for the current page session. Re-enter the key after restarting the app.

**Security:** the API key previously pasted into chat should be revoked and replaced. Never commit API keys or add them as plaintext to HTML. For a public release, use a private HTTPS proxy that stores the key server-side. Direct provider requests from WebView may still be subject to provider CORS policy; if blocked, the proxy is the reliable fix.

## Notes

- The prop-count deletion cap has been removed. Hardware memory and physics performance are still finite; excessive objects can slow or crash a device.
- The game uses Three.js r128 and Cannon.js 0.6.2. GitHub Actions downloads these libraries and packages them into the APK.
- This workflow builds a **debug APK**, not a Play Store-signed release.
- The project has not been built on a real Android device in this environment.
