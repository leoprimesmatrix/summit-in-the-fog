(function () {
  'use strict';
  var C = SITF.Config;

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

  function onKeyDown(e) {
    if (e.repeat) return;
    var code = e.code;

    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' ||
        code === 'ArrowDown' || code === 'Space') {
      e.preventDefault();
    }

    I.anyPress = true;
    if (SITF.Audio) SITF.Audio.unlock();

    if (HOP_KEYS.hasOwnProperty(code)) {
      queueHop(HOP_KEYS[code]);
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
      case 'KeyQ': I.pushAction('quit'); break;
      case 'ArrowDown': I.pushAction('down'); break;
      case 'KeyS': I.pushAction('settings'); break;
    }
  }

  // Pointer handling: main.js converts to internal coords and calls this.
  I.pointer = function (x, y, mode) {
    I.anyPress = true;
    if (SITF.Audio) SITF.Audio.unlock();
    if (mode === 'play') {
      if (x < C.W / 3) queueHop(-1);
      else if (x > C.W * 2 / 3) queueHop(1);
      else queueHop(0);
    } else {
      I.pushAction('confirm');
    }
  };

  I.init = function () {
    window.addEventListener('keydown', onKeyDown, { passive: false });
  };

  SITF.Input = I;
})();
