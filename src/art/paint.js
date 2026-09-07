// Pixel-art drawing helpers.
//
// Canvas paths are the wrong tool at sixteen pixels tall: an arc leaves a
// grey fringe and a stroked line wanders off the grid. Everything here snaps
// to whole pixels and fills whole pixels, so the art stays hard-edged and the
// normal generator gets a clean silhouette to work from.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;

  var P = {};

  P.px = function (c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(x | 0, y | 0, 1, 1);
  };

  P.rect = function (c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  // A rectangle with the four corner pixels knocked out. At this scale that
  // is what "rounded" means.
  P.soft = function (c, x, y, w, h, col) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 3 || h < 3) { P.rect(c, x, y, w, h, col); return; }
    c.fillStyle = col;
    c.fillRect(x + 1, y, w - 2, h);
    c.fillRect(x, y + 1, w, h - 2);
  };

  // Filled ellipse, rasterised by scanline so the edge lands on pixel bounds.
  P.ellipse = function (c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    var y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (var y = y0; y <= y1; y++) {
      var dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      var dx = Math.sqrt(1 - dy * dy) * rx;
      var xa = Math.round(cx - dx), xb = Math.round(cx + dx);
      if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
    }
  };

  P.circle = function (c, cx, cy, r, col) { P.ellipse(c, cx, cy, r, r, col); };

  // A limb: a run of squares stamped along a segment. Thickness is in pixels
  // and stays constant, which a stroked path will not give you.
  P.limb = function (c, x0, y0, x1, y1, t, col) {
    c.fillStyle = col;
    var dx = x1 - x0, dy = y1 - y0;
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    var h = t / 2;
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      var x = Math.round(x0 + dx * f - h);
      var y = Math.round(y0 + dy * f - h);
      c.fillRect(x, y, Math.round(t), Math.round(t));
    }
  };

  // A polygon, scanline-filled on the pixel grid.
  P.poly = function (c, pts, col) {
    c.fillStyle = col;
    var minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < pts.length; i += 2) {
      if (pts[i + 1] < minY) minY = pts[i + 1];
      if (pts[i + 1] > maxY) maxY = pts[i + 1];
    }
    for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      var sy = y + 0.5;
      var xs = [];
      for (i = 0; i < pts.length; i += 2) {
        var ax = pts[i], ay = pts[i + 1];
        var j = (i + 2) % pts.length;
        var bx = pts[j], by = pts[j + 1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          xs.push(ax + (sy - ay) / (by - ay) * (bx - ax));
        }
      }
      xs.sort(function (a, b) { return a - b; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
        if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
      }
    }
  };

  // Add a one-pixel outline around everything opaque. Reads as ink, and gives
  // the normal generator a crisp cliff to bevel from.
  P.outline = function (c, col, alsoDiagonal) {
    var w = c.canvas.width, h = c.canvas.height;
    var img = c.getImageData(0, 0, w, h);
    var d = img.data;
    var mask = new Uint8Array(w * h);
    var i, x, y;
    for (i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 20 ? 1 : 0;
    c.fillStyle = col;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (mask[i]) continue;
        var hit = (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) ||
                  (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
        if (!hit && alsoDiagonal) {
          hit = (x > 0 && y > 0 && mask[i - w - 1]) || (x < w - 1 && y > 0 && mask[i - w + 1]) ||
                (x > 0 && y < h - 1 && mask[i + w - 1]) || (x < w - 1 && y < h - 1 && mask[i + w + 1]);
        }
        if (hit) c.fillRect(x, y, 1, 1);
      }
    }
  };

  // Multiply-darken or screen-lighten the top or bottom edge of every opaque
  // run, which is how a flat shape acquires a lip.
  P.edgeLight = function (c, topCol, topA, botCol, botA) {
    var w = c.canvas.width, h = c.canvas.height;
    var img = c.getImageData(0, 0, w, h);
    var d = img.data;
    var op = new Uint8Array(w * h);
    var i, x, y;
    for (i = 0; i < w * h; i++) op[i] = d[i * 4 + 3] > 20 ? 1 : 0;
    c.save();
    c.globalAlpha = 1;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!op[i]) continue;
        if (topCol && (y === 0 || !op[i - w])) {
          c.globalAlpha = topA; c.fillStyle = topCol; c.fillRect(x, y, 1, 1);
        } else if (botCol && (y === h - 1 || !op[i + w])) {
          c.globalAlpha = botA; c.fillStyle = botCol; c.fillRect(x, y, 1, 1);
        }
      }
    }
    c.restore();
  };

  // Speckle an area with value noise in a palette. The workhorse for stone,
  // ice and snow: it gives the normal generator something to bite on.
  P.grain = function (c, x, y, w, h, cols, seed, scale, alpha) {
    scale = scale || 3;
    alpha = alpha === undefined ? 1 : alpha;
    c.save();
    c.globalAlpha = alpha;
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var n = U.fbm2((x + i) / scale, (y + j) / scale, 3, seed);
        var k = Math.min(cols.length - 1, Math.floor(n * cols.length));
        c.fillStyle = cols[k];
        c.fillRect(x + i, y + j, 1, 1);
      }
    }
    c.restore();
  };

  // Clip everything already drawn to a mask painted by fn. Used to grain a
  // silhouette without spilling past it.
  P.inside = function (c, fn) {
    var w = c.canvas.width, h = c.canvas.height;
    var before = c.getImageData(0, 0, w, h);
    fn(c);
    var after = c.getImageData(0, 0, w, h);
    for (var i = 0; i < w * h; i++) {
      if (before.data[i * 4 + 3] <= 20) {
        after.data[i * 4] = 0; after.data[i * 4 + 1] = 0;
        after.data[i * 4 + 2] = 0; after.data[i * 4 + 3] = 0;
      } else if (after.data[i * 4 + 3] <= 20) {
        after.data[i * 4] = before.data[i * 4];
        after.data[i * 4 + 1] = before.data[i * 4 + 1];
        after.data[i * 4 + 2] = before.data[i * 4 + 2];
        after.data[i * 4 + 3] = before.data[i * 4 + 3];
      }
    }
    c.putImageData(after, 0, 0);
  };

  // A radial falloff sprite, used for every glow, spark and soft particle.
  // `power` shapes the curve: 1 is linear, 3 is a tight core with a long tail.
  P.glow = function (c, cx, cy, r, col, power, inner) {
    power = power || 2.2;
    inner = inner === undefined ? 0.0 : inner;
    var rgb = U.rgb(col);
    var img = c.getImageData(0, 0, c.canvas.width, c.canvas.height);
    var d = img.data;
    var w = c.canvas.width, h = c.canvas.height;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        var dist = Math.sqrt(dx * dx + dy * dy) / r;
        if (dist >= 1) continue;
        var a = Math.pow(1 - dist, power);
        if (inner > 0 && dist < inner) a = 1;
        var i = (y * w + x) * 4;
        var prev = d[i + 3] / 255;
        var na = Math.min(1, prev + a);
        d[i] = Math.min(255, rgb[0] * 255 * a + d[i] * prev);
        d[i + 1] = Math.min(255, rgb[1] * 255 * a + d[i + 1] * prev);
        d[i + 2] = Math.min(255, rgb[2] * 255 * a + d[i + 2] * prev);
        d[i + 3] = na * 255;
      }
    }
    c.putImageData(img, 0, 0);
  };

  // Shift a colour's lightness without leaving its hue. Palettes stay
  // coherent when every shade comes from one root colour.
  P.shade = function (hex, amt) {
    var rgb = U.rgb(hex);
    var r, g, b;
    if (amt >= 0) {
      r = rgb[0] + (1 - rgb[0]) * amt;
      g = rgb[1] + (1 - rgb[1]) * amt;
      b = rgb[2] + (1 - rgb[2]) * amt;
    } else {
      r = rgb[0] * (1 + amt); g = rgb[1] * (1 + amt); b = rgb[2] * (1 + amt);
    }
    return U.css([r, g, b]);
  };

  // Ramp a colour toward another; used for cold shadows and warm highlights,
  // which is what stops shading looking like grey paint.
  P.mix = function (a, b, t) {
    return U.css(U.mixRgb(U.rgb(a), U.rgb(b), t));
  };

  P.ramp = function (hex, n, lo, hi, coolHex, warmHex) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      var amt = lo + (hi - lo) * t;
      var c = P.shade(hex, amt);
      if (amt < 0 && coolHex) c = P.mix(c, coolHex, -amt * 0.45);
      if (amt > 0 && warmHex) c = P.mix(c, warmHex, amt * 0.35);
      out.push(c);
    }
    return out;
  };

  IF.Paint = P;
})();
