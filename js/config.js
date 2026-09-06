window.SITF = window.SITF || {};

// The state registry lives here because state files load before main.js.
SITF.states = {};
SITF.registerState = function (name, obj) { SITF.states[name] = obj; };

SITF.Config = {
  W: 576, H: 324,
  LANE_X: [210, 288, 366],
  ROW_H: 30,
  ROWS: 150,
  CAIRN_EVERY: 12,
  CLIMBER_SCREEN_Y: 236,
  CAMERA_LERP: 0.12,

  HOP_TIME: 0.18, HOP_ARC: 11,
  LAND_SQUASH: 0.08,        // seconds the landing squash frame shows
  SLIP_LUNGE_TIME: 0.20, FALL_TIME: 0.45, RECOVER_TIME: 0.60,
  INPUT_BUFFER: 0.25,
  COMBO_WINDOW: 0.60,
  COMBO_FAST_AT: 5, COMBO_HOP_TIME: 0.15,

  LANTERN_DELAY: 0.25, LANTERN_FADE: 0.65, LANTERN_RADIUS: 30,
  CAIRN_CLEAR_RADIUS: 54,
  CRUMBLE_DELAY: 0.8, CRUMBLE_RESPAWN: 2.5,

  WHITEOUT_START_ROW: -8, WHITEOUT_CATCHUP_GAP: 12, WHITEOUT_CATCHUP_MULT: 1.5,
  CAIRN_PUSHBACK_ROWS: 4,

  ZONES: [
    { name: 'TREELINE',   from: 0,   to: 49,  fogDensity: 0.955, gustInterval: 4.5, revealRows: 7, whiteoutSpeed: 0.62, crumbleChance: 0.00, mercyChance: 0.25, gustDelay: 0, crystalChance: 0.14 },
    { name: 'THE RIDGE',  from: 50,  to: 99,  fogDensity: 0.97, gustInterval: 6.0, revealRows: 5, whiteoutSpeed: 0.78, crumbleChance: 0.18, mercyChance: 0.08, gustDelay: 0, crystalChance: 0.18 },
    { name: 'THE SUMMIT', from: 100, to: 150, fogDensity: 0.985, gustInterval: 7.5, revealRows: 3, whiteoutSpeed: 0.92, crumbleChance: 0.28, mercyChance: 0.00, gustDelay: 1.0, crystalChance: 0.22 }
  ],
  GUST_DURATION: 1.6, GUST_WIPE_PORTION: 0.5, GUST_FADE_PORTION: 0.25,
  ALT_BASE_M: 1800, ALT_PER_ROW_M: 20,
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

  // Echo step: every landing ripples the fog and shows the next ledge for a
  // moment. Longer combos see further. Stop moving and the fog closes.
  ECHO_HOLD: 0.50, ECHO_FADE: 0.30,
  ECHO_ROWS_BASE: 1, ECHO_COMBO_2: 4, ECHO_COMBO_3: 8,
  CLARITY_HOPS: 6,          // crystal pickup: +1 echo row for this many hops
  CRYSTAL_CHANCE: 0.16,
  SCORE_HOP: 10, SCORE_BLIND: 40, SCORE_CRYSTAL: 100, SCORE_CAIRN: 150,
  SCORE_SUMMIT: 1000, SCORE_TIME_BONUS_PER_SEC: 6, SCORE_TIME_PAR: 240,
  DANGER_ROWS: 4, MILESTONE_M: 500,

  DEBUG: false
};
