# Press kit

Everything here is composed from the game's own pixels — the wordmark, the
climber and the ice are the same sprites the game generates at boot.

## itch.io cover

`cover-630x500.png` — upload this as the project's **cover image**. itch.io
wants 630x500 and displays it at 315x250 in browse listings;
`cover-thumb-315x250.png` is that downscale, kept only so you can check it
still reads small before publishing.

## Screenshots

Six 1600x900 captures for the page gallery, one per zone plus the title:

| File | What it shows |
|---|---|
| `screenshot-1_title.png` | Title screen |
| `screenshot-2_icefall.png` | The Icefall, dawn, a block on its way down |
| `screenshot-3_seracs.png` | The Serac Field |
| `screenshot-4_storm.png` | The Storm Band |
| `screenshot-5_ridge.png` | The Knife Ridge at dusk |
| `screenshot-6_summit.png` | The Death Zone under the aurora |

## Suggested itch.io text

> **ICEFALL** — climb a mountain that is trying to fall on you.
>
> Six and a half thousand metres of rock and ice. Blocks come off the sky with
> a beat of warning, seracs notice you and let go, and an avalanche climbs the
> face behind you and does not stop. Throw the ice axe, get on the rope, and
> keep moving.
>
> Made for Micro Jam 064. Theme: Mountains.

Tags: `platformer`, `pixel-art`, `precision-platformer`, `procedural-generation`,
`webgl`, `mountains`, `arcade`, `singleplayer`

**Uploading it**: the whole repository root is the game. Zip everything except
`press/`, `legacy/`, `tools/` and `serve.js`, set `index.html` as the main
file, tick "This file will be played in the browser", and set the viewport to
**960x540** (or anything 16:9 — the game fits itself to whatever it is given).

## Regenerating

Both the cover and the screenshots are composed in the browser from a running
build; there is no separate art source to keep in sync. See the session notes
in the repository history if they need to be remade.
