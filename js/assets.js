(function () {
  'use strict';

  var Assets = {
    img: {},
    ready: false,
    loaded: 0,
    total: 0
  };

  Assets.manifest = {
    // Base camp: the forest you set out from.
    sky4:    'assets/img/nature_4/1.png',
    cloud4:  'assets/img/nature_4/2.png',
    hill4:   'assets/img/nature_4/3.png',
    tree4:   'assets/img/nature_4/4.png',
    sky3:    'assets/img/nature_3/1.png',
    peak3:   'assets/img/nature_3/2.png',
    haze3:   'assets/img/nature_3/3.png',
    fore3:   'assets/img/nature_3/4.png',
    aurora6: 'assets/img/nature_6/1.png',
    stars6:  'assets/img/nature_6/2.png',
    peaks6:  'assets/img/nature_6/3.png'
  };

  Assets.load = function (onDone) {
    var keys = Object.keys(Assets.manifest);
    Assets.total = keys.length;
    Assets.loaded = 0;
    if (keys.length === 0) { Assets.ready = true; onDone && onDone(); return; }

    keys.forEach(function (k) {
      var img = new Image();
      img.onload = function () {
        Assets.img[k] = img;
        step();
      };
      img.onerror = function () {
        console.warn('[assets] failed to load ' + Assets.manifest[k]);
        Assets.img[k] = null;
        step();
      };
      img.src = Assets.manifest[k];
    });

    function step() {
      Assets.loaded++;
      if (Assets.loaded >= Assets.total) {
        Assets.ready = true;
        onDone && onDone();
      }
    }
  };

  SITF.Assets = Assets;
})();
