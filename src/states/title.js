// The title screen.
//
// It renders through the same scene code as the run, at the foot of the same
// mountain, with the same climber standing on the same start ledge. Nothing
// here is a mock-up of the game; it is the game, held still.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var St = {};

  var Cam, Sc, D, F, W, Pt, Aud, In;
  var t = 0;
  var camBase = 0;
  var drift = 0;
  var sel = 0;
  var items = [];
  var mode = 'menu';       // 'menu' | 'help' | 'settings'
  var appear = 0;
  var hover = -1;
  var itemBoxes = [];

  function best() {
    return {
      time: U.loadNum(C.K_BEST_TIME, 0),
      score: U.loadNum(C.K_BEST_SCORE, 0),
      alt: U.loadNum(C.K_BEST_ALT, 0),
      runs: U.loadNum(C.K_RUNS, 0)
    };
  }

  St.enter = function () {
    Cam = IF.Camera; Sc = IF.Scene; D = IF.Draw; F = IF.Font;
    W = IF.Weather; Pt = IF.Particles; Aud = IF.Audio; In = IF.Input;

    t = 0; appear = 0; drift = 0; sel = 0; mode = 'menu';
    camBase = IF.Terrain.startY() - C.H * 0.62;
    Cam.reset(camBase);
    W.reset(camBase);
    Pt.clear();
    IF.Chunks.warm(camBase, 30);
    Aud.bed('amb_wind', 0.45);
    Aud.bed('amb_storm', 0);

    items = [
      { id: 'start', label: 'BEGIN THE CLIMB' },
      { id: 'help', label: 'HOW TO CLIMB' },
      { id: 'settings', label: 'SETTINGS' }
    ];
  };

  St.exit = function () { };

  St.update = function (dt, transitioning) {
    t += dt;
    appear = Math.min(1, appear + dt * 1.6);
    drift += dt;

    // A slow rise, so the frame is never quite still.
    var target = camBase - Math.sin(drift * 0.11) * 22 - 10;
    Cam.y = U.approach(Cam.y, target, 0.8, dt);
    Cam.update(dt);

    Sc.update(Cam.y);
    var s = Sc.current();
    W.update(dt, Cam.y, { wind: s.wind, windVar: s.windVar, snow: s.snowfall }, false);
    Pt.update(dt, W.wind() * 0.4);
    IF.Chunks.warm(Cam.y, 4);

    if (transitioning) return;

    if (mode === 'help' || mode === 'settings') {
      if (mode === 'settings') IF.Menu.updateSettings(dt);
      if (In.pressed('back') || In.pressed('pause') ||
          (mode === 'help' && (In.pressed('confirm') || In.pressed('jump')))) {
        mode = 'menu'; Aud.play('sfx_ui');
      }
      return;
    }

    // Pointer selection.
    var m = In.mouse;
    hover = -1;
    for (var i = 0; i < itemBoxes.length; i++) {
      var b = itemBoxes[i];
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) hover = i;
    }
    if (hover >= 0 && hover !== sel) { sel = hover; Aud.play('sfx_ui', { volume: 0.5 }); }

    if (In.pressed('down') || In.pressed('right')) {
      sel = (sel + 1) % items.length; Aud.play('sfx_ui');
    }
    if (In.pressed('up') || In.pressed('left')) {
      sel = (sel + items.length - 1) % items.length; Aud.play('sfx_ui');
    }
    if (In.pressed('mute')) { Aud.toggleMute(); Aud.play('sfx_ui_hi'); }

    var go = In.pressed('confirm') || In.pressed('jump') || (m.pressed && hover >= 0);
    if (go) {
      var id = items[sel].id;
      Aud.play('sfx_ui_hi');
      if (id === 'start') {
        Cam.punch(0.5);
        IF.setState('play', {});
      } else if (id === 'help') { mode = 'help'; }
      else if (id === 'settings') { mode = 'settings'; IF.Menu.openSettings(); }
    }
  };

  St.render = function () {
    var P = IF.Pipeline;
    var s = Sc.current();
    var Lights = IF.Lights;

    P.beginFrame();
    Sc.sky(Cam.y, t, 0);

    // Lights: the climber's lantern, and a warm bounce off the snowfield.
    Lights.begin();
    var px = C.W * 0.19, py = Cam.sy(IF.Terrain.startY()) - 12;
    var flick = 0.88 + 0.12 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.1);
    Lights.addHex(px + 4, py + 2, C.LANTERN_RADIUS, C.LANTERN_COLOR, C.LANTERN_I * flick, C.LANTERN_Z);
    Lights.end();

    P.beginSprites(1, s.fog);
    IF.Backdrop.draw(Cam.y, s.haze, s.snow, s.rock, 1, t);
    W.drawSnow(0.55, s.haze, false, true);
    Sc.terrain(Cam);

    // The climber, idling on the start ledge.
    D.useAtlas();
    D.blend('normal');
    var frame = (t * 5) % IF.Atlas.seqLen('c_idle');
    D.anim('c_idle', frame, px, py, { lit: 1, normal: 0.55 });

    // Lantern flare on top of him.
    D.blend('add');
    D.glow(px + 4, py - 8, 26, C.LANTERN_COLOR, 0.5 * flick);
    D.streak(px + 4, py - 8, 54, 5, C.LANTERN_COLOR, 0.22 * flick, 0);
    D.blend('normal');

    Pt.draw(Cam, false);
    W.drawSnow(0.7, [1, 1, 1], true, false);
    W.drawForeground(Cam.y, s.haze, 1);
    P.endSprites();

    Sc.mist(Cam.y, t, 0.24, C.H * 0.78, C.H * 0.55);

    // --- interface, in its own additive-capable pass ----------------------
    P.beginSprites(1, s.fog);
    D.useAtlas();
    D.blend('normal');

    if (mode === 'help') drawHelp();
    else if (mode === 'settings') IF.Menu.drawSettings('SETTINGS');
    else drawMenu();

    Pt.draw(Cam, true);
    P.endSprites();

    P.beginWarp(); P.endWarp();
    P.present(Sc.grade(Cam, { fade: IF.fade(), vignette: 0.62, bloomI: s.bloom * 1.15 }));
  };

  // --- pieces --------------------------------------------------------------

  function drawMenu() {
    var ease = U.ease.outCubic(appear);
    var lx = C.W / 2;
    var ly = 82 - (1 - ease) * 24;

    // A scrim over the lower half. Without it the interface competes with a
    // snowfield for the same values and loses. Two overlapping gradients
    // rather than a gradient and a bar, so there is no edge to see.
    D.vgrad(0, C.H - 240, C.W, 240, [0.02, 0.04, 0.09], 0.62 * ease, true);
    D.vgrad(0, C.H - 120, C.W, 120, [0.02, 0.04, 0.09], 0.55 * ease, true);

    // Wordmark. Drawn unlit and on its own dark bed, because a pale ice
    // wordmark against a pale sky is a wordmark nobody can read.
    D.blend('add');
    D.glow(lx, ly + 4, 190, '#1b3a58', 0.55 * ease);
    D.blend('normal');
    D.sprite('logo', lx + 2, ly + 3, {
      lit: 0, alpha: ease * 0.55, color: [0.02, 0.03, 0.06]
    });
    D.sprite('logo', lx, ly, { lit: 0, alpha: ease });
    D.blend('add');
    D.glow(lx, ly, 150, '#7fd4ff', 0.13 * ease);
    D.blend('normal');

    F.text('CLIMB A MOUNTAIN THAT IS TRYING TO FALL ON YOU', lx, ly + 54, {
      align: 'center', scale: 1, color: '#bcd6ea', alpha: ease * 0.95, shadow: 1
    });

    itemBoxes.length = 0;
    var y0 = 228;
    for (var i = 0; i < items.length; i++) {
      var y = y0 + i * 26;
      var on = i === sel;
      var w = F.width(items[i].label, 2);
      var pulse = on ? 0.5 + 0.5 * Math.sin(t * 5) : 0;

      itemBoxes.push({ x: lx - w / 2 - 16, y: y - 15, w: w + 32, h: 22 });

      if (on) {
        D.panel(lx - w / 2 - 14, y - 15, w + 28, 22, 0.55 * ease);
        D.blend('add');
        D.glow(lx, y - 5, 70 + pulse * 10, '#8fd8ff', (0.10 + pulse * 0.05) * ease);
        D.blend('normal');
        D.sprite('chevron', lx - w / 2 - 22, y - 5, {
          rot: -Math.PI / 2, scale: 0.8, color: '#9fe4ff',
          alpha: ease * (0.7 + pulse * 0.3), lit: 0
        });
      }
      F.text(items[i].label, lx, y, {
        align: 'center', scale: 2, shadow: 1,
        color: on ? '#eafaff' : '#8ba4bd',
        alpha: ease * (on ? 1 : 0.85)
      });
    }

    // Records.
    var b = best();
    if (b.runs > 0) {
      var ry = 322;
      var line = 'BEST  ' + U.commas(b.score) + ' PTS';
      if (b.time > 0) line += '   ' + U.time(b.time);
      if (b.alt > 0) line += '   ' + Math.round(b.alt) + ' M';
      var bw = F.width(line, 1);
      D.panel(C.W / 2 - bw / 2 - 8, ry - 12, bw + 16, 17, 0.5 * ease);
      F.text(line, C.W / 2, ry, {
        align: 'center', color: '#9fd8ff', alpha: ease * 0.95, shadow: 1
      });
    }

    F.text('MICRO JAM 064', C.W - 8, C.H - 6, {
      align: 'right', color: '#4d6580', alpha: ease * 0.9
    });
    F.text(IF.Audio.muted() ? 'M  SOUND OFF' : 'M  SOUND ON', 8, C.H - 7, {
      color: '#4d6580', alpha: ease * 0.9
    });
  }

  var HELP = [
    ['MOVE', 'A D  or  ARROWS'],
    ['JUMP', 'SPACE  or  W'],
    ['', 'hold for height, let go early to clip it'],
    ['WALL', 'press into a wall to slide, jump to kick off'],
    ['DASH', 'SHIFT  or  X    costs grip'],
    ['AXE', 'C  or  F, or right mouse   aim with the mouse'],
    ['', 'it bites rock, hauls you in, and swings'],
    ['GRIP', 'the bar under your health. resting on stone fills it'],
    ['CAIRN', 'stand on one and it lights: a checkpoint, and the'],
    ['', 'avalanche is shoved back down the mountain'],
    ['ICE', 'everything falling can kill you. the shadow above'],
    ['', 'your head is the only warning you get']
  ];

  function drawHelp() {
    var x = 62, y = 44, w = C.W - 124;
    D.panel(x - 12, y - 22, w + 24, 268, 0.86);
    F.text('HOW TO CLIMB', C.W / 2, y, { align: 'center', scale: 2, color: '#eafaff', shadow: 1 });
    D.blend('add');
    D.glow(C.W / 2, y - 6, 120, '#8fd8ff', 0.10);
    D.blend('normal');

    var ly = y + 24;
    for (var i = 0; i < HELP.length; i++) {
      var key = HELP[i][0], val = HELP[i][1];
      if (key) {
        F.text(key, x, ly, { color: '#7fd4ff', shadow: 1 });
        F.text(val, x + 62, ly, { color: '#d3e3f2', shadow: 1 });
      } else {
        F.text(val, x + 62, ly, { color: '#8ba4bd', alpha: 0.9, shadow: 1 });
      }
      ly += 17;
    }
    F.text('ESC  BACK', C.W / 2, y + 258, { align: 'center', color: '#6f8aa4', shadow: 1 });
  }

  IF.registerState('title', St);
})();
