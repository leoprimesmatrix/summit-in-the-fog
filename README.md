# ICEFALL

Climb a mountain that is trying to fall on you.

A vertical precision platformer for **Micro Jam 064** (theme: **Mountains**).
Six and a half thousand metres of rock and ice, an avalanche behind you, and a
sky that keeps dropping pieces of the mountain on your head.

## Play it

Open `index.html`. There is no build step and no install.

To serve it over HTTP instead (for itch.io testing, or a LAN):

```bash
node serve.js 8144
```

It needs **WebGL2**, which every current browser has.

## The climb

You start in the boulder field at 2100 m. The summit is at 8848 m, and the
route to it is a chain of ledges that never asks for more than a plain jump -
every step is checked against the jump arc when the mountain is generated, so
nothing on the critical path needs a trick you were not taught.

Everything else on the mountain is trying to stop you.

**Falling ice.** A marker appears on the top edge of the frame and the mountain
rumbles. Just under a second later a block comes through it. Small ones
shatter where they land; big ones bounce on down the face and are far more
dangerous on the second bounce than the first.

**Seracs.** Ice the size of a house, hanging off the wall. It notices you from
a long way off, cracks, and lets go. You can see it coming, which is the
point: it is a route decision, not a reflex test.

**Icicles** hang under ledges and drop when you pass beneath them. Fast, small,
and entirely your fault.

**The avalanche** climbs the mountain behind you and does not stop. It is not
really a hazard, it is a clock you can see. Light a cairn and it is shoved back
down the face. Get too far ahead and it speeds up, so running away perfectly is
never the answer either. Falling costs you the ground back to your last cairn.
Being caught by the avalanche costs you the run.

**Brittle ledges** give out about three quarters of a second after you land on
them. **Ice ledges** are slick and you keep your momentum across them.

## What you carry

**Grip** is the bar under your health. Hanging off a wall drains it, the dash
and the axe cost a bite of it, and standing on stone fills it back. It is the
budget everything else is spent from.

**The ice axe** is thrown, bites the first stone it meets, and puts you on a
rope. Hold the button and it hauls you up; steer and you swing. It is never
required and it is always faster.

**Cairns** are stacked stones on the wide rest shelves. Stand on one and it
lights: a checkpoint, a health back, full grip, and the avalanche driven back
down the mountain.

**Crystals** sit on the ledges off the route - further out, usually higher, and
worth points and a good chunk of grip.

## Controls

| Key | Action |
|---|---|
| A / D, or arrows | Move |
| Space / W / Up | Jump - hold for height, release early to clip it |
| into a wall | Slide; jump to kick off it |
| Shift / X | Dash, eight-directional, costs grip |
| C / F / E, or right mouse | Throw the axe; aim with the mouse |
| Down while on the rope | Pay out rope |
| Up or Jump while on the rope | Reel in |
| Esc / P | Pause |
| M | Mute |
| R | Restart (while paused) |

A gamepad works: left stick and A to move and jump, B or a trigger to dash,
X or a shoulder for the axe, right stick to aim.

## The five zones

| Zone | Sky | What changes |
|---|---|---|
| The Icefall | Dawn | Learning ground. Ice falls rarely and the avalanche is a long way down. |
| The Serac Field | Day | Seracs on the walls, more ice, a faster clock. |
| The Storm Band | Storm | Lightning, hard wind, and the sky lets go of several blocks at once. |
| The Knife Ridge | Dusk | The corridor narrows. Brittle ledges everywhere. |
| The Death Zone | Aurora night | Thin air, thin ledges, and everything at once. |

## How it looks

Everything is drawn at 640x360 and scaled to the window with a sharp filter.
Under that is a real renderer:

- **Normal-mapped forward lighting.** Every sprite and every slab of the
  mountain carries a normal map, derived automatically from its own silhouette
  and painted detail. Your lantern, a lit cairn, a crystal, a flare of ice
  where a block landed - each is a real light with a position, a radius, a
  colour and a height off the wall, and each of them shapes the rock.
- **Lit volumetric mist**, scattering those same lights, which is most of what
  makes a flat frame look like it has air in it.
- **Bloom** on a soft knee, so only things that are genuinely emitting glow.
- **God rays** from the sun, on their own high threshold so it is the sun that
  streaks and not the whole sky.
- **Screen-space distortion**: every heavy impact pushes a pressure wave
  through the picture.
- **Per-zone colour grading**, cross-faded by altitude, so the mountain goes
  from dawn through a storm to an aurora without a single cut.
- Tone mapping, vignette, chromatic aberration, film grain and dithering, all
  applied at the game's own resolution so the grain is pixels and not fuzz.

Nothing is a bitmap that was drawn somewhere else. The stone, the ice, the
climber, the wordmark and the range on the horizon are all generated in code at
boot; the only asset files are the font and the sound.

## How it is built

Plain JavaScript. No libraries, no modules, no bundler, no build step.

```
src/core     maths and noise, config, input, audio, text, boot
src/gfx      WebGL2: context, shaders, sprite batcher, lights, camera,
             the frame graph, and the per-altitude look
src/art      everything drawn at boot: materials, the climber's rig, props,
             the wordmark, the range, and the normal-map generator
src/world    the mountain: route generation, chunk baking, collision
src/game     the climber, the axe, the ice, the avalanche, the director
src/fx       particles and weather
src/ui       the interface
src/states   title, play, results
```

The mountain is generated once from a fixed seed, so the route is a place
rather than a shuffle and a best time means something. It is baked into
textures a slab at a time as the camera reaches it, and dropped behind you.

`legacy/` holds *Summit in the Fog*, the game this replaced. It still runs.

## Audio

Every sound is original and generated offline by `tools/gen_sfx.js` (run it
with Node to rebuild them). They ship as plain WAV files and are played with
`HTMLAudioElement`. **No Web Audio API is used anywhere in the game.** There is
no music by design - only effects, a wind bed, and the roar of the thing behind
you.

## Credits

See `CREDITS.md`.
