(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var COL = C.COLORS;

  // The title wordmark, rendered once at boot into an offscreen canvas.
  // Bold letters cut from rock with a snow mound on top, a pixel bevel, a
  // square ink outline and a drop shadow; a swallow-tailed ribbon carries the
  // subtitle. Soft fog rolls through the lower half live, so even the title
  // is a little hidden.

  var L = { img: null, w: 0, h: 0, wordY: 0, wordH: 0 };

  var WORD = 'SUMMIT';
  var SUB = 'IN THE FOG';
  var SCALE = 6;
  var BOLD = 2;          // dilation radius
  var GAP = 5;           // extra px between letters after dilation
  var SUB_SCALE = 2;

  // Palette for the letter body, top to bottom.
  var SNOW = COL.snow, SNOW_SHADE = '#cfdfeb';
  var ROCK_HI = '#e6d2b3', ROCK = '#c4a583', ROCK_MID = '#a4866a', ROCK_LO = '#7d6552', ROCK_DEEP = '#5a4839';

  // ---- mask helpers -----------------------------------------------------

  // Letters laid out with breathing room so bold strokes never touch.
  function wordMask(text, scale, gap, bold) {
    var gw = Font.GLYPH_W * scale, gh = Font.GLYPH_H * scale;
    var adv = gw + gap + bold * 2;
    var w = text.length * adv - gap, h = gh + bold * 2;
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    for (var i = 0; i < text.length; i++) {
      var g = U.makeCanvas(gw, gh);
      Font.draw(g.getContext('2d'), text.charAt(i), 0, 0, { scale: scale, color: '#fff' });
      var d = dilate(g, bold);
      cx.drawImage(d, i * adv, 0);
    }
    return cv;
  }

  function dilate(mask, r) {
    if (r <= 0) return mask;
    var cv = U.makeCanvas(mask.width + r * 2, mask.height + r * 2);
    var cx = cv.getContext('2d');
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        // Rounded corners: skip the extreme diagonals.
        if (Math.abs(dx) === r && Math.abs(dy) === r) continue;
        cx.drawImage(mask, r + dx, r + dy);
      }
    }
    return cv;
  }

  // Square (Chebyshev) outline so every corner gets the same weight.
  function outline(mask, color, px) {
    var w = mask.width + px * 2, h = mask.height + px * 2;
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    for (var dx = -px; dx <= px; dx++) {
      for (var dy = -px; dy <= px; dy++) cx.drawImage(mask, px + dx, px + dy);
    }
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, w, h);
    return cv;
  }

  function alphaGrid(mask) {
    var w = mask.width, h = mask.height;
    var d = mask.getContext('2d').getImageData(0, 0, w, h).data;
    return {
      w: w, h: h,
      on: function (x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        return d[(y * w + x) * 4 + 3] > 0;
      }
    };
  }

  // ---- the letter body ----------------------------------------------------

  // Snow mound on top, then rock in clean bands with a 1px bevel: light on
  // the upper-left edges, dark on the lower-right, like carved pixel art.
  function carve(mask, seed) {
    var g = alphaGrid(mask);
    var w = g.w, h = g.h;
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(seed);

    // Per-column top edge for the snow line.
    var topEdge = [];
    for (var x = 0; x < w; x++) {
      topEdge[x] = -1;
      for (var y = 0; y < h; y++) if (g.on(x, y)) { topEdge[x] = y; break; }
    }

    var snowDepth = 7;   // snow thickness below the top edge, in px

    for (var y2 = 0; y2 < h; y2++) {
      var t = y2 / (h - 1);
      for (var x2 = 0; x2 < w; x2++) {
        if (!g.on(x2, y2)) continue;

        var col;
        var fromTop = y2 - topEdge[x2];
        var leftOpen = !g.on(x2 - 1, y2);
        var rightOpen = !g.on(x2 + 1, y2);
        var downOpen = !g.on(x2, y2 + 1);
        var upOpen = !g.on(x2, y2 - 1);

        if (fromTop < snowDepth) {
          // Snow zone: white with a shaded lower lip and darker right rim.
          col = SNOW;
          if (fromTop >= snowDepth - 2) col = SNOW_SHADE;
          if (rightOpen || downOpen) col = SNOW_SHADE;
          if (upOpen || leftOpen) col = '#ffffff';
        } else {
          // Rock zone: three bands with ordered dither between them.
          var band;
          if (t < 0.50) band = 0;
          else if (t < 0.78) band = 1;
          else band = 2;
          var cols = [ROCK, ROCK_MID, ROCK_LO];
          col = cols[band];
          // Dither the two rows above each boundary.
          var b1 = Math.round(0.50 * (h - 1)), b2 = Math.round(0.78 * (h - 1));
          if ((y2 === b1 - 1 || y2 === b2 - 1) && ((x2 + y2) & 1)) col = cols[band + 1];
          if ((y2 === b1 - 2 || y2 === b2 - 2) && ((x2 + y2) % 4 === 0)) col = cols[band + 1];

          // Bevel.
          if (leftOpen || upOpen) col = ROCK_HI;
          if (rightOpen || downOpen) col = ROCK_DEEP;
          if ((leftOpen || upOpen) && (rightOpen || downOpen)) col = ROCK_MID;

          // Sparse short cracks for character, never on a bevel edge.
          if (!leftOpen && !rightOpen && !upOpen && !downOpen && rnd() < 0.012) {
            cx.fillStyle = ROCK_DEEP;
            cx.fillRect(x2, y2, 1, 1);
            if (g.on(x2 + 1, y2) && !(!g.on(x2 + 2, y2))) cx.fillRect(x2 + 1, y2, 1, 1);
            continue;
          }
        }
        cx.fillStyle = col;
        cx.fillRect(x2, y2, 1, 1);
      }
    }

    return { img: cv, topEdge: topEdge };
  }

  // Rounded snow mounds sitting on top of the letters, plus a few wide,
  // tapered icicles under flat undersides.
  function weather(target, mask, topEdge, seed, yOff) {
    var g = alphaGrid(mask);
    var cx = target.getContext('2d');
    var rnd = U.mulberry32(seed);
    var w = g.w;

    // Mounds: run along each continuous top edge segment and lay a smooth
    // hump over it (sine shaped, 2-3 px high, tapering to 0 at both ends).
    var x = 0;
    while (x < w) {
      if (topEdge[x] < 0) { x++; continue; }
      var start = x, ty = topEdge[x];
      while (x < w && topEdge[x] === ty) x++;
      var len = x - start;
      if (len < 4) continue;
      var peak = len >= 12 ? 3 : 2;
      var phase = rnd() * 0.6 - 0.3;
      for (var i = 0; i < len; i++) {
        var u = (i + 0.5) / len;
        var hgt = Math.round(Math.sin(Math.PI * U.clamp(u + phase * (0.5 - u), 0, 1)) * peak);
        for (var k = 1; k <= hgt; k++) {
          cx.fillStyle = (k === hgt && hgt > 1) ? '#ffffff' : SNOW;
          cx.fillRect(start + i, yOff + ty - k, 1, 1);
        }
      }
    }

    // Icicles: at most one per flat underside segment, wide at the root.
    var botEdge = [];
    for (var bx = 0; bx < w; bx++) {
      botEdge[bx] = -1;
      for (var by = g.h - 1; by >= 0; by--) if (g.on(bx, by)) { botEdge[bx] = by; break; }
    }
    var x3 = 0;
    while (x3 < w) {
      if (botEdge[x3] < 0) { x3++; continue; }
      var s3 = x3, by3 = botEdge[x3];
      while (x3 < w && botEdge[x3] === by3) x3++;
      var len3 = x3 - s3;
      if (len3 < 10 || rnd() < 0.45) continue;
      var ix = s3 + 3 + Math.floor(rnd() * (len3 - 6));
      var ilen = 3 + Math.floor(rnd() * 3);
      for (var j = 1; j <= ilen; j++) {
        var wide = j <= Math.ceil(ilen / 2) ? 2 : 1;
        cx.fillStyle = (j === ilen) ? SNOW_SHADE : '#eef5fb';
        cx.fillRect(ix, yOff + by3 + j, wide, 1);
        if (wide === 2) { cx.fillStyle = SNOW_SHADE; cx.fillRect(ix + 1, yOff + by3 + j, 1, 1); }
      }
    }
  }

  // ---- ribbon and emblem ------------------------------------------------

  function ribbon(cx, x, y, w, h) {
    var notch = Math.floor(h / 2);
    function shape(inset, color, dy) {
      cx.fillStyle = color;
      cx.beginPath();
      cx.moveTo(x + inset, y + inset + dy);
      cx.lineTo(x + w - inset, y + inset + dy);
      cx.lineTo(x + w - notch, y + h / 2 + dy);
      cx.lineTo(x + w - inset, y + h - inset + dy);
      cx.lineTo(x + inset, y + h - inset + dy);
      cx.lineTo(x + notch, y + h / 2 + dy);
      cx.closePath();
      cx.fill();
    }
    cx.globalAlpha = 0.45; shape(0, COL.ink, 3); cx.globalAlpha = 1;
    shape(0, COL.ink, 0);
    shape(1, COL.parkaDark, 0);
    cx.save();
    cx.beginPath(); cx.rect(x, y, w, Math.floor(h / 2)); cx.clip();
    shape(1, COL.parka, 0);
    cx.restore();
    // Subtle shine: a 1px highlight along the top edge and a soft diagonal
    // light sweep across the left third, clipped to the cloth.
    cx.save();
    cx.beginPath();
    cx.moveTo(x + 1, y + 1); cx.lineTo(x + w - 1, y + 1); cx.lineTo(x + w - notch, y + h / 2);
    cx.lineTo(x + w - 1, y + h - 1); cx.lineTo(x + 1, y + h - 1); cx.lineTo(x + notch, y + h / 2);
    cx.closePath(); cx.clip();
    cx.fillStyle = '#f08a70';
    cx.fillRect(x + notch, y + 1, w - notch * 2, 1);
    cx.globalAlpha = 0.35;
    cx.fillStyle = '#ffd6c8';
    for (var i = 0; i < h; i++) cx.fillRect(x + notch + 6 + Math.floor((h - i) * 0.7), y + i, 10, 1);
    cx.globalAlpha = 0.18;
    for (var j = 0; j < h; j++) cx.fillRect(x + notch + 22 + Math.floor((h - j) * 0.7), y + j, 4, 1);
    cx.restore();
    // Stitch line along the fold.
    cx.fillStyle = COL.parkaDark;
    for (var sx = x + notch + 2; sx < x + w - notch - 2; sx += 4) cx.fillRect(sx, y + Math.floor(h / 2), 2, 1);
  }

  function peakEmblem() {
    var rows = [
      '...........#..............',
      '..........#w#.............',
      '.........#www#............',
      '........#wwwww#...#.......',
      '.......#wwbwwww#.#w#......',
      '......#bbbbbbbbb#www#.....',
      '.....#bbbbbbbbbbbwwbb#....',
      '....#bbbcbbbbbbbbbbbbb#...',
      '...#bbbccbbbbbbbbbcbbbb#..',
      '..#bbbcccbbbbbbbbbccbbbb#.',
      '.#bbbccccbbbbbbbbcccbbbbb#',
      '#bbccccccbbbbbbbccccbbbbbb',
      '#cccccccccbbbbbccccccbbbbc',
      'ccccccccccccbbccccccccccc.',
      '.cccccccccccccccccccccccc.',
      '..######################..'
    ];
    return SITF.Sprites.make(rows, { '#': COL.ink, 'w': SNOW, 'b': '#7c8b99', 'c': '#54616e' });
  }

  // ---- assembly ---------------------------------------------------------

  L.build = function () {
    var mask = wordMask(WORD, SCALE, GAP, BOLD);
    var carved = carve(mask, 4242);

    // Padded canvas so the snow mounds and icicles have room.
    var padTop = 4, padBot = 7;
    var body = U.makeCanvas(mask.width, mask.height + padTop + padBot);
    body.getContext('2d').drawImage(carved.img, 0, padTop);
    weather(body, mask, carved.topEdge, 99, padTop);

    var ring = outline(body, COL.ink, 2);

    var subMask = wordMask(SUB, SUB_SCALE, 1, 0);
    var subFill = U.makeCanvas(subMask.width, subMask.height);
    var sfc = subFill.getContext('2d');
    sfc.fillStyle = COL.text; sfc.fillRect(0, 0, subMask.width, subMask.height);
    sfc.fillStyle = '#d9e2ec'; sfc.fillRect(0, Math.floor(subMask.height * 0.6), subMask.width, subMask.height);
    sfc.globalCompositeOperation = 'destination-in'; sfc.drawImage(subMask, 0, 0);
    var subRing = outline(subMask, COL.ink, 1);

    var emblem = peakEmblem();

    var pad = 4;
    var w = ring.width + pad * 2;
    var wordH = ring.height;
    var ribbonH = subRing.height + 8;
    var h = pad + wordH + ribbonH + pad;
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');

    var wx = pad, wy = pad;

    // Drop shadow, outline, body.
    cx.globalAlpha = 0.5;
    cx.drawImage(ring, wx + 3, wy + 4);
    cx.globalAlpha = 1;
    cx.drawImage(ring, wx, wy);
    cx.drawImage(body, wx + 2, wy + 2);

    // Ribbon overlaps the base of the letters slightly, pinning it in place.
    var ry = wy + wordH - 6;
    var rw = subRing.width + 64;
    var rx = Math.round((w - rw) / 2) + 6;
    ribbon(cx, rx, ry, rw, ribbonH);
    var subX = rx + Math.round((rw - subRing.width) / 2);
    cx.drawImage(subRing, subX, ry + 4);
    cx.drawImage(subFill, subX + 1, ry + 5);
    cx.drawImage(emblem, rx - emblem.width + 10, ry + ribbonH - emblem.height + 1);

    L.img = cv;
    L.w = w; L.h = h;
    L.wordY = wy; L.wordH = wordH;
  };

  // Draw centred at cxPos with top at y. Two soft fog bands drift across the
  // lower half of the word.
  L.draw = function (ctx, cxPos, y, t) {
    if (!L.img) return;
    var x = Math.round(cxPos - L.w / 2);
    y = Math.round(y);
    ctx.drawImage(L.img, x, y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + L.wordY + Math.round(L.wordH * 0.5), L.w - 4, Math.round(L.wordH * 0.42));
    ctx.clip();
    ctx.fillStyle = COL.fog;
    for (var i = 0; i < 2; i++) {
      var speed = 7 + i * 5;
      var wx = x - 60 + ((t * speed + i * 90) % (L.w + 120));
      var wy = y + L.wordY + Math.round(L.wordH * 0.58) + i * 9 + Math.round(Math.sin(t * 0.7 + i * 2) * 2);
      ctx.globalAlpha = 0.16;
      ctx.fillRect(Math.round(wx), wy, 70, 4);
      ctx.globalAlpha = 0.08;
      ctx.fillRect(Math.round(wx) - 14, wy - 2, 98, 8);
    }
    ctx.restore();
  };

  SITF.Logo = L;
})();
