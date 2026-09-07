// The look of a moment on the mountain.
//
// Everything that changes with altitude - sky, sun, ambient, key light, haze,
// grade, bloom, snowfall - is defined per zone and cross-faded here, so the
// mountain goes from dawn through a storm to an aurora without a single cut.
// Both the title screen and the run render through this file, which is why
// they look like the same place.
(function () {
  'use strict';
  var IF = window.ICEFALL;
  var C = IF.Config;
  var U = IF.Util;

  var Sc = {};

  // Sky presets. Positions are in screen pixels at 640x360.
  var SKY = {
    dawn: {
      top: '#1d3866', mid: '#6d9cc8', bot: '#f6bf92',
      sunCol: '#ffd9a0', sunX: 96, sunY: 288, sunR: 9,
      stars: 0.22, aurora: 0, storm: 0, cloud: 0.55,
      haze: '#87a8c8', rock: '#3f5273', snow: '#f6dcc2'
    },
    day: {
      top: '#1f5fa8', mid: '#6aa8dc', bot: '#c6e0f2',
      sunCol: '#fff6dd', sunX: 148, sunY: 62, sunR: 11,
      stars: 0, aurora: 0, storm: 0, cloud: 0.60,
      haze: '#a2c2dc', rock: '#4d6382', snow: '#f4fbff'
    },
    storm: {
      top: '#242e3d', mid: '#414f60', bot: '#66788a',
      sunCol: '#8fa3ba', sunX: 300, sunY: 40, sunR: 5,
      stars: 0, aurora: 0, storm: 1, cloud: 0.85,
      haze: '#70849a', rock: '#3a4657', snow: '#b6c6d6'
    },
    dusk: {
      top: '#22214f', mid: '#7a4d84', bot: '#ff9257',
      sunCol: '#ff9d5e', sunX: 556, sunY: 250, sunR: 12,
      stars: 0.55, aurora: 0.10, storm: 0, cloud: 0.35,
      haze: '#6d5580', rock: '#382f52', snow: '#f2bd97'
    },
    night: {
      top: '#05080f', mid: '#101c33', bot: '#1e3050',
      sunCol: '#cfe4ff', sunX: 500, sunY: 66, sunR: 7,
      stars: 1.0, aurora: 1.0, storm: 0, cloud: 0.14,
      haze: '#1c2b4c', rock: '#151d33', snow: '#a8c4e0'
    }
  };

  // Working buffers, reused every frame.
  var cur = {
    top: [0, 0, 0], mid: [0, 0, 0], bot: [0, 0, 0], sunCol: [0, 0, 0],
    haze: [0, 0, 0], rock: [0, 0, 0], snow: [0, 0, 0],
    ambient: [0, 0, 0], key: [0, 0, 0], fog: [0, 0, 0],
    sunX: 0, sunY: 0, sunR: 0, stars: 0, aurora: 0, storm: 0, cloud: 0,
    bloom: 0, rays: 0, grain: 0, snowfall: 0, wind: 0, windVar: 0,
    lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1,
    keyDir: [0, 0, 0], zone: null, next: null, blend: 0, index: 0, local: 0
  };

  function mixHex(a, b, t, out) {
    return U.mixRgb(U.rgb(a), U.rgb(b), t, out);
  }

  function mixArr(a, b, t, out) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }

  // Rebuild the current look from the camera's altitude.
  Sc.update = function (camY) {
    var zb = C.zoneBlend(camY + C.H * 0.5);
    var za = zb.a, zn = zb.b, t = zb.t;
    var sa = SKY[za.sky], sb = SKY[zn.sky];

    mixHex(sa.top, sb.top, t, cur.top);
    mixHex(sa.mid, sb.mid, t, cur.mid);
    mixHex(sa.bot, sb.bot, t, cur.bot);
    mixHex(sa.sunCol, sb.sunCol, t, cur.sunCol);
    mixHex(sa.haze, sb.haze, t, cur.haze);
    mixHex(sa.rock, sb.rock, t, cur.rock);
    mixHex(sa.snow, sb.snow, t, cur.snow);

    cur.sunX = U.lerp(sa.sunX, sb.sunX, t);
    cur.sunY = U.lerp(sa.sunY, sb.sunY, t);
    cur.sunR = U.lerp(sa.sunR, sb.sunR, t);
    cur.stars = U.lerp(sa.stars, sb.stars, t);
    cur.aurora = U.lerp(sa.aurora, sb.aurora, t);
    cur.storm = U.lerp(sa.storm, sb.storm, t);
    cur.cloud = U.lerp(sa.cloud, sb.cloud, t);

    // Light.
    var aa = U.rgb(za.ambient), ab = U.rgb(zn.ambient);
    var ia = U.lerp(za.ambientI, zn.ambientI, t);
    mixArr(aa, ab, t, cur.ambient);
    cur.ambient[0] *= ia; cur.ambient[1] *= ia; cur.ambient[2] *= ia;

    var ka = U.rgb(za.key), kb = U.rgb(zn.key);
    var ki = U.lerp(za.keyI, zn.keyI, t);
    mixArr(ka, kb, t, cur.key);
    cur.key[0] *= ki; cur.key[1] *= ki; cur.key[2] *= ki;

    cur.keyDir[0] = U.lerp(za.keyDir[0], zn.keyDir[0], t);
    cur.keyDir[1] = U.lerp(za.keyDir[1], zn.keyDir[1], t);
    cur.keyDir[2] = 0.55;

    mixHex(za.fogColor, zn.fogColor, t, cur.fog);

    cur.bloom = U.lerp(za.bloom, zn.bloom, t);
    cur.rays = U.lerp(za.rays, zn.rays, t);
    cur.grain = U.lerp(za.grain, zn.grain, t);
    cur.snowfall = U.lerp(za.snow, zn.snow, t);
    cur.wind = U.lerp(za.wind, zn.wind, t);
    cur.windVar = U.lerp(za.windVar, zn.windVar, t);

    var ga = za.grade, gb = zn.grade;
    cur.lift[0] = U.lerp(ga.lift[0], gb.lift[0], t);
    cur.lift[1] = U.lerp(ga.lift[1], gb.lift[1], t);
    cur.lift[2] = U.lerp(ga.lift[2], gb.lift[2], t);
    cur.gain[0] = U.lerp(ga.gain[0], gb.gain[0], t);
    cur.gain[1] = U.lerp(ga.gain[1], gb.gain[1], t);
    cur.gain[2] = U.lerp(ga.gain[2], gb.gain[2], t);
    cur.sat = U.lerp(ga.sat, gb.sat, t);
    cur.contrast = U.lerp(ga.contrast, gb.contrast, t);

    cur.zone = za; cur.next = zn; cur.blend = t;
    cur.index = zb.index; cur.local = zb.local;

    var L = IF.Lights;
    L.ambient = cur.ambient;
    L.key = cur.key;
    L.keyDir = cur.keyDir;
    return cur;
  };

  Sc.current = function () { return cur; };

  // --- passes --------------------------------------------------------------

  Sc.sky = function (camY, time, flash) {
    IF.Pipeline.sky({
      time: time, scroll: camY,
      top: cur.top, mid: cur.mid, bot: cur.bot,
      sunCol: cur.sunCol, sunX: cur.sunX, sunY: cur.sunY, sunR: cur.sunR,
      stars: cur.stars, aurora: cur.aurora, storm: cur.storm, cloud: cur.cloud,
      flash: flash || 0
    });
  };

  // Every baked slab that touches the frame, drawn in one pair of quads each.
  Sc.terrain = function (Cam) {
    var D = IF.Draw;
    var B = IF.Batch;
    var Chunks = IF.Chunks;
    var T = IF.Terrain;
    var top = Cam.y - 8, bot = Cam.y + C.H + 8;
    var c0 = Math.floor(top / C.CHUNK_H);
    var c1 = Math.floor(bot / C.CHUNK_H);
    var lit = B.params(0, 1, 0.5, 0);
    var white = B.color(1, 1, 1, 1);

    for (var ci = c0; ci <= c1; ci++) {
      if (ci < 0 || ci >= T.chunkCount()) continue;
      var ch = Chunks.get(ci);
      if (!ch) continue;
      D.useTextures(ch.albedo, ch.normal);
      B.quad(Cam.sx(0), Cam.sy(ch.yTop), C.W, C.CHUNK_H, 0, 0, 1, 1, white, lit);
    }
  };

  Sc.mist = function (camY, time, density, bandY, bandH) {
    IF.Pipeline.mist({
      time: time, scroll: camY,
      density: density, wind: IF.Weather.wind(),
      color: cur.fog, ambient: cur.ambient,
      bandY: bandY === undefined ? C.H * 0.62 : bandY,
      bandH: bandH === undefined ? C.H * 0.9 : bandH
    });
  };

  // The grading block handed to the post pass.
  var grade = {
    // The threshold sits above white on purpose: only things that are
    // genuinely emitting - the sun, a flare, a lit cairn, a specular hit on
    // ice - should bloom. Bloom on ordinary bright pixels is just fog.
    bloomThreshold: 0.88, bloomKnee: 0.20, bloomI: 0.7,
    raysI: 0, rayCol: [1, 1, 1], rayDensity: 0.62, rayDecay: 0.945, rayWeight: 0.9,
    rayThreshold: 1.25,
    lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, exposure: 1,
    vignette: 0.55, grain: 0.035, aberration: 0.55,
    flash: 0, flashCol: [1, 1, 1], fade: 1, warpAmt: 0, desat: 0,
    zoom: 1, rot: 0, time: 0, sunUVx: 0.5, sunUVy: 0.5
  };

  Sc.grade = function (Cam, extra) {
    grade.time = IF.time;
    grade.bloomI = cur.bloom;
    grade.raysI = cur.rays * (extra && extra.rays !== undefined ? extra.rays : 1);
    grade.rayCol = cur.sunCol;
    grade.lift = cur.lift;
    grade.gain = cur.gain;
    grade.sat = cur.sat;
    grade.contrast = cur.contrast;
    grade.grain = cur.grain;
    // The sun's position in UV, with y flipped because the ray pass works in
    // texture space.
    grade.sunUVx = cur.sunX / C.W;
    grade.sunUVy = 1 - cur.sunY / C.H;
    grade.zoom = Cam.zoom;
    grade.rot = Cam.rot;
    grade.exposure = 1;
    grade.vignette = 0.55;
    grade.aberration = 0.45;
    grade.bloomThreshold = 0.88;
    grade.bloomKnee = 0.20;
    grade.rayThreshold = 1.25;
    grade.flash = 0;
    grade.flashCol = [1, 1, 1];
    grade.fade = 1;
    grade.warpAmt = 0;
    grade.desat = 0;
    if (extra) {
      for (var k in extra) if (extra.hasOwnProperty(k)) grade[k] = extra[k];
    }
    return grade;
  };

  Sc.SKY = SKY;
  IF.Scene = Sc;
})();
