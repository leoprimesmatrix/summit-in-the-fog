(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var COL = C.COLORS;

  var S = { img: {} };

  // Build a canvas from an array of strings using a char -> color palette.
  // '.' is always transparent.
  function make(rows, pal) {
    var h = rows.length;
    var w = rows[0].length;
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    for (var y = 0; y < h; y++) {
      var line = rows[y];
      for (var x = 0; x < w; x++) {
        var ch = line.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var col = pal[ch];
        if (!col) continue;
        cx.fillStyle = col;
        cx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }
  S.make = make;

  // ---- palettes -----------------------------------------------------------

  var PC = {  // climber
    'r': COL.parka,
    'd': COL.parkaDark,
    's': COL.skin,
    'k': '#2b1d16',      // hood shadow / boots
    'p': COL.pack,
    'P': '#3a5029',      // pack shadow
    'l': COL.lantern,
    'L': '#c98f2e',
    'w': '#f2f7fb'
  };

  var PR = {  // rock ledge
    'a': COL.rockLight,
    'b': COL.rock,
    'c': COL.rockDark,
    'n': COL.snow,
    'm': COL.snowShade,
    'k': '#3d332b'
  };

  var PK = {  // cairn
    'a': '#9aa8b5',
    'b': '#6f7d8b',
    'c': '#4a5663',
    'd': '#2e3743',
    'w': COL.lantern,
    'W': '#fff2cf',
    'g': '#ffd27a'
  };

  // ---- climber ------------------------------------------------------------
  // 12 wide x 18 tall. Feet on the bottom row.

  var CLIMB_IDLE_0 = [
    '....kkkk....',
    '...kkkkkk...',
    '..kkssssk...',
    '..kssssskk..',
    '..ksskssk...',
    '...ssssss...',
    '..ddrrrrdd..',
    '.pdrrrrrrdp.',
    'PPdrrrrrrdPP',
    'PPdrrrrrrdPP',
    'PPdrrrrrrdlL',
    '.Pdrrrrrrd..',
    '..drrrrrrd..',
    '...dddddd...',
    '...kk..kk...',
    '...kk..kk...',
    '...kk..kk...',
    '..kkk..kkk..'
  ];

  var CLIMB_IDLE_1 = [
    '............',
    '....kkkk....',
    '...kkkkkk...',
    '..kkssssk...',
    '..kssssskk..',
    '..ksskssk...',
    '...ssssss...',
    '..ddrrrrdd..',
    '.pdrrrrrrdp.',
    'PPdrrrrrrdPP',
    'PPdrrrrrrdPP',
    'PPdrrrrrrdlL',
    '..drrrrrrd..',
    '...dddddd...',
    '...kk..kk...',
    '...kk..kk...',
    '...kk..kk...',
    '..kkk..kkk..'
  ];

  // Knees tucked, arms up, lantern swinging out.
  var CLIMB_HOP = [
    '............',
    '...ss.......',
    '..kkkk..s...',
    '.kkssssk....',
    '.kssssskk...',
    '.ksskssk....',
    '..ssssss....',
    '.ddrrrrdd...',
    'pdrrrrrrdp..',
    'PdrrrrrrdlL.',
    'Pdrrrrrrd...',
    '.drrrrrrd...',
    '..dddddd....',
    '..kkkkkk....',
    '.kk....kk...',
    '.kk....kk...',
    '..k....k....',
    '............'
  ];

  // Flailing, tilted. 14 wide.
  var CLIMB_SLIP = [
    '.s..........s.',
    '..ss......ss..',
    '...kkkkkkk....',
    '...kkssssk....',
    '...ksssssk....',
    '...kssksssk...',
    '....ssssss....',
    '...ddrrrrdd...',
    '..pdrrrrrrdp..',
    '.PPdrrrrrrdlL.',
    '.PPdrrrrrrd...',
    '..Pdrrrrrrd...',
    '...drrrrrrd...',
    '....dddddd....',
    '...kk....kk...',
    '..kk......kk..',
    '..k........k..',
    '..............'
  ];

  // ---- ledges -------------------------------------------------------------
  // 40 wide x 10 tall. Top surface is row 0 (snow cap).

  function buildLedge(cracked) {
    var rows = [
      '..nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn....',
      '.nnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnn...',
      '.maaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaam...',
      'mabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbam..',
      'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba..',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
      '.cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc...',
      '..ccbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcc....',
      '...cccccbbbbbbbbbbbbbbbbbbbbbccccc......',
      '.......kkccccccccccccccccccckk..........'
    ];
    if (cracked) {
      // Punch visible cracks into the rock body.
      rows[4] = 'abbbbbbcbbbbbbbbcbbbbbbbbbbcbbbbbbbba..';
      rows[5] = 'bbbbbbbcbbbbbbbbcbbbbbbbbbbcbbbbbbbbbb..';
      rows[6] = '.cbbbbbcbbbbbbbcbbbbbbbbbbbbcbbbbbbbc...';
      rows[7] = '..ccbbbcbbbbbbcbbbbbbbbbbbbbbcbbbbbcc...';
    }
    // Pad every row to 40 chars.
    for (var i = 0; i < rows.length; i++) {
      while (rows[i].length < 40) rows[i] += '.';
      rows[i] = rows[i].substr(0, 40);
    }
    return rows;
  }

  // Wide starting ledge, 216 x 12, grass tufts on top.
  function buildStartLedge() {
    var W = 216, H = 12;
    var cv = U.makeCanvas(W, H);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(7);

    cx.fillStyle = COL.rock;
    cx.fillRect(2, 3, W - 4, H - 4);
    cx.fillStyle = COL.rockLight;
    cx.fillRect(3, 2, W - 6, 2);
    cx.fillStyle = COL.snow;
    cx.fillRect(4, 0, W - 8, 2);
    cx.fillStyle = COL.snowShade;
    cx.fillRect(3, 2, W - 6, 1);
    cx.fillStyle = COL.rockDark;
    cx.fillRect(4, H - 2, W - 8, 2);
    cx.fillRect(0, 5, 2, 4);
    cx.fillRect(W - 2, 5, 2, 4);

    // Grass tufts poking through the snow.
    cx.fillStyle = '#4f6a3a';
    for (var i = 0; i < 26; i++) {
      var gx = 6 + Math.floor(rnd() * (W - 14));
      var gh = 2 + Math.floor(rnd() * 3);
      cx.fillRect(gx, -gh + 2, 1, gh);
      cx.fillRect(gx + 1, -gh + 3, 1, gh - 1);
    }
    return cv;
  }

  // ---- cairn --------------------------------------------------------------
  // 12 x 18, stacked stones. Bottom row sits on the ledge surface.

  var CAIRN_DARK = [
    '............',
    '............',
    '.....dd.....',
    '....daad....',
    '....dbbd....',
    '.....dd.....',
    '...ddddd....',
    '..daaaabd...',
    '..dbbbbbd...',
    '...ddddd....',
    '..dddddddd..',
    '.daaaaabbbd.',
    '.dbbbbbbbbd.',
    '.dcbbbbbbcd.',
    '..dddddddd..',
    '.dddddddddd.',
    '.dcccccccdd.',
    '..dddddddd..'
  ];

  var CAIRN_LIT = [
    '.....g......',
    '....gWg.....',
    '....dWd.....',
    '....dwwd....',
    '....dwbd....',
    '.....dd.....',
    '...ddddd....',
    '..dwwwwbd...',
    '..dbbbbbd...',
    '...ddddd....',
    '..dddddddd..',
    '.dwwwwwbbbd.',
    '.dbbbbbbbbd.',
    '.dcbbbbbbcd.',
    '..dddddddd..',
    '.dddddddddd.',
    '.dcccccccdd.',
    '..dddddddd..'
  ];

  // ---- summit flag --------------------------------------------------------
  // 24 x 30. Pole with prayer flags, cairn base.

  function buildSummit(frame) {
    var W = 24, H = 30;
    var cv = U.makeCanvas(W, H);
    var cx = cv.getContext('2d');

    // Pole
    cx.fillStyle = '#5a4633';
    cx.fillRect(11, 2, 2, 22);

    // Flag: three little pennants, waving with the frame.
    var wave = frame ? 1 : 0;
    var flags = [
      { y: 3, col: COL.parka },
      { y: 8, col: COL.accent },
      { y: 13, col: COL.warn }
    ];
    for (var i = 0; i < flags.length; i++) {
      var f = flags[i];
      var off = (i % 2 === 0) ? wave : -wave;
      cx.fillStyle = f.col;
      cx.fillRect(13, f.y + off, 7, 4);
      cx.fillRect(13, f.y + off + 4, 4, 1);
    }

    // Cairn base
    cx.fillStyle = '#6f7d8b';
    cx.fillRect(6, 22, 12, 3);
    cx.fillRect(4, 25, 16, 3);
    cx.fillStyle = '#9aa8b5';
    cx.fillRect(7, 22, 8, 1);
    cx.fillRect(5, 25, 12, 1);
    cx.fillStyle = '#2e3743';
    cx.fillRect(4, 28, 16, 2);
    return cv;
  }

  // ---- lantern glow -------------------------------------------------------

  function buildGlow(size, hex, peak) {
    var cv = U.makeCanvas(size, size);
    var cx = cv.getContext('2d');
    var r = size / 2;
    var g = cx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, U.rgba(hex, peak));
    g.addColorStop(0.45, U.rgba(hex, peak * 0.35));
    g.addColorStop(1, U.rgba(hex, 0));
    cx.fillStyle = g;
    cx.fillRect(0, 0, size, size);
    return cv;
  }

  // ---- UI arrows ----------------------------------------------------------

  var ARROW_L = [
    '...#.....',
    '..##.....',
    '.###.....',
    '#########',
    '.###.....',
    '..##.....',
    '...#.....'
  ];
  var ARROW_R = [
    '.....#...',
    '.....##..',
    '.....###.',
    '#########',
    '.....###.',
    '.....##..',
    '.....#...'
  ];
  var ARROW_U = [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '....#....',
    '....#....',
    '....#....'
  ];

  // ---- build all ----------------------------------------------------------

  S.build = function () {
    S.img.climber_idle_0 = make(CLIMB_IDLE_0, PC);
    S.img.climber_idle_1 = make(CLIMB_IDLE_1, PC);
    S.img.climber_hop = make(CLIMB_HOP, PC);
    S.img.climber_slip = make(CLIMB_SLIP, PC);

    S.img.ledge = make(buildLedge(false), PR);
    S.img.ledge_crumble = make(buildLedge(true), PR);
    S.img.ledge_start = buildStartLedge();

    S.img.cairn_dark = make(CAIRN_DARK, PK);
    S.img.cairn_lit = make(CAIRN_LIT, PK);

    S.img.summit_0 = buildSummit(0);
    S.img.summit_1 = buildSummit(1);

    S.img.glow_lantern = buildGlow(96, COL.lantern, 0.42);
    S.img.glow_cairn = buildGlow(72, COL.lantern, 0.5);

    var pal = { '#': COL.text };
    S.img.arrow_l = make(ARROW_L, pal);
    S.img.arrow_r = make(ARROW_R, pal);
    S.img.arrow_u = make(ARROW_U, pal);
  };

  // ---- draw helpers -------------------------------------------------------

  S.LEDGE_W = 40;
  S.LEDGE_H = 10;
  S.CLIMBER_W = 12;
  S.CLIMBER_H = 18;

  // x,y = centre-x and TOP surface y of the ledge.
  S.drawLedge = function (ctx, x, y, type, shakeX, dark) {
    var img;
    if (type === 'start') {
      img = S.img.ledge_start;
      ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y));
      return;
    }
    img = (type === 'crumble') ? S.img.ledge_crumble : S.img.ledge;
    var dx = Math.round(x - S.LEDGE_W / 2 + (shakeX || 0));
    var dy = Math.round(y);
    ctx.drawImage(img, dx, dy);
    if (dark) {
      ctx.save();
      ctx.globalAlpha = dark;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#000000';
      ctx.fillRect(dx, dy, S.LEDGE_W, S.LEDGE_H);
      ctx.restore();
    }
  };

  // x = centre, y = feet (bottom of sprite).
  S.drawClimber = function (ctx, x, y, pose, frame, facing) {
    var img;
    if (pose === 'slip' || pose === 'fall') img = S.img.climber_slip;
    else if (pose === 'hop') img = S.img.climber_hop;
    else img = frame ? S.img.climber_idle_1 : S.img.climber_idle_0;

    var w = img.width, h = img.height;
    var dx = Math.round(x - w / 2);
    var dy = Math.round(y - h);
    if (facing < 0) {
      ctx.save();
      ctx.translate(Math.round(x), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(-w / 2), dy);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy);
    }
  };

  // x = centre, y = base (sits on the ledge top surface).
  S.drawCairn = function (ctx, x, y, lit, scale) {
    var img = lit ? S.img.cairn_lit : S.img.cairn_dark;
    var s = scale || 1;
    var w = img.width * s, h = img.height * s;
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  };

  S.drawSummit = function (ctx, x, y, frame) {
    var img = frame ? S.img.summit_1 : S.img.summit_0;
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height));
  };

  S.drawGlow = function (ctx, img, x, y, alpha, scale) {
    if (alpha <= 0) return;
    var s = scale || 1;
    var w = img.width * s, h = img.height * s;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  };

  SITF.Sprites = S;
})();
