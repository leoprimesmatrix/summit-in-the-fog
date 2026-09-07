// Text.
//
// m5x7 is a pixel font, so it is rendered once at its design size with
// smoothing off, thresholded to hard pixels, and packed into the sprite
// atlas as one quad per glyph. Drawing a string is then just the batcher,
// and text can be tinted, faded and scaled by whole numbers without ever
// going soft.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var A = IF.Atlas;
  var B = IF.Batch;

  var F = {};

  var SIZE = 16;            // m5x7's design size
  var CELL_W = 20, CELL_H = 20;
  var BASE = 14;            // baseline inside the cell
  var FIRST = 32, LAST = 126;

  var widths = {};
  var ready = false;
  var loaded = false;

  F.HEIGHT = 11;            // usable line height at scale 1
  F.LINE = 12;

  F.load = function (url, family) {
    if (!window.FontFace) return Promise.resolve(false);
    try {
      var ff = new window.FontFace(family, 'url(' + url + ')');
      return ff.load().then(function (f) {
        document.fonts.add(f);
        loaded = true;
        return true;
      }).catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  };

  // Render the charset into the atlas. Each glyph is thresholded: a pixel
  // font that has been anti-aliased by the rasteriser looks muddy next to
  // hard-edged art.
  F.build = function (family) {
    var probe = U.ctx2d(CELL_W, CELL_H);
    probe.font = SIZE + 'px "' + family + '", monospace';
    probe.textBaseline = 'alphabetic';

    for (var code = FIRST; code <= LAST; code++) {
      var ch = String.fromCharCode(code);
      var adv = Math.round(probe.measureText(ch).width);
      if (!isFinite(adv) || adv <= 0) adv = 4;
      widths[code] = adv;

      if (ch === ' ') continue;

      var ctx = U.ctx2d(CELL_W, CELL_H);
      ctx.imageSmoothingEnabled = false;
      ctx.font = SIZE + 'px "' + family + '", monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ch, 1, BASE);

      var img = ctx.getImageData(0, 0, CELL_W, CELL_H);
      var d = img.data;
      var minX = CELL_W, maxX = -1, minY = CELL_H, maxY = -1;
      for (var y = 0; y < CELL_H; y++) {
        for (var x = 0; x < CELL_W; x++) {
          var i = (y * CELL_W + x) * 4;
          var a = d[i + 3];
          if (a >= 110) {
            d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          } else {
            d[i + 3] = 0;
          }
        }
      }
      if (maxX < 0) continue;
      ctx.putImageData(img, 0, 0);

      // Trim to the inked box and remember where it sat, so kerning and
      // baseline survive the crop.
      var gw = maxX - minX + 1, gh = maxY - minY + 1;
      var g = U.ctx2d(gw, gh);
      g.drawImage(ctx.canvas, minX, minY, gw, gh, 0, 0, gw, gh);
      var f = A.add('g' + code, g, { flat: 1, gloss: 0, ox: 0, oy: 0 });
      if (f) { f.bx = minX - 1; f.by = minY - BASE; }
    }
    ready = true;
  };

  F.loaded = function () { return loaded; };
  F.ready = function () { return ready; };

  F.charWidth = function (code) {
    var w = widths[code];
    return w === undefined ? 5 : w;
  };

  F.width = function (str, scale) {
    scale = scale || 1;
    var w = 0;
    for (var i = 0; i < str.length; i++) w += F.charWidth(str.charCodeAt(i));
    return w * scale;
  };

  // Draw a string. Options:
  //   scale     whole numbers only, or the pixels stop lining up
  //   color     hex or rgb triple
  //   alpha
  //   align     'left' | 'center' | 'right'
  //   shadow    a dark offset copy, one pixel down
  //   glow      an additive pass behind, for anything that should read as lit
  F.text = function (str, x, y, o) {
    if (!ready || !str) return 0;
    o = o || {};
    var D = IF.Draw;
    var scale = o.scale || 1;
    var w = F.width(str, scale);
    var ox = 0;
    if (o.align === 'center') ox = -Math.round(w / 2);
    else if (o.align === 'right') ox = -w;
    x = Math.round(x + ox); y = Math.round(y);

    if (o.shadow) {
      drawRun(str, x + (o.shadowX === undefined ? 1 : o.shadowX),
              y + (o.shadowY === undefined ? 1 : o.shadowY),
              scale, o.shadowColor || '#050810',
              o.shadowAlpha === undefined ? 0.8 : o.shadowAlpha, 0);
    }
    drawRun(str, x, y, scale, o.color || '#ffffff',
            o.alpha === undefined ? 1 : o.alpha, o.emissive || 0);
    return w;
  };

  function drawRun(str, x, y, scale, color, alpha, emissive) {
    var B2 = IF.Batch;
    var col = IF.Draw.packColor(color, alpha);
    var par = B2.params(emissive, 0, 0, 0);
    var pen = x;
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      var adv = F.charWidth(code) * scale;
      if (code !== 32) {
        var f = A.frames['g' + code];
        if (f) {
          B2.quad(pen + f.bx * scale, y + f.by * scale, f.w * scale, f.h * scale,
                  f.u0, f.v0, f.u1, f.v1, col, par);
        }
      }
      pen += adv;
    }
  }

  // Text with a soft additive halo behind it. Used for anything that should
  // look like it is emitting: the altimeter, pickups, the summit banner.
  F.glowText = function (str, x, y, o) {
    o = o || {};
    var D = IF.Draw;
    var scale = o.scale || 1;
    var w = F.width(str, scale);
    var gx = x;
    if (o.align === 'center') gx = x;
    else if (o.align === 'right') gx = x - w / 2;
    else gx = x + w / 2;
    D.blend('add');
    D.glow(gx, y - F.HEIGHT * scale * 0.35, w * 0.62 + 14 * scale,
           o.glowColor || o.color || '#ffffff', (o.glow === undefined ? 0.4 : o.glow));
    D.blend('normal');
    return F.text(str, x, y, o);
  };

  IF.Font = F;
})();
