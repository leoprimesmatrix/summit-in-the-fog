(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;
  var M = SITF.Mountain;
  var Part = SITF.Particles;
  var Aud = SITF.Audio;
  var COL = C.COLORS;

  // What you carry up the mountain. Information is never free: each tool
  // answers a different shape of question, and every one of them costs.
  //
  //   lantern  all lanes, one row      stand still, and the storm gains
  //   axe      one lane, four rows     0.4s you cannot hop, then it is spent
  //   flare    all lanes, ten rows     three per climb
  //   gust     everything, briefly     free, but on the weather's clock
  //
  // The axe reads vertically and the lantern horizontally, so they answer
  // different questions and neither replaces the other.

  var T = {};

  // An axe in flight, then stuck in the rock lighting its lane.
  var axe = null;      // {row, lane, t, phase:'fly'|'stuck', hit, fromX, fromY}
  var flare = null;    // {row, t, x, y}
  var cool = 0;

  T.flares = 0;

  T.reset = function () {
    axe = null;
    flare = null;
    cool = 0;
    T.flares = C.FLARE_COUNT;
  };

  T.axeReady = function () { return !axe && cool <= 0; };
  T.busy = function () { return !!axe && axe.phase === 'fly'; };
  T.axeState = function () { return axe; };
  T.flareState = function () { return flare; };

  // dir is -1, 0 or +1: the lane the axe is thrown up, mirroring the hop keys.
  T.throwAxe = function (dir, fromRow, fromLane, fromX, fromY) {
    if (!T.axeReady()) return false;
    var lane = U.clamp(fromLane + dir, 0, C.LANE_X.length - 1);
    axe = {
      row: fromRow, lane: lane, t: 0, phase: 'fly', hit: -1,
      fromX: fromX, fromY: fromY, dir: dir
    };
    Aud.play('sfx_axe_throw', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
    return true;
  };

  T.useFlare = function (fromRow, fromX, fromY) {
    if (T.flares <= 0 || flare) return false;
    T.flares--;
    flare = { row: fromRow, t: 0, x: fromX, y: fromY };
    Aud.play('sfx_flare', { volume: 0.55 });
    return true;
  };

  // Highest row in `lane` at or below row+AXE_ROWS that actually holds rock.
  function firstSolid(fromRow, lane) {
    for (var i = 1; i <= C.AXE_ROWS; i++) {
      var row = M.row(fromRow + i);
      if (!row) break;
      for (var j = 0; j < row.footholds.length; j++) {
        var f = row.footholds[j];
        if (f.state === 'gone') continue;
        var fl = (f.type === 'start') ? lane : f.lane;
        if (fl === lane) return fromRow + i;
      }
    }
    return -1;
  }

  // toScreenY lets the tools throw particles at the right place on screen.
  T.update = function (dt, toScreenY) {
    if (cool > 0) cool -= dt;

    if (axe) {
      axe.t += dt;
      if (axe.phase === 'fly') {
        if (axe.t >= C.AXE_TIME) {
          axe.phase = 'stuck';
          axe.t = 0;
          axe.hit = firstSolid(axe.row, axe.lane);
          var lx = M.laneX(axe.lane);
          if (axe.hit >= 0) {
            var hy = toScreenY(M.rowY(axe.hit));
            Aud.play('sfx_axe_spark', { volume: 0.5 });
            for (var s = 0; s < 12; s++) {
              Part.spawn('spark', lx - 6 + Math.random() * 12, hy + 1, {
                vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 60,
                life: 0.35 + Math.random() * 0.35, w: 1, h: 1,
                color: Math.random() < 0.5 ? '#fff3c4' : COL.lantern, alpha: 1, layer: 'screen'
              });
            }
          } else {
            // Nothing up there: the axe swings through and comes back.
            var my = toScreenY(M.rowY(axe.row + 1));
            Aud.play('sfx_axe_thud', { volume: 0.4 });
            for (var p = 0; p < 5; p++) {
              Part.spawn('puff', lx - 4 + Math.random() * 8, my, {
                vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 10,
                life: 0.5, w: 1, h: 1, grow: 2, color: COL.fogDark, alpha: 0.5, layer: 'screen'
              });
            }
          }
        }
      } else if (axe.t >= C.AXE_HOLD + C.AXE_FADE) {
        axe = null;
        cool = C.AXE_COOLDOWN;
      }
    }

    if (flare) {
      flare.t += dt;
      if (flare.t < C.FLARE_RISE) {
        // Still climbing: a smoke trail behind it.
        if (Math.random() < dt * 40) {
          Part.spawn('smoke', flare.x + (Math.random() - 0.5) * 3,
                     toScreenY(flare.y) - 40 * (flare.t / C.FLARE_RISE), {
            vx: (Math.random() - 0.5) * 10, vy: -6, life: 1.0, w: 2, h: 2, grow: 3,
            color: '#c8b8a8', alpha: 0.35, layer: 'screen'
          });
        }
      } else if (Math.random() < dt * 26) {
        Part.spawn('ember', flare.x - 3 + Math.random() * 6,
                   toScreenY(flare.y) - 46 - Math.random() * 6, {
          vx: (Math.random() - 0.5) * 26, vy: -14 - Math.random() * 24,
          life: 0.7 + Math.random() * 0.6, w: 1, h: 1,
          color: Math.random() < 0.5 ? '#ff9d4a' : '#ffd27a', alpha: 1, layer: 'screen'
        });
      }
      if (flare.t >= C.FLARE_BURN + C.FLARE_FADE) flare = null;
    }
  };

  function fade(t, hold, over) {
    if (t <= hold) return 1;
    var k = (t - hold) / over;
    return k >= 1 ? 0 : 1 - k;
  }

  // How much of a foothold a tool is currently showing. Row and lane, not
  // pixels: the tools think in the same terms as the route.
  T.reveal = function (r, lane) {
    var a = 0;

    if (axe && axe.phase === 'stuck' && lane === axe.lane) {
      // The axe lights its own lane as far as the rock it found; beyond a
      // strike there is nothing to see, so it stops there.
      var top = (axe.hit >= 0) ? axe.hit : axe.row + C.AXE_ROWS;
      if (r > axe.row && r <= top) {
        a = Math.max(a, fade(axe.t, C.AXE_HOLD, C.AXE_FADE));
      }
    }

    if (flare && flare.t >= C.FLARE_RISE) {
      var d = r - flare.row;
      if (d >= 1 && d <= C.FLARE_ROWS) {
        // Brightest near the flare, thinning toward the top of its throw.
        var falloff = 1 - 0.55 * ((d - 1) / C.FLARE_ROWS);
        a = Math.max(a, fade(flare.t - C.FLARE_RISE, C.FLARE_BURN, C.FLARE_FADE) * falloff);
      }
    }

    return a;
  };

  // Warm light in the fog around a burning flare, in screen space.
  T.flareLight = function (toScreenY) {
    if (!flare || flare.t < C.FLARE_RISE * 0.4) return null;
    var k = fade(Math.max(0, flare.t - C.FLARE_RISE), C.FLARE_BURN, C.FLARE_FADE);
    var rise = U.clamp(flare.t / C.FLARE_RISE, 0, 1);
    return {
      x: flare.x,
      y: toScreenY(flare.y) - 46 * U.easeOutQuad(rise),
      alpha: k * (0.85 + 0.15 * Math.sin(SITF.time * 21)),
      radius: 70 + 30 * Math.sin(SITF.time * 9)
    };
  };

  SITF.Tools = T;
})();
