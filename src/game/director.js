// What the mountain throws at you, and when.
//
// Not a fixed script and not a coin flip. The director keeps a running idea of
// how hard the last few seconds have been and spends against a budget: it
// will not drop a second boulder into a lane you are still crossing, it goes
// quiet for a beat after a big hit, and it aims more accurately the higher
// you get. Difficulty comes from the zone; pacing comes from here.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Dir = {};

  var next = 0;
  var heat = 0;          // recent pressure; high heat buys quiet
  var since = 0;
  var lane = 0;
  var restT = 0;
  var stormBurst = 0;

  Dir.reset = function () {
    next = 2.6;
    heat = 0; since = 0; restT = 0; stormBurst = 0;
    lane = Math.random() * C.W;
  };

  Dir.rest = function (seconds) { restT = Math.max(restT, seconds); };
  Dir.heat = function () { return heat; };

  Dir.update = function (dt, player, zone, prog) {
    var Hz = IF.Hazards;
    heat = Math.max(0, heat - dt * 0.55);
    since += dt;

    if (restT > 0) { restT -= dt; return; }
    if (player.dead || player.won) return;

    next -= dt;
    if (next > 0) return;

    // The base interval comes from the zone; heat stretches it, so a busy
    // stretch is followed by air.
    var base = zone.boulderRate;
    var interval = base * (0.75 + Math.random() * 0.6) * (1 + heat * 0.5);
    // Standing still is not a strategy: the mountain notices.
    var stillness = U.clamp01(1 - Math.abs(player.vx) / 90);
    interval *= U.lerp(1.0, 0.72, stillness);
    next = Math.max(0.55, interval);

    // Size: bigger and more often as you climb, but never two heavies in a
    // row without a gap.
    var r = Math.random();
    var size;
    if (r < 0.34 - prog * 0.16) size = 0;
    else if (r < 0.72 - prog * 0.16) size = 1;
    else if (r < 0.94 - prog * 0.06) size = 2;
    else size = 3;
    if (size >= 2 && heat > 1.2) size = 1;

    // Where. Mostly near the climber, sometimes across the corridor to close
    // off a line before you take it.
    var aimAmount = U.clamp01(0.24 + prog * 0.44);
    var lw = IF.Terrain.leftAt(player.cy());
    var rw = IF.Terrain.rightAt(player.cy());
    var x;
    if (Math.random() < 0.34) {
      // Cut off the direction you are heading.
      x = player.cx() + U.sign(player.vx || player.facing) * U.lerp(50, 140, Math.random());
    } else {
      x = U.lerp(lw + 24, rw - 24, Math.random());
    }
    x = U.clamp(x, lw + 18, rw - 18);

    Hz.dropBoulder(size, x, aimAmount, player.cx());
    heat += 0.35 + size * 0.35;

    // In the storm band the sky sometimes lets go of several at once.
    if (zone.lightning && Math.random() < 0.22 && heat < 1.6) {
      stormBurst = 2 + ((Math.random() * 2) | 0);
      var self = this;
      for (var i = 1; i <= stormBurst; i++) {
        (function (k) {
          setTimeout(function () {
            if (!IF.Player.dead && !IF.Player.won && IF.stateName() === 'play') {
              Hz.dropBoulder(Math.random() < 0.6 ? 0 : 1,
                             U.lerp(lw + 24, rw - 24, Math.random()), 0.1, IF.Player.cx());
            }
          }, k * 240);
        })(i);
      }
      heat += stormBurst * 0.3;
    }
  };

  // A hit means the director backs off: being punished twice for one mistake
  // is not difficulty, it is noise.
  Dir.onPlayerHurt = function () {
    heat += 1.4;
    next = Math.max(next, 2.2);
  };

  Dir.onCairn = function () {
    heat = Math.max(0, heat - 0.8);
    next = Math.max(next, 1.6);
  };

  IF.Director = Dir;
})();
