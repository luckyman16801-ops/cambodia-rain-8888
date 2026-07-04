/**
 * windCompass.js — Cambodia Rain 8888 Pro V3
 * Wind Compass Pro: 16-Direction Regional Wind Scan
 * Scans 100km radius around the selected location in 16 compass directions,
 * reusing the same architecture as stormCompass.js but for wind speed/gust/direction.
 * MR TP AI Weather Intelligence Center
 */

'use strict';

const WindCompass = (() => {

  /* ── CONSTANTS ───────────────────────────────────────── */

  // Default center (Phnom Penh) — overridden by passing lat/lon into runScan()
  const HOME_LAT = 11.5641;
  const HOME_LON = 104.9161;

  // Same 16-direction layout as Storm Compass Pro
  const SCAN_DIRECTIONS = [
    { dir: 'N',   label: 'North',       deg: 0   },
    { dir: 'NNE', label: 'N-Northeast', deg: 22.5 },
    { dir: 'NE',  label: 'Northeast',   deg: 45  },
    { dir: 'ENE', label: 'E-Northeast', deg: 67.5 },
    { dir: 'E',   label: 'East',        deg: 90  },
    { dir: 'ESE', label: 'E-Southeast', deg: 112.5 },
    { dir: 'SE',  label: 'Southeast',   deg: 135 },
    { dir: 'SSE', label: 'S-Southeast', deg: 157.5 },
    { dir: 'S',   label: 'South',       deg: 180 },
    { dir: 'SSW', label: 'S-Southwest', deg: 202.5 },
    { dir: 'SW',  label: 'Southwest',   deg: 225 },
    { dir: 'WSW', label: 'W-Southwest', deg: 247.5 },
    { dir: 'W',   label: 'West',        deg: 270 },
    { dir: 'WNW', label: 'W-Northwest', deg: 292.5 },
    { dir: 'NW',  label: 'Northwest',   deg: 315 },
    { dir: 'NNW', label: 'N-Northwest', deg: 337.5 }
  ];

  const KM_TO_DEG_LAT = 1 / 111;
  const KM_TO_DEG_LON = 1 / 108;

  // Same multi-ring distances as Storm Compass: 0.5km → 100km
  const RINGS_KM = [0.5, 2, 5, 10, 20, 35, 50, 75, 100];

  /**
   * Calculate GPS coordinates for a direction + distance from a given center
   */
  function scanPoint(centerLat, centerLon, deg, km) {
    const rad = (deg * Math.PI) / 180;
    const lat = centerLat + (Math.cos(rad) * km * KM_TO_DEG_LAT);
    const lon = centerLon + (Math.sin(rad) * km * KM_TO_DEG_LON);
    return [parseFloat(lat.toFixed(4)), parseFloat(lon.toFixed(4))];
  }

  /* ── WIND CLASSIFICATION (Beaufort-style, km/h) ──────── */
  // Reuses the SAME CSS classes as Storm Compass (risk-none/low/moderate/high/extreme)
  // so no new stylesheet rules are required.
  function classifyWind(speedKmh, gustKmh) {
    const s = speedKmh || 0;
    const g = Math.max(gustKmh || 0, s);

    if (s >= 60 || g >= 75) {
      return {
        level: 'extreme',
        label: 'STORM',
        windType: '🌪️ Storm Force Wind',
        color: '#FF1744',
        bgClass: 'risk-extreme',
        score: 100
      };
    }
    if (s >= 40 || g >= 55) {
      return {
        level: 'high',
        label: 'STRONG',
        windType: '💨 Strong Gale',
        color: '#FF5252',
        bgClass: 'risk-high',
        score: Math.round(60 + Math.min(s, 100) * 0.4)
      };
    }
    if (s >= 20 || g >= 32) {
      return {
        level: 'moderate',
        label: 'MODERATE',
        windType: '🌬️ Moderate Breeze',
        color: '#FFB300',
        bgClass: 'risk-moderate',
        score: Math.round(35 + s * 0.5)
      };
    }
    if (s >= 6) {
      return {
        level: 'low',
        label: 'LIGHT',
        windType: '🍃 Light Breeze',
        color: '#40C4FF',
        bgClass: 'risk-low',
        score: Math.round(15 + s * 0.3)
      };
    }
    return {
      level: 'none',
      label: 'CALM',
      windType: '😌 Calm Air',
      color: '#00e676',
      bgClass: 'risk-none',
      score: Math.min(14, s)
    };
  }

  /* ── SCAN ENGINE ─────────────────────────────────────── */

  let lastScanData = [];
  let lastCenter = { lat: HOME_LAT, lon: HOME_LON };
  let isScanning = false;

  /**
   * Run the full 16-direction wind scan around a center point
   * @param {number} [centerLat] - defaults to Phnom Penh
   * @param {number} [centerLon] - defaults to Phnom Penh
   * @returns {Promise<Array>} Scan results per direction
   */
  /**
   * Run the full 16-direction wind scan around a center point, checking
   * RINGS_KM distances (0.5km → 100km) along each direction in one batched
   * API call, then finding the real distance to the nearest strong wind.
   * @param {number} [centerLat] - defaults to Phnom Penh
   * @param {number} [centerLon] - defaults to Phnom Penh
   * @returns {Promise<Array>} Scan results per direction
   */
  async function runScan(centerLat, centerLon) {
    if (isScanning) return lastScanData;
    isScanning = true;

    const lat = typeof centerLat === 'number' ? centerLat : HOME_LAT;
    const lon = typeof centerLon === 'number' ? centerLon : HOME_LON;
    lastCenter = { lat, lon };

    const flatPoints = [];
    SCAN_DIRECTIONS.forEach(sd => {
      RINGS_KM.forEach(km => flatPoints.push(scanPoint(lat, lon, sd.deg, km)));
    });

    try {
      const flatData = await Weather.fetchMultiPointWeather(flatPoints);

      lastScanData = SCAN_DIRECTIONS.map((sd, dirIdx) => {
        const offset = dirIdx * RINGS_KM.length;
        const rings = RINGS_KM.map((km, i) => {
          const d = flatData[offset + i] || defaultPoint();
          return { ...d, km, risk: classifyWind(d.windSpeed, d.windGust) };
        });

        // Walk outward from closest ring, find the first one with real strong wind
        const windRing = rings.find(r => r.risk.level === 'moderate' || r.risk.level === 'high' || r.risk.level === 'extreme');
        const nearestWindKm = windRing ? windRing.km : null;
        const bestRing = windRing || [...rings].sort((a, b) => b.risk.score - a.risk.score)[0];

        const maxSpeed = Math.max(...rings.map(r => r.windSpeed || 0));
        const maxGust = Math.max(...rings.map(r => r.windGust || 0));

        return {
          dir: sd.dir,
          label: sd.label,
          deg: sd.deg,
          rings,
          nearestWindKm,
          dominant: { ...bestRing.risk, km: bestRing.km, windDeg: bestRing.windDeg, windDir: bestRing.windDir },
          windSpeed: maxSpeed,
          windGust: maxGust
        };
      });
    } catch (err) {
      console.error('[WindCompass] Scan error:', err);
      lastScanData = [];
    }

    isScanning = false;
    return lastScanData;
  }

  function defaultPoint() {
    return { windSpeed: 0, windGust: 0, windDeg: 0, windDir: 'N' };
  }

  /* ── CANVAS RENDERER ─────────────────────────────────── */

  /**
   * Draw the Wind Compass Pro on a canvas element
   * @param {HTMLCanvasElement} canvas
   * @param {Array} scanData - Result from runScan()
   * @param {string} [cityName] - label shown at the center marker
   */
  function drawCompass(canvas, scanData, cityName) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2 + 10;
    const maxR = Math.min(W, H) / 2 - 52;

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#040a14';
    ctx.fillRect(0, 0, W, H);

    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2);
    bgGlow.addColorStop(0, 'rgba(10,40,100,0.18)');
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, W, H);

    // ── RINGS ──────────────────────────────────────────
    const rings = [
      { frac: 0.05, label: '5km' },
      { frac: 0.20, label: '20km' },
      { frac: 0.50, label: '50km' },
      { frac: 1.0,  label: '100km' }
    ];

    rings.forEach(ring => {
      const r = ring.frac * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(60,120,200,${0.12 + ring.frac * 0.08})`;
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = 'rgba(80,140,220,0.5)';
      ctx.textAlign = 'left';
      ctx.fillText(ring.label, cx + r + 4, cy - 4);
    });

    // ── AXIS LINES ─────────────────────────────────────
    for (let i = 0; i < 16; i++) {
      const angle = ((i * 22.5) - 90) * (Math.PI / 180);
      const isCardinal = i % 4 === 0;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(angle) * (maxR + 10),
        cy + Math.sin(angle) * (maxR + 10)
      );
      ctx.strokeStyle = isCardinal ? 'rgba(100,160,255,0.12)' : 'rgba(60,100,180,0.07)';
      ctx.setLineDash(isCardinal ? [] : [3, 5]);
      ctx.lineWidth = isCardinal ? 1 : 0.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── DIRECTION LABELS ───────────────────────────────
    SCAN_DIRECTIONS.forEach(sd => {
      const angle = (sd.deg - 90) * (Math.PI / 180);
      const labelR = maxR + 30;
      const x = cx + Math.cos(angle) * labelR;
      const y = cy + Math.sin(angle) * labelR;

      const isCardinal = ['N','S','E','W'].includes(sd.dir);
      ctx.font = `${isCardinal ? 'bold ' : ''}${isCardinal ? 12 : 9}px Inter, sans-serif`;
      ctx.fillStyle = isCardinal ? 'rgba(200,220,255,0.85)' : 'rgba(130,165,220,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sd.dir, x, y);
    });

    // ── SECTOR VISUALIZATION ───────────────────────────
    if (scanData && scanData.length > 0) {
      scanData.forEach(sector => {
        drawSectorArc(ctx, cx, cy, maxR, sector);
        drawWindArrows(ctx, cx, cy, maxR, sector);
      });
    } else {
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = 'rgba(100,140,200,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('Press "Rescan 100km" to begin scan', cx, cy + maxR * 0.5);
    }

    // ── CENTER MARKER ──────────────────────────────────
    const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    centerGlow.addColorStop(0, 'rgba(64,196,255,0.18)');
    centerGlow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = centerGlow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(64,196,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#40C4FF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.fillText(cityName || 'Phnom Penh', cx + 22, cy - 6);
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(130,170,220,0.55)';
    ctx.fillText(`${lastCenter.lat.toFixed(4)}°N ${lastCenter.lon.toFixed(4)}°E`, cx + 22, cy + 7);

    ctx.textBaseline = 'alphabetic';
  }

  /** Colored arc showing overall wind risk for a sector (same look as Storm Compass) */
  function drawSectorArc(ctx, cx, cy, maxR, sector) {
    if (!sector.dominant || sector.dominant.level === 'none') return;

    const startAngle = ((sector.deg - 11.25 - 90) * Math.PI) / 180;
    const endAngle   = ((sector.deg + 11.25 - 90) * Math.PI) / 180;
    const color = sector.dominant.color;
    const alpha = sector.dominant.level === 'extreme' ? 0.18 :
                  sector.dominant.level === 'high'    ? 0.13 :
                  sector.dominant.level === 'moderate' ? 0.09 : 0.06;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, maxR, startAngle, endAngle);
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Draw the wind arrow at the dominant (nearest strong-wind, or highest-risk
   * if calm) ring distance for this direction.
   * Arrow points in the direction the wind is blowing TOWARD
   * (meteorological windDeg is the direction it blows FROM, so we add 180°).
   * Arrow length scales with speed.
   */
  function drawWindArrows(ctx, cx, cy, maxR, sector) {
    const pt = sector.dominant;
    const frac = Math.min(pt.km / 100, 1);
    const angle = (sector.deg - 90) * (Math.PI / 180);
    const r = frac * maxR;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;

    const risk = pt;
    const speed = sector.windSpeed || 0;
    const arrowLen = 10 + Math.min(speed, 60) * 0.35;
    const flowDeg = (pt.windDeg || 0) + 180;
    const flowRad = ((flowDeg - 90) * Math.PI) / 180;

    // Glow
    const glow = ctx.createRadialGradient(px, py, 1, px, py, arrowLen + 8);
    const glowA = risk.score > 60 ? 0.3 : risk.score > 30 ? 0.18 : 0.1;
    glow.addColorStop(0, risk.color + Math.round(glowA * 255).toString(16).padStart(2, '0'));
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(px, py, arrowLen + 8, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(flowRad);

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(-arrowLen / 2, 0);
    ctx.lineTo(arrowLen / 2, 0);
    ctx.strokeStyle = risk.color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(arrowLen / 2, 0);
    ctx.lineTo(arrowLen / 2 - 7, -4.5);
    ctx.lineTo(arrowLen / 2 - 7, 4.5);
    ctx.closePath();
    ctx.fillStyle = risk.color;
    ctx.fill();

    ctx.restore();

    // Distance + speed label above the arrow
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = risk.color;
    const distLabel = sector.nearestWindKm !== null
      ? `${Math.round(speed)}km/h @ ${sector.nearestWindKm}km`
      : `${Math.round(speed)}km/h`;
    ctx.fillText(distLabel, px, py - (arrowLen + 6));
    ctx.textBaseline = 'alphabetic';

    // Ray from center to the dominant point
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.strokeStyle = risk.color + (sector.nearestWindKm !== null ? '50' : '20');
    ctx.setLineDash(sector.nearestWindKm !== null ? [] : [4, 5]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── BUILD SECTOR TABLE ──────────────────────────────── */

  function buildSectorTableHTML(scanData) {
    if (!scanData || scanData.length === 0) {
      return '<div class="loading-state"><div class="spinner"></div></div>';
    }

    return scanData.map(sector => {
      const risk = sector.dominant;
      const spd = Math.round(sector.windSpeed);
      const gst = Math.round(sector.windGust);
      const distText = sector.nearestWindKm !== null
        ? `Strong wind at ${sector.nearestWindKm}km`
        : `Calm to 100km`;

      return `
        <div class="sector-row ${risk.bgClass}">
          <span class="sector-dir">${sector.dir}</span>
          <div class="sector-info">
            <span class="sector-type">${risk.windType}</span>
            <span class="sector-sub">${distText} · ${spd} km/h · Gust ${gst} km/h · from ${risk.windDir}</span>
          </div>
          <span class="sector-risk ${risk.bgClass}">${risk.label}</span>
        </div>
      `;
    }).join('');
  }

  /* ── SUMMARY ─────────────────────────────────────────── */

  function calculateSummary(scanData) {
    if (!scanData || scanData.length === 0) {
      return { activeSectors: 0, strongest: '--', avgSpeed: '--', maxGust: '--', risk: '--' };
    }

    const active = scanData.filter(s => s.dominant.level !== 'none' && s.dominant.level !== 'low');
    const strongest = [...scanData].sort((a, b) => b.dominant.score - a.dominant.score)[0];
    const avgSpeed = scanData.reduce((sum, s) => sum + s.windSpeed, 0) / scanData.length;
    const maxGustSector = [...scanData].sort((a, b) => b.windGust - a.windGust)[0];

    const withWind = scanData.filter(s => s.nearestWindKm !== null);
    const closestWind = withWind.length
      ? withWind.reduce((a, b) => (a.nearestWindKm < b.nearestWindKm ? a : b))
      : null;

    const overallScore = scanData.reduce((sum, s) => sum + s.dominant.score, 0) / scanData.length;
    const overallRisk = overallScore >= 70 ? '🔴 STRONG' :
                        overallScore >= 40 ? '🟡 MODERATE' : '🟢 LIGHT/CALM';

    return {
      activeSectors: active.length,
      strongest: strongest ? `${strongest.dir} — ${strongest.dominant.label} (${Math.round(strongest.windSpeed)} km/h)` : 'None',
      avgSpeed: `${avgSpeed.toFixed(1)} km/h`,
      maxGust: maxGustSector ? `${Math.round(maxGustSector.windGust)} km/h (${maxGustSector.dir})` : '--',
      nearestStrongWind: closestWind ? `${closestWind.dir} (${closestWind.nearestWindKm}km)` : 'None within 100km',
      risk: overallRisk
    };
  }

  /* ── CLOCK-FACE SWEEP OVERLAY ────────────────────────── */
  function drawSweepOverlay(canvas, angleDeg) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2 + 10;
    const maxR = Math.min(W, H) / 2 - 52;
    const rad = (angleDeg - 90) * (Math.PI / 180);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, rad - 0.5, rad, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(64,196,255,0.10)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * maxR, cy + Math.sin(rad) * maxR);
    ctx.strokeStyle = '#40C4FF';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#40C4FF';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ── PUBLIC API ──────────────────────────────────────── */
  return {
    SCAN_DIRECTIONS,
    runScan,
    classifyWind,
    drawCompass,
    drawSweepOverlay,
    buildSectorTableHTML,
    calculateSummary,
    getLastScan: () => lastScanData,
    getLastCenter: () => lastCenter
  };

})();

window.WindCompass = WindCompass;
