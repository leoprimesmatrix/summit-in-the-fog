// Input.
//
// Actions, not keys. Everything the game asks is "is jump held", "was dash
// pressed this frame", never "is Space down", so rebinding and the gamepad
// and the touch pad all land in the same place.
//
// Buffering lives here too: a press is remembered for a fraction of a second
// so a jump entered a frame before landing still fires. That single detail is
// most of what makes a platformer feel fair.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var I = {};

  var ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'axe', 'pause', 'confirm', 'back', 'mute', 'restart'];

  var BIND = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyX'],
    axe: ['KeyC', 'KeyE', 'KeyF'],
    pause: ['Escape', 'KeyP'],
    confirm: ['Enter', 'NumpadEnter', 'Space'],
    back: ['Escape', 'Backspace'],
    mute: ['KeyM'],
    restart: ['KeyR']
  };

  var down = {};        // action -> bool
  var pressed = {};     // action -> bool, this frame only
  var released = {};
  var buffer = {};      // action -> seconds since press
  var raw = {};         // code -> bool

  var mouse = { x: 0, y: 0, down: false, pressed: false, released: false, inside: false };
  var pointerWorld = { x: 0, y: 0 };
  var anyPressed = false;
  var lastDevice = 'keyboard';

  var padIndex = -1;
  var padPrev = {};

  var canvas = null;

  function set(action, isDown) {
    if (isDown && !down[action]) {
      pressed[action] = true;
      buffer[action] = 0;
      anyPressed = true;
    } else if (!isDown && down[action]) {
      released[action] = true;
    }
    down[action] = isDown;
  }

  function refresh() {
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i];
      var keys = BIND[a];
      var isDown = false;
      for (var k = 0; k < keys.length; k++) {
        if (raw[keys[k]]) { isDown = true; break; }
      }
      if (isDown !== !!down[a]) set(a, isDown);
    }
  }

  I.init = function (cv) {
    canvas = cv;

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      // Let the browser keep its own shortcuts; take the game's keys only.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var used = false;
      for (var a in BIND) {
        if (BIND[a].indexOf(e.code) >= 0) { used = true; break; }
      }
      raw[e.code] = true;
      lastDevice = 'keyboard';
      refresh();
      if (used) e.preventDefault();
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      raw[e.code] = false;
      refresh();
    });

    window.addEventListener('blur', function () {
      raw = {};
      for (var a in down) if (down[a]) set(a, false);
    });

    function pointer(e, isDown, isMove) {
      var rect = canvas.getBoundingClientRect();
      var sx = rect.width / C.W, sy = rect.height / C.H;
      mouse.x = (e.clientX - rect.left) / sx;
      mouse.y = (e.clientY - rect.top) / sy;
      mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= C.W && mouse.y <= C.H;
      if (!isMove) {
        if (isDown && !mouse.down) { mouse.pressed = true; anyPressed = true; }
        if (!isDown && mouse.down) mouse.released = true;
        mouse.down = isDown;
        lastDevice = 'pointer';
      }
    }

    window.addEventListener('pointermove', function (e) { pointer(e, mouse.down, true); });
    window.addEventListener('pointerdown', function (e) { pointer(e, true, false); });
    window.addEventListener('pointerup', function (e) { pointer(e, false, false); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('gamepadconnected', function (e) { padIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', function () { padIndex = -1; });
  };

  // Gamepad, polled. Sticks map onto the same actions as the keys.
  function pollPad() {
    if (!navigator.getGamepads) return;
    var pads = navigator.getGamepads();
    var pad = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    }
    if (!pad) return;
    var b = pad.buttons, ax = pad.axes;
    var dz = 0.35;
    var padState = {
      left: (b[14] && b[14].pressed) || ax[0] < -dz,
      right: (b[15] && b[15].pressed) || ax[0] > dz,
      up: (b[12] && b[12].pressed) || ax[1] < -dz,
      down: (b[13] && b[13].pressed) || ax[1] > dz,
      jump: b[0] && b[0].pressed,
      dash: (b[1] && b[1].pressed) || (b[6] && b[6].value > 0.4),
      axe: (b[2] && b[2].pressed) || (b[7] && b[7].value > 0.4) || (b[5] && b[5].pressed),
      pause: b[9] && b[9].pressed,
      confirm: b[0] && b[0].pressed,
      back: b[1] && b[1].pressed
    };
    var touched = false;
    for (var a in padState) {
      if (!padState.hasOwnProperty(a)) continue;
      if (padState[a]) touched = true;
      if (padState[a] !== !!padPrev[a]) {
        if (padState[a] || !raw._kb) set(a, padState[a] || anyRaw(a));
      }
    }
    // The right stick aims the axe.
    if (ax.length > 3) {
      var rx = ax[2], ry = ax[3];
      if (Math.abs(rx) > dz || Math.abs(ry) > dz) {
        I.aimX = rx; I.aimY = ry; I.hasAim = true;
        lastDevice = 'pad';
      } else if (lastDevice === 'pad') {
        I.hasAim = false;
      }
    }
    if (touched) lastDevice = 'pad';
    padPrev = padState;
  }

  function anyRaw(action) {
    var keys = BIND[action];
    for (var k = 0; k < keys.length; k++) if (raw[keys[k]]) return true;
    return false;
  }

  I.hasAim = false;
  I.aimX = 1; I.aimY = 0;

  I.update = function (dt) {
    pollPad();
    for (var a in buffer) {
      if (buffer.hasOwnProperty(a)) buffer[a] += dt;
    }
  };

  // Call once at the end of each frame's update.
  I.endFrame = function () {
    pressed = {};
    released = {};
    mouse.pressed = false;
    mouse.released = false;
    anyPressed = false;
  };

  I.down = function (a) { return !!down[a]; };
  I.pressed = function (a) { return !!pressed[a]; };
  I.released = function (a) { return !!released[a]; };
  I.any = function () { return anyPressed || mouse.pressed; };
  I.device = function () { return lastDevice; };

  // A press that happened within `window` seconds and has not been spent.
  I.buffered = function (a, w) {
    return buffer[a] !== undefined && buffer[a] <= (w === undefined ? C.JUMP_BUFFER : w);
  };
  I.consume = function (a) { buffer[a] = 999; };

  I.axisX = function () {
    return (down.right ? 1 : 0) - (down.left ? 1 : 0);
  };
  I.axisY = function () {
    return (down.down ? 1 : 0) - (down.up ? 1 : 0);
  };

  I.mouse = mouse;

  I.clear = function () {
    down = {}; pressed = {}; released = {}; buffer = {};
    mouse.pressed = mouse.released = false;
  };

  I.bindings = BIND;

  IF.Input = I;
})();
