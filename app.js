/**
 * app.js — Cambodia Rain 8888 Pro V3
 * Main Application Controller
 * Coordinates weather data, UI rendering, radar, compass, and Telegram
 * MR TP AI Weather Intelligence Center
 */

'use strict';

const App = (() => {

  /* ══════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════ */
  const CONFIG = {
    HOME_LAT:  11.5641,
    HOME_LON:  104.9161,
    HOME_CITY: 'Phnom Penh',
    TZ:        'Asia/Phnom_Penh',
    REFRESH_MS: 5 * 60 * 1000,  // 5 minutes
    RADAR_UPDATE_MS: 10 * 60 * 1000 // 10 minutes
  };

  /* ══════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════ */
  const state = {
    lat:  CONFIG.HOME_LAT,
    lon:  CONFIG.HOME_LON,
    city: CONFIG.HOME_CITY,
    lang: 'en',
    weatherData:    null,
    confidenceData: null,
    compassData:    [],
    windCompassData: [],
    activeSectors:  0,
    refreshTimer:   null,
    tgTimer:        null,
    mapObj:         null,
    radarLayer:     null,
    circleLayer:    null,
    currentMapLayer: 'rain'
  };

  /* ══════════════════════════════════════════════════════
     CLOCK
  ══════════════════════════════════════════════════════ */
  function startClock() {
    const el = document.getElementById('sidebar-clock');
    if (!el) return;

    function tick() {
      el.textContent = new Date().toLocaleTimeString('en-GB', {
        timeZone: CONFIG.TZ,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ══════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════ */
  const PAGE_TITLES = {
    dashboard: 'Dashboard',
    compass:   'Storm Compass Pro',
    wind:      'Wind Compass Pro',
    forecast:  'AI Forecast',
    radar:     'Live Radar',
    rain:      'Rain Analysis',
    clouds:    'Cloud Tracker',
    telegram:  'Alerts',
    settings:  'Settings'
  };

  function showPage(name) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target
    const page = document.getElementById(`page-${name}`);
    if (page) page.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === name);
    });

    // Update title
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[name] || name;

    // Page-specific init
    if (name === 'radar') {
      setTimeout(initRadar, 80);
    }
    if (name === 'compass') {
      // Only auto-scan if no data yet
      if (state.compassData.length === 0) {
        runCompassScan();
      } else {
        // Redraw from cached data
        StormCompass.drawCompass(
          document.getElementById('compass-canvas'),
          state.compassData
        );
      }
    }
    if (name === 'wind') {
      if (state.windCompassData.length === 0) {
        runWindCompassScan();
      } else {
        WindCompass.drawCompass(
          document.getElementById('wind-canvas'),
          state.windCompassData,
          state.city
        );
      }
    }
    if (name === 'telegram' && state.weatherData) {
      updateTelegramPreview();
    }

    // Close sidebar on mobile
    closeSidebar();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }

  /* ══════════════════════════════════════════════════════
     LANGUAGE
  ══════════════════════════════════════════════════════ */
  function setLang(lang) {
    state.lang = lang;

    // Toggle EN/KH elements
    document.querySelectorAll('.en').forEach(el => {
      el.style.display = lang === 'en' ? '' : 'none';
    });
    document.querySelectorAll('.kh').forEach(el => {
      el.style.display = lang === 'kh' ? '' : 'none';
    });

    // Toggle lang buttons
    document.getElementById('btn-lang-en')?.classList.toggle('active', lang === 'en');
    document.getElementById('btn-lang-kh')?.classList.toggle('active', lang === 'kh');

    // Sync settings select
    const sLang = document.getElementById('s-lang');
    if (sLang) sLang.value = lang;

    // Body font for Khmer
    document.body.style.fontFamily = lang === 'kh'
      ? "'Noto Sans Khmer', 'Inter', sans-serif"
      : "'Inter', sans-serif";
  }

  /* ══════════════════════════════════════════════════════
     PROVINCE
  ══════════════════════════════════════════════════════ */
  function changeProvince() {
    const sel = document.getElementById('province-select');
    if (!sel) return;

    const [lat, lon, city] = sel.value.split(',');
    state.lat  = parseFloat(lat);
    state.lon  = parseFloat(lon);
    state.city = city || 'Cambodia';

    const locLabel = document.getElementById('location-label');
    if (locLabel) locLabel.textContent = `${state.city}, Cambodia`;

    // Reset compass data (it's location-specific)
    state.compassData  = [];
    state.windCompassData = [];
    state.activeSectors = 0;

    fetchAndRender();

    // Update map if open
    if (state.mapObj) {
      state.mapObj.setView([state.lat, state.lon], 9);
      if (state.circleLayer) state.mapObj.removeLayer(state.circleLayer);
      state.circleLayer = L.circle([state.lat, state.lon], circleOptions()).addTo(state.mapObj);
    }
  }

  /* ══════════════════════════════════════════════════════
     WEATHER FETCH + RENDER
  ══════════════════════════════════════════════════════ */
  async function fetchAndRender() {
    setUpdateStamp('Updating…');

    try {
      const data = await Weather.fetchWeather(state.lat, state.lon);
      state.weatherData = data;

      // Calculate AI confidence (use current active sectors count)
      const rainProb = data.hourly.rainProb[0] || 0;
      state.confidenceData = Weather.calculateConfidence(
        data.current,
        rainProb,
        state.activeSectors
      );

      renderAll(data, state.confidenceData);

      const ts = new Date().toLocaleTimeString('en-GB', { timeZone: CONFIG.TZ });
      setUpdateStamp(`Updated ${ts}`);

    } catch (err) {
      console.error('[App] fetchAndRender error:', err);
      setUpdateStamp('⚠ Update failed');
    }
  }

  function setUpdateStamp(text) {
    const el = document.getElementById('update-stamp');
    if (el) el.textContent = text;
  }

  /* ══════════════════════════════════════════════════════
     RENDER ALL PAGES
  ══════════════════════════════════════════════════════ */
  function renderAll(data, confidence) {
    renderAlertBanner(data, confidence);
    renderDashboard(data, confidence);
    renderRainPage(data);
    renderCloudPage(data);
    renderForecastPage(data, confidence);
    updateTelegramPreview();
  }

  /* ─── ALERT BANNER ───────────────────────────────────── */
  function renderAlertBanner(data, confidence) {
    const banner = document.getElementById('alert-banner');
    const iconEl = document.getElementById('alert-icon');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');

    if (!banner) return;

    const rainProb = data.hourly.rainProb[0] || 0;
    const wmo = data.current.wmo;

    if (confidence.level === 'high') {
      banner.style.display = 'flex';
      banner.className = 'alert-banner level-high';
      iconEl.textContent = '🔴';
      titleEl.textContent = 'HIGH RAIN RISK';
      msgEl.textContent = ` ${confidence.total}% confidence — ${wmo.desc}. Cloud: ${data.current.cloudCover}%. Humidity: ${data.current.humidity}%. ${confidence.eta}`;
    } else if (confidence.level === 'medium') {
      banner.style.display = 'flex';
      banner.className = 'alert-banner level-medium';
      iconEl.textContent = '🟡';
      titleEl.textContent = 'MEDIUM RISK';
      msgEl.textContent = ` ${confidence.total}% confidence — ${wmo.desc}. Rain probability: ${rainProb}%.`;
    } else {
      banner.style.display = 'none';
    }
  }

  /* ─── DASHBOARD ──────────────────────────────────────── */
  function renderDashboard(data, confidence) {
    const c = data.current;
    const rainProb = data.hourly.rainProb[0] || 0;

    // AI Hero card
    setEl('ai-risk-score', `${confidence.total}%`);
    const scoreEl = document.getElementById('ai-risk-score');
    if (scoreEl) {
      scoreEl.className = 'ai-risk-score ' + confidence.level;
    }

    const badgeEl = document.getElementById('ai-risk-badge');
    if (badgeEl) {
      badgeEl.className = 'ai-risk-badge ' + confidence.level;
      document.getElementById('ai-risk-text').textContent = confidence.label;
    }

    setEl('ai-eta', confidence.eta);

    // Factor bars
    const p = confidence.percents;
    setFactorBar('cloud',    p.cloud,    `${c.cloudCover}%`);
    setFactorBar('rain',     p.rain,     `${rainProb}%`);
    setFactorBar('hum',      p.humidity, `${c.humidity}%`);
    setFactorBar('pres',     p.pressure, `${c.pressure} hPa`);
    setFactorBar('wind',     p.wind,     `${c.windSpeed} km/h`);
    setFactorBar('sectors',  p.sectors,  `${state.activeSectors}/16`);

    // Metric cards
    setEl('m-temp', `${c.temp}°C`);
    setEl('m-feels', `Feels like ${c.feelsLike}°C`);
    setEl('m-hum',  `${c.humidity}%`);
    setEl('m-wind', `${c.windSpeed} km/h`);
    setEl('m-winddir', `${c.windDir} (${Math.round(c.windDeg)}°)`);
    setEl('m-pressure', `${c.pressure}`);
    setEl('m-cloud', `${c.cloudCover}%`);
    setEl('m-dew', `${c.dewPoint ?? '--'}°C`);
    setEl('m-uv', `${c.uvIndex}`);
    setEl('m-uv-label', c.uvLabel);
    setEl('m-rain-now', `${c.rain} mm`);

    // Today summary
    setEl('today-icon', data.today.wmo.icon);
    setEl('today-desc', data.today.wmo.desc);
    setEl('t-max', `${data.today.tempMax}°C`);
    setEl('t-min', `${data.today.tempMin}°C`);
    setEl('t-sunrise', data.today.sunrise);
    setEl('t-sunset', data.today.sunset);
    setEl('t-rain-sum', `${data.today.rainSum} mm`);

    // Next 8-hour forecast
    const forecastHTML = buildForecastHTML(
      data.hourly.times,
      data.hourly.rainProb,
      data.hourly.weatherCodes,
      8
    );
    setInner('dash-forecast', forecastHTML);
  }

  function setFactorBar(id, percent, label) {
    const fill = document.getElementById(`fac-${id}`);
    const val  = document.getElementById(`fv-${id}`);
    if (fill) {
      fill.style.width = `${Math.min(100, percent)}%`;
      // Color by percentage
      fill.style.background = percent >= 75 ? 'var(--red)' :
                              percent >= 45 ? 'var(--amber)' : 'var(--gold)';
    }
    if (val) val.textContent = label;
  }

  /* ─── RAIN PAGE ──────────────────────────────────────── */
  function renderRainPage(data) {
    setEl('rain-now-val', `${data.rain.now} mm`);
    setEl('rain-1h-val',  `${data.rain.precip1h} mm`);
    setEl('rain-24h-val', `${data.rain.total24h} mm`);

    const barsHTML = buildForecastHTML(
      data.hourly.times,
      data.hourly.rainProb,
      data.hourly.weatherCodes,
      24
    );
    setInner('rain-bars', barsHTML);

    const rp = data.hourly.rainProb[0] || 0;
    const cc = data.current.cloudCover;
    const hu = data.current.humidity;
    const desc = data.current.wmo.desc;

    const analysis = rp >= 70
      ? `🌧 HIGH RAIN RISK (${rp}%)\nCloud cover: ${cc}%\nHumidity: ${hu}%\nCondition: ${desc}\n\n⚠️ Take shelter immediately. Heavy rain expected within 1–2 hours.`
      : rp >= 40
      ? `⚠️ MODERATE RAIN CHANCE (${rp}%)\nCloud cover: ${cc}%\nHumidity: ${hu}%\nCondition: ${desc}\n\n🌂 Carry umbrella. Rain likely within the next few hours.`
      : `☀️ LOW RAIN PROBABILITY (${rp}%)\nCloud cover: ${cc}%\nHumidity: ${hu}%\nCondition: ${desc}\n\n✅ Conditions look clear. Low risk of rain.`;

    setEl('rain-analysis', analysis);
  }

  /* ─── CLOUD PAGE ─────────────────────────────────────── */
  function renderCloudPage(data) {
    setEl('cloud-low',   `${data.clouds.low}%`);
    setEl('cloud-mid',   `${data.clouds.mid}%`);
    setEl('cloud-high',  `${data.clouds.high}%`);
    setEl('cloud-total', `${data.clouds.total}%`);

    const barsHTML = buildCloudForecastHTML(data.hourly.times, data.hourly.cloudCover, 24);
    setInner('cloud-bars', barsHTML);
  }

  /* ─── FORECAST PAGE ──────────────────────────────────── */
  function renderForecastPage(data, confidence) {
    // Activate the right confidence card
    const levels = ['low', 'medium', 'high'];
    const cardIds = {
      low:    'conf-card-low',
      medium: 'conf-card-medium',
      high:   'conf-card-high'
    };

    levels.forEach(lv => {
      const el = document.getElementById(cardIds[lv]);
      if (!el) return;
      el.classList.remove('active-conf', 'active-low', 'active-med', 'active-high');
      if (lv === confidence.level) {
        el.classList.add('active-conf');
        el.classList.add(`active-${lv === 'medium' ? 'med' : lv}`);
        el.style.opacity = '1';
      } else {
        el.style.opacity = '0.35';
      }
    });

    // 7-day daily forecast
    const dailyHTML = buildDailyForecastHTML(data);
    setInner('daily-forecast', dailyHTML);

    // AI report
    const report = Weather.generateReport(data, confidence, state.city);
    setEl('ai-report', report);
  }

  /* ═══════════════════════════════════════════════════════
     HTML BUILDERS
  ═══════════════════════════════════════════════════════ */

  function barColor(pct) {
    return pct >= 60 ? 'var(--green)' :
           pct >= 30 ? 'var(--amber)' : 'var(--blue)';
  }

  function buildForecastHTML(times, probs, codes, count) {
    const rows = [];
    for (let i = 0; i < Math.min(count, times.length); i++) {
      const pct = probs[i] || 0;
      const wmo = Weather.getWMO(codes[i] || 0);
      const col = barColor(pct);
      const time = Weather.formatTime(times[i]);

      rows.push(`
        <div class="fc-row">
          <span class="fc-hour">${time}</span>
          <span class="fc-icon">${wmo.icon}</span>
          <div class="fc-bar">
            <div class="fc-fill" style="width:${pct}%;background:${col};"></div>
          </div>
          <span class="fc-pct" style="color:${col};">${pct}%</span>
        </div>
      `);
    }
    return rows.join('') || '<div class="loading-state"><div class="spinner"></div></div>';
  }

  function buildCloudForecastHTML(times, cloudValues, count) {
    const rows = [];
    for (let i = 0; i < Math.min(count, times.length); i++) {
      const pct = cloudValues[i] || 0;
      const col = pct >= 70 ? 'var(--blue)' : pct >= 40 ? 'var(--amber)' : 'var(--green)';
      const time = Weather.formatTime(times[i]);

      rows.push(`
        <div class="fc-row">
          <span class="fc-hour">${time}</span>
          <span class="fc-icon">${pct >= 70 ? '☁️' : pct >= 40 ? '⛅' : '🌤️'}</span>
          <div class="fc-bar">
            <div class="fc-fill" style="width:${pct}%;background:${col};"></div>
          </div>
          <span class="fc-pct" style="color:${col};">${pct}%</span>
        </div>
      `);
    }
    return rows.join('') || '<div class="loading-state"><div class="spinner"></div></div>';
  }

  function buildDailyForecastHTML(data) {
    const { daily } = data;
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const rows = [];

    for (let i = 0; i < Math.min(7, daily.times.length); i++) {
      const dt = new Date(daily.times[i]);
      const pct = daily.rainProb[i] || 0;
      const wmo = Weather.getWMO(daily.weatherCodes[i] || 0);
      const col = barColor(pct);
      const dayLabel = `${dayNames[dt.getDay()]} ${dt.getDate()}/${dt.getMonth()+1}`;

      rows.push(`
        <div class="daily-row">
          <span class="daily-date">${dayLabel}</span>
          <span class="fc-icon">${wmo.icon}</span>
          <span class="daily-temp">${daily.tempMin[i]}°–${daily.tempMax[i]}°C</span>
          <div class="fc-bar">
            <div class="fc-fill" style="width:${pct}%;background:${col};"></div>
          </div>
          <span class="fc-pct" style="color:${col};">${pct}%</span>
        </div>
      `);
    }

    return rows.join('') || '<div class="loading-state"><div class="spinner"></div></div>';
  }

  /* ═══════════════════════════════════════════════════════
     CLOCK-FACE SWEEP ANIMATION (runs on top of existing compasses)
  ═══════════════════════════════════════════════════════ */
  let stormSweepAngle = 0;
  let stormSweepRunning = false;
  function startStormSweep(canvas) {
    if (stormSweepRunning) return;
    stormSweepRunning = true;
    function tick() {
      StormCompass.drawCompass(canvas, state.compassData || []);
      StormCompass.drawSweepOverlay(canvas, stormSweepAngle);
      stormSweepAngle = (stormSweepAngle + 1.2) % 360;
      requestAnimationFrame(tick);
    }
    tick();
  }

  let windSweepAngle = 0;
  let windSweepRunning = false;
  function startWindSweep(canvas) {
    if (windSweepRunning) return;
    windSweepRunning = true;
    function tick() {
      WindCompass.drawCompass(canvas, state.windCompassData || [], state.city);
      WindCompass.drawSweepOverlay(canvas, windSweepAngle);
      windSweepAngle = (windSweepAngle + 1.2) % 360;
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ═══════════════════════════════════════════════════════
     STORM COMPASS
  ═══════════════════════════════════════════════════════ */
  async function runCompassScan() {
    const statusEl  = document.getElementById('compass-scan-text');
    const tableEl   = document.getElementById('sector-table');
    const canvas    = document.getElementById('compass-canvas');

    if (statusEl) statusEl.textContent = 'Scanning 16 directions × 100km…';
    if (tableEl)  tableEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const scanData = await StormCompass.runScan();
      state.compassData = scanData;

      // Draw canvas
      StormCompass.drawCompass(canvas, scanData);
      startStormSweep(canvas);

      // Build sector table
      if (tableEl) tableEl.innerHTML = StormCompass.buildSectorTableHTML(scanData);

      // Summary
      const summary = StormCompass.calculateSummary(scanData);
      state.activeSectors = summary.activeSectors;

      setEl('summary-active',   `${summary.activeSectors} / 16`);
      setEl('summary-nearest',  summary.nearestRain);
      setEl('summary-danger',   summary.mostDangerous);
      setEl('summary-eta',      summary.eta);
      setEl('summary-risk',     summary.risk);

      // Update AI confidence with sector data
      if (state.weatherData) {
        const rainProb = state.weatherData.hourly.rainProb[0] || 0;
        state.confidenceData = Weather.calculateConfidence(
          state.weatherData.current,
          rainProb,
          summary.activeSectors
        );
        // Refresh AI hero card
        renderDashboard(state.weatherData, state.confidenceData);
        setFactorBar('sectors', state.confidenceData.percents.sectors, `${summary.activeSectors}/16`);
      }

      const ts = new Date().toLocaleTimeString('en-GB', { timeZone: CONFIG.TZ });
      if (statusEl) statusEl.textContent = `✅ Last scan: ${ts} — 16 directions × 50km & 100km`;

    } catch (err) {
      console.error('[App] compass scan error:', err);
      if (statusEl) statusEl.textContent = '⚠ Scan error — retrying…';
      if (tableEl)  tableEl.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--red)">Scan failed. Check connection.</div>';
    }
  }

  /* ═══════════════════════════════════════════════════════
     WIND COMPASS
  ═══════════════════════════════════════════════════════ */
  async function runWindCompassScan() {
    const statusEl = document.getElementById('wind-scan-text');
    const tableEl  = document.getElementById('wind-sector-table');
    const canvas   = document.getElementById('wind-canvas');

    if (statusEl) statusEl.textContent = 'Scanning 16 directions × 100km…';
    if (tableEl)  tableEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const scanData = await WindCompass.runScan(state.lat, state.lon);
      state.windCompassData = scanData;

      WindCompass.drawCompass(canvas, scanData, state.city);
      startWindSweep(canvas);

      if (tableEl) tableEl.innerHTML = WindCompass.buildSectorTableHTML(scanData);

      const summary = WindCompass.calculateSummary(scanData);
      setEl('wind-summary-active',   `${summary.activeSectors} / 16`);
      setEl('wind-summary-strongest', summary.strongest);
      setEl('wind-summary-avg',      summary.avgSpeed);
      setEl('wind-summary-gust',     summary.maxGust);
      setEl('wind-summary-risk',     summary.risk);

      const ts = new Date().toLocaleTimeString('en-GB', { timeZone: CONFIG.TZ });
      if (statusEl) statusEl.textContent = `✅ Last scan: ${ts} — 16 directions × 50km & 100km`;

    } catch (err) {
      console.error('[App] wind compass scan error:', err);
      if (statusEl) statusEl.textContent = '⚠ Scan error — retrying…';
      if (tableEl)  tableEl.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--red)">Scan failed. Check connection.</div>';
    }
  }

  /* ═══════════════════════════════════════════════════════
     RADAR MAP
  ═══════════════════════════════════════════════════════ */
  function circleOptions() {
    return {
      color: 'rgba(255,215,0,0.4)',
      fillColor: 'rgba(255,215,0,0.025)',
      fillOpacity: 0.3,
      radius: 100000,
      weight: 1.5,
      dashArray: '8 6'
    };
  }

  function initRadar() {
    if (state.mapObj) return; // Already initialized

    const mapEl = document.getElementById('radar-map');
    if (!mapEl) return;

    // Initialize Leaflet
    const map = L.map('radar-map', {
      center: [state.lat, state.lon],
      zoom: 8,
      zoomControl: true,
      attributionControl: true
    });

    // Base tile layer (dark)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CartoDB',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    // Rain radar layer (RainViewer)
    const radarTiles = L.tileLayer(
      'https://tilecache.rainviewer.com/v2/radar/nowcast/{z}/{x}/{y}/4/1_1.png',
      {
        opacity: 0.7,
        attribution: 'RainViewer',
        maxZoom: 15
      }
    );
    radarTiles.addTo(map);

    // 100km coverage circle
    const circle = L.circle([state.lat, state.lon], circleOptions()).addTo(map);

    // Center marker
    L.circleMarker([state.lat, state.lon], {
      radius: 7,
      color: '#FFD700',
      fillColor: '#40C4FF',
      fillOpacity: 1,
      weight: 2
    })
    .addTo(map)
    .bindPopup('<strong style="color:#FFD700;">📍 Phnom Penh</strong><br>11.5641°N 104.9161°E<br>Weather Center');

    state.mapObj = map;
    state.radarLayer = radarTiles;
    state.circleLayer = circle;
    state.currentMapLayer = 'rain';
  }

  function setRadarLayer(type) {
    if (!state.mapObj) return;

    document.getElementById('radar-btn-rain')?.classList.toggle('active', type === 'rain');
    document.getElementById('radar-btn-satellite')?.classList.toggle('active', type === 'satellite');

    if (state.radarLayer) {
      state.mapObj.removeLayer(state.radarLayer);
    }

    if (type === 'rain') {
      state.radarLayer = L.tileLayer(
        'https://tilecache.rainviewer.com/v2/radar/nowcast/{z}/{x}/{y}/4/1_1.png',
        { opacity: 0.7, attribution: 'RainViewer', maxZoom: 15 }
      );
    } else {
      // Satellite layer
      state.radarLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Esri World Imagery', maxZoom: 19, opacity: 0.85 }
      );
    }

    state.radarLayer.addTo(state.mapObj);
    state.currentMapLayer = type;
  }

  function resetRadarView() {
    if (state.mapObj) {
      state.mapObj.setView([state.lat, state.lon], 8);
    }
  }

  /* ═══════════════════════════════════════════════════════
     TELEGRAM
  ═══════════════════════════════════════════════════════ */
  function updateTelegramPreview() {
    const previewEl = document.getElementById('tg-preview');
    if (!previewEl || !state.weatherData || !state.confidenceData) return;

    const msg = Weather.buildTelegramMessage(
      state.weatherData,
      state.confidenceData,
      state.city
    );
    previewEl.textContent = msg;
  }

  async function sendTelegramNow() {
    const logEl = document.getElementById('tg-log');
    if (!logEl) return;

    if (!state.weatherData || !state.confidenceData) {
      appendLog(logEl, 'warn', '⚠ No weather data loaded yet.');
      return;
    }

    const threshold = parseInt(document.getElementById('tg-threshold')?.value || '60');
    const rainProb = state.weatherData.hourly.rainProb[0] || 0;
    const confidence = state.confidenceData.total;

    if (rainProb < threshold && confidence < threshold) {
      appendLog(logEl, 'info', `ℹ Rain ${rainProb}% < threshold ${threshold}%. Alert skipped.`);
      return;
    }

    appendLog(logEl, 'info', '📡 Sending alert via Telegram…');

    const msg = Weather.buildTelegramMessage(
      state.weatherData,
      state.confidenceData,
      state.city
    );

    // NOTE: In production, the bot token is stored as a GitHub Secret
    // and alerts are sent via GitHub Actions (weather.yml / telegram.py)
    // Browser-side sends are for testing only
    appendLog(logEl, 'info', '💡 For production: alerts are sent via GitHub Actions every 10 min.');
    appendLog(logEl, 'ok', '✅ Alert payload generated (see preview below).');
    updateTelegramPreview();
  }

  function saveTelegramSettings() {
    const threshold = document.getElementById('tg-threshold')?.value;
    const interval  = document.getElementById('tg-interval')?.value;

    try {
      localStorage.setItem('tg_threshold', threshold);
      localStorage.setItem('tg_interval', interval);

      const logEl = document.getElementById('tg-log');
      appendLog(logEl, 'ok', `✅ Settings saved: threshold=${threshold}%, interval=${interval}min`);
    } catch (e) {
      console.warn('localStorage unavailable');
    }
  }

  function appendLog(el, type, msg) {
    if (!el) return;
    const ts = new Date().toLocaleTimeString('en-GB', { timeZone: CONFIG.TZ });
    el.innerHTML += `\n<span class="log-${type}">[${ts}] ${msg}</span>`;
    el.scrollTop = el.scrollHeight;
  }

  /* ═══════════════════════════════════════════════════════
     SETTINGS
  ═══════════════════════════════════════════════════════ */
  function saveSettings() {
    const refreshMin = parseInt(document.getElementById('s-refresh')?.value || '5');
    const lang = document.getElementById('s-lang')?.value || 'en';

    // Apply settings
    setLang(lang);

    const refreshMs = Math.max(1, refreshMin) * 60 * 1000;
    startAutoRefresh(refreshMs);

    try {
      localStorage.setItem('refresh_min', refreshMin);
      localStorage.setItem('lang', lang);
    } catch (e) {}

    // Visual feedback
    const btn = document.querySelector('#page-settings .btn-primary');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Saved!';
      setTimeout(() => btn.textContent = orig, 2000);
    }
  }

  function loadSettings() {
    try {
      const lang = localStorage.getItem('lang') || 'en';
      const refreshMin = parseInt(localStorage.getItem('refresh_min') || '5');
      const threshold = localStorage.getItem('tg_threshold');
      const interval = localStorage.getItem('tg_interval');

      setLang(lang);

      const refreshEl = document.getElementById('s-refresh');
      if (refreshEl) refreshEl.value = refreshMin;

      if (threshold) {
        const el = document.getElementById('tg-threshold');
        if (el) el.value = threshold;
      }
      if (interval) {
        const el = document.getElementById('tg-interval');
        if (el) el.value = interval;
      }

      return { refreshMin };
    } catch (e) {
      return { refreshMin: 5 };
    }
  }

  /* ═══════════════════════════════════════════════════════
     AUTO REFRESH
  ═══════════════════════════════════════════════════════ */
  function startAutoRefresh(intervalMs = CONFIG.REFRESH_MS) {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(fetchAndRender, intervalMs);
  }

  /* ═══════════════════════════════════════════════════════
     UTILITIES
  ═══════════════════════════════════════════════════════ */
  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setInner(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  /* ═══════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════ */
  function init() {
    // Clock
    startClock();

    // Load saved settings
    const { refreshMin } = loadSettings();

    // First data fetch
    fetchAndRender();

    // Auto refresh
    startAutoRefresh(refreshMin * 60 * 1000);

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });

    console.log('[Cambodia Rain 8888 Pro V3] Initialized ✅');
    console.log('[Center]', CONFIG.HOME_LAT, CONFIG.HOME_LON, '— Phnom Penh');
    console.log('[Coverage] 100km radius | 16 directions');
  }

  /* ─── PUBLIC API ──────────────────────────────────────── */
  return {
    init,
    showPage,
    toggleSidebar,
    closeSidebar,
    setLang,
    changeProvince,
    fetchAndRender,
    runCompassScan,
    runWindCompassScan,
    setRadarLayer,
    resetRadarView,
    sendTelegramNow,
    saveTelegramSettings,
    saveSettings
  };

})();

/* ═══════════════════════════════════════════════════════
   BOOT ON DOM READY
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
