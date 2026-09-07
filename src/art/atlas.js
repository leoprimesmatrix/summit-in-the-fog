// The sprite atlas: one albedo page and one normal page, identical layout, so
// a sprite's UVs address both. Everything is drawn at boot into 2D canvases
// and uploaded once.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var NG = IF.NormalGen;

  var SIZE = 1024;
  var PAD = 2;            // bleed guard; NEAREST sampling still wants a gap

  var A = {};

  var albedo = null, normal = null;
  var shelfX = 0, shelfY = 0, shelfH = 0;
  var frames = {};
  var pending = [];

  A.SIZE = SIZE;
  A.frames = frames;

  A.reset = function () {
    albedo = U.ctx2d(SIZE, SIZE);
    normal = U.ctx2d(SIZE, SIZE);
    // A neutral normal everywhere means an unwritten texel still lights sanely.
    normal.fillStyle = 'rgba(128,128,255,0.35)';
    normal.fillRect(0, 0, SIZE, SIZE);
    shelfX = 0; shelfY = 0; shelfH = 0;
    frames = {}; A.frames = frames;
    pending.length = 0;
  };

  function alloc(w, h) {
    if (shelfX + w + PAD > SIZE) {
      shelfX = 0;
      shelfY += shelfH + PAD;
      shelfH = 0;
    }
    if (shelfY + h > SIZE) {
      console.error('[atlas] out of room for ' + w + 'x' + h);
      return null;
    }
    var r = { x: shelfX, y: shelfY };
    shelfX += w + PAD;
    if (h > shelfH) shelfH = h;
    return r;
  }

  // Add one sprite from a 2D context. `opts` steers the normal derivation.
  A.add = function (name, ctx, opts) {
    opts = opts || {};
    var w = ctx.canvas.width, h = ctx.canvas.height;
    var slot = alloc(w, h);
    if (!slot) return null;

    albedo.drawImage(ctx.canvas, slot.x, slot.y);

    var nimg;
    if (opts.normalCtx) {
      nimg = opts.normalCtx.getImageData(0, 0, w, h);
    } else if (opts.heightField) {
      var raw = NG.fromHeight(opts.heightField, w, h, opts);
      nimg = normal.createImageData(w, h);
      nimg.data.set(raw);
    } else {
      nimg = NG.fromContext(ctx, opts);
    }
    normal.putImageData(nimg, slot.x, slot.y);

    var f = {
      name: name, x: slot.x, y: slot.y, w: w, h: h,
      u0: slot.x / SIZE, v0: slot.y / SIZE,
      u1: (slot.x + w) / SIZE, v1: (slot.y + h) / SIZE,
      ox: opts.ox === undefined ? w / 2 : opts.ox,
      oy: opts.oy === undefined ? h / 2 : opts.oy
    };
    frames[name] = f;
    return f;
  };

  // Draw into a fresh context of the given size and add the result.
  A.paint = function (name, w, h, fn, opts) {
    var ctx = U.ctx2d(w, h);
    fn(ctx, w, h);
    return A.add(name, ctx, opts);
  };

  // A numbered run of frames: name_0 .. name_(count-1).
  A.paintSeq = function (name, count, w, h, fn, opts) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var ctx = U.ctx2d(w, h);
      fn(ctx, i, i / Math.max(1, count - 1), w, h);
      out.push(A.add(name + '_' + i, ctx, opts));
    }
    frames[name] = out[0];
    A.seq = A.seq || {};
    A.seq[name] = out;
    return out;
  };

  A.get = function (name) {
    var f = frames[name];
    if (!f) {
      if (!A._warned) A._warned = {};
      if (!A._warned[name]) { console.warn('[atlas] missing sprite: ' + name); A._warned[name] = 1; }
      return frames.white;
    }
    return f;
  };

  A.has = function (name) { return !!frames[name]; };

  A.frameOf = function (name, i, count) {
    var s = A.seq && A.seq[name];
    if (!s || !s.length) return A.get(name);
    var k = Math.floor(i) % s.length;
    if (k < 0) k += s.length;
    return s[k];
  };

  A.seqLen = function (name) {
    var s = A.seq && A.seq[name];
    return s ? s.length : 0;
  };

  A.albedoCanvas = function () { return albedo.canvas; };
  A.normalCanvas = function () { return normal.canvas; };

  // Upload. Albedo is premultiplied by the driver; the normal page must not
  // be, or the vectors get scaled by their own gloss value.
  A.upload = function (G) {
    A.albedoTex = G.texture(albedo.canvas, { smooth: false, premultiply: true });
    A.normalTex = G.texture(normal.canvas, { smooth: false, premultiply: false });
    return A.albedoTex;
  };

  IF.Atlas = A;
})();
