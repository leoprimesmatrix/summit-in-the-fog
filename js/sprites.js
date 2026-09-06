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
    var w = 0;
    for (var i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    for (var y = 0; y < h; y++) {
      var line = rows[y];
      for (var x = 0; x < line.length; x++) {
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
    'k': '#2b1d16',      // hood, boots
    'h': '#e8dcc8',      // fur trim
    's': COL.skin,
    'e': '#1a1a2a',      // eyes
    'r': COL.parka,
    'R': '#f07a5c',      // parka highlight
    'd': COL.parkaDark,
    'c': COL.accent,     // scarf
    'C': '#1e9c86',      // scarf shade
    'p': COL.pack,
    'P': '#3a5029',      // pack shadow
    'w': '#f2f7fb',
    'l': COL.lantern,
    'L': '#c98f2e',      // lantern frame
    'o': '#fff6d0',      // lantern core
    'm': '#3b2a1e',      // mitten
    'g': '#5cc8f0',      // goggle glass
    'G': '#264a5c'       // goggle frame
  };

  // ---- climber ------------------------------------------------------------
  // 12 wide x 18 tall, feet on the bottom row, facing right. The lantern
  // hangs from the right mitten; a teal scarf ties the figure to the UI.

  var CLIMB_IDLE_0 = [
    '....kkkk....',
    '...kGggGk...',
    '..khhhhhhk..',
    '..khsssshk..',
    '..ksessesk..',
    '...ssssss...',
    '..cccccccC..',
    '.pdRrrrrdrc.',
    'PPdRrrrrdr..',
    'PPdrrrrrdm.L',
    'PPdrrrrrd.Ll',
    '.Pdrrrrrd.lo',
    '..drrrrrd.Ll',
    '...ddddd....',
    '...kk..kk...',
    '...kk..kk...',
    '...kk..kk...',
    '..kkk..kkk..'
  ];

  // Breathing: the torso settles one pixel; the scarf tail lifts.
  var CLIMB_IDLE_1 = [
    '............',
    '....kkkk....',
    '...kGggGk...',
    '..khhhhhhk..',
    '..khsssshk..',
    '..ksessesk..',
    '...ssssss...',
    '..cccccccC..',
    '.pdRrrrrdr.c',
    'PPdRrrrrdrc.',
    'PPdrrrrrdm.L',
    'PPdrrrrrd.Ll',
    '.Pdrrrrrd.lo',
    '..dddddd..Ll',
    '...kk..kk...',
    '...kk..kk...',
    '...kk..kk...',
    '..kkk..kkk..'
  ];

  // Knees tucked, scarf streaming up and back, lantern swinging out.
  var CLIMB_HOP = [
    '...c........',
    '..cckkkk....',
    '..ckGggGk...',
    '..khhhhhhk..',
    '..khsssshk..',
    '..ksessesk..',
    '...ssssss...',
    '..CcccccC...',
    '.pdRrrrrdm.L',
    'PPdRrrrrdrLl',
    'PPdrrrrrdrlo',
    '.Pdrrrrrd.Ll',
    '..dddddd....',
    '..kkkkkkk...',
    '.kk....kk...',
    '.kk....kk...',
    '..k....k....',
    '............'
  ];

  // Landing squash: a wider, shorter frame shown for a few hundredths of a
  // second after touching down. 14 wide x 16 tall.
  var CLIMB_LAND = [
    '.....kkkk.....',
    '....kGggGk....',
    '...khhhhhhk...',
    '...khsssshk...',
    '...ksessesk...',
    '....ssssss....',
    '..ccccccccC...',
    '.pddRrrrrrdrc.',
    'PPPdRrrrrrdrLl',
    'PPPdrrrrrrdmlo',
    '.PPdrrrrrrd.Ll',
    '..ddddddddd...',
    '.kkk.....kkk..',
    'kkk.......kkk.',
    'kkk.......kkk.',
    'kkkk.....kkkk.'
  ];

  // Lunging: both arms reach for the ledge that is not there. 14 wide.
  var CLIMB_SLIP = [
    '..............',
    '..........mm..',
    '....kkkk.rr...',
    '...kGggGkr....',
    '..khhhhhhkr...',
    '..khsssshk....',
    '..ksessesk....',
    '...ssssss.....',
    '..rcccccccC...',
    '.pdRrrrrrrdmL.',
    'PPdRrrrrrrd.ll',
    'PPdrrrrrrrd.lo',
    '.Pdrrrrrrrd.Ll',
    '..drrrrrrrd...',
    '...ddddddd....',
    '...kk....kk...',
    '..kk......kk..',
    '..k........k..'
  ];

  // Falling: one arm flung up, the other out, scarf streaming upward. 14 wide.
  var CLIMB_FALL = [
    '..........m...',
    '.........rr...',
    '.....kkkkr.c..',
    '....kGggGk.c..',
    '.mrrkhhhhhhk..',
    '....khsssshk..',
    '....ksessesk..',
    '.....ssssss...',
    '....CcccccC...',
    '...pdRrrrrrd..',
    '..PPdRrrrrrdL.',
    '..PPdrrrrrrdll',
    '...Pdrrrrrrdlo',
    '....dddddddLl.',
    '...kk.....kk..',
    '..kk.......kk.',
    '..k.........k.',
    '..............'
  ];

  // Summit: lantern raised high.
  var CLIMB_SUMMIT = [
    '..........Ll',
    '..........lo',
    '....kkkk..Ll',
    '...kGggGk.m.',
    '..khhhhhhkr.',
    '..khsssshkr.',
    '..ksessesr..',
    '...ssssss...',
    '..ccccccC...',
    '.pdRrrrrdc..',
    'PPdRrrrrd...',
    'PPdrrrrrd...',
    '.Pdrrrrrd...',
    '..drrrrrd...',
    '...ddddd....',
    '...kk..kk...',
    '...kk..kk...',
    '..kkk..kkk..'
  ];

  // ---- ledges -------------------------------------------------------------
  // A ledge is drawn, not stamped out of one template. Every one gets its own
  // width, end shapes, body depth, fractures and weathering, so a face full
  // of them reads as broken rock instead of a row of identical planks.
  //
  // The one thing that never varies is the standing surface: a flat, brightly
  // lit line the full width of the footprint, with the body falling away dark
  // beneath it. That single row is what the player reads through fog to
  // decide whether there is somewhere to put their feet, so nothing - no
  // snow, no crack, no crumble - is ever allowed to break it up.

  var LEDGE_CW = 46;         // canvas width; the standable footprint is 40
  var LEDGE_FOOT = 40;
  var LEDGE_CH = 24;
  var LEDGE_SURF = 6;        // canvas row of the standing surface
  var LEDGE_DEPTH = 12;      // how far the rock hangs below it
  var LEDGE_VARIANTS = 4;
  var START_PAD = 4;

  // Per-stage rock palettes: mossy granite at the camp, warm sandstone in the
  // treeline, blue ice on the glacier, cold grey gneiss on the ridge, and
  // black rock under rime in the death zone. Snow thickens as you climb.
  var LEDGE_PAL = [
    { n: '#eef4f8', m: '#c4d4dd', a: '#a8b294', b: '#7f8a69', c: '#4f5844', k: '#2f3529', g: '#5f8a3a', G: '#3f6428', x: '#7e9a52' },
    { n: '#f2f7fb', m: '#c9dbe8', a: '#d1b892', b: '#a98d6b', c: '#6b5a4a', k: '#3d332b', g: '#5f8a3a', G: '#3f6428', x: '#7e9a52' },
    { n: '#f7fbff', m: '#cfe3f2', a: '#d6ecf7', b: '#9fc4dc', c: '#587a92', k: '#35516a', g: '#e8f4fb', G: '#a9d0e6', x: '#bfe0f0' },
    { n: '#f2f7fb', m: '#c9dbe8', a: '#b9bcc4', b: '#8d8f96', c: '#565a63', k: '#33363d', g: '#6f7a86', G: '#4d5560', x: '#9aa4ae' },
    { n: '#ffffff', m: '#dbe8f2', a: '#8f9aa8', b: '#69737f', c: '#3c434d', k: '#22262c', g: '#dbe8f2', G: '#9fb2c2', x: '#c2d4e2' }
  ];
  var LEDGE_ZONES = LEDGE_PAL.length;

  function buildLedge(zone, kind, seed) {
    var P = LEDGE_PAL[zone];
    var TONE = [P.m, P.a, P.b, P.c, P.k];   // lit lip -> shadow -> underside
    var rnd = U.mulberry32(seed);
    var cv = U.makeCanvas(LEDGE_CW, LEDGE_CH);
    var cx = cv.getContext('2d');

    function px(x, y, col) {
      if (x < 0 || x >= LEDGE_CW || y < 0 || y >= LEDGE_CH) return;
      cx.fillStyle = col;
      cx.fillRect(x, y, 1, 1);
    }
    function cut(x, y) {
      if (x < 0 || x >= LEDGE_CW || y < 0 || y >= LEDGE_CH) return;
      cx.clearRect(x, y, 1, 1);
    }

    // The rock always covers the footprint (columns 3..42) and juts a little
    // past it by a different amount at each end.
    var x0 = Math.round((LEDGE_CW - LEDGE_FOOT) / 2);
    var lx = x0 - 2 + Math.floor(rnd() * 3);
    var rx = x0 + LEDGE_FOOT - 1 + Math.floor(rnd() * 3);
    var span = rx - lx;

    // Body profile: a thick middle that thins toward each end, by a different
    // amount and over a different distance on each side, with two slow waves
    // through it so the underside is never a clean curve.
    var ph1 = rnd() * 6.283, ph2 = rnd() * 6.283;
    var endL = 4 + Math.floor(rnd() * 7);
    var endR = 4 + Math.floor(rnd() * 7);
    var core = LEDGE_DEPTH - Math.floor(rnd() * 3);
    // The underside steps in flat blocks a few pixels wide rather than
    // wobbling per column: broken stone has facets, and a per-pixel jitter
    // just reads as fuzz along the bottom edge.
    var blocks = [];
    for (var bi = 0; bi < 12; bi++) blocks.push(Math.round((rnd() - 0.5) * 2.6));
    function depthAt(x) {
      var d = core
        + Math.sin((x - lx) * 0.19 + ph1) * 1.4
        + blocks[Math.floor(Math.max(0, x - lx) / 5) % blocks.length]
        + Math.sin((x - lx) * 0.09 + ph2) * 0.6;
      var fL = x - lx, fR = rx - x;
      if (fL < endL) d *= 0.34 + 0.66 * (fL + 1) / endL;
      if (fR < endR) d *= 0.34 + 0.66 * (fR + 1) / endR;
      return Math.max(2, Math.round(d));
    }

    // Body. Light comes from the upper left, so the left shoulder lifts a
    // tone and the right end turns away into shadow: that is what stops a
    // ledge reading as a flat sticker on the wall.
    for (var x = lx; x <= rx; x++) {
      var d = depthAt(x);
      var shade = 0;
      if (x - lx < 3) shade = -1;
      else if (rx - x < 5) shade = 1;
      var strat = Math.round(Math.sin(x * 0.31 + ph1) * 0.8);
      for (var k = 0; k < d; k++) {
        var f = k / d;
        var band;
        if (k === 0) band = 0;                       // the standing line
        else if (k <= 2) band = 1 + shade;
        else if (f < 0.58) band = 2 + shade + strat;
        else if (f < 0.86) band = 3 + shade;
        else band = 4;
        if (k > 0 && rnd() < 0.07) band += (rnd() < 0.5 ? -1 : 1);
        px(x, LEDGE_SURF + k, TONE[U.clamp(band, 0, 4)]);
      }
      // A hard dark line a few rows under the lip reads as an overhang.
      if (d > 5 && rnd() < 0.5) px(x, LEDGE_SURF + 3, TONE[3]);
    }

    // Fractures: seams that wander down out of the body, stopping short of
    // the lip so they never look like a gap you could fall through.
    var seams = 1 + Math.floor(rnd() * 3);
    for (var s = 0; s < seams; s++) {
      var sx = lx + 4 + Math.floor(rnd() * Math.max(1, span - 8));
      var sd = depthAt(sx);
      var sy = 2 + Math.floor(rnd() * 2);
      var len = Math.max(2, Math.round(sd * (0.45 + rnd() * 0.4)));
      var drift = 0;
      for (var q = 0; q < len && sy + q < sd; q++) {
        if (rnd() < 0.3) drift += rnd() < 0.5 ? 1 : -1;
        px(sx + drift, LEDGE_SURF + sy + q, TONE[4]);
        if (rnd() < 0.35) px(sx + drift + 1, LEDGE_SURF + sy + q, TONE[3]);
      }
    }

    // Weathering above the surface. Snow and grass sit on top of the rock,
    // never in place of the lit lip.
    if (zone >= 2) {
      // Windblown: the drift piles against one end and thins across.
      var heavy = zone === 4 ? 1.0 : (zone === 2 ? 0.62 : 0.34);
      var cap = zone === 4 ? 3 : 2;
      var side = rnd() < 0.5 ? 1 : -1;
      var prevH = 0;
      for (var cx2 = lx + 1; cx2 <= rx - 1; cx2++) {
        var u = (rx - cx2) / span;
        var w = side > 0 ? u : 1 - u;
        var sh = Math.round(heavy * (0.30 + 1.05 * w) * cap + (rnd() - 0.5) * 0.9);
        sh = U.clamp(sh, 0, cap);
        // A drift has one continuous surface: it may not step by more than a
        // pixel at a time, or it dithers into speckle and stops reading as snow.
        if (sh > prevH + 1) sh = prevH + 1;
        prevH = sh;
        for (var sy2 = 0; sy2 < sh; sy2++) {
          px(cx2, LEDGE_SURF - 1 - sy2, sy2 === sh - 1 ? P.n : P.m);
        }
      }
      // A few short icicles off the underside - long ones read as railings
      // hanging under the ledge rather than as ice on it.
      var ice = zone === 3 ? 1 : 3;
      for (var ii = 0; ii < ice; ii++) {
        var ix = lx + 5 + Math.floor(rnd() * Math.max(1, span - 10));
        var il = 1 + Math.floor(rnd() * 3);
        var base = LEDGE_SURF + depthAt(ix);
        for (var iy = 0; iy < il; iy++) px(ix, base + iy, iy === il - 1 ? P.n : P.m);
      }
    } else {
      // A few clumps of grass, not a fringe: they mark the ledge as alive
      // without softening the line you stand on.
      var tufts = 2 + Math.floor(rnd() * 3);
      for (var t = 0; t < tufts; t++) {
        var gx = lx + 3 + Math.floor(rnd() * Math.max(1, span - 6));
        var gh = 2 + Math.floor(rnd() * 2);
        for (var gy = 0; gy < gh; gy++) {
          px(gx, LEDGE_SURF - 1 - gy, gy === gh - 1 ? P.x : P.g);
        }
        if (rnd() < 0.7) px(gx + 1, LEDGE_SURF - 1, P.G);
        if (rnd() < 0.4) px(gx - 1, LEDGE_SURF - 1, P.G);
      }
      // Moss in the shaded joints just under the lip.
      for (var mm = 0; mm < 5; mm++) {
        var mx = lx + 2 + Math.floor(rnd() * Math.max(1, span - 4));
        var my = 2 + Math.floor(rnd() * 3);
        if (my < depthAt(mx)) px(mx, LEDGE_SURF + my, P.G);
      }
    }

    if (kind === 'crumble') {
      // Already going: the body is split into blocks with daylight through
      // the gaps and chips gone from the bottom edge. The lip stays whole,
      // because you can still stand on it - for a moment.
      var breaks = 2 + Math.floor(rnd() * 2);
      for (var b = 0; b < breaks; b++) {
        var bx = lx + 6 + Math.floor(rnd() * Math.max(1, span - 12));
        var bd = depthAt(bx);
        var bdrift = 0;
        for (var by = 1; by < bd; by++) {
          if (rnd() < 0.35) bdrift += rnd() < 0.5 ? 1 : -1;
          var wdt = Math.floor((by / bd) * 2.2);
          for (var w2 = -wdt; w2 <= wdt; w2++) {
            if (by > bd * 0.34) cut(bx + bdrift + w2, LEDGE_SURF + by);
            else px(bx + bdrift + w2, LEDGE_SURF + by, TONE[4]);
          }
        }
      }
      for (var ch = 0; ch < 8; ch++) {
        var chx = lx + 2 + Math.floor(rnd() * Math.max(1, span - 4));
        var chd = depthAt(chx);
        cut(chx, LEDGE_SURF + chd - 1);
        if (rnd() < 0.5) cut(chx, LEDGE_SURF + chd - 2);
      }
    }

    return cv;
  }

  // The camp terrace: one wide ledge under every lane, built in the same
  // language as the rest so base camp does not look like a different game.
  function buildStartLedge() {
    var W = 348, H = 18, SURF = START_PAD;
    var cv = U.makeCanvas(W, H);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(7);
    var P = LEDGE_PAL[0];
    var TONE = [P.m, P.a, P.b, P.c, P.k];

    function px(x, y, col) {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      cx.fillStyle = col; cx.fillRect(x, y, 1, 1);
    }

    var core = 11;
    function depthAt(x) {
      var d = core + Math.sin(x * 0.06) * 1.2 + Math.sin(x * 0.21 + 1.1) * 0.7;
      var fL = x, fR = W - 1 - x;
      if (fL < 10) d *= 0.4 + 0.6 * (fL + 1) / 10;
      if (fR < 10) d *= 0.4 + 0.6 * (fR + 1) / 10;
      return Math.max(3, Math.round(d));
    }

    for (var x = 0; x < W; x++) {
      var d = depthAt(x);
      for (var k = 0; k < d; k++) {
        var f = k / d;
        var band = (k === 0) ? 0 : (k <= 2 ? 1 : (f < 0.58 ? 2 : (f < 0.86 ? 3 : 4)));
        if (k > 0 && rnd() < 0.07) band += (rnd() < 0.5 ? -1 : 1);
        px(x, SURF + k, TONE[U.clamp(band, 0, 4)]);
      }
    }
    for (var s = 0; s < 14; s++) {
      var sx = 8 + Math.floor(rnd() * (W - 16));
      var sd = depthAt(sx), sy = 2 + Math.floor(rnd() * 2), drift = 0;
      var len = Math.max(2, Math.round(sd * (0.4 + rnd() * 0.4)));
      for (var q = 0; q < len && sy + q < sd; q++) {
        if (rnd() < 0.3) drift += rnd() < 0.5 ? 1 : -1;
        px(sx + drift, SURF + sy + q, TONE[4]);
      }
    }
    for (var t = 0; t < 26; t++) {
      var gx = 6 + Math.floor(rnd() * (W - 12));
      var gh = 2 + Math.floor(rnd() * 3);
      for (var gy = 0; gy < gh; gy++) px(gx, SURF - 1 - gy, gy === gh - 1 ? P.x : P.g);
      if (rnd() < 0.7) px(gx + 1, SURF - 1, P.G);
    }
    return cv;
  }

  // ---- cairn --------------------------------------------------------------
  // 14 x 22, stacked stones with a lantern niche. Bottom row sits on the
  // ledge surface. Lit cairns glow from the niche and carry a teal rune.

  var CAIRN_ROWS = [
    '..............',
    '..............',
    '..............',
    '.....aad......',
    '....aRRbd.....',
    '.....ddd......',
    '....aaabd.....',
    '...abbbbbd....',
    '...dbbbbbd....',
    '....ddddd.....',
    '...aaaabbd....',
    '..abbbbbbbd...',
    '..abbbNNbbd...',
    '..dbbbNNbbd...',
    '...ddddddd....',
    '..aaaaabbbdd..',
    '.abbbbbbbbbdd.',
    '.dbbbbbbbbbcd.',
    '.dccbbbbbbccd.',
    '..ddddddddd...',
    '.ddddddddddd..',
    '..ddddddddd...'
  ];

  var PK_DARK = { a: '#a7b3bf', b: '#75828f', c: '#4e5966', d: '#2f3843', R: '#75828f', N: '#1e2630' };
  var PK_LIT_0 = { a: '#e0c7a0', b: '#8e8578', c: '#5a5148', d: '#2f2a26', R: COL.accent, N: '#fff6d0' };
  var PK_LIT_1 = { a: '#e0c7a0', b: '#8e8578', c: '#5a5148', d: '#2f2a26', R: '#1e9c86', N: COL.lantern };

  // ---- summit flag --------------------------------------------------------
  // 24 x 30. Pole with prayer flags, cairn base.

  function buildSummit(frame) {
    var W = 24, H = 30;
    var cv = U.makeCanvas(W, H);
    var cx = cv.getContext('2d');

    // Pole with a bright cap.
    cx.fillStyle = '#5a4633';
    cx.fillRect(11, 2, 2, 22);
    cx.fillStyle = '#8a7150';
    cx.fillRect(11, 2, 1, 22);
    cx.fillStyle = COL.lantern;
    cx.fillRect(11, 1, 2, 1);

    // Flags: three little pennants, waving with the frame.
    var wave = frame ? 1 : 0;
    var flags = [
      { y: 3, col: COL.parka, dark: COL.parkaDark },
      { y: 8, col: COL.accent, dark: '#1e9c86' },
      { y: 13, col: COL.warn, dark: '#c9822e' }
    ];
    for (var i = 0; i < flags.length; i++) {
      var f = flags[i];
      var off = (i % 2 === 0) ? wave : -wave;
      cx.fillStyle = f.col;
      cx.fillRect(13, f.y + off, 7, 4);
      cx.fillRect(13, f.y + off + 4, 4, 1);
      cx.fillStyle = f.dark;
      cx.fillRect(18, f.y + off + 1, 2, 3);
      cx.fillRect(13, f.y + off + 3, 4, 1);
    }

    // Cairn base in the summit stone palette, with snow on the shoulders.
    cx.fillStyle = '#75828f';
    cx.fillRect(6, 22, 12, 3);
    cx.fillRect(4, 25, 16, 3);
    cx.fillStyle = '#a7b3bf';
    cx.fillRect(7, 22, 8, 1);
    cx.fillRect(5, 25, 12, 1);
    cx.fillStyle = COL.snow;
    cx.fillRect(8, 21, 6, 1);
    cx.fillRect(4, 24, 4, 1);
    cx.fillRect(16, 24, 4, 1);
    cx.fillStyle = '#2f3843';
    cx.fillRect(4, 28, 16, 2);
    return cv;
  }

  // ---- glows and lighting -------------------------------------------------

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

  // A flat ellipse of light: the pool a lantern throws on the snow.
  function buildPool(w, h, hex, peak) {
    var cv = U.makeCanvas(w, h);
    var cx = cv.getContext('2d');
    cx.save();
    cx.translate(w / 2, h / 2);
    cx.scale(1, h / w);
    var g = cx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, U.rgba(hex, peak));
    g.addColorStop(0.5, U.rgba(hex, peak * 0.4));
    g.addColorStop(1, U.rgba(hex, 0));
    cx.fillStyle = g;
    cx.fillRect(-w / 2, -w / 2, w, w);
    cx.restore();
    return cv;
  }

  // Screen-sized vignette: clear in the middle, ink toward the corners.
  function buildVignette() {
    var cv = U.makeCanvas(C.W, C.H);
    var cx = cv.getContext('2d');
    var g = cx.createRadialGradient(C.W / 2, C.H / 2, C.H * 0.45, C.W / 2, C.H / 2, C.W * 0.72);
    g.addColorStop(0, U.rgba(COL.ink, 0));
    g.addColorStop(1, U.rgba(COL.ink, 1));
    cx.fillStyle = g;
    cx.fillRect(0, 0, C.W, C.H);
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

  // Small peak icon for the altitude readout.
  var PEAK_ICON = [
    '....#....',
    '...#w#...',
    '..#www#..',
    '.#wwbww#.',
    '#bbbbbbb#',
    'bbbbbbbbb'
  ];

  // ---- build all ----------------------------------------------------------

  S.build = function () {
    S.img.climber_idle_0 = make(CLIMB_IDLE_0, PC);
    S.img.climber_idle_1 = make(CLIMB_IDLE_1, PC);
    S.img.climber_hop = make(CLIMB_HOP, PC);
    S.img.climber_land = make(CLIMB_LAND, PC);
    S.img.climber_slip = make(CLIMB_SLIP, PC);
    S.img.climber_fall = make(CLIMB_FALL, PC);
    S.img.climber_summit = make(CLIMB_SUMMIT, PC);

    S.img.ledge = [];
    S.img.ledge_crumble = [];
    for (var z = 0; z < LEDGE_ZONES; z++) {
      // Four variants per stage, picked by row and lane, so no two ledges
      // near each other are the same rock and there is no visible rhythm.
      var solid = [], broken = [];
      for (var v = 0; v < LEDGE_VARIANTS; v++) {
        solid.push(buildLedge(z, 'rock', 1100 + z * 61 + v * 7));
        broken.push(buildLedge(z, 'crumble', 5300 + z * 61 + v * 7));
      }
      S.img.ledge.push(solid);
      S.img.ledge_crumble.push(broken);
    }
    S.img.ledge_start = buildStartLedge();

    S.img.cairn_dark = make(CAIRN_ROWS, PK_DARK);
    S.img.cairn_lit_0 = make(CAIRN_ROWS, PK_LIT_0);
    S.img.cairn_lit_1 = make(CAIRN_ROWS, PK_LIT_1);

    S.img.summit_0 = buildSummit(0);
    S.img.summit_1 = buildSummit(1);

    S.img.glow_lantern = buildGlow(96, COL.lantern, 0.42);
    S.img.glow_cairn = buildGlow(72, COL.lantern, 0.5);
    S.img.glow_accent = buildGlow(48, COL.accent, 0.5);
    S.img.glow_white = buildGlow(160, '#ffffff', 0.6);
    S.img.pool_lantern = buildPool(44, 12, COL.lantern, 0.45);
    S.img.pool_cairn = buildPool(60, 14, COL.lantern, 0.5);
    S.img.vignette = buildVignette();

    var pal = { '#': COL.text };
    S.img.arrow_l = make(ARROW_L, pal);
    S.img.arrow_r = make(ARROW_R, pal);
    S.img.arrow_u = make(ARROW_U, pal);
    S.img.peak_icon = make(PEAK_ICON, { '#': COL.ink, 'w': COL.text, 'b': COL.textDim });

    S.img.crystal = make([
      '..w..',
      '.waa.',
      'waaab',
      'waabb',
      '.abbB',
      '..bB.',
      '..B..'
    ], { 'w': '#ffffff', 'a': COL.accent, 'b': '#1e9c86', 'B': '#136b5c' });
  };

  // ---- draw helpers -------------------------------------------------------

  S.LEDGE_W = LEDGE_FOOT;
  S.LEDGE_H = 10;
  S.LEDGE_VARIANTS = LEDGE_VARIANTS;
  S.CLIMBER_W = 12;
  S.CLIMBER_H = 18;

  // x,y = centre-x and TOP surface y of the ledge. zone picks the palette;
  // variant alternates the decoration; dark tints the rock (0..1).
  S.drawLedge = function (ctx, x, y, type, shakeX, dark, zone, variant) {
    var img, surf;
    if (type === 'start') {
      img = S.img.ledge_start;
      surf = START_PAD;
    } else {
      var z = U.clamp(zone == null ? 0 : zone, 0, LEDGE_ZONES - 1);
      var set = (type === 'crumble') ? S.img.ledge_crumble[z] : S.img.ledge[z];
      img = set[Math.abs(variant || 0) % set.length];
      surf = LEDGE_SURF;
    }
    var dx = Math.round(x - img.width / 2 + (shakeX || 0));
    var dy = Math.round(y) - surf;

    // The shadow the ledge throws on the wall behind it, offset with the
    // light and falling off over several rows. Without it the rock is a
    // sticker; with it there is air between the ledge and the face.
    var sw = img.width - 10, sy0 = dy + surf + LEDGE_DEPTH - 1;
    ctx.save();
    ctx.fillStyle = COL.ink;
    for (var sh = 0; sh < 4; sh++) {
      ctx.globalAlpha = 0.26 * (1 - sh / 4) * (1 - sh / 4);
      var inset = sh * 4;
      ctx.fillRect(dx + 5 + inset + sh, sy0 + sh * 2, Math.max(2, sw - inset * 2), 2);
    }
    ctx.restore();

    ctx.drawImage(img, dx, dy);
    if (dark) {
      // Tint only the rock's own pixels.
      ctx.save();
      ctx.globalAlpha = dark;
      ctx.fillStyle = '#000000';
      var w = img.width, h = img.height;
      var tmp = S._tint || (S._tint = U.makeCanvas(w, h));
      var tc = tmp.getContext('2d');
      tc.clearRect(0, 0, w, h);
      tc.drawImage(img, 0, 0);
      tc.globalCompositeOperation = 'source-atop';
      tc.fillStyle = '#000000';
      tc.fillRect(0, 0, w, h);
      tc.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, dx, dy);
      ctx.restore();
    }
  };

  // x = centre, y = feet (bottom of sprite).
  S.drawClimber = function (ctx, x, y, pose, frame, facing) {
    var img;
    if (pose === 'slip') img = S.img.climber_slip;
    else if (pose === 'fall') img = S.img.climber_fall;
    else if (pose === 'hop') img = S.img.climber_hop;
    else if (pose === 'land') img = S.img.climber_land;
    else if (pose === 'summit') img = S.img.climber_summit;
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

  // Where the lantern hangs for a given pose, relative to the feet point and
  // before facing is applied (positive x = in front of the climber).
  S.lanternOffset = function (pose) {
    if (pose === 'summit') return { x: 5, y: -17 };
    if (pose === 'hop') return { x: 5, y: -8 };
    if (pose === 'fall') return { x: 5, y: -6 };
    if (pose === 'slip') return { x: 6, y: -8 };
    if (pose === 'land') return { x: 6, y: -7 };
    return { x: 5, y: -7 };
  };

  // x = centre, y = base (sits on the ledge top surface).
  S.drawCairn = function (ctx, x, y, lit, scale, frame) {
    var img = lit ? (frame ? S.img.cairn_lit_1 : S.img.cairn_lit_0) : S.img.cairn_dark;
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
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  };

  SITF.Sprites = S;
})();
