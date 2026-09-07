(function () {
  'use strict';
  var C = SITF.Config;
  var U = SITF.Util;

  // The weather has a shape. Calm, then six seconds of warning, then a storm
  // that drives the whiteout up the face three times as fast and shoves every
  // hop downwind. That turns the toolkit into a set of decisions with a clock
  // on them: standing still to read the route is safe until it isn't.
  //
  // Shelter is the answer. On a lit cairn the front cannot pass you, so the
  // question every storm asks is: hole up and lose the time, or climb through
  // it. A run that never shelters is faster and much more likely to end.

  var S = {};

  S.phase = 'calm';     // 'calm' | 'building' | 'storm'
  S.t = 0;              // seconds spent in this phase
  S.windDir = 0;        // -1, 0, +1: the lane a hop is pushed during a storm
  S.sheltered = false;
  S.stormsRidden = 0;   // storms climbed through without shelter
  S.shelteredFor = 0;

  var nextWind = 1;

  S.reset = function () {
    S.phase = 'calm';
    S.t = 0;
    S.windDir = 0;
    S.sheltered = false;
    S.stormsRidden = 0;
    S.shelteredFor = 0;
    nextWind = 1;
  };

  function len(zone, phase) {
    if (phase === 'calm') return zone.stormCalm;
    if (phase === 'building') return zone.stormBuild;
    return zone.stormDur;
  }

  // 0 while calm, ramping to 1 as the warning runs out, 1 through the storm.
  S.warn = function (zone) {
    if (S.phase === 'storm') return 1;
    if (S.phase !== 'building') return 0;
    return U.clamp(S.t / Math.max(0.001, len(zone, 'building')), 0, 1);
  };

  S.isStorm = function () { return S.phase === 'storm'; };

  // How much of the storm is left, 1 -> 0, for the HUD.
  S.stormLeft = function (zone) {
    if (S.phase !== 'storm') return 0;
    return U.clamp(1 - S.t / Math.max(0.001, len(zone, 'storm')), 0, 1);
  };

  // `shelter` is truthy when the climber is standing somewhere the storm
  // cannot push past: a lit cairn, later a hut or an anchor.
  S.update = function (dt, zone, shelter) {
    S.sheltered = !!shelter && S.phase === 'storm';
    if (S.sheltered) S.shelteredFor += dt;

    // Base camp has no weather: the mountain lets you learn first.
    if (!zone.stormCalm || zone.stormCalm > 900) {
      S.phase = 'calm';
      S.windDir = 0;
      return;
    }

    S.t += dt;
    var span = len(zone, S.phase);
    if (S.t < span) return;

    S.t = 0;
    if (S.phase === 'calm') {
      S.phase = 'building';
      // The wind that will blow is decided now, so the warning can show it.
      S.windDir = zone.wind ? nextWind : 0;
      nextWind = -nextWind;
    } else if (S.phase === 'building') {
      S.phase = 'storm';
    } else {
      S.phase = 'calm';
      if (!S.sheltered) S.stormsRidden++;
      S.windDir = 0;
    }
  };

  // What the whiteout does right now: a multiplier, and whether it is held.
  S.frontSpeed = function () {
    if (S.sheltered) return 0;
    if (S.phase === 'storm') return C.STORM_FRONT_MULT;
    if (S.phase === 'building') return 1 + 0.5 * (C.STORM_FRONT_MULT - 1) * (S.t / 6);
    return 1;
  };

  // The lane a hop is pushed. Only during the storm itself, and only where
  // the stage has wind, so it is always preceded by six seconds of warning.
  S.hopDrift = function () {
    return (S.phase === 'storm') ? S.windDir : 0;
  };

  // Fog thickens in a storm, and the wind stops parting it.
  S.densityBonus = function () { return S.phase === 'storm' ? C.STORM_FOG_BONUS : 0; };
  S.blocksGusts = function () { return S.phase === 'storm'; };

  SITF.Storm = S;
})();
