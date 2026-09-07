// Turning flat pixel art into something a light can shape.
//
// Nothing in ICEFALL is drawn twice. Every sprite is painted once, in colour,
// and its normal map is derived: the silhouette is distance-transformed into
// a rounded bevel, the painted luminance is folded in as surface detail, the
// two are blurred together into a height field, and the height field is
// differentiated into normals. A rock drawn as a flat grey blob comes out of
// this with a believable dome on it.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var N = {};

  var INF = 1e9;

  // Chamfer distance transform: for every opaque pixel, how far to the edge.
  // Two sweeps, 3-4 weights, which is close enough to Euclidean for a bevel.
  function distanceField(alpha, w, h) {
    var d = new Float32Array(w * h);
    var i, x, y;
    for (i = 0; i < w * h; i++) d[i] = alpha[i] > 12 ? INF : 0;

    var D1 = 1.0, D2 = 1.41421356;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (d[i] === 0) continue;
        var v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + D1);
        if (y > 0) v = Math.min(v, d[i - w] + D1);
        if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + D2);
        if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + D2);
        d[i] = v;
      }
    }
    for (y = h - 1; y >= 0; y--) {
      for (x = w - 1; x >= 0; x--) {
        i = y * w + x;
        if (d[i] === 0) continue;
        var u = d[i];
        if (x < w - 1) u = Math.min(u, d[i + 1] + D1);
        if (y < h - 1) u = Math.min(u, d[i + w] + D1);
        if (x < w - 1 && y < h - 1) u = Math.min(u, d[i + w + 1] + D2);
        if (x > 0 && y < h - 1) u = Math.min(u, d[i + w - 1] + D2);
        d[i] = u;
      }
    }
    return d;
  }

  // Separable box blur, run twice, which is a good enough gaussian and costs
  // nothing at these sizes.
  function blur(src, w, h, r) {
    if (r <= 0) return src;
    var tmp = new Float32Array(w * h);
    var out = new Float32Array(w * h);
    var x, y, i, k, sum, n;
    for (var pass = 0; pass < 2; pass++) {
      var input = pass === 0 ? src : out;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          sum = 0; n = 0;
          for (k = -r; k <= r; k++) {
            var xx = x + k;
            if (xx < 0 || xx >= w) continue;
            sum += input[y * w + xx]; n++;
          }
          tmp[y * w + x] = sum / n;
        }
      }
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          sum = 0; n = 0;
          for (k = -r; k <= r; k++) {
            var yy = y + k;
            if (yy < 0 || yy >= h) continue;
            sum += tmp[yy * w + x]; n++;
          }
          out[y * w + x] = sum / n;
        }
      }
    }
    return out;
  }

  function smoothstep(e0, e1, v) {
    var t = (v - e0) / (e1 - e0);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  // Build the normal map for one RGBA image.
  //
  //   bevel     pixels over which the silhouette rounds off
  //   detail    how much painted luminance counts as height
  //   strength  overall normal slope
  //   gloss     specular weight written into the alpha channel
  //   soften    blur radius applied to the height field
  //   flat      1 for something that should stay flat (decals, UI)
  N.fromRGBA = function (rgba, w, h, opts) {
    opts = opts || {};
    var bevel = opts.bevel === undefined ? 3.0 : opts.bevel;
    var detail = opts.detail === undefined ? 0.55 : opts.detail;
    var strength = opts.strength === undefined ? 2.4 : opts.strength;
    var gloss = opts.gloss === undefined ? 0.35 : opts.gloss;
    var soften = opts.soften === undefined ? 1 : opts.soften;

    var n = w * h;
    var alpha = new Uint8Array(n);
    var lum = new Float32Array(n);
    var i, p;
    for (i = 0; i < n; i++) {
      p = i * 4;
      alpha[i] = rgba[p + 3];
      lum[i] = (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722) / 255;
    }

    var height = new Float32Array(n);
    if (opts.flat) {
      for (i = 0; i < n; i++) height[i] = 0.5;
    } else {
      var df = distanceField(alpha, w, h);
      // Normalise the painted luminance so a dark sprite still gets relief.
      var lo = 1, hi = 0;
      for (i = 0; i < n; i++) {
        if (alpha[i] < 12) continue;
        if (lum[i] < lo) lo = lum[i];
        if (lum[i] > hi) hi = lum[i];
      }
      var span = Math.max(hi - lo, 0.001);
      for (i = 0; i < n; i++) {
        if (alpha[i] < 12) { height[i] = 0; continue; }
        var dome = smoothstep(0, bevel, df[i]);
        var det = (lum[i] - lo) / span;
        height[i] = dome * (1 - detail) + dome * det * detail;
      }
    }
    height = blur(height, w, h, soften);

    var out = new Uint8ClampedArray(n * 4);
    var glossMap = opts.glossFromLuma;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        i = y * w + x;
        var xl = x > 0 ? height[i - 1] : height[i];
        var xr = x < w - 1 ? height[i + 1] : height[i];
        var yu = y > 0 ? height[i - w] : height[i];
        var yd = y < h - 1 ? height[i + w] : height[i];
        var dx = (xr - xl) * strength;
        var dy = (yd - yu) * strength;
        var nx = -dx, ny = -dy, nz = 1;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        p = i * 4;
        out[p] = (nx / len * 0.5 + 0.5) * 255;
        out[p + 1] = (ny / len * 0.5 + 0.5) * 255;
        out[p + 2] = (nz / len * 0.5 + 0.5) * 255;
        var g = gloss;
        if (glossMap) g = gloss * (0.35 + lum[i] * 0.9);
        out[p + 3] = Math.min(255, g * 255);
      }
    }
    return out;
  };

  // Convenience: same thing straight off a 2D context.
  N.fromContext = function (ctx, opts) {
    var w = ctx.canvas.width, h = ctx.canvas.height;
    var img = ctx.getImageData(0, 0, w, h);
    var data = N.fromRGBA(img.data, w, h, opts);
    var out = ctx.createImageData(w, h);
    out.data.set(data);
    return out;
  };

  // Build a normal map from an explicit height field instead of from the
  // painted art. Terrain uses this: its height comes from the rock noise,
  // which knows far more about the surface than the albedo does.
  N.fromHeight = function (height, w, h, opts) {
    opts = opts || {};
    var strength = opts.strength === undefined ? 2.4 : opts.strength;
    var gloss = opts.gloss === undefined ? 0.35 : opts.gloss;
    var glossField = opts.glossField || null;
    var out = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var xl = x > 0 ? height[i - 1] : height[i];
        var xr = x < w - 1 ? height[i + 1] : height[i];
        var yu = y > 0 ? height[i - w] : height[i];
        var yd = y < h - 1 ? height[i + w] : height[i];
        var nx = -(xr - xl) * strength;
        var ny = -(yd - yu) * strength;
        var len = Math.sqrt(nx * nx + ny * ny + 1);
        var p = i * 4;
        out[p] = (nx / len * 0.5 + 0.5) * 255;
        out[p + 1] = (ny / len * 0.5 + 0.5) * 255;
        out[p + 2] = (1 / len * 0.5 + 0.5) * 255;
        out[p + 3] = Math.min(255, (glossField ? glossField[i] : gloss) * 255);
      }
    }
    return out;
  };

  N.blur = blur;
  N.distanceField = distanceField;

  IF.NormalGen = N;
})();
