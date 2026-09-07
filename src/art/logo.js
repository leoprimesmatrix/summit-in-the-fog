// The wordmark.
//
// Built out of the game's own font rather than drawn separately: the glyphs
// are lifted from the atlas at a whole-number scale, so every edge stays on
// the pixel grid, and then treated - ice gradient, snow packed on the top
// faces, icicles hanging off the bottoms, a hard ink outline.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var P = IF.Paint;
  var A = IF.Atlas;

  var Logo = {};

  var SCALE = 5;
  var PAD = 14;

  // Stamp a string into a context from the atlas glyphs, scaled up hard.
  function stamp(ctx, str, x, y, scale) {
    var src = A.albedoCanvas();
    var F = IF.Font;
    ctx.imageSmoothingEnabled = false;
    var pen = x;
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      var f = A.frames['g' + code];
      if (f && code !== 32) {
        ctx.drawImage(src, f.x, f.y, f.w, f.h,
                      Math.round(pen + f.bx * scale), Math.round(y + f.by * scale),
                      f.w * scale, f.h * scale);
      }
      pen += F.charWidth(code) * scale;
    }
    return pen - x;
  }

  Logo.build = function () {
    var F = IF.Font;
    var text = 'ICEFALL';
    var w = Math.ceil(F.width(text, SCALE)) + PAD * 2;
    var h = 16 * SCALE + PAD * 2;
    var baseline = PAD + 14 * SCALE * 0.78;

    var ctx = U.ctx2d(w, h);
    ctx.fillStyle = '#ffffff';
    stamp(ctx, text, PAD, baseline, SCALE);

    // Find the inked box so the treatment knows where the letters are.
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var mask = new Uint8Array(w * h);
    var minY = h, maxY = 0, x, y, i;
    for (i = 0; i < w * h; i++) {
      mask[i] = d[i * 4 + 3] > 40 ? 1 : 0;
      if (mask[i]) {
        y = (i / w) | 0;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    var span = Math.max(1, maxY - minY);

    // Body: deep ice at the bottom, bright rime at the top, with a band of
    // trapped colour through the middle.
    var RAMP = ['#1d5f8f', '#2b7cae', '#4b9fca', '#78c2e2', '#a9dcf1', '#d8f2fd'];
    for (y = 0; y < h; y++) {
      var t = U.clamp01((y - minY) / span);
      var k = U.clamp(Math.floor((1 - t) * (RAMP.length - 1) + U.noise1(y * 0.6, 3) * 0.9), 0, RAMP.length - 1);
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!mask[i]) continue;
        var col = U.rgb(RAMP[k]);
        // A vertical facet stripe so the letters read as cut ice, not paint.
        var facet = U.noise1(x * 0.09 + y * 0.012, 71);
        var lift = (facet - 0.5) * 0.16;
        var p = i * 4;
        d[p] = U.clamp01(col[0] + lift) * 255;
        d[p + 1] = U.clamp01(col[1] + lift) * 255;
        d[p + 2] = U.clamp01(col[2] + lift * 0.6) * 255;
        d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Snow packed onto every upward-facing surface.
    for (x = 0; x < w; x++) {
      var top = -1;
      for (y = 0; y < h; y++) {
        if (mask[y * w + x]) { top = y; break; }
      }
      if (top < 0) continue;
      var depth = 3 + Math.round(U.fbm1(x * 0.11, 3, 17) * 5);
      for (var s = 0; s < depth; s++) {
        var yy = top + s;
        if (yy >= h || !mask[yy * w + x]) break;
        var shade = s === 0 ? '#ffffff' : (s < depth - 1 ? '#eef7ff' : '#c9dfef');
        P.px(ctx, x, yy, shade);
      }
      // A lip of snow overhanging the edge by a pixel.
      if (U.hash2(x, 3, 41) > 0.45 && top > 0) P.px(ctx, x, top - 1, '#ffffff');
    }

    // Icicles off the bottom edges.
    var rng = U.rng(613);
    for (x = 2; x < w - 2; x++) {
      var bot = -1;
      for (y = h - 1; y >= 0; y--) {
        if (mask[y * w + x]) { bot = y; break; }
      }
      if (bot < 0 || rng() > 0.14) continue;
      var len = 3 + (rng() * 8) | 0;
      for (var q = 1; q <= len; q++) {
        var a = 1 - q / (len + 1);
        P.px(ctx, x, bot + q, q < len * 0.6 ? '#bfe4f7' : '#8cc6e4');
        if (q < 2) P.px(ctx, x + 1, bot + q, '#a9d8ef');
      }
    }

    P.outline(ctx, '#0b2338', false);
    P.outline(ctx, '#061523', false);

    A.add('logo', ctx, {
      bevel: 5, detail: 0.55, strength: 3.0, gloss: 0.85, soften: 1,
      ox: w / 2, oy: h / 2
    });

    // A small mountain glyph used as a bullet and on the pause card.
    A.paint('mark', 18, 14, function (c) {
      P.poly(c, [9, 0, 17, 13, 1, 13], '#8fbcd8');
      P.poly(c, [9, 0, 13.5, 7, 4.5, 7], '#eaf7ff');
      P.poly(c, [9, 0, 9, 13, 1, 13], '#6b9dbd');
      P.outline(c, '#0b2338', false);
    }, { bevel: 2, detail: 0.5, strength: 2.4, gloss: 0.6, ox: 9, oy: 7 });
  };

  Logo.stamp = stamp;
  IF.LogoArt = Logo;
})();
