# Glowkeeper

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Kyamii21/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Kyamii21/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Glowkeeper** — a lantern-wisp in a dark cavern. Gather embers to feed your light, flare to burn back the shades, dash out of trouble, and survive all 8 waves until dawn breaks.

- **Move** with WASD or arrow keys · **Space** flares (burns every shade inside your light) · **Shift** dashes · **P** pauses · **M** mutes
- **Embers** feed your light and charge your flare energy; chaining pickups builds a combo up to ×8
- **Shades** come in three kinds — slow Drifters, weaving Weavers, and Rushers that telegraph a dash — and grow hungry if they live too long
- **Power-ups**: Prism (wider light), Heart, Nova (full energy)
- **Win** by clearing wave 8; **lose** all 3 hearts and the light goes out

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network: `game/` is plain static files (HTML + ES modules, synthesised WebAudio sound, no libraries).

## How it is built

- `game/index.html` — the page, one canvas
- `game/src/config.js` — every tuning number and colour
- `game/src/world.js` — the rules: wisp, embers, shades, waves, flare, combo
- `game/src/render.js` — drawing only: cavern, light and darkness, HUD, panels
- `game/src/input.js` — keyboard and pointer input
- `game/src/audio.js` — synthesised sound effects and drone (WebAudio, no files)
- `game/src/shots.js` — the autopilot that stages the screenshot scenes
- `game/src/main.js` — boot and the fixed-step loop
- `main.ts` — hands the entry in: copies `game/` and `screenshots/` and writes `dossier.json`
- `screenshots/` — 4 real renders of the game: play, title, flare, dawn (win)

---

<sub>Entered on [make.fun](https://make.fun/?ref=rhb2d3y3&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
