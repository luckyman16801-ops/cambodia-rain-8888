# 🌦 Cambodia Rain 8888 Pro V3
### MR TP AI Weather Intelligence Center

> Production-grade AI-powered weather monitoring platform for Phnom Penh, Cambodia.  
> 16-direction regional cloud scan · Real-time radar · Telegram alerts via GitHub Actions

---

## 📍 Coverage

| Parameter | Value |
|-----------|-------|
| **Center** | 11.5641°N, 104.9161°E — Phnom Penh |
| **Radius** | 100 km |
| **Directions** | 16 (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW) |
| **Scan Points** | 32 (16 dirs × 50km & 100km) |
| **Auto-refresh** | Every 5 minutes |
| **Telegram Alerts** | Every 10 minutes via GitHub Actions |

---

## 🚀 Features

### 1. Modern Dashboard
- Professional dark mission-control theme
- Fully responsive — mobile, tablet, desktop
- Khmer + English language toggle
- MR TP branding throughout

### 2. Weather Engine (Open-Meteo)
- Temperature, feels-like, dew point
- Humidity, pressure, UV index
- Wind speed & 16-point compass direction
- Rain now (mm/h), 1-hour total, 24-hour total
- Cloud cover (low / mid / high)

### 3. Regional Cloud Risk Scan
16 directions × 100km around Phnom Penh:
- Cloud cover per sector
- Rain probability per sector
- Risk score (CLEAR / LOW / MODERATE / HIGH / EXTREME)
- Cloud type classification (Cumulus / Stratocumulus / Altostratus / Nimbostratus / Cumulonimbus)

### 4. AI Rain Confidence Engine
6-factor weighted scoring model (0–100%):

| Factor | Max Score |
|--------|-----------|
| Cloud Cover | 20 pts |
| Rain Forecast | 30 pts |
| Humidity | 20 pts |
| Pressure Trend | 15 pts |
| Wind Speed | 10 pts |
| Active Sectors | 5 pts |

Risk levels:
- 🟢 **LOW RISK** — 0–40%
- 🟡 **MEDIUM RISK** — 41–70%
- 🔴 **HIGH RISK** — 71–100%

### 5. Storm Compass Pro
- Animated 16-sector radar-style canvas compass
- Sector arcs color-coded by risk level
- Cloud illustrations at 50km and 100km points
- Rain drop and lightning bolt animations
- Arrow indicators toward active rain systems

### 6. Live Radar
- RainViewer rain radar tiles
- Esri satellite imagery layer
- 100km coverage circle overlay
- Center marker with popup
- Zoom, pan, layer toggle

### 7. Telegram Alert System
- Automated via GitHub Actions every 10 minutes
- No secrets in code — GitHub Secrets only
- Configurable threshold (default: 40% confidence)
- Error notification on workflow failure
- Retry logic (3 attempts, 5s delay)

---

## 📁 File Structure

```
cambodia-rain-8888/
├── index.html          — Main HTML (all pages)
├── styles.css          — Production CSS (dark theme, responsive)
├── app.js              — Application controller
├── weather.js          — Open-Meteo API integration + AI engine
├── stormCompass.js     — 16-direction scan + canvas renderer
├── telegram.py         — GitHub Actions alert bot
├── .github/
│   └── workflows/
│       └── weather.yml — GitHub Actions workflow (10-min schedule)
└── README.md           — This file
```

---

## ⚡ Quick Deploy

### GitHub Pages (free hosting)

1. Fork or push this repo to GitHub
2. Go to **Settings → Pages**
3. Set Source: **Deploy from branch → main → / (root)**
4. Your site is live at: `https://<username>.github.io/cambodia-rain-8888/`

### Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a bot → copy the token
3. Get your chat/channel ID
4. Go to your repo: **Settings → Secrets → Actions**
5. Add two secrets:

| Secret Name | Value |
|-------------|-------|
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Your chat or channel ID |

6. Go to **Actions tab → Enable Actions**
7. The workflow runs automatically every 10 minutes

### Manual Alert Test

Go to **Actions → Cambodia Rain 8888 Pro — Weather Alert Bot → Run workflow**

---

## 🔧 Configuration

### Change Alert Threshold

In `weather.yml`, find:
```yaml
--threshold 40
```
Change `40` to your preferred minimum confidence score.

### Change Refresh Interval

In `app.js`, find:
```js
REFRESH_MS: 5 * 60 * 1000,  // 5 minutes
```

### Change Coverage Radius

In `stormCompass.js`, change scan distances:
```js
const [data50, data100] = await Promise.allSettled([
  Weather.fetchPointWeather(pt50[0], pt50[1]),   // 50km
  Weather.fetchPointWeather(pt100[0], pt100[1])  // 100km
]);
```

---

## 🌐 APIs Used

| Service | URL | API Key Required |
|---------|-----|-----------------|
| Open-Meteo | https://api.open-meteo.com | ❌ Free, no key |
| RainViewer | https://tilecache.rainviewer.com | ❌ Free, no key |
| Esri Satellite | ArcGIS REST Services | ❌ Free tiles |
| Telegram Bot | https://api.telegram.org | ✅ Bot token only |

---

## 📱 Example Telegram Alert

```
🌦 MR TP AI WEATHER
📍 Phnom Penh, Cambodia

Regional Cloud Risk Scan
🔴 HIGH RISK
Confidence: 84%

🌡️ Temp: 32°C (Feels 38°C)
💧 Humidity: 88%
🌧️ Rain Prob: 75%
☁️ Cloud Cover: 92%
📊 Pressure: 1005 hPa
🌬️ Wind: 22 km/h SW
🌤 Condition: ⛈ Thunderstorm

⚠️ Rain likely within 1–2 hours. Seek shelter.

🕐 24 Jun 2026 15:30 (UTC+7)
📡 Cambodia Rain 8888 Pro V3
```

---

## 🔒 Security

- **No API keys in source code** — all secrets via GitHub Secrets
- **No hardcoded tokens** — `telegram.py` reads from environment variables only
- Input validation on all user-facing fields
- API timeouts + retry logic
- Error logging without exposing sensitive data

---

## 📊 Performance

- **No build step** — plain HTML/CSS/JS, deploys instantly
- **Lazy radar init** — Leaflet only initializes when Radar tab is opened
- **Parallel API calls** — all 32 compass scan points fetched concurrently
- **CDN assets** — Leaflet, Google Fonts via CDN
- **Minimal dependencies** — zero npm packages

---

## 🌏 Provinces Supported

Phnom Penh · Siem Reap · Battambang · Sihanoukville · Kampong Cham · Kratie · Kampong Thom · Takeo · Pursat · Kampot · Kandal · Ratanakiri · Mondulkiri

---

## 📄 License

MIT License — MR TP · Cambodia Rain 8888 Pro V3

---

*Built with ❤️ for Cambodia — MR TP AI Weather Intelligence Center*
