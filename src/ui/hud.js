// The heads-up display.
//
// Four things, and nothing else: how much you can still take, how much grip
// is left, how high you are, and how close the avalanche is. Everything sits
// on a soft dark slab so it stays readable against snow, and the whole thing
// fades back when nothing is happening.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var H = {};

  var D, F, A;
  var scoreShown = 0;
  var gripFlash = 0;
  var altShown = 0;
  var warnPulse = 0;

  H.reset = function () {
    D = IF.Draw; F = IF.Font; A = IF.Atlas;
    scoreShown = 0; altShown = 0; gripFlash = 0; warnPulse = 0;
  };

  H.update = function (dt, run, player, avalanche) {
    // The score counts up rather than jumping, which makes a pickup feel
    // like it paid rather than like the number changed.
    scoreShown = U.approach(scoreShown, run.score, 0.16, dt);
    if (Math.abs(scoreShown - run.score) < 0.6) scoreShown = run.score;
    altShown = U.approach(altShown, C.altitudeAt(player.cy()), 0.10, dt);
    gripFlash = Math.max(0, gripFlash - dt * 2.6);
    if (player.grip < 0.22) gripFlash = 1;
    warnPulse += dt * (2 + (avalanche.roar ? avalanche.roar() * 9 : 0));
  };

  H.draw = function (run, player, avalanche, zone, alpha) {
    alpha = alpha === undefined ? 1 : alpha;
    D.useAtlas();
    D.blend('normal');

    drawVitals(player, alpha);
    drawTrack(player, avalanche, alpha);
    drawAltitude(player, alpha);
    drawScore(run, alpha);
    drawAvalanche(avalanche, player, alpha);
    drawPops(run, alpha);
    drawBanner(run, alpha);
    drawGripHint(player, alpha);
  };

  // --- health and grip -----------------------------------------------------

  function drawVitals(player, alpha) {
    var x = 10, y = 10;
    var w = 12 + C.HEALTH * 13 + 4;
    D.panel(x - 4, y - 4, w, 32, 0.70 * alpha);

    for (var i = 0; i < C.HEALTH; i++) {
      var on = i < player.health;
      var px = x + 4 + i * 13, py = y + 6;
      if (on) {
        D.blend('add');
        D.glow(px, py, 11, '#9fe4ff', 0.16 * alpha);
        D.blend('normal');
      }
      D.sprite('pip', px, py, {
        lit: 1, normal: 0.5, alpha: alpha * (on ? 1 : 0.28),
        color: on ? [1, 1, 1] : [0.4, 0.5, 0.6]
      });
    }

    // Grip: one bar, and it flashes when it is nearly gone.
    var gx = x + 2, gy = y + 17, gw = C.HEALTH * 13 - 2;
    D.rect(gx, gy, gw, 3, '#141d29', 0.85 * alpha);
    var g = U.clamp01(player.grip);
    var col = g > 0.45 ? [0.42, 0.82, 1] : (g > 0.2 ? [1, 0.75, 0.35] : [1, 0.42, 0.32]);
    if (gripFlash > 0) {
      var f = 0.6 + 0.4 * Math.sin(IF.time * 16);
      col = [col[0], col[1] * f, col[2] * f];
    }
    D.rect(gx, gy, gw * g, 3, col, alpha);
    if (g > 0.02) D.rect(gx + gw * g - 1, gy - 1, 2, 5, '#eafaff', alpha * 0.9);
  }

  // --- the climb track -----------------------------------------------------
  //
  // The whole mountain, down the right edge: the five zones as bands, the
  // summit at the top, you as a bright mark, the avalanche as a red one
  // rising underneath. The old altimeter was a number, and a number does not
  // tell you that the thing behind you is gaining. This does, at a glance,
  // and it is also what turns a climb into a race.

  function drawAltitude(player, alpha) {
    var txt = Math.round(altShown) + ' M';
    var w = F.width(txt, 2);
    var x = C.W - 22, y = 24;
    D.panel(x - w - 12, 6, w + 20, 24, 0.70 * alpha);
    F.text(txt, x - 2, y, {
      align: 'right', scale: 2, color: '#eafaff', shadow: 1, alpha: alpha
    });
  }

  function zoneTint(z) {
    var sky = IF.Scene.SKY[z.sky];
    return sky ? U.rgb(sky.mid) : [0.5, 0.6, 0.7];
  }

  function drawTrack(player, av, alpha) {
    var x = C.W - 9, top = 40, bot = C.H - 26;
    var h = bot - top;
    D.panel(x - 6, top - 8, 12, h + 16, 0.55 * alpha);
    D.rect(x - 1, top, 3, h, '#0b121c', 0.9 * alpha);

    // Zone bands, faint, so the track reads as the mountain and not a gauge.
    for (var i = 0; i < C.ZONES.length; i++) {
      var z = C.ZONES[i];
      var y0 = bot - z.to * h, y1 = bot - z.from * h;
      var c = zoneTint(z);
      D.rect(x - 1, y0, 3, y1 - y0, c, 0.42 * alpha);
      if (i > 0) D.rect(x - 3, y1, 7, 1, '#eafaff', 0.18 * alpha);
    }

    // The avalanche, climbing the track under you.
    if (av.active()) {
      var ap = U.clamp01(C.progressAt(av.y()));
      var ay = bot - ap * h;
      var gap = av.distanceTo(player.cy());
      var danger = U.clamp01(1 - gap / 700);
      var col = danger > 0.72 ? [1, 0.35, 0.28] : (danger > 0.42 ? [1, 0.72, 0.3] : [0.85, 0.5, 0.45]);
      D.rect(x - 1, ay, 3, bot - ay, col, (0.45 + danger * 0.5) * alpha);
      D.blend('add');
      D.glow(x, ay, 9 + danger * 10, col, (0.25 + danger * 0.45) * alpha, true);
      D.blend('normal');
      D.rect(x - 4, ay, 9, 1, col, alpha);
    }

    // You.
    var pp = U.clamp01(C.progressAt(player.cy()));
    var py = bot - pp * h;
    D.blend('add');
    D.glow(x, py, 8, '#9fe4ff', 0.35 * alpha, true);
    D.blend('normal');
    D.sprite('pip', x, py, { lit: 0, scale: 0.8, alpha: alpha });

    // The summit.
    D.sprite('mark', x, top - 2, { lit: 0, scale: 0.8, alpha: alpha * 0.95 });
  }

  // --- score ---------------------------------------------------------------

  function drawScore(run, alpha) {
    var txt = U.commas(scoreShown);
    var w = F.width(txt, 1);
    var x = C.W - 24, y = 42;
    F.text(txt, x, y, { align: 'right', color: '#9fd8ff', shadow: 1, alpha: alpha });

    if (run.combo > 1) {
      var k = U.clamp01(run.comboT / C.COMBO_WINDOW);
      var s = 'x' + (1 + Math.min(run.combo, 9) * 0.1).toFixed(1);
      F.text(s, x, y + 16, {
        align: 'right', color: '#ffc46b', shadow: 1,
        alpha: alpha * (0.5 + k * 0.5)
      });
      D.rect(x - 30, y + 20, 30 * k, 1, '#ffc46b', alpha * 0.7);
    }
  }

  // --- the thing behind you ------------------------------------------------

  function drawAvalanche(av, player, alpha) {
    if (!av.active()) return;
    var gap = av.distanceTo(player.cy());
    var danger = U.clamp01(1 - gap / 700);
    if (danger <= 0.55) return;
    var col = danger > 0.72 ? [1, 0.35, 0.28] : [1, 0.72, 0.3];
    var pulse = 0.5 + 0.5 * Math.sin(warnPulse * 2.4);
    var a = alpha * (danger - 0.55) / 0.45 * (0.45 + pulse * 0.55);
    var txt = 'AVALANCHE';
    var w = F.width(txt, 2);
    D.panel(C.W / 2 - w / 2 - 12, C.H - 52, w + 24, 22, 0.7 * a);
    F.text(txt, C.W / 2, C.H - 36, {
      align: 'center', scale: 2, color: col, shadow: 1, alpha: a
    });
    // The bottom of the frame reddens.
    D.vgrad(0, C.H - 70, C.W, 70, col, a * 0.16, true);
  }

  // --- floating numbers ----------------------------------------------------

  function drawPops(run, alpha) {
    var Cam = IF.Camera;
    var pops = run.pops();
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      var t = p.t / 1.5;
      var a = alpha * (1 - U.ease.inQuad(U.clamp01((t - 0.55) / 0.45)));
      var rise = U.ease.outCubic(U.clamp01(t * 3)) * 14;
      var scale = p.big ? 2 : 1;
      var sx = Cam.sx(p.x), sy = Cam.sy(p.y) - rise;
      if (sy < -20 || sy > C.H + 20) continue;
      F.text(p.text, sx, sy, {
        align: 'center', scale: scale, color: p.color, shadow: 1, alpha: a
      });
    }
  }

  // --- zone banner ---------------------------------------------------------

  function drawBanner(run, alpha) {
    var b = run.banner();
    if (b.t <= 0) return;
    var k = b.t / 3.4;
    // In fast, hold, out slow.
    var a = alpha * U.clamp01(Math.min((1 - k) * 6, k * 2.4));
    var slide = (1 - U.clamp01((1 - k) * 4)) * 18;
    var y = 96;
    var w = Math.max(F.width(b.text, 2), F.width(b.sub, 1)) + 40;

    D.panel(C.W / 2 - w / 2, y - 20, w, b.sub ? 42 : 28, 0.92 * a);
    D.blend('add');
    D.glow(C.W / 2, y - 4, w * 0.5, '#9fd8ff', 0.10 * a);
    D.blend('normal');
    F.text(b.text, C.W / 2 + slide, y, {
      align: 'center', scale: 2, color: '#eafaff', shadow: 1, alpha: a
    });
    if (b.sub) {
      F.text(b.sub, C.W / 2 - slide, y + 16, {
        align: 'center', color: '#8fbdd8', shadow: 1, alpha: a * 0.9
      });
    }
    D.rect(C.W / 2 - w / 2 + 6, y - 18, (w - 12) * U.clamp01((1 - k) * 3), 1, '#9fd8ff', a * 0.5);
  }

  // A one-time nudge the first time grip actually matters.
  var hintT = 0, hintShown = false;
  function drawGripHint(player, alpha) {
    if (!hintShown && player.grip < 0.3) { hintShown = true; hintT = 3; }
    hintT = Math.max(0, hintT - IF.dt);
    if (hintT <= 0) return;
    var a = alpha * U.clamp01(hintT / 0.6);
    F.text('GRIP IS LOW  -  STAND ON STONE TO RECOVER', C.W / 2, C.H - 60, {
      align: 'center', color: '#ffc46b', shadow: 1, alpha: a
    });
  }

  H.resetHints = function () { hintShown = false; hintT = 0; };

  IF.Hud = H;
})();
