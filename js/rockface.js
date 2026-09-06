(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The face you are actually climbing.
  //
  // If the ledges hang in front of the painted range you are climbing thin
  // air, but a wall drawn over the range hides the mountain. So a narrow rib
  // stands in front of the range, and the range stays visible past both of
  // its shoulders. The rib is painted here, in the exact colours of the
  // nature_3 peak (sampled from the PNG offline), so it is the same stone as
  // the mountain behind it - but it is painted as CLIFF, not cut out of the
  // picture of the peak. Stacking slices of the painting produced a wall of
  // small repeating mountains with a strip of sky through each join.
  //
  // Each stage tints that stone toward its own light, so the higher you climb
  // the colder it gets without ever becoming a different mountain.

  var R = {};

  var TILE_H = 240;          // 8 rows
  var LEFT_MID = 130, RIGHT_MID = 446;
  var EDGE_AMP = [13, 8, 4];
  var EDGE_K = [1, 3, 7];    // whole periods across the tile: it wraps
  var FRINGE = 16;           // pixels of haze at each silhouette edge

  // The peak's own palette, most-common-first from its cliff band.
  var ROCK = [
    [0x40, 0x58, 0x90],      // deep shadow
    [0x50, 0x68, 0x90],      // shadow
    [0x90, 0x80, 0x78],      // dark stone
    [0x98, 0x90, 0x90],      // stone
    [0xc8, 0xa0, 0x88],      // lit stone
    [0xe8, 0xc0, 0xa0]       // highlight
  ];
  var SNOW = [[0xe8, 0xe8, 0xe8], [0xf8, 0xf8, 0xf0]];
  var GREEN = [[0x40, 0x50, 0x20], [0x50, 0x60, 0x20], [0x60, 0x68, 0x20]];

  // Per-stage light on the same stone, and how far back in the air it sits.
  // Under the aurora the distant peaks are already near-black, so a face a
  // few metres from your nose is the BRIGHTEST thing in frame: thick rime
  // catching the sky. Darkening it there made it vanish into the night.
  var PAL = [
    { tint: '#8fa06a', tintA: 0.12, recede: 0.10, snow: 0.06, green: 0.55 },
    { tint: '#d0a878', tintA: 0.08, recede: 0.14, snow: 0.18, green: 0.25 },
    { tint: '#8fb8dc', tintA: 0.32, recede: 0.22, snow: 0.50, green: 0 },
    { tint: '#9fb0d8', tintA: 0.34, recede: 0.20, snow: 0.58, green: 0 },
    { tint: '#b9d2ee', tintA: 0.42, recede: 0.06, snow: 0.85, green: 0 }
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

  // Value noise on a grid whose row count divides the tile height, so every
  // octave wraps top-to-bottom and the stacked tiles never show a join.
  function hash(ix, iy, seed) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }
  function vnoise(x, y, cw, ch, seed) {
    var rows = Math.round(TILE_H / ch);
    var gx = x / cw, gy = y / ch;
    var ix = Math.floor(gx), iy = Math.floor(gy);
    var fx = gx - ix, fy = gy - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    var y0 = ((iy % rows) + rows) % rows, y1 = (y0 + 1) % rows;
    var a = hash(ix, y0, seed), b = hash(ix + 1, y0, seed);
    var c = hash(ix, y1, seed), d = hash(ix + 1, y1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // The wall is quilted out of the peak's own brushwork. These are 20x20
  // squares of nature_3/2.png that hold nothing but rock and snow - found
  // by scanning the PNG offline for blocks with no sky, no forest and no
  // transparency. Laid down small, overlapping, feathered and randomly
  // mirrored, they give a face in exactly the painting's hand with none of
  // its shapes: no summit cone, no strip of sky, nothing that repeats at a
  // size the eye can catch.
  var PATCH = 20;
  var SRC = [
    [272,64],[272,72],[280,72],[272,80],[280,80],[272,88],
    [280,88],[288,88],[264,96],[304,96],[312,96],[320,96],
    [328,96],[256,104],[264,104],[304,104],[312,104],[320,104],
    [328,104],[248,112],[256,112],[264,112],[312,112],[320,112],
    [328,112],[248,120],[256,120],[336,120],[336,128],[344,128],
    [144,152],[152,152],[152,160],[424,160],[432,160],[448,168],
    [456,168],[200,192],[288,208],[280,216],[288,216],[296,216]];
  var SNOWY = [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 26];       // the blocks up by the snowline

  var patchCv = null, patchMask = null;
  function patch(src, i, flip) {
    if (!patchCv) {
      patchCv = U.makeCanvas(PATCH, PATCH);
      patchMask = U.makeCanvas(PATCH, PATCH);
      var mc = patchMask.getContext('2d');
      var g = mc.createRadialGradient(PATCH / 2, PATCH / 2, 4, PATCH / 2, PATCH / 2, PATCH / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.72, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = g;
      mc.fillRect(0, 0, PATCH, PATCH);
    }
    var pc = patchCv.getContext('2d');
    pc.imageSmoothingEnabled = false;
    pc.globalCompositeOperation = 'source-over';
    pc.clearRect(0, 0, PATCH, PATCH);
    pc.save();
    if (flip) { pc.translate(PATCH, 0); pc.scale(-1, 1); }
    pc.drawImage(src, SRC[i][0], SRC[i][1], PATCH, PATCH, 0, 0, PATCH, PATCH);
    pc.restore();
    pc.globalCompositeOperation = 'destination-in';
    pc.drawImage(patchMask, 0, 0);
    return patchCv;
  }

  function paintRock(cx, src, stage, variant) {
    var p = PAL[stage];
    var rnd = U.mulberry32(3100 + variant * 977);
    var x0 = LEFT_MID - EDGE_AMP[0] - EDGE_AMP[1] - EDGE_AMP[2] - FRINGE - 4;
    var x1 = RIGHT_MID + EDGE_AMP[0] + EDGE_AMP[1] + EDGE_AMP[2] + FRINGE + 4;

    // Two passes, so no patch edge is ever the last thing drawn everywhere.
    for (var pass = 0; pass < 2; pass++) {
      var step = pass === 0 ? 9 : 14;
      for (var gy = 0; gy < TILE_H; gy += step) {
        for (var gx = x0 - PATCH / 2; gx < x1; gx += step) {
          if (pass === 1 && rnd() < 0.55) continue;
          var i = Math.floor(rnd() * SRC.length);
          if (rnd() < p.snow * 0.6) i = SNOWY[Math.floor(rnd() * SNOWY.length)];
          var px = Math.round(gx + (rnd() - 0.5) * step);
          var py = Math.round(gy + (rnd() - 0.5) * step);
          var cv = patch(src, i, rnd() < 0.5);
          // Drawn three times so the tile wraps: a patch that hangs off the
          // bottom reappears at the top of the next tile down.
          cx.drawImage(cv, px, py - PATCH / 2);
          cx.drawImage(cv, px, py - PATCH / 2 - TILE_H);
          cx.drawImage(cv, px, py - PATCH / 2 + TILE_H);
        }
      }
    }

    // Big soft light and shadow across the face - the mass of a buttress
    // rather than a flat sheet of texture. Quantised into steps so it stays
    // in the painting's flat-facet language.
    var seed = 91 + variant * 17;
    var id = cx.createImageData(C.W, TILE_H);
    var d = id.data;
    for (var y = 0; y < TILE_H; y++) {
      for (var x = x0; x < x1; x++) {
        var m = vnoise(x, y, 64, 40, seed) * 0.7 + vnoise(x, y, 22, 20, seed + 1) * 0.3;
        var o = (y * C.W + x) * 4;
        if (m < 0.36) { d[o] = 0x40; d[o + 1] = 0x58; d[o + 2] = 0x90; d[o + 3] = m < 0.26 ? 140 : 80; }
        else if (m > 0.68) { d[o] = 0xff; d[o + 1] = 0xf4; d[o + 2] = 0xdc; d[o + 3] = m > 0.78 ? 76 : 40; }
      }
    }
    var shade = U.makeCanvas(C.W, TILE_H);
    shade.getContext('2d').putImageData(id, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.drawImage(shade, 0, 0);
    cx.globalCompositeOperation = 'source-over';
  }

  function bake(stage, variant, src) {
    var p = PAL[U.clamp(stage, 0, PAL.length - 1)];
    var rnd = U.mulberry32(4700 + stage * 31 + variant * 7);
    var cv = U.makeCanvas(C.W, TILE_H);
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;

    if (src) paintRock(cx, src, U.clamp(stage, 0, PAL.length - 1), variant);
    else { cx.fillStyle = '#c8a088'; cx.fillRect(0, 0, C.W, TILE_H); }

    // Snow on the up-facing edges, heavier the higher you climb. Long and
    // thin, so none of it can be mistaken for somewhere to stand.
    var drifts = Math.round(4 + p.snow * 22);
    for (var dd = 0; dd < drifts; dd++) {
      var dy = Math.floor(rnd() * TILE_H);
      var dw = 60 + Math.floor(rnd() * 200);
      var dx = Math.floor(rnd() * C.W) - dw / 2;
      cx.globalAlpha = (0.18 + rnd() * 0.30) * (0.35 + p.snow);
      cx.fillStyle = '#eef6fb';
      cx.fillRect(dx, dy, dw, 1);
      if (rnd() < 0.5) { cx.globalAlpha *= 0.55; cx.fillRect(dx + 10, dy + 1, Math.max(4, dw - 20), 1); }
    }
    cx.globalAlpha = 1;

    // Cracks running down the face, wrapped across the tile boundary.
    var cracks = 3 + Math.floor(rnd() * 3);
    for (var k = 0; k < cracks; k++) {
      var cxp = LEFT_MID + 20 + rnd() * (RIGHT_MID - LEFT_MID - 40);
      var cy = rnd() * TILE_H;
      var slope = (rnd() - 0.5) * 0.9;
      var len = 50 + rnd() * 130;
      cx.globalAlpha = 0.35 + rnd() * 0.2;
      cx.fillStyle = '#405890';
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
        var kk = 1 - e / 26;
        cx.globalAlpha = kk * kk * 0.55;
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
