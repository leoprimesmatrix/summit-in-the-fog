// The far wall of the gully.
//
// Without it the route is a set of slabs floating in sky, and nothing on
// screen says they belong to a mountain. With it, every ledge sits in front
// of stone, casts a shadow onto it, and the corridor reads as a place you are
// inside rather than a diagram you are looking at.
//
// It is one tall texture, baked once, that wraps vertically and scrolls at a
// fraction of the camera's speed. The wall stays lit by the same lamps as
// everything else - the lantern picks it out as you pass - and it fogs toward
// the zone's air the higher up the frame it is, so the sky still owns the top
// of the picture.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Bw = {};

  var W = C.W, H = 512;
  var PARALLAX = 0.52;
  var albedoCanvas = null, normalCanvas = null;
  var albTex = null, nrmTex = null;

  // The wall's own colour, deepest hollow to catching face. Bluer and darker
  // than the near rock: it is further away, and there is air in between.
  var RAMP = ['#05080d', '#0c121b', '#172230', '#243348', '#354a64', '#4b6482', '#6a86a6'];

  Bw.build = function () {
    var Rock = IF.Rock, NG = IF.NormalGen;
    var mat = Rock.get('shadowrock');
    var TILE = Rock.TILE;
    var ramp = RAMP.map(function (h) { return U.rgb(h); });

    var ctx = U.ctx2d(W, H);
    var img = ctx.createImageData(W, H);
    var d = img.data;
    var height = new Float32Array(W * H);
    var gloss = new Float32Array(W * H);

    for (var y = 0; y < H; y++) {
      // Vertical torus so the texture wraps without a seam as it scrolls.
      var ay = y / H * U.TAU;
      var cy = Math.cos(ay), sy = Math.sin(ay);
      var ty = y % TILE;
      for (var x = 0; x < W; x++) {
        var i = y * W + x;

        // Big structure: broad buttresses, a ridged field for the fracture
        // planes between them, and long vertical runnels where water has
        // come down the face.
        var big = U.fbm2(x * 0.0068 + 34 * cy, 34 * sy, 4, 909);
        var rid = U.ridge2(x * 0.0115 + 21 * cy + 300, 21 * sy + 300, 3, 313);
        var run = U.fbm2(x * 0.055 + 5.5 * cy + 700, 5.5 * sy + 700, 3, 515);
        var v = big * 0.52 + rid * 0.30 + run * 0.18;

        // Bedding: faint horizontal planes so it is stone, not cloud.
        var band = Math.sin((y + big * 40) * 0.09) * 0.5 + 0.5;
        v = v * 0.86 + band * 0.14;

        // The near-black material tile supplies the fine grain.
        var tx = x % TILE;
        var ti = (ty * TILE + tx) * 4;
        var fine = mat.data[ti + 1] / 255;
        v = U.clamp01(v * 1.45 - 0.22) * 0.80 + fine * 0.20;

        var k = v * (ramp.length - 1);
        var k0 = Math.floor(k), k1 = Math.min(ramp.length - 1, k0 + 1);
        var col = U.mixRgb(ramp[k0], ramp[k1], k - k0);

        var p = i * 4;
        d[p] = col[0] * 255; d[p + 1] = col[1] * 255; d[p + 2] = col[2] * 255; d[p + 3] = 255;
        height[i] = v * 1.0 + mat.height[ty * TILE + tx] * 0.30;
        gloss[i] = 0.14 + rid * 0.10;
      }
    }
    ctx.putImageData(img, 0, 0);
    albedoCanvas = ctx.canvas;

    var nctx = U.ctx2d(W, H);
    var nimg = nctx.createImageData(W, H);
    nimg.data.set(NG.fromHeight(height, W, H, { strength: 2.6, glossField: gloss }));
    nctx.putImageData(nimg, 0, 0);
    normalCanvas = nctx.canvas;
  };

  Bw.upload = function (G) {
    albTex = G.texture(albedoCanvas, { smooth: false, premultiply: true, repeat: true });
    nrmTex = G.texture(normalCanvas, { smooth: false, premultiply: false, repeat: true });
  };

  // Draw the wall behind everything solid. Four bands, because the sprite
  // format carries one fog value per quad and the wall wants to fog more the
  // higher up the frame it sits: near the top it is mostly air and sky, near
  // the bottom it is stone you could touch.
  // tint: the zone's distant-rock colour. The wall is lit by the same sky and
  // key as the near rock, and at those intensities a mid-value albedo comes
  // out pale; the tint pulls it back to where a face a hundred metres off
  // actually sits, and lets the zone recolour it.
  Bw.draw = function (camY, alpha, fogBase, tint) {
    if (!albTex) return;
    var D = IF.Draw, B = IF.Batch;
    tint = tint || [0.5, 0.55, 0.62];
    var tr = tint[0] * 0.95, tg = tint[1] * 0.95, tb = tint[2] * 1.0;
    D.useTextures(albTex, nrmTex);
    D.blend('normal');
    var off = ((camY * PARALLAX) % H + H) % H;
    var BANDS = 4;
    var bh = C.H / BANDS;
    for (var b = 0; b < BANDS; b++) {
      var t = b / (BANDS - 1);                       // 0 top, 1 bottom
      var a = alpha * U.lerp(0.70, 1.0, U.smoothstep(0, 0.8, t));
      var fog = U.lerp(fogBase + 0.22, fogBase, t);
      var y0 = b * bh;
      var v0 = (off + y0) / H, v1 = (off + y0 + bh) / H;
      B.quad(0, y0, C.W, bh, 0, v0, 1, v1, B.color(tr, tg, tb, a), B.params(0, 1, 0.38, U.clamp01(fog)));
    }
  };

  // Every ledge in frame drops a soft shadow onto the wall, thrown along the
  // zone's key light. This is the cheapest thing in the file and it does the
  // most: a shadow is what tells the eye that two things are in the same room.
  Bw.drawShadows = function (Cam, keyDir, alpha) {
    var D = IF.Draw;
    var T = IF.Terrain;
    D.useAtlas();
    D.blend('normal');
    var list = T.platformsBetween(Cam.y - 80, Cam.y + C.H + 80);
    // The shadow falls away from the light.
    var ox = -keyDir[0] * 14, oy = -keyDir[1] * 10 + 8;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.w > 300) continue;
      var sx = Cam.sx(p.x) + ox, sy = Cam.sy(p.y + p.h) + oy;
      var r = p.w * 0.62 + 10;
      D.glow(sx, sy + 2, r, [0, 0, 0], 0.42 * alpha);
      D.glow(sx, sy, r * 0.6, [0, 0, 0], 0.30 * alpha, true);
    }
  };

  IF.Backwall = Bw;
})();
