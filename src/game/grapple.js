// The ice axe.
//
// Throw it, it bites the first stone it meets, and you are on a rope. Hold
// the button and it hauls you up; let go of the direction and you swing.
// It costs grip, so it is a tool with a budget rather than a second pair of
// legs, and the route never requires it - it only ever makes a line faster,
// or reaches a crystal a jump cannot.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Gr = {};

  var P, Cam, D, In, Aud, Pt, Chunks;

  var phase = 'idle';        // idle | fly | set
  var ax = 0, ay = 0;        // the axe
  var vx = 0, vy = 0;
  var ropeLen = 0;
  var flightT = 0;
  var cool = 0;
  var throwT = 0;
  var reelingNow = false;
  var stickT = 0;
  var aimX = 0, aimY = -1;
  var lastValid = 0;

  Gr.reset = function () {
    P = IF.Player; Cam = IF.Camera; D = IF.Draw; In = IF.Input;
    Aud = IF.Audio; Pt = IF.Particles; Chunks = IF.Chunks;
    phase = 'idle'; cool = 0; throwT = 0; stickT = 0;
    reelingNow = false;
  };

  Gr.attached = function () { return phase === 'set'; };
  Gr.flying = function () { return phase === 'fly'; };
  Gr.reeling = function () { return phase === 'set' && reelingNow; };
  Gr.throwing = function () { return throwT > 0; };
  Gr.anchor = function () { return { x: ax, y: ay }; };
  Gr.ropeLength = function () { return ropeLen; };

  // Where the rope leaves the body.
  function hand() {
    return { x: P.cx() + P.facing * 3, y: P.y + 7 };
  }
  Gr.hand = hand;

  // Aim: the mouse if there is one, the stick if there is one, otherwise the
  // direction you are holding, otherwise up and slightly forward.
  function aim() {
    var h = hand();
    if (In.device() === 'pointer' && In.mouse.inside) {
      var dx = In.mouse.x - Cam.sx(h.x);
      var dy = In.mouse.y - Cam.sy(h.y);
      var l = Math.sqrt(dx * dx + dy * dy);
      if (l > 4) return { x: dx / l, y: dy / l };
    }
    if (In.hasAim) {
      var l2 = Math.sqrt(In.aimX * In.aimX + In.aimY * In.aimY);
      if (l2 > 0.3) return { x: In.aimX / l2, y: In.aimY / l2 };
    }
    var kx = In.axisX(), ky = In.axisY();
    if (kx || ky) {
      // A pure sideways hold still throws upward: nobody wants a level throw.
      if (!ky) ky = -0.62;
      var l3 = Math.sqrt(kx * kx + ky * ky);
      return { x: kx / l3, y: ky / l3 };
    }
    var d = Math.sqrt(P.facing * P.facing * 0.36 + 1);
    return { x: P.facing * 0.6 / d, y: -1 / d };
  }
  Gr.aimDir = aim;

  Gr.update = function (dt, allowInput) {
    cool = Math.max(0, cool - dt);
    throwT = Math.max(0, throwT - dt);

    var wantAxe = allowInput && (In.down('axe') || (In.mouse.down && In.device() === 'pointer'));
    var pressAxe = allowInput && (In.pressed('axe') ||
                   (In.mouse.pressed && In.device() === 'pointer' && In.mouse.inside));

    if (P.dead || P.won) { if (phase !== 'idle') Gr.release(false); return; }

    if (phase === 'idle') {
      if (pressAxe && cool <= 0 && P.grip >= C.AXE_GRIP) {
        var a = aim();
        var h = hand();
        aimX = a.x; aimY = a.y;
        ax = h.x; ay = h.y;
        vx = a.x * C.AXE_SPEED; vy = a.y * C.AXE_SPEED;
        phase = 'fly';
        flightT = 0;
        throwT = 0.22;
        P.grip -= C.AXE_GRIP;
        P.facing = a.x >= 0 ? 1 : -1;
        Aud.playVar('sfx_axe', 1, 0.12);
      }
      return;
    }

    if (phase === 'fly') {
      flightT += dt;
      var steps = 4;
      for (var s = 0; s < steps; s++) {
        var nx = ax + vx * dt / steps;
        var ny = ay + vy * dt / steps;
        if (Chunks.solid(nx, ny) || (IF.WorldProps.boxSolid && IF.WorldProps.boxSolid(nx - 1, ny - 1, 2, 2))) {
          bite(ax, ay);
          return;
        }
        ax = nx; ay = ny;
        if (ax < 1 || ax > C.W - 1) { miss(); return; }
      }
      Pt.trail(ax, ay, [0.85, 0.93, 1], 0.5, 0.14);
      var h2 = hand();
      if (U.dist(ax, ay, h2.x, h2.y) > C.AXE_RANGE || flightT > 0.7) miss();
      return;
    }

    // --- on the rope ------------------------------------------------------
    stickT += dt;
    if (!wantAxe || stickT > C.AXE_STICK_TIME || P.grip <= 0) {
      Gr.release(true);
      return;
    }

    var hx = P.cx(), hy = P.cy();
    var dx = hx - ax, dy = hy - ay;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;

    // Reeling in: pressing toward the axe shortens the rope.
    var up = In.axisY() < 0 || In.down('jump');
    reelingNow = up;
    if (up) {
      ropeLen = Math.max(C.AXE_MIN_ROPE, ropeLen - C.AXE_REEL * dt);
      P.grip = Math.max(0, P.grip - 0.16 * dt);
      if (Math.random() < dt * 8) Aud.playVar('sfx_reel', 0.5, 0.2);
      if (Math.random() < dt * 14) Pt.trail(P.cx(), P.cy(), [0.8, 0.9, 1], 0.5, 0.2);
    } else if (In.axisY() > 0) {
      ropeLen = Math.min(C.AXE_RANGE, ropeLen + C.AXE_REEL * 0.8 * dt);
    }

    // Steering while swinging: a tangential push, so you can pump the arc.
    var kx = In.axisX();
    if (kx) {
      var tx = -dy / d, ty = dx / d;
      var push = kx * 380 * dt;
      P.vx += tx * push * U.sign(tx * kx > 0 ? 1 : 1);
      P.vy += ty * push * U.sign(tx * kx > 0 ? 1 : 1);
      P.facing = kx;
    }

    // The constraint. Only pull, never push: a rope is not a stick.
    if (d > ropeLen) {
      var nx2 = dx / d, ny2 = dy / d;
      var corr = d - ropeLen;
      P.x -= nx2 * corr;
      P.y -= ny2 * corr;
      var radial = P.vx * nx2 + P.vy * ny2;
      if (radial > 0) {
        P.vx -= nx2 * radial;
        P.vy -= ny2 * radial;
      }
      P.vx *= C.AXE_SWING_DAMP;
      P.vy *= C.AXE_SWING_DAMP;
      // If the correction pushed us into stone, give the rope back instead.
      if (P.solidAt(P.x, P.y)) {
        P.x += nx2 * corr;
        P.y += ny2 * corr;
        ropeLen = d;
      }
    }
  };

  function bite(x, y) {
    ax = x; ay = y;
    phase = 'set';
    stickT = 0;
    var h = hand();
    ropeLen = Math.max(C.AXE_MIN_ROPE, U.dist(ax, ay, P.cx(), P.cy()));
    Aud.playVar('sfx_axe_hit', 1, 0.1);
    Cam.shake(0.06);
    Pt.iceChips(ax, ay, 6, 110, 3);
    Pt.sparks(ax, ay, 8, 130, [1, 0.98, 0.85], [0.55, 0.8, 1]);
    IF.Hazards.shock(ax, ay, 0.12);
  }

  function miss() {
    phase = 'idle';
    cool = C.AXE_COOLDOWN;
    reelingNow = false;
    Pt.powder(ax, ay, 3, 30, 0.3);
  }

  Gr.release = function (withMomentum) {
    if (phase === 'idle') return;
    phase = 'idle';
    cool = C.AXE_COOLDOWN;
    reelingNow = false;
    if (withMomentum) {
      // A released swing keeps its speed, capped so it cannot become a
      // slingshot that trivialises the route.
      var sp = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
      if (sp > 420) { P.vx *= 420 / sp; P.vy *= 420 / sp; }
      Pt.powder(ax, ay, 4, 40, 0.5);
    }
  };

  Gr.addLights = function (Lights) {
    if (phase === 'set') {
      Lights.addHex(Cam.sx(ax), Cam.sy(ay), 34, '#bfe6ff', 0.55, 10);
    }
  };

  Gr.draw = function () {
    if (phase === 'idle') return;
    D.useAtlas();
    D.blend('normal');
    var h = hand();
    var hx = Cam.sx(h.x), hy = Cam.sy(h.y);
    var axs = Cam.sx(ax), ays = Cam.sy(ay);

    // The rope, drawn as a chain of short segments with a little sag when it
    // is slack and none at all when it is loaded.
    var d = U.dist(h.x, h.y, ax, ay);
    var slack = phase === 'set' ? U.clamp01((ropeLen - d) / 40) : 0;
    var segs = 10;
    var px = hx, py = hy;
    for (var i = 1; i <= segs; i++) {
      var t = i / segs;
      var x = U.lerp(hx, axs, t);
      var y = U.lerp(hy, ays, t) + Math.sin(t * Math.PI) * slack * 22;
      D.line(px, py, x, y, 1.4, '#e0c98a', 0.95);
      px = x; py = y;
    }

    var rot = Math.atan2(ays - hy, axs - hx);
    D.sprite('axe', axs, ays, {
      rot: phase === 'fly' ? rot + IF.time * 22 : rot,
      lit: 1, normal: 0.6
    });

    if (phase === 'set') {
      D.blend('add');
      D.glow(axs, ays, 12, '#cfeaff', 0.35, true);
      D.blend('normal');
    }
  };

  // A faint dotted line showing where the axe would go. Only while aiming
  // with a pointer, so it never clutters a keyboard run.
  Gr.drawAim = function () {
    if (phase !== 'idle' || P.dead || P.won) return;
    if (In.device() !== 'pointer' || !In.mouse.inside) return;
    var a = aim();
    var h = hand();
    var hx = Cam.sx(h.x), hy = Cam.sy(h.y);
    var r = Chunks.raycast(h.x, h.y, a.x, a.y, C.AXE_RANGE, 4);
    D.useAtlas();
    D.blend('add');
    var reach = Math.min(r.dist, C.AXE_RANGE);
    for (var i = 14; i < reach; i += 11) {
      var t = i / C.AXE_RANGE;
      D.sprite('spark', hx + a.x * i, hy + a.y * i, {
        scale: 0.42, color: r.hit ? '#9fe4ff' : '#7b8ea3',
        alpha: (1 - t) * (r.hit ? 0.5 : 0.22), lit: 0
      });
    }
    if (r.hit) {
      D.ring(Cam.sx(r.x), Cam.sy(r.y), 7 + Math.sin(IF.time * 8) * 1.2, 2, '#9fe4ff', 0.5);
    }
    D.blend('normal');
  };

  IF.Grapple = Gr;
})();
