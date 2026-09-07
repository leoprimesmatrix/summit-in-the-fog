(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The mountain itself.
  //
  // Not a grid of lanes with a picture behind it: a solid mass with a shape.
  // For every 4 px of height the face knows where its rock begins and ends -
  // one interval usually, two where a chimney splits it - and that silhouette
  // is what you climb, what the renderer cuts its rock out of, and what the
  // fog drifts across. It narrows to an arete with sky down both sides,
  // opens into a slab, cuts back under a roof, splits into a chimney.
  //
  // World y is 0 at base camp and negative going up; the summit is at
  // -C.WORLD_H. Everything here is deterministic from a seed.

  var Face = {};

  var STEP = C.PROFILE_STEP;          // 4
  var X_MIN = 8, X_MAX = 568;
  var MAX_HW = (X_MAX - X_MIN) / 2;   // 280

  // Which features each stage is built from, and how tall each one runs.
  // Every stage opens on a rest shelf, which is also what keeps the first
  // stretch of a new stage free of traps later on.
  var STAGE_MENU = [
    { first: 'ledges',
      pool: [['slab', 0.5], ['crack', 0.3], ['ledges', 0.2]],
      h: { ledges: [120, 180], slab: [200, 300], crack: [160, 240] } },
    { first: 'ledges',
      pool: [['slab', 0.3], ['crack', 0.3], ['ledges', 0.2], ['arete', 0.2]],
      h: { ledges: [120, 180], slab: [200, 300], crack: [160, 240], arete: [200, 280] } },
    { first: 'ledges',
      pool: [['snow', 0.35], ['chimney', 0.25], ['crack', 0.15], ['ledges', 0.15], ['slab', 0.1]],
      h: { ledges: [120, 180], slab: [200, 300], crack: [160, 240], snow: [220, 360], chimney: [200, 280] } },
    { first: 'ledges',
      pool: [['arete', 0.35], ['ice', 0.2], ['crack', 0.15], ['chimney', 0.15], ['ledges', 0.15]],
      h: { ledges: [120, 180], crack: [160, 240], arete: [200, 280], chimney: [200, 280], ice: [90, 140] } },
    { first: 'ledges', last: 'summit',
      pool: [['overhang', 0.25], ['ice', 0.2], ['snow', 0.2], ['arete', 0.2], ['ledges', 0.15]],
      h: { ledges: [120, 180], snow: [220, 360], arete: [200, 280], ice: [90, 140],
           overhang: [120, 170], summit: [160, 160] } }
  ];

  // --- deterministic noise -------------------------------------------------

  function hash1(i, seed) {
    var n = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 1013904223);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }

  function vnoise1(y, cell, seed) {
    var g = y / cell, i = Math.floor(g), f = g - i;
    f = f * f * (3 - 2 * f);
    return hash1(i, seed) * (1 - f) + hash1(i + 1, seed) * f;
  }

  // Edge wobble. Three sine harmonics plus a slice of value noise, so no
  // edge on the mountain is ever a straight vertical and nothing about it
  // repeats. The phases are global to the whole face, not per segment: a
  // wobble that restarted at every feature join would put a visible step
  // across the silhouette at every one of them.
  var W_PH = null;
  function buildPhases(seed) {
    var r = U.mulberry32(seed ^ 0x51de);
    W_PH = [];
    for (var k = 0; k < 4; k++) {
      W_PH.push({ a: r() * 6.283, b: r() * 6.283, c: r() * 6.283, n: (r() * 1e9) | 0 });
    }
  }

  function wobble(y, ch, amp) {
    var p = W_PH[ch];
    return amp * (0.55 * Math.sin(y * 0.031 + p.a)
                + 0.30 * Math.sin(y * 0.077 + p.b)
                + 0.15 * Math.sin(y * 0.190 + p.c))
         + (vnoise1(y, 24, p.n) - 0.5) * amp * 0.6;
  }

  // --- planning ------------------------------------------------------------

  function drawKind(rng, pool, lastKind) {
    for (var tries = 0; tries < 16; tries++) {
      var total = 0, i;
      for (i = 0; i < pool.length; i++) total += pool[i][1];
      var r = rng() * total, k = pool[pool.length - 1][0];
      for (i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { k = pool[i][0]; break; } }
      if (k === lastKind) continue;
      if (k === 'ice' && (lastKind === 'ice' || lastKind === 'overhang')) continue;
      // A roof has to start from somewhere you can stand and set up.
      if (k === 'overhang' && !(lastKind === 'ledges' || lastKind === 'snow' || lastKind === 'crack')) continue;
      return k;
    }
    return 'ledges';
  }

  function planStage(rng, stage, total) {
    var menu = STAGE_MENU[stage];
    var segs = [];
    function hOf(kind) {
      var r = menu.h[kind] || [180, 240];
      return Math.round(r[0] + rng() * (r[1] - r[0]));
    }
    var tailKind = menu.last || null;
    var tailH = tailKind ? hOf(tailKind) : 0;
    var budget = total - tailH;

    var h0 = Math.min(hOf(menu.first), budget);
    segs.push({ kind: menu.first, h: h0 });
    var used = h0, lastKind = menu.first;

    var minH = 1e9;
    for (var k in menu.h) if (k !== tailKind) minH = Math.min(minH, menu.h[k][0]);

    while (budget - used >= minH) {
      var kind = drawKind(rng, menu.pool, lastKind);
      var h = Math.min(hOf(kind), budget - used);
      segs.push({ kind: kind, h: h });
      used += h;
      lastKind = kind;
    }

    var rem = budget - used;
    if (rem > 0) {
      var last = segs[segs.length - 1];
      if (rem <= last.h * 0.4) last.h += rem;
      else segs.push({ kind: 'ledges', h: rem });
    }
    if (tailKind) segs.push({ kind: tailKind, h: tailH });
    return segs;
  }

  // --- silhouette keyframes ------------------------------------------------

  function targets(rng, kind, cx, hw) {
    switch (kind) {
      case 'ledges':   return { hw: 200 + rng() * 48, cx: 288 + (rng() - 0.5) * 40 };
      case 'slab':     return { hw: 200 + rng() * 48, cx: 288 + (rng() - 0.5) * 60 };
      case 'crack':    return { hw: 130 + rng() * 50, cx: cx + (rng() - 0.5) * 80 };
      case 'arete':    return { hw: 40 + rng() * 30,  cx: cx + (rng() - 0.5) * 120 };
      case 'chimney':  return { hw: 150 + rng() * 50, cx: 288 + (rng() - 0.5) * 40 };
      case 'overhang': return { hw: hw, cx: cx };
      case 'snow':     return { hw: 220 + rng() * 40, cx: 288 };
      case 'ice':      return { hw: hw + (rng() - 0.5) * 20, cx: cx + (rng() - 0.5) * 20 };
      case 'summit':   return { hw: 14, cx: 288 };
    }
    return { hw: hw, cx: cx };
  }

  // Keep the whole width on screen: a wide face has to sit near the middle.
  function fitCx(cx, hw) {
    var lo = X_MIN + hw, hi = X_MAX - hw;
    if (lo > hi) return 288;
    return U.clamp(cx, lo, hi);
  }

  function catmull(kf, d) {
    var n = kf.length;
    if (n === 1) return kf[0].v;
    var i = 0;
    while (i < n - 2 && d > kf[i + 1].d) i++;
    var p0 = kf[Math.max(0, i - 1)], p1 = kf[i], p2 = kf[i + 1], p3 = kf[Math.min(n - 1, i + 2)];
    var span = p2.d - p1.d;
    var t = span > 0 ? U.clamp((d - p1.d) / span, 0, 1) : 0;
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1.v)
      + (-p0.v + p2.v) * t
      + (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2
      + (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3);
  }

  // Keyframes run in "depth from the segment's bottom", so they only ever
  // increase. Each segment starts on the previous one's last values, which
  // is what makes the silhouette continuous across a feature change.
  function buildKeyframes(rng, segs) {
    var cx = 288, hw = 224;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.kind === 'summit') hw = Math.min(hw, 120);
      s.cx = [{ d: 0, v: cx }];
      s.halfW = [{ d: 0, v: hw }];
      var t = targets(rng, s.kind, cx, hw);
      var n = Math.max(1, Math.round(s.h / 60));
      var entryCx = cx, entryHw = hw;
      for (var j = 1; j <= n; j++) {
        var u = j / n;
        var e = U.smoothstep(0, 1, u);
        var vh = U.clamp(U.lerp(entryHw, t.hw, e) + (rng() - 0.5) * 6, 14, MAX_HW);
        var vc = fitCx(U.lerp(entryCx, t.cx, e) + (rng() - 0.5) * 6, vh);
        s.halfW.push({ d: s.h * u, v: vh });
        s.cx.push({ d: s.h * u, v: vc });
        hw = vh; cx = vc;
      }
      if (s.kind === 'chimney') s.slot = { w: 44 + rng() * 26 };
      if (s.kind === 'overhang') {
        s.lip = {
          d: s.h * (0.55 + rng() * 0.10),      // depth from the segment bottom
          side: rng() < 0.5 ? -1 : 1,
          depth: 40 + rng() * 50
        };
      }
      s.exposed = (s.kind === 'arete' || s.kind === 'summit');
      s.sheltered = (s.kind === 'chimney');
      s.fast = (s.kind === 'snow');
    }
  }

  // --- sampling ------------------------------------------------------------

  var profile = null, segments = null, N = 0;

  function segmentAt(y) {
    var lo = 0, hi = segments.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (y < segments[mid].y1) lo = mid + 1; else hi = mid;
    }
    return segments[lo];
  }

  function sampleProfile() {
    N = Math.floor(C.WORLD_H / STEP) + 1;
    profile = new Int16Array(N * 4);
    for (var i = 0; i < N; i++) {
      var y = -i * STEP;
      var s = segmentAt(y);
      var d = s.y0 - y;
      var cx = catmull(s.cx, d) + wobble(y, 0, 6);
      var hw = catmull(s.halfW, d);
      var x0 = cx - hw + wobble(y, 1, 5);
      var x1 = cx + hw + wobble(y, 2, 5);

      if (s.kind === 'overhang') {
        // The roof sweeps out over 26 px of height rather than jumping in
        // one row: a ceiling that appeared all at once would be a ruled
        // horizontal line across the screen, and this reads as a steep
        // overhang instead - which is what it is.
        var k = U.clamp((d - s.lip.d) / 26, 0, 1);
        var jut = s.lip.depth * U.easeOutQuad(k);
        if (s.lip.side < 0) x0 -= jut; else x1 += jut;
      }

      var x2 = -1, x3 = -1;
      if (s.kind === 'chimney') {
        var half = s.slot.w / 2 + wobble(y, 3, 3);
        x3 = x1;
        x2 = cx + half;
        x1 = cx - half;
      }

      var o = i * 4;
      profile[o]     = Math.round(U.clamp(x0, X_MIN, X_MAX));
      profile[o + 1] = Math.round(U.clamp(x1, X_MIN, X_MAX));
      profile[o + 2] = x2 < 0 ? -1 : Math.round(U.clamp(x2, X_MIN, X_MAX));
      profile[o + 3] = x3 < 0 ? -1 : Math.round(U.clamp(x3, X_MIN, X_MAX));
    }
  }

  // --- public --------------------------------------------------------------

  Face.seed = 0;
  Face.segments = null;
  Face.profile = null;

  Face.generate = function (seed) {
    var rng = U.mulberry32(seed >>> 0);
    Face.seed = seed;
    buildPhases(seed);

    segments = [];
    var y = 0, id = 0;
    for (var st = 0; st < C.ZONES.length; st++) {
      var z = C.ZONES[st];
      var top = U.yOfAlt(z.toM);
      var height = Math.round(y - top);
      var plan = planStage(rng, st, height);
      for (var i = 0; i < plan.length; i++) {
        var s = plan[i];
        s.id = id++;
        s.stage = st;
        s.y0 = y;
        s.y1 = y - s.h;
        segments.push(s);
        y = s.y1;
      }
      y = top;   // absorb any rounding at the stage border
    }
    // The last segment ends exactly on the summit.
    segments[segments.length - 1].y1 = -C.WORLD_H;

    buildKeyframes(rng, segments);
    sampleProfile();

    Face.segments = segments;
    Face.profile = profile;
    return Face;
  };

  Face.reset = function () { if (!profile) Face.generate(C.SEED); };

  Face.segmentAt = function (y) { return segmentAt(U.clamp(y, -C.WORLD_H, 0)); };

  Face.stageAt = function (y) { return Face.segmentAt(y).stage; };

  Face.altitudeOf = function (y) { return Math.round(U.altOf(y)); };

  // Where the rock is at a given height. Returns the shared object, so read
  // it and move on - this is called for every row of every baked band.
  var _iv = { x0: 0, x1: 0, x2: -1, x3: -1, split: false };
  Face.intervalsAt = function (y) {
    var g = -y / STEP;
    var i = Math.floor(g);
    if (i < 0) i = 0;
    if (i > N - 1) i = N - 1;
    var j = Math.min(N - 1, i + 1);
    var t = U.clamp(g - i, 0, 1);
    var a = i * 4, b = j * 4;
    var aSplit = profile[a + 2] >= 0, bSplit = profile[b + 2] >= 0;
    if (aSplit !== bSplit) {
      // One side of a chimney's end: snap rather than lerp two different
      // shapes into nonsense.
      var k = (t < 0.5 ? a : b);
      _iv.x0 = profile[k]; _iv.x1 = profile[k + 1];
      _iv.x2 = profile[k + 2]; _iv.x3 = profile[k + 3];
    } else {
      _iv.x0 = profile[a] + (profile[b] - profile[a]) * t;
      _iv.x1 = profile[a + 1] + (profile[b + 1] - profile[a + 1]) * t;
      if (aSplit) {
        _iv.x2 = profile[a + 2] + (profile[b + 2] - profile[a + 2]) * t;
        _iv.x3 = profile[a + 3] + (profile[b + 3] - profile[a + 3]) * t;
      } else { _iv.x2 = -1; _iv.x3 = -1; }
    }
    _iv.split = _iv.x2 >= 0;
    return _iv;
  };

  Face.insideRock = function (x, y) {
    if (y > 0 || y < -C.WORLD_H) return false;
    var iv = Face.intervalsAt(y);
    if (x >= iv.x0 && x <= iv.x1) return true;
    return iv.split && x >= iv.x2 && x <= iv.x3;
  };

  // Distance to the nearest edge of the rock the point is in; 0 outside.
  Face.edgeDist = function (x, y) {
    var iv = Face.intervalsAt(y);
    if (x >= iv.x0 && x <= iv.x1) return Math.min(x - iv.x0, iv.x1 - x);
    if (iv.split && x >= iv.x2 && x <= iv.x3) return Math.min(x - iv.x2, iv.x3 - x);
    return 0;
  };

  // The widest span of rock at a height, for placing things centrally.
  Face.centreAt = function (y) {
    var iv = Face.intervalsAt(y);
    if (!iv.split) return (iv.x0 + iv.x1) / 2;
    return (iv.x1 - iv.x0) >= (iv.x3 - iv.x2) ? (iv.x0 + iv.x1) / 2 : (iv.x2 + iv.x3) / 2;
  };

  Face.stats = function () {
    var byKind = {}, minW = 1e9, maxW = 0;
    for (var i = 0; i < segments.length; i++) {
      var k = segments[i].kind;
      byKind[k] = (byKind[k] || 0) + 1;
    }
    for (var s = 0; s < N; s++) {
      var o = s * 4;
      var w = (profile[o + 1] - profile[o]) + (profile[o + 2] >= 0 ? profile[o + 3] - profile[o + 2] : 0);
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
    }
    return { seed: Face.seed, segments: segments.length, byKind: byKind, samples: N,
             minWidth: minW, maxWidth: maxW };
  };

  // A cheap fingerprint of the whole silhouette, for proving determinism.
  Face.hash = function () {
    var h = 2166136261;
    for (var i = 0; i < profile.length; i++) {
      h ^= profile[i] & 0xffff;
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  };

  SITF.Face = Face;
})();
