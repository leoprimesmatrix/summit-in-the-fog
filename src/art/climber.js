// The climber.
//
// Not a sheet of hand-drawn frames but a rig: limbs are segments with angles,
// and every animation is a function from phase to a set of angles. That buys
// smooth, consistent motion from very little code, and it means a new pose
// costs four lines rather than a new drawing.
//
// Everything is drawn facing right. Left is the same sprite flipped.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var P = IF.Paint;
  var A = IF.Atlas;

  var W = 28, H = 34;
  var OX = 14, OY = 31;        // origin: between the feet, on the ground

  // Skeleton rest positions, in canvas pixels.
  var HIP_Y = 19, SHO_Y = 12, HEAD_Y = 7;
  var THIGH = 6, SHIN = 6, UPPER = 5, FORE = 5;

  var COL = {
    parka: '#e2472f', parkaLo: '#a02a1b', parkaHi: '#ff7358',
    fur: '#efe3cd', furLo: '#c3b295',
    leg: '#2f3a52', legLo: '#1c2233',
    boot: '#171c2a',
    skin: '#f4cba4', skinLo: '#c99a76',
    pack: '#3f7a55', packLo: '#28563a',
    strap: '#2a2f3d',
    goggle: '#131a26', lens: '#79e9dd', lensHi: '#d5fffa',
    metal: '#c9d6e4', metalLo: '#7d8ea1',
    haft: '#7a5232',
    ink: '#12151f',
    rope: '#dcc07f'
  };

  // ang = 0 points straight down; positive swings the limb forward (+x).
  function seg(x, y, ang, len) {
    return [x + Math.sin(ang) * len, y + Math.cos(ang) * len];
  }

  // --- one frame -----------------------------------------------------------
  //
  // pose fields, all optional:
  //   lean      torso tilt, radians
  //   rise      whole-body vertical offset (negative is up)
  //   squash    >1 squat, <1 stretch
  //   hipF/hipB thigh angles, front and back leg
  //   kneeF/kneeB  extra knee bend
  //   shoF/shoB    upper-arm angles
  //   elbF/elbB    extra elbow bend
  //   headT     head tilt
  //   axe       'hold' | 'up' | 'out' | 'plant' | null
  //   rope      draw the rope stub leaving the hand
  //   scarf     scarf flutter phase

  function drawClimber(c, pose) {
    var lean = pose.lean || 0;
    var rise = pose.rise || 0;
    var squash = pose.squash === undefined ? 1 : pose.squash;

    // The whole skeleton compresses toward the ground when squashed.
    function sy(y) { return OY + (y - OY) * squash + rise; }

    var hipX = OX + Math.sin(lean) * 2;
    var hipY = sy(HIP_Y);
    var shoX = OX + Math.sin(lean) * 5.5;
    var shoY = sy(SHO_Y);
    var headX = OX + Math.sin(lean) * 7 + (pose.headX || 0);
    var headY = sy(HEAD_Y) + (pose.headY || 0);

    var scale = squash;

    // ---- back leg, back arm, pack first: they sit behind the torso -------

    var hipB = pose.hipB || 0, kneeB = pose.kneeB || 0;
    var kB = seg(hipX - 1, hipY, hipB, THIGH * scale);
    var fB = seg(kB[0], kB[1], hipB + kneeB, SHIN * scale);
    P.limb(c, hipX - 1, hipY, kB[0], kB[1], 4, COL.legLo);
    P.limb(c, kB[0], kB[1], fB[0], fB[1], 3, COL.legLo);
    P.rect(c, fB[0] - 2, fB[1] - 1, 5, 3, COL.boot);

    var shoB = pose.shoB || 0, elbB = pose.elbB || 0;
    var eB = seg(shoX - 1, shoY, shoB, UPPER * scale);
    var hB = seg(eB[0], eB[1], shoB + elbB, FORE * scale);
    P.limb(c, shoX - 1, shoY, eB[0], eB[1], 3, COL.parkaLo);
    P.limb(c, eB[0], eB[1], hB[0], hB[1], 3, COL.parkaLo);
    P.circle(c, hB[0], hB[1], 1.6, COL.legLo);

    // ---- pack ------------------------------------------------------------

    var packX = shoX - 6.5, packY = shoY + 0.5;
    P.soft(c, packX, packY, 6, 9 * scale, COL.pack);
    P.rect(c, packX + 1, packY + 2, 4, 1, COL.packLo);
    P.rect(c, packX + 1, packY + 5, 4, 1, COL.packLo);
    // A coil of rope lashed to the top of it.
    P.rect(c, packX + 1, packY - 1, 5, 2, COL.rope);
    P.rect(c, packX + 2, packY - 1, 1, 2, P.shade(COL.rope, -0.3));
    P.rect(c, packX + 4, packY - 1, 1, 2, P.shade(COL.rope, -0.3));

    // ---- torso -----------------------------------------------------------

    P.poly(c, [
      hipX - 4, hipY + 1,
      hipX + 4, hipY + 1,
      shoX + 4.5, shoY - 1,
      shoX - 4.5, shoY - 1
    ], COL.parka);
    // Chest zip and a hem shadow give the flat parka two planes.
    P.rect(c, shoX + 0.5, shoY, 1, hipY - shoY + 1, COL.parkaLo);
    P.rect(c, hipX - 4, hipY, 8, 2, COL.parkaLo);
    P.rect(c, shoX - 4, shoY - 1, 8, 1, COL.parkaHi);
    // Shoulder straps.
    P.limb(c, shoX - 3, shoY, hipX - 2.5, hipY - 1, 2, COL.strap);
    P.limb(c, shoX + 1, shoY, hipX + 1.5, hipY - 1, 2, COL.strap);

    // ---- front leg -------------------------------------------------------

    var hipF = pose.hipF || 0, kneeF = pose.kneeF || 0;
    var kF = seg(hipX + 1, hipY, hipF, THIGH * scale);
    var fF = seg(kF[0], kF[1], hipF + kneeF, SHIN * scale);
    P.limb(c, hipX + 1, hipY, kF[0], kF[1], 4, COL.leg);
    P.limb(c, kF[0], kF[1], fF[0], fF[1], 3, COL.leg);
    P.rect(c, fF[0] - 2, fF[1] - 1, 6, 3, COL.boot);
    // Crampon teeth: four pixels, and the whole silhouette says mountaineer.
    P.rect(c, fF[0] - 2, fF[1] + 2, 1, 1, COL.metalLo);
    P.rect(c, fF[0], fF[1] + 2, 1, 1, COL.metalLo);
    P.rect(c, fF[0] + 2, fF[1] + 2, 1, 1, COL.metalLo);

    // ---- head and hood ---------------------------------------------------

    var ht = pose.headT || 0;
    var hx = headX + ht * 2, hy = headY;
    // Hood shell behind, fur ring in front of it.
    P.ellipse(c, hx - 0.5, hy, 4.6, 4.6, COL.parkaLo);
    P.ellipse(c, hx + 0.5, hy, 3.6, 3.8, COL.skin);
    // Fur trim: a broken ring, drawn as pixels so it reads as fur not felt.
    var fr = 4.4;
    for (var a = -1.5; a <= 1.7; a += 0.22) {
      var fx = hx + 0.4 + Math.sin(a + 1.5) * fr;
      var fy = hy - Math.cos(a + 1.5) * fr;
      P.px(c, fx, fy, (a * 7 | 0) % 2 ? COL.fur : COL.furLo);
      P.px(c, fx - 0.6, fy, COL.fur);
    }
    // Goggles.
    P.rect(c, hx - 1, hy - 1.5, 5, 3, COL.goggle);
    P.rect(c, hx + 0.5, hy - 1, 3, 2, COL.lens);
    P.rect(c, hx + 2.5, hy - 1, 1, 1, COL.lensHi);
    // Beard of frost under the chin.
    P.rect(c, hx, hy + 2.5, 3, 1, COL.fur);

    // ---- scarf -----------------------------------------------------------

    if (pose.scarf !== undefined) {
      var s = pose.scarf;
      var sx = shoX - 3, syy = shoY + 1;
      for (var i = 0; i < 7; i++) {
        var t = i / 6;
        var wob = Math.sin(s + i * 0.8) * (1.2 + t * 3.4);
        P.px(c, sx - i * 1.5, syy + wob * 0.55 - t * 1.5, i < 4 ? COL.parkaHi : COL.parka);
        if (i < 4) P.px(c, sx - i * 1.5, syy + wob * 0.55 - t * 1.5 + 1, COL.parka);
      }
    }

    // ---- front arm and axe ----------------------------------------------

    var shoF = pose.shoF || 0, elbF = pose.elbF || 0;
    var eF = seg(shoX + 1, shoY, shoF, UPPER * scale);
    var hF = seg(eF[0], eF[1], shoF + elbF, FORE * scale);
    P.limb(c, shoX + 1, shoY, eF[0], eF[1], 3, COL.parka);
    P.limb(c, eF[0], eF[1], hF[0], hF[1], 3, COL.parka);
    P.circle(c, hF[0], hF[1], 1.7, COL.leg);

    if (pose.axe) {
      var ang = pose.axeAng === undefined ? shoF + elbF + 0.4 : pose.axeAng;
      var tip = seg(hF[0], hF[1], ang, 7);
      var butt = seg(hF[0], hF[1], ang + Math.PI, 2.5);
      P.limb(c, butt[0], butt[1], tip[0], tip[1], 2, COL.haft);
      // Head of the axe: pick one way, adze the other.
      var px1 = tip[0] + Math.cos(ang) * 3.2, py1 = tip[1] - Math.sin(ang) * 3.2;
      var px2 = tip[0] - Math.cos(ang) * 2.0, py2 = tip[1] + Math.sin(ang) * 2.0;
      P.limb(c, px2, py2, px1, py1, 2, COL.metal);
      P.px(c, px1, py1, COL.lensHi);
    }

    if (pose.ropeTo) {
      var rt = pose.ropeTo;
      P.limb(c, hF[0], hF[1], rt[0], rt[1], 1, COL.rope);
    }

    P.outline(c, COL.ink, false);
  }

  // --- animation tables ----------------------------------------------------

  // A run cycle built from one phase: thighs counter-swing, the knee folds on
  // the recovery half, the arms mirror the legs and the body bobs at twice
  // the leg frequency.
  function runPose(p) {
    var ph = p * U.TAU;
    var swing = Math.sin(ph) * 0.85;
    var bendF = Math.max(0, -Math.cos(ph)) * 1.25;
    var bendB = Math.max(0, Math.cos(ph)) * 1.25;
    return {
      lean: 0.20 + Math.sin(ph * 2) * 0.02,
      rise: -Math.abs(Math.sin(ph)) * 1.4,
      hipF: swing, kneeF: -bendF,
      hipB: -swing, kneeB: -bendB,
      shoF: -swing * 0.75 + 0.1, elbF: -0.7 - Math.max(0, swing) * 0.4,
      shoB: swing * 0.75 - 0.1, elbB: -0.6,
      headT: 0.05,
      scarf: ph * 1.6,
      axe: true, axeAng: 1.5
    };
  }

  function idlePose(p) {
    var b = Math.sin(p * U.TAU);
    return {
      lean: 0.05,
      rise: b * 0.4,
      squash: 1 - b * 0.012,
      hipF: 0.10, kneeF: -0.12,
      hipB: -0.14, kneeB: -0.10,
      shoF: 0.10 + b * 0.05, elbF: -0.45,
      shoB: -0.12, elbB: -0.35,
      headT: b * 0.05,
      scarf: p * U.TAU * 0.8,
      axe: true, axeAng: 1.35
    };
  }

  var ANIM = {
    idle: { count: 6, fn: idlePose },
    run: { count: 8, fn: runPose },

    rise: {
      count: 2, fn: function (p) {
        return {
          lean: 0.16, rise: -1 - p, squash: 1.05,
          hipF: 0.75, kneeF: -1.0, hipB: -0.5, kneeB: -0.5,
          shoF: -1.5, elbF: -0.5, shoB: 0.9, elbB: -0.6,
          headT: 0.08, scarf: 2 + p * 3, axe: true, axeAng: -0.6
        };
      }
    },

    apex: {
      count: 2, fn: function (p) {
        return {
          lean: 0.10, rise: -1, squash: 1.0,
          hipF: 0.45, kneeF: -0.7, hipB: -0.35, kneeB: -0.75,
          shoF: -0.9, elbF: -0.7, shoB: 0.5, elbB: -0.7,
          headT: 0.02, scarf: 3 + p * 2, axe: true, axeAng: 0.1
        };
      }
    },

    fall: {
      count: 3, fn: function (p) {
        var f = Math.sin(p * U.TAU);
        return {
          lean: -0.06, rise: 0, squash: 0.97,
          hipF: -0.30 + f * 0.1, kneeF: -0.30, hipB: 0.42, kneeB: -0.55,
          shoF: 1.5 + f * 0.15, elbF: -0.35, shoB: 1.2, elbB: -0.4,
          headT: -0.06, scarf: 4 + p * 4, axe: true, axeAng: 1.9
        };
      }
    },

    land: {
      count: 2, fn: function (p) {
        return {
          lean: 0.30 - p * 0.12, rise: 0, squash: 1.22 - p * 0.14,
          hipF: 0.55, kneeF: -1.15, hipB: -0.45, kneeB: -1.05,
          shoF: -0.55, elbF: -0.9, shoB: 0.85, elbB: -0.9,
          headT: 0.14, scarf: 1.5, axe: true, axeAng: 0.9
        };
      }
    },

    // Facing the wall on the right, one arm hooked, boots edging.
    wall: {
      count: 3, fn: function (p) {
        var b = Math.sin(p * U.TAU) * 0.06;
        return {
          lean: 0.34 + b, rise: 0, squash: 1,
          hipF: 0.28, kneeF: -0.62, hipB: -0.10, kneeB: -0.30,
          shoF: -1.35, elbF: -0.28, shoB: 0.62, elbB: -0.85,
          headT: 0.16, headX: 0.5, scarf: 2 + p * 3,
          axe: true, axeAng: -0.9
        };
      }
    },

    // Hanging off a lip by both hands.
    hang: {
      count: 3, fn: function (p) {
        var b = Math.sin(p * U.TAU) * 0.10;
        return {
          lean: 0.10, rise: 1.5 + b, squash: 1,
          hipF: 0.16, kneeF: -0.55, hipB: -0.16, kneeB: -0.62,
          shoF: -2.55, elbF: 0.18, shoB: -2.45, elbB: 0.22,
          headT: 0.10, scarf: 1 + p * 2, axe: false
        };
      }
    },

    dash: {
      count: 2, fn: function (p) {
        return {
          lean: 0.62, rise: -1, squash: 0.92,
          hipF: 0.95, kneeF: -0.55, hipB: -0.95, kneeB: -0.30,
          shoF: -1.95, elbF: -0.15, shoB: 1.35, elbB: -0.25,
          headT: 0.20, scarf: 5 + p * 4, axe: true, axeAng: -1.5
        };
      }
    },

    // Reeling in on the rope: body long, one arm locked overhead.
    reel: {
      count: 3, fn: function (p) {
        var b = Math.sin(p * U.TAU) * 0.12;
        return {
          lean: 0.14, rise: -1, squash: 1.02,
          hipF: -0.20 + b, kneeF: -0.45, hipB: 0.26, kneeB: -0.68,
          shoF: -2.75, elbF: 0.10, shoB: 1.05 + b, elbB: -0.55,
          headT: -0.05, scarf: 3 + p * 5, axe: false
        };
      }
    },

    throwing: {
      count: 3, fn: function (p) {
        return {
          lean: 0.10 - p * 0.16, rise: -0.5, squash: 1,
          hipF: 0.18, kneeF: -0.35, hipB: -0.22, kneeB: -0.40,
          shoF: -0.6 - p * 2.2, elbF: -1.1 + p * 1.2, shoB: 0.5, elbB: -0.5,
          headT: -0.05 - p * 0.06, scarf: 2 + p * 3,
          axe: true, axeAng: -0.4 - p * 1.6
        };
      }
    },

    hurt: {
      count: 2, fn: function (p) {
        return {
          lean: -0.42 - p * 0.1, rise: -1, squash: 0.95,
          hipF: -0.55, kneeF: -0.45, hipB: 0.62, kneeB: -0.30,
          shoF: 1.9, elbF: -0.9, shoB: 1.6, elbB: -0.95,
          headT: -0.22, scarf: 6 + p * 5, axe: false
        };
      }
    },

    cheer: {
      count: 6, fn: function (p) {
        var b = Math.sin(p * U.TAU);
        return {
          lean: -0.05, rise: -1 - Math.max(0, b) * 3, squash: 1 + Math.min(0, b) * 0.10,
          hipF: 0.20 + Math.max(0, b) * 0.3, kneeF: -0.25 - Math.max(0, b) * 0.5,
          hipB: -0.24 - Math.max(0, b) * 0.3, kneeB: -0.25 - Math.max(0, b) * 0.5,
          shoF: -2.6, elbF: 0.1, shoB: 2.5, elbB: -0.1,
          headT: 0.0, headY: -0.5, scarf: p * U.TAU * 2,
          axe: true, axeAng: -1.9
        };
      }
    }
  };

  var Climber = {};

  Climber.W = W; Climber.H = H; Climber.OX = OX; Climber.OY = OY;
  Climber.COL = COL;

  Climber.build = function () {
    var opts = { bevel: 3.2, detail: 0.42, strength: 2.7, gloss: 0.30, soften: 1, ox: OX, oy: OY };
    for (var name in ANIM) {
      if (!ANIM.hasOwnProperty(name)) continue;
      (function (n, spec) {
        A.paintSeq('c_' + n, spec.count, W, H, function (c, i, t) {
          drawClimber(c, spec.fn(spec.count > 1 ? i / spec.count : 0));
        }, opts);
      })(name, ANIM[name]);
    }

    // The thrown axe, on its own, pointing right.
    A.paint('axe', 12, 8, function (c) {
      P.limb(c, 1, 5, 8, 3, 2, COL.haft);
      P.limb(c, 7, 1, 10, 5, 2, COL.metal);
      P.limb(c, 6, 5, 9, 6, 2, COL.metalLo);
      P.px(c, 10, 5, COL.lensHi);
      P.outline(c, COL.ink, false);
    }, { bevel: 2, detail: 0.5, strength: 2.4, gloss: 0.75, ox: 4, oy: 4 });
  };

  Climber.draw = drawClimber;
  IF.ClimberArt = Climber;
})();
