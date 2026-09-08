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
        // Wide enough that the summit block can sit to one side of it and
        // still leave a shoulder to climb up: a plateau spanning the whole
        // corridor is a roof over the last ledge under it.
        var s = U.smoothstep(300, 40, yy);
        leftP[i] = U.lerp(leftP[i], 130, s);
        rightP[i] = U.lerp(rightP[i], C.W - 130, s);
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

  // Headroom.
  //
  // A ceiling over a ledge is how a route stops being climbable - silently,
  // with nothing on screen to say why the jump will not go. The first version
  // of this only looked at the ledge you had just left, which caught the
  // obvious case and missed the one that actually bites: the ledge *two*
  // links up, drifting back over your head.
  //
  // Two things keep that check honest, and both of them are about asking for
  // no more room than the climb actually uses.
  //
  // What a ledge needs is not a fixed band: it is its own height plus the rise
  // of the one jump it still has to make from there. And it does not need all
  // of its top clear, only one place to stand a body wide with sky over it,
  // because the body can walk to that place before it jumps. Asking for more
  // than either of those over-constrains a chimney to the point where the
  // generator runs out of options and stacks slabs on top of each other.
  var MAX_CLEAR = C.P_H + 54;      // before the outgoing jump is known
  var STAND_ROOM = C.P_W + 7;      // the standing spot, plus room to be sloppy

  function needFor(rise) { return C.P_H + rise + 8; }

  // The widest run of `p` that still has clear air over it, once the walls
  // and every slab in `list` (plus `extra`, the one being considered) have
  // taken their bites out of it.
  var cuts = [];
  var roomLo = 0, roomHi = 0;    // the widest clear run standRoom just found
  function standRoom(p, list, extra, wantX) {
    var lo = p.x - p.w * 0.5, hi = p.x + p.w * 0.5;
    var i, s;
    // The walls close in over the band, so the ends of the ledge may be
    // roofed by the mountain itself.
    for (var d = 0; d <= p.need; d += 8) {
      var yy = p.y - d;
      lo = Math.max(lo, T.leftAt(yy) + 2);
      hi = Math.min(hi, T.rightAt(yy) - 2);
    }
    roomLo = lo; roomHi = hi;
    if (hi - lo < STAND_ROOM) return 0;

    cuts.length = 0;
    for (i = 0; i <= list.length; i++) {
      s = i < list.length ? list[i] : extra;
      if (!s || s === p) continue;
      if (s.y >= p.y) continue;                      // at or below the surface
      if (s.y + s.h <= p.y - p.need) continue;       // clear over the top
      var a = s.x - s.w * 0.5 - 2, b = s.x + s.w * 0.5 + 2;
      if (b <= lo || a >= hi) continue;
      cuts.push([a, b]);
    }
    cuts.sort(function (m, n) { return m[0] - n[0]; });

    // Sweep left to right and keep the widest gap between bites.
    // The window is where the body can put its middle, so it is the clear
    // run less half a body at each end.
    var half = C.P_W * 0.5;
    var best = 0, cur = lo;
    function keep(a, b) {
      if (wantX !== undefined) {
        // A ledge that has already committed to a take-off spot needs that
        // spot, not some other window at the far end of it: the jump out of
        // here was measured from there.
        if (wantX < a + half || wantX > b - half) return;
        best = b - a; roomLo = a + half; roomHi = b - half;
        return;
      }
      if (b - a > best) { best = b - a; roomLo = a + half; roomHi = b - half; }
    }
    roomLo = roomHi = lo;
    for (i = 0; i < cuts.length; i++) {
      if (cuts[i][0] > cur) keep(cur, Math.min(cuts[i][0], hi));
      if (cuts[i][1] > cur) cur = cuts[i][1];
      if (cur >= hi) return best;
    }
    keep(cur, hi);
    return best;
  }

  function standable(p, list, extra) {
    return standRoom(p, list, extra, p.useX) >= STAND_ROOM;
  }

  // The line of air a jump flies through.
  //
  // Both ends of a jump can be perfectly standable and the jump still not go,
  // because something is hanging in the gap between them. Every route ledge
  // therefore remembers the jump that reached it - where the body left the
  // ledge below and where it came down - and whatever gets built afterwards
  // has to stay out of it.
  //
  // The head climbs as the body crosses: it is low where the body pushed off
  // and at the landing height where it arrives. Treating the whole crossing as
  // if it happened at the landing height condemns perfectly good ledges near
  // the take-off end, so the head is followed along the line instead.
  function pathBlocked(s, seg) {
    if (s === seg) return false;
    if (s.y >= seg.y) return false;                     // at or below the landing
    var a = Math.min(seg.px0, seg.px1), b = Math.max(seg.px0, seg.px1);
    var lo = a - C.P_W * 0.5 - 2, hi = b + C.P_W * 0.5 + 2;
    var sl = s.x - s.w * 0.5 - 2, sr = s.x + s.w * 0.5 + 2;
    if (sr <= lo || sl >= hi) return false;
    var span = Math.max(1, b - a);
    var t0 = U.clamp01((Math.max(sl, lo) - a) / span);
    var t1 = U.clamp01((Math.min(sr, hi) - a) / span);
    if (seg.px1 < seg.px0) { var tt = 1 - t1; t1 = 1 - t0; t0 = tt; }
    var y0 = seg.fromY - C.P_H, y1 = seg.y - C.P_H - 6;
    var head = Math.min(U.lerp(y0, y1, t0), U.lerp(y0, y1, t1));
    return s.y + s.h > head;
  }

  var seg = { px0: 0, px1: 0, fromY: 0, y: 0 };
  function pathClear(x0, x1, fromY, ny, list, extra) {
    seg.px0 = x0; seg.px1 = x1; seg.fromY = fromY; seg.y = ny;
    for (var i = 0; i < list.length; i++) if (pathBlocked(list[i], seg)) return false;
    if (extra && pathBlocked(extra, seg)) return false;
    var lo = Math.min(x0, x1) - C.P_W * 0.5 - 2;
    var hi = Math.max(x0, x1) + C.P_W * 0.5 + 2;
    for (var d = 0; d <= C.P_H + 6; d += 6) {
      if (lo < T.leftAt(ny - d) + 2 || hi > T.rightAt(ny - d) - 2) return false;
    }
    return true;
  }

  function blocksAnyPath(s, ps, also) {
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].px0 !== undefined && pathBlocked(s, ps[i])) return true;
    }
    return also && also.px0 !== undefined ? pathBlocked(s, also) : false;
  }

  // Can a ledge still make the jump it was placed for, once the new slab is in
  // the world? Either the spot it committed to survives, or another window on
  // it does and the jump still measures up from there - in which case the
  // ledge simply moves its feet. Refusing to let it move was correct and
  // unusable: the search stalled, and the stalls cascaded into stacks of slabs
  // nobody could climb.
  function jumpSurvives(p, list, extra, commit) {
    if (standRoom(p, list, extra, p.useX) >= STAND_ROOM) return true;
    if (p.toY === undefined) return false;
    if (standRoom(p, list, extra) < STAND_ROOM) return false;
    var tx2 = U.clamp(p.toX, roomLo, roomHi);
    if (reachable(p.toX - tx2, p.toW) - 12 < p.y - p.toY) return false;
    // Moving the feet lengthens the jump, and the longer line has to be as
    // open as the one it replaces.
    if (!pathClear(tx2, p.toX, p.y, p.toY, list, extra)) return false;
    if (commit) { p.useX = tx2; p.px0 = tx2; }
    return true;
  }

  function standableAll(ps, list, extra, commit) {
    for (var i = 0; i < ps.length; i++) {
      if (!jumpSurvives(ps[i], list, extra, commit)) return false;
    }
    return true;
  }

  // Can a body on one platform get onto another? The same questions the
  // route asks of every other link, in one place, so that the last one - the
  // step onto the summit itself - is not a special case nobody checked.
  function finishes(from, to, list) {
    from.need = needFor(from.y - to.y);
    if (from.y - to.y > 46) return false;
    if (!standable(from, list, null)) return false;
    var tx = U.clamp(to.x, roomLo, roomHi);
    if (!standable(to, list, null)) return false;
    var lx = U.clamp(tx, roomLo, roomHi);
    if (reachable(lx - tx, Math.min(to.w, roomHi - roomLo)) - 12 < from.y - to.y) return false;
    return pathClear(tx, lx, from.y, to.y, list);
  }

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
    var index = 0;

    // The summit goes down first. It is thin, and set hard against the right
    // wall, so the left of the bowl stays open: a plateau spanning the whole
    // corridor would be a roof over the last ledge under it, and the climb
    // would end one jump short of the top with nothing to show why.
    var TOP_W = 200;
    var TOP_X = C.W - 130 - TOP_W * 0.5 + 6;
    var top = addPlatform(TOP_X, summitY, TOP_W, 34, 'floor', 'summit');
    top.path = true;
    top.need = 0;
    top.keep = true;                 // never pruned: it outranks the whole climb
    addFeature('flag', TOP_X - TOP_W * 0.22, summitY, { plat: top.i });

    // Two rolling lists, both pruned as the route climbs away from them.
    //
    //   protect   route ledges whose headroom still has to be honoured
    //   obstacles anything already built that could become somebody's ceiling
    //
    // The last entry of `protect` is the ledge we are jumping from, and its
    // `need` is not settled until we have chosen how far up to go.
    var protect = [];
    var obstacles = [top];
    base.need = MAX_CLEAR;
    var prev = base;

    while (y > summitY + 34) {
      while (protect.length && protect[0].y - protect[0].need > y) protect.shift();
      for (var oi = obstacles.length - 1; oi >= 0; oi--) {
        if (obstacles[oi].y > y + 40 && !obstacles[oi].keep) obstacles.splice(oi, 1);
      }

      index++;
      sinceRest++;
      sinceCairn++;
      var prog = 1 - y / C.WORLD_H;

      var lw = T.leftAt(y - 40), rw = T.rightAt(y - 40);
      var innerL = lw + 28, innerR = rw - 28;
      if (innerR - innerL < 60) { innerL = lw + 14; innerR = rw - 14; }
      var room = Math.max(40, innerR - innerL);

      // Drift back and forth rather than climbing a ladder: the route should
      // read as a traverse.
      if (rng() < 0.24) side = -side;

      // Every eleventh link or so, a wide safe shelf. It is where the cairns
      // go and where the pacing lets go for a second.
      var shelf = (sinceCairn >= 11 && rng() < 0.6);

      // A narrow corridor gets narrow ledges. Three consecutive links have to
      // sit beside each other without any one of them roofing the others, and
      // in a chimney that is only possible if they are small.
      var w = shelf
        ? Math.round(Math.min(U.lerp(84, 120, rng()), Math.max(50, room * 0.52)))
        : Math.round(Math.min(U.lerp(38, 78, rng() * rng()), Math.max(28, room * 0.38)));
      var h = shelf ? 14 : Math.round(U.lerp(9, 15, rng()));

      var gain = U.lerp(26, 36, rng());
      if (!shelf && rng() < 0.10 + prog * 0.12) gain = U.lerp(38, 44, rng());

      // Where it goes. The first offer is a comfortable step to side; if that
      // spot is roofed, or would roof what we just left, the offer walks
      // outward and then to the other side until something is clear. This
      // loop is the whole safety net: a ledge placed under a ceiling is a
      // link nobody can climb.
      var wantMag = (0.35 + rng() * 0.65) * Math.min(74, room * 0.55);

      var placed = null, tries, s, nx, g, ny, dir, slab, k;
      // Three things can give when nothing fits, in the order that costs the
      // climb least: a smaller rise, then a narrower slab, then the far side
      // of the corridor. A short hop is always jumpable; a long one is not.
      var gains = [gain, gain * 0.84, gain * 0.68, 22, 16];
      var widths = [w];
      if (!shelf) {
        if (w > 52) widths.push(50);
        if (w > 36) widths.push(34);
        widths.push(28);
      } else {
        widths.push(Math.max(56, w * 0.7), 44);
      }

      for (k = 0; k < widths.length && !placed; k++) {
        var ww = Math.round(widths[k]);
        var loL = innerL + ww * 0.5, loR = innerR - ww * 0.5;
        if (loR < loL) { loL = loR = (innerL + innerR) * 0.5; }
        for (var gi = 0; gi < gains.length && !placed; gi++) {
          for (tries = 0; tries < 44 && !placed; tries++) {
            for (s = 0; s < 2 && !placed; s++) {
              dir = s === 0 ? side : -side;
              nx = U.clamp(x + dir * (wantMag + tries * 6), loL, loR);
              g = U.clamp(gains[gi], 14, 52);
              ny = Math.round((y - g) / C.CELL) * C.CELL;
              if (ny >= y) continue;
              slab = { x: nx, y: ny, w: ww, h: h, need: MAX_CLEAR };

              // Does the ledge we are leaving still have somewhere to stand?
              prev.need = needFor(y - ny);
              if (!standable(prev, obstacles, slab)) continue;
              // The jump is measured from that standing spot, not from the
              // middle of a ledge the body may not be able to use.
              var tx = U.clamp(nx, roomLo, roomHi);

              // And does anything older run out of room?
              if (!standableAll(protect, obstacles, slab)) continue;
              // Where on the new slab can the body actually come down?
              if (!standable(slab, obstacles, null)) continue;
              var lx = U.clamp(tx, roomLo, roomHi);
              if (reachable(lx - tx, Math.min(ww, roomHi - roomLo)) - 12 < y - ny) continue;
              if (!pathClear(tx, lx, y, ny, obstacles)) continue;
              if (blocksAnyPath(slab, protect, prev)) continue;
              placed = { x: nx, y: ny, w: ww, dir: dir, px0: tx, px1: lx, fromY: y, slab: slab };
            }
          }
        }
      }
      // Nothing was clear anywhere across the corridor. A short straight step
      // off to one side is the least bad thing left; the next link will route
      // around whatever is in the way.
      if (!placed) {
        nx = U.clamp(x + side * Math.min(60, room * 0.4), innerL + 14, innerR - 14);
        placed = { x: nx, y: Math.round((y - 18) / C.CELL) * C.CELL, w: 28, dir: side };
      }

      w = placed.w;
      prev.need = needFor(y - placed.y);
      prev.useX = placed.px0;
      prev.toX = placed.px1;
      prev.toY = placed.y;
      prev.toW = placed.w;
      // Any older ledge that has to shuffle sideways for this one now does.
      standableAll(protect, obstacles, placed.slab, true);
      protect.push(prev);
      x = placed.x;
      y = placed.y;
      side = placed.dir;
      // If we ran into a wall, bounce off it next time.
      if (x <= innerL + 2 || x >= innerR - 2) side = -side;

      if (shelf) {
        sinceCairn = 0; sinceRest = 0;
        var rest = addPlatform(x, y, w, h, 'shelf', 'rest');
        rest.px0 = placed.px0; rest.px1 = placed.px1; rest.fromY = placed.fromY;
        rest.path = true;
        rest.need = MAX_CLEAR;
        obstacles.push(rest);
        prev = rest;
        addFeature('cairn', rest.x + U.lerp(-w * 0.28, w * 0.28, rng()), rest.y,
                   { plat: rest.i, lit: false });
        continue;
      }

      var kind = 'ledge';
      // A crumbling ledge gives out a beat after you land on it. Rare low
      // down, common near the top.
      if (prog > 0.16 && rng() < 0.06 + prog * 0.16 && sinceRest > 2) kind = 'brittle';
      // An ice ledge is slick: you keep your momentum across it.
      if (prog > 0.30 && kind === 'ledge' && rng() < 0.12) kind = 'ice';

      var p = addPlatform(x, y, w, h, kind);
      p.path = true;
      p.px0 = placed.px0; p.px1 = placed.px1; p.fromY = placed.fromY;
      p.need = MAX_CLEAR;
      obstacles.push(p);
      prev = p;

      // Hazards bolted to the terrain.
      if (prog > 0.05 && rng() < 0.16 + prog * 0.14) {
        addFeature('icicle', p.x + U.lerp(-w * 0.35, w * 0.35, rng()), p.y + h,
                   { size: rng() < 0.4 ? 2 : (rng() < 0.5 ? 1 : 0), plat: p.i });
      }
      if (prog > 0.12 && rng() < 0.05 + prog * 0.10) {
        // Seracs hang off the wall, not off the route, so they threaten the
        // corridor you are about to cross.
        var sx = rng() < 0.5 ? lw + 26 : rw - 26;
        addFeature('serac', sx, p.y - U.lerp(60, 130, rng()), { variant: rng() < 0.5 ? 0 : 1 });
      }

      // A side ledge, further out and usually up, with something on it. A
      // prize is not worth a ceiling: if it would hang over the route it
      // simply does not get built.
      if (rng() < 0.30) {
        var sSide = p.x < (lw + rw) / 2 ? 1 : -1;
        var sw = Math.round(U.lerp(26, 44, rng()));
        var sx2 = U.clamp(p.x + sSide * U.lerp(90, 150, rng()), lw + 22, rw - 22);
        var sy2 = Math.round((p.y - U.lerp(-16, 46, rng())) / C.CELL) * C.CELL;
        var side1 = { x: sx2, y: sy2, w: sw, h: 10, need: 0 };
        if (standableAll(protect, obstacles, side1) && standable(p, obstacles, side1) &&
            !blocksAnyPath(side1, protect, p)) {
          var sp = addPlatform(sx2, sy2, sw, 10, 'ledge', 'side');
          obstacles.push(sp);
          if (rng() < 0.62) addFeature('crystal', sp.x, sp.y - 12, { plat: sp.i });
          // A driveable anchor above the gap: the axe has somewhere to bite.
          if (rng() < 0.5) {
            addFeature('anchor', (p.x + sp.x) / 2,
                       Math.min(p.y, sp.y) - U.lerp(26, 54, rng()), {});
          }
        }
      }

      // Freestanding pillars break up the middle of a wide corridor.
      if (rng() < 0.10 && rw - lw > 300) {
        var px = U.lerp(lw + 60, rw - 60, rng());
        var pw = Math.round(U.lerp(18, 30, rng()));
        var py = Math.round((p.y - U.lerp(10, 30, rng())) / C.CELL) * C.CELL;
        var col = { x: px, y: py, w: pw, h: 46, need: 0 };
        if (standableAll(protect, obstacles, col) && standable(p, obstacles, col) &&
            !blocksAnyPath(col, protect, p)) {
          obstacles.push(addPlatform(px, py, pw, 46, 'pillar'));
        }
      }
    }

    // The final move onto the summit, checked like every other one. The
    // chain climbs the shoulder beside the block; this is the step across
    // onto its lip, and if the chain finished somewhere that cannot make it,
    // one more foothold is searched for rather than assumed.
    top.need = 0;
    if (!finishes(prev, top, obstacles)) {
      for (var fy = summitY + 26; fy <= summitY + 46 && !finishes(prev, top, obstacles); fy += 4) {
        for (var fx = 152; fx <= 300; fx += 6) {
          var bridge = { x: fx, y: fy, w: 34, h: 10, need: MAX_CLEAR };
          if (!standable(bridge, obstacles, null)) continue;
          if (!standable(prev, obstacles, bridge)) continue;
          if (!standableAll(protect, obstacles, bridge)) continue;
          if (blocksAnyPath(bridge, protect, prev)) continue;
          if (!finishes(prev, bridge, obstacles)) continue;
          var bp = addPlatform(fx, fy, 34, 10, 'ledge');
          bp.path = true;
          bp.need = MAX_CLEAR;
          bp.px0 = U.clamp(fx, roomLo, roomHi); bp.px1 = fx; bp.fromY = prev.y;
          obstacles.push(bp);
          prev = bp;
          break;
        }
      }
    }
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
    if (IF.Scene && IF.Scene.resetDressing) IF.Scene.resetDressing();
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
