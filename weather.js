/**
 * weather.js — Cambodia Rain 8888 Pro V3
 * Weather Engine: Open-Meteo API Integration
 * Handles fetching, parsing, and exposing weather data
 * MR TP AI Weather Intelligence Center
 */

'use strict';

const Weather = (() => {

  /* ── CONFIG ─────────────────────────────────────────── */
  const API_BASE = 'https://api.open-meteo.com/v1/forecast';

  const CURRENT_VARS = [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'precipitation',
    'rain',
    'weather_code',
    'cloud_cover',
    'wind_speed_10m',
    'wind_direction_10m',
    'pressure_msl',
    'dew_point_2m',
    'uv_index'
  ].join(',');

  const HOURLY_VARS = [
    'precipitation_probability',
    'precipitation',
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'weather_code',
    'temperature_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    'pressure_msl'
  ].join(',');

  const DAILY_VARS = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_max',
    'sunrise',
    'sunset'
  ].join(',');

  /* ── WMO CODE MAPPING ───────────────────────────────── */
  const WMO_MAP = {
    0:  { icon: '☀️',  desc: 'Clear Sky' },
    1:  { icon: '🌤️', desc: 'Mainly Clear' },
    2:  { icon: '⛅',  desc: 'Partly Cloudy' },
    3:  { icon: '☁️',  desc: 'Overcast' },
    45: { icon: '🌫️', desc: 'Foggy' },
    48: { icon: '🌫️', desc: 'Icy Fog' },
    51: { icon: '🌦️', desc: 'Light Drizzle' },
    53: { icon: '🌦️', desc: 'Drizzle' },
    55: { icon: '🌧️', desc: 'Heavy Drizzle' },
    56: { icon: '🌧️', desc: 'Freezing Drizzle' },
    57: { icon: '🌧️', desc: 'Heavy Freezing Drizzle' },
    61: { icon: '🌧️', desc: 'Light Rain' },
    63: { icon: '🌧️', desc: 'Rain' },
    65: { icon: '🌧️', desc: 'Heavy Rain' },
    66: { icon: '🌨️', desc: 'Freezing Rain' },
    67: { icon: '🌨️', desc: 'Heavy Freezing Rain' },
    71: { icon: '❄️',  desc: 'Light Snow' },
    73: { icon: '❄️',  desc: 'Snow' },
    75: { icon: '❄️',  desc: 'Heavy Snow' },
    77: { icon: '🌨️', desc: 'Snow Grains' },
    80: { icon: '🌦️', desc: 'Light Showers' },
    81: { icon: '🌧️', desc: 'Showers' },
    82: { icon: '⛈️',  desc: 'Violent Showers' },
    85: { icon: '🌨️', desc: 'Snow Showers' },
    86: { icon: '🌨️', desc: 'Heavy Snow Showers' },
    95: { icon: '⛈️',  desc: 'Thunderstorm' },
    96: { icon: '⛈️',  desc: 'Thunderstorm w/ Hail' },
    99: { icon: '⛈️',  desc: 'Severe Thunderstorm' }
  };

  /* ── DIRECTION MAPPING ──────────────────────────────── */
  const DIR_LABELS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

  /* ── UV LABELS ──────────────────────────────────────── */
  const UV_LABELS = {
    low:      { max: 2,  label: 'Low' },
    moderate: { max: 5,  label: 'Moderate' },
    high:     { max: 7,  label: 'High' },
    vhigh:    { max: 10, label: 'Very High' },
    extreme:  { max: 99, label: 'Extreme' }
  };

  /* ── HELPERS ─────────────────────────────────────────── */

  /**
   * Get WMO icon and description for a weather code
   * Falls back gracefully for unmapped codes
   */
  function getWMO(code) {
    return WMO_MAP[code] || { icon: '🌡️', desc: 'Unknown' };
  }

  /**
   * Convert wind degrees to compass direction (16-point)
   */
  function windDirection(degrees) {
    const idx = Math.round((degrees % 360) / 22.5) % 16;
    return DIR_LABELS[idx];
  }

  /**
   * Get UV label
   */
  function uvLabel(index) {
    if (index <= 2)  return 'Low';
    if (index <= 5)  return 'Moderate';
    if (index <= 7)  return 'High';
    if (index <= 10) return 'Very High';
    return 'Extreme';
  }

  /**
   * Format ISO time string to HH:MM in Phnom Penh timezone
   */
  function formatTime(isoString) {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Phnom_Penh'
    });
  }

  /**
   * Find the current hourly index from time array
   */
  function getCurrentHourIndex(timeArray) {
    const nowPrefix = new Date().toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
    const idx = timeArray.findIndex(t => t.startsWith(nowPrefix));
    return idx < 0 ? 0 : idx;
  }

  /**
   * Safely get value from array at index, with fallback
   */
  function safeGet(arr, idx, fallback = 0) {
    if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return fallback;
    return arr[idx] ?? fallback;
  }

  /**
   * Sum values from hourly array for a range of hours
   */
  function sumHours(arr, startIdx, hours) {
    let total = 0;
    const end = Math.min(startIdx + hours, arr.length);
    for (let i = startIdx; i < end; i++) {
      total += (arr[i] || 0);
    }
    return parseFloat(total.toFixed(2));
  }

  /* ── MAIN FETCH ──────────────────────────────────────── */

  /**
   * Fetch current weather + hourly + daily data from Open-Meteo
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} Parsed weather data
   */
  async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: CURRENT_VARS,
      hourly: HOURLY_VARS,
      daily: DAILY_VARS,
      timezone: 'Asia/Bangkok',
      forecast_days: 7,
      wind_speed_unit: 'kmh'
    });

    const url = `${API_BASE}?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status}`);
      }

      const raw = await response.json();
      return parseWeatherData(raw);

    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Weather request timed out. Check your connection.');
      }
      throw err;
    }
  }

  /**
   * Fetch minimal weather for a geographic point (used by compass scan)
   * Returns only current + next 3 hours
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<Object>}
   */
  async function fetchPointWeather(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: 'weather_code,cloud_cover,rain,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'precipitation_probability,weather_code,cloud_cover',
      timezone: 'Asia/Bangkok',
      wind_speed_unit: 'kmh',
      forecast_days: 1
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${API_BASE}?${params}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`API ${response.status}`);

      const raw = await response.json();
      const hourlyIdx = getCurrentHourIndex(raw.hourly?.time || []);

      const windDeg = raw.current?.wind_direction_10m ?? 0;

      return {
        rainProb: safeGet(raw.hourly?.precipitation_probability, hourlyIdx),
        weatherCode: raw.current?.weather_code || 0,
        cloudCover: raw.current?.cloud_cover || 0,
        rain: raw.current?.rain || 0,
        humidity: raw.current?.relative_humidity_2m || 0,
        windSpeed: raw.current?.wind_speed_10m ?? 0,
        windGust: raw.current?.wind_gusts_10m ?? 0,
        windDeg: windDeg,
        windDir: windDirection(windDeg)
      };

    } catch (err) {
      clearTimeout(timeout);
      // Return neutral data on failure (don't crash compass)
      return { rainProb: 0, weatherCode: 0, cloudCover: 0, rain: 0, humidity: 0, windSpeed: 0, windGust: 0, windDeg: 0, windDir: 'N' };
    }
  }

  /* ── PARSE & STRUCTURE DATA ──────────────────────────── */

  /**
   * Parse raw Open-Meteo response into a clean structured object
   */
  function parseWeatherData(raw) {
    const c = raw.current || {};
    const h = raw.hourly || {};
    const d = raw.daily || {};

    const hourlyIdx = getCurrentHourIndex(h.time || []);

    // Current conditions
    const current = {
      temp:         c.temperature_2m ?? null,
      feelsLike:    c.apparent_temperature ?? null,
      humidity:     c.relative_humidity_2m ?? null,
      precipitation: c.precipitation ?? 0,
      rain:         c.rain ?? 0,
      weatherCode:  c.weather_code ?? 0,
      cloudCover:   c.cloud_cover ?? 0,
      windSpeed:    c.wind_speed_10m ?? 0,
      windDeg:      c.wind_direction_10m ?? 0,
      windDir:      windDirection(c.wind_direction_10m ?? 0),
      pressure:     Math.round(c.pressure_msl ?? 0),
      dewPoint:     c.dew_point_2m ?? null,
      uvIndex:      c.uv_index ?? 0,
      uvLabel:      uvLabel(c.uv_index ?? 0),
      wmo:          getWMO(c.weather_code ?? 0)
    };

    // Hourly arrays (trimmed to future hours)
    const hourlyCount = Math.min(24, (h.time || []).length - hourlyIdx);
    const hourly = {
      startIdx: hourlyIdx,
      times:         (h.time || []).slice(hourlyIdx, hourlyIdx + 24),
      rainProb:      (h.precipitation_probability || []).slice(hourlyIdx, hourlyIdx + 24),
      precipitation: (h.precipitation || []).slice(hourlyIdx, hourlyIdx + 24),
      cloudCover:    (h.cloud_cover || []).slice(hourlyIdx, hourlyIdx + 24),
      cloudLow:      (h.cloud_cover_low || []).slice(hourlyIdx, hourlyIdx + 24),
      cloudMid:      (h.cloud_cover_mid || []).slice(hourlyIdx, hourlyIdx + 24),
      cloudHigh:     (h.cloud_cover_high || []).slice(hourlyIdx, hourlyIdx + 24),
      weatherCodes:  (h.weather_code || []).slice(hourlyIdx, hourlyIdx + 24)
    };

    // Cloud layer snapshots at current hour
    const clouds = {
      total: current.cloudCover,
      low:   safeGet(h.cloud_cover_low, hourlyIdx),
      mid:   safeGet(h.cloud_cover_mid, hourlyIdx),
      high:  safeGet(h.cloud_cover_high, hourlyIdx)
    };

    // Daily data (7 days)
    const daily = {
      times:     d.time || [],
      weatherCodes: d.weather_code || [],
      tempMax:   d.temperature_2m_max || [],
      tempMin:   d.temperature_2m_min || [],
      rainSum:   d.precipitation_sum || [],
      rainProb:  d.precipitation_probability_max || [],
      sunrise:   d.sunrise || [],
      sunset:    d.sunset || []
    };

    // Today summary
    const today = {
      tempMax:  daily.tempMax[0] ?? null,
      tempMin:  daily.tempMin[0] ?? null,
      rainSum:  daily.rainSum[0] ?? 0,
      sunrise:  formatTime(daily.sunrise[0]),
      sunset:   formatTime(daily.sunset[0]),
      wmo:      getWMO(daily.weatherCodes[0] ?? 0)
    };

    // Rain stats
    const rain = {
      now:    current.rain,
      precip1h: current.precipitation,
      total24h: sumHours(h.precipitation || [], hourlyIdx, 24)
    };

    return {
      raw, current, hourly, clouds, daily, today, rain,
      // Utility functions exposed for consumers
      formatTime,
      getWMO,
      windDirection
    };
  }

  /* ── AI CONFIDENCE ENGINE ────────────────────────────── */

  /**
   * Calculate AI Rain Confidence Score (0–100%)
   * Weighted combination of 6 meteorological factors
   *
   * @param {Object} current - Current weather data
   * @param {number} rainProb - Hourly rain probability (0–100)
   * @param {number} activeSectors - Number of active rain sectors from compass
   * @returns {Object} Detailed scoring breakdown
   */
  function calculateConfidence(current, rainProb, activeSectors = 0) {
    const scores = {};

    // Factor 1: Cloud Cover (max 20 points)
    const cc = current.cloudCover || 0;
    scores.cloud = cc >= 85 ? 20 : cc >= 70 ? 16 : cc >= 50 ? 11 : cc >= 30 ? 6 : 2;

    // Factor 2: Rain Forecast Probability (max 30 points)
    const rp = rainProb || 0;
    scores.rain = rp >= 80 ? 30 : rp >= 60 ? 24 : rp >= 40 ? 17 : rp >= 20 ? 9 : 2;

    // Factor 3: Humidity (max 20 points)
    const hu = current.humidity || 0;
    scores.humidity = hu >= 90 ? 20 : hu >= 80 ? 16 : hu >= 70 ? 11 : hu >= 60 ? 6 : 2;

    // Factor 4: Pressure Trend (max 15 points)
    // Low pressure = higher rain risk. Cambodia avg ~1010 hPa
    const pr = current.pressure || 1010;
    scores.pressure = pr <= 1005 ? 15 : pr <= 1008 ? 11 : pr <= 1011 ? 7 : pr <= 1014 ? 4 : 1;

    // Factor 5: Wind Speed (max 10 points)
    // Moderate wind often brings rain systems
    const ws = current.windSpeed || 0;
    scores.wind = ws >= 30 ? 10 : ws >= 20 ? 8 : ws >= 10 ? 5 : ws >= 5 ? 3 : 1;

    // Factor 6: Active Sectors (max 5 points bonus)
    // More sectors with active weather = higher regional risk
    scores.sectors = Math.min(5, activeSectors * 0.5);

    // Raw total
    const rawTotal = scores.cloud + scores.rain + scores.humidity +
                     scores.pressure + scores.wind + scores.sectors;

    // WMO code override — thunderstorm codes push score up
    const wmoCode = current.weatherCode || 0;
    let bonus = 0;
    if (wmoCode >= 95) bonus = 20;
    else if (wmoCode >= 80) bonus = 15;
    else if (wmoCode >= 61) bonus = 10;
    else if (wmoCode >= 51) bonus = 5;

    let total = Math.min(100, rawTotal + bonus);

    // Reality check: don't let humidity/cloud/forecast alone claim HIGH RISK
    // if no rain is actually falling right now at this location.
    const actualRainNow = current.precipitation || 0;
    if (actualRainNow === 0) {
      total = Math.min(total, 55);
    } else if (actualRainNow > 0 && actualRainNow < 0.5) {
      total = Math.max(total, 60);
    }

    // Risk level
    let level, label, color;
    if (total <= 40) {
      level = 'low';
      label = 'LOW RISK';
      color = 'var(--risk-low)';
    } else if (total <= 70) {
      level = 'medium';
      label = 'MEDIUM RISK';
      color = 'var(--risk-medium)';
    } else {
      level = 'high';
      label = 'HIGH RISK';
      color = 'var(--risk-high)';
    }

    // ETA estimate
    let eta = '';
    if (total >= 71) {
      eta = '⚠️ Rain likely within 1–2 hours. Seek shelter immediately.';
    } else if (total >= 51) {
      eta = '🌤️ Rain possible within 2–4 hours. Stay alert.';
    } else if (total >= 31) {
      eta = '⛅ Low chance of rain. Monitor conditions.';
    } else {
      eta = '☀️ Clear conditions expected. Enjoy the day!';
    }

    return {
      total,
      level,
      label,
      color,
      eta,
      scores,
      maxScores: { cloud: 20, rain: 30, humidity: 20, pressure: 15, wind: 10, sectors: 5 },
      percents: {
        cloud:    Math.round((scores.cloud    / 20) * 100),
        rain:     Math.round((scores.rain     / 30) * 100),
        humidity: Math.round((scores.humidity / 20) * 100),
        pressure: Math.round((scores.pressure / 15) * 100),
        wind:     Math.round((scores.wind     / 10) * 100),
        sectors:  Math.min(100, Math.round((scores.sectors / 5) * 100))
      }
    };
  }

  /**
   * Generate AI natural-language report
   */
  function generateReport(weather, confidence, city = 'Phnom Penh') {
    const c = weather.current;
    const wmo = c.wmo;
    const risk = confidence.level.toUpperCase();
    const rainProb = weather.hourly.rainProb[0] || 0;

    const lines = [
      `📊 AI Weather Analysis — ${city}`,
      `${'─'.repeat(32)}`,
      `Risk Level:       ${confidence.label} (${confidence.total}%)`,
      `Condition:        ${wmo.icon} ${wmo.desc}`,
      `Rain Probability: ${rainProb}%`,
      ``,
      `Factor Breakdown:`,
      `  Cloud Cover:    ${c.cloudCover}%  (${confidence.scores.cloud}/20 pts)`,
      `  Rain Forecast:  ${rainProb}%  (${confidence.scores.rain}/30 pts)`,
      `  Humidity:       ${c.humidity}%  (${confidence.scores.humidity}/20 pts)`,
      `  Pressure:       ${c.pressure} hPa  (${confidence.scores.pressure}/15 pts)`,
      `  Wind Speed:     ${c.windSpeed} km/h  (${confidence.scores.wind}/10 pts)`,
      `  Active Sectors: ${confidence.scores.sectors}/5 pts`,
      ``,
      `${confidence.eta}`
    ];

    return lines.join('\n');
  }

  /**
   * Generate Telegram alert message
   */
  function buildTelegramMessage(weather, confidence, city = 'Phnom Penh') {
    const c = weather.current;
    const wmo = c.wmo;
    const rainProb = weather.hourly.rainProb[0] || 0;
    const ts = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });

    const riskEmoji = confidence.level === 'high' ? '🔴' :
                      confidence.level === 'medium' ? '🟡' : '🟢';

    return [
      `🌦 MR TP AI WEATHER`,
      `📍 ${city}, Cambodia`,
      ``,
      `Regional Cloud Risk Scan`,
      `${riskEmoji} ${confidence.label}`,
      `Confidence: ${confidence.total}%`,
      ``,
      `🌡️ Temp: ${c.temp}°C (Feels ${c.feelsLike}°C)`,
      `💧 Humidity: ${c.humidity}%`,
      `🌧️ Rain Prob: ${rainProb}%`,
      `☁️ Cloud Cover: ${c.cloudCover}%`,
      `📊 Pressure: ${c.pressure} hPa`,
      `🌬️ Wind: ${c.windSpeed} km/h ${c.windDir}`,
      ``,
      `${confidence.eta}`,
      ``,
      `🕐 ${ts} (UTC+7)`,
      `📡 Cambodia Rain 8888 Pro V3`
    ].join('\n');
  }

  /* ── PUBLIC API ──────────────────────────────────────── */
  return {
    fetchWeather,
    fetchPointWeather,
    calculateConfidence,
    generateReport,
    buildTelegramMessage,
    getWMO,
    windDirection,
    formatTime,
    // Expose for testing
    _getCurrentHourIndex: getCurrentHourIndex
  };

})();

// Make available globally
window.Weather = Weather;
