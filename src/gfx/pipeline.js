// The frame graph.
//
//   sky            procedural, straight into the scene buffer
//   sprites        parallax, terrain, entities and particles, forward-lit
//   mist           fullscreen fog, scattering the same lights
//   additive       glows, sparks, the rope, anything that emits
//   bright         luminance above the knee, at half resolution
//   bloom          four downsamples, four tent upsamples
//   rays           radial blur of the bright pass from the sun
//   post           warp, bloom, rays, tone map, grade, vignette, grain
//
// Everything runs at 640x360. The whole chain is about a millisecond on
// anything made this decade, which is what buys the effect budget.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;
  var G = IF.GL;
  var S = IF.Shaders;
  var Batch = IF.Batch;
  var Lights = IF.Lights;

  var Pipe = {};

  var progSprite, progSky, progMist, progBright, progDown, progUp, progRay, progPost, progBlit, progPresent;
  var scene = null, warp = null, bright = null, rays = null, raysB = null, final = null;
  var mips = [];
  var canvas = null;
  var quality = 1;         // 1 full, 0 reduced (fewer bloom levels, no rays)

  var MIPS = 5;

  Pipe.init = function (cv) {
    canvas = cv;
    G.initQuad();
    Batch.init();

    progSprite = G.program('sprite', S.spriteVS, S.spriteFS);
    progSky = G.program('sky', S.quadVS, S.skyFS);
    progMist = G.program('mist', S.quadVS, S.mistFS);
    progBright = G.program('bright', S.quadVS, S.brightFS);
    progDown = G.program('down', S.quadVS, S.downFS);
    progUp = G.program('up', S.quadVS, S.upFS);
    progRay = G.program('ray', S.quadVS, S.rayFS);
    progPost = G.program('post', S.quadVS, S.postFS);
    progBlit = G.program('blit', S.quadVS, S.blitFS);
    progPresent = G.program('present', S.quadVS, S.presentFS);

    Pipe.buildTargets();
    return true;
  };

  Pipe.buildTargets = function () {
    var f = G.floatTargets;
    scene = G.target(C.W, C.H, { smooth: true, float: f });
    // Grading, grain and vignette all run at the game's own resolution, then
    // one sharp upscale goes to the window. Grade at display resolution and
    // the grain stops being pixels and starts being fuzz.
    final = G.target(C.W, C.H, { smooth: false });
    warp = G.target(C.W >> 1, C.H >> 1, { smooth: true });
    bright = G.target(C.W >> 1, C.H >> 1, { smooth: true, float: f });
    rays = G.target(C.W >> 1, C.H >> 1, { smooth: true, float: f });
    raysB = G.target(C.W >> 1, C.H >> 1, { smooth: true, float: f });
    mips.length = 0;
    var w = C.W >> 1, h = C.H >> 1;
    for (var i = 0; i < MIPS; i++) {
      mips.push({
        down: G.target(w, h, { smooth: true, float: f }),
        up: G.target(w, h, { smooth: true, float: f }),
        w: w, h: h
      });
      w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
    }
  };

  Pipe.setQuality = function (q) { quality = q; };
  Pipe.quality = function () { return quality; };

  // --- frame ---------------------------------------------------------------

  Pipe.beginFrame = function () {
    G.beginFrame();
    G.resetBlendCache();
    G.bind(scene);
    G.blend('none');
    G.clear(0, 0, 0, 1);
  };

  // p: { top, mid, bot, sunCol, sunX, sunY, sunR, stars, aurora, storm, cloud,
  //      flash, time, scroll }
  Pipe.sky = function (p) {
    G.bind(scene);
    G.blend('none');
    progSky.use();
    progSky.v2('u_res', C.W, C.H);
    progSky.f('u_time', p.time);
    progSky.f('u_scroll', p.scroll);
    progSky.v3('u_top', p.top[0], p.top[1], p.top[2]);
    progSky.v3('u_mid', p.mid[0], p.mid[1], p.mid[2]);
    progSky.v3('u_bot', p.bot[0], p.bot[1], p.bot[2]);
    progSky.v3('u_sunCol', p.sunCol[0], p.sunCol[1], p.sunCol[2]);
    progSky.v3('u_sun', p.sunX, p.sunY, p.sunR);
    progSky.f('u_stars', p.stars);
    progSky.f('u_aurora', p.aurora);
    progSky.f('u_storm', p.storm);
    progSky.f('u_cloud', p.cloud);
    progSky.f('u_flash', p.flash || 0);
    G.fullscreen();
    G.stats.passes++;
  };

  // Sprite pass. Everything between begin and end goes into the scene buffer
  // with the current light set.
  Pipe.beginSprites = function (exposure, fogColor) {
    G.bind(scene);
    G.blend('normal');
    progSprite.use();
    progSprite.v2('u_res', C.W, C.H);
    progSprite.f('u_time', IF.time || 0);
    progSprite.f('u_exposure', exposure === undefined ? 1 : exposure);
    progSprite.v3('u_fogColor', fogColor[0], fogColor[1], fogColor[2]);
    Lights.bind(progSprite);
    Batch.begin(progSprite);
    Batch.blend('normal');
  };

  Pipe.endSprites = function () { Batch.end(); };

  Pipe.spriteProgram = function () { return progSprite; };

  // p: { density, wind, color, ambient, bandY, bandH, time, scroll }
  Pipe.mist = function (p) {
    if (p.density <= 0.002) return;
    G.bind(scene);
    G.blend('normal');
    progMist.use();
    progMist.v2('u_res', C.W, C.H);
    progMist.f('u_time', p.time);
    progMist.f('u_scroll', p.scroll);
    progMist.f('u_density', p.density);
    progMist.f('u_wind', p.wind);
    progMist.v3('u_color', p.color[0], p.color[1], p.color[2]);
    progMist.v3('u_ambient', p.ambient[0], p.ambient[1], p.ambient[2]);
    progMist.f('u_bandY', p.bandY);
    progMist.f('u_bandH', p.bandH);
    Lights.bind(progMist);
    G.fullscreen();
    G.stats.passes++;
  };

  // --- the distortion buffer ----------------------------------------------
  // Shockwaves and heat shimmer draw into this. Red and green carry a signed
  // screen-space offset; neutral is mid-grey.

  Pipe.beginWarp = function () {
    G.bind(warp);
    G.blend('none');
    G.clear(0.5, 0.5, 0.5, 1);
    G.blend('normal');
    progSprite.use();
    progSprite.v2('u_res', C.W >> 1, C.H >> 1);
    progSprite.i('u_lightCount', 0);
    progSprite.f('u_exposure', 1);
    progSprite.v3('u_fogColor', 0, 0, 0);
    Batch.begin(progSprite);
    Batch.blend('normal');
  };

  Pipe.endWarp = function () { Batch.end(); };

  // --- post ----------------------------------------------------------------

  function brightPass(threshold, knee) {
    G.bind(bright);
    G.blend('none');
    progBright.use();
    progBright.tex('u_tex', scene.tex, 0);
    progBright.f('u_threshold', threshold);
    progBright.f('u_knee', knee);
    G.fullscreen();
    G.stats.passes++;
  }

  function bloom(levels) {
    var i, src = bright;
    for (i = 0; i < levels; i++) {
      G.bind(mips[i].down);
      G.blend('none');
      progDown.use();
      progDown.tex('u_tex', src.tex, 0);
      progDown.v2('u_texel', 1 / src.w, 1 / src.h);
      G.fullscreen();
      src = mips[i].down;
      G.stats.passes++;
    }
    // Walk back up, adding each level into the one below it.
    var cur = mips[levels - 1].down;
    for (i = levels - 2; i >= 0; i--) {
      G.bind(mips[i].up);
      G.blend('none');
      progUp.use();
      progUp.tex('u_tex', cur.tex, 0);
      progUp.v2('u_texel', 1 / cur.w, 1 / cur.h);
      G.fullscreen();
      // Add the sharper level on top of the blurred one.
      G.blend('add');
      progBlit.use();
      progBlit.tex('u_tex', mips[i].down.tex, 0);
      progBlit.v4('u_tint', 1, 1, 1, 1);
      G.fullscreen();
      cur = mips[i].up;
      G.stats.passes += 2;
    }
    return cur;
  }

  function godRays(sunUVx, sunUVy, density, decay, weight, threshold) {
    // Rays get their own, much higher, bright pass. Sharing the bloom buffer
    // meant smearing the whole sky outward from the sun instead of just the
    // disc, which reads as a dirty lens rather than as light through air.
    G.bind(raysB);
    G.blend('none');
    progBright.use();
    progBright.tex('u_tex', scene.tex, 0);
    progBright.f('u_threshold', threshold);
    progBright.f('u_knee', 0.12);
    G.fullscreen();

    G.bind(rays);
    progRay.use();
    progRay.tex('u_tex', raysB.tex, 0);
    progRay.v2('u_origin', sunUVx, sunUVy);
    progRay.f('u_density', density);
    progRay.f('u_decay', decay);
    progRay.f('u_weight', weight);
    G.fullscreen();

    // A second, wider sweep smooths the banding the first one leaves.
    G.bind(raysB);
    progRay.use();
    progRay.tex('u_tex', rays.tex, 0);
    progRay.f('u_density', density * 0.5);
    G.fullscreen();
    G.stats.passes += 3;
    return raysB;
  }

  var blackTex = null;
  function black() {
    if (!blackTex) {
      var c = U.ctx2d(2, 2);
      c.fillStyle = '#000'; c.fillRect(0, 0, 2, 2);
      blackTex = G.texture(c.canvas, { smooth: true });
    }
    return blackTex;
  }

  // g: grading and effect parameters, see play.js for what fills it in.
  Pipe.present = function (g) {
    var levels = quality ? MIPS : 3;
    brightPass(g.bloomThreshold, g.bloomKnee);
    var bloomTex = bloom(levels);

    var rayTex = null;
    if (quality && g.raysI > 0.004) {
      rayTex = godRays(g.sunUVx, g.sunUVy, g.rayDensity || 0.72,
                       g.rayDecay || 0.94, g.rayWeight || 1.15,
                       g.rayThreshold === undefined ? 1.15 : g.rayThreshold);
    }

    G.bind(final);
    G.blend('none');
    progPost.use();
    progPost.tex('u_scene', scene.tex, 0);
    progPost.tex('u_bloom', bloomTex.tex, 1);
    progPost.tex('u_rays', rayTex ? rayTex.tex : black(), 2);
    progPost.tex('u_warp', warp.tex, 3);
    progPost.v2('u_res', C.W, C.H);
    progPost.f('u_time', g.time);
    progPost.f('u_bloomI', g.bloomI);
    progPost.f('u_raysI', rayTex ? g.raysI : 0);
    progPost.v3('u_rayCol', g.rayCol[0], g.rayCol[1], g.rayCol[2]);
    progPost.v3('u_lift', g.lift[0], g.lift[1], g.lift[2]);
    progPost.v3('u_gain', g.gain[0], g.gain[1], g.gain[2]);
    progPost.f('u_sat', g.sat);
    progPost.f('u_contrast', g.contrast);
    progPost.f('u_exposure', g.exposure);
    progPost.f('u_vignette', g.vignette);
    progPost.f('u_grain', g.grain);
    progPost.f('u_aberration', g.aberration);
    progPost.f('u_flash', g.flash || 0);
    progPost.v3('u_flashCol', g.flashCol[0], g.flashCol[1], g.flashCol[2]);
    progPost.f('u_fade', g.fade === undefined ? 1 : g.fade);
    progPost.f('u_warpAmt', g.warpAmt || 0);
    progPost.f('u_desat', g.desat || 0);
    progPost.f('u_zoom', g.zoom || 1);
    progPost.f('u_rot', g.rot || 0);
    G.fullscreen();
    G.stats.passes++;

    Pipe.blitToScreen(final);
  };

  // One sharp upscale from the game's resolution to the window.
  Pipe.blitToScreen = function (src) {
    G.bind(null);
    G.blend('none');
    G.clear(0, 0, 0, 1);
    progPresent.use();
    progPresent.tex('u_tex', src.tex, 0);
    progPresent.v2('u_src', src.w, src.h);
    G.fullscreen();
    G.stats.passes++;
  };

  // Straight copy of the scene with no grading, for the loading screen.
  Pipe.presentRaw = function () { Pipe.blitToScreen(scene); };

  Pipe.sceneTarget = function () { return scene; };

  IF.Pipeline = Pipe;
})();
