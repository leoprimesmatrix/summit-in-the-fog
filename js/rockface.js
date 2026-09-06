(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The face you are actually climbing. A buttress of rock standing in front
  // of the painted range, with the ledges bolted onto it, so the route reads
  // as a mountain instead of stones floating over a landscape. The vista is
  // still visible down both edges of the frame.
  //
  // Everything is baked into two tall tiles per stage that wrap vertically:
  // the silhouette is a sum of sines whose periods divide the tile height, so
  // tile ends meet exactly and the cliff is continuous however far you climb.

  var R = {};

  var TILE_H = 240;          // 8 rows
  var LEFT_MID = 60, RIGHT_MID = 516;
  var EDGE_AMP = [20, 10, 5];
  var EDGE_K = [1, 3, 7];    // whole periods across the tile: it wraps
  var FRINGE = 9;            // pixels of haze at each silhouette edge

  // rock: [shadow, body, light], grain, snow/rime, how much rime, and how far
  // the whole face is pushed back into the atmosphere. The recede value is
  // what keeps the wall behind the route instead of competing with it: the
  // ledges you can stand on must always be the brightest thing on the rock.
  var PAL = [
    { d: '#3e4437', b: '#525845', l: '#666b53', g: '#2f3429', s: '#cfd8dc', rime: 0.18, recede: 0.34 },
    { d: '#443c30', b: '#574c3c', l: '#6b5e4a', g: '#332d24', s: '#d6dee2', rime: 0.26, recede: 0.36 },
    { d: '#3c4c5c', b: '#4b5e72', l: '#5d7488', g: '#2d3a47', s: '#e4eef5', rime: 0.52, recede: 0.30 },
    { d: '#313640', b: '#3d4450', l: '#4c5462', g: '#252932', s: '#dbe6ef', rime: 0.44, recede: 0.26 },
    { d: '#1f222a', b: '#282c36', l: '#343945', g: '#171920', s: '#e8f1f8', rime: 0.62, recede: 0.22 }
  ];

  var tiles = null;          // tiles[stage] = [canvasA, canvasB]

  function edge(y, mid, sign, phase) {
    var v = 0;
    for (var i = 0; i < EDGE_K.length; i++) {
      v += Math.sin(2 * Math.PI * EDGE_K[i] * y / TILE_H + phase[i]) * EDGE_AMP[i];
    }
    return mid + sign * v;
  }

  // Deterministic 0..1 grain, so a tile bakes the same on every machine.
  function hash2(x, y) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function bake(stage, variant) {
    var p = PAL[U.clamp(stage, 0, PAL.length - 1)];
    var rnd = U.mulberry32(4700 + stage * 31 + variant * 7);
    var cv = U.makeCanvas(C.W, TILE_H);
    var cx = cv.getContext('2d');

    // Phases are per stage, not per variant, so A and B share a silhouette
    // and can be stacked in any order without a seam.
    var pr = U.mulberry32(880 + stage);
    var phL = [pr() * 6.283, pr() * 6.283, pr() * 6.283];
    var phR = [pr() * 6.283, pr() * 6.283, pr() * 6.283];
    var vp = variant * 1.7;

    var cd = U.hexToRgb(p.d), cb = U.hexToRgb(p.b), cl = U.hexToRgb(p.l);
    var cg = U.hexToRgb(p.g), cs = U.hexToRgb(p.s);

    // Every y term is a whole number of periods across the tile, so the tile
    // stacks on itself without a seam.
    var YW = 2 * Math.PI / TILE_H;

    var img = cx.createImageData(C.W, TILE_H);
    var data = img.data;

    for (var y = 0; y < TILE_H; y++) {
      var lxf = edge(y, LEFT_MID, 1, phL);
      var rxf = edge(y, RIGHT_MID, -1, phR);
      var lx = Math.round(lxf), rx = Math.round(rxf);
      if (rx <= lx) continue;
      var span = rx - lx;

      // Buttresses: vertical ribs that meander, so the face has volume
      // instead of reading as a slab.
      var ribPhase = Math.sin(3 * YW * y + vp) * 1.4 + Math.sin(7 * YW * y) * 0.5;

      for (var x = lx - FRINGE; x < rx + FRINGE; x++) {
        if (x < 0 || x >= C.W) continue;

        // Broad beds that tilt and sag with x: a band is never a straight
        // line, and never the same line twice across the width.
        var strata = Math.sin(9 * YW * y +
                              Math.sin(x * 0.012 + vp) * 3.0 +
                              Math.sin(x * 0.043) * 0.8 +
                              Math.sin(5 * YW * y) * 2.2);
        var rib = Math.sin(x * 0.055 + ribPhase);
        var gully = Math.sin(x * 0.018 + Math.sin(5 * YW * y) * 0.8 + vp);
        var acrossLight = 1 - U.clamp((x - lx) / span, 0, 1);   // lit from the left

        var v = 0.40 +
                rib * 0.15 +
                gully * 0.16 +
                strata * 0.09 +
                acrossLight * 0.26 +
                (hash2(x, y) - 0.5) * 0.10;

        var r, g, b;
        if (v < 0.34) { r = cd[0]; g = cd[1]; b = cd[2]; }
        else if (v < 0.62) { r = cb[0]; g = cb[1]; b = cb[2]; }
        else { r = cl[0]; g = cl[1]; b = cl[2]; }

        // Snow and rime lie in patches on the up-facing side of a bed, not
        // along every one of them: a big soft mask decides where drifts form.
        if (strata > 0.972) { r = cg[0]; g = cg[1]; b = cg[2]; }
        else if (strata > 0.70 && strata < 0.94) {
          var clump = Math.sin(x * 0.008 + 3 * YW * y + vp) * 0.55 +
                      Math.sin(x * 0.023 + 7 * YW * y) * 0.45;
          if (clump > 0.42 && hash2(x + 7, y + 3) < p.rime) {
            var mixA = 0.45 + hash2(x, y + 11) * 0.4;
            r = Math.round(r + (cs[0] - r) * mixA);
            g = Math.round(g + (cs[1] - g) * mixA);
            b = Math.round(b + (cs[2] - b) * mixA);
          }
        }

        // Alpha: solid inside, feathering into the vista at both silhouettes.
        var a = 255;
        if (x < lx) { var fl = (lx - x) / (FRINGE + 1); a = Math.round(255 * (1 - fl) * (1 - fl)); }
        else if (x >= rx) { var fr = (x - rx + 1) / (FRINGE + 1); a = Math.round(255 * (1 - fr) * (1 - fr)); }
        if (a <= 0) continue;

        var i = (y * C.W + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
      }
    }
    cx.putImageData(img, 0, 0);

    // Cracks: a few long diagonals per tile, wrapped off the ends.
    var cracks = 3 + Math.floor(rnd() * 3);
    for (var k = 0; k < cracks; k++) {
      var cxp = 120 + rnd() * 320;
      var cy = rnd() * TILE_H;
      var slope = (rnd() - 0.5) * 0.9;
      var len = 40 + rnd() * 120;
      cx.fillStyle = p.g;
      for (var s = 0; s < len; s++) {
        var yy = (cy + s) % TILE_H;
        var xx = Math.round(cxp + slope * s + Math.sin(s * 0.3) * 2);
        var el = edge(yy, LEFT_MID, 1, phL), er = edge(yy, RIGHT_MID, -1, phR);
        if (xx > el + 4 && xx < er - 4) cx.fillRect(xx, Math.round(yy), 1, 1);
      }
    }

    // Push the whole wall back into the air between it and the camera.
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = U.rgba(C.COLORS.ink, p.recede);
    cx.fillRect(0, 0, C.W, TILE_H);
    cx.globalCompositeOperation = 'source-over';
    return cv;
  }

  R.build = function () {
    if (tiles) return;
    tiles = [];
    for (var s = 0; s < PAL.length; s++) tiles.push([bake(s, 0), bake(s, 1)]);
  };

  // Which stage's rock we are looking at at a given world row, blended so the
  // palette changes over a few rows rather than switching on one line.
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

  R.TILE_H = TILE_H;
  SITF.RockFace = R;
})();
