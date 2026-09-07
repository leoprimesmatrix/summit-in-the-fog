// Materials.
//
// Each material is a seamless 256x256 tile of colour plus a matching height
// field. Chunk baking stamps these through a mask instead of running noise
// per pixel per chunk, which is the difference between a 20ms bake and a
// 200ms one.
//
// Seamlessness comes from sampling the noise on a torus: the tile coordinate
// is mapped onto a circle in x and another in y, so the pattern meets itself
// exactly at the edges.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;

  var TILE = 256;
  var R = {};
  var mats = {};

  // Noise sampled on a torus, so the tile wraps in both directions.
  //
  // Both axes are mapped onto circles and the two are added at equal weight.
  // Weighting them unequally - which is the obvious way to write this - makes
  // the field vary faster in one axis than the other, and the result is not
  // stone, it is brushed metal. The second layer is rotated and phase-shifted
  // so the diagonal symmetry of the first does not show through.
  function torus(x, y, freq, seed, oct, ridged) {
    var ax = x / TILE * U.TAU, ay = y / TILE * U.TAU;
    var r = freq / U.TAU;
    var cx = Math.cos(ax), sx = Math.sin(ax);
    var cy = Math.cos(ay), sy = Math.sin(ay);

    var ax1 = 32 + r * (cx + cy), ay1 = 32 + r * (sx + sy);
    var bx = Math.cos(ax + 2.1), by = Math.sin(ax + 2.1);
    var dx = Math.cos(ay + 0.7), dy = Math.sin(ay + 0.7);
    var ax2 = 96 + r * (bx - dy), ay2 = 96 + r * (by + dx);

    if (ridged) {
      return U.ridge2(ax1, ay1, oct, seed) * 0.58 +
             U.ridge2(ax2, ay2, oct, seed + 811) * 0.42;
    }
    return U.fbm2(ax1, ay1, oct, seed) * 0.55 +
           U.fbm2(ax2, ay2, oct, seed + 811) * 0.45;
  }

  function tileNoise(x, y, freq, oct, seed) {
    return torus(x, y, freq, seed, oct, false);
  }

  function tileRidge(x, y, freq, oct, seed) {
    return torus(x, y, freq, seed, oct, true);
  }

  // Build one material.
  //   ramp    colours from deepest crevice to brightest crest
  //   relief  how much the height field varies
  //   strata  horizontal bedding strength (rock has it, ice has less)
  //   crack   dark fracture lines
  //   sparkle bright specks (rime, quartz, trapped air)
  function build(name, spec) {
    var ctx = U.ctx2d(TILE, TILE);
    var img = ctx.createImageData(TILE, TILE);
    var d = img.data;
    var height = new Float32Array(TILE * TILE);
    var gloss = new Float32Array(TILE * TILE);
    var seed = spec.seed;
    var ramp = spec.ramp.map(function (h) { return U.rgb(h); });
    var nRamp = ramp.length;

    for (var y = 0; y < TILE; y++) {
      for (var x = 0; x < TILE; x++) {
        var i = y * TILE + x;

        var base = tileNoise(x, y, spec.freq, 4, seed);
        var fine = tileNoise(x, y, spec.freq * 2.6, 3, seed + 77);
        var rid = tileRidge(x, y, spec.freq * 1.7, 4, seed + 401);

        var v = base * 0.40 + fine * 0.32 + rid * 0.28;

        // Bedding planes: a slow vertical stripe warped by the noise, which
        // is what makes stone look laid down rather than sprayed on.
        if (spec.strata > 0) {
          var band = Math.sin((y + base * 26) * spec.strataFreq) * 0.5 + 0.5;
          v = v * (1 - spec.strata) + band * spec.strata;
        }

        // Fracture lines: the thin dark valleys of a second ridged field.
        var crackAmt = 0;
        if (spec.crack > 0) {
          var cr = tileRidge(x, y, spec.freq * 1.25, 3, seed + 913);
          crackAmt = Math.pow(Math.max(0, cr - 0.62) / 0.38, 0.7) * spec.crack;
          v -= crackAmt * 0.55;
        }

        v = U.clamp01(v * spec.contrast + spec.bias);

        var k = v * (nRamp - 1);
        var k0 = Math.floor(k), k1 = Math.min(nRamp - 1, k0 + 1);
        var kf = k - k0;
        var col = U.mixRgb(ramp[k0], ramp[k1], kf);

        var g = spec.gloss;
        // Sparkle: rare bright pixels that catch a specular hit and read as
        // ice crystals under a moving lantern.
        if (spec.sparkle > 0) {
          var sp = U.hash2(x * 3 + 1, y * 5 + 2, seed + 3301);
          if (sp > 1 - spec.sparkle) {
            col = [Math.min(1, col[0] + 0.45), Math.min(1, col[1] + 0.45), Math.min(1, col[2] + 0.42)];
            g = Math.min(1, g + 0.5);
            v += 0.12;
          }
        }

        var p = i * 4;
        d[p] = col[0] * 255; d[p + 1] = col[1] * 255; d[p + 2] = col[2] * 255; d[p + 3] = 255;
        height[i] = v * spec.relief - crackAmt * spec.relief * 0.9;
        gloss[i] = g;
      }
    }
    ctx.putImageData(img, 0, 0);
    // The raw bytes are kept: chunk baking samples them thousands of times a
    // slab, and getImageData per bake was most of the bake.
    mats[name] = { ctx: ctx, canvas: ctx.canvas, data: d, height: height, gloss: gloss, spec: spec };
    return mats[name];
  }

  R.TILE = TILE;

  // The five materials the mountain is made of, in build order. They are
  // exposed as a list so boot can generate one per frame and keep the
  // progress bar honest: this is the most expensive thing the game does.
  var SPECS = [
    // Dark alpine granite, wet-looking, heavily bedded.
    ['rock', {
      seed: 101, freq: 38, contrast: 1.35, bias: -0.12, relief: 1.0,
      strata: 0.16, strataFreq: 0.055, crack: 0.42, sparkle: 0.004, gloss: 0.20,
      ramp: ['#23262f', '#31363f', '#434852', '#575d68', '#6e7480', '#878d99', '#a4a9b3']
    }],
    // The same stone with snow packed into every ledge and crack.
    ['rock_snow', {
      seed: 233, freq: 35, contrast: 1.25, bias: 0.04, relief: 0.9,
      strata: 0.14, strataFreq: 0.05, crack: 0.34, sparkle: 0.02, gloss: 0.34,
      ramp: ['#3a414d', '#4c5563', '#65707f', '#8290a1', '#a4b3c4', '#c6d5e3', '#e6f0f8']
    }],
    // Glacier ice: fewer, wider planes, deep blue in the hollows.
    ['ice', {
      seed: 577, freq: 24, contrast: 1.5, bias: 0.02, relief: 0.72,
      strata: 0.10, strataFreq: 0.032, crack: 0.55, sparkle: 0.035, gloss: 0.85,
      ramp: ['#123a5e', '#1c5480', '#2c74a3', '#4d9cc6', '#7cc0e0', '#b2e0f2', '#e6f8ff']
    }],
    // Windslab snow: soft, almost featureless, all of its detail in relief.
    ['snow', {
      seed: 811, freq: 30, contrast: 1.30, bias: 0.16, relief: 0.92,
      strata: 0.10, strataFreq: 0.04, crack: 0.34, sparkle: 0.05, gloss: 0.45,
      ramp: ['#69809b', '#8098b2', '#9bb2c8', '#b6cbdd', '#cfe1ee', '#e6f2fa', '#ffffff']
    }],
    // Near-black rock for the foreground occluders, which should read as
    // silhouette and nothing else.
    ['shadowrock', {
      seed: 1301, freq: 34, contrast: 1.5, bias: -0.30, relief: 1.1,
      strata: 0.16, strataFreq: 0.06, crack: 0.45, sparkle: 0.002, gloss: 0.12,
      ramp: ['#080a10', '#0d1118', '#141a24', '#1c2431', '#252f3e', '#303c4d', '#3d4a5d']
    }]
  ];

  R.count = function () { return SPECS.length; };
  R.nameOf = function (i) { return SPECS[i][0]; };
  R.buildOne = function (i) { return build(SPECS[i][0], SPECS[i][1]); };
  R.build = function () { for (var i = 0; i < SPECS.length; i++) R.buildOne(i); };

  R.get = function (name) { return mats[name] || mats.rock; };
  R.all = function () { return mats; };

  // Sample a material's height at a wrapped world coordinate.
  R.heightAt = function (mat, x, y) {
    var ix = ((x | 0) % TILE + TILE) % TILE;
    var iy = ((y | 0) % TILE + TILE) % TILE;
    return mat.height[iy * TILE + ix];
  };

  R.glossAt = function (mat, x, y) {
    var ix = ((x | 0) % TILE + TILE) % TILE;
    var iy = ((y | 0) % TILE + TILE) % TILE;
    return mat.gloss[iy * TILE + ix];
  };

  IF.Rock = R;
})();
