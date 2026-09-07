// The thin layer over WebGL2: context, shaders, textures and render targets.
// Nothing above this file touches a raw GL call.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var G = {};

  var gl = null;
  var canvas = null;
  G.floatTargets = false;   // half-float colour buffers, if the driver has them

  // --- context -------------------------------------------------------------

  G.init = function (cv) {
    canvas = cv;
    var opts = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      desynchronized: false
    };
    gl = cv.getContext('webgl2', opts);
    if (!gl) return null;
    G.gl = gl;

    // Half-float render targets keep the bloom and light accumulation from
    // clipping at 1.0, which is what lets bright things actually blow out
    // instead of flattening to white.
    var ext = gl.getExtension('EXT_color_buffer_half_float') ||
              gl.getExtension('EXT_color_buffer_float');
    G.floatTargets = !!ext;
    gl.getExtension('OES_texture_float_linear');

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied alpha
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.clearColor(0, 0, 0, 1);
    return gl;
  };

  G.lost = function () { return !gl || gl.isContextLost(); };

  // --- blend modes ---------------------------------------------------------

  var curBlend = '';
  G.blend = function (mode) {
    if (mode === curBlend) return;
    curBlend = mode;
    if (mode === 'add') {
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
    } else if (mode === 'none') {
      gl.blendFunc(gl.ONE, gl.ZERO);
    } else if (mode === 'multiply') {
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.DST_ALPHA, gl.ZERO);
    } else if (mode === 'screen') {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    } else {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  };
  G.resetBlendCache = function () { curBlend = ''; };

  // --- shaders -------------------------------------------------------------

  function compile(type, src, label) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      var lines = src.split('\n');
      var numbered = lines.map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n');
      console.error('[gl] ' + label + ' ' +
        (type === gl.VERTEX_SHADER ? 'vertex' : 'fragment') + ' shader failed:\n' + log + '\n' + numbered);
      gl.deleteShader(s);
      throw new Error('shader compile failed: ' + label);
    }
    return s;
  }

  // A program with its uniform locations resolved once and cached, plus
  // setters that skip redundant uploads.
  G.program = function (label, vsSrc, fsSrc) {
    var vs = compile(gl.VERTEX_SHADER, vsSrc, label);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc, label);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[gl] ' + label + ' link failed: ' + gl.getProgramInfoLog(p));
      throw new Error('program link failed: ' + label);
    }
    gl.deleteShader(vs); gl.deleteShader(fs);

    var uni = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      var name = info.name.replace(/\[0\]$/, '');
      uni[name] = gl.getUniformLocation(p, name);
    }
    var attr = {};
    var an = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var j = 0; j < an; j++) {
      var ai = gl.getActiveAttrib(p, j);
      attr[ai.name] = gl.getAttribLocation(p, ai.name);
    }

    var obj = {
      handle: p, label: label, uniforms: uni, attribs: attr,
      use: function () { G.useProgram(obj); return obj; },
      has: function (k) { return uni[k] !== undefined && uni[k] !== null; },
      f: function (k, v) { if (uni[k]) gl.uniform1f(uni[k], v); return obj; },
      i: function (k, v) { if (uni[k]) gl.uniform1i(uni[k], v); return obj; },
      v2: function (k, a, b) { if (uni[k]) gl.uniform2f(uni[k], a, b); return obj; },
      v3: function (k, a, b, c) { if (uni[k]) gl.uniform3f(uni[k], a, b, c); return obj; },
      v4: function (k, a, b, c, d) { if (uni[k]) gl.uniform4f(uni[k], a, b, c, d); return obj; },
      fv: function (k, arr) { if (uni[k]) gl.uniform1fv(uni[k], arr); return obj; },
      v2v: function (k, arr) { if (uni[k]) gl.uniform2fv(uni[k], arr); return obj; },
      v3v: function (k, arr) { if (uni[k]) gl.uniform3fv(uni[k], arr); return obj; },
      v4v: function (k, arr) { if (uni[k]) gl.uniform4fv(uni[k], arr); return obj; },
      mat3: function (k, arr) { if (uni[k]) gl.uniformMatrix3fv(uni[k], false, arr); return obj; },
      // Bind a texture to a unit and point the sampler at it.
      tex: function (k, texture, unit) {
        if (!uni[k]) return obj;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture && texture.handle ? texture.handle : texture);
        gl.uniform1i(uni[k], unit);
        return obj;
      }
    };
    return obj;
  };

  var curProgram = null;
  G.useProgram = function (p) {
    if (curProgram === p) return;
    curProgram = p;
    gl.useProgram(p.handle);
  };

  // --- textures ------------------------------------------------------------

  function texParams(t, filter, wrap) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  // Upload a canvas or image. `smooth` picks linear filtering, which we want
  // for noise and gradients and never want for pixel art.
  G.texture = function (source, opts) {
    opts = opts || {};
    var t = gl.createTexture();
    var filter = opts.smooth ? gl.LINEAR : gl.NEAREST;
    var wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    texParams(t, filter, wrap);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, opts.premultiply !== false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    return { handle: t, w: source.width, h: source.height, smooth: !!opts.smooth };
  };

  // A texture with no image behind it yet; used for render targets and for
  // chunk pages that get sub-uploaded later.
  G.blankTexture = function (w, h, opts) {
    opts = opts || {};
    var t = gl.createTexture();
    var filter = opts.smooth ? gl.LINEAR : gl.NEAREST;
    var wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    texParams(t, filter, wrap);
    var internal = gl.RGBA8, fmt = gl.RGBA, type = gl.UNSIGNED_BYTE;
    if (opts.float && G.floatTargets) { internal = gl.RGBA16F; type = gl.HALF_FLOAT; }
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
    return { handle: t, w: w, h: h, smooth: !!opts.smooth };
  };

  G.subImage = function (tex, x, y, source) {
    gl.bindTexture(gl.TEXTURE_2D, tex.handle);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };

  G.deleteTexture = function (tex) {
    if (tex && tex.handle) gl.deleteTexture(tex.handle);
  };

  // --- render targets ------------------------------------------------------

  G.target = function (w, h, opts) {
    opts = opts || {};
    var tex = G.blankTexture(w, h, { smooth: opts.smooth !== false, float: opts.float });
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.handle, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) console.warn('[gl] incomplete framebuffer ' + w + 'x' + h);
    return { fb: fb, tex: tex, w: w, h: h, complete: ok };
  };

  var curTarget = null;
  G.bind = function (t) {
    curTarget = t;
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  };
  G.current = function () { return curTarget; };
  G.size = function () {
    return curTarget ? [curTarget.w, curTarget.h] : [canvas.width, canvas.height];
  };

  G.clear = function (r, g, b, a) {
    gl.clearColor(r || 0, g || 0, b || 0, a === undefined ? 0 : a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  // --- fullscreen quad -----------------------------------------------------
  // One unit quad, reused by every post pass. Pass shaders read a_uv and
  // write to the whole target, so there is no matrix involved.

  var quadVao = null;
  G.initQuad = function () {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
       3, -1, 2, 0,
      -1,  3, 0, 2
    ]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  };

  // A single oversized triangle beats two triangles: no diagonal seam, and
  // the fragment shader runs once per pixel instead of twice along the split.
  G.fullscreen = function () {
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  // --- misc ----------------------------------------------------------------

  G.buffer = function (target, data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(target, b);
    if (data) gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  };

  G.stats = { draws: 0, verts: 0, passes: 0 };
  G.beginFrame = function () { G.stats.draws = 0; G.stats.verts = 0; G.stats.passes = 0; };

  IF.GL = G;
})();
