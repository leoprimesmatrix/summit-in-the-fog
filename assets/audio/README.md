# Audio files for Summit in the Fog

The game plays audio **only** from real files in this folder, loaded with
`HTMLAudioElement`. There is no Web Audio API synthesis anywhere in the code.

This folder ships with a full set of free sounds (see CREDITS.md). To swap any
of them, replace the file and keep the name. The game also runs fine if a file
is missing: that cue is skipped and logged as a console warning.

## Naming

Name each file exactly as listed below, plus an extension. The loader tries
`.ogg` first, then `.mp3`, then `.wav`, and uses whichever it finds.

So `music_title.ogg`, `music_title.mp3` and `music_title.wav` are all valid names
for the title track. Pick one.

## What to get

| File | When it plays | Suggested source |
|---|---|---|
| `amb_wind` | Quiet wind bed under the climb | [Wind Loop](https://opengameart.org/content/wind-loop) (CC-BY 3.0, OGG) |
| `sfx_gust` | A gust arrives and parts the fog | [Short wind sound](https://opengameart.org/content/short-wind-sound) (CC0, WAV) |
| `sfx_hop` | Pushing off for a hop | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (CC0) - a light footstep |
| `sfx_land` | Landing on a ledge | Kenney Impact Sounds - a gravel or rock impact |
| `sfx_slip` | Missing a ledge and falling | Kenney Impact Sounds - a heavier thud or slide |
| `sfx_cairn` | Lighting a cairn checkpoint | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (CC0) - a confirmation chime, or a bell from [Ice Shine Bells](https://opengameart.org/content/ice-shine-bells) (CC0) |
| `sfx_crumble` | Standing on a ledge that starts to give way | Kenney Impact Sounds - rubble or a crack |
| `sfx_whiteout` | The whiteout catches you | Kenney Impact Sounds - a low boom |
| `sfx_summit` | Reaching the summit | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) (CC0) - a bright win jingle |
| `sfx_ui` | Menu confirm and pause | Kenney Interface Sounds - a click |

## Notes

- The wind bed loops, so pick a clip that loops cleanly. The game has no music by design.
- Sound effects are best kept short, well under a second, except `sfx_summit`.
- Keep files reasonably small; they are loaded up front.
- If you use anything that is CC-BY rather than CC0, add the credit to
  `CREDITS.md` in the project root.
- Press **M** in game to mute; the setting is remembered.
