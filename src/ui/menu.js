// Shared interface pieces: the settings panel, and the card layout the pause
// and results screens are built from.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var M = {};

  var sel = 0;
  var rows = [];
  var boxes = [];
  var t = 0;

  function buildRows() {
    var Aud = IF.Audio;
    rows = [
      {
        label: 'SOUND', type: 'slider',
        get: function () { return Aud.sfx(); },
        set: function (v) { Aud.setSfx(v); Aud.play('sfx_ui', { volume: 1 }); }
      },
      {
        label: 'MUTE', type: 'toggle',
        get: function () { return Aud.muted(); },
        set: function (v) { Aud.setMuted(v); if (!v) Aud.play('sfx_ui_hi'); }
      },
      {
        label: 'SCREEN SHAKE', type: 'slider',
        get: function () { return U.loadNum(C.K_SHAKE, 1); },
        set: function (v) { U.save(C.K_SHAKE, v.toFixed(2)); IF.Camera.setStrength(v); IF.Camera.shake(0.35); }
      },
      {
        label: 'EFFECTS', type: 'choice',
        options: ['FULL', 'REDUCED'],
        get: function () { return IF.Pipeline.quality() ? 0 : 1; },
        set: function (v) { IF.Pipeline.setQuality(v ? 0 : 1); U.save(C.K_QUALITY, v ? '0' : '1'); }
      },
      { label: 'BACK', type: 'back' }
    ];
  }

  M.openSettings = function () {
    buildRows();
    sel = 0;
    t = 0;
  };

  M.updateSettings = function (dt) {
    var In = IF.Input;
    var Aud = IF.Audio;
    t += dt;

    var m = In.mouse;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) {
        if (sel !== i) { sel = i; Aud.play('sfx_ui', { volume: 0.5 }); }
      }
    }

    if (In.pressed('down')) { sel = (sel + 1) % rows.length; Aud.play('sfx_ui'); }
    if (In.pressed('up')) { sel = (sel + rows.length - 1) % rows.length; Aud.play('sfx_ui'); }

    var r = rows[sel];
    if (!r) return;
    var dx = (In.pressed('right') ? 1 : 0) - (In.pressed('left') ? 1 : 0);
    var go = In.pressed('confirm') || In.pressed('jump') || m.pressed;

    if (r.type === 'slider') {
      if (dx) r.set(U.clamp01(r.get() + dx * 0.1));
      // Dragging the bar sets it directly.
      if (m.down && boxes[sel]) {
        var b2 = boxes[sel];
        var bx = b2.x + b2.w - 108, bw = 100;
        if (m.x >= bx - 6 && m.x <= bx + bw + 6 && m.y >= b2.y && m.y <= b2.y + b2.h) {
          r.set(U.clamp01((m.x - bx) / bw));
        }
      }
    } else if (r.type === 'toggle') {
      if (dx || go) r.set(!r.get());
    } else if (r.type === 'choice') {
      if (dx) r.set((r.get() + dx + r.options.length) % r.options.length);
      else if (go) r.set((r.get() + 1) % r.options.length);
    }
  };

  M.settingsBack = function () {
    return rows[sel] && rows[sel].type === 'back' &&
           (IF.Input.pressed('confirm') || IF.Input.pressed('jump') || IF.Input.mouse.pressed);
  };

  M.drawSettings = function (title) {
    var D = IF.Draw, F = IF.Font;
    var w = 300, h = 30 + rows.length * 26 + 26;
    var x = (C.W - w) / 2, y = (C.H - h) / 2 - 8;

    D.panel(x, y, w, h, 0.88);
    D.blend('add');
    D.glow(C.W / 2, y + 14, 130, '#8fd8ff', 0.09);
    D.blend('normal');
    F.text(title || 'SETTINGS', C.W / 2, y + 20, {
      align: 'center', scale: 2, color: '#eafaff', shadow: 1
    });

    boxes.length = 0;
    var ry = y + 44;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var on = i === sel;
      boxes.push({ x: x + 10, y: ry - 12, w: w - 20, h: 22 });
      if (on) {
        D.panel(x + 8, ry - 12, w - 16, 21, 0.55);
        D.sprite('chevron', x + 4, ry - 2, {
          rot: -Math.PI / 2, scale: 0.7, color: '#9fe4ff', lit: 0,
          alpha: 0.6 + 0.4 * Math.sin(t * 6)
        });
      }
      var col = on ? '#eafaff' : '#93aec6';
      F.text(r.label, x + 18, ry, { color: col, shadow: 1 });

      if (r.type === 'slider') {
        var bx = x + w - 118, bw = 100;
        D.rect(bx, ry - 7, bw, 4, '#1a2634', 0.9);
        D.rect(bx, ry - 7, bw * U.clamp01(r.get()), 4, on ? '#7fd4ff' : '#4d84a8', 1);
        D.rect(bx + bw * U.clamp01(r.get()) - 1, ry - 10, 3, 10, on ? '#eafaff' : '#87a5bd', 1);
      } else if (r.type === 'toggle') {
        F.text(r.get() ? 'ON' : 'OFF', x + w - 18, ry, {
          align: 'right', color: r.get() ? '#ff9f6a' : '#7fd4ff', shadow: 1
        });
      } else if (r.type === 'choice') {
        F.text(r.options[r.get()], x + w - 18, ry, {
          align: 'right', color: '#7fd4ff', shadow: 1
        });
      }
      ry += 26;
    }

    F.text('ARROWS  ADJUST      ESC  BACK', C.W / 2, y + h - 8, {
      align: 'center', color: '#6f8aa4', shadow: 1
    });
  };

  // A titled card, used by pause and results. Returns the content origin.
  M.card = function (x, y, w, h, title, alpha) {
    var D = IF.Draw, F = IF.Font;
    alpha = alpha === undefined ? 1 : alpha;
    D.panel(x, y, w, h, 0.88 * alpha);
    if (title) {
      D.blend('add');
      D.glow(x + w / 2, y + 14, w * 0.42, '#8fd8ff', 0.09 * alpha);
      D.blend('normal');
      F.text(title, x + w / 2, y + 21, {
        align: 'center', scale: 2, color: '#eafaff', shadow: 1, alpha: alpha
      });
      return y + 44;
    }
    return y + 14;
  };

  // A label/value row with the value right-aligned. Used on the results card.
  M.row = function (x, w, y, label, value, alpha, hi) {
    var F = IF.Font;
    F.text(label, x, y, { color: hi ? '#cfe6f7' : '#8ba4bd', alpha: alpha, shadow: 1 });
    F.text(value, x + w, y, {
      align: 'right', color: hi ? '#ffd48a' : '#eafaff', alpha: alpha, shadow: 1
    });
  };

  M.selection = function () { return sel; };
  M.rows = function () { return rows; };

  IF.Menu = M;
})();
