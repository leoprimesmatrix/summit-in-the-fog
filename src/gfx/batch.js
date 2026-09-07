// The sprite batcher.
//
// One interleaved vertex buffer, one static index buffer, and a flush
// whenever the texture pair or the blend mode changes. A full frame of
// ICEFALL is normally eight to twelve draw calls.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var G = IF.GL;

  var MAX_QUADS = 6000;
  var STRIDE = 24;                 // 2f pos, 2f uv, 4b colour, 4b params
  var FLOATS = STRIDE / 4;

  var B = {};

  var gl = null;
  var vao = null, vbo = null, ibo = null;
  var data = null, f32 = null, u32 = null;
  var quads = 0;

  var curAlbedo = null, curNormal = null, curBlend = 'normal';
  var program = null;
  var started = false;

  B.init = function () {
    gl = G.gl;
    data = new ArrayBuffer(MAX_QUADS * 4 * STRIDE);
    f32 = new Float32Array(data);
    u32 = new Uint32Array(data);

    var idx = new Uint16Array(MAX_QUADS * 6);
    for (var i = 0, v = 0, o = 0; i < MAX_QUADS; i++, v += 4, o += 6) {
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);

    gl.bindVertexArray(null);
  };

  // --- state ---------------------------------------------------------------

  B.begin = function (prog) {
    program = prog;
    started = true;
    quads = 0;
    curAlbedo = null; curNormal = null;
  };

  B.end = function () {
    B.flush();
    started = false;
  };

  B.use = function (albedo, normal) {
    var a = albedo && albedo.handle ? albedo : (albedo || null);
    var n = normal || a;
    if (a !== curAlbedo || n !== curNormal) {
      B.flush();
      curAlbedo = a; curNormal = n;
    }
  };

  B.blend = function (mode) {
    if (mode !== curBlend) {
      B.flush();
      curBlend = mode;
      G.blend(mode);
    }
  };

  B.flush = function () {
    if (!quads || !program) { quads = 0; return; }
    program.use();
    if (curAlbedo) program.tex('u_albedo', curAlbedo, 0);
    if (curNormal) program.tex('u_normal', curNormal, 1);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f32, 0, quads * 4 * FLOATS);
    gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    G.stats.draws++;
    G.stats.verts += quads * 4;
    quads = 0;
  };

  // --- packing -------------------------------------------------------------

  // rgba, each 0..1, into one ABGR word.
  B.color = function (r, g, b, a) {
    return (((a * 255) & 255) << 24 | ((b * 255) & 255) << 16 |
            ((g * 255) & 255) << 8 | ((r * 255) & 255)) >>> 0;
  };
  B.WHITE = B.color(1, 1, 1, 1);

  // emissive, lit, normalStrength, fog -> one word in the same byte order.
  B.params = function (em, lit, nrm, fog) {
    return ((((fog || 0) * 255) & 255) << 24 | ((((nrm === undefined ? 0.5 : nrm) * 255) & 255) << 16) |
            (((lit ? 255 : 0) & 255) << 8) | (((em || 0) * 255) & 255)) >>> 0;
  };
  B.LIT = B.params(0, 1, 0.5, 0);
  B.UNLIT = B.params(0, 0, 0, 0);

  // --- geometry ------------------------------------------------------------

  function vert(o, x, y, u, v, col, par) {
    f32[o] = x; f32[o + 1] = y; f32[o + 2] = u; f32[o + 3] = v;
    u32[o + 4] = col; u32[o + 5] = par;
  }

  // Axis-aligned. The fast path, and most of what the game draws.
  B.quad = function (x, y, w, h, u0, v0, u1, v1, col, par) {
    if (quads >= MAX_QUADS) B.flush();
    var o = quads * 4 * FLOATS;
    var x1 = x + w, y1 = y + h;
    vert(o, x, y, u0, v0, col, par);
    vert(o + FLOATS, x1, y, u1, v0, col, par);
    vert(o + FLOATS * 2, x1, y1, u1, v1, col, par);
    vert(o + FLOATS * 3, x, y1, u0, v1, col, par);
    quads++;
  };

  // Rotated and/or scaled about a pivot given in destination pixels.
  B.rot = function (cx, cy, w, h, ox, oy, rot, u0, v0, u1, v1, col, par) {
    if (quads >= MAX_QUADS) B.flush();
    var c = Math.cos(rot), s = Math.sin(rot);
    var lx = -ox, ly = -oy, rx = w - ox, ry = h - oy;
    var o = quads * 4 * FLOATS;
    vert(o, cx + lx * c - ly * s, cy + lx * s + ly * c, u0, v0, col, par);
    vert(o + FLOATS, cx + rx * c - ly * s, cy + rx * s + ly * c, u1, v0, col, par);
    vert(o + FLOATS * 2, cx + rx * c - ry * s, cy + rx * s + ry * c, u1, v1, col, par);
    vert(o + FLOATS * 3, cx + lx * c - ry * s, cy + lx * s + ry * c, u0, v1, col, par);
    quads++;
  };

  // Four free corners, for ropes, trails and anything sheared.
  B.free = function (x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, col, par) {
    if (quads >= MAX_QUADS) B.flush();
    var o = quads * 4 * FLOATS;
    vert(o, x0, y0, u0, v0, col, par);
    vert(o + FLOATS, x1, y1, u1, v0, col, par);
    vert(o + FLOATS * 2, x2, y2, u1, v1, col, par);
    vert(o + FLOATS * 3, x3, y3, u0, v1, col, par);
    quads++;
  };

  // A thick line between two points, drawn with the atlas's white texel.
  B.line = function (ax, ay, bx, by, width, u0, v0, u1, v1, col, par) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return;
    var nx = -dy / len * width * 0.5, ny = dx / len * width * 0.5;
    B.free(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny,
           u0, v0, u1, v1, col, par);
  };

  B.count = function () { return quads; };

  IF.Batch = B;
})();
