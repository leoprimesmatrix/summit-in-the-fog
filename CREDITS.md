# Credits

## Summit in the Fog

Made for Micro Jam 064. Theme: **Mountains**. Prerequisite: **the fog hides the path**.

## Art

**Backgrounds** - "Nature Landscapes Free Pixel Art" by [CraftPix](https://craftpix.net/).
Two of the eight packs are used: the alpine daytime set (`nature_3`) for the lower
mountain and the aurora night set (`nature_6`) for the summit.
License: <https://craftpix.net/file-licenses/>

**Everything else is original, drawn in code** for this jam: the climber, the rock
ledges, the crumbling ledges, the cairns, the summit flag, the lantern glow, the
fog layers, the whiteout, the particles, the UI, and the 5x7 bitmap font.

## Audio

All sound effects and the wind bed are **original**, generated for this jam by
`tools/gen_sfx.js` and shipped as WAV files in `assets/audio/`. Playback uses
`HTMLAudioElement` only; **no Web Audio API is used anywhere.** There is no
music by design. Wind and effects volume live in the in-game Settings screen
(S on the title or from pause).

## Code

Written from scratch in plain JavaScript with no libraries, no build step and no
external runtime dependencies. Rendered on a single HTML5 canvas at an internal
resolution of 576x324, integer-scaled to the window.
