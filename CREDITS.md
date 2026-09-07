# Credits

## ICEFALL

Made for Micro Jam 064. Theme: **Mountains**.

## Art

**Everything you see is generated in code at boot.** There are no image files
in this game. The alpine granite, the glacier ice, the wind slab and the snow
are procedural materials; the climber is a rig of angles rather than a sheet of
frames; the falling ice, the cairns, the crystals, the flag, the particles, the
interface and the ICEFALL wordmark are all drawn into an atlas when the game
starts. The range on the horizon is geometry, retinted every frame by the
altitude you are at.

Every one of those sprites also gets a normal map, derived from its own
silhouette and painted luminance by `src/art/normalgen.js`, which is what lets
a lantern actually shape it.

## Font

**m5x7** by Daniel Linssen (Managore), free to use.
<https://managore.itch.io/m5x7> - shipped as `assets/fonts/m5x7.ttf` and
rasterised to hard pixels at boot. Each glyph is packed into the same sprite
atlas as the art, so text is drawn by the same batcher as everything else.

## Audio

All sound effects and both ambience beds are **original**, generated for this
jam by `tools/gen_sfx.js` and shipped as plain WAV files in `assets/audio/`.
Playback uses `HTMLAudioElement` only; **no Web Audio API is used anywhere in
the game.** There is no music by design. Sound volume and mute live in the
in-game Settings screen.

## Code

Written from scratch in plain JavaScript: no libraries, no modules, no bundler
and no build step. Rendered with WebGL2 at an internal resolution of 640x360
and scaled to the window.

## The previous game

`legacy/` holds **Summit in the Fog**, the Micro Jam 064 entry this project
replaced, kept intact and still playable at `legacy/index.html`. Its
backgrounds are from CraftPix's free "Nature Landscapes" pixel art pack
(<https://craftpix.net/file-licenses/>); its own audio lives in
`legacy/audio/`. ICEFALL uses none of that art.
