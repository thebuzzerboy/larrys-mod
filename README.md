# Sandbox Protocol

**An open-ended 3D physics sandbox. Build, experiment, and play by your own rules.**

Sandbox Protocol is a browser-based 3D sandbox project with physics, props, player mode, tools, and AI characters. The repository includes Android WebView and Windows Electron wrappers.

> **Development build:** Features and controls may change. Read the feature-branch PR notes for the exact tested scope of experimental work.

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
- Touch controls for Android and a separate desktop-controls development branch

The game client does not yet contain a complete public Workshop or authoritative multiplayer implementation. The backend branch adds API foundations, but the in-game Workshop and multiplayer experience still need integration.

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
4. Extract and install the debug APK on a supported Android device.

This is a debug APK, not a Play Store-signed release. The current game wrapper has a modern minimum Android SDK; it is not compatible with Android 4.2/4.4 tablets.

## Backend foundation

The `feature/cloudflare-backend` branch contains a Cloudflare Worker API foundation with R2-backed Workshop upload/list/download/delete, optional Supabase JWKS authentication, an OpenAI-compatible server-side AI gateway, and Durable Objects room-ticket/WebSocket relay foundations. It is not deployed, and the game UI is not yet integrated with Workshop or multiplayer. See [backend setup, API contracts, and limitations](backend/README.md).

You can run backend tests and Wrangler's local emulator without creating a Cloudflare account or entering payment details. Remote deployment and R2 activation are optional and may trigger Cloudflare billing prompts. No deployment, paid resource, or secret is created by CI.

The initial room relay is not a finished authoritative multiplayer server. The AI gateway supports one configured OpenAI-compatible provider per request; it does not perform server-side multi-provider fan-out or native Anthropic/Gemini API translation.

## AI provider configuration & security

The current game UI can use OpenAI-compatible endpoints and keeps manually entered provider keys in memory for the session only. Do not commit keys, embed private credentials in a distributable, or post keys in issues/chats. For a shared production backend, use the optional Worker gateway so provider keys remain server-side. The offline/local model path remains independent; the Worker does not replace it.

## Capturing gameplay

For footage, run the Windows build, enter the game, and capture the actual screen using your preferred recorder. README screenshots and preview artwork should be genuine captures from the running game—not generated mock gameplay.

## Contributing

Bug reports and improvements are welcome. Please describe reproduction steps and include genuine screenshots or logs when relevant. Avoid sharing API keys or other secrets.

## License

See the repository's `LICENSE` file (if present) for the project's license terms.
