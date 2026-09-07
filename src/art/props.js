// Everything that is not the climber, the rock or the sky: the ice that falls
// on you, the things you collect, the particles and the UI pieces.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var P = IF.Paint;
  var A = IF.Atlas;

  var ICE = {
    hi: '#f2fbff', lit: '#c8ecfb', mid: '#8ecbe8', low: '#5c9bc6',
    deep: '#376f9e', core: '#1f4d78', ink: '#12293f'
  };
  var STONE = {
    hi: '#9aa4b2', mid: '#6d7787', low: '#4a5464', deep: '#333b49', ink: '#1a1f2a'
  };

  var Props = {};

  // A convex-ish blob: radii jittered around a circle, then scanline-filled.
  function chunk(c, cx, cy, r, rng, squash) {
    squash = squash || 1;
    var n = 9;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * U.TAU;
      var rr = r * (0.72 + rng() * 0.42);
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash);
    }
    return pts;
  }

  // Facet lines across a shape read as fracture planes and give the normal
  // generator ridges to bevel, so an ice block catches light like ice.
  function facets(c, cx, cy, r, rng, count, col) {
    for (var i = 0; i < count; i++) {
      var a = rng() * U.TAU;
      var d = (rng() * 0.7 - 0.1) * r;
      var x0 = cx + Math.cos(a) * r * 1.2 + Math.cos(a + 1.57) * d;
      var y0 = cy + Math.sin(a) * r * 1.2 + Math.sin(a + 1.57) * d;
      var x1 = cx - Math.cos(a) * r * 1.2 + Math.cos(a + 1.57) * d;
      var y1 = cy - Math.sin(a) * r * 1.2 + Math.sin(a + 1.57) * d;
      P.limb(c, x0, y0, x1, y1, 1, col);
    }
  }

  Props.build = function () {
    var rng;

    // --- the one white texel every solid fill and line uses ---------------
    A.paint('white', 2, 2, function (c) {
      P.rect(c, 0, 0, 2, 2, '#ffffff');
    }, { flat: 1, gloss: 0, ox: 1, oy: 1 });

    // --- soft additive shapes --------------------------------------------
    A.paint('glow', 96, 96, function (c) {
      P.glow(c, 48, 48, 48, '#ffffff', 2.6);
    }, { flat: 1, gloss: 0, ox: 48, oy: 48 });

    A.paint('glow_tight', 48, 48, function (c) {
      P.glow(c, 24, 24, 24, '#ffffff', 4.2, 0.06);
    }, { flat: 1, gloss: 0, ox: 24, oy: 24 });

    A.paint('flare_streak', 96, 12, function (c) {
      // A horizontal anamorphic streak, laid over bright points.
      for (var x = 0; x < 96; x++) {
        var t = 1 - Math.abs(x - 48) / 48;
        var a = Math.pow(t, 2.4);
        for (var y = 0; y < 12; y++) {
          var v = Math.pow(1 - Math.abs(y - 6) / 6, 2.0) * a;
          if (v <= 0.004) continue;
          c.fillStyle = 'rgba(255,255,255,' + v.toFixed(3) + ')';
          c.fillRect(x, y, 1, 1);
        }
      }
    }, { flat: 1, gloss: 0, ox: 48, oy: 6 });

    A.paint('spark', 8, 8, function (c) {
      P.glow(c, 4, 4, 4, '#ffffff', 2.0, 0.18);
    }, { flat: 1, gloss: 0, ox: 4, oy: 4 });

    // An expanding shock ring: bright rim, hollow middle.
    A.paint('ring', 128, 128, function (c) {
      var img = c.getImageData(0, 0, 128, 128);
      var d = img.data;
      for (var y = 0; y < 128; y++) {
        for (var x = 0; x < 128; x++) {
          var dx = x - 64, dy = y - 64;
          var r = Math.sqrt(dx * dx + dy * dy) / 62;
          if (r > 1) continue;
          var a = Math.pow(Math.max(0, 1 - Math.abs(r - 0.88) / 0.14), 2.0);
          var i = (y * 128 + x) * 4;
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
        }
      }
      c.putImageData(img, 0, 0);
    }, { flat: 1, gloss: 0, ox: 64, oy: 64 });

    // A displacement ring. Red and green carry a radial direction and the
    // alpha carries the ring profile, so drawing it into the warp buffer
    // pushes the picture outward from the impact.
    A.paint('warpring', 96, 96, function (c) {
      var img = c.getImageData(0, 0, 96, 96);
      var d = img.data;
      for (var y = 0; y < 96; y++) {
        for (var x = 0; x < 96; x++) {
          var dx = x - 48 + 0.5, dy = y - 48 + 0.5;
          var len = Math.sqrt(dx * dx + dy * dy);
          var r = len / 46;
          if (r > 1 || len < 0.001) continue;
          // A signed profile: the leading edge pushes out, the trailing edge
          // pulls back, which is what a pressure wave actually does.
          var w = Math.exp(-Math.pow((r - 0.80) / 0.16, 2)) -
                  0.55 * Math.exp(-Math.pow((r - 0.58) / 0.14, 2));
          var a = Math.min(1, Math.abs(w) * 1.6);
          if (a < 0.01) continue;
          var s = w >= 0 ? 1 : -1;
          var i = (y * 96 + x) * 4;
          d[i] = (0.5 + (dx / len) * 0.5 * s) * 255;
          d[i + 1] = (0.5 + (dy / len) * 0.5 * s) * 255;
          d[i + 2] = 128;
          d[i + 3] = a * 255;
        }
      }
      c.putImageData(img, 0, 0);
    }, { flat: 1, gloss: 0, ox: 48, oy: 48 });

    // --- snow and dust ---------------------------------------------------

    for (var s = 0; s < 3; s++) {
      (function (k) {
        var size = 4 + k * 3;
        A.paint('snow_' + k, size, size, function (c) {
          P.glow(c, size / 2, size / 2, size / 2, '#ffffff', 1.5, 0.3);
        }, { flat: 1, gloss: 0, ox: size / 2, oy: size / 2 });
      })(s);
    }

    // A drawn flake, for the few big ones that pass close to the lens.
    A.paint('flake', 9, 9, function (c) {
      var col = '#ffffff';
      P.rect(c, 4, 1, 1, 7, col);
      P.rect(c, 1, 4, 7, 1, col);
      P.px(c, 2, 2, col); P.px(c, 6, 2, col);
      P.px(c, 2, 6, col); P.px(c, 6, 6, col);
      P.px(c, 4, 4, col);
    }, { flat: 1, gloss: 0.2, ox: 4.5, oy: 4.5 });

    A.paintSeq('puff', 5, 24, 24, function (c, i, t) {
      var r = 4 + t * 8;
      var a = 1 - t * 0.75;
      var rr = U.rng(900 + i);
      for (var b = 0; b < 5; b++) {
        var ang = rr() * U.TAU, dd = rr() * r * 0.55;
        c.globalAlpha = a * (0.5 + rr() * 0.5);
        P.circle(c, 12 + Math.cos(ang) * dd, 12 + Math.sin(ang) * dd, r * (0.35 + rr() * 0.4), '#ffffff');
      }
      c.globalAlpha = 1;
    }, { flat: 1, gloss: 0, ox: 12, oy: 12 });

    // --- falling ice ------------------------------------------------------
    // Four sizes, four variants each, so the sky never drops the same rock
    // twice in a row.

    var SIZES = [11, 16, 23, 32];
    for (var si = 0; si < SIZES.length; si++) {
      (function (sz, idx) {
        var dim = sz * 2 + 6;
        A.paintSeq('boulder' + idx, 4, dim, dim, function (c, v) {
          rng = U.rng(4400 + idx * 97 + v * 13);
          var cx = dim / 2, cy = dim / 2;
          var pts = chunk(c, cx, cy, sz, rng, 0.92);
          P.poly(c, pts, ICE.low);
          // Inner mass, offset up-left, is the lit plane of the block.
          var inner = [];
          for (var i = 0; i < pts.length; i += 2) {
            inner.push(cx + (pts[i] - cx) * 0.72 - 1.5, cy + (pts[i + 1] - cy) * 0.72 - 1.5);
          }
          P.poly(c, inner, ICE.mid);
          var core = [];
          for (i = 0; i < pts.length; i += 2) {
            core.push(cx + (pts[i] - cx) * 0.40 - 2.5, cy + (pts[i + 1] - cy) * 0.40 - 2.5);
          }
          P.poly(c, core, ICE.lit);
          P.inside(c, function (cc) {
            facets(cc, cx, cy, sz, rng, 4 + idx, ICE.deep);
            facets(cc, cx - 1, cy - 1, sz * 0.7, rng, 2 + idx, ICE.hi);
            // Trapped air: bright specks deep in the block.
            for (var q = 0; q < 3 + idx * 2; q++) {
              P.px(cc, cx + (rng() - 0.5) * sz * 1.4, cy + (rng() - 0.5) * sz * 1.4, ICE.hi);
            }
          });
          P.edgeLight(c, ICE.hi, 0.75, ICE.core, 0.55);
          P.outline(c, ICE.ink, false);
        }, { bevel: sz * 0.45, detail: 0.5, strength: 3.0, gloss: 0.85, soften: 1,
             ox: dim / 2, oy: dim / 2 });
      })(SIZES[si], si);
    }

    // A rock boulder for the lower mountain: same shape language, dirtier.
    A.paintSeq('rockball', 3, 40, 40, function (c, v) {
      rng = U.rng(7700 + v * 31);
      var pts = chunk(c, 20, 20, 15, rng, 0.95);
      P.poly(c, pts, STONE.low);
      var inner = [];
      for (var i = 0; i < pts.length; i += 2) {
        inner.push(20 + (pts[i] - 20) * 0.7 - 1.5, 20 + (pts[i + 1] - 20) * 0.7 - 1.5);
      }
      P.poly(c, inner, STONE.mid);
      P.inside(c, function (cc) {
        P.grain(cc, 4, 4, 32, 32, [STONE.deep, STONE.low, STONE.mid, STONE.hi], 55 + v, 2.6, 0.75);
        for (var q = 0; q < 5; q++) {
          P.px(cc, 20 + (rng() - 0.5) * 24, 20 + (rng() - 0.5) * 24, '#e8f4ff');
        }
      });
      P.edgeLight(c, STONE.hi, 0.6, STONE.ink, 0.5);
      P.outline(c, STONE.ink, false);
    }, { bevel: 6, detail: 0.5, strength: 2.8, gloss: 0.32, ox: 20, oy: 20 });

    // --- shards -----------------------------------------------------------

    A.paintSeq('shard', 6, 12, 12, function (c, v) {
      rng = U.rng(1200 + v * 41);
      var pts = [];
      var n = 3 + (v % 3);
      for (var i = 0; i < n; i++) {
        var a = i / n * U.TAU + rng() * 0.5;
        var r = 2.4 + rng() * 3.2;
        pts.push(6 + Math.cos(a) * r, 6 + Math.sin(a) * r);
      }
      P.poly(c, pts, ICE.mid);
      P.poly(c, pts.map(function (p, i) { return i % 2 ? 6 + (p - 6) * 0.55 : 6 + (p - 6) * 0.55; }), ICE.lit);
      P.outline(c, ICE.ink, false);
    }, { bevel: 1.6, detail: 0.55, strength: 2.6, gloss: 0.9, ox: 6, oy: 6 });

    // --- icicles ----------------------------------------------------------

    A.paintSeq('icicle', 3, 10, 30, function (c, v) {
      var len = 18 + v * 5;
      var w = 4 + v;
      for (var y = 0; y < len; y++) {
        var t = y / len;
        var hw = w * (1 - t * t) * 0.5;
        if (hw < 0.4) hw = 0.4;
        var x0 = Math.round(5 - hw), x1 = Math.round(5 + hw);
        c.fillStyle = ICE.mid;
        c.fillRect(x0, y, Math.max(1, x1 - x0), 1);
        c.fillStyle = ICE.lit;
        c.fillRect(x0, y, 1, 1);
        if (t > 0.15 && t < 0.8 && (y % 4) === 0) P.px(c, x1 - 1, y, ICE.hi);
      }
      P.rect(c, 1, 0, 8, 2, ICE.low);
      P.outline(c, ICE.ink, false);
    }, { bevel: 2, detail: 0.6, strength: 2.4, gloss: 0.95, ox: 5, oy: 1 });

    // --- serac: the big hanging block that lets go ------------------------

    A.paintSeq('serac', 2, 52, 66, function (c, v) {
      rng = U.rng(3100 + v * 17);
      var pts = [
        4, 0, 48, 0,
        48 - rng() * 6, 20 + rng() * 8,
        44, 44,
        30 + rng() * 8, 62,
        20, 56,
        8 + rng() * 4, 34,
        2, 14
      ];
      P.poly(c, pts, ICE.low);
      var inner = [];
      for (var i = 0; i < pts.length; i += 2) {
        inner.push(26 + (pts[i] - 26) * 0.78 - 2, 30 + (pts[i + 1] - 30) * 0.80 - 2);
      }
      P.poly(c, inner, ICE.mid);
      P.inside(c, function (cc) {
        // Stratification: a serac is compressed snow, and the layers show.
        for (var y = 2; y < 64; y += 5) {
          cc.globalAlpha = 0.45;
          P.rect(cc, 0, y, 52, 1, ICE.lit);
          cc.globalAlpha = 1;
        }
        facets(cc, 26, 30, 24, rng, 6, ICE.deep);
        for (var q = 0; q < 12; q++) {
          P.px(cc, rng() * 52, rng() * 66, ICE.hi);
        }
      });
      P.edgeLight(c, ICE.hi, 0.8, ICE.core, 0.6);
      P.outline(c, ICE.ink, false);
    }, { bevel: 7, detail: 0.5, strength: 3.0, gloss: 0.9, ox: 26, oy: 4 });

    // --- crystal ----------------------------------------------------------

    A.paintSeq('crystal', 8, 16, 20, function (c, i, t) {
      var pulse = 0.5 + 0.5 * Math.sin(t * U.TAU);
      var h = 13 + pulse * 1.5;
      var pts = [8, 10 - h / 2, 12.5, 10 - h / 6, 11, 10 + h / 2, 5, 10 + h / 2, 3.5, 10 - h / 6];
      P.poly(c, pts, '#2ea8a8');
      P.poly(c, [8, 10 - h / 2, 11, 10 - h / 6, 9.5, 10 + h / 2, 8, 10 + h / 2], '#6ef0dc');
      P.poly(c, [8, 10 - h / 2, 5, 10 - h / 6, 6.5, 10 + h / 2, 8, 10 + h / 2], '#1d7f88');
      P.px(c, 8, 10 - h / 2 + 2, '#e2fffb');
      P.px(c, 9, 10 - h / 2 + 3, '#e2fffb');
      P.outline(c, '#0d3a44', false);
    }, { bevel: 2, detail: 0.7, strength: 2.8, gloss: 1.0, ox: 8, oy: 10 });

    // --- cairn ------------------------------------------------------------

    A.paintSeq('cairn', 2, 24, 30, function (c, v) {
      var lit = v === 1;
      var r = U.rng(51);
      var y = 27;
      var widths = [16, 13, 10, 8, 6];
      for (var i = 0; i < widths.length; i++) {
        var w = widths[i], h = 4;
        var x = 12 - w / 2 + (r() - 0.5) * 2.4;
        P.soft(c, x, y - h, w, h, lit ? '#8a7c67' : '#655d54');
        P.rect(c, x + 1, y - h, w - 2, 1, lit ? '#b3a288' : '#807870');
        P.rect(c, x + 1, y - 1, w - 2, 1, lit ? '#54463a' : '#43403c');
        // Rime on the windward side of every stone.
        P.rect(c, x, y - h, 2, 1, '#dbe9f2');
        y -= h + 1;
      }
      P.outline(c, '#22242e', false);
    }, { bevel: 3, detail: 0.5, strength: 2.6, gloss: 0.3, ox: 12, oy: 27 });

    A.paintSeq('flame', 6, 16, 20, function (c, i, t) {
      var r = U.rng(880 + i * 7);
      for (var k = 0; k < 22; k++) {
        var ty = r();
        var spread = (1 - ty) * 4.2 + 0.6;
        var x = 8 + (r() - 0.5) * spread * 2 + Math.sin(t * U.TAU + ty * 3) * ty * 2.2;
        var y = 17 - ty * 15;
        var col = ty < 0.28 ? '#fff6d0' : (ty < 0.6 ? '#ffc04a' : (ty < 0.85 ? '#ff7a2a' : '#e0431f'));
        P.px(c, x, y, col);
        if (ty < 0.5) P.px(c, x, y + 1, col);
      }
    }, { flat: 1, gloss: 0, ox: 8, oy: 17 });

    // --- anchors and the summit ------------------------------------------

    A.paint('piton', 9, 9, function (c) {
      P.limb(c, 1, 7, 7, 2, 2, '#8f9bab');
      P.rect(c, 5, 1, 3, 3, '#c2cddb');
      P.outline(c, '#1a1f2a', false);
    }, { bevel: 1.5, detail: 0.5, strength: 2.2, gloss: 0.8, ox: 4, oy: 4 });

    A.paintSeq('flag', 6, 22, 34, function (c, i, t) {
      P.rect(c, 3, 2, 2, 31, '#7d6448');
      P.rect(c, 3, 2, 1, 31, '#a98a63');
      for (var x = 0; x < 15; x++) {
        var wob = Math.sin(t * U.TAU + x * 0.55) * (0.6 + x * 0.22);
        for (var y = 0; y < 9; y++) {
          var col = y < 3 ? '#f24d3a' : (y < 6 ? '#f7f2e4' : '#3f9bd8');
          P.px(c, 5 + x, 4 + y + wob, col);
        }
      }
      P.outline(c, '#1a1f2a', false);
    }, { bevel: 2, detail: 0.5, strength: 2.2, gloss: 0.3, ox: 4, oy: 33 });

    // --- decals -----------------------------------------------------------

    A.paintSeq('crack', 4, 34, 34, function (c, v) {
      var r = U.rng(2200 + v * 19);
      var cx = 17, cy = 17;
      for (var b = 0; b < 5 + v; b++) {
        var a = r() * U.TAU;
        var x = cx, y = cy;
        var len = 5 + r() * 11;
        for (var st = 0; st < len; st++) {
          a += (r() - 0.5) * 0.7;
          x += Math.cos(a); y += Math.sin(a);
          P.px(c, x, y, '#ffffff');
          if (st < len * 0.4) P.px(c, x, y + 1, '#ffffff');
        }
      }
    }, { flat: 1, gloss: 0, ox: 17, oy: 17 });

    A.paintSeq('impact', 5, 40, 20, function (c, i, t) {
      // A splash of snow thrown sideways where something heavy landed.
      var r = U.rng(640 + i * 23);
      for (var k = 0; k < 30; k++) {
        var side = r() < 0.5 ? -1 : 1;
        var d = r();
        var x = 20 + side * d * (6 + t * 17);
        var y = 17 - Math.sin(d * Math.PI) * (2 + t * 9) * (0.4 + r() * 0.8);
        c.globalAlpha = (1 - t) * (0.4 + r() * 0.6);
        P.px(c, x, y, '#ffffff');
        c.globalAlpha = 1;
      }
    }, { flat: 1, gloss: 0, ox: 20, oy: 18 });

    // --- the ledge that gives way -----------------------------------------
    // Three frames: whole, cracked, about to go. Drawn as a three-slice so
    // any width uses the same pixels at the same density.

    A.paintSeq('brittle', 3, 48, 15, function (c, v) {
      rng = U.rng(2600 + v * 61);
      // A plank of wind slab bridging a gap: snow on top, blue ice beneath.
      for (var x = 0; x < 48; x++) {
        var top = 2 + Math.round(U.fbm1(x * 0.22, 2, 31) * 2);
        var bot = 11 + Math.round(U.fbm1(x * 0.19 + 40, 2, 57) * 3);
        c.fillStyle = ICE.low;
        c.fillRect(x, top, 1, bot - top);
        c.fillStyle = '#e9f5fd';
        c.fillRect(x, top, 1, 3);
        c.fillStyle = ICE.mid;
        c.fillRect(x, top + 3, 1, 2);
        if (rng() < 0.10) P.px(c, x, bot - 1, ICE.core);
      }
      // Fractures widen with each frame.
      var cracks = v * 3;
      for (var k = 0; k < cracks; k++) {
        var cx = 5 + rng() * 38, cy = 3;
        for (var s = 0; s < 8 + v * 3; s++) {
          P.px(c, cx, cy, v > 1 ? ICE.core : ICE.deep);
          cx += (rng() - 0.5) * 1.6; cy += 0.9;
        }
      }
      if (v > 1) {
        // Pieces already sagging out of the underside.
        for (k = 0; k < 6; k++) P.px(c, rng() * 48, 12 + rng() * 3, ICE.mid);
      }
      P.outline(c, ICE.ink, false);
    }, { bevel: 3, detail: 0.55, strength: 2.6, gloss: 0.7, ox: 0, oy: 0 });

    // --- near-field rock --------------------------------------------------
    // Big, dark, almost featureless masses that pass between the camera and
    // the face. They are drawn flat and unlit on purpose: out of focus is a
    // lack of information, and the cheapest way to say "this is close" is to
    // give it none.

    // A spur of rock jutting in from one edge. Narrow on purpose: it is here
    // to pass in front of the frame, not to take it over. The origin is on
    // the outer edge so placement is just "this far past the wall".
    A.paintSeq('fgrock', 4, 78, 210, function (c, v) {
      rng = U.rng(6100 + v * 313);
      var n = 16;
      var pts = [];
      for (var i = 0; i < n; i++) {
        var t = i / (n - 1);
        // A profile that swells in the middle and tucks back at both ends,
        // so it reads as a buttress rather than as a rectangle.
        var swell = Math.pow(Math.sin(t * Math.PI), 0.55);
        var x = 6 + swell * (44 + rng() * 26) + (rng() - 0.5) * 12;
        pts.push(Math.min(76, x), t * 210);
      }
      pts.push(0, 210, 0, 0);
      P.poly(c, pts, '#e8e8e8');
      P.inside(c, function (cc) {
        P.grain(cc, 0, 0, 78, 210, ['#9a9a9a', '#bcbcbc', '#dcdcdc', '#ffffff'],
                40 + v, 14, 0.75);
      });
      // A hard bright edge on the outward face: even a silhouette needs one
      // lit line or it reads as a hole in the picture.
      P.edgeLight(c, '#ffffff', 0.35, '#3a3a3a', 0.5);
    }, { bevel: 7, detail: 0.35, strength: 1.8, gloss: 0.10, ox: 0, oy: 105 });

    // --- UI ---------------------------------------------------------------

    // A carabiner: the health unit, because that is what you are hanging on.
    // Drawn as a ring by subtracting the hole once, cleanly.
    A.paint('pip', 11, 11, function (c) {
      P.ellipse(c, 5, 5, 4.6, 4.6, '#dfe9f4');
      c.save();
      c.globalCompositeOperation = 'destination-out';
      P.ellipse(c, 5, 5, 2.5, 2.5, '#000000');
      c.restore();
      // The gate, and a highlight on the upper-left of the ring.
      P.rect(c, 6, 0, 4, 1, '#a9bccd');
      P.px(c, 2, 2, '#ffffff'); P.px(c, 3, 1, '#ffffff');
      P.px(c, 7, 8, '#8ea2b6'); P.px(c, 8, 7, '#8ea2b6');
      P.outline(c, '#141a24', false);
    }, { bevel: 1.5, detail: 0.5, strength: 2.2, gloss: 0.75, ox: 5, oy: 5 });

    A.paint('chevron', 13, 9, function (c) {
      P.poly(c, [6.5, 0, 13, 7, 9, 9, 6.5, 5, 4, 9, 0, 7], '#ffffff');
    }, { flat: 1, gloss: 0, ox: 6.5, oy: 4 });

    A.paint('panel', 12, 12, function (c) {
      // A nine-slice slab: soft dark backing for text, corners knocked in.
      P.rect(c, 0, 0, 12, 12, 'rgba(8,12,20,0.95)');
      c.clearRect(0, 0, 2, 1); c.clearRect(0, 0, 1, 2);
      c.clearRect(10, 0, 2, 1); c.clearRect(11, 0, 1, 2);
      c.clearRect(0, 11, 2, 1); c.clearRect(0, 10, 1, 2);
      c.clearRect(10, 11, 2, 1); c.clearRect(11, 10, 1, 2);
    }, { flat: 1, gloss: 0, ox: 6, oy: 6 });

    // A vertical soft gradient strip, used for the avalanche edge and for
    // scrim behind the HUD.
    A.paint('vgrad', 4, 64, function (c) {
      for (var y = 0; y < 64; y++) {
        var a = 1 - y / 63;
        c.fillStyle = 'rgba(255,255,255,' + (a * a).toFixed(3) + ')';
        c.fillRect(0, y, 4, 1);
      }
    }, { flat: 1, gloss: 0, ox: 2, oy: 0 });
  };

  Props.ICE = ICE;
  Props.STONE = STONE;
  IF.Props = Props;
})();
