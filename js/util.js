(function () {
  'use strict';
  var C = SITF.Config;

  var U = {};

  U.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  U.smoothstep = function (e0, e1, x) {
    if (e0 === e1) return x < e0 ? 0 : 1;
    var t = U.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  U.easeOutQuad = function (t) { return 1 - (1 - t) * (1 - t); };
  U.easeInQuad = function (t) { return t * t; };
  U.easeOutCubic = function (t) { var p = 1 - t; return 1 - p * p * p; };
  U.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1, p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  };

  U.formatTime = function (sec) {
    if (sec == null || !isFinite(sec)) return '--:--.-';
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    var whole = Math.floor(s);
    var tenth = Math.floor((s - whole) * 10);
    return m + ':' + (whole < 10 ? '0' : '') + whole + '.' + tenth;
  };

  // Pixel-friendly panel: rectangle with 1px corner notches instead of arcs.
  U.panel = function (ctx, x, y, w, h, color, alpha) {
    ctx.save();
    ctx.globalAlpha = (alpha == null ? 1 : alpha);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.restore();
  };

  U.zoneIndexOf = function (row) {
    var Z = C.ZONES;
    for (var i = 0; i < Z.length; i++) {
      if (row >= Z[i].from && row <= Z[i].to) return i;
    }
    return row < Z[0].from ? 0 : Z.length - 1;
  };

  U.zoneOf = function (row) { return C.ZONES[U.zoneIndexOf(row)]; };

  // Linear interpolation of a numeric zone field across zone borders,
  // blended over `blend` rows so density/speed shifts are not a hard step.
  U.zoneField = function (rowFloat, field, blend) {
    var Z = C.ZONES;
    if (blend == null) blend = 8;
    var i = U.zoneIndexOf(Math.floor(rowFloat));
    var z = Z[i];
    var v = z[field];
    if (i < Z.length - 1) {
      var edge = z.to + 1;
      if (rowFloat > edge - blend) {
        var t = U.clamp((rowFloat - (edge - blend)) / blend, 0, 1);
        v = U.lerp(v, Z[i + 1][field], t);
      }
    }
    if (i > 0) {
      var start = z.from;
      if (rowFloat < start + blend) {
        var t2 = U.clamp((start + blend - rowFloat) / blend, 0, 1);
        v = U.lerp(v, Z[i - 1][field], t2 * 0.5);
      }
    }
    return v;
  };

  // Parse '#rrggbb' or 'rgb(r,g,b)' -> [r,g,b], so mixed colours can be
  // fed back in and mixed again.
  U.hexToRgb = function (hex) {
    if (hex.charAt(0) !== '#') {
      var m = hex.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) return [+m[1], +m[2], +m[3]];
      return [255, 255, 255];
    }
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  };

  U.mixHex = function (a, b, t) {
    var ca = U.hexToRgb(a), cb = U.hexToRgb(b);
    var r = Math.round(U.lerp(ca[0], cb[0], t));
    var g = Math.round(U.lerp(ca[1], cb[1], t));
    var bl = Math.round(U.lerp(ca[2], cb[2], t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  };

  U.rgba = function (hex, a) {
    var c = U.hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };

  U.makeCanvas = function (w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    return cv;
  };

  U.storageGet = function (key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  };
  U.storageSet = function (key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* private mode */ }
  };

  SITF.Util = U;
})();
