/**
 * 天气状态共享模块 — 用于跨页面雨滴效果同步
 * 暴露: window.WeatherState = { isRainyIcon, getRainState, setRainState }
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'miaosite_weather_rainy';
  var STORAGE_TIME_KEY = 'miaosite_weather_rainy_ts';
  var CACHE_TTL = 30 * 60 * 1000; // 30 分钟

  // ===== QWeather iconCode → 雨天判断 =====
  // 300-318: 阵雨/雷雨/小雨/中雨/大雨/暴雨/冻雨
  // 350-351: 阵雨 (夜间)
  // 399: 中雨
  // 313: 冻雨
  // 404-405: 雨夹雪
  function isRainyIcon(code) {
    var c = parseInt(code, 10);
    if (isNaN(c)) return false;
    return (c >= 300 && c <= 318) ||
           (c >= 350 && c <= 351) ||
           c === 399 ||
           c === 313 ||
           (c >= 404 && c <= 405);
  }

  function getRainState() {
    try {
      var cached = localStorage.getItem(STORAGE_KEY);
      var ts = parseInt(localStorage.getItem(STORAGE_TIME_KEY), 10);
      if (cached !== null && ts && (Date.now() - ts < CACHE_TTL)) {
        return cached === 'true';
      }
    } catch (e) {
      // localStorage 不可用
    }
    return null; // 无缓存或已过期
  }

  function setRainState(isRainy) {
    try {
      localStorage.setItem(STORAGE_KEY, isRainy ? 'true' : 'false');
      localStorage.setItem(STORAGE_TIME_KEY, String(Date.now()));
    } catch (e) {
      // localStorage 不可用
    }
  }

  // ===== 暴露全局 =====
  window.WeatherState = {
    isRainyIcon: isRainyIcon,
    getRainState: getRainState,
    setRainState: setRainState
  };
})();
