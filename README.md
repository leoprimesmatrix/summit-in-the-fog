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

- **Momentum.** Every landing sends a ripple through the fog that shows the
  next ledge for half a second. Chain hops and it shows two, then three. Stop,
  and it closes. Keep moving and the path keeps opening in front of you.
- **Crystals** on some ledges, often on the riskier of two, pay points and
  grant Clear Sight: one extra ripple row for the next six hops.

Hop into empty fog and you slip, losing two rows and your combo.

**Scoring.** Every ledge pays, combos multiply it, and a hop onto a ledge you
could not see pays a blind bonus. Crystals, cairns and the summit add more, and
a fast summit earns a time bonus. Best score is saved alongside best time. Higher up the
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

Every sound is an original effect authored for this game and shipped as a plain
WAV in `assets/audio/`, played with `HTMLAudioElement`. **No Web Audio API is
used anywhere in the game.** The effects are generated offline by
`tools/gen_sfx.js` (run it with Node to rebuild them). They are tuned to stay
soft and short so they do not wear on you over a long climb. There is no music
by design, only effects and a quiet wind bed; both have sliders in Settings.

## Credits

Backgrounds are from CraftPix's free "Nature Landscapes" pixel art pack.
Everything else, including the climber, ledges, cairns, fog, whiteout and the
5x7 bitmap font, is drawn procedurally in code. See `CREDITS.md`.

## Technical notes

Plain JavaScript on one HTML5 canvas. No libraries, no modules, no bundler.
Internal resolution is 576x324, integer-scaled to the window so the pixels stay
sharp. The mountain is generated from a fixed seed, so every run is the same
route and your best time means something.
