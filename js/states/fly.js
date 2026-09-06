(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var Font = SITF.Font;
  var Par = SITF.Parallax;
  var R = SITF.RockFace;
  var COL = C.COLORS;

  // A camera-only pass up the whole mountain, with no climber and no fog.
  // This is the review gate for the face itself: the shape, the light, the
  // band seams and the stage transitions, with nothing in front of them.
  // Reached with ?fly=1, and only under DEBUG.

  var Fly = {};
  var camY, speed, t, worst, paused;

  Fly.enter = function () {
    camY = 0;
    speed = 60;
    t = 0;
    worst = 0;
    paused = false;
    SITF.Face.reset();
    R.warm(0, 3);
  };

  Fly.exit = function () {};
  Fly.isPaused = function () { return false; };

  Fly.update = function (dt) {
    t += dt;
    var acts = SITF.Input.takeActions();
    for (var i = 0; i < acts.length; i++) {
      if (acts[i] === 'confirm' || acts[i] === 'pause') paused = !paused;
      if (acts[i] === 'up') speed = Math.min(600, speed * 1.5);
      if (acts[i] === 'down') speed = Math.max(15, speed / 1.5);
      if (acts[i] === 'quit') SITF.setState('title');
    }
    SITF.Input.takeHop();
    if (!paused) camY -= speed * dt;
    if (camY < -C.WORLD_H - 200) camY = 0;
    if (camY > 0) camY = 0;
  };

  function toScreenY(worldY) { return worldY - camY + C.CLIMBER_SCREEN_Y; }
  function toScreenX(x) { return x; }

  Fly.draw = function (ctx) {
    var rf = U.rfOf(camY);
    Par.draw(ctx, rf, -camY, t);
    Par.distanceHaze(ctx, rf);
    R.draw(ctx, { toScreenX: toScreenX, toScreenY: toScreenY, camY: camY });

    if (!Fly.hud) return;

    var bake = R.lastBakeMs();
    if (bake > worst) worst = bake;

    var alt = SITF.Face.altitudeOf(camY);
    var seg = SITF.Face.segmentAt(U.clamp(camY, -C.WORLD_H, 0));
    U.softPanel(ctx, 6, 6, 210, 42, 0.55);
    Font.draw(ctx, alt + ' M   ' + C.ZONES[seg.stage].name, 12, 10,
              { scale: 1, color: COL.text });
    Font.draw(ctx, seg.kind.toUpperCase() + '   BAND ' + R.bandAt(camY), 12, 22,
              { scale: 1, color: COL.accent });
    Font.draw(ctx, 'BAKE ' + bake.toFixed(1) + ' MS  WORST ' + worst.toFixed(1), 12, 34,
              { scale: 1, color: worst > 20 ? COL.warn : COL.textDim });
    Font.draw(ctx, (paused ? 'PAUSED' : 'FLY') + '  ' + Math.round(speed) + ' PX/S' +
              '   UP/DOWN SPEED   ENTER PAUSE   T QUIT', 8, C.H - 12,
              { scale: 1, color: COL.textDim, alpha: 0.8 });
  };

  Fly.hud = true;

  Fly.setCamY = function (y) { camY = U.clamp(y, -C.WORLD_H - 200, 0); };
  Fly.camY = function () { return camY; };

  SITF.registerState('fly', Fly);
})();
