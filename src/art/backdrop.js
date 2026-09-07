// The range behind the face.
//
// Six ridges at different depths, drawn as geometry rather than as textures.
// That costs a few hundred quads and buys two things a texture cannot: the
// whole range retints to the zone's haze every frame, and it never repeats,
// because there is nothing to tile.
//
// The parallax is vertical only, and it is the right way round: the near, low
// ridges slide out of frame within the first third of the climb, and the far
// range is still there when you top out. Climbing above the mountains you
// started level with is the clearest possible read on altitude.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Bk = {};

  var SEG = 10;                    // ridge sample spacing in pixels
  var N = Math.ceil(C.W / SEG) + 2;

  // depth: 0 farthest. factor is the parallax rate; startY is where the ridge
  // line sits on screen at the bottom of the climb.
  var LAYERS = [
    { factor: 0.035, startY: 214, amp: 54, freq: 0.0042, oct: 4, seed: 21, cap: 6, haze: 0.62, snow: 0.42 },
    { factor: 0.062, startY: 242, amp: 62, freq: 0.0055, oct: 4, seed: 57, cap: 7, haze: 0.52, snow: 0.38 },
    { factor: 0.100, startY: 274, amp: 70, freq: 0.0068, oct: 4, seed: 93, cap: 8, haze: 0.42, snow: 0.34 },
    { factor: 0.155, startY: 310, amp: 78, freq: 0.0079, oct: 5, seed: 141, cap: 9, haze: 0.32, snow: 0.30 },
    { factor: 0.225, startY: 354, amp: 86, freq: 0.0091, oct: 5, seed: 199, cap: 10, haze: 0.22, snow: 0.26 },
    { factor: 0.310, startY: 408, amp: 94, freq: 0.0104, oct: 5, seed: 263, cap: 11, haze: 0.12, snow: 0.22 }
  ];

  var profiles = [];
  var clouds = [];
  var camStart = 0;

  Bk.build = function () {
    profiles.length = 0;
    for (var l = 0; l < LAYERS.length; l++) {
      var L = LAYERS[l];
      var arr = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        var x = i * SEG;
        // Two scales of ridge: a broad range profile with sharper peaks
        // riding on it, so the skyline has both mass and detail.
        var broad = U.fbm1(x * L.freq, L.oct, L.seed);
        var sharp = U.ridge2(x * L.freq * 3.1, L.seed * 0.01, 3, L.seed + 7);
        arr[i] = -(broad * L.amp + sharp * L.amp * 0.42);
      }
      profiles.push(arr);
    }

    // A sea of cloud you climb up through. Placed once, in world space.
    clouds.length = 0;
    var rng = U.rng(4242);
    for (var k = 0; k < 46; k++) {
      clouds.push({
        x: rng() * (C.W + 200) - 100,
        y: C.WORLD_H * (0.42 + rng() * 0.46),
        r: 34 + rng() * 92,
        a: 0.22 + rng() * 0.4,
        f: 0.10 + rng() * 0.22,
        drift: (rng() - 0.5) * 5
      });
    }
    camStart = C.WORLD_H - C.H;
  };

  Bk.upload = function () { /* nothing to upload: the range is geometry */ };

  // haze: the colour distant rock fades into. snowCol: what the tops catch.
  // Both come from the zone blend, so the range changes with the light.
  Bk.draw = function (camY, haze, snowCol, rockCol, alpha, time) {
    var D = IF.Draw;
    var B = IF.Batch;
    D.useAtlas();
    D.blend('normal');

    var bottom = C.H + 8;

    for (var l = 0; l < LAYERS.length; l++) {
      var L = LAYERS[l];
      var prof = profiles[l];
      // Where this ridge sits now. worldY is fixed; screen position is the
      // world position minus the camera scaled by the layer's rate.
      var worldY = L.startY + camStart * L.factor;
      var baseY = worldY - camY * L.factor;
      if (baseY > bottom + 120) continue;         // still below the frame

      // Distant rock is mostly haze; near rock keeps more of its own colour.
      // The extra darkening is what stops a ridge line reading as a ribbon
      // laid over the sky instead of as a mass standing in front of it.
      var body = [
        U.lerp(rockCol[0], haze[0], L.haze) * 0.84,
        U.lerp(rockCol[1], haze[1], L.haze) * 0.86,
        U.lerp(rockCol[2], haze[2], L.haze) * 0.92
      ];
      var cap = [
        U.lerp(body[0], snowCol[0], L.snow),
        U.lerp(body[1], snowCol[1], L.snow),
        U.lerp(body[2], snowCol[2], L.snow)
      ];

      var bodyCol = D.packColor(body, alpha);
      var capCol = D.packColor(cap, alpha);
      var deepCol = D.packColor([body[0] * 0.62, body[1] * 0.66, body[2] * 0.78], alpha);
      var par = B.params(0, 0, 0, 0);
      var f = IF.Atlas.get('white');
      var u = (f.u0 + f.u1) * 0.5, v = (f.v0 + f.v1) * 0.5;

      for (var i = 0; i < N - 1; i++) {
        var x0 = i * SEG, x1 = x0 + SEG;
        var y0 = baseY + prof[i], y1 = baseY + prof[i + 1];
        if (y0 > bottom && y1 > bottom) continue;
        var c0 = y0 + L.cap, c1 = y1 + L.cap;

        // Snow cap along the ridge line.
        B.free(x0, y0, x1, y1, x1, c1, x0, c0, u, v, u, v, capCol, par);
        // The mass below it, in two bands so the flank has some depth.
        var m0 = c0 + 40, m1 = c1 + 40;
        B.free(x0, c0, x1, c1, x1, Math.min(m1, bottom), x0, Math.min(m0, bottom),
               u, v, u, v, bodyCol, par);
        if (m0 < bottom || m1 < bottom) {
          B.free(x0, Math.min(m0, bottom), x1, Math.min(m1, bottom), x1, bottom, x0, bottom,
                 u, v, u, v, deepCol, par);
        }
      }
    }

    // The cloud sea, drawn between the range and the face.
    D.blend('normal');
    for (var k = 0; k < clouds.length; k++) {
      var cl = clouds[k];
      var sy = cl.y - camY * (1 - cl.f);
      if (sy < -160 || sy > C.H + 160) continue;
      var sx = cl.x + Math.sin(time * 0.05 + k) * cl.drift;
      var fade = U.smoothstep(-160, -40, sy) * U.smoothstep(C.H + 160, C.H + 20, sy);
      D.glow(sx, sy, cl.r, [
        U.lerp(haze[0], 1, 0.35), U.lerp(haze[1], 1, 0.35), U.lerp(haze[2], 1, 0.42)
      ], cl.a * fade * alpha);
    }
  };

  // The title screen wants the same range but held still and pushed down a
  // little, so the logo has air above it.
  Bk.drawStill = function (offset, haze, snowCol, rockCol, alpha, time) {
    Bk.draw(camStart - offset, haze, snowCol, rockCol, alpha, time);
  };

  Bk.camStart = function () { return camStart; };

  IF.Backdrop = Bk;
})();
