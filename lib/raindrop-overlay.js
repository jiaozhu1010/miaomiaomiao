/**
 * 雨滴覆盖层模块 — 全站雨天视觉效果
 * 依赖: lib/raindrop-fx.js (RaindropFX 全局构造函数, 2D Canvas 版本)
 * 暴露: window.RaindropOverlay
 */
(function () {
  'use strict';

  function RaindropOverlay() {
    this._canvas = null;
    this._wrapper = null;
    this._fx = null;
    this._started = false;
    this._resizeTimer = null;
  }

  RaindropOverlay.prototype._createCanvas = function () {
    var wrapper = document.createElement('div');
    wrapper.className = 'raindrop-overlay';

    var canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    wrapper.appendChild(canvas);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    this._canvas = canvas;
    this._wrapper = wrapper;
  };

  RaindropOverlay.prototype.start = function () {
    if (this._started) return;
    if (!this._canvas) this._createCanvas();
    if (this._wrapper && !this._wrapper.parentNode) {
      document.body.appendChild(this._wrapper);
    }

    if (typeof RaindropFX === 'undefined') {
      console.warn('[RaindropOverlay] RaindropFX 未加载~');
      return;
    }

    try {
      // ★ 不传 background — canvas 透明底, 雨滴直接画在透明画布上
      this._fx = new RaindropFX({
        canvas: this._canvas,
        spawnInterval: [0.06, 0.12],
        spawnSize: [35, 70],
        spawnLimit: 1500,
        gravity: 2000,
        mist: false,
        dropletsPerSeconds: 300,
        backgroundBlurSteps: 0
      });
    } catch (err) {
      console.warn('[RaindropOverlay] 构造失败:', err.message);
      this._cleanup();
      return;
    }

    try {
      this._fx.start();
      this._started = true;
    } catch (err) {
      console.warn('[RaindropOverlay] start() 失败:', err.message);
      this._cleanup();
      return;
    }

    // ★ 启动后: 用 post-processing 让暗像素变透明
    this._startPostProcess();
    this._bindResize();
  };

  // 每帧后处理: 把暗色像素 alpha 归零 (黑底变透明)
  RaindropOverlay.prototype._startPostProcess = function () {
    var self = this;
    var canvas = this._canvas;
    var ctx = canvas.getContext('2d');

    function processFrame() {
      if (!self._started) return;
      try {
        var w = canvas.width, h = canvas.height;
        if (w === 0 || h === 0) { requestAnimationFrame(processFrame); return; }
        var imageData = ctx.getImageData(0, 0, w, h);
        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
          // 亮度 = RGB 平均值; < 阈值则设 alpha=0 (透明)
          var brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (brightness < 25) {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        // canvas 可能已被清理
      }
      requestAnimationFrame(processFrame);
    }

    requestAnimationFrame(processFrame);
  };

  RaindropOverlay.prototype.stop = function () {
    this._started = false; // ★ 先关标志, 停止 postProcess 循环
    this._unbindResize();
    if (this._fx) { try { this._fx.stop(); } catch (e) {} }
    this._removeWrapper();
  };

  RaindropOverlay.prototype.destroy = function () {
    this.stop();
    if (this._fx) { try { this._fx.destroy(); } catch (e) {} this._fx = null; }
    this._canvas = null; this._wrapper = null;
  };

  RaindropOverlay.prototype._updateCanvasSize = function () {
    if (!this._canvas || !this._fx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    if (this._canvas.width !== w * dpr || this._canvas.height !== h * dpr) {
      this._canvas.width = w * dpr; this._canvas.height = h * dpr;
      try {
        if (typeof this._fx.resize === 'function') this._fx.resize(w * dpr, h * dpr);
        else if (typeof this._fx._resize === 'function') this._fx._resize(w * dpr, h * dpr);
      } catch (e) {}
    }
  };

  RaindropOverlay.prototype._onResize = function () {
    var self = this;
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(function () { self._updateCanvasSize(); }, 150);
  };

  RaindropOverlay.prototype._bindResize = function () {
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  };

  RaindropOverlay.prototype._unbindResize = function () {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
    }
    if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = null; }
  };

  RaindropOverlay.prototype._removeWrapper = function () {
    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
  };

  RaindropOverlay.prototype._cleanup = function () {
    this._removeWrapper();
    this._fx = null;
    this._started = false;
  };

  window.RaindropOverlay = RaindropOverlay;
})();
