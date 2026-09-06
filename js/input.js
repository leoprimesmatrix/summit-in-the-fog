(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  var I = {
    hop: null,          // {dir, t}
    actionQueue: [],    // 'confirm' | 'pause' | 'mute' | 'restart' | 'quit'
    anyPress: false
  };

  function queueHop(dir) {
    I.hop = { dir: dir, t: SITF.time };
  }
  I.queueHop = queueHop;

  I.takeHop = function () {
    if (!I.hop) return null;
    if (SITF.time - I.hop.t > C.INPUT_BUFFER) { I.hop = null; return null; }
    var d = I.hop.dir;
    I.hop = null;
    return d;
  };

  I.clearHop = function () { I.hop = null; };

  I.pushAction = function (a) { I.actionQueue.push(a); };
  I.takeActions = function () {
    var a = I.actionQueue;
    I.actionQueue = [];
    return a;
  };

  var HOP_KEYS = {
    'ArrowLeft': -1, 'KeyA': -1,
    'ArrowRight': 1, 'KeyD': 1,
    'ArrowUp': 0, 'KeyW': 0, 'Space': 0
  };

  // Two-lane leaps: their own keys, or shift with a direction.
  var LEAP_KEYS = { 'KeyQ': -2, 'KeyE': 2 };

  function onKeyDown(e) {
    if (e.repeat) return;
    var code = e.code;

    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' ||
        code === 'ArrowDown' || code === 'Space') {
      e.preventDefault();
    }

    I.anyPress = true;
    if (SITF.Audio) SITF.Audio.unlock();

    if (LEAP_KEYS.hasOwnProperty(code)) {
      queueHop(LEAP_KEYS[code]);
      I.pushAction(LEAP_KEYS[code] < 0 ? 'left' : 'right');
      return;
    }

    if (HOP_KEYS.hasOwnProperty(code)) {
      var dir = HOP_KEYS[code];
      if (e.shiftKey && dir !== 0) dir *= 2;
      queueHop(dir);
      // Menus read these as navigation.
      if (HOP_KEYS[code] === -1) I.pushAction('left');
      else if (HOP_KEYS[code] === 1) I.pushAction('right');
      else if (code !== 'Space') I.pushAction('up');
      if (code === 'Space') I.pushAction('confirm');
      return;
    }

    switch (code) {
      case 'Enter': case 'NumpadEnter': I.pushAction('confirm'); break;
      case 'Escape': I.pushAction('pause'); break;
      case 'KeyP': I.pushAction('pause'); break;
      case 'KeyM': I.pushAction('mute'); break;
      case 'KeyR': I.pushAction('restart'); break;
      // Q and E are the two-lane leaps now, so leaving a run is T (title).
      case 'KeyT': case 'Backspace': I.pushAction('quit'); break;
      case 'ArrowDown': I.pushAction('down'); break;
      case 'KeyS': I.pushAction('settings'); break;
    }
  }

  // Pointer handling: main.js converts to internal coords and calls this.
  I.pointer = function (x, y, mode) {
    I.anyPress = true;
    if (SITF.Audio) SITF.Audio.unlock();
    if (mode === 'play') {
      // Tap the lane you want: the screen is split into as many columns as
      // there are lanes, and the hop is relative to where the climber stands.
      var lanes = C.LANE_X.length;
      var col = U.clamp(Math.floor(x / (C.W / lanes)), 0, lanes - 1);
      var here = SITF.states.play && SITF.states.play.snapshot
        ? (SITF.states.play.snapshot() || {}).lane : null;
      if (here == null) { queueHop(0); return; }
      queueHop(U.clamp(col - here, -C.MAX_HOP, C.MAX_HOP));
    } else {
      I.pushAction('confirm');
    }
  };

  I.init = function () {
    window.addEventListener('keydown', onKeyDown, { passive: false });
  };

  SITF.Input = I;
})();
