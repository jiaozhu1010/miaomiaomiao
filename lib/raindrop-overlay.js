/**
 * Raindrop FX overlay.
 * Uses the official WebGL2 renderer from /lib/raindrop-fx.js and feeds it a
 * miaosite-styled background canvas.
 */
(function () {
  'use strict';

  var MAX_DPR = 1.5;

  function RaindropOverlay() {
    this._wrapper = null;
    this._canvas = null;
    this._backgroundCanvas = null;
    this._fx = null;
    this._started = false;
    this._startPromise = null;
    this._resizeTimer = null;
    this._boundResize = null;
  }

  RaindropOverlay.prototype.start = function () {
    if (this._started && this._startPromise) return this._startPromise;

    if (typeof window.RaindropFX !== 'function') {
      return Promise.reject(new Error('RaindropFX is not loaded'));
    }

    setRainyGlassMode(true);

    if (!this._wrapper) this._createOverlay();
    if (this._wrapper && !this._wrapper.parentNode) {
      document.body.appendChild(this._wrapper);
    }

    this._resizeCanvas();
    this._started = true;
    this._bindResize();

    if (!this._fx) {
      this._fx = new window.RaindropFX({
        canvas: this._canvas,
        background: this._backgroundCanvas,
        spawnInterval: [0.06, 0.1],
        spawnSize: [72, 135],
        mistBlurStep: 5,
        dropletsPerSeconds: 1250,
        dropletSize: [9, 28],
        refractBase: 0.48,
        refractScale: 0.76,
        raindropLightBump: 1.15
      });
      this._startPromise = this._fx.start().catch(this._handleStartError.bind(this));
    } else {
      this._startPromise = this._fx.start().catch(this._handleStartError.bind(this));
    }

    return this._startPromise;
  };

  RaindropOverlay.prototype.stop = function () {
    this._started = false;
    this._startPromise = null;
    setRainyGlassMode(false);
    this._unbindResize();
    if (this._fx) {
      try { this._fx.stop(); } catch (e) {}
    }
    this._removeWrapper();
  };

  RaindropOverlay.prototype.destroy = function () {
    this.stop();
    if (this._fx) {
      try { this._fx.destroy(); } catch (e) {}
    }
    this._fx = null;
    this._canvas = null;
    this._backgroundCanvas = null;
    this._wrapper = null;
  };

  RaindropOverlay.prototype._createOverlay = function () {
    var wrapper = document.createElement('div');
    wrapper.className = 'raindrop-overlay raindrop-fx-overlay';
    wrapper.setAttribute('aria-hidden', 'true');

    var canvas = document.createElement('canvas');
    canvas.className = 'raindrop-fx-canvas';
    wrapper.appendChild(canvas);

    this._wrapper = wrapper;
    this._canvas = canvas;
    this._backgroundCanvas = document.createElement('canvas');
  };

  RaindropOverlay.prototype._resizeCanvas = function () {
    if (!this._canvas || !this._backgroundCanvas) return;

    var width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var pixelWidth = Math.max(1, Math.round(width * dpr));
    var pixelHeight = Math.max(1, Math.round(height * dpr));

    if (this._canvas.width !== pixelWidth || this._canvas.height !== pixelHeight) {
      this._canvas.width = pixelWidth;
      this._canvas.height = pixelHeight;
      this._canvas.style.width = width + 'px';
      this._canvas.style.height = height + 'px';
    }

    createMiaositeBackground(this._backgroundCanvas, pixelWidth, pixelHeight, dpr);

    if (this._fx) {
      this._fx.resize(pixelWidth, pixelHeight);
      if (typeof this._fx.setBackground === 'function') {
        this._fx.setBackground(this._backgroundCanvas).catch(function () {});
      }
    }
  };

  RaindropOverlay.prototype._bindResize = function () {
    if (!this._boundResize) this._boundResize = this._onResize.bind(this);
    window.addEventListener('resize', this._boundResize);
    window.addEventListener('orientationchange', this._boundResize);
  };

  RaindropOverlay.prototype._unbindResize = function () {
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
      window.removeEventListener('orientationchange', this._boundResize);
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
  };

  RaindropOverlay.prototype._onResize = function () {
    var self = this;
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(function () {
      self._resizeCanvas();
    }, 120);
  };

  RaindropOverlay.prototype._removeWrapper = function () {
    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
  };

  RaindropOverlay.prototype._handleStartError = function (err) {
    console.warn('[RaindropOverlay] RaindropFX start failed:', err && err.message ? err.message : err);
    this.destroy();
    throw err;
  };

  function setRainyGlassMode(enabled) {
    var root = document.documentElement;
    if (root) root.classList.toggle('miaosite-rainy-glass', !!enabled);
    if (document.body) document.body.classList.toggle('miaosite-rainy-glass', !!enabled);
  }

  function createMiaositeBackground(canvas, width, height, dpr) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    var ctx = canvas.getContext('2d');
    var vw = width / dpr;
    var vh = height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    var base = ctx.createLinearGradient(0, 0, vw, vh);
    base.addColorStop(0, '#9bb8c2');
    base.addColorStop(0.22, '#7ea2af');
    base.addColorStop(0.52, '#557987');
    base.addColorStop(0.76, '#263f4c');
    base.addColorStop(1, '#102530');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, vw, vh);

    drawWindowSilhouettes(ctx, vw, vh);
    drawRadial(ctx, vw * 0.5, vh * 0.18, Math.max(vw, vh) * 0.48, 'rgba(196,225,232,0.34)', 'rgba(196,225,232,0)');
    drawRadial(ctx, vw * 0.44, vh * 0.5, Math.max(vw, vh) * 0.36, 'rgba(135,184,200,0.20)', 'rgba(135,184,200,0)');
    drawRadial(ctx, vw * 1.05, vh * 0.2, Math.max(vw, vh) * 0.4, 'rgba(190,220,228,0.22)', 'rgba(190,220,228,0)');
    drawRadial(ctx, -vw * 0.04, vh * 0.7, Math.max(vw, vh) * 0.36, 'rgba(10,25,34,0.38)', 'rgba(10,25,34,0)');

    drawRainCurtain(ctx, vw, vh);
    drawMistedGlass(ctx, vw, vh);
    drawGlassBloom(ctx, vw, vh);
    drawNoise(ctx, vw, vh);
  }

  function drawRadial(ctx, x, y, radius, inner, outer) {
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function drawGrid(ctx, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    var spacing = 40;
    for (var x = -height; x < width + height; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }
    for (var y = 0; y < width + height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(y, 0);
      ctx.lineTo(y - height, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWindowSilhouettes(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var blocks = [
      [-0.04, 0.0, 0.22, 0.96, 0.45],
      [0.19, 0.28, 0.1, 0.58, 0.18],
      [0.33, 0.38, 0.08, 0.5, 0.15],
      [0.49, 0.2, 0.06, 0.72, 0.18],
      [0.62, 0.16, 0.08, 0.76, 0.18],
      [0.82, 0.0, 0.22, 0.98, 0.42]
    ];

    for (var i = 0; i < blocks.length; i += 1) {
      var b = blocks[i];
      var x = width * b[0];
      var y = height * b[1];
      var w = width * b[2];
      var h = height * b[3];
      var alpha = b[4];
      var gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, 'rgba(7,20,29,' + (alpha * 0.92) + ')');
      gradient.addColorStop(0.5, 'rgba(13,35,46,' + alpha + ')');
      gradient.addColorStop(1, 'rgba(38,70,82,' + (alpha * 0.5) + ')');
      ctx.fillStyle = gradient;
      roundedRect(ctx, x, y, w, h, Math.max(28, width * 0.025));
      ctx.fill();
    }

    var lower = ctx.createLinearGradient(0, height * 0.58, 0, height);
    lower.addColorStop(0, 'rgba(20,43,54,0)');
    lower.addColorStop(0.28, 'rgba(12,29,39,0.34)');
    lower.addColorStop(1, 'rgba(2,14,22,0.62)');
    ctx.fillStyle = lower;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);
    ctx.restore();
  }

  function drawRainCurtain(ctx, width, height) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'multiply';

    var spacing = 14;
    for (var x = -20; x < width + 30; x += spacing) {
      var seed = pseudoRandom(x * 18.137);
      var alpha = 0.08 + seed * 0.13;
      var tilt = -5 + seed * 10;
      var lineWidth = 1.4 + seed * 3.2;
      var offset = pseudoRandom(x * 5.331) * 90;
      var gradient = ctx.createLinearGradient(x, 0, x + tilt, height);
      gradient.addColorStop(0, 'rgba(25,48,58,0)');
      gradient.addColorStop(0.18, 'rgba(19,45,58,' + alpha + ')');
      gradient.addColorStop(0.55, 'rgba(9,28,40,' + (alpha * 1.15) + ')');
      gradient.addColorStop(1, 'rgba(8,20,29,0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, -offset);
      ctx.lineTo(x + tilt, height + offset * 0.4);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < 90; i += 1) {
      var px = pseudoRandom(i * 47.71) * width;
      var py = pseudoRandom(i * 91.13) * height;
      var len = 120 + pseudoRandom(i * 13.9) * 460;
      var glowAlpha = 0.06 + pseudoRandom(i * 3.77) * 0.1;
      var glow = ctx.createLinearGradient(px, py, px + 5, py + len);
      glow.addColorStop(0, 'rgba(255,255,255,0)');
      glow.addColorStop(0.18, 'rgba(216,240,247,' + glowAlpha + ')');
      glow.addColorStop(0.72, 'rgba(84,128,143,' + (glowAlpha * 0.66) + ')');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.6 + pseudoRandom(i * 8.21) * 3.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 5, py + len);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMistedGlass(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.2;
    for (var y = 0; y < height; y += 18) {
      var alpha = 0.05 + pseudoRandom(y * 2.11) * 0.045;
      ctx.fillStyle = 'rgba(185,215,224,' + alpha + ')';
      ctx.fillRect(0, y, width, 9 + pseudoRandom(y * 7.13) * 18);
    }

    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    for (var i = 0; i < 48; i += 1) {
      var x = pseudoRandom(i * 17.9) * width;
      var h = 70 + pseudoRandom(i * 6.29) * 250;
      var y0 = pseudoRandom(i * 31.43) * height;
      var a = 0.03 + pseudoRandom(i * 3.19) * 0.045;
      var trail = ctx.createLinearGradient(x, y0, x + 2, y0 + h);
      trail.addColorStop(0, 'rgba(6,18,26,0)');
      trail.addColorStop(0.22, 'rgba(6,18,26,' + a + ')');
      trail.addColorStop(1, 'rgba(6,18,26,0)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = 8 + pseudoRandom(i * 2.71) * 24;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 2, y0 + h);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGlassBloom(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawRadial(ctx, width * 0.48, height * 0.18, Math.max(width, height) * 0.36, 'rgba(220,246,252,0.22)', 'rgba(220,246,252,0)');
    drawRadial(ctx, width * 0.9, height * 0.74, Math.max(width, height) * 0.24, 'rgba(150,194,208,0.15)', 'rgba(150,194,208,0)');
    drawRadial(ctx, width * 0.64, height * 0.95, Math.max(width, height) * 0.26, 'rgba(88,138,154,0.16)', 'rgba(88,138,154,0)');
    ctx.restore();
  }

  function drawNoise(ctx, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.fillStyle = '#061823';
    var step = 7;
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        if (pseudoRandom(x * 12.9898 + y * 78.233) > 0.66) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.restore();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function pseudoRandom(seed) {
    var x = Math.sin(seed) * 43758.5453123;
    return x - Math.floor(x);
  }

  window.RaindropOverlay = RaindropOverlay;
})();
