(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var S = SITF.Sprites;
  var Par = SITF.Parallax;
  var Part = SITF.Particles;
  var Aud = SITF.Audio;
  var COL = C.COLORS;

  var t, phase, gustT, gustP, drift, best, wispAcc, snowAcc;

  var Title = {};

  // The title screen demonstrates the mechanic: fog sits over the peak and a
  // gust parts it every few seconds to reveal the summit.
  var FOG_LINE = 172;
  var GUST_EVERY = 6.0;
  var GUST_DUR = 1.6;

  // Snow drifts across the title in two depths: 'screen' flakes fall behind
  // the logo, 'front' flakes pass in front of it. Both respond to the gust,
  // because Particles gives every snow flake a sideways push while one blows.
  function flake(atY) {
    var front = Math.random() < 0.34;
    var vy = front ? 42 + Math.random() * 26 : 20 + Math.random() * 18;
    var y = (atY == null) ? -4 : atY;
    Part.spawn('snow', Math.random() * C.W, y, {
      vx: -8 + Math.random() * 20,
      vy: vy,
      life: (C.H + 24 - y) / vy,
      w: front ? 2 : 1,
      h: front ? 2 : 1,
      color: front ? '#ffffff' : COL.snow,
      alpha: front ? 0.75 + Math.random() * 0.25 : 0.40 + Math.random() * 0.30,
      layer: front ? 'front' : 'screen'
    });
  }

  Title.enter = function () {
    t = 0;
    phase = SITF.Input.anyPress ? 1 : 0;
    gustT = 2.0;
    gustP = -1;
    drift = 0;
    wispAcc = 0;
    snowAcc = 0;
    Part.clear();
    // Start with snow already falling rather than an empty sky.
    for (var f = 0; f < 80; f++) flake(Math.random() * C.H);
    var b = U.storageGet(C.STORAGE_KEY_BEST);
    best = b ? parseFloat(b) : null;
    if (best != null && !isFinite(best)) best = null;
  };

  Title.exit = function () {};
  Title.isPaused = function () { return false; };

  Title.update = function (dt) {
    t += dt;
    drift = 30 + Math.sin(t * 0.157) * 30;

    if (gustP >= 0) {
      gustP += dt / GUST_DUR;
      if (gustP >= 1) { gustP = -1; gustT = GUST_EVERY; }
    } else {
      gustT -= dt;
      if (gustT <= 0) {
        gustP = 0;
        if (phase === 1) Aud.play('sfx_gust', { volume: 0.3 });
        Part.gustBoost = GUST_DUR;
        for (var i = 0; i < 26; i++) {
          Part.spawn('streak', -30 - Math.random() * 60, 24 + Math.random() * 140, {
            vx: 280 + Math.random() * 120, vy: 0,
            life: 0.6 + Math.random() * 0.3,
            w: 12 + Math.floor(Math.random() * 18), h: 1,
            color: COL.text, alpha: 0.3 + Math.random() * 0.3, layer: 'screen'
          });
        }
      }
    }

    snowAcc += dt * 30;
    while (snowAcc >= 1) { snowAcc -= 1; flake(); }

    wispAcc += dt;
    if (wispAcc > 1.6) {
      wispAcc = 0;
      Part.spawn('wisp', -40, 150 + Math.random() * 150, {
        vx: 18 + Math.random() * 16, vy: 0, life: 14,
        w: 28 + Math.floor(Math.random() * 22), h: 2 + Math.floor(Math.random() * 4),
        color: COL.fog, alpha: 0.2, layer: 'screen'
      });
    }

    Part.update(dt);

    var acts = SITF.Input.takeActions();
    // A hop key also counts as "press any key" on the title.
    var hopped = SITF.Input.takeHop();
    for (var a = 0; a < acts.length; a++) {
      if (acts[a] === 'mute') { Aud.toggleMuted(); acts[a] = null; }
    }
    var confirmed = false;
    for (var b2 = 0; b2 < acts.length; b2++) {
      if (acts[b2] === 'confirm') confirmed = true;
    }

    if (phase === 0) {
      if (confirmed || hopped !== null) {
        phase = 1;
        Aud.unlock();
        Aud.ui();
      }
      return;
    }

    var openSettings = false;
    for (var c2 = 0; c2 < acts.length; c2++) if (acts[c2] === 'settings') openSettings = true;
    if (openSettings) { Aud.ui(); SITF.setState('settings'); return; }

    if (confirmed) {
      Aud.ui();
      SITF.setState('play');
    }
  };

  Title.draw = function (ctx) {
    Par.drawDay(ctx, drift, t, 1);

    drawTitleFog(ctx);
    Part.draw(ctx, 'screen');

    // Vignette so the text reads over the artwork.
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, C.H);
    g.addColorStop(0, U.rgba(COL.ink, 0.35));
    g.addColorStop(0.4, U.rgba(COL.ink, 0.05));
    g.addColorStop(1, U.rgba(COL.ink, 0.75));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();

    var bob = Math.round(Math.sin(t * 1.5));
    SITF.Logo.draw(ctx, C.W / 2, 22 + bob, t);
    Font.draw(ctx, 'THE FOG HIDES THE PATH.', C.W / 2, 128,
              { scale: 1, align: 'center', color: COL.textDim, shadow: COL.ink });

    if (phase === 0) {
      var blink = (t % 1.0) < 0.6;
      if (blink) {
        Font.draw(ctx, 'PRESS ANY KEY', C.W / 2, 196,
                  { scale: 2, align: 'center', color: COL.text, shadow: COL.ink });
      }
      Font.draw(ctx, 'MICRO JAM 064', C.W - 8, C.H - 12,
                { scale: 1, align: 'right', color: COL.textDim, alpha: 0.7 });
      Part.draw(ctx, 'front');
      return;
    }

    var blink2 = (t % 1.4) < 0.9;
    if (blink2) {
      Font.draw(ctx, 'ENTER - CLIMB', C.W / 2, 154,
                { scale: 2, align: 'center', color: COL.accent, shadow: COL.ink });
    }

    var line = 'ROUTE 064   SUMMIT 4800 M';
    Font.draw(ctx, line, C.W / 2, 182,
              { scale: 1, align: 'center', color: COL.text, shadow: COL.ink });
    if (best != null) {
      Font.draw(ctx, 'BEST  ' + U.formatTime(best), C.W / 2, 196,
                { scale: 1, align: 'center', color: COL.warn, shadow: COL.ink });
    }

    drawControls(ctx);

    Font.draw(ctx, 'S  SETTINGS     M  ' + (Aud.muted ? 'MUTED' : 'MUTE'), 8, C.H - 12,
              { scale: 1, color: Aud.muted ? COL.warn : COL.textDim, alpha: 0.9 });
    Font.draw(ctx, 'MICRO JAM 064', C.W - 8, C.H - 12,
              { scale: 1, align: 'right', color: COL.textDim, alpha: 0.7 });

    // Nearest flakes drift over the logo and text.
    Part.draw(ctx, 'front');
  };

  function drawControls(ctx) {
    var boxW = 372, boxX = Math.round((C.W - boxW) / 2), boxY = 218, boxH = 76;
    U.panel(ctx, boxX, boxY, boxW, boxH, COL.ink, 0.55);

    var cy = boxY + 10;
    var ax = boxX + 14;
    ctx.drawImage(S.img.arrow_l, ax, cy);
    ctx.drawImage(S.img.arrow_u, ax + 12, cy);
    ctx.drawImage(S.img.arrow_r, ax + 24, cy);
    Font.draw(ctx, 'OR A W D   HOP TO THE NEXT LEDGE', ax + 40, cy + 1,
              { scale: 1, color: COL.text });

    Font.draw(ctx, 'EVERY LANDING RIPPLES THE FOG. KEEP MOVING TO KEEP SEEING.', C.W / 2, cy + 24,
              { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'GUSTS SHOW FAR AHEAD. BLIND HOPS PAY DOUBLE.', C.W / 2, cy + 38,
              { scale: 1, align: 'center', color: COL.textDim });
    Font.draw(ctx, 'CAIRNS SAVE YOUR CLIMB. OUTRUN THE WHITEOUT.', C.W / 2, cy + 52,
              { scale: 1, align: 'center', color: COL.textDim });
  }

  // A simplified version of the gameplay fog, drawn straight to the canvas.
  function drawTitleFog(ctx) {
    var density = 0.86;
    ctx.save();

    var wipeX = -100, ga = 0;
    if (gustP >= 0) {
      var pw = Math.min(1, gustP / 0.5);
      wipeX = U.lerp(-80, C.W + 80, U.easeOutQuad(pw));
      ga = gustP > 0.75 ? 1 - (gustP - 0.75) / 0.25 : 1;
    }

    // Band above the fog line, with the gust hole cut out of it.
    for (var x = 0; x < C.W; x += 4) {
      var revealed = (x < wipeX) ? ga : 0;
      // Soften the leading edge of the wipe.
      if (x >= wipeX && x < wipeX + 40) revealed = ga * (1 - (x - wipeX) / 40) * 0.7;
      var a = density * (1 - U.clamp(revealed, 0, 1));
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = COL.fog;
      var wob = Math.sin(x * 0.05 + t * 0.6) * 5 + Math.sin(x * 0.13 - t * 0.9) * 3;
      var lineY = FOG_LINE + wob;
      ctx.fillRect(x, 0, 4, lineY);
      // Soft skirt below.
      for (var s = 0; s < 3; s++) {
        ctx.globalAlpha = a * (0.5 - s * 0.15);
        ctx.fillRect(x, lineY + s * 8, 4, 8);
      }
    }

    // Slow rolling body of fog across the lower half.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = COL.fog;
    for (var i = 0; i < 5; i++) {
      var yy = 150 + i * 26 + Math.sin(t * 0.3 + i) * 6;
      var xx = ((t * (6 + i * 2)) % (C.W + 200)) - 100;
      ctx.globalAlpha = 0.14 - i * 0.02;
      ctx.fillRect(0, Math.round(yy), C.W, 14);
      ctx.globalAlpha = 0.10;
      ctx.fillRect(Math.round(xx), Math.round(yy - 6), 160, 10);
    }

    ctx.restore();
  }

  SITF.registerState('title', Title);
})();
