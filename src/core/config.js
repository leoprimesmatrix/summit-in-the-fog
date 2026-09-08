// Every tuning number in ICEFALL, in one place.
(function () {
  'use strict';
  var IF = window.ICEFALL = window.ICEFALL || {};

  IF.states = {};
  IF.registerState = function (name, obj) { IF.states[name] = obj; };

  var C = {
    // --- presentation ------------------------------------------------------
    // 640x360 is 16:9 and divides 1280x720 and 1920x1080 exactly, so the
    // integer upscale is lossless on the two windows people actually use.
    W: 640, H: 360,

    // --- the mountain ------------------------------------------------------
    // World x runs 0..W. The camera only travels vertically, so the whole
    // frame is always face. World y increases downward, screen-style: the
    // summit is y 0 and the boulder field you start in is y WORLD_H.
    // A perfect climb of the route the generator builds runs at about 58
    // pixels a second. At the old height that was four and a half minutes of
    // flawless play before anyone saw the summit, and a real climb was three
    // times that with an avalanche underneath it the whole way.
    WORLD_H: 11700,
    CHUNK_H: 390,             // terrain is generated and baked in slabs
    CELL: 4,                  // collision grid resolution in pixels
    CHUNK_CACHE: 7,           // baked slabs kept resident

    ALT_BASE_M: 2100,
    ALT_TOP_M: 8848,          // it is that mountain, and you are near the top

    // --- the climber -------------------------------------------------------
    P_W: 11, P_H: 20,         // collision box; the sprite overhangs it
    GRAVITY: 1000,
    FALL_CAP: 620,
    RUN_SPEED: 150,
    RUN_ACCEL: 1500,
    RUN_FRICTION: 1900,
    AIR_ACCEL: 820,
    AIR_DRAG: 240,
    JUMP_V: 320,              // straight up: 51px, comfortably over a 44px step
    JUMP_CUT: 0.42,           // releasing jump early keeps this much of the rise
    COYOTE: 0.10,
    JUMP_BUFFER: 0.12,
    WALL_SLIDE_V: 74,
    WALL_JUMP_VX: 168,
    WALL_JUMP_VY: 300,
    WALL_STICK: 0.14,         // grace where a wall jump still counts after leaving
    WALL_LOCK: 0.16,          // no steering back into the wall for this long
    DASH_SPEED: 400,
    DASH_TIME: 0.15,
    DASH_END_V: 168,
    DASH_COOLDOWN: 0.30,
    DASH_GRIP: 0.20,          // fraction of the grip bar a dash costs
    LEDGE_GRAB_REACH: 6,
    TERMINAL_FALL: 300,       // fall further than this and you are hurt

    // --- the axe -----------------------------------------------------------
    AXE_SPEED: 620,
    AXE_RANGE: 190,
    AXE_GRIP: 0.14,
    AXE_REEL: 250,            // how fast the rope hauls you in
    AXE_MIN_ROPE: 22,
    AXE_SWING_DAMP: 0.9955,
    AXE_COOLDOWN: 0.12,
    AXE_STICK_TIME: 6.0,      // an axe left in the wall works loose

    // --- grip (the stamina bar) --------------------------------------------
    GRIP_MAX: 1,
    GRIP_REGEN_GROUND: 0.62,
    GRIP_REGEN_AIR: 0.10,
    GRIP_DRAIN_WALL: 0.24,
    GRIP_DRAIN_HANG: 0.20,

    // --- damage ------------------------------------------------------------
    HEALTH: 3,
    IFRAME: 1.15,
    KNOCKBACK: 190,

    // --- hazards -----------------------------------------------------------
    BOULDER_TELEGRAPH: 0.85,  // warning time before one enters the frame
    BOULDER_GRAV: 620,
    BOULDER_MAX_V: 520,
    SERAC_ARM: 96,            // how close you must get before a serac lets go
    SERAC_FUSE: 0.75,
    ICICLE_ARM: 54,
    ICICLE_FUSE: 0.42,
    GUST_WARN: 1.1,

    // --- the avalanche -----------------------------------------------------
    AVALANCHE_START: 1600,    // pixels below the start point
    AVALANCHE_LEAD_MIN: 190,  // it will never be closer than this after a cairn
    AVALANCHE_CATCHUP_GAP: 900,
    // The catch-up has to stay under what a good climber can do, or the
    // mountain is a treadmill nobody can win: 34 x 1.5 is 51 against 58.
    AVALANCHE_CATCHUP_MULT: 1.50,
    CAIRN_PUSHBACK: 560,

    // --- camera ------------------------------------------------------------
    CAM_LERP_TAU: 0.10,
    CAM_LOOKAHEAD: 34,
    CAM_LOOK_TAU: 0.30,
    CAM_DEADZONE: 10,
    TRAUMA_DECAY: 1.5,
    TRAUMA_MAX_OFFSET: 13,
    TRAUMA_MAX_ANGLE: 0.045,

    // --- zones -------------------------------------------------------------
    // `from`/`to` are fractions of the climb. Each zone owns its own light,
    // grade and weather, and the renderer cross-fades between neighbours so
    // the mountain changes colour under you as you climb rather than cutting.
    ZONES: [
      {
        name: 'THE ICEFALL', short: 'ICEFALL',
        from: 0.00, to: 0.20,
        sky: 'dawn',
        ambient: '#4f6d96', ambientI: 0.86,
        key: '#ffdcae', keyI: 1.30, keyDir: [-0.55, -0.62],
        fogColor: '#8fb0cc', fogNear: 0.05, fogFar: 0.85,
        grade: { lift: [0.02, 0.03, 0.06], gain: [1.06, 1.02, 0.98], sat: 1.05, contrast: 1.06 },
        bloom: 0.55, rays: 0.55, grain: 0.035,
        snow: 0.35, wind: 12, windVar: 8,
        boulderRate: 5.2, seracRate: 0.30, icicleRate: 0.55,
        avalanche: 11, difficulty: 0.0
      },
      {
        name: 'THE SERAC FIELD', short: 'SERACS',
        from: 0.20, to: 0.42,
        sky: 'day',
        ambient: '#7396bd', ambientI: 0.96,
        key: '#fff4de', keyI: 1.45, keyDir: [-0.42, -0.72],
        fogColor: '#b7cfe4', fogNear: 0.05, fogFar: 0.80,
        grade: { lift: [0.01, 0.02, 0.04], gain: [1.04, 1.04, 1.02], sat: 1.02, contrast: 1.08 },
        bloom: 0.65, rays: 0.85, grain: 0.03,
        snow: 0.55, wind: 20, windVar: 14,
        boulderRate: 3.6, seracRate: 0.85, icicleRate: 0.75,
        avalanche: 16, difficulty: 0.25
      },
      {
        name: 'THE STORM BAND', short: 'STORM',
        from: 0.42, to: 0.63,
        sky: 'storm',
        ambient: '#556c8a', ambientI: 0.80,
        key: '#cbdcee', keyI: 0.86, keyDir: [-0.30, -0.80],
        fogColor: '#93a7bb', fogNear: 0.02, fogFar: 0.55,
        grade: { lift: [0.03, 0.04, 0.05], gain: [0.96, 0.99, 1.05], sat: 0.80, contrast: 1.12 },
        bloom: 0.45, rays: 0.15, grain: 0.055,
        snow: 1.00, wind: 46, windVar: 34,
        boulderRate: 2.8, seracRate: 1.05, icicleRate: 1.00,
        avalanche: 22, difficulty: 0.5, lightning: true
      },
      {
        name: 'THE KNIFE RIDGE', short: 'RIDGE',
        from: 0.63, to: 0.84,
        sky: 'dusk',
        ambient: '#4b5182', ambientI: 0.70,
        key: '#ffa274', keyI: 1.20, keyDir: [0.62, -0.55],
        fogColor: '#6d6f96', fogNear: 0.04, fogFar: 0.72,
        grade: { lift: [0.05, 0.02, 0.06], gain: [1.10, 0.98, 1.02], sat: 1.18, contrast: 1.10 },
        bloom: 0.85, rays: 0.95, grain: 0.04,
        snow: 0.70, wind: 38, windVar: 26,
        boulderRate: 2.3, seracRate: 1.15, icicleRate: 1.15,
        avalanche: 28, difficulty: 0.75
      },
      {
        name: 'THE DEATH ZONE', short: 'SUMMIT',
        from: 0.84, to: 1.00,
        sky: 'night',
        ambient: '#2c3d6b', ambientI: 0.62,
        key: '#a9dcff', keyI: 0.78, keyDir: [0.40, -0.80],
        fogColor: '#2b3a60', fogNear: 0.05, fogFar: 0.70,
        grade: { lift: [0.02, 0.04, 0.09], gain: [0.94, 1.00, 1.12], sat: 1.24, contrast: 1.14 },
        bloom: 1.00, rays: 0.35, grain: 0.045,
        snow: 0.85, wind: 30, windVar: 22,
        boulderRate: 2.0, seracRate: 1.25, icicleRate: 1.25,
        avalanche: 34, difficulty: 1.0, aurora: true
      }
    ],

    // --- lights ------------------------------------------------------------
    MAX_LIGHTS: 24,
    LANTERN_COLOR: '#ffc46b', LANTERN_RADIUS: 116, LANTERN_I: 1.5, LANTERN_Z: 26,
    FLARE_COLOR: '#ff6a3d', FLARE_RADIUS: 210, FLARE_I: 3.2,
    CRYSTAL_COLOR: '#5ef0e0',
    CAIRN_COLOR: '#ffb04a',

    // --- scoring -----------------------------------------------------------
    SCORE_HEIGHT_PER_M: 1.0,
    SCORE_CRYSTAL: 250,
    SCORE_CAIRN: 400,
    SCORE_SUMMIT: 5000,
    SCORE_DODGE: 60,          // a boulder that passes within a body's width
    SCORE_NO_HIT: 2500,
    COMBO_WINDOW: 3.2,

    // --- storage -----------------------------------------------------------
    K_BEST_TIME: 'icefall.bestTime',
    K_BEST_SCORE: 'icefall.bestScore',
    K_BEST_ALT: 'icefall.bestAlt',
    K_SFX: 'icefall.sfx',
    K_MUTE: 'icefall.mute',
    K_SHAKE: 'icefall.shake',
    K_QUALITY: 'icefall.quality',
    K_RUNS: 'icefall.runs',

    SEED: 64,
    DEBUG: false
  };

  // World y increases downward: 0 is the summit, WORLD_H is the boulder field
  // you start in. Progress is therefore 1 at the top.
  C.progressAt = function (y) {
    return Math.min(1, Math.max(0, 1 - y / C.WORLD_H));
  };

  C.zoneAt = function (y) {
    var t = C.progressAt(y);
    for (var i = 0; i < C.ZONES.length; i++) {
      if (t < C.ZONES[i].to || i === C.ZONES.length - 1) return C.ZONES[i];
    }
    return C.ZONES[0];
  };

  // The zone pair and blend factor, so light and grade cross-fade instead of
  // cutting. Zones bleed into each other over the last quarter of each band.
  C.zoneBlend = function (y) {
    var t = C.progressAt(y);
    var Z = C.ZONES;
    for (var i = 0; i < Z.length; i++) {
      if (t < Z[i].to || i === Z.length - 1) {
        var span = Z[i].to - Z[i].from;
        var local = span > 0 ? (t - Z[i].from) / span : 0;
        var next = Z[Math.min(i + 1, Z.length - 1)];
        var k = local > 0.74 ? (local - 0.74) / 0.26 : 0;
        return { a: Z[i], b: next, t: k * k * (3 - 2 * k), index: i, local: local };
      }
    }
    return { a: Z[0], b: Z[0], t: 0, index: 0, local: 0 };
  };

  C.altitudeAt = function (y) {
    return C.ALT_BASE_M + (C.ALT_TOP_M - C.ALT_BASE_M) * C.progressAt(y);
  };

  IF.Config = C;
})();
