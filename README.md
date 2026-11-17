# Lumenfall — Siege of the Last Lantern

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Kyamii21/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Kyamii21/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Lumenfall** — a twin-stick arena survival game. You are the last lantern-wisp of a drowned cavern city. Hold the light against the shades for 12 waves until dawn breaks — and face the Gloom Herald, a boss that rises on waves 4, 8 and 12.

- **Move** with WASD or arrow keys · **Mouse** aims · **Hold click** fires light-bolts (or press **F** for auto-fire) · **Space** flares (burns every shade inside your light) · **Shift** dashes · **P** pauses · **M** mutes
- **Star-gems** dropped by slain shades grant XP; each level-up offers a choice of 3 blessings (10 kinds: split flame, piercing light, crits, magnet, healing, supernova flare, and more)
- **Seven kinds of shade** — drifting Drifters, weaving Weavers, telegraph-dash Rushers, ranged Spitters, Splitters that burst into mites, hulking Brutes, and gold-ringed Elites — plus the **Gloom Herald** boss with radial orb bursts and shade summons
- **Embers** feed your light and charge your flare; chaining pickups builds a combo up to ×10
- **Power-ups**: Prism (wider light), Heart, Nova (full energy), Shield (blocks one hit)
- **Win** by clearing wave 12; **lose** all 5 hearts and the light goes out

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network: `game/` is plain static files (HTML + ES modules, synthesised WebAudio sound, no libraries).

## How it is built

- `game/index.html` — the page, one canvas
- `game/src/config.js` — every tuning number, colour, enemy and blessing definition
- `game/src/world.js` — the rules: wisp, bolts, gems, XP and blessings, 7 enemy kinds, bosses, waves, flare, combo
- `game/src/render.js` — drawing only: glowing cavern, light and darkness, HUD, boss bar, level-up cards, panels
- `game/src/input.js` — keyboard and pointer input (twin-stick aim + fire)
- `game/src/audio.js` — synthesised sound effects, drone and boss heartbeat (WebAudio, no files)
- `game/src/shots.js` — the autopilot that stages the screenshot scenes
- `game/src/main.js` — boot and the fixed-step loop
- `main.ts` — hands the entry in: copies `game/` and `screenshots/` and writes `dossier.json`
- `screenshots/` — 4 real renders of the game: play, title, boss fight, dawn (win)

---

<sub>Entered on [make.fun](https://make.fun/?ref=rhb2d3y3&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
