// The climb.
//
// This file is the assembly: it owns the order things update in and the order
// they are drawn in, and almost nothing else. The order is the interesting
// part, because it is what decides whether the mist sits between the wall and
// the lamp or on top of both.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var St = {};

  var Cam, Sc, D, F, Wx, Pt, Aud, In, P, Gr, Hz, Av, Dir, Run, Wp, Hud, Pipe, Lights;

  var t = 0;
  var paused = false;
  var pauseSel = 0;
  var pauseMode = 'menu';
  var intro = 0;
  var hitFlash = 0;
  var hitstop = 0;
  var lastHealth = 0;
  var PAUSE_ITEMS = ['RESUME', 'SETTINGS', 'RESTART', 'LEAVE THE MOUNTAIN'];

  St.enter = function () {
    Cam = IF.Camera; Sc = IF.Scene; D = IF.Draw; F = IF.Font;
    Wx = IF.Weather; Pt = IF.Particles; Aud = IF.Audio; In = IF.Input;
    P = IF.Player; Gr = IF.Grapple; Hz = IF.Hazards; Av = IF.Avalanche;
    Dir = IF.Director; Run = IF.Run; Wp = IF.WorldProps; Hud = IF.Hud;
    Pipe = IF.Pipeline; Lights = IF.Lights;

    t = 0; paused = false; pauseSel = 0; pauseMode = 'menu';
    intro = 0; hitFlash = 0; hitstop = 0;

    var T = IF.Terrain;
    var sy = T.startY();
    Pt.clear();
    Wp.reset();
    Hz.reset();
    Dir.reset();
    P.reset(C.W / 2, sy);
    Gr.reset();
    Cam.reset(sy - C.H * 0.58);
    Av.reset(sy);
    Run.reset();
    Hud.reset();
    Hud.resetHints();
    Wx.reset(Cam.y);
    IF.Chunks.warm(Cam.y, 40);
    lastHealth = P.health;

    Aud.bed('amb_wind', 0.5);
    Aud.bed('amb_storm', 0);
  };

  St.exit = function () {
    Aud.bed('amb_storm', 0);
  };

  St.isPaused = function () { return paused; };

  // --- update --------------------------------------------------------------

  St.update = function (dt, transitioning) {
    t += dt;
    intro = Math.min(1, intro + dt * 0.7);
    hitFlash = Math.max(0, hitFlash - dt * 4);

    if (!transitioning && In.pressed('pause') && !Run.over) {
      if (pauseMode === 'settings') { pauseMode = 'menu'; }
      else { paused = !paused; pauseSel = 0; Aud.play('sfx_ui'); }
    }
    if (!transitioning && In.pressed('mute')) { Aud.toggleMute(); Aud.play('sfx_ui_hi'); }

    if (paused) { updatePause(dt); return; }

    // Hitstop: the world holds for a few frames when you are hit, so the hit
    // has weight. The camera and the snow keep going, which is what makes it
    // read as impact rather than as a stall.
    if (hitstop > 0) {
      hitstop -= dt;
      Cam.update(dt);
      Pt.update(dt * 0.25, 0);
      Hud.update(dt, Run, P, Av);
      return;
    }

    var allow = !transitioning && !Run.over && !Run.respawning();

    // The avalanche waits until you have actually started climbing.
    if (!Av.active() && (P.cy() < IF.Terrain.startY() - 60 || t > 6)) {
      Av.start();
      Run.showBanner('THE ICEFALL', 'CLIMB');
    }

    Sc.update(Cam.y);
    var s = Sc.current();
    var zb = C.zoneBlend(P.cy());
    var zone = {
      wind: s.wind, windVar: s.windVar, snow: s.snowfall,
      avalanche: U.lerp(zb.a.avalanche, zb.b.avalanche, zb.t),
      boulderRate: U.lerp(zb.a.boulderRate, zb.b.boulderRate, zb.t),
      lightning: zb.a.lightning || zb.b.lightning
    };

    Wx.update(dt, Cam.y, zone, !!zb.a.lightning);

    P.update(dt, allow);
    Gr.update(dt, allow);
    Wp.update(dt, P);
    Hz.update(dt, P, Wx.wind());
    Av.update(dt, P, zone);
    if (!Run.over) Dir.update(dt, P, zone, C.progressAt(P.cy()));
    Run.update(dt);

    if (P.health < lastHealth) { hitFlash = 1; hitstop = 0.085; Dir.onPlayerHurt(); }
    lastHealth = P.health;

    Pt.update(dt, Wx.wind() * 0.5);
    Cam.follow(P.cx(), P.cy(), P.vy, dt, false);
    Cam.update(dt);
    IF.Chunks.warm(Cam.y, 6);
    Hud.update(dt, Run, P, Av);

    // The wind bed follows the weather, so a gust is heard as well as seen.
    Aud.bed('amb_wind', 0.30 + s.snowfall * 0.35 + (Wx.gusting() ? 0.3 : 0));

    if (Run.over && Run.endTime() > (Run.won ? 3.4 : 1.9)) {
      Run.commit();
      IF.setState('end', Run.results());
    }
  };

  function updatePause(dt) {
    if (pauseMode === 'settings') {
      IF.Menu.updateSettings(dt);
      if (In.pressed('back') || IF.Menu.settingsBack()) { pauseMode = 'menu'; Aud.play('sfx_ui'); }
      return;
    }
    if (In.pressed('down')) { pauseSel = (pauseSel + 1) % PAUSE_ITEMS.length; Aud.play('sfx_ui'); }
    if (In.pressed('up')) { pauseSel = (pauseSel + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; Aud.play('sfx_ui'); }
    if (In.pressed('restart')) { paused = false; St.enter(); return; }
    if (In.pressed('confirm') || In.pressed('jump')) {
      Aud.play('sfx_ui_hi');
      if (pauseSel === 0) paused = false;
      else if (pauseSel === 1) { pauseMode = 'settings'; IF.Menu.openSettings(); }
      else if (pauseSel === 2) { paused = false; St.enter(); }
      else IF.setState('title');
    }
  }

  // --- render --------------------------------------------------------------

  St.render = function () {
    var s = Sc.current();
    var alpha = IF.fade();

    Pipe.beginFrame();
    Sc.sky(Cam.y, t, Wx.flash() * 0.55);

    // --- lights ---------------------------------------------------------
    Lights.begin();
    P.addLights(Lights);
    Gr.addLights(Lights);
    Wp.addLights(Lights);
    Hz.addLights(Lights);
    Av.addLights(Lights);
    Pt.addLights(Cam, Lights);
    if (Wx.flash() > 0.01) {
      // Lightning lights the wall, not just the sky.
      Lights.addHex(C.W * 0.5, -60, 900, '#cfe0ff', Wx.flash() * 1.6, 200);
    }
    Lights.end();

    // --- solid pass -----------------------------------------------------
    Pipe.beginSprites(1, s.fog);
    IF.Backdrop.draw(Cam.y, s.haze, s.snow, s.rock, 1, t);
    Wx.drawSnow(0.5 + s.snowfall * 0.4, s.haze, false, true);
    IF.Backwall.draw(Cam.y, 1, 0.10 + s.snowfall * 0.08, s.rock);
    IF.Backwall.drawShadows(Cam, s.keyDir, 1);
    Sc.terrain(Cam);
    Sc.dressing(Cam);
    Wp.draw();
    Hz.draw();
    Av.draw();
    P.draw();
    Gr.draw();
    Pt.draw(Cam, false);
    Pipe.endSprites();

    // --- air ------------------------------------------------------------
    var mist = 0.08 + s.snowfall * 0.16 + Av.roar() * 0.32;
    Sc.mist(Cam.y, t, mist, C.H * 0.72, C.H * 0.85);

    // --- light pass -----------------------------------------------------
    Pipe.beginSprites(1, s.fog);
    D.useAtlas();
    P.drawGlow();
    Wp.drawGlow();
    Hz.drawGlow();
    Av.drawGlow();
    Gr.drawAim();
    Pt.draw(Cam, true);
    Wx.drawBolt();
    D.blend('normal');
    Wx.drawSnow(0.55 + s.snowfall * 0.45, [1, 1, 1], true, false);
    Wx.drawForeground(Cam.y, s.haze, 1);

    // --- interface ------------------------------------------------------
    var hudA = alpha * (paused ? 0.35 : 1);
    Hud.draw(Run, P, Av, s, hudA * U.clamp01(intro * 2));
    if (paused) drawPause();
    if (Run.over) drawOutro();
    Pipe.endSprites();

    // --- distortion ------------------------------------------------------
    Pipe.beginWarp();
    Hz.drawWarp();
    Pipe.endWarp();

    // --- grade ----------------------------------------------------------
    var extra = {
      fade: alpha,
      zoom: Cam.zoom,
      rot: Cam.rot,
      warpAmt: Hz.hasWarp() ? 0.03 : 0,
      desat: U.clamp01((1 - P.health / C.HEALTH) * 0.30 + (P.dead ? Run.endTime() * 0.5 : 0)),
      vignette: 0.40 + Av.roar() * 0.25 + (1 - P.health / C.HEALTH) * 0.16,
      flash: Math.max(hitFlash * 0.28, Wx.flash() * 0.30),
      flashCol: hitFlash > Wx.flash() ? [1, 0.45, 0.35] : [0.72, 0.82, 1],
      exposure: 1 + Wx.flash() * 0.18,
      aberration: 0.16 + hitFlash * 1.4 + Cam.trauma() * 0.9
    };
    if (paused) { extra.desat = 0.55; extra.vignette = 0.78; extra.exposure = 0.72; }
    Pipe.present(Sc.grade(Cam, extra));
  };

  // --- pause card ----------------------------------------------------------

  function drawPause() {
    if (pauseMode === 'settings') { IF.Menu.drawSettings('SETTINGS'); return; }
    var w = 268, h = 40 + PAUSE_ITEMS.length * 22 + 26;
    var x = (C.W - w) / 2, y = (C.H - h) / 2;
    var cy = IF.Menu.card(x, y, w, h, 'PAUSED');

    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var on = i === pauseSel;
      var iy = cy + i * 22;
      if (on) {
        D.panel(x + 10, iy - 12, w - 20, 20, 0.5);
        D.sprite('chevron', x + 20, iy - 3, {
          rot: -Math.PI / 2, scale: 0.7, color: '#9fe4ff', lit: 0,
          alpha: 0.6 + 0.4 * Math.sin(IF.time * 6)
        });
      }
      F.text(PAUSE_ITEMS[i], C.W / 2, iy, {
        align: 'center', color: on ? '#ffffff' : '#a9bfd3', shadow: 1
      });
    }
    F.text(Math.round(C.altitudeAt(P.cy())) + ' M    ' + U.time(Run.time) +
           '    ' + U.commas(Run.score), C.W / 2, y + h - 10, {
      align: 'center', color: '#6f8aa4', shadow: 1
    });
  }

  // The moment the run ends, before the results card takes over.
  function drawOutro() {
    var e = Run.endTime();
    if (Run.won) {
      var a = U.clamp01(e * 1.4);
      D.blend('add');
      D.glow(C.W / 2, C.H * 0.4, 240 * a, '#ffe4b0', 0.20 * a);
      D.blend('normal');
      F.text('SUMMIT', C.W / 2, C.H * 0.4, {
        align: 'center', scale: 3, color: '#fff4d8', shadow: 1,
        alpha: a, glow: 0.4
      });
    } else {
      var a2 = U.clamp01(e * 1.6);
      var msg = Av.caught() ? 'THE AVALANCHE TOOK YOU' : 'YOU FELL';
      F.text(msg, C.W / 2, C.H * 0.46, {
        align: 'center', scale: 2, color: '#ffd0c4', shadow: 1, alpha: a2
      });
    }
  }

  IF.registerState('play', St);
})();
