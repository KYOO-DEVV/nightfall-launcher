# Nightfall Launcher

A Windows game launcher that finds the games on your PC, pulls their official artwork, and tracks how long you really play. Built in **Rust** with [Tauri](https://tauri.app): the backend is native Rust and the interface runs in Windows' built-in WebView2.

- **Connect All** scans Steam, Epic Games, GOG, Ubisoft Connect, Riot, HoYoPlay, EA, Rockstar, Xbox / Microsoft Store, Minecraft launchers and game-engine folders on every drive.
- **Real play time**, tracked from running processes, plus Roblox experiences, Minecraft instances, Fortnite matches (modes, Victory Royales) and Valorant matches (maps, agents, rounds) read from the games' own logs.
- **News** on game pages: HoYoverse banners and version updates (with an estimate of the next version), Fortnite, Valorant, League of Legends and Steam announcements.
- **Store pages and live downloads**: open any game you own, even if it isn't installed, and watch Steam / Epic installs with progress, speed and time left.
- **Profile**: your picture, banner, name, bio and a showcase of the games you choose. Pin games to the sidebar and bookmark the ones you love.
- **Your stores**: Steam, Epic Games, GOG Galaxy, Amazon Games and itch.io libraries with one-click install through the official launchers (no password needed).
- **Friends**: what your Steam friends are playing right now (with your own Steam Web API key).
- **Discord Rich Presence**, favorites, collections, Year in review, shareable stat cards and signed automatic updates.

## Download

Get the latest `Nightfall Launcher_x.y.z_x64-setup.exe` from [Releases](https://github.com/KYOO-DEVV/nightfall-launcher/releases). It updates itself. Installing 2.0 over 1.x imports your library and play history and removes the old version.

The app isn't code-signed yet, so Windows SmartScreen asks for confirmation on first run (More info → Run anyway).

## Develop

Needs Rust, Node.js and the Visual Studio C++ Build Tools.

```bash
npm install
npm start          # tauri dev
npm run dist       # tauri build → src-tauri/target/release/bundle/nsis
```

Releases are signed for the updater with `TAURI_SIGNING_PRIVATE_KEY` (kept outside the repo).

- `src-tauri/src` — Rust: scanning, tracking, art, store libraries, game logs, Discord, friends, updates
- `ui/` — the interface
