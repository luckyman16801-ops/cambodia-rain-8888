/**
 * stormCompass.js — Cambodia Rain 8888 Pro V3
 * Storm Compass Pro: 16-Direction Regional Cloud Risk Scan
 * Scans 100km radius around Phnom Penh in 16 compass directions
 * MR TP AI Weather Intelligence Center
 */

'use strict';

const StormCompass = (() => {

  /* ── CONSTANTS ───────────────────────────────────────── */

  // Home coordinates (Phnom Penh center)
  const HOME_LAT = 11.5641;
  const HOME_LON = 104.9161;

  /**
   * 16-direction scan points
   * Each direction has two scan distances: 50km and 100km
   * Degrees offset calculated from center point
   * ~1° lat ≈ 111km, ~1° lon ≈ 108km at this latitude
   */
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

  // km → approximate degrees offset
  // 50km: ~0.45°, 100km: ~0.90°
  const KM_TO_DEG_LAT = 1 / 111;    // 1° lat = 111km
  const KM_TO_DEG_LON = 1 / 108;    // 1° lon ≈ 108km at 11.5°N

  /**
   * Calculate GPS coordinates for a direction + distance
   * @param {number} deg - Compass degrees (0=N, 90=E)
   * @param {number} km - Distance in km
   * @returns {[number, number]} [lat, lon]
   */
  function scanPoint(deg, km) {
    const rad = (deg * Math.PI) / 180;
    const lat = HOME_LAT + (Math.cos(rad) * km * KM_TO_DEG_LAT);
    const lon = HOME_LON + (Math.sin(rad) * km * KM_TO_DEG_LON);
    return [parseFloat(lat.toFixed(4)), parseFloat(lon.toFixed(4))];
  }

  /* ── RISK CLASSIFICATION ─────────────────────────────── */

  /**
   * Classify a weather point into a risk category
   * @param {Object} data - Weather data from fetchPointWeather
   * @returns {Object} Risk classification
   */
  function classifyRisk(data) {
    const { rainProb, weatherCode, cloudCover } = data;

    if (weatherCode >= 95 || rainProb >= 90) {
      return {
        level: 'extreme',
        label: 'EXTREME',
        cloudType: '⛈ Cumulonimbus (STORM)',
        color: '#FF1744',
        bgClass: 'risk-extreme',
        score: 100
      };
    }
    if (weatherCode >= 61 || rainProb >= 60) {
      return {
        level: 'high',
        label: 'HIGH',
        cloudType: '🌧 Nimbostratus (HEAVY RAIN)',
        color: '#FF5252',
        bgClass: 'risk-high',
        score: Math.round(60 + rainProb * 0.4)
      };
    }
    if (weatherCode >= 51 || rainProb >= 35) {
      return {
        level: 'moderate',
        label: 'MODERATE',
        cloudType: '🌦 Altostratus (RAIN CLOUD)',
        color: '#FFB300',
        bgClass: 'risk-moderate',
        score: Math.round(35 + rainProb * 0.5)
      };
    }
    if (cloudCover >= 60 || rainProb >= 15) {
      return {
        level: 'low',
        label: 'LOW',
        cloudType: '☁ Stratocumulus (DARK CLOUD)',
        color: '#40C4FF',
        bgClass: 'risk-low',
        score: Math.round(15 + rainProb * 0.3)
      };
    }
    return {
      level: 'none',
      label: 'CLEAR',
      cloudType: '☀️ Clear Sky',
      color: '#00e676',
      bgClass: 'risk-none',
      score: Math.min(14, rainProb)
    };
  }

  /* ── SCAN ENGINE ─────────────────────────────────────── */

  /** Shared scan results state */
  let lastScanData = [];
  let isScanning = false;

  /**
   * Run the full 16-direction scan
   * Fetches 32 points in parallel (16 dirs × 2 distances)
   * @returns {Promise<Array>} Scan results per direction
   */
  async function runScan() {
    if (isScanning) return lastScanData;
    isScanning = true;

    // Build all fetch promises: for each direction, fetch 50km and 100km points
    const scanPromises = SCAN_DIRECTIONS.map(async (sd) => {
      const pt50  = scanPoint(sd.deg, 50);
      const pt100 = scanPoint(sd.deg, 100);

      const [data50, data100] = await Promise.allSettled([
        Weather.fetchPointWeather(pt50[0], pt50[1]),
        Weather.fetchPointWeather(pt100[0], pt100[1])
      ]);

      const d50  = data50.status  === 'fulfilled' ? data50.value  : defaultPoint();
      const d100 = data100.status === 'fulfilled' ? data100.value : defaultPoint();

      const risk50  = classifyRisk(d50);
      const risk100 = classifyRisk(d100);

      // Take the higher risk of the two distances
      const dominantRisk = risk50.score >= risk100.score ? risk50 : risk100;
      const dominantDist = risk50.score >= risk100.score ? 50 : 100;

      return {
        dir: sd.dir,
        label: sd.label,
        deg: sd.deg,
        d50:   { ...d50,  risk: risk50,  km: 50 },
        d100:  { ...d100, risk: risk100, km: 100 },
        dominant: { ...dominantRisk, km: dominantDist },
        rainProb: Math.max(d50.rainProb, d100.rainProb),
        cloudCover: Math.max(d50.cloudCover, d100.cloudCover)
      };
    });

    try {
      lastScanData = await Promise.all(scanPromises);
    } catch (err) {
      console.error('[StormCompass] Scan error:', err);
      lastScanData = [];
    }

    isScanning = false;
    return lastScanData;
  }

  /** Fallback data for failed fetches */
  function defaultPoint() {
    return { rainProb: 0, weatherCode: 0, cloudCover: 0, rain: 0, humidity: 0 };
  }

  /* ── CANVAS RENDERER ─────────────────────────────────── */

  /**
   * Draw the Storm Compass Pro on a canvas element
   * @param {HTMLCanvasElement} canvas
   * @param {Array} scanData - Result from runScan()
   */
  function drawCompass(canvas, scanData) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2 + 10;
    const maxR = Math.min(W, H) / 2 - 52;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#040a14';
    ctx.fillRect(0, 0, W, H);

    // Subtle radial bg glow
    const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2);
    bgGlow.addColorStop(0, 'rgba(10,40,100,0.18)');
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, W, H);

    // ── RINGS ──────────────────────────────────────────
    const rings = [
      { frac: 0.33, label: '33km', labelColor: 'rgba(80,140,220,0.4)' },
      { frac: 0.67, label: '67km', labelColor: 'rgba(80,140,220,0.4)' },
      { frac: 1.0,  label: '100km', labelColor: 'rgba(80,140,220,0.6)' }
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

      // Ring label
      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = ring.labelColor;
      ctx.textAlign = 'left';
      ctx.fillText(ring.label, cx + r + 4, cy - 4);
    });

    // ── AXIS LINES ─────────────────────────────────────
    const axisCount = 16;
    for (let i = 0; i < axisCount; i++) {
      const angle = ((i * 22.5) - 90) * (Math.PI / 180);
      const isCardinal = i % 4 === 0;
      const isOrdinal = i % 2 === 0 && !isCardinal;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(angle) * (maxR + 10),
        cy + Math.sin(angle) * (maxR + 10)
      );
      ctx.strokeStyle = isCardinal
        ? 'rgba(100,160,255,0.12)'
        : 'rgba(60,100,180,0.07)';
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
      ctx.fillStyle = isCardinal
        ? 'rgba(200,220,255,0.85)'
        : 'rgba(130,165,220,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sd.dir, x, y);
    });

    // ── SECTOR VISUALIZATION ───────────────────────────
    if (scanData && scanData.length > 0) {
      scanData.forEach(sector => {
        drawSectorArc(ctx, cx, cy, maxR, sector);
        drawSectorPoints(ctx, cx, cy, maxR, sector);
      });
    } else {
      // No data: draw placeholder
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = 'rgba(100,140,200,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('Press "Rescan 100km" to begin scan', cx, cy + maxR * 0.5);
    }

    // ── CENTER MARKER ──────────────────────────────────
    // Outer glow
    const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    centerGlow.addColorStop(0, 'rgba(64,196,255,0.18)');
    centerGlow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = centerGlow;
    ctx.fill();

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(64,196,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#40C4FF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    // City label
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(200,230,255,0.85)';
    ctx.fillText('Phnom Penh', cx + 22, cy - 6);
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(130,170,220,0.55)';
    ctx.fillText('11.5641°N 104.9161°E', cx + 22, cy + 7);

    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Draw colored arc for a sector showing overall risk
   */
  function drawSectorArc(ctx, cx, cy, maxR, sector) {
    if (!sector.dominant || sector.dominant.level === 'none') return;

    const startAngle = ((sector.deg - 11.25 - 90) * Math.PI) / 180;
    const endAngle   = ((sector.deg + 11.25 - 90) * Math.PI) / 180;
    const color = sector.dominant.color;
    const alpha = sector.dominant.level === 'extreme' ? 0.18 :
                  sector.dominant.level === 'high'    ? 0.13 :
                  sector.dominant.level === 'moderate' ? 0.09 : 0.06;

    // Filled arc
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();

    // Arc border
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, startAngle, endAngle);
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Draw cloud/rain indicators for 50km and 100km points
   */
  function drawSectorPoints(ctx, cx, cy, maxR, sector) {
    [sector.d50, sector.d100].forEach(pt => {
      const frac = pt.km / 100;
      const angle = (sector.deg - 90) * (Math.PI / 180);
      const r = frac * maxR;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;

      const risk = pt.risk;
      const size = pt.km === 50 ? 14 : 12;

      // Glow
      const glow = ctx.createRadialGradient(px, py, 1, px, py, size + 8);
      const glowA = risk.score > 60 ? 0.3 : risk.score > 30 ? 0.18 : 0.1;
      glow.addColorStop(0, risk.color + Math.round(glowA * 255).toString(16).padStart(2, '0'));
      glow.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(px, py, size + 8, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Cloud body (3 overlapping circles)
      ctx.save();
      ctx.translate(px, py);

      const cloudFill = risk.level === 'extreme' ? 'rgba(150,30,10,0.75)' :
                        risk.level === 'high'     ? 'rgba(130,50,20,0.65)' :
                        risk.level === 'moderate' ? 'rgba(110,80,10,0.60)' :
                        risk.level === 'low'      ? 'rgba(30,70,130,0.50)' :
                                                    'rgba(180,210,240,0.15)';

      const circles = [[0, 0, size * 0.7], [size * 0.5, -size * 0.3, size * 0.5], [-size * 0.5, -size * 0.3, size * 0.44]];
      circles.forEach(([ox, oy, rs]) => {
        ctx.beginPath();
        ctx.arc(ox, oy, rs, 0, Math.PI * 2);
        ctx.fillStyle = cloudFill;
        ctx.fill();
        ctx.strokeStyle = risk.color + '88';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Rain drops if moderate+
      if (risk.level === 'moderate' || risk.level === 'high' || risk.level === 'extreme') {
        ctx.strokeStyle = 'rgba(64,196,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-6 + i * 6, size * 0.5);
          ctx.lineTo(-8 + i * 6, size * 0.9);
          ctx.stroke();
        }
      }

      // Lightning bolt for storm/extreme
      if (risk.level === 'extreme') {
        ctx.beginPath();
        ctx.moveTo(2, size * 0.35);
        ctx.lineTo(-3, size * 0.65);
        ctx.lineTo(2, size * 0.65);
        ctx.lineTo(-3, size);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      ctx.restore();

      // Risk label above the cloud
      if (pt.rainProb >= 20) {
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = risk.color;
        ctx.fillText(`${Math.round(pt.rainProb)}%`, px, py - (size + 6));
        ctx.textBaseline = 'alphabetic';
      }
    });

    // Arrow from center if there's notable risk
    if (sector.dominant.score >= 35) {
      const angle = (sector.deg - 90) * (Math.PI / 180);
      const frac = sector.dominant.km / 100;
      const ex = cx + Math.cos(angle) * frac * maxR;
      const ey = cy + Math.sin(angle) * frac * maxR;

      // Dashed line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = sector.dominant.color + '50';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead
      const aa = Math.atan2(ey - cy, ex - cx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 8 * Math.cos(aa - 0.35), ey - 8 * Math.sin(aa - 0.35));
      ctx.lineTo(ex - 8 * Math.cos(aa + 0.35), ey - 8 * Math.sin(aa + 0.35));
      ctx.closePath();
      ctx.fillStyle = sector.dominant.color + '70';
      ctx.fill();
    }
  }

  /* ── BUILD SECTOR TABLE ──────────────────────────────── */

  /**
   * Generate HTML for the 16-sector risk table
   */
  function buildSectorTableHTML(scanData) {
    if (!scanData || scanData.length === 0) {
      return '<div class="loading-state"><div class="spinner"></div></div>';
    }

    return scanData.map(sector => {
      const risk = sector.dominant;
      const rp = Math.round(sector.rainProb);
      const cc = Math.round(sector.cloudCover);

      return `
        <div class="sector-row ${risk.bgClass}">
          <span class="sector-dir">${sector.dir}</span>
          <div class="sector-info">
            <span class="sector-type">${risk.cloudType}</span>
            <span class="sector-sub">Rain ${rp}% · Cloud ${cc}% · ${sector.dominant.km}km</span>
          </div>
          <span class="sector-risk ${risk.bgClass}">${risk.label}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Calculate scan summary stats
   */
  function calculateSummary(scanData) {
    if (!scanData || scanData.length === 0) {
      return { activeSectors: 0, nearestRain: '--', mostDangerous: '--', eta: '--', risk: '--' };
    }

    const active = scanData.filter(s => s.dominant.level !== 'none' && s.dominant.level !== 'low');
    const dangerous = [...scanData].sort((a, b) => b.dominant.score - a.dominant.score)[0];

    const highRiskSectors = scanData.filter(s =>
      s.dominant.level === 'high' || s.dominant.level === 'extreme'
    );

    let eta = 'No immediate rain';
    if (highRiskSectors.length >= 4) {
      eta = 'Rain imminent in 1–2 hours';
    } else if (highRiskSectors.length >= 2) {
      eta = 'Rain likely in 2–4 hours';
    } else if (active.length >= 3) {
      eta = 'Rain possible in 3–5 hours';
    } else if (active.length >= 1) {
      eta = 'Monitor — light activity nearby';
    }

    const overallScore = scanData.reduce((sum, s) => sum + s.dominant.score, 0) / scanData.length;
    const overallRisk = overallScore >= 70 ? '🔴 HIGH' :
                        overallScore >= 40 ? '🟡 MEDIUM' : '🟢 LOW';

    const nearestRain = scanData
      .filter(s => s.d50.rainProb >= 30)
      .map(s => `${s.dir} (50km)`)[0] ||
      scanData
      .filter(s => s.d100.rainProb >= 30)
      .map(s => `${s.dir} (100km)`)[0] ||
      'None detected';

    return {
      activeSectors: active.length,
      nearestRain,
      mostDangerous: dangerous ? `${dangerous.dir} — ${dangerous.dominant.label}` : 'None',
      eta,
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
    classifyRisk,
    drawCompass,
    drawSweepOverlay,
    buildSectorTableHTML,
    calculateSummary,
    // For external access to last scan results
    getLastScan: () => lastScanData
  };

})();

window.StormCompass = StormCompass;
