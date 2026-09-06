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

All audio is played from real files in `assets/audio/` with `HTMLAudioElement`.
**No Web Audio API is used anywhere.** There is no music by design; the game uses sound effects and a quiet wind bed. Volumes and mute live in the in-game
Settings screen (S on the title or from pause).

| Cue | Track | Author | License |
|---|---|---|---|
| Wind bed | Wind Loop, recorded by Jonathan Shaw (InspectorJ), looped by AntumDeluge | InspectorJ / AntumDeluge | CC-BY 3.0 |
| Gust | Short wind sound | remaxim | CC0 |
| Hop, slip, cairn, whiteout, summit | Digital Audio | Kenney | CC0 |
| Land, crumble | RPG Audio | Kenney | CC0 |
| UI click | UI Audio | Kenney | CC0 |

Sources: <https://opengameart.org/content/wind-loop>,
<https://opengameart.org/content/short-wind-sound>, <https://kenney.nl/assets>.

## Code

Written from scratch in plain JavaScript with no libraries, no build step and no
external runtime dependencies. Rendered on a single HTML5 canvas at an internal
resolution of 576x324, integer-scaled to the window.
