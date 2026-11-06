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
- Experimental local JSON mod loader for custom procedural physics props

Workshop/community sharing and multiplayer are **not confirmed as implemented** in the current source. Please do not assume they are available.

## Experimental AI Mod Studio

This developer-only branch adds an **AI Mod Studio** entry point. It connects to a separately running OpenAI-compatible local endpoint configured with StarCoder2, sends a reviewed game-knowledge bootstrap with each generation request, validates the returned mod JSON, and exports a package for import through **Mods**. StarCoder2 weights and an inference runtime are not bundled or automatically installed. Structured props are the default; optional JavaScript scripts run in an isolated iframe with a tiny experimental bridge (`api.log`, `api.spawn`). The script sandbox is not production-hardened and has no hard CPU quota.

The resource picker recognizes GLB/GLTF/OBJ, PNG/JPG/WEBP, WAV/OGG/MP3, JSON, Markdown, text and source files. At this stage, imported resources are only catalogued by metadata and optional user notes; binary files are not passed to the model, stored in the mod, or rendered in-game. See [docs/AI_MOD_STUDIO.md](docs/AI_MOD_STUDIO.md), [docs/GAME_KNOWLEDGE.md](docs/GAME_KNOWLEDGE.md), and [docs/LOCAL_MODS.md](docs/LOCAL_MODS.md).

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

## AI provider configuration & security

AI provider settings are configured inside the game. Never commit API keys to this repository, embed a private key into a distributable, or post keys in issues/chats. Direct provider requests from a browser/WebView may be affected by CORS or provider policies; a private HTTPS proxy is the more reliable production architecture.

## Capturing gameplay

For footage, run the Windows build, enter the game, and capture the actual screen using your preferred recorder. README screenshots and preview artwork should be genuine captures from the running game—not generated mock gameplay.

## Contributing

Bug reports and improvements are welcome. Please describe reproduction steps and include genuine screenshots or logs when relevant. Avoid sharing API keys or other secrets.

## License

See the repository's `LICENSE` file (if present) for the project's license terms.
