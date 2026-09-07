// The camera.
//
// It only travels vertically, because the mountain is exactly one screen
// wide. What it does have is trauma: impacts add to a scalar, the scalar
// decays, and shake is trauma squared. Squaring is the trick - a small hit
// barely registers and a serac landing next to you is violent, from one
// number.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Cam = {};

  Cam.y = 0;            // world y at the top of the frame
  Cam.shakeX = 0;
  Cam.shakeY = 0;
  Cam.zoom = 1;         // punch-in on impacts, applied in the post pass
  Cam.rot = 0;

  var trauma = 0;
  var traumaDecay = C.TRAUMA_DECAY;
  var target = 0;
  var look = 0;
  var punch = 0;
  var noiseT = 0;
  var strength = 1;     // scaled by the shake setting

  Cam.reset = function (y) {
    Cam.y = y;
    target = y;
    look = 0;
    trauma = 0; punch = 0;
    Cam.shakeX = Cam.shakeY = 0;
    Cam.zoom = 1; Cam.rot = 0;
  };

  Cam.setStrength = function (s) { strength = U.clamp01(s); };

  // Add trauma. 1.0 is "a serac landed on the ledge you are standing on".
  Cam.shake = function (amount) {
    trauma = U.clamp01(trauma + amount);
  };

  // A brief scale punch, separate from shake so a pickup can pop without the
  // frame rattling.
  Cam.punch = function (amount) {
    punch = Math.max(punch, amount);
  };

  // Follow a point. The camera holds the climber a little below centre so
  // there is more mountain above than below, and leads in the direction of
  // travel so a fast fall does not outrun the frame.
  Cam.follow = function (px, py, vy, dt, instant) {
    var want = py - C.H * 0.58;
    // Look ahead down when falling fast, up a little when rising.
    var lead = U.clamp(vy * 0.22, -C.CAM_LOOKAHEAD * 0.6, C.CAM_LOOKAHEAD);
    look = U.approach(look, lead, C.CAM_LOOK_TAU, dt);
    target = want + look;

    var maxY = C.WORLD_H - C.H;
    target = U.clamp(target, -40, maxY + 40);

    if (instant) Cam.y = target;
    else Cam.y = U.approach(Cam.y, target, C.CAM_LERP_TAU, dt);
  };

  Cam.update = function (dt) {
    noiseT += dt * 34;
    trauma = Math.max(0, trauma - traumaDecay * dt);
    punch = Math.max(0, punch - dt * 3.4);

    var s = trauma * trauma * strength;
    if (s > 0.0001) {
      // Three decorrelated noise streams, so the shake never repeats a path.
      Cam.shakeX = (U.noise1(noiseT, 11) * 2 - 1) * C.TRAUMA_MAX_OFFSET * s;
      Cam.shakeY = (U.noise1(noiseT + 100, 29) * 2 - 1) * C.TRAUMA_MAX_OFFSET * s;
      Cam.rot = (U.noise1(noiseT * 0.7 + 300, 53) * 2 - 1) * C.TRAUMA_MAX_ANGLE * s;
    } else {
      Cam.shakeX = Cam.shakeY = Cam.rot = 0;
    }
    Cam.zoom = 1 + punch * 0.06 + s * 0.035;
  };

  Cam.trauma = function () { return trauma; };

  // World -> screen. Everything drawn goes through these two.
  Cam.sx = function (x) { return x + Cam.shakeX; };
  Cam.sy = function (y) { return y - Cam.y + Cam.shakeY; };

  Cam.top = function () { return Cam.y - 40; };
  Cam.bottom = function () { return Cam.y + C.H + 40; };
  Cam.visible = function (y, pad) {
    pad = pad || 60;
    return y > Cam.y - pad && y < Cam.y + C.H + pad;
  };

  IF.Camera = Cam;
})();
