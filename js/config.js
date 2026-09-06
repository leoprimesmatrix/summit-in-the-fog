window.SITF = window.SITF || {};

// The state registry lives here because state files load before main.js.
SITF.states = {};
SITF.registerState = function (name, obj) { SITF.states[name] = obj; };

SITF.Config = {
  W: 576, H: 324,
  // Five lanes across the face. The band spans x 100..476 with the 40px
  // ledges, which leaves the vista visible down both edges of the frame.
  LANE_X: [152, 220, 288, 356, 424],
  MAX_HOP: 2,               // lanes a single hop can cross
  ROW_H: 30,
  ROWS: 180,
  CAIRN_EVERY: 12,
  CLIMBER_SCREEN_Y: 236,
  CAMERA_LERP: 0.12,

  // --- the face --------------------------------------------------------
  // The mountain is a solid mass with a real silhouette, described per
  // world-y by one or two rock intervals. World y is 0 at base camp and
  // negative going up, so the summit is at -WORLD_H.
  WORLD_H: 5400,
  PROFILE_STEP: 4,          // silhouette sampled every 4 px of height
  BAND_H: 200,              // rock is baked in bands this tall
  BAND_CACHE: 6,
  ALT_PER_PX_M: 2 / 3,      // 5400 px of climbing = 3600 m
  // Sky and parallax curves are written against a 0..180 scalar. Keeping
  // that unit means every smoothstep in sky.js and parallax.js survives
  // the rebuild untouched.
  SKY_ROW_PX: 30,

  HOP_TIME: 0.18, HOP_ARC: 11,
  LEAP_TIME: 0.28, LEAP_ARC: 17,   // the two-lane hop: slower, higher, riskier
  LAND_SQUASH: 0.08,        // seconds the landing squash frame shows
  SLIP_LUNGE_TIME: 0.20, FALL_TIME: 0.45, RECOVER_TIME: 0.60,
  INPUT_BUFFER: 0.25,
  COMBO_WINDOW: 0.60,
  COMBO_FAST_AT: 5, COMBO_HOP_TIME: 0.15,

  LANTERN_DELAY: 0.25, LANTERN_FADE: 0.65, LANTERN_RADIUS: 30,
  CAIRN_CLEAR_RADIUS: 54,
  CRUMBLE_DELAY: 0.8, CRUMBLE_RESPAWN: 2.5,
  BRIDGE_DELAY: 0.45,       // a snow bridge gives up much faster than rock

  WHITEOUT_START_ROW: -8, WHITEOUT_CATCHUP_GAP: 12, WHITEOUT_CATCHUP_MULT: 1.5,
  CAIRN_PUSHBACK_ROWS: 4,

  // Stage table. `forkChance` is a second reachable foothold on the row: the
  // route braids rather than running as a single thread.
  // stormCalm/Build/Dur are the weather cycle in seconds; `wind` means a
  // storm shoves each hop a lane downwind; `breath` means thin air.
  ZONES: [
    { name: 'BASE CAMP',  from: 0,   to: 19,  fromM: 1200, toM: 1600, fogCover: 0.35, whiteoutPx: 12.0, branchChance: 0.45,  fogDensity: 0.78,  gustInterval: 4.0, revealRows: 9, whiteoutSpeed: 0.40, crumbleChance: 0.00, mercyChance: 0.30, forkChance: 0.30, leapChance: 0.10, gustDelay: 0, crystalChance: 0.10, stormCalm: 999, stormBuild: 6, stormDur: 0,  wind: false, breath: false },
    { name: 'TREELINE',   from: 20,  to: 59,  fromM: 1600, toM: 2400, fogCover: 0.40, whiteoutPx: 18.6, branchChance: 0.40,  fogDensity: 0.82, gustInterval: 4.5, revealRows: 7, whiteoutSpeed: 0.62, crumbleChance: 0.06, mercyChance: 0.22, forkChance: 0.32, leapChance: 0.18, gustDelay: 0, crystalChance: 0.14, stormCalm: 26,  stormBuild: 6, stormDur: 10, wind: false, breath: false },
    { name: 'THE GLACIER',from: 60,  to: 99,  fromM: 2400, toM: 3200, fogCover: 0.45, whiteoutPx: 21.6, branchChance: 0.35,  fogDensity: 0.85, gustInterval: 5.5, revealRows: 6, whiteoutSpeed: 0.72, crumbleChance: 0.14, mercyChance: 0.14, forkChance: 0.30, leapChance: 0.26, gustDelay: 0, crystalChance: 0.16, bridgeChance: 0.34, stormCalm: 23,  stormBuild: 6, stormDur: 12, wind: false, breath: false },
    { name: 'THE RIDGE',  from: 100, to: 139, fromM: 3200, toM: 4000, fogCover: 0.50, whiteoutPx: 24.6, branchChance: 0.30, fogDensity: 0.87, gustInterval: 6.5, revealRows: 5, whiteoutSpeed: 0.82, crumbleChance: 0.20, mercyChance: 0.08, forkChance: 0.26, leapChance: 0.30, gustDelay: 0, crystalChance: 0.18, bridgeChance: 0.22, stormCalm: 21,  stormBuild: 6, stormDur: 13, wind: true,  breath: false },
    { name: 'DEATH ZONE', from: 140, to: 180, fromM: 4000, toM: 4800, fogCover: 0.55, whiteoutPx: 28.2, branchChance: 0.30, fogDensity: 0.89, gustInterval: 8.0, revealRows: 3, whiteoutSpeed: 0.94, crumbleChance: 0.28, mercyChance: 0.00, forkChance: 0.20, leapChance: 0.34, gustDelay: 1.0, crystalChance: 0.22, bridgeChance: 0.16, stormCalm: 19,  stormBuild: 6, stormDur: 14, wind: true,  breath: true }
  ],

  // Weather and thin air.
  STORM_FRONT_MULT: 3.0,    // how much faster the whiteout climbs in a storm
  STORM_FOG_BONUS: 0.02,
  // Tuned so a climb of the death zone needs three or four deliberate
  // pauses, not a rest between every hop: thin air should make you choose
  // when to breathe, not stop you climbing.
  BREATH_HOP: 0.045, BREATH_LEAP: 0.09,
  BREATH_REST: 0.30, BREATH_REST_CAIRN: 0.70,
  BREATH_LOW: 0.25,         // below this: no leaps, and hops come slower
  BREATH_SLOW_MULT: 1.45,
  WIND_UPWIND_MULT: 1.55, WIND_DOWNWIND_MULT: 0.85,
  GUST_DURATION: 1.6, GUST_WIPE_PORTION: 0.5, GUST_FADE_PORTION: 0.25,
  ALT_BASE_M: 1200, ALT_PER_ROW_M: 20,
  SEED: 64,

  COLORS: {
    fog: '#dfe9f2', fogDark: '#a9bccd', fogNight: '#5a768c',
    whiteout: '#eef4f9', whiteoutEdge: '#cfe0ee',
    ink: '#0b1f3a', text: '#f2f7fb', textDim: '#9db4cc', accent: '#3ff0c8', warn: '#ffb35a',
    rock: '#b39273', rockDark: '#6b5a4a', rockLight: '#d9c2a4', snow: '#f2f7fb', snowShade: '#c9dbe8',
    parka: '#e0553d', parkaDark: '#9c3223', skin: '#f0c9a4', pack: '#4f6a3a', lantern: '#ffd27a',
    sky: '#5aa0d8', night: '#0b1f3a', dusk: '#1a2b55'
  },

  STORAGE_KEY_BEST: 'sitf.bestTime',
  STORAGE_KEY_MUTE: 'sitf.muted',
  STORAGE_KEY_MUSIC: 'sitf.musicVol',
  STORAGE_KEY_SFX: 'sitf.sfxVol',
  STORAGE_KEY_SCORE: 'sitf.bestScore',
  STORAGE_KEY_GUIDE: 'sitf.guide',

  // A landing displaces the fog around your feet. It is atmosphere, not
  // information: it never shows what is on the row above.
  ECHO_HOLD: 0.50, ECHO_FADE: 0.30,

  // The toolkit. The lantern reads across (all lanes, one row), the axe
  // reads up (one lane, four rows), the flare reads both and runs out.
  AXE_TIME: 0.42,           // seconds in flight, during which you cannot hop
  AXE_ROWS: 4,
  AXE_HOLD: 2.6, AXE_FADE: 1.0, AXE_COOLDOWN: 0.30,
  FLARE_COUNT: 3, FLARE_ROWS: 10,
  FLARE_RISE: 0.45, FLARE_BURN: 2.6, FLARE_FADE: 0.8,

  // A ledge you have seen stays as a fading outline: remembering the gust is
  // a skill, so the game has to let you hold what you saw.
  MEMORY_HOLD: 6.0, MEMORY_ALPHA: 0.62,

  CLARITY_HOPS: 6,          // crystal pickup: the lantern is instant and
                            // reaches two rows, for this many hops
  CRYSTAL_CHANCE: 0.16,

  // Ledges ease into/out of visibility instead of popping; asymmetric so a
  // reveal reads as fast weather clearing but fog closing back over feels
  // heavier. Values are exponential time constants (~3*tau to fully settle).
  FOG_REVEAL_RISE_TAU: 0.05,   // ~0.15s to catch up when something becomes visible
  FOG_REVEAL_FALL_TAU: 0.15,   // ~0.45s to fade back into fog
  SCORE_HOP: 10, SCORE_BLIND: 40, SCORE_CRYSTAL: 100, SCORE_CAIRN: 150,
  SCORE_SUMMIT: 1000, SCORE_TIME_BONUS_PER_SEC: 6, SCORE_TIME_PAR: 240,
  DANGER_ROWS: 4, MILESTONE_M: 500,

  DEBUG: false
};
