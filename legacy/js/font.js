(function () {
  'use strict';

  // 5x7 bitmap glyphs. '#' = filled pixel, '.' = transparent.
  var G = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
    ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
    '(': ['..##.', '.#...', '.#...', '.#...', '.#...', '.#...', '..##.'],
    ')': ['.##..', '...#.', '...#.', '...#.', '...#.', '...#.', '.##..'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
    '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
    '·': ['.....', '.....', '.....', '.##..', '.##..', '.....', '.....'],
    '…': ['.....', '.....', '.....', '.....', '.....', '#.#.#', '#.#.#']
  };

  var GW = 5, GH = 7, ADV = 6;

  // Per-glyph advance (pixels at scale 1, including the 1px gap after the
  // glyph). The built-in font is monospaced; a loaded TTF is proportional.
  var ADVS = {};
  var upper = true;   // built-in font has no lowercase

  var F = {};
  F.GLYPH_W = GW;
  F.GLYPH_H = GH;
  F.ADVANCE = ADV;
  F.ttf = false;

  function advOf(ch) {
    if (ch === ' ') return ADVS[' '] || ADV;
    var a = ADVS[ch];
    if (a == null) { a = ADVS[ch.toUpperCase()]; }
    return a == null ? ADV : a;
  }

  F.width = function (text, scale) {
    scale = scale || 1;
    var s = String(text);
    if (upper) s = s.toUpperCase();
    if (s.length === 0) return 0;
    var w = 0;
    for (var i = 0; i < s.length; i++) w += advOf(s.charAt(i));
    return (w - 1) * scale;
  };

  F.height = function (scale) { return GH * (scale || 1); };

  function drawRaw(ctx, text, x, y, scale, color) {
    ctx.fillStyle = color;
    var s = String(text);
    if (upper) s = s.toUpperCase();
    var gx = x;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var adv = advOf(ch) * scale;
      if (ch !== ' ') {
        var g = G[ch] || G[ch.toUpperCase()] || G['?'];
        for (var ry = 0; ry < g.length; ry++) {
          var rowStr = g[ry], rw = rowStr.length;
          var runStart = -1;
          for (var rx = 0; rx <= rw; rx++) {
            var on = (rx < rw && rowStr.charAt(rx) === '#');
            if (on && runStart < 0) runStart = rx;
            if (!on && runStart >= 0) {
              ctx.fillRect(gx + runStart * scale, y + ry * scale, (rx - runStart) * scale, scale);
              runStart = -1;
            }
          }
        }
      }
      gx += adv;
    }
  }

  // Replace the built-in glyphs with a pixel TTF (m5x7) rendered once at its
  // native 16px size and thresholded back to hard pixels, so text stays crisp
  // and the rest of the game keeps drawing with fillRect. Falls back to the
  // built-in font if the face is unavailable. Glyph rows start at the cap top
  // and run 9 deep so descenders fit; capitals stay 7 tall.
  var TTF_FAMILY = 'm5x7', TTF_PX = 16, TTF_TOP = 5, TTF_ROWS = 9;

  F.load = function (done) {
    var finish = function (ok) { if (done) done(ok); };
    if (!document.fonts || !document.fonts.load) { finish(false); return; }
    var timer = setTimeout(function () { timer = null; finish(false); }, 2500);
    document.fonts.load(TTF_PX + 'px ' + TTF_FAMILY).then(function (faces) {
      if (timer === null) return;
      clearTimeout(timer);
      if (!faces || !faces.length || !document.fonts.check(TTF_PX + 'px ' + TTF_FAMILY)) { finish(false); return; }
      try { buildFromTTF(); finish(true); } catch (e) { console.warn('[font] ttf failed', e); finish(false); }
    }, function () { if (timer !== null) { clearTimeout(timer); finish(false); } });
  };

  function buildFromTTF() {
    var cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    var cx = cv.getContext('2d');
    cx.font = TTF_PX + 'px ' + TTF_FAMILY;
    cx.textBaseline = 'top';
    var newG = {}, newAdv = {};
    for (var code = 33; code < 127; code++) {
      var ch = String.fromCharCode(code);
      var adv = Math.round(cx.measureText(ch).width);
      if (adv <= 0) continue;
      cx.clearRect(0, 0, 32, 32);
      cx.fillStyle = '#fff';
      cx.fillText(ch, 2, 0);
      var d = cx.getImageData(0, 0, 32, 32).data;
      var rows = [], any = false;
      for (var ry = 0; ry < TTF_ROWS; ry++) {
        var y = TTF_TOP + ry, s = '';
        for (var rx = 0; rx < adv; rx++) {
          var on = d[(y * 32 + rx + 2) * 4 + 3] >= 128;
          if (on) any = true;
          s += on ? '#' : '.';
        }
        rows.push(s);
      }
      if (!any) continue;
      // Trim empty trailing rows so caps stay 7 tall for callers that care.
      while (rows.length > GH && rows[rows.length - 1].indexOf('#') < 0) rows.pop();
      newG[ch] = rows;
      newAdv[ch] = adv;
    }
    if (!newG['A'] || !newG['0']) throw new Error('glyphs missing');
    G = newG;
    ADVS = newAdv;
    ADVS[' '] = Math.max(2, Math.round(cx.measureText(' ').width)) || 3;
    upper = false;
    F.ttf = true;
    F.GLYPH_W = newAdv['M'] - 1 || GW;
  }

  // opts: {scale, color, align: 'left'|'center'|'right', shadow: null|'#hex', alpha}
  F.draw = function (ctx, text, x, y, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var color = opts.color || '#ffffff';
    var align = opts.align || 'left';
    var w = F.width(text, scale);
    var dx = x;
    if (align === 'center') dx = x - w / 2;
    else if (align === 'right') dx = x - w;
    dx = Math.round(dx);
    var dy = Math.round(y);

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.shadow) drawRaw(ctx, text, dx + scale, dy + scale, scale, opts.shadow);
    drawRaw(ctx, text, dx, dy, scale, color);
    ctx.restore();
    return w;
  };

  SITF.Font = F;
})();
