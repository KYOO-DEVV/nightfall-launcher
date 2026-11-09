# Nightfall Launcher

A Windows game launcher that finds the games on your PC, pulls their official artwork, and tracks how long you really play.

- **Connect All** scans Steam, Epic Games, GOG, Ubisoft Connect, Riot, HoYoPlay, EA, Rockstar, Xbox / Microsoft Store, Minecraft launchers and game-engine folders.
- **Real play time**, tracked from running processes, plus Roblox experiences and Minecraft instances read from the games' own logs.
- **Your Steam & Epic libraries** with one-click install through the official launchers (no password or API key).
- Favorites, collections, Year in review, Discord Rich Presence and automatic updates.

## Download

Get the latest `NightfallLauncher-Setup-x.y.z.exe` from [Releases](https://github.com/KYOO-DEVV/nightfall-launcher/releases). The installed version updates itself; the portable version doesn't.

The app isn't code-signed yet, so Windows SmartScreen asks for confirmation on first run (More info → Run anyway).

## Develop

```bash
npm install
npm start          # run
npm run dist       # build the installer + portable exe into dist/
npm run release    # build and publish a GitHub release (needs GH_TOKEN)
```
