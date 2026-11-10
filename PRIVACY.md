# Nightfall privacy policy

*Last updated: 9 November 2026 · applies to Nightfall Launcher 2.5 and later*

The short version: **Nightfall has no account, no analytics and no tracking. Everything it knows about you stays on your PC.**

## What Nightfall stores, and where

Everything lives in your Windows user folder, in `%APPDATA%\app.nightfall.launcher`:

| What | Why |
| --- | --- |
| Your library: game names, where they're installed, artwork you chose | To show and launch your games |
| Play sessions (start and end times) | To show your play time and history |
| Your profile: name, bio, picture, banner, showcase | To show your profile page |
| Settings | To remember your choices |
| Daily backups of the library (`backups\`, last 10 kept) | So you can undo mistakes or recover from a damaged file |
| A log file (`logs\nightfall.log`, about 1 MB at most) | To help work out what went wrong when something breaks |

Your Windows user name is removed from the log before anything is written.

Uninstalling Nightfall and ticking **Delete the application data** removes all of it.

## What Nightfall reads on your PC

- **The launchers you already use** (Steam, Epic Games, GOG, Ubisoft Connect, Riot, HoYoPlay, EA, Rockstar, Xbox, Minecraft launchers, Amazon Games, itch.io): their lists of installed and owned games, and Steam's local friends list and avatar cache.
- **Running processes**, to know when a game is open and count your play time.
- **Some games' own log files** (Roblox, Minecraft, Fortnite, Valorant), to show experiences, instances and matches.

Nightfall never reads passwords, sign-in tokens or payment details, and never changes anything in other launchers.

## What Nightfall sends over the internet

Nightfall connects to the internet only to fetch public information:

- **Artwork and game details** from Steam, Epic Games, the Microsoft Store, Roblox and Wikipedia.
- **News and match details** from public sources: HoYoverse, fortnite-api.com, valorant-api.com, playvalorant.com, leagueoflegends.com and Steam.
- **Steam friends' public profile cards** (`steamcommunity.com/miniprofile`), only if you're signed in to Steam on the PC.
- **Updates** from this GitHub repository.
- **Discord Rich Presence**, only if you turn it on: the name of the game you're playing goes to the Discord app on your PC, which shows it on your profile.

These requests contain the game or page being looked up, never your library, your play time or anything that identifies you. If you add a Steam Web API key, it's stored on your PC and sent only to Steam.

## Problem reports

**Settings → Help → Create a report** saves a plain-text file to your Downloads folder. It contains Nightfall's version, your Windows version, how many games you have, which stores were found and the recent log. You read it, and you decide whether to attach it to a GitHub issue. Nightfall never sends it by itself.

## Children

Nightfall doesn't collect personal data from anyone, children included.

## Changes

If this policy changes, the new version is published here and mentioned in **What's new** inside the app.

## Contact

Open an issue at <https://github.com/KYOO-DEVV/nightfall-launcher/issues>.
