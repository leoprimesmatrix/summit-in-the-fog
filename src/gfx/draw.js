// The drawing API the rest of the game actually calls.
//
// Thin: it turns a sprite name and a few options into one batched quad. The
// only cleverness is that colours and material parameters are packed once
// here rather than in every caller.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var U = IF.Util;
  var B = IF.Batch;
  var A = IF.Atlas;

  var D = {};

  var white = null;
  var LIT = 0, UNLIT = 0;

  D.init = function () {
    white = A.get('white');
    LIT = B.params(0, 1, 0.5, 0);
    UNLIT = B.params(0, 0, 0, 0);
  };

  D.useAtlas = function () { B.use(A.albedoTex, A.normalTex); };
  D.useTextures = function (alb, nrm) { B.use(alb, nrm); };
  D.blend = function (m) { B.blend(m); };

  function packColor(col, alpha) {
    if (alpha === undefined) alpha = 1;
    if (!col) return B.color(1, 1, 1, alpha);
    if (typeof col === 'string') col = U.rgb(col);
    return B.color(col[0], col[1], col[2], alpha);
  }
  D.packColor = packColor;

  function packParams(o) {
    if (!o) return LIT;
    return B.params(o.emissive || 0,
                    o.lit === undefined ? 1 : o.lit,
                    o.normal === undefined ? 0.5 : o.normal,
                    o.fog || 0);
  }
  D.packParams = packParams;

  // The workhorse. x, y are where the sprite's origin lands.
  D.sprite = function (name, x, y, o) {
    o = o || {};
    var f = typeof name === 'string' ? A.get(name) : name;
    if (!f) return;
    var sx = o.sx === undefined ? (o.scale === undefined ? 1 : o.scale) : o.sx;
    var sy = o.sy === undefined ? (o.scale === undefined ? 1 : o.scale) : o.sy;
    var w = f.w * sx, h = f.h * sy;
    var ox = (o.ox === undefined ? f.ox : o.ox) * sx;
    var oy = (o.oy === undefined ? f.oy : o.oy) * sy;
    var u0 = f.u0, u1 = f.u1;
    if (o.flipX) { var t = u0; u0 = u1; u1 = t; ox = w - ox; }
    var v0 = f.v0, v1 = f.v1;
    if (o.flipY) { var t2 = v0; v0 = v1; v1 = t2; oy = h - oy; }
    var col = packColor(o.color, o.alpha);
    var par = packParams(o);
    if (o.rot) {
      B.rot(x, y, w, h, ox, oy, o.rot, u0, v0, u1, v1, col, par);
    } else {
      B.quad(Math.round(x - ox), Math.round(y - oy), w, h, u0, v0, u1, v1, col, par);
    }
  };

  // A sprite from a numbered sequence, by frame index.
  D.anim = function (name, frame, x, y, o) {
    D.sprite(A.frameOf(name, frame), x, y, o);
  };

  D.rect = function (x, y, w, h, col, alpha, o) {
    var f = white;
    var u = (f.u0 + f.u1) * 0.5, v = (f.v0 + f.v1) * 0.5;
    B.quad(x, y, w, h, u, v, u, v, packColor(col, alpha), o ? packParams(o) : UNLIT);
  };

  D.line = function (ax, ay, bx, by, w, col, alpha, o) {
    var f = white;
    var u = (f.u0 + f.u1) * 0.5, v = (f.v0 + f.v1) * 0.5;
    B.line(ax, ay, bx, by, w, u, v, u, v, packColor(col, alpha), o ? packParams(o) : UNLIT);
  };

  // A soft additive light blob. Cheap, and the thing that makes anything
  // bright read as a source rather than a bright patch of paint.
  D.glow = function (x, y, radius, col, alpha, tight) {
    var f = A.get(tight ? 'glow_tight' : 'glow');
    var s = (radius * 2) / f.w;
    B.quad(x - radius, y - radius, f.w * s, f.h * s, f.u0, f.v0, f.u1, f.v1,
           packColor(col, alpha), UNLIT);
  };

  D.streak = function (x, y, len, thick, col, alpha, rot) {
    var f = A.get('flare_streak');
    var sx = len / f.w, sy = thick / f.h;
    B.rot(x, y, f.w * sx, f.h * sy, f.w * sx * 0.5, f.h * sy * 0.5, rot || 0,
          f.u0, f.v0, f.u1, f.v1, packColor(col, alpha), UNLIT);
  };

  D.ring = function (x, y, radius, thick, col, alpha) {
    var f = A.get('ring');
    var s = (radius * 2) / f.w;
    B.quad(x - radius, y - radius, f.w * s, f.h * s, f.u0, f.v0, f.u1, f.v1,
           packColor(col, alpha), UNLIT);
  };

  // A horizontally three-sliced sprite: fixed caps, tiled middle. Ledges are
  // drawn this way so a 38-pixel one and a 78-pixel one are the same art at
  // the same pixel density, with no stretching.
  D.slabX = function (name, x, y, w, cap, o) {
    o = o || {};
    var f = typeof name === 'string' ? A.get(name) : name;
    if (!f) return;
    cap = cap || 10;
    var col = packColor(o.color, o.alpha);
    var par = packParams(o);
    var uPer = (f.u1 - f.u0) / f.w;
    var h = f.h;
    var oy = o.oy === undefined ? 0 : o.oy;
    x = Math.round(x); y = Math.round(y - oy);
    w = Math.max(cap * 2 + 1, Math.round(w));

    B.quad(x, y, cap, h, f.u0, f.v0, f.u0 + uPer * cap, f.v1, col, par);
    B.quad(x + w - cap, y, cap, h, f.u1 - uPer * cap, f.v0, f.u1, f.v1, col, par);

    var midW = f.w - cap * 2;
    var mu0 = f.u0 + uPer * cap, mu1 = f.u1 - uPer * cap;
    var span = w - cap * 2;
    var px = x + cap;
    while (span > 0) {
      var take = Math.min(midW, span);
      B.quad(px, y, take, h, mu0, f.v0, mu0 + uPer * take, f.v1, col, par);
      px += take; span -= take;
    }
  };

  // A nine-slice slab, used behind every piece of text in the HUD.
  D.panel = function (x, y, w, h, alpha, col) {
    var f = A.get('panel');
    var c = packColor(col || [1, 1, 1], alpha === undefined ? 1 : alpha);
    var uw = (f.u1 - f.u0) / 3, vh = (f.v1 - f.v0) / 3;
    var s = 4;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    var xs = [x, x + s, x + w - s, x + w];
    var ys = [y, y + s, y + h - s, y + h];
    var us = [f.u0, f.u0 + uw, f.u1 - uw, f.u1];
    var vs = [f.v0, f.v0 + vh, f.v1 - vh, f.v1];
    for (var r = 0; r < 3; r++) {
      for (var cc = 0; cc < 3; cc++) {
        var dw = xs[cc + 1] - xs[cc], dh = ys[r + 1] - ys[r];
        if (dw <= 0 || dh <= 0) continue;
        B.quad(xs[cc], ys[r], dw, dh, us[cc], vs[r], us[cc + 1], vs[r + 1], c, UNLIT);
      }
    }
  };

  // A vertical soft gradient bar, white at the top fading down.
  D.vgrad = function (x, y, w, h, col, alpha, flip) {
    var f = A.get('vgrad');
    var v0 = flip ? f.v1 : f.v0, v1 = flip ? f.v0 : f.v1;
    B.quad(x, y, w, h, f.u0, v0, f.u1, v1, packColor(col, alpha), UNLIT);
  };

  D.LIT = function () { return LIT; };
  D.UNLIT = function () { return UNLIT; };

  IF.Draw = D;
})();
