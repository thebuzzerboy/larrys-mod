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

## StarCoder2 local mod workshop (opt-in, experimental)

StarCoder2 7B GGUF Q4_K_M is an optional model file (roughly 4.5 GB). It is **not bundled in the game and is never downloaded automatically**. Run the model downloader only after installing Sandbox Protocol:
- Windows PowerShell: `scripts/ai/download-starcoder2-windows.ps1`
- Android Termux: `scripts/ai/download-starcoder2-android-termux.sh`

The game now has a **Local Mods** panel: connect it to a local OpenAI-compatible llama.cpp server, test the endpoint, prompt the model to create a resource pack, review its JSON, spawn it, or import/export `.spmod.json` packs. Generated/imported packs are validated and restricted to non-executable primitive prop resources; this is a resource-mod workflow, not arbitrary JavaScript execution.

### Start local inference

**Windows**
1. Install a compatible llama.cpp `llama-server.exe` separately; the executable is not included in the game. Put it at `%LOCALAPPDATA%\\SandboxProtocol\\AI\\runtime\\llama-server.exe`.
2. Run `scripts/ai/start-starcoder2-windows.ps1`. It binds to `127.0.0.1:8080` only, CPU-only with 3 threads and a modest 2048-token context.
3. Open the game → **Local Mods** → **Test connection**. Endpoint defaults to `http://127.0.0.1:8080/v1`.

**Android**
1. Use a maintained Termux installation on a supported 64-bit Android device. Run the model downloader from Termux.
2. Run `scripts/ai/start-starcoder2-android-termux.sh`. If `llama-server` is missing, the script asks whether to install Termux's `llama-cpp` package.
3. Keep Termux open while generating. In the game's **Local Mods** panel, test `http://127.0.0.1:8080/v1`.

The server binds to loopback only. Do not change it to listen on public or shared Wi-Fi. The 7B model needs substantial RAM and will be slow on low-end CPUs; a successful download does not guarantee that a device can run it. Older Android versions/devices may not support current Termux packages.

These model and runtime downloads are independent of the Android Workshop beta. No in-game automatic download or native bundled runtime is provided.

## AI provider configuration & security

AI provider settings are configured inside the game. Never commit API keys to this repository, embed a private key into a distributable, or post keys in issues/chats. Direct provider requests from a browser/WebView may be affected by CORS or provider policies; a private HTTPS proxy is the more reliable production architecture.

## Capturing gameplay

For footage, run the Windows build, enter the game, and capture the actual screen using your preferred recorder. README screenshots and preview artwork should be genuine captures from the running game—not generated mock gameplay.

## Contributing

Bug reports and improvements are welcome. Please describe reproduction steps and include genuine screenshots or logs when relevant. Avoid sharing API keys or other secrets.

## License

See the repository's `LICENSE` file (if present) for the project's license terms.
