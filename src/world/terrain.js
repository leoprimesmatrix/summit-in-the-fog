// The mountain: its shape, its route, and what is bolted to it.
//
// Generated once from a fixed seed, so the climb is a place rather than a
// shuffle, and a best time is comparable. Two things come out of here:
//
//   the silhouette   left and right wall profiles sampled every few pixels,
//                    which frame the face and give you something to wall-jump
//   the route        a chain of ledges from the boulder field to the summit,
//                    each one placed inside jumping range of the last, with
//                    optional side ledges hung off it for the greedy
//
// Nothing here draws. Chunk baking asks this file to rasterise a band into a
// mask; collision asks it whether a cell is stone.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var T = {};

  var STEP = 4;                    // silhouette sample spacing
  var samples = 0;
  var leftP = null, rightP = null;

  var platforms = [];              // {x,y,w,h,kind,tag}
  var byChunk = [];                // platform indices per chunk
  var features = [];               // cairns, crystals, seracs, icicles, anchors
  var featByChunk = [];
  var nChunks = 0;

  var startY = 0, summitY = 0;

  T.platforms = platforms;
  T.features = features;

  // --- silhouette ----------------------------------------------------------

  T.leftAt = function (y) {
    var i = U.clamp(y / STEP, 0, samples - 1);
    var i0 = i | 0, f = i - i0;
    var i1 = Math.min(samples - 1, i0 + 1);
    return leftP[i0] + (leftP[i1] - leftP[i0]) * f;
  };

  T.rightAt = function (y) {
    var i = U.clamp(y / STEP, 0, samples - 1);
    var i0 = i | 0, f = i - i0;
    var i1 = Math.min(samples - 1, i0 + 1);
    return rightP[i0] + (rightP[i1] - rightP[i0]) * f;
  };

  T.startY = function () { return startY; };
  T.summitY = function () { return summitY; };
  T.chunkCount = function () { return nChunks; };

  // --- generation ----------------------------------------------------------

  function buildProfile(seed) {
    samples = Math.ceil(C.WORLD_H / STEP) + 2;
    leftP = new Float32Array(samples);
    rightP = new Float32Array(samples);

    for (var i = 0; i < samples; i++) {
      var y = i * STEP;
      var prog = 1 - y / C.WORLD_H;

      // How wide the corridor is here. Slow noise, so the face breathes open
      // into slabs and pinches back into chimneys over hundreds of pixels.
      var open = U.fbm1(y * 0.0016, 3, seed + 11);
      // The mountain narrows as you climb: near the summit you are on a
      // ridge, not in a gully.
      var narrow = U.smoothstep(0.68, 1.0, prog);
      var span = U.lerp(U.lerp(96, 250, open), 300, narrow);

      // Each wall wanders on its own, so the corridor is rarely symmetric.
      var lw = U.fbm1(y * 0.0052 + 130, 4, seed + 41);
      var rw = U.fbm1(y * 0.0049 + 770, 4, seed + 97);
      var detail = U.fbm1(y * 0.031, 3, seed + 305) - 0.5;
      var detailR = U.fbm1(y * 0.029 + 400, 3, seed + 611) - 0.5;

      var l = span * (0.35 + lw * 0.65) + detail * 22;
      var r = span * (0.35 + rw * 0.65) + detailR * 22;

      // Ledges cut back into the wall: sharp, occasional bites that give the
      // silhouette corners rather than an endless smooth wobble.
      var bite = U.fbm1(y * 0.011 + 50, 2, seed + 707);
      if (bite > 0.74) l += (bite - 0.74) * 130;
      var biteR = U.fbm1(y * 0.010 + 900, 2, seed + 733);
      if (biteR > 0.74) r += (biteR - 0.74) * 130;

      l = U.clamp(l, 6, 250);
      r = U.clamp(r, 6, 250);
      // Never let the corridor close: 190px is two comfortable jumps wide.
      var gap = C.W - l - r;
      if (gap < 190) {
        var pull = (190 - gap) * 0.5;
        l -= pull; r -= pull;
        l = Math.max(0, l); r = Math.max(0, r);
      }
      leftP[i] = l;
      rightP[i] = C.W - r;
    }

    // The base opens out into a wide boulder field, and the summit closes to
    // a point, so the two ends of the climb read as arrival and departure.
    for (i = 0; i < samples; i++) {
      var yy = i * STEP;
      if (yy > C.WORLD_H - 300) {
        // The boulder field is wide, but never so wide that the walls leave
        // frame: the face has to be the picture even in the first second.
        var t = U.smoothstep(C.WORLD_H - 300, C.WORLD_H - 40, yy);
        leftP[i] = U.lerp(leftP[i], 52, t);
        rightP[i] = U.lerp(rightP[i], C.W - 52, t);
      }
      if (yy < 300) {
        var s = U.smoothstep(300, 40, yy);
        leftP[i] = U.lerp(leftP[i], 232, s);
        rightP[i] = U.lerp(rightP[i], C.W - 232, s);
      }
    }
  }

  function addPlatform(x, y, w, h, kind, tag) {
    var p = {
      // Snapping the top surface to the collision grid is what makes a
      // landing land exactly where the pixels say it should.
      x: Math.round(x), y: Math.round(y / C.CELL) * C.CELL, w: w, h: h,
      kind: kind || 'ledge', tag: tag || null,
      i: platforms.length
    };
    platforms.push(p);
    return p;
  }

  function addFeature(type, x, y, data) {
    var f = { type: type, x: x, y: y, i: features.length };
    if (data) for (var k in data) if (data.hasOwnProperty(k)) f[k] = data[k];
    features.push(f);
    return f;
  }

  // How high a plain jump still reaches after travelling `dx` sideways.
  //
  // A jump is a parabola, so horizontal distance is bought with height: from
  // directly underneath you clear fifty pixels, and eighty pixels across you
  // clear almost nothing. Landing anywhere on the ledge counts, so its width
  // pays for part of the crossing. The generator is held to this, which is
  // why every step on the route can be made without the axe.
  function reachable(dx, w) {
    var d = Math.max(0, Math.abs(dx) - (w || 40) * 0.34);
    var t = d / C.RUN_SPEED;
    var tApex = C.JUMP_V / C.GRAVITY;
    // Inside the apex you have time to spare and get the full height; past
    // it, every extra pixel across costs height off the falling side.
    if (t <= tApex) t = tApex;
    return C.JUMP_V * t - 0.5 * C.GRAVITY * t * t;
  }
  T.reachable = reachable;

  // The route. A single chain climbs the mountain; everything else hangs off
  // it. Each link is placed inside a plain jump of the last, because a run
  // that can only be completed with the axe is a run that can be lost to a
  // mechanic rather than to a mistake.
  function buildRoute(seed) {
    var rng = U.rng(seed * 31 + 7);

    startY = C.WORLD_H - 150;
    summitY = 120;

    // The boulder field: one wide, flat, safe start. Its snapped top is
    // the authoritative start height, so the climber spawns exactly on it.
    // Everything below the start line is solid: the boulder field is ground
    // you stand on, not a ledge you can walk off the side of.
    var base = addPlatform(C.W / 2, startY, C.W, C.WORLD_H - startY + 20, 'floor', 'start');
    base.path = true;
    startY = base.y;

    var x = C.W / 2;
    var y = startY;
    var side = rng() < 0.5 ? -1 : 1;
    var sinceCairn = 0;
    var sinceRest = 0;
    var prevW = C.W;          // the boulder field is the whole width
    var index = 0;

    while (y > summitY + 120) {
      index++;
      var prog = 1 - y / C.WORLD_H;

      var lw = T.leftAt(y - 40), rw = T.rightAt(y - 40);
      var innerL = lw + 28, innerR = rw - 28;
      if (innerR - innerL < 60) { innerL = lw + 14; innerR = rw - 14; }

      // Sideways first, because how far across the next ledge is decides how
      // far up it can be. Drift back and forth rather than climbing a ladder:
      // the route should read as a traverse.
      if (rng() < 0.24) side = -side;
      var span = Math.min(74, (innerR - innerL) * 0.55);
      var dx = (0.35 + rng() * 0.65) * span * side;
      var nx = U.clamp(x + dx, innerL, innerR);
      dx = nx - x;

      var w = Math.round(U.lerp(38, 78, rng() * rng()));
      var h = Math.round(U.lerp(9, 15, rng()));

      // Headroom. A ledge sitting directly over the one you are standing on
      // is a ceiling: you cannot jump at all, and the route dead-ends with no
      // way to see why. Step out from underneath first - which costs almost
      // nothing, because a jump has spare height inside its apex - and only
      // reach for extra clearance if the corridor is too narrow to step.
      var sep = (prevW + w) * 0.5 + 8;
      if (Math.abs(dx) < sep) {
        var out = side >= 0 ? sep : -sep;
        var tryX = U.clamp(x + out, innerL, innerR);
        if (Math.abs(tryX - x) < sep - 2) {
          out = -out;
          tryX = U.clamp(x + out, innerL, innerR);
        }
        if (Math.abs(tryX - x) >= sep - 2) { nx = tryX; dx = nx - x; }
      }

      // Now the height, capped by what a jump can actually do from here.
      // Landing anywhere on the ledge counts, so the width buys some reach.
      var gain = U.lerp(26, 36, rng());
      var big = rng() < 0.10 + prog * 0.12;
      if (big) gain = U.lerp(38, 46, rng());
      // The margin is generous on purpose. The ballistic figure is the best
      // case: perfectly timed, at full running speed, from the exact lip. A
      // route tuned to the best case is a route nobody can climb.
      var reach = reachable(dx, w) - 10;

      // Still overlapping? Then the gap itself has to clear a standing body.
      if (Math.abs(dx) < sep) {
        var need = h + C.P_H + 9;
        if (need > reach) { h = Math.max(5, Math.round(reach - C.P_H - 9)); need = h + C.P_H + 9; }
        gain = Math.max(gain, need);
      }
      gain = Math.max(14, Math.min(gain, reach));

      y -= gain;
      x = nx;
      prevW = w;
      // If we ran into a wall, bounce off it next time.
      if (x <= innerL + 2 || x >= innerR - 2) side = -side;

      sinceRest++;
      sinceCairn++;

      var kind = 'ledge';
      // A crumbling ledge gives out a beat after you land on it. Rare low
      // down, common near the top.
      if (prog > 0.16 && rng() < 0.06 + prog * 0.16 && sinceRest > 2) kind = 'brittle';
      // An ice ledge is slick: you keep your momentum across it.
      if (prog > 0.30 && kind === 'ledge' && rng() < 0.12) kind = 'ice';

      // Every eleventh link or so, a wide safe shelf. It is where the cairns
      // go and where the pacing lets go for a second.
      if (sinceCairn >= 11 && rng() < 0.6) {
        w = Math.round(U.lerp(84, 120, rng()));
        h = 14; kind = 'shelf';
        sinceCairn = 0; sinceRest = 0;
        x = U.clamp(x, innerL + w / 2 - 20, innerR - w / 2 + 20);
        prevW = w;
        var shelf = addPlatform(x, y, w, h, kind, 'rest');
        shelf.path = true;
        addFeature('cairn', x + U.lerp(-w * 0.28, w * 0.28, rng()), y, { plat: shelf.i, lit: false });
        continue;
      }

      var p = addPlatform(x, y, w, h, kind);
      p.path = true;

      // Hazards bolted to the terrain.
      if (prog > 0.05 && rng() < 0.16 + prog * 0.14) {
        addFeature('icicle', x + U.lerp(-w * 0.35, w * 0.35, rng()), y + h,
                   { size: rng() < 0.4 ? 2 : (rng() < 0.5 ? 1 : 0), plat: p.i });
      }
      if (prog > 0.12 && rng() < 0.05 + prog * 0.10) {
        // Seracs hang off the wall, not off the route, so they threaten the
        // corridor you are about to cross.
        var sx = rng() < 0.5 ? lw + 26 : rw - 26;
        addFeature('serac', sx, y - U.lerp(60, 130, rng()), { variant: rng() < 0.5 ? 0 : 1 });
      }

      // A side ledge, further out and usually up, with something on it.
      if (rng() < 0.30) {
        var sSide = x < (lw + rw) / 2 ? 1 : -1;
        var sx2 = U.clamp(x + sSide * U.lerp(90, 150, rng()), lw + 22, rw - 22);
        var sy2 = y - U.lerp(-16, 46, rng());
        var sp = addPlatform(sx2, sy2, Math.round(U.lerp(26, 44, rng())), 10, 'ledge', 'side');
        if (rng() < 0.62) addFeature('crystal', sx2, sy2 - 12, { plat: sp.i });
        // A driveable anchor above the gap: the axe has somewhere to bite.
        if (rng() < 0.5) addFeature('anchor', (x + sx2) / 2, Math.min(y, sy2) - U.lerp(26, 54, rng()), {});
      }

      // Freestanding pillars break up the middle of a wide corridor.
      if (rng() < 0.10 && rw - lw > 300) {
        addPlatform(U.lerp(lw + 60, rw - 60, rng()), y - U.lerp(10, 30, rng()),
                    Math.round(U.lerp(18, 30, rng())), 46, 'pillar');
      }
    }

    // The last few metres. Stepped down from wherever the chain finished and
    // funnelled toward the centre, so the final move onto the summit is a
    // step you cannot miss rather than the one jump in the game you cannot
    // make.
    while (y > summitY + 44) {
      var gap = Math.min(30, y - (summitY + 40));
      y -= gap;
      x = U.clamp(x + (rng() - 0.5) * 72, 250, C.W - 250);
      addPlatform(x, y, 82, 10, 'ledge').path = true;
    }

    // The summit: a plateau, a cairn and the flag.
    var top = addPlatform(C.W / 2, summitY, 240, 60, 'floor', 'summit');
    top.path = true;
    addFeature('flag', C.W / 2, summitY, { plat: top.i });

    platforms.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < platforms.length; i++) platforms[i].i = i;
  }

  function index() {
    nChunks = Math.ceil(C.WORLD_H / C.CHUNK_H) + 1;
    byChunk = new Array(nChunks);
    featByChunk = new Array(nChunks);
    var i, k;
    for (i = 0; i < nChunks; i++) { byChunk[i] = []; featByChunk[i] = []; }

    for (i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      // A slab can straddle a boundary; register it with every chunk it
      // touches, plus one either side so overhangs bake into the neighbour.
      var c0 = Math.max(0, Math.floor((p.y - 40) / C.CHUNK_H));
      var c1 = Math.min(nChunks - 1, Math.floor((p.y + p.h + 60) / C.CHUNK_H));
      for (k = c0; k <= c1; k++) byChunk[k].push(i);
    }
    for (i = 0; i < features.length; i++) {
      var f = features[i];
      var fc = U.clamp(Math.floor(f.y / C.CHUNK_H), 0, nChunks - 1);
      featByChunk[fc].push(i);
    }
  }

  T.generate = function (seed) {
    platforms.length = 0;
    features.length = 0;
    T.platforms = platforms;
    T.features = features;
    buildProfile(seed);
    buildRoute(seed);
    index();
    return T;
  };

  T.platformsIn = function (ci) { return byChunk[ci] || []; };
  T.featuresIn = function (ci) { return featByChunk[ci] || []; };

  T.featuresBetween = function (y0, y1) {
    var c0 = U.clamp(Math.floor(y0 / C.CHUNK_H) - 1, 0, nChunks - 1);
    var c1 = U.clamp(Math.floor(y1 / C.CHUNK_H) + 1, 0, nChunks - 1);
    var out = [];
    for (var c = c0; c <= c1; c++) {
      var list = featByChunk[c];
      for (var i = 0; i < list.length; i++) {
        var f = features[list[i]];
        if (f.y >= y0 - 80 && f.y <= y1 + 80) out.push(f);
      }
    }
    return out;
  };

  T.platformsBetween = function (y0, y1) {
    var c0 = U.clamp(Math.floor(y0 / C.CHUNK_H) - 1, 0, nChunks - 1);
    var c1 = U.clamp(Math.floor(y1 / C.CHUNK_H) + 1, 0, nChunks - 1);
    var out = [], seen = {};
    for (var c = c0; c <= c1; c++) {
      var list = byChunk[c];
      for (var i = 0; i < list.length; i++) {
        var pi = list[i];
        if (seen[pi]) continue;
        seen[pi] = 1;
        var p = platforms[pi];
        if (p.y + p.h >= y0 - 60 && p.y <= y1 + 60) out.push(p);
      }
    }
    return out;
  };

  // The half-width of a slab at a given depth below its top surface. Slabs
  // taper, so a ledge reads as something growing out of the wall rather than
  // a floating brick.
  T.slabHalf = function (p, depth) {
    if (depth < 0) return 0;
    var t = U.clamp01(depth / p.h);
    if (p.kind === 'floor') return p.w * 0.5;
    if (p.kind === 'pillar') return p.w * 0.5 * (1 - t * 0.18);
    if (p.kind === 'shelf' || p.kind === 'ground') return p.w * 0.5 * (1 - Math.pow(t, 2.4) * 0.20);
    return p.w * 0.5 * (1 - Math.pow(t, 1.4) * 0.34);
  };

  // Rasterise one band of the mountain into a byte mask, 1 where there is
  // stone. Walls are filled by row and slabs by row, so cost is proportional
  // to painted pixels rather than to platform count.
  T.rasterize = function (mask, w, h, yTop) {
    var x, y, i;
    mask.fill(0);

    for (y = 0; y < h; y++) {
      var wy = yTop + y;
      var l = Math.round(T.leftAt(wy));
      var r = Math.round(T.rightAt(wy));
      var row = y * w;
      if (l > 0) for (x = 0; x < l && x < w; x++) mask[row + x] = 1;
      if (r < w) for (x = Math.max(0, r); x < w; x++) mask[row + x] = 1;
    }

    var ci = Math.floor(yTop / C.CHUNK_H);
    var list = byChunk[U.clamp(ci, 0, nChunks - 1)] || [];
    for (i = 0; i < list.length; i++) {
      var p = platforms[list[i]];
      // Anything that can give way is not baked into the wall: it lives as
      // an entity so it can actually collapse.
      if (p.kind === 'brittle') continue;
      var y0 = Math.round(p.y) - yTop;
      var y1 = Math.round(p.y + p.h) - yTop;
      for (y = Math.max(0, y0); y < Math.min(h, y1); y++) {
        var half = T.slabHalf(p, y + yTop - p.y);
        var xa = Math.max(0, Math.round(p.x - half));
        var xb = Math.min(w, Math.round(p.x + half));
        var r2 = y * w;
        for (x = xa; x < xb; x++) mask[r2 + x] = 1;
      }
    }
    return mask;
  };

  IF.Terrain = T;
})();
