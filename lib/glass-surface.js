/**
 * GlassSurface — vanilla JS port of the React Bits GlassSurface component.
 * Applies SVG displacement-map glass distortion to any container element.
 *
 * Usage:
 *   var gs = new GlassSurface(document.getElementById('my-card'), {
 *       borderRadius: 20, blur: 8, brightness: 0.25,
 *       opacity: 0.15, backgroundOpacity: 0.12,
 *       distortionScale: 3, redOffset: 4, greenOffset: 2, blueOffset: 4
 *   });
 *   // Later: gs.destroy();
 *
 * Browser support:
 *   Chrome / Edge  — full SVG displacement filter via backdrop-filter: url(#filter)
 *   Firefox / Safari — fallback to standard backdrop-filter: blur() + existing CSS
 */

(function () {
  'use strict';

  var _uidCounter = 0;

  /**
   * @constructor
   * @param {HTMLElement} containerEl
   * @param {Object}      [opts]
   */
  function GlassSurface(containerEl, opts) {
    if (!containerEl || containerEl.nodeType !== 1) {
      throw new Error('GlassSurface: containerEl must be a DOM element');
    }

    this._container = containerEl;
    this._svgEl = null;
    this._observer = null;
    this._rafPending = false;
    this._lastW = 0;
    this._lastH = 0;
    this._filterId = '';
    this._destroyed = false;

    /* Resolve options ------------------------------------------------ */
    var o = opts || {};
    this._borderRadius = num(o.borderRadius, 20);
    this._blur = num(o.blur, 8);
    this._brightness = num(o.brightness, 0.25);
    this._opacity = num(o.opacity, 0.15);
    this._backgroundOpacity = num(o.backgroundOpacity, 0.12);
    this._distortionScale = num(o.distortionScale, 3);
    this._redOffset = num(o.redOffset, 4);
    this._greenOffset = num(o.greenOffset, 2);
    this._blueOffset = num(o.blueOffset, 4);
    this._saturation = num(o.saturation, 180);
    this._mixBlendMode = o.mixBlendMode || 'screen';
    this._forceFallback = !!o.forceFallback;

    /* Browser detection ----------------------------------------------- */
    this._useFallback = this._forceFallback || !GlassSurface.supportsSvgBackdropFilter();
    this._reduceMotion = GlassSurface._checkReducedMotion();

    if (this._reduceMotion) {
      this._distortionScale = 0;
      this._redOffset = 0;
      this._greenOffset = 0;
      this._blueOffset = 0;
    }

    /* Unique filter id ------------------------------------------------ */
    _uidCounter += 1;
    this._filterId = 'gs-filter-' + _uidCounter + '-' + Date.now().toString(36);

    /* Inject SVG filter definition ------------------------------------ */
    if (!this._useFallback) {
      this._injectSvgFilter();
    } else {
      containerEl.classList.add('glass-surface-fallback');
    }

    /* Apply backdrop-filter via inline style (overrides CSS) ---------- */
    this._applyBackdrop();

    /* Observe size changes -------------------------------------------- */
    this._setupObserver();

    /* Initial displacement map ---------------------------------------- */
    this._scheduleRebuild();
  }

  /* ===================================================================
   *  Static helpers
   * =================================================================== */

  /**
   * Check whether the current browser supports backdrop-filter: url(#svgFilter).
   * Firefox never supports it. Safari supports url() in backdrop-filter but
   * not when the filter chain contains feImage — so we exclude both.
   */
  GlassSurface.supportsSvgBackdropFilter = function () {
    if (typeof window === 'undefined') return false;

    var ua = navigator.userAgent || '';
    // Firefox
    if (/Firefox/i.test(ua)) return false;
    // Safari (but not Chrome/Edge which also contain "Safari" in UA)
    if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return false;

    return true;
  };

  GlassSurface._checkReducedMotion = function () {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* ===================================================================
   *  Prototype methods
   * =================================================================== */

  /**
   * Inject a hidden <svg> with the filter definition into the container.
   */
  GlassSurface.prototype._injectSvgFilter = function () {
    var self = this;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'glass-surface-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');

    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', this._filterId);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0%');
    filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');

    // feImage — loads the displacement map
    this._feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
    this._feImage.setAttribute('x', '0');
    this._feImage.setAttribute('y', '0');
    this._feImage.setAttribute('width', '100%');
    this._feImage.setAttribute('height', '100%');
    this._feImage.setAttribute('preserveAspectRatio', 'none');
    this._feImage.setAttribute('result', 'map');
    filter.appendChild(this._feImage);

    // --- Red channel ---
    var dispRed = this._makeFeDisplacement('SourceGraphic', 'map', 'dispRed');
    filter.appendChild(dispRed);
    filter.appendChild(this._makeColorMatrix('dispRed', 'red', [
      '1 0 0 0 0',
      '0 0 0 0 0',
      '0 0 0 0 0',
      '0 0 0 1 0'
    ]));

    // --- Green channel ---
    var dispGreen = this._makeFeDisplacement('SourceGraphic', 'map', 'dispGreen');
    filter.appendChild(dispGreen);
    filter.appendChild(this._makeColorMatrix('dispGreen', 'green', [
      '0 0 0 0 0',
      '0 1 0 0 0',
      '0 0 0 0 0',
      '0 0 0 1 0'
    ]));

    // --- Blue channel ---
    var dispBlue = this._makeFeDisplacement('SourceGraphic', 'map', 'dispBlue');
    filter.appendChild(dispBlue);
    filter.appendChild(this._makeColorMatrix('dispBlue', 'blue', [
      '0 0 0 0 0',
      '0 0 0 0 0',
      '0 0 1 0 0',
      '0 0 0 1 0'
    ]));

    // Blend: red + green → rg, then rg + blue → output
    var blendRG = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    blendRG.setAttribute('in', 'red');
    blendRG.setAttribute('in2', 'green');
    blendRG.setAttribute('mode', 'screen');
    blendRG.setAttribute('result', 'rg');
    filter.appendChild(blendRG);

    var blendOut = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    blendOut.setAttribute('in', 'rg');
    blendOut.setAttribute('in2', 'blue');
    blendOut.setAttribute('mode', 'screen');
    blendOut.setAttribute('result', 'output');
    filter.appendChild(blendOut);

    // Output blur
    this._feBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    this._feBlur.setAttribute('in', 'output');
    this._feBlur.setAttribute('stdDeviation', '0');
    filter.appendChild(this._feBlur);

    defs.appendChild(filter);
    svg.appendChild(defs);

    // Insert as first child of container so it exists before content layers
    this._container.insertBefore(svg, this._container.firstChild);
    this._svgEl = svg;

    // Cache refs to the three feDisplacementMap elements for later updates
    this._redDisp = dispRed;
    this._greenDisp = dispGreen;
    this._blueDisp = dispBlue;
  };

  GlassSurface.prototype._makeFeDisplacement = function (in1, in2, result) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    el.setAttribute('in', in1);
    el.setAttribute('in2', in2);
    el.setAttribute('result', result);
    return el;
  };

  GlassSurface.prototype._makeColorMatrix = function (inName, result, valuesArr) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    el.setAttribute('in', inName);
    el.setAttribute('type', 'matrix');
    el.setAttribute('values', valuesArr.join(' '));
    el.setAttribute('result', result);
    return el;
  };

  /**
   * Build the displacement map as a data: URI SVG.
   */
  GlassSurface.prototype._buildDisplacementMap = function (w, h) {
    var br = this._borderRadius;
    var brightness = this._brightness;
    var blur = this._blur;
    var opacity = this._opacity;
    var mixBM = this._mixBlendMode;

    // Clamp dimensions to avoid rendering artifacts
    w = Math.max(w, 50);
    h = Math.max(h, 100);

    var innerBlur = (blur * 0.5).toFixed(1);
    var edgeSize = Math.min(w, h) * 0.01;

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' +
      '  <defs>' +
      '    <linearGradient id="g-r" x1="100%" y1="0%" x2="0%" y2="0%">' +
      '      <stop offset="0%" stop-color="red" stop-opacity="0.12"/>' +
      '      <stop offset="100%" stop-color="#000" stop-opacity="0"/>' +
      '    </linearGradient>' +
      '    <linearGradient id="g-b" x1="0%" y1="100%" x2="0%" y2="0%">' +
      '      <stop offset="0%" stop-color="blue" stop-opacity="0.12"/>' +
      '      <stop offset="100%" stop-color="#000" stop-opacity="0"/>' +
      '    </linearGradient>' +
      '    <filter id="f-blur">' +
      '      <feGaussianBlur stdDeviation="' + innerBlur + '"/>' +
      '    </filter>' +
      '  </defs>' +
      '  <rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#000" rx="' + br + '"/>' +
      '  <rect x="' + edgeSize + '" y="' + edgeSize + '" width="' + (w - edgeSize * 2) + '" height="' + (h - edgeSize * 2) + '" fill="url(#g-r)" rx="' + br + '"/>' +
      '  <rect x="' + edgeSize + '" y="' + edgeSize + '" width="' + (w - edgeSize * 2) + '" height="' + (h - edgeSize * 2) + '" fill="url(#g-b)" rx="' + br + '" style="mix-blend-mode:' + mixBM + '"/>' +
      '  <rect x="0" y="0" width="' + w + '" height="' + h + '" fill="hsl(0 0% ' + (brightness * 100).toFixed(0) + '% / ' + opacity + ')" rx="' + br + '" filter="url(#f-blur)"/>' +
      '</svg>';

    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };

  /**
   * Set the href on feImage to the current displacement map.
   */
  GlassSurface.prototype._updateDisplacementMap = function () {
    if (this._useFallback || !this._feImage) return;

    var rect = this._container.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);

    if (w <= 0 || h <= 0) return;

    this._lastW = w;
    this._lastH = h;

    var dataUri = this._buildDisplacementMap(w, h);
    this._feImage.setAttribute('href', dataUri);

    // Update displacement scales
    var ds = this._distortionScale;
    if (this._redDisp) {
      this._redDisp.setAttribute('scale', String(ds + this._redOffset));
      this._redDisp.setAttribute('xChannelSelector', 'R');
      this._redDisp.setAttribute('yChannelSelector', 'R');
    }
    if (this._greenDisp) {
      this._greenDisp.setAttribute('scale', String(ds + this._greenOffset));
      this._greenDisp.setAttribute('xChannelSelector', 'G');
      this._greenDisp.setAttribute('yChannelSelector', 'G');
    }
    if (this._blueDisp) {
      this._blueDisp.setAttribute('scale', String(ds + this._blueOffset));
      this._blueDisp.setAttribute('xChannelSelector', 'B');
      this._blueDisp.setAttribute('yChannelSelector', 'B');
    }

    // Output blur
    if (this._feBlur) {
      this._feBlur.setAttribute('stdDeviation', '0');
    }
  };

  /**
   * Apply backdrop-filter via inline style.
   */
  GlassSurface.prototype._applyBackdrop = function () {
    if (this._useFallback) return;

    var saturateVal = (this._saturation / 100).toFixed(2);
    var filterVal = 'url(#' + this._filterId + ') saturate(' + saturateVal + ')';
    this._container.style.backdropFilter = filterVal;
    this._container.style.webkitBackdropFilter = filterVal;
  };

  /**
   * Set up ResizeObserver to regenerate the displacement map on size change.
   */
  GlassSurface.prototype._setupObserver = function () {
    var self = this;
    if (typeof ResizeObserver === 'undefined') return;

    this._observer = new ResizeObserver(function () {
      self._scheduleRebuild();
    });

    this._observer.observe(this._container);
  };

  /**
   * Debounced rebuild via rAF.
   */
  GlassSurface.prototype._scheduleRebuild = function () {
    if (this._destroyed) return;
    var self = this;
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(function () {
      self._rafPending = false;
      if (self._destroyed) return;
      self._updateDisplacementMap();
    });
  };

  /**
   * Public: force a rebuild of the displacement map.
   */
  GlassSurface.prototype.rebuild = function () {
    this._updateDisplacementMap();
  };

  /**
   * Public: tear down the GlassSurface instance.
   */
  GlassSurface.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;

    // Disconnect ResizeObserver
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    // Remove injected SVG
    if (this._svgEl && this._svgEl.parentNode) {
      this._svgEl.parentNode.removeChild(this._svgEl);
      this._svgEl = null;
    }

    // Clear inline backdrop-filter
    this._container.style.backdropFilter = '';
    this._container.style.webkitBackdropFilter = '';
    this._container.classList.remove('glass-surface-fallback');

    this._feImage = null;
    this._feBlur = null;
    this._redDisp = null;
    this._greenDisp = null;
    this._blueDisp = null;
  };

  /* ===================================================================
   *  Export
   * =================================================================== */
  window.GlassSurface = GlassSurface;

  /* ---- tiny helpers ---- */
  function num(v, fallback) {
    var n = Number(v);
    return isNaN(n) ? fallback : n;
  }
})();
