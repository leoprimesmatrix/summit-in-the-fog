# Summit in the Fog

A short pixel-art climbing game made for **Micro Jam 064**.
Theme: **Mountains**. Prerequisite: **the fog hides the path**.

## How to play it

Double-click `index.html`. That is all. There is no build step, no install and
no server needed.

To serve it over HTTP instead (for itch.io testing or a LAN):

```bash
node serve.js 8144
```

## The goal

Climb from the treeline at 1800 m to the summit at 4800 m before the whiteout
rising behind you swallows the mountain. Then do it faster.

## The idea

The path up the mountain is a chain of rock ledges, one per row, in one of three
lanes. **Fog hides every ledge above you.** You have three ways to find the way:

- **Gusts.** Every few seconds the wind sweeps across and thins the fog,
  showing the next several ledges at once. Memorise them and chain your hops
  blind before the fog closes back in.
- **Your lantern.** Stand still for a moment and it finds the single next
  ledge. Always safe, always slow, and the whiteout is still climbing.
- **Cairns.** Every twelfth ledge carries a cairn. Light it to set a
  checkpoint, clear a lasting patch of fog around it, and shove the whiteout
  back down the mountain.

Hop into empty fog and you slip, losing two rows and your combo. Higher up the
gusts come rarer and show less, some ledges crumble under you moments after you
land, and the whiteout climbs faster.

## Controls

| Key | Action |
|---|---|
| Left / A | Hop up-left |
| Up / W / Space | Hop straight up |
| Right / D | Hop up-right |
| Enter | Confirm |
| Esc or P | Pause |
| M | Mute |
| R | Restart (while paused) |
| Q | Back to the title (while paused) |

You can also tap or click: left third, middle third, right third of the screen.

## The three zones

| Zone | Altitude | What changes |
|---|---|---|
| Treeline | 1800-2780 m | Gusts every 4.5 s showing 7 ledges. Some rows offer two ledges. |
| The Ridge | 2800-3780 m | Dusk falls. Gusts every 6 s showing 5. Crumbling ledges appear. |
| The Summit | 3800-4800 m | Aurora night. Gusts every 7.5 s showing only 3, and the wind is heard a second before it clears. |

## Audio

The game plays audio only from real files in `assets/audio/`, loaded with
`HTMLAudioElement`. **No Web Audio API is used anywhere in the project.**

That folder currently ships empty, so the game runs silently. It is fully
playable that way; every missing cue is skipped with a console warning.
There is no music by design, only sound effects and a quiet wind bed. See `assets/audio/README.md` for the file names and a list of free
CC0 / CC-BY sources to download.

## Credits

Backgrounds are from CraftPix's free "Nature Landscapes" pixel art pack.
Everything else, including the climber, ledges, cairns, fog, whiteout and the
5x7 bitmap font, is drawn procedurally in code. See `CREDITS.md`.

## Technical notes

Plain JavaScript on one HTML5 canvas. No libraries, no modules, no bundler.
Internal resolution is 576x324, integer-scaled to the window so the pixels stay
sharp. The mountain is generated from a fixed seed, so every run is the same
route and your best time means something.
