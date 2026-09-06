(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var Aud = SITF.Audio;
  var Par = SITF.Parallax;
  var COL = C.COLORS;

  // A settings panel that can be hosted two ways: as its own state from the
  // title screen, or as an overlay drawn by the play state while paused, so
  // a run in progress is never reset just to nudge a volume.

  var ITEMS = ['music', 'sfx', 'mute', 'back'];
  var LABELS = { music: 'WIND VOLUME', sfx: 'EFFECTS VOLUME', mute: 'MUTE ALL', back: 'BACK' };
  var STEP = 0.1;

  var Panel = { sel: 0, t: 0, flash: 0 };

  Panel.open = function () {
    Panel.sel = 0;
    Panel.t = 0;
    Panel.flash = 0;
  };

  function adjust(item, dir) {
    if (item === 'music') {
      Aud.setMusicVolume(Math.round((Aud.musicVol + dir * STEP) * 10) / 10);
      Aud.ui();
    } else if (item === 'sfx') {
      Aud.setSfxVolume(Math.round((Aud.sfxVol + dir * STEP) * 10) / 10);
      Aud.play('sfx_land', { volume: 0.8 });
    } else if (item === 'mute') {
      Aud.toggleMuted();
      Aud.ui();
    }
    Panel.flash = 0.15;
  }

  // Returns true when the user asked to leave the panel.
  Panel.update = function (dt, actions) {
    Panel.t += dt;
    if (Panel.flash > 0) Panel.flash -= dt;
    var leave = false;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var item = ITEMS[Panel.sel];
      if (a === 'up') { Panel.sel = (Panel.sel + ITEMS.length - 1) % ITEMS.length; Aud.ui(); }
      else if (a === 'down' || a === 'settings') { Panel.sel = (Panel.sel + 1) % ITEMS.length; Aud.ui(); }
      else if (a === 'left') adjust(item, -1);
      else if (a === 'right') adjust(item, 1);
      else if (a === 'confirm') {
        if (item === 'back') { leave = true; Aud.ui(); }
        else if (item === 'mute') adjust(item, 0);
        else adjust(item, 1);
      }
      else if (a === 'pause' || a === 'quit') { leave = true; Aud.ui(); }
      else if (a === 'mute') { Aud.toggleMuted(); Panel.flash = 0.15; }
    }
    return leave;
  };

  function drawBar(ctx, x, y, w, value, active) {
    var segs = 10;
    var segW = Math.floor(w / segs);
    for (var i = 0; i < segs; i++) {
      var on = (i / segs) < value - 0.001;
      ctx.fillStyle = on ? (active ? COL.accent : COL.text) : COL.ink;
      ctx.globalAlpha = on ? 1 : 0.55;
      ctx.fillRect(x + i * segW, y, segW - 2, 7);
    }
    ctx.globalAlpha = 1;
  }

  Panel.draw = function (ctx, opts) {
    opts = opts || {};
    var boxW = 340, boxH = 168;
    var bx = Math.round((C.W - boxW) / 2), by = Math.round((C.H - boxH) / 2) - 6;

    U.panel(ctx, bx, by, boxW, boxH, COL.ink, 0.9);
    Font.draw(ctx, 'SETTINGS', C.W / 2, by + 12, { scale: 2, align: 'center', color: COL.text });

    var rowY = by + 46;
    var labelX = bx + 22, valueX = bx + boxW - 22;
    for (var i = 0; i < ITEMS.length; i++) {
      var item = ITEMS[i];
      var active = (i === Panel.sel);
      var y = rowY + i * 26;

      if (active) {
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.06 * Math.sin(Panel.t * 6);
        ctx.fillStyle = COL.accent;
        ctx.fillRect(bx + 10, y - 5, boxW - 20, 18);
        ctx.restore();
        Font.draw(ctx, '>', labelX - 12, y, { scale: 1, color: COL.accent });
      }

      Font.draw(ctx, LABELS[item], labelX, y, { scale: 1, color: active ? COL.text : COL.textDim });

      if (item === 'music' || item === 'sfx') {
        var v = item === 'music' ? Aud.musicVol : Aud.sfxVol;
        drawBar(ctx, valueX - 120, y, 96, v, active);
        Font.draw(ctx, Math.round(v * 10) + '', valueX, y, { scale: 1, align: 'right', color: active ? COL.accent : COL.text });
      } else if (item === 'mute') {
        Font.draw(ctx, Aud.muted ? 'ON' : 'OFF', valueX, y,
                  { scale: 1, align: 'right', color: Aud.muted ? COL.warn : COL.text });
      }
    }

    Font.draw(ctx, 'UP/DOWN SELECT   LEFT/RIGHT ADJUST   ESC BACK', C.W / 2, by + boxH - 14,
              { scale: 1, align: 'center', color: COL.textDim, alpha: 0.85 });
  };

  SITF.SettingsPanel = Panel;

  // ---- standalone state, entered from the title -----------------------------

  var drift = 0, t = 0;
  var State = {};

  State.enter = function () { t = 0; Panel.open(); };
  State.exit = function () {};
  State.isPaused = function () { return false; };

  State.update = function (dt) {
    t += dt;
    drift = 30 + Math.sin(t * 0.157) * 30;
    SITF.Input.takeHop();
    var acts = SITF.Input.takeActions();
    if (Panel.update(dt, acts)) SITF.setState('title');
  };

  State.draw = function (ctx) {
    Par.drawDay(ctx, drift, t, 1);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COL.fog;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();
    Panel.draw(ctx);
  };

  SITF.registerState('settings', State);
})();
