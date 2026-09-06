(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The rock you climb, painted in the mountain's own hand.
  //
  // The stone is quilted from small blocks of the painted nature_3 peak -
  // 20x20 patches that hold nothing but rock and snow, found by scanning the
  // PNG offline - laid overlapping, feathered and mirrored under a quantised
  // light-and-shadow pass. Same brush as the range on the horizon, none of
  // its shapes.
  //
  // What is new is the cut. The silhouette comes from SITF.Face, so the wall
  // narrows into aretes with sky down both sides, opens into slabs, splits at
  // chimneys and juts out over roofs. That shape never repeats, so the rock
  // is baked in horizontal bands as the camera reaches them, and cached.

  var R = {};

  var BAND_H = C.BAND_H;              // 200
  var FRINGE = 16;                    // pixels of haze at each silhouette edge

  // The peak's own palette, most-common-first from its cliff band.
  var ROCK_INK = '#405890';

  // Per-stage light on the same stone, and how far back in the air it sits.
  // Under the aurora the distant peaks are already near-black, so a face a
  // few metres from your nose is the BRIGHTEST thing in frame: thick rime
  // catching the sky. Darkening it there made it vanish into the night.
  var PAL = [
    { tint: '#8fa06a', tintA: 0.12, recede: 0.10, snow: 0.06 },
    { tint: '#d0a878', tintA: 0.08, recede: 0.14, snow: 0.18 },
    { tint: '#8fb8dc', tintA: 0.24, recede: 0.16, snow: 0.34 },
    { tint: '#9fb0d8', tintA: 0.26, recede: 0.14, snow: 0.38 },
    { tint: '#b9d2ee', tintA: 0.42, recede: 0.06, snow: 0.85 }
  ];

  // The quilt blocks: 20x20 squares of nature_3/2.png with no sky, no forest
  // and no transparency. Laid down small, overlapping, feathered and randomly
  // mirrored, they give a face in exactly the painting's hand.
  var PATCH = 20;
  var SRC = [
    [272,64],[272,72],[280,72],[272,80],[280,80],[272,88],
    [280,88],[288,88],[264,96],[304,96],[312,96],[320,96],
    [328,96],[256,104],[264,104],[304,104],[312,104],[320,104],
    [328,104],[248,112],[256,112],[264,112],[312,112],[320,112],
    [328,112],[248,120],[256,120],[336,120],[336,128],[344,128],
    [144,152],[152,152],[152,160],[424,160],[432,160],[448,168],
    [456,168],[200,192],[288,208],[280,216],[288,216],[296,216]];
  var SNOWY = [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 26];

  // --- deterministic noise -------------------------------------------------

  function hash(ix, iy, seed) {
    var n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1013904223);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }

  // Value noise in world space. It does not wrap any more, because the face
  // does not repeat any more.
  function vnoise(x, y, cw, ch, seed) {
    var gx = x / cw, gy = y / ch;
    var ix = Math.floor(gx), iy = Math.floor(gy);
    var fx = gx - ix, fy = gy - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    var c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // --- patch stamping ------------------------------------------------------

  // Every feathered patch is built once and kept. Compositing them on demand
  // meant four canvas operations per stamp and roughly seventeen hundred
  // stamps per band, which was most of a two-hundred-millisecond bake.
  var patchCache = null;

  function buildPatches(src) {
    patchCache = [];
    var mask = U.makeCanvas(PATCH, PATCH);
    var mc = mask.getContext('2d');
    var g = mc.createRadialGradient(PATCH / 2, PATCH / 2, 4, PATCH / 2, PATCH / 2, PATCH / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = g;
    mc.fillRect(0, 0, PATCH, PATCH);

    for (var i = 0; i < SRC.length; i++) {
      for (var f = 0; f < 2; f++) {
        var cv = U.makeCanvas(PATCH, PATCH);
        var pc = cv.getContext('2d');
        pc.imageSmoothingEnabled = false;
        if (src) {
          pc.save();
          if (f) { pc.translate(PATCH, 0); pc.scale(-1, 1); }
          pc.drawImage(src, SRC[i][0], SRC[i][1], PATCH, PATCH, 0, 0, PATCH, PATCH);
          pc.restore();
        } else {
          pc.fillStyle = '#c8a088';
          pc.fillRect(0, 0, PATCH, PATCH);
        }
        pc.globalCompositeOperation = 'destination-in';
        pc.drawImage(mask, 0, 0);
        patchCache.push(cv);
      }
    }
  }

  // Every choice is hashed on the patch's WORLD position, never on a running
  // per-band counter: a patch that straddles a band seam has to come out
  // identical in both bands or the seam becomes a visible line.
  function paintRock(cx, yTop, stage, snowBias) {
    var F = SITF.Face;
    var p = PAL[stage];
    for (var pass = 0; pass < 2; pass++) {
      var step = pass === 0 ? 10 : 16;
      for (var gy = -PATCH; gy < BAND_H + PATCH; gy += step) {
        var wy = U.clamp(yTop + gy, -C.WORLD_H, 0);
        // Only quilt across the rock that is actually at this height.
        var iv = F.intervalsAt(wy);
        var lo = iv.x0 - FRINGE - PATCH;
        var hi = (iv.split ? iv.x3 : iv.x1) + FRINGE + PATCH;
        var gyi = Math.round(yTop + gy);
        for (var gx = lo; gx < hi; gx += step) {
          var gxi = Math.round(gx / step);
          var h0 = hash(gxi, gyi, 700 + pass);
          if (pass === 1 && h0 < 0.55) continue;
          var h1 = hash(gxi, gyi, 800 + pass);
          var h2 = hash(gxi, gyi, 900 + pass);
          var h3 = hash(gxi, gyi, 1000 + pass);
          var i = Math.floor(h1 * SRC.length);
          if (h2 < p.snow * 0.6 + snowBias) i = SNOWY[Math.floor(h3 * SNOWY.length)];
          cx.drawImage(patchCache[i * 2 + (h1 < 0.5 ? 1 : 0)],
                       Math.round(gx + (h2 - 0.5) * step),
                       Math.round(gy + (h3 - 0.5) * step) - PATCH / 2);
        }
      }
    }
  }

  // Scratch surfaces, allocated once and reused. A fresh canvas and a fresh
  // ImageData for the mask, the edges and the shading meant a megabyte and a
  // half of garbage per bake, and collecting it cost more than the bake.
  var scratch = null;
  function scratchOf(k) {
    if (!scratch) scratch = {};
    var e = scratch[k];
    if (!e) {
      var cv = U.makeCanvas(C.W, BAND_H);
      var cx = cv.getContext('2d');
      e = scratch[k] = { cv: cv, cx: cx, id: cx.createImageData(C.W, BAND_H) };
    } else {
      e.id.data.fill(0);
      e.cx.clearRect(0, 0, C.W, BAND_H);
    }
    return e;
  }

  // --- the silhouette mask -------------------------------------------------
  // Written straight into pixels. As per-row fillRects this was six thousand
  // canvas calls a band; the whole mask is one putImageData now.

  function spanInto(d, ly, x0, x1) {
    var l = Math.round(x0), r = Math.round(x1);
    if (r <= l) return;
    var row = ly * C.W;
    var i, o, a;
    for (i = Math.max(0, l); i < Math.min(C.W, r); i++) {
      o = (row + i) * 4;
      d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = 255;
    }
    for (var f = 0; f < FRINGE; f++) {
      var k = 1 - (f + 1) / (FRINGE + 1);
      a = (k * k * 255) | 0;
      var xl = l - f - 1, xr = r + f;
      if (xl >= 0 && xl < C.W) {
        o = (row + xl) * 4;
        if (a > d[o + 3]) { d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = a; }
      }
      if (xr >= 0 && xr < C.W) {
        o = (row + xr) * 4;
        if (a > d[o + 3]) { d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = a; }
      }
    }
  }

  function buildMask(yTop) {
    var F = SITF.Face;
    var e = scratchOf('mask');
    var id = e.id, d = id.data;
    for (var ly = 0; ly < BAND_H; ly++) {
      var y = yTop + ly;
      if (y > 0 || y < -C.WORLD_H) continue;
      var iv = F.intervalsAt(y);
      var jit = hash(ly, Math.round(yTop), 55) < 0.5 ? 0 : 1;
      spanInto(d, ly, iv.x0 + jit, iv.x1 + jit);
      if (iv.split) spanInto(d, ly, iv.x2 + jit, iv.x3 + jit);
    }
    e.cx.putImageData(id, 0, 0);
    return e.cv;
  }

  // --- features ------------------------------------------------------------
  // Drawn onto the stone before it is cut out. Every one of them is feathered
  // or wobbled: none may leave a ruled edge across the screen.

  function paintFeatures(cx, yTop) {
    var F = SITF.Face;
    cx.save();
    cx.globalCompositeOperation = 'source-atop';
    for (var ly = 0; ly < BAND_H; ly++) {
      var y = yTop + ly;
      if (y > 0 || y < -C.WORLD_H) continue;
      var s = F.segmentAt(y);
      var iv = F.intervalsAt(y);
      var d = s.y0 - y;
      var right = iv.split ? iv.x3 : iv.x1;

      if (s.kind === 'crack') {
        var seam = (iv.x0 + iv.x1) / 2 + Math.sin(y * 0.05 + s.id) * 6 + Math.sin(y * 0.017) * 10;
        cx.globalAlpha = 0.45; cx.fillStyle = ROCK_INK;
        cx.fillRect(Math.round(seam), ly, 1, 1);
        cx.globalAlpha = 0.25; cx.fillStyle = '#2c3c60';
        cx.fillRect(Math.round(seam) + 1, ly, 2, 1);
      } else if (s.kind === 'chimney' && iv.split) {
        cx.globalAlpha = 0.72; cx.fillStyle = C.COLORS.ink;
        cx.fillRect(Math.round(iv.x1), ly, Math.max(1, Math.round(iv.x2 - iv.x1)), 1);
        for (var w = 0; w < 14; w++) {
          var kw = 1 - w / 14;
          cx.globalAlpha = kw * kw * 0.5; cx.fillStyle = C.COLORS.ink;
          cx.fillRect(Math.round(iv.x1) - w - 1, ly, 1, 1);
          cx.fillRect(Math.round(iv.x2) + w, ly, 1, 1);
        }
      } else if (s.kind === 'overhang' && d > s.lip.d - 40 && d < s.lip.d) {
        var kk = (s.lip.d - d) / 40;
        cx.globalAlpha = 0.6 * kk * kk;
        cx.fillStyle = C.COLORS.ink;
        cx.fillRect(Math.round(iv.x0), ly, Math.round(right - iv.x0), 1);
      } else if (s.kind === 'ice') {
        cx.globalAlpha = 0.34; cx.fillStyle = '#9fd0e8';
        cx.fillRect(Math.round(iv.x0), ly, Math.round(right - iv.x0), 1);
        if (hash(ly, Math.round(yTop), 61) < 0.12) {
          cx.globalAlpha = 0.30; cx.fillStyle = '#e8f6ff';
          cx.fillRect(Math.round(iv.x0 + hash(ly, 3, 62) * (right - iv.x0)), ly, 1, 1);
        }
      } else if (s.kind === 'snow') {
        var gsn = cx.createLinearGradient(iv.x0, 0, right, 0);
        gsn.addColorStop(0, U.rgba(C.COLORS.ink, 0.18));
        gsn.addColorStop(1, U.rgba(C.COLORS.ink, 0));
        cx.globalAlpha = 1; cx.fillStyle = gsn;
        cx.fillRect(Math.round(iv.x0), ly, Math.round(right - iv.x0), 1);
      }
    }
    cx.globalAlpha = 1;
    cx.restore();
  }

  // A lit edge where the light strikes and a deep shadow inside the far edge:
  // that is what reads as mass, and says you are in front of the range rather
  // than painted onto it. An arete gets a longer shadow ramp so its crest
  // reads round instead of sheared off. Written as pixels for the same reason
  // as the mask: as fillRects it was nine thousand canvas calls a band.
  function edgeInto(d, ly, x0, x1, shadowW) {
    var row = ly * C.W;
    var l = Math.round(x0), r = Math.round(x1), o;
    for (var e = 0; e < shadowW; e++) {
      var kk = 1 - e / shadowW;
      var xr = r - e - 1;
      if (xr >= 0 && xr < C.W) {
        o = (row + xr) * 4;
        d[o] = 0x0b; d[o + 1] = 0x1f; d[o + 2] = 0x3a;
        d[o + 3] = (kk * kk * 0.55 * 255) | 0;
      }
      if (e < 3) {
        var xe = r - e - 1;
        if (xe >= 0 && xe < C.W) {
          o = (row + xe) * 4;
          d[o] = 0x0b; d[o + 1] = 0x1f; d[o + 2] = 0x3a; d[o + 3] = 200 - e * 40;
        }
        var xw = l + e;
        if (xw >= 0 && xw < C.W) {
          o = (row + xw) * 4;
          d[o] = 0x0b; d[o + 1] = 0x1f; d[o + 2] = 0x3a; d[o + 3] = 150 - e * 45;
        }
      }
      if (e >= 3 && e < 12) {
        var xl = l + e;
        if (xl >= 0 && xl < C.W) {
          o = (row + xl) * 4;
          d[o] = 0xff; d[o + 1] = 0xf4; d[o + 2] = 0xdc;
          d[o + 3] = ((1 - (e - 3) / 9) * 0.26 * 255) | 0;
        }
      }
    }
  }

  function buildEdges(yTop) {
    var F = SITF.Face;
    var e = scratchOf('edge');
    var id = e.id, d = id.data;
    for (var ly = 0; ly < BAND_H; ly++) {
      var y = yTop + ly;
      if (y > 0 || y < -C.WORLD_H) continue;
      var iv = F.intervalsAt(y);
      var w = F.segmentAt(y).kind === 'arete' ? 34 : 26;
      edgeInto(d, ly, iv.x0, iv.x1, w);
      if (iv.split) edgeInto(d, ly, iv.x2, iv.x3, w);
    }
    e.cx.putImageData(id, 0, 0);
    return e.cv;
  }

  // --- band baking ---------------------------------------------------------

  function bakeBand(n, src) {
    var F = SITF.Face;
    var yTop = -(n + 1) * BAND_H;
    var midY = U.clamp(yTop + BAND_H / 2, -C.WORLD_H, 0);
    var stage = F.stageAt(midY);
    var p = PAL[stage];
    var rnd = U.mulberry32(4700 + n * 31);

    var cv = U.makeCanvas(C.W, BAND_H);
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;

    var snowBias = F.segmentAt(midY).kind === 'snow' ? 0.35 : 0;

    if (!patchCache) buildPatches(src);
    paintRock(cx, yTop, stage, snowBias);

    // Big soft light and shadow across the face - the mass of a buttress
    // rather than a flat sheet of texture. Quantised into steps so it stays
    // in the painting's flat-facet language.
    var sh = scratchOf('shade');
    var id = sh.id, dd = id.data;
    for (var ly = 0; ly < BAND_H; ly++) {
      var wy = U.clamp(yTop + ly, -C.WORLD_H, 0);
      var iv = F.intervalsAt(wy);
      var lo = Math.max(0, Math.round(iv.x0) - FRINGE - 2);
      var hi = Math.min(C.W, Math.round(iv.split ? iv.x3 : iv.x1) + FRINGE + 2);
      // Sampled every other pixel and written as 2x2 blocks. The noise cells
      // are tens of pixels across and the result is quantised into flat steps
      // anyway, so nothing is lost and the loop costs a quarter as much.
      if (ly % 2) continue;
      for (var x = lo; x < hi; x += 2) {
        var m = vnoise(x, wy, 64, 40, 30) * 0.7 + vnoise(x, wy, 22, 20, 31) * 0.3;
        var r0, g0, b0, a0;
        if (m < 0.36) { r0 = 0x40; g0 = 0x58; b0 = 0x90; a0 = m < 0.26 ? 110 : 66; }
        else if (m > 0.68) { r0 = 0xff; g0 = 0xf4; b0 = 0xdc; a0 = m > 0.78 ? 76 : 40; }
        else continue;
        for (var by = 0; by < 2 && ly + by < BAND_H; by++) {
          for (var bx = 0; bx < 2 && x + bx < hi; bx++) {
            var o = ((ly + by) * C.W + x + bx) * 4;
            dd[o] = r0; dd[o + 1] = g0; dd[o + 2] = b0; dd[o + 3] = a0;
          }
        }
      }
    }
    sh.cx.putImageData(id, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.drawImage(sh.cv, 0, 0);
    cx.globalCompositeOperation = 'source-over';

    paintFeatures(cx, yTop);

    // Snow on the up-facing edges, heavier the higher you climb. Long and
    // thin, so none of it can be mistaken for somewhere to stand.
    var drifts = Math.round(4 + p.snow * 22);
    for (var dI = 0; dI < drifts; dI++) {
      var dy = Math.floor(rnd() * BAND_H);
      var dw = 60 + Math.floor(rnd() * 200);
      var dx = Math.floor(rnd() * C.W) - dw / 2;
      cx.globalAlpha = (0.18 + rnd() * 0.30) * (0.35 + p.snow);
      cx.fillStyle = '#eef6fb';
      cx.fillRect(dx, dy, dw, 1);
      if (rnd() < 0.5) { cx.globalAlpha *= 0.55; cx.fillRect(dx + 10, dy + 1, Math.max(4, dw - 20), 1); }
    }
    cx.globalAlpha = 1;

    // Cracks running down the face, kept inside the rock.
    var cracks = 3 + Math.floor(rnd() * 3);
    for (var k = 0; k < cracks; k++) {
      var cy = rnd() * BAND_H;
      var ivc = F.intervalsAt(U.clamp(yTop + cy, -C.WORLD_H, 0));
      var span = Math.max(1, (ivc.x1 - ivc.x0) - 40);
      var cxp = ivc.x0 + 20 + rnd() * span;
      var slope = (rnd() - 0.5) * 0.9;
      var len = 50 + rnd() * 130;
      cx.globalAlpha = 0.35 + rnd() * 0.2;
      cx.fillStyle = ROCK_INK;
      for (var sI = 0; sI < len; sI++) {
        var yy = cy + sI;
        if (yy >= BAND_H) break;
        cx.fillRect(Math.round(cxp + slope * sI + Math.sin(sI * 0.3) * 2), Math.round(yy), 1, 1);
      }
    }
    cx.globalAlpha = 1;

    // The stage's own light, then the air between the wall and the camera.
    // A band that straddles a stage border blends the two, so the change of
    // light arrives as a gradient and never as a line.
    var stageTop = F.stageAt(U.clamp(yTop, -C.WORLD_H, 0));
    var stageBot = F.stageAt(U.clamp(yTop + BAND_H - 1, -C.WORLD_H, 0));
    cx.globalCompositeOperation = 'source-atop';
    if (stageTop !== stageBot) {
      var pa = PAL[stageTop], pb = PAL[stageBot];
      var gt = cx.createLinearGradient(0, 0, 0, BAND_H);
      gt.addColorStop(0, U.rgba(pa.tint, pa.tintA));
      gt.addColorStop(1, U.rgba(pb.tint, pb.tintA));
      cx.fillStyle = gt;
      cx.fillRect(0, 0, C.W, BAND_H);
      var gr = cx.createLinearGradient(0, 0, 0, BAND_H);
      gr.addColorStop(0, U.rgba(C.COLORS.ink, pa.recede));
      gr.addColorStop(1, U.rgba(C.COLORS.ink, pb.recede));
      cx.fillStyle = gr;
      cx.fillRect(0, 0, C.W, BAND_H);
    } else {
      cx.fillStyle = U.rgba(p.tint, p.tintA);
      cx.fillRect(0, 0, C.W, BAND_H);
      if (p.recede > 0) {
        cx.fillStyle = U.rgba(C.COLORS.ink, p.recede);
        cx.fillRect(0, 0, C.W, BAND_H);
      }
    }

    // Cut the face out of the band.
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(buildMask(yTop), 0, 0);
    cx.globalCompositeOperation = 'source-over';

    cx.globalCompositeOperation = 'source-atop';
    cx.drawImage(buildEdges(yTop), 0, 0);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    return cv;
  }

  // --- cache ---------------------------------------------------------------

  var cache = {};      // band index -> canvas
  var order = [];      // least recently used first
  var lastBake = 0;

  function touch(n) {
    var at = order.indexOf(n);
    if (at >= 0) { order.splice(at, 1); order.push(n); }
    return cache[n];
  }

  function makeBand(n) {
    var t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    var cv = bakeBand(n, SITF.Assets.img.peak3 || null);
    lastBake = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
    cache[n] = cv;
    order.push(n);
    while (order.length > C.BAND_CACHE) delete cache[order.shift()];
    return cv;
  }

  R.build = function () { SITF.Face.reset(); };
  R.reset = function () { cache = {}; order = []; };

  // Bake the first bands up front, behind the state fade, so the climb does
  // not open on a hitch.
  R.warm = function (n, count) {
    SITF.Face.reset();
    for (var i = 0; i < (count || 3); i++) {
      var b = n + i;
      if (b >= 0 && b < R.bandCount() && !cache[b]) makeBand(b);
    }
  };

  R.bandCount = function () { return Math.ceil(C.WORLD_H / BAND_H) + 1; };
  R.lastBakeMs = function () { return lastBake; };
  R.bandAt = function (y) { return Math.floor(-y / BAND_H); };

  // view = { toScreenX, toScreenY, camY }
  R.draw = function (ctx, view) {
    SITF.Face.reset();
    var worldTop = view.camY - C.CLIMBER_SCREEN_Y;
    var worldBot = worldTop + C.H;
    var nFirst = Math.floor(-worldBot / BAND_H) - 1;
    var nLast = Math.floor(-worldTop / BAND_H) + 1;
    var ox = view.toScreenX ? Math.round(view.toScreenX(0)) : 0;
    var baked = false;

    ctx.save();
    for (var n = nFirst; n <= nLast; n++) {
      if (n < 0) continue;
      var sy = Math.round(view.toScreenY(-(n + 1) * BAND_H));
      if (sy > C.H || sy + BAND_H < 0) continue;
      var cv = touch(n);
      if (!cv) {
        // At most one bake per frame: a band that misses simply is not drawn
        // this frame rather than stalling the loop for every band at once.
        if (baked) continue;
        cv = makeBand(n);
        baked = true;
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, ox, sy);
    }
    ctx.restore();

    // Prefetch the band above the screen, so climbing into it is never the
    // thing that pays for the bake.
    if (!baked) {
      var ahead = nLast + 1;
      if (ahead >= 0 && ahead < R.bandCount() && !cache[ahead]) makeBand(ahead);
    }
  };

  // Exposed for the playtest harness so a baked band can be eyeballed.
  R.bands = function () { return cache; };
  R.bake = function (n) { return touch(n) || makeBand(n); };

  R.BAND_H = BAND_H;
  SITF.RockFace = R;
})();
