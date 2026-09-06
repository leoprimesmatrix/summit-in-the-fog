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
  // The ledge canvas is 40 x 14: two rows above the surface for grass or
  // snow drifts, ten rows of rock, two rows below for icicles. drawLedge
  // offsets the image so the rock surface sits exactly on the given y.

  var LEDGE_TOP_PAD = 2;

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

  function ledgeRows(zone, cracked, seed) {
    var rnd = U.mulberry32(seed);
    var rows = [
      '........................................',
      '........................................',
      '..nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn....',
      '.nnmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnn...',
      '.maaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaam...',
      'mabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbam..',
      'abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba..',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
      '.cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbc...',
      '..ccbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcc....',
      '...cccccbbbbbbbbbbbbbbbbbbbbbccccc......',
      '.......kkccccccccccccccccccckk..........',
      '........................................',
      '........................................'
    ];
    var grid = rows.map(function (r) { return r.split(''); });
    function set(x, y, ch) { if (y >= 0 && y < grid.length && x >= 0 && x < 40) grid[y][x] = ch; }
    function get(x, y) { return (y >= 0 && y < grid.length && x >= 0 && x < 40) ? grid[y][x] : '.'; }

    // Rock strata: a darker seam and a few lighter flecks so the face reads
    // as stone instead of a flat fill.
    for (var sx = 2; sx < 36; sx++) {
      if (rnd() < 0.55) set(sx, 7 + (sx % 7 === 0 ? 1 : 0), 'c');
      if (rnd() < 0.10) set(sx, 5 + Math.floor(rnd() * 3), 'a');
      if (rnd() < 0.08) set(sx, 8 + Math.floor(rnd() * 2), 'k');
    }

    if (zone <= 1) {
      // Grass tufts poke through the thin snow, moss clings to the face.
      for (var gx = 3; gx < 35; gx += 1) {
        if (rnd() < 0.22) {
          set(gx, 1, 'g'); set(gx, 2, 'g');
          if (rnd() < 0.5) set(gx, 0, 'x');
          if (rnd() < 0.5) set(gx + 1, 1, 'G');
        }
      }
      for (var mx = 1; mx < 37; mx++) {
        if (rnd() < 0.12) { set(mx, 6 + Math.floor(rnd() * 3), 'G'); }
      }
    } else if (zone === 3) {
      // Windblown snow piles on one side; lichen specks on the stone.
      var pile = rnd() < 0.5 ? 4 : 30;
      for (var px = 0; px < 6; px++) {
        set(pile + px, 1, 'n');
        if (px > 0 && px < 5) set(pile + px, 0, 'm');
      }
      for (var lx = 2; lx < 36; lx++) {
        if (rnd() < 0.08) set(lx, 5 + Math.floor(rnd() * 4), 'x');
      }
    } else {
      // Deep snow cap and icicles hanging from the underside.
      for (var cx2 = 2; cx2 < 36; cx2++) {
        if (rnd() < 0.7) set(cx2, 1, 'n');
        if (rnd() < 0.25) set(cx2, 0, 'n');
        set(cx2, 4, rnd() < 0.5 ? 'm' : 'n');
      }
      for (var ix = 6; ix < 32; ix += 1) {
        if (rnd() < 0.2) {
          set(ix, 11, 'x'); set(ix, 12, 'G');
          if (rnd() < 0.4) set(ix, 13, 'G');
        }
      }
    }

    if (cracked) {
      // Fissures through the body so a crumbling ledge is legible at a glance.
      var cracks = [7, 16, 27];
      for (var ci = 0; ci < cracks.length; ci++) {
        var cxp = cracks[ci];
        for (var cy = 5; cy <= 9; cy++) {
          set(cxp, cy, 'k');
          if (cy % 2 === 0) cxp += (ci % 2 === 0) ? 1 : -1;
        }
      }
      set(12, 3, 'k'); set(22, 3, 'k'); set(30, 4, 'k');
    }

    void get;
    return grid.map(function (r) { return r.join(''); });
  }

  // Wide starting ledge, 216 x 12, grass tufts on top.
  function buildStartLedge() {
    // Wide enough to sit under every lane: this is the camp terrace.
    var W = 348, H = 12;
    var cv = U.makeCanvas(W, H);
    var cx = cv.getContext('2d');
    var rnd = U.mulberry32(7);
    var P = LEDGE_PAL[0];

    cx.fillStyle = P.b;
    cx.fillRect(2, 3, W - 4, H - 4);
    cx.fillStyle = P.a;
    cx.fillRect(3, 2, W - 6, 2);
    cx.fillStyle = P.n;
    cx.fillRect(4, 0, W - 8, 2);
    cx.fillStyle = P.m;
    cx.fillRect(3, 2, W - 6, 1);
    cx.fillStyle = P.c;
    cx.fillRect(4, H - 2, W - 8, 2);
    cx.fillRect(0, 5, 2, 4);
    cx.fillRect(W - 2, 5, 2, 4);
    for (var s = 4; s < W - 4; s++) {
      if (rnd() < 0.4) { cx.fillStyle = P.c; cx.fillRect(s, 7, 1, 1); }
      if (rnd() < 0.08) { cx.fillStyle = P.k; cx.fillRect(s, 8 + Math.floor(rnd() * 2), 1, 1); }
    }

    // Grass tufts poking through the snow.
    for (var i = 0; i < 30; i++) {
      var gx = 6 + Math.floor(rnd() * (W - 14));
      var gh = 2 + Math.floor(rnd() * 3);
      cx.fillStyle = P.g;
      cx.fillRect(gx, -gh + 2, 1, gh);
      cx.fillStyle = P.G;
      cx.fillRect(gx + 1, -gh + 3, 1, gh - 1);
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
      // Two variants per zone so neighbouring ledges do not repeat exactly.
      S.img.ledge.push([make(ledgeRows(z, false, 100 + z), LEDGE_PAL[z]),
                        make(ledgeRows(z, false, 200 + z), LEDGE_PAL[z])]);
      S.img.ledge_crumble.push([make(ledgeRows(z, true, 300 + z), LEDGE_PAL[z]),
                                make(ledgeRows(z, true, 400 + z), LEDGE_PAL[z])]);
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

  S.LEDGE_W = 40;
  S.LEDGE_H = 10;
  S.CLIMBER_W = 12;
  S.CLIMBER_H = 18;

  // x,y = centre-x and TOP surface y of the ledge. zone picks the palette;
  // variant alternates the decoration; dark tints the rock (0..1).
  S.drawLedge = function (ctx, x, y, type, shakeX, dark, zone, variant) {
    var img;
    if (type === 'start') {
      img = S.img.ledge_start;
      ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y));
      return;
    }
    var z = U.clamp(zone == null ? 0 : zone, 0, LEDGE_ZONES - 1);
    var set = (type === 'crumble') ? S.img.ledge_crumble[z] : S.img.ledge[z];
    img = set[(variant || 0) % set.length];
    var dx = Math.round(x - S.LEDGE_W / 2 + (shakeX || 0));
    var dy = Math.round(y) - LEDGE_TOP_PAD;

    // Contact shadow under the rock so it sits in the scene.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = COL.ink;
    ctx.fillRect(dx + 4, dy + LEDGE_TOP_PAD + S.LEDGE_H - 1, S.LEDGE_W - 10, 3);
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
