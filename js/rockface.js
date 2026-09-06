(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The face you are actually climbing.
  //
  // This answers a real question: if the ledges hang in front of the painted
  // range you are climbing thin air, but if a wall is drawn over the range
  // then the mountain is gone. So the wall is cut out of the range itself -
  // horizontal bands of the nature_3 peak at 1:1 pixel scale, stacked into a
  // buttress that stands in front of the same mountain seen at distance. The
  // rock you hold is the rock on the horizon: same palette, same brush, same
  // mountain. The rib is narrow enough that the peak stays visible past both
  // of its shoulders, so you can always see what you are on.
  //
  // Each stage tints that stone toward its own light, so the higher you climb
  // the colder it gets without ever becoming a different mountain.

  var R = {};

  var TILE_H = 240;          // 8 rows
  var LEFT_MID = 122, RIGHT_MID = 454;
  var EDGE_AMP = [17, 10, 5];
  var EDGE_K = [1, 3, 7];    // whole periods across the tile: it wraps
  var FRINGE = 16;           // pixels of haze at each silhouette edge
  var FADE = 14;             // cross-fade between stacked bands

  // Bands taken from the cliff-and-ledge middle of the painted peak, clear of
  // the summit cone and the forest at its foot, so a tile reads as rock and
  // never as a small picture of a mountain repeating.
  // Taken from the snow-and-rock upper third of the peak, not its middle:
  // the mountain's green terraces are the same shape and size as the ledge
  // sprites, and a wall built out of them is unreadable - you cannot tell
  // what you can stand on. Up here it is all cliff band, snow and stone.
  var BANDS = [
    [{ sy: 88, h: 86 }, { sy: 60, h: 80 }, { sy: 118, h: 74 }],
    [{ sy: 104, h: 82 }, { sy: 68, h: 84 }, { sy: 134, h: 74 }]
  ];

  // Per-stage light on the same stone, and how far back in the air it sits.
  // Receding is what keeps the ledges the brightest thing on the wall.
  // The rib has to stand apart from whatever is behind it or it dissolves and
  // the ledges are floating again - but which way depends on the light. Low
  // down, against a bright sky and green hills, that means a touch darker.
  // Under the aurora the distant peaks are already near-black, so a face a
  // few metres from your nose is the BRIGHTEST thing in frame: thick rime
  // catching the sky. Darkening it there made it vanish into the night.
  var PAL = [
    { tint: '#8fa06a', tintA: 0.12, recede: 0.10, snow: 0.12 },
    { tint: '#d0a878', tintA: 0.08, recede: 0.14, snow: 0.22 },
    { tint: '#8fb8dc', tintA: 0.32, recede: 0.22, snow: 0.60 },
    { tint: '#9fb0d8', tintA: 0.34, recede: 0.20, snow: 0.64 },
    { tint: '#b9d2ee', tintA: 0.42, recede: 0.06, snow: 0.88 }
  ];

  var tiles = null;          // tiles[stage] = [canvasA, canvasB]
  var mask = null;           // the buttress silhouette, shared by every tile
  var phL = null, phR = null;

  function edge(y, mid, sign, phase) {
    var v = 0;
    for (var i = 0; i < EDGE_K.length; i++) {
      v += Math.sin(2 * Math.PI * EDGE_K[i] * y / TILE_H + phase[i]) * EDGE_AMP[i];
    }
    return mid + sign * v;
  }

  function phases() {
    if (phL) return;
    var pr = U.mulberry32(880);
    phL = [pr() * 6.283, pr() * 6.283, pr() * 6.283];
    phR = [pr() * 6.283, pr() * 6.283, pr() * 6.283];
  }

  // The rib's outline, feathered at both edges so it dissolves into the air
  // rather than ending on a ruled line. One mask serves every tile.
  function buildMask() {
    phases();
    var cv = U.makeCanvas(C.W, TILE_H);
    var cx = cv.getContext('2d');
    cx.fillStyle = '#ffffff';
    for (var y = 0; y < TILE_H; y++) {
      var lx = Math.round(edge(y, LEFT_MID, 1, phL));
      var rx = Math.round(edge(y, RIGHT_MID, -1, phR));
      if (rx <= lx) continue;
      cx.globalAlpha = 1;
      cx.fillRect(lx, y, rx - lx, 1);
      for (var f = 0; f < FRINGE; f++) {
        var a = 1 - (f + 1) / (FRINGE + 1);
        cx.globalAlpha = a * a;
        cx.fillRect(lx - f - 1, y, 1, 1);
        cx.fillRect(rx + f, y, 1, 1);
      }
    }
    return cv;
  }

  // One band of source rock, its top edge cross-faded into whatever is
  // already there through a gradient mask. Averaging two copies of the whole
  // tile (the usual seamless-tile fold) greyed the art into mud and threw
  // away the thing that made it worth using; this keeps every band crisp and
  // only softens the joins.
  function blitBand(dst, src, sy, dy, h, fade) {
    var t = U.makeCanvas(C.W, h + fade);
    var tc = t.getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(src, 0, sy - fade, C.W, h + fade, 0, 0, C.W, h + fade);
    if (fade > 0) {
      // One pass, covering the whole canvas. destination-in clears every
      // pixel the source does not cover, so masking the top strip and then
      // the body in two fills wipes out whichever was kept first - which is
      // exactly how this silently baked a set of entirely empty tiles.
      tc.globalCompositeOperation = 'destination-in';
      var g = tc.createLinearGradient(0, 0, 0, h + fade);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(fade / (h + fade), 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      tc.fillStyle = g;
      tc.fillRect(0, 0, C.W, h + fade);
    }
    dst.drawImage(t, 0, dy - fade);
  }

  function paintRock(cx, src, variant) {
    var set = BANDS[variant % BANDS.length];
    var y = 0;
    for (var i = 0; i < set.length && y < TILE_H; i++) {
      var b = set[i];
      var h = Math.min(b.h, TILE_H - y);
      blitBand(cx, src, b.sy, y, h, i === 0 ? 0 : FADE);
      y += h;
    }
    if (y < TILE_H) blitBand(cx, src, set[0].sy, y, TILE_H - y, FADE);

    // Make the tile wrap: its last rows melt back into its first.
    var cv = cx.canvas;
    var tail = U.makeCanvas(C.W, FADE * 2);
    var tx = tail.getContext('2d');
    tx.imageSmoothingEnabled = false;
    tx.drawImage(cv, 0, 0, C.W, FADE * 2, 0, 0, C.W, FADE * 2);
    tx.globalCompositeOperation = 'destination-in';
    var g2 = tx.createLinearGradient(0, 0, 0, FADE * 2);
    g2.addColorStop(0, 'rgba(0,0,0,1)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    tx.fillStyle = g2;
    tx.fillRect(0, 0, C.W, FADE * 2);
    cx.drawImage(tail, 0, TILE_H - FADE * 2);
  }

  function bake(stage, variant, src) {
    var p = PAL[U.clamp(stage, 0, PAL.length - 1)];
    var rnd = U.mulberry32(4700 + stage * 31 + variant * 7);
    var cv = U.makeCanvas(C.W, TILE_H);
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;

    if (src) {
      paintRock(cx, src, variant);
    } else {
      cx.fillStyle = '#8b7a60';
      cx.fillRect(0, 0, C.W, TILE_H);
    }

    // A stratum across the wrap join, which is where a cliff has one anyway.
    cx.globalAlpha = 0.5;
    cx.fillStyle = '#3a3324';
    cx.fillRect(0, TILE_H - 2, C.W, 2);
    cx.globalAlpha = 0.55;
    cx.fillStyle = '#eef6fb';
    cx.fillRect(0, TILE_H - 4, C.W, 2);
    cx.globalAlpha = 1;

    // Snow on the up-facing edges, heavier the higher you climb. Long and
    // thin, so none of it can be mistaken for somewhere to stand.
    var drifts = Math.round(6 + p.snow * 20);
    for (var d = 0; d < drifts; d++) {
      var dy = Math.floor(rnd() * TILE_H);
      var dw = 90 + Math.floor(rnd() * 240);
      var dx = Math.floor(rnd() * C.W) - dw / 2;
      cx.globalAlpha = (0.16 + rnd() * 0.30) * (0.35 + p.snow);
      cx.fillStyle = '#eef6fb';
      cx.fillRect(dx, dy, dw, 1);
      if (rnd() < 0.5) {
        cx.globalAlpha *= 0.55;
        cx.fillRect(dx + 10, dy + 1, Math.max(4, dw - 20), 1);
      }
    }
    cx.globalAlpha = 1;

    // Cracks running down the face, wrapped across the tile boundary.
    var cracks = 3 + Math.floor(rnd() * 3);
    for (var k = 0; k < cracks; k++) {
      var cxp = LEFT_MID + 20 + rnd() * (RIGHT_MID - LEFT_MID - 40);
      var cy = rnd() * TILE_H;
      var slope = (rnd() - 0.5) * 0.9;
      var len = 50 + rnd() * 130;
      cx.globalAlpha = 0.26 + rnd() * 0.2;
      cx.fillStyle = '#2b2f27';
      for (var s = 0; s < len; s++) {
        var yy = (cy + s) % TILE_H;
        var xx = Math.round(cxp + slope * s + Math.sin(s * 0.3) * 2);
        if (xx > LEFT_MID && xx < RIGHT_MID) cx.fillRect(xx, Math.round(yy), 1, 1);
      }
    }
    cx.globalAlpha = 1;

    // The stage's own light, then the air between the wall and the camera.
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = U.rgba(p.tint, p.tintA);
    cx.fillRect(0, 0, C.W, TILE_H);
    if (p.recede > 0) {
      cx.fillStyle = U.rgba(C.COLORS.ink, p.recede);
      cx.fillRect(0, 0, C.W, TILE_H);
    }

    // Cut the rib out of the band.
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(mask, 0, 0);
    cx.globalCompositeOperation = 'source-over';

    // Round it off. Without this the rib is the same flat plane as the range
    // behind it and you cannot tell you are in front of anything: a lit arete
    // down the left edge and a deep shadow inside the right one read as mass,
    // and say which of the two mountains you are standing on.
    phases();
    cx.globalCompositeOperation = 'source-atop';
    for (var ey = 0; ey < TILE_H; ey++) {
      var elx = Math.round(edge(ey, LEFT_MID, 1, phL));
      var erx = Math.round(edge(ey, RIGHT_MID, -1, phR));
      for (var e = 0; e < 26; e++) {
        var k = 1 - e / 26;
        cx.globalAlpha = k * k * 0.55;
        cx.fillStyle = C.COLORS.ink;
        cx.fillRect(erx - e - 1, ey, 1, 1);
        if (e < 10) {
          cx.globalAlpha = (1 - e / 10) * 0.22;
          cx.fillStyle = '#fff4dc';
          cx.fillRect(elx + e, ey, 1, 1);
        }
      }
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    return cv;
  }

  R.build = function () {
    if (tiles) return;
    mask = buildMask();
    var src = SITF.Assets.img.peak3 || null;
    tiles = [];
    for (var s = 0; s < PAL.length; s++) tiles.push([bake(s, 0, src), bake(s, 1, src)]);
  };

  // Which stage's rock we are looking at, blended so the light changes over a
  // few rows rather than switching on one line.
  function stageAt(rowFloat) {
    var Z = C.ZONES;
    var i = U.zoneIndexOf(Math.floor(U.clamp(rowFloat, 0, C.ROWS)));
    var z = Z[i];
    var blend = 6;
    var t = 0, next = i;
    if (i < Z.length - 1 && rowFloat > z.to + 1 - blend) {
      t = U.clamp((rowFloat - (z.to + 1 - blend)) / blend, 0, 1);
      next = i + 1;
    }
    return { a: i, b: next, t: t };
  }

  // toScreenY converts a world y to a screen y; the caller owns the camera.
  R.draw = function (ctx, toScreenY, rowFloat) {
    if (!tiles) R.build();
    var st = stageAt(rowFloat);

    // World y runs negative going up. Tile n covers [-(n+1)*TILE_H, -n*TILE_H).
    var camY = C.CLIMBER_SCREEN_Y - toScreenY(0);
    var worldTop = camY - C.CLIMBER_SCREEN_Y;
    var worldBot = worldTop + C.H;
    var nFirst = Math.floor(-worldBot / TILE_H) - 1;
    var nLast = Math.floor(-worldTop / TILE_H) + 1;

    var setA = tiles[U.clamp(st.a, 0, tiles.length - 1)];
    var setB = st.t > 0.01 ? tiles[U.clamp(st.b, 0, tiles.length - 1)] : null;

    ctx.save();
    for (var n = nFirst; n <= nLast; n++) {
      var sy = Math.round(toScreenY(-(n + 1) * TILE_H));
      if (sy > C.H || sy + TILE_H < 0) continue;
      var v = ((n % 2) + 2) % 2;
      ctx.globalAlpha = 1;
      ctx.drawImage(setA[v], 0, sy);
      if (setB) {
        ctx.globalAlpha = st.t;
        ctx.drawImage(setB[v], 0, sy);
      }
    }
    ctx.restore();
  };

  // Exposed for the playtest harness so a baked tile can be eyeballed.
  R.tiles = function () { R.build(); return tiles; };

  R.TILE_H = TILE_H;
  SITF.RockFace = R;
})();
