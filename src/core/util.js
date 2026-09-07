// Maths, easing, deterministic randomness and noise.
// Everything in ICEFALL that needs to be the same on every run comes from
// here, seeded once, so a route is a route and a best time means something.
(function () {
  'use strict';
  var IF = window.ICEFALL = window.ICEFALL || {};

  var U = {};

  // --- scalars -------------------------------------------------------------

  U.TAU = Math.PI * 2;
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.inv = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  U.map = function (v, a, b, c, d) { return c + (d - c) * U.clamp01(U.inv(a, b, v)); };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  U.smoothstep = function (a, b, v) { var t = U.clamp01(U.inv(a, b, v)); return t * t * (3 - 2 * t); };
  U.smootherstep = function (a, b, v) { var t = U.clamp01(U.inv(a, b, v)); return t * t * t * (t * (t * 6 - 15) + 10); };
  U.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  U.dist2 = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };

  // Frame-rate independent exponential approach. `tau` is the time constant:
  // after ~3 tau the value has essentially arrived.
  U.approach = function (cur, target, tau, dt) {
    if (tau <= 0) return target;
    return target + (cur - target) * Math.exp(-dt / tau);
  };

  // Move toward a target at a fixed rate (units per second).
  U.toward = function (cur, target, rate, dt) {
    var d = target - cur, step = rate * dt;
    if (Math.abs(d) <= step) return target;
    return cur + U.sign(d) * step;
  };

  U.wrap = function (v, n) { return ((v % n) + n) % n; };
  U.pingpong = function (v, n) { var t = U.wrap(v, n * 2); return t < n ? t : n * 2 - t; };

  // --- easing --------------------------------------------------------------

  U.ease = {
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    outBack: function (t) { var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t <= 0 || t >= 1) return t;
      var c4 = U.TAU / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    outBounce: function (t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
      t -= 2.625 / d1; return n1 * t * t + 0.984375;
    }
  };

  // --- colour --------------------------------------------------------------

  // Hex to a float triple in 0..1. Cached: palettes get read every frame.
  var hexCache = {};
  U.rgb = function (hex) {
    var c = hexCache[hex];
    if (c) return c;
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    hexCache[hex] = c;
    return c;
  };

  U.mixRgb = function (a, b, t, out) {
    out = out || [0, 0, 0];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  };

  // Pack r,g,b,a (0..1) into one uint32 as ABGR, which is the byte order a
  // Uint8 vertex attribute reads back as on little-endian hardware.
  U.packRGBA = function (r, g, b, a) {
    return ((a * 255) << 24 | (b * 255) << 16 | (g * 255) << 8 | (r * 255)) >>> 0;
  };

  U.hsl = function (h, s, l) {
    h = U.wrap(h, 1);
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h * 6) % 2 - 1));
    var m = l - c / 2;
    var r, g, b;
    if (h < 1 / 6) { r = c; g = x; b = 0; }
    else if (h < 2 / 6) { r = x; g = c; b = 0; }
    else if (h < 3 / 6) { r = 0; g = c; b = x; }
    else if (h < 4 / 6) { r = 0; g = x; b = c; }
    else if (h < 5 / 6) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [r + m, g + m, b + m];
  };

  U.css = function (rgb, a) {
    var r = Math.round(U.clamp01(rgb[0]) * 255);
    var g = Math.round(U.clamp01(rgb[1]) * 255);
    var b = Math.round(U.clamp01(rgb[2]) * 255);
    return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')'
                           : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  // --- deterministic randomness -------------------------------------------

  // Mulberry32. Small, fast, good enough for level generation, and identical
  // on every machine, which is the whole point.
  U.rng = function (seed) {
    var a = (seed | 0) || 1;
    var f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + f() * (hi - lo); };
    f.int = function (lo, hi) { return Math.floor(lo + f() * (hi - lo + 1)); };
    f.chance = function (p) { return f() < p; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; };
    f.sign = function () { return f() < 0.5 ? -1 : 1; };
    // Shuffle in place, deterministically.
    f.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(f() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return f;
  };

  // --- hash noise ----------------------------------------------------------

  function hash2(ix, iy, seed) {
    var n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1013904223);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  U.hash2 = hash2;

  U.hash1 = function (i, seed) { return hash2(i, 0x9E37, seed); };

  // Value noise, smoothstep-interpolated. Cheap and plenty for rock.
  U.noise2 = function (x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    var c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };

  U.noise1 = function (x, seed) {
    var ix = Math.floor(x), fx = x - ix;
    fx = fx * fx * (3 - 2 * fx);
    var a = hash2(ix, 7, seed), b = hash2(ix + 1, 7, seed);
    return a + (b - a) * fx;
  };

  // Fractal Brownian motion. `oct` octaves, each half the amplitude and twice
  // the frequency. Returns 0..1.
  U.fbm2 = function (x, y, oct, seed, lac, gain) {
    lac = lac || 2.0; gain = gain === undefined ? 0.5 : gain;
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (var i = 0; i < oct; i++) {
      sum += U.noise2(fx, fy, seed + i * 131) * amp;
      norm += amp;
      amp *= gain; fx *= lac; fy *= lac;
    }
    return sum / norm;
  };

  U.fbm1 = function (x, oct, seed, lac, gain) {
    lac = lac || 2.0; gain = gain === undefined ? 0.5 : gain;
    var sum = 0, amp = 1, norm = 0, fx = x;
    for (var i = 0; i < oct; i++) {
      sum += U.noise1(fx, seed + i * 131) * amp;
      norm += amp;
      amp *= gain; fx *= lac;
    }
    return sum / norm;
  };

  // Ridged noise: |2n-1| inverted, which gives sharp crests. This is what
  // makes rock read as rock rather than as clouds.
  U.ridge2 = function (x, y, oct, seed) {
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (var i = 0; i < oct; i++) {
      var n = 1 - Math.abs(U.noise2(fx, fy, seed + i * 977) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5; fx *= 2.03; fy *= 1.97;
    }
    return sum / norm;
  };

  // Worley / cellular noise, returning distance to the nearest feature point.
  // Used for the crystalline structure inside glacier ice.
  U.worley = function (x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var best = 8;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var cx = ix + ox, cy = iy + oy;
        var px = cx + hash2(cx, cy, seed);
        var py = cy + hash2(cx, cy, seed + 5417);
        var d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  };

  // --- geometry ------------------------------------------------------------

  U.aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  };

  U.circleRect = function (cx, cy, r, rx, ry, rw, rh) {
    var nx = U.clamp(cx, rx, rx + rw);
    var ny = U.clamp(cy, ry, ry + rh);
    return U.dist2(cx, cy, nx, ny) <= r * r;
  };

  // Shortest distance from a point to a segment; used by the rope.
  U.segDist = function (px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : U.clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
    return U.dist(px, py, ax + dx * t, ay + dy * t);
  };

  // --- canvas helpers (texture authoring only) -----------------------------

  U.canvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c;
  };

  U.ctx2d = function (w, h) {
    var c = U.canvas(w, h);
    var x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = false;
    return x;
  };

  // --- formatting ----------------------------------------------------------

  U.time = function (s) {
    if (s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    var ss = r < 10 ? '0' + r.toFixed(1) : r.toFixed(1);
    return m + ':' + ss;
  };

  U.commas = function (n) {
    var s = String(Math.round(n)), out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      if (++c % 3 === 0 && i > 0) out = ',' + out;
    }
    return out;
  };

  // --- storage (never throws; private mode and file:// both survive) -------

  U.load = function (key, dflt) {
    try {
      var v = window.localStorage.getItem(key);
      return v === null ? dflt : v;
    } catch (e) { return dflt; }
  };

  U.save = function (key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ }
  };

  U.loadNum = function (key, dflt) {
    var v = parseFloat(U.load(key, ''));
    return isFinite(v) ? v : dflt;
  };

  // --- small object pool ---------------------------------------------------
  // Particles and shards churn hard enough that allocation shows up in the
  // frame time. Everything transient is pooled.

  U.pool = function (make, reset, cap) {
    var live = [], free = [];
    return {
      list: live,
      get: function () {
        var o = free.length ? free.pop() : make();
        if (live.length >= cap) {
          // Oldest goes; a dropped particle is invisible, a stall is not.
          var old = live.shift();
          free.push(old);
        }
        live.push(o);
        return o;
      },
      release: function (i) {
        var o = live[i];
        live[i] = live[live.length - 1];
        live.pop();
        if (reset) reset(o);
        free.push(o);
      },
      clear: function () {
        while (live.length) { var o = live.pop(); if (reset) reset(o); free.push(o); }
      }
    };
  };

  IF.Util = U;
})();
