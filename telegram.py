#!/usr/bin/env python3
"""
telegram.py — Cambodia Rain 8888 Pro V3
Telegram Alert Bot via GitHub Actions
MR TP AI Weather Intelligence Center

Sends weather alerts to Telegram when rain risk is detected.
Credentials are loaded from environment variables (GitHub Secrets).
Never hardcode tokens in this file.

Usage:
    python telegram.py [--force] [--threshold 60]

Environment Variables (set as GitHub Secrets):
    TELEGRAM_BOT_TOKEN  — Bot API token from @BotFather
    TELEGRAM_CHAT_ID    — Target chat/channel ID
"""

import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime, timezone, timedelta
from urllib import request, error

# ─── LOGGING ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("cambodia-rain-bot")

# ─── CONSTANTS ────────────────────────────────────────────────────────────
PHNOM_PENH_LAT = 11.5641
PHNOM_PENH_LON = 104.9161
TZ_OFFSET      = timedelta(hours=7)       # Asia/Phnom_Penh (UTC+7)
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
TELEGRAM_URL   = "https://api.telegram.org/bot{token}/sendMessage"
MAX_RETRIES    = 3
RETRY_DELAY    = 5   # seconds between retries
REQUEST_TIMEOUT = 15 # seconds

# Risk thresholds
RISK_HIGH_MIN   = 71
RISK_MEDIUM_MIN = 41


# ─── TIME HELPERS ─────────────────────────────────────────────────────────
def now_phnompenh() -> datetime:
    """Current time in Phnom Penh (UTC+7)."""
    return datetime.now(timezone.utc) + TZ_OFFSET


def format_time(iso_str: str) -> str:
    """Format ISO datetime string to HH:MM."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        local = dt + TZ_OFFSET
        return local.strftime("%H:%M")
    except Exception:
        return "--:--"


# ─── HTTP HELPERS ──────────────────────────────────────────────────────────
def http_get(url: str, timeout: int = REQUEST_TIMEOUT) -> dict:
    """Simple HTTP GET returning parsed JSON. Raises on failure."""
    req = request.Request(
        url,
        headers={"User-Agent": "CambodiaRain8888Bot/3.0"}
    )
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post(url: str, payload: dict, timeout: int = REQUEST_TIMEOUT) -> dict:
    """Simple HTTP POST with JSON body. Raises on failure."""
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "CambodiaRain8888Bot/3.0"
        }
    )
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def retry(func, retries: int = MAX_RETRIES, delay: int = RETRY_DELAY):
    """Retry a function up to `retries` times with delay."""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            return func()
        except Exception as e:
            last_err = e
            log.warning(f"Attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(delay)
    raise last_err


# ─── WEATHER ENGINE ────────────────────────────────────────────────────────
def fetch_weather(lat: float, lon: float) -> dict:
    """
    Fetch current weather + hourly forecast from Open-Meteo.
    Returns parsed and structured weather data.
    """
    params = "&".join([
        f"latitude={lat}",
        f"longitude={lon}",
        "current=temperature_2m,relative_humidity_2m,apparent_temperature,"
        "precipitation,rain,weather_code,cloud_cover,wind_speed_10m,"
        "wind_direction_10m,pressure_msl,dew_point_2m",
        "hourly=precipitation_probability,precipitation,cloud_cover,"
        "weather_code,wind_speed_10m",
        "daily=weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_sum,precipitation_probability_max,sunrise,sunset",
        "timezone=Asia%2FBangkok",
        "forecast_days=2"
    ])
    url = f"{OPEN_METEO_URL}?{params}"

    log.info(f"Fetching weather for {lat},{lon}...")
    data = retry(lambda: http_get(url))
    return parse_weather(data)


def parse_weather(raw: dict) -> dict:
    """Parse Open-Meteo raw response into clean structured data."""
    c = raw.get("current", {})
    h = raw.get("hourly", {})
    d = raw.get("daily", {})

    # Find current hour index
    times = h.get("time", [])
    now_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
    # Adjust for UTC+7
    local_now = now_phnompenh()
    local_prefix = local_now.strftime("%Y-%m-%dT%H")

    hi = 0
    for i, t in enumerate(times):
        if t.startswith(local_prefix):
            hi = i
            break

    rain_probs = h.get("precipitation_probability", [])
    current_rain_prob = rain_probs[hi] if hi < len(rain_probs) else 0

    # Next 6 hours rain probability
    next6_probs = rain_probs[hi:hi+6] if rain_probs else []
    max_next6 = max(next6_probs) if next6_probs else 0

    return {
        "temp":         c.get("temperature_2m"),
        "feels_like":   c.get("apparent_temperature"),
        "humidity":     c.get("relative_humidity_2m"),
        "rain":         c.get("rain", 0),
        "precipitation": c.get("precipitation", 0),
        "weather_code": c.get("weather_code", 0),
        "cloud_cover":  c.get("cloud_cover", 0),
        "wind_speed":   c.get("wind_speed_10m", 0),
        "wind_deg":     c.get("wind_direction_10m", 0),
        "pressure":     c.get("pressure_msl", 1010),
        "dew_point":    c.get("dew_point_2m"),
        "rain_prob":         current_rain_prob,
        "max_rain_prob_6h":  max_next6,
        "today_temp_max":    d.get("temperature_2m_max", [None])[0],
        "today_temp_min":    d.get("temperature_2m_min", [None])[0],
        "today_rain_sum":    d.get("precipitation_sum", [0])[0],
        "today_rain_prob":   d.get("precipitation_probability_max", [0])[0],
        "sunrise":           format_time(d["sunrise"][0]) if d.get("sunrise") else "--",
        "sunset":            format_time(d["sunset"][0])  if d.get("sunset")  else "--",
        "hourly_rain_prob":  rain_probs[hi:hi+12],
    }


# ─── WMO CODES ────────────────────────────────────────────────────────────
WMO = {
    0: "☀️ Clear Sky",  1: "🌤 Mainly Clear",  2: "⛅ Partly Cloudy",
    3: "☁️ Overcast",   45: "🌫 Fog",          51: "🌦 Drizzle",
    53: "🌦 Drizzle",   55: "🌧 Heavy Drizzle", 61: "🌧 Light Rain",
    63: "🌧 Rain",       65: "🌧 Heavy Rain",   80: "🌦 Showers",
    81: "🌧 Showers",   82: "⛈ Violent Showers", 95: "⛈ Thunderstorm",
    96: "⛈ Thunderstorm w/ Hail",  99: "⛈ Severe Thunderstorm"
}

WIND_DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
             "S","SSW","SW","WSW","W","WNW","NW","NNW"]

def wmo_desc(code: int) -> str:
    return WMO.get(code, "🌡 Unknown")

def wind_dir(deg: float) -> str:
    idx = round((deg % 360) / 22.5) % 16
    return WIND_DIRS[idx]


# ─── AI CONFIDENCE ENGINE ──────────────────────────────────────────────────
def calculate_confidence(weather: dict) -> dict:
    """
    Calculate AI Rain Confidence Score (0–100).
    Weighted 6-factor model.
    """
    cc = weather.get("cloud_cover", 0)
    rp = weather.get("rain_prob", 0)
    hu = weather.get("humidity", 0)
    pr = weather.get("pressure", 1010)
    ws = weather.get("wind_speed", 0)
    wc = weather.get("weather_code", 0)

    # Factor scores
    s_cloud    = 20 if cc >= 85 else 16 if cc >= 70 else 11 if cc >= 50 else 6 if cc >= 30 else 2
    s_rain     = 30 if rp >= 80 else 24 if rp >= 60 else 17 if rp >= 40 else 9 if rp >= 20 else 2
    s_humidity = 20 if hu >= 90 else 16 if hu >= 80 else 11 if hu >= 70 else 6 if hu >= 60 else 2
    s_pressure = 15 if pr <= 1005 else 11 if pr <= 1008 else 7 if pr <= 1011 else 4 if pr <= 1014 else 1
    s_wind     = 10 if ws >= 30 else 8 if ws >= 20 else 5 if ws >= 10 else 3 if ws >= 5 else 1

    # WMO code bonus
    bonus = 20 if wc >= 95 else 15 if wc >= 80 else 10 if wc >= 61 else 5 if wc >= 51 else 0

    total = min(100, s_cloud + s_rain + s_humidity + s_pressure + s_wind + bonus)

    if total >= RISK_HIGH_MIN:
        level, emoji = "HIGH",   "🔴"
    elif total >= RISK_MEDIUM_MIN:
        level, emoji = "MEDIUM", "🟡"
    else:
        level, emoji = "LOW",    "🟢"

    if total >= 71:
        eta = "⚠️ Rain likely within 1–2 hours. Seek shelter."
    elif total >= 51:
        eta = "🌤 Rain possible within 2–4 hours. Stay alert."
    elif total >= 31:
        eta = "⛅ Low chance of rain. Monitor conditions."
    else:
        eta = "☀️ Clear conditions expected."

    return {
        "total": total,
        "level": level,
        "emoji": emoji,
        "eta":   eta
    }


# ─── MESSAGE BUILDER ───────────────────────────────────────────────────────
def build_message(weather: dict, confidence: dict, city: str = "Phnom Penh") -> str:
    """Build formatted Telegram message."""
    ts = now_phnompenh().strftime("%d %b %Y %H:%M")
    rp = weather["rain_prob"]
    cc = weather["cloud_cover"]

    lines = [
        "🌦 *MR TP AI WEATHER*",
        f"📍 {city}, Cambodia",
        "",
        "Regional Cloud Risk Scan",
        f"{confidence['emoji']} *{confidence['level']} RISK*",
        f"Confidence: *{confidence['total']}%*",
        "",
        f"🌡️ Temp: {weather['temp']}°C (Feels {weather['feels_like']}°C)",
        f"💧 Humidity: {weather['humidity']}%",
        f"🌧️ Rain Prob: {rp}%",
        f"☁️ Cloud Cover: {cc}%",
        f"📊 Pressure: {round(weather['pressure'])} hPa",
        f"🌬️ Wind: {weather['wind_speed']} km/h {wind_dir(weather['wind_deg'])}",
        f"🌤 Condition: {wmo_desc(weather['weather_code'])}",
        "",
        confidence["eta"],
        "",
        f"🕐 {ts} (UTC+7)",
        "📡 Cambodia Rain 8888 Pro V3",
    ]
    return "\n".join(lines)


# ─── TELEGRAM SENDER ───────────────────────────────────────────────────────
def send_telegram(token: str, chat_id: str, message: str) -> bool:
    """
    Send message via Telegram Bot API.
    Returns True on success, False on failure.
    """
    url = TELEGRAM_URL.format(token=token)
    payload = {
        "chat_id":    chat_id,
        "text":       message,
        "parse_mode": "Markdown"
    }

    def _send():
        result = http_post(url, payload)
        if not result.get("ok"):
            raise RuntimeError(f"Telegram API error: {result}")
        return result

    try:
        result = retry(_send)
        msg_id = result.get("result", {}).get("message_id", "?")
        log.info(f"✅ Message sent successfully (id={msg_id})")
        return True
    except Exception as e:
        log.error(f"❌ Failed to send Telegram message: {e}")
        return False


# ─── SECRETS VALIDATION ────────────────────────────────────────────────────
def load_secrets() -> tuple[str, str]:
    """
    Load bot token and chat ID from environment variables.
    These MUST be set as GitHub Secrets — never hardcoded.
    """
    token   = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

    errors = []
    if not token:
        errors.append("TELEGRAM_BOT_TOKEN is not set")
    if not chat_id:
        errors.append("TELEGRAM_CHAT_ID is not set")
    if errors:
        for err in errors:
            log.error(f"Missing secret: {err}")
        log.error("Set these as GitHub Secrets under Settings → Secrets → Actions")
        sys.exit(1)

    return token, chat_id


# ─── ENTRY POINT ───────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Cambodia Rain 8888 Pro V3 — Telegram Weather Alert Bot"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Send alert regardless of risk level"
    )
    parser.add_argument(
        "--threshold", type=int, default=40,
        help="Minimum confidence score to trigger alert (default: 40)"
    )
    args = parser.parse_args()

    log.info("═══════════════════════════════════════")
    log.info("Cambodia Rain 8888 Pro V3 — Alert Bot")
    log.info("MR TP AI Weather Intelligence Center")
    log.info("═══════════════════════════════════════")

    # 1. Load secrets
    token, chat_id = load_secrets()
    log.info(f"Bot token: ...{token[-8:]}")
    log.info(f"Chat ID:   {chat_id}")

    # 2. Fetch weather
    try:
        weather = fetch_weather(PHNOM_PENH_LAT, PHNOM_PENH_LON)
        log.info(f"Weather fetched: temp={weather['temp']}°C, rain_prob={weather['rain_prob']}%, cloud={weather['cloud_cover']}%")
    except Exception as e:
        log.error(f"Failed to fetch weather: {e}")
        sys.exit(1)

    # 3. Calculate confidence
    confidence = calculate_confidence(weather)
    log.info(f"AI Confidence: {confidence['total']}% — {confidence['level']} RISK")

    # 4. Decide whether to send
    should_send = args.force or (confidence["total"] >= args.threshold)

    if not should_send:
        log.info(
            f"⏭  Confidence {confidence['total']}% < threshold {args.threshold}%. "
            "No alert sent."
        )
        sys.exit(0)

    # 5. Build and send message
    message = build_message(weather, confidence)
    log.info("Alert message:\n" + "─" * 40)
    print(message)
    print("─" * 40)

    success = send_telegram(token, chat_id, message)

    if not success:
        log.error("Alert delivery failed after retries")
        sys.exit(1)

    log.info("✅ Alert delivered successfully")


if __name__ == "__main__":
    main()
