// The results.
//
// Drawn over the mountain where the run ended, still moving, still snowing,
// so the screen reads as a pause in the same place rather than a different
// screen. The rows count themselves in one at a time.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var St = {};

  var Cam, Sc, D, F, Wx, Pt, Aud, In;
  var r = null;
  var t = 0;
  var sel = 0;
  var rows = [];
  var ITEMS = ['CLIMB AGAIN', 'THE TITLE'];
  var boxes = [];

  St.enter = function (params) {
    Cam = IF.Camera; Sc = IF.Scene; D = IF.Draw; F = IF.Font;
    Wx = IF.Weather; Pt = IF.Particles; Aud = IF.Audio; In = IF.Input;
    r = params || IF.Run.results();
    t = 0; sel = 0;

    rows = [];
    rows.push(['ALTITUDE', Math.round(r.altitude) + ' M', r.altitude >= C.ALT_TOP_M - 5]);
    rows.push(['TIME', U.time(r.time), false]);
    if (r.crystals) rows.push(['CRYSTALS', String(r.crystals), false]);
    if (r.cairns) rows.push(['CAIRNS LIT', String(r.cairns), false]);
    if (r.dodges) rows.push(['NEAR MISSES', String(r.dodges), false]);
    if (r.won && r.timeBonus) rows.push(['TIME BONUS', '+' + U.commas(r.timeBonus), true]);
    if (r.won && r.noHit) rows.push(['UNTOUCHED', '+' + U.commas(C.SCORE_NO_HIT), true]);
    if (r.deaths) rows.push(['FALLS', String(r.deaths), false]);

    if (r.won) Aud.play('sfx_summit');
  };

  St.update = function (dt, transitioning) {
    t += dt;
    Sc.update(Cam.y);
    var s = Sc.current();
    Wx.update(dt, Cam.y, { wind: s.wind, windVar: s.windVar, snow: s.snowfall }, false);
    Pt.update(dt, Wx.wind() * 0.4);
    Cam.update(dt);
    Cam.y = U.approach(Cam.y, Cam.y - 6, 1.4, dt);
    IF.Avalanche.update(dt, IF.Player, { avalanche: 0 });

    if (transitioning) return;

    var m = In.mouse;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h && sel !== i) {
        sel = i; Aud.play('sfx_ui', { volume: 0.5 });
      }
    }
    if (In.pressed('left') || In.pressed('up')) { sel = (sel + 1) % ITEMS.length; Aud.play('sfx_ui'); }
    if (In.pressed('right') || In.pressed('down')) { sel = (sel + 1) % ITEMS.length; Aud.play('sfx_ui'); }
    if (t > 0.5 && (In.pressed('confirm') || In.pressed('jump') || (m.pressed && boxes.length))) {
      Aud.play('sfx_ui_hi');
      IF.setState(sel === 0 ? 'play' : 'title');
    }
    if (In.pressed('restart')) IF.setState('play');
    if (In.pressed('back')) IF.setState('title');
  };

  St.render = function () {
    var Pipe = IF.Pipeline;
    var Lights = IF.Lights;
    var s = Sc.current();
    var alpha = IF.fade();

    Pipe.beginFrame();
    Sc.sky(Cam.y, t, 0);

    Lights.begin();
    IF.Player.addLights(Lights);
    IF.WorldProps.addLights(Lights);
    Pt.addLights(Cam, Lights);
    Lights.end();

    Pipe.beginSprites(1, s.fog);
    IF.Backdrop.draw(Cam.y, s.haze, s.snow, s.rock, 1, t);
    Wx.drawSnow(0.5, s.haze, false, true);
    IF.Backwall.draw(Cam.y, 1, 0.10, s.rock);
    IF.Backwall.drawShadows(Cam, s.keyDir, 1);
    Sc.terrain(Cam);
    Sc.dressing(Cam);
    IF.WorldProps.draw();
    IF.Avalanche.draw();
    IF.Player.draw();
    Pt.draw(Cam, false);
    Pipe.endSprites();

    Sc.mist(Cam.y, t, 0.3, C.H * 0.7, C.H * 0.8);

    Pipe.beginSprites(1, s.fog);
    D.useAtlas();
    IF.Player.drawGlow();
    IF.WorldProps.drawGlow();
    Pt.draw(Cam, true);
    D.blend('normal');
    Wx.drawSnow(0.6, [1, 1, 1], true, false);
    Wx.drawForeground(Cam.y, s.haze, 1);
    drawCard(alpha);
    Pipe.endSprites();

    Pipe.beginWarp(); Pipe.endWarp();
    Pipe.present(Sc.grade(Cam, {
      fade: alpha, vignette: 0.55, desat: r.won ? 0 : 0.24,
      exposure: r.won ? 1.05 : 0.9
    }));
  };

  function drawCard(alpha) {
    var appear = U.clamp01(t * 2.2);
    var ease = U.ease.outCubic(appear);
    var w = 300;
    var h = 56 + rows.length * 16 + 54;
    var x = (C.W - w) / 2;
    var y = (C.H - h) / 2 - 6 + (1 - ease) * 14;
    var a = alpha * ease;

    var title = r.won ? 'THE SUMMIT' : 'THE CLIMB ENDED';
    var cy = IF.Menu.card(x, y, w, h, title, a);

    if (r.won) {
      D.blend('add');
      D.glow(C.W / 2, y + 16, 160, '#ffdca8', 0.14 * a);
      D.blend('normal');
    }
    F.text(r.won ? '8848 METRES. YOU ARE ON TOP OF IT.' : (r.cause || 'THE MOUNTAIN WON'),
           C.W / 2, cy - 8, {
      align: 'center', color: r.won ? '#ffd48a' : '#c2a0a0', shadow: 1, alpha: a
    });

    // Rows appear one at a time, which is what makes a score feel counted.
    var ry = cy + 12;
    for (var i = 0; i < rows.length; i++) {
      var ra = U.clamp01((t - 0.35 - i * 0.11) * 5) * alpha;
      if (ra <= 0) break;
      IF.Menu.row(x + 20, w - 40, ry, rows[i][0], rows[i][1], ra, rows[i][2]);
      ry += 16;
    }

    // The total, once the rows have landed.
    var ta = U.clamp01((t - 0.4 - rows.length * 0.11) * 3.4) * alpha;
    if (ta > 0) {
      var shown = Math.round(r.score * U.ease.outCubic(U.clamp01((t - 0.4 - rows.length * 0.11) * 1.1)));
      D.rect(x + 20, ry - 2, w - 40, 1, '#3c5064', ta * 0.8);
      F.text('SCORE', x + 20, ry + 16, { color: '#cfe6f7', shadow: 1, alpha: ta });
      F.text(U.commas(shown), x + w - 20, ry + 18, {
        align: 'right', scale: 2, color: '#eafaff', shadow: 1, alpha: ta
      });
      if (r.score >= r.bestScore && r.score > 0) {
        F.text('BEST', C.W / 2, ry + 32, {
          align: 'center', color: '#ffc46b', shadow: 1,
          alpha: ta * (0.6 + 0.4 * Math.sin(t * 5))
        });
      } else if (r.bestScore > 0) {
        F.text('BEST  ' + U.commas(r.bestScore), C.W / 2, ry + 32, {
          align: 'center', color: '#6f8aa4', shadow: 1, alpha: ta * 0.9
        });
      }
    }

    // Choices.
    boxes.length = 0;
    var by = y + h + 20;
    var total = 0, i2;
    for (i2 = 0; i2 < ITEMS.length; i2++) total += F.width(ITEMS[i2], 1) + 42;
    var bx = C.W / 2 - total / 2;
    var ba = U.clamp01((t - 0.7) * 3) * alpha;
    for (i2 = 0; i2 < ITEMS.length; i2++) {
      var iw = F.width(ITEMS[i2], 1) + 42;
      var on = i2 === sel;
      boxes.push({ x: bx, y: by - 13, w: iw, h: 20 });
      D.panel(bx, by - 13, iw, 19, (on ? 0.85 : 0.45) * ba);
      if (on && ba > 0) {
        D.blend('add');
        D.glow(bx + iw / 2, by - 4, 44, '#8fd8ff', 0.10 * ba);
        D.blend('normal');
      }
      F.text(ITEMS[i2], bx + iw / 2, by, {
        align: 'center', color: on ? '#ffffff' : '#a9bfd3', shadow: 1, alpha: ba
      });
      bx += iw;
    }
  }

  IF.registerState('end', St);
})();
