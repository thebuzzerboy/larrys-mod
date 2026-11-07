# Sandbox Protocol

**An open-ended 3D physics sandbox. Build, experiment, and play by your own rules.**

Sandbox Protocol is a browser-based 3D sandbox project with physics, props, player mode, tools, and AI characters. This repository currently includes an Android WebView wrapper; a Windows desktop wrapper is being added to make it easier to capture real gameplay footage and test the game on PC.

> **Development build:** Features and controls may change. The repository source has not yet been independently runtime-tested as a Windows release.

## Project

- **Game source:** `app/src/main/assets/index.html`
- **Android wrapper:** Android WebView project
- **Windows wrapper:** Electron desktop app
- **3D engine:** Three.js r128
- **Physics:** Cannon.js 0.6.2

## Current features in the source

- 3D physics sandbox environment
- Spawnable and manipulable props
- Free camera and player mode
- Tool and weapon systems
- AI characters with configurable provider/persona settings
- In-game menus and settings
- Touch-oriented controls (Android)

Workshop/community sharing and multiplayer are **not confirmed as implemented** in the current source. Please do not assume they are available.

## Windows build (GitHub Actions)

1. Open the repository's **Actions** tab.
2. Select **Build Sandbox Protocol for Windows**.
3. Choose **Run workflow**.
4. When the workflow completes, download the `sandbox-protocol-windows` artifact.
5. Extract the ZIP. It contains a Windows installer and a portable build.

You can also build locally with Node.js LTS:

```powershell
npm install
npm run dist:win
```

The outputs are placed in `dist/`.

## Android build

1. Open **Actions**.
2. Select **Build Sandbox Protocol Android APK** and run the workflow.
3. Download the `sandbox-protocol-debug-apk` artifact from the completed run.
4. Extract and install the debug APK on your Android device.

This is a debug APK, not a Play Store-signed release.

## Multi-AI configuration (experimental)

Open **Setup** in the game and choose **Multi-AI strategy**:
- **Single provider** keeps the existing one-provider path.
- **Primary + AI reviewer** sends the initial structured response to the primary provider, asks the configured reviewer to critique it, then asks the primary provider to revise using that critique. This is slower and uses extra API calls. Reviewer endpoint/model/key are optional and the reviewer key is session-only.

Both providers use OpenAI-compatible `/chat/completions` endpoints. Configure a reviewer only if you have access to another provider or proxy. Never commit API keys.

## StarCoder2 model download (opt-in)

StarCoder2 7B GGUF Q4_K_M is an optional model download (about 4.5 GB); it is **not included in the installer/APK and is never auto-downloaded**. After installing the game, a user may explicitly run:
- Windows PowerShell: `scripts/ai/download-starcoder2-windows.ps1`
- Android: `scripts/ai/download-starcoder2-android-termux.sh` from Termux (Android shell script)

Each script asks the user to type `YES` before downloading and saves the model into a user-owned models directory. Android needs Termux with curl. These scripts download weights only. A compatible llama.cpp inference runtime and game-side local-mod-generation integration are still required before the downloaded StarCoder2 file can generate mods in-game; the download alone does not activate a local AI. Model download is separate from the Workshop beta and does not alter game installation files.

## AI provider configuration & security

AI provider settings are configured inside the game. Never commit API keys to this repository, embed a private key into a distributable, or post keys in issues/chats. Direct provider requests from a browser/WebView may be affected by CORS or provider policies; a private HTTPS proxy is the more reliable production architecture.

## Capturing gameplay

For footage, run the Windows build, enter the game, and capture the actual screen using your preferred recorder. README screenshots and preview artwork should be genuine captures from the running game—not generated mock gameplay.

## Contributing

Bug reports and improvements are welcome. Please describe reproduction steps and include genuine screenshots or logs when relevant. Avoid sharing API keys or other secrets.

## License

See the repository's `LICENSE` file (if present) for the project's license terms.
