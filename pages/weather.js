const LOCATION_STORAGE_KEY = "location_data";

// A saved location (from a previously-resolved zip code, or manual lat/lon)
// overrides config.js's hardcoded default as soon as the page loads.
function loadSavedLocation() {
  const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse saved location", e);
    return null;
  }
}

// Persists the location and makes it take effect immediately: updates the
// in-memory config the fetch functions below read from, and drops the
// cached forecast promise so the next lookup uses the new coordinates.
function saveLocation(lat, lon, zip) {
  const location = { lat: Number(lat), lon: Number(lon), zip: zip || null };
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  window.APP_CONFIG.LOCATION = { lat: location.lat, lon: location.lon };
  dailyForecastDaysPromise = null;
  return location;
}

// Cheap in-memory guard against re-resolving the same zip code twice in a
// row (e.g. hitting submit again without changing it) -- the real
// no-need-to-look-it-up-again cache is loadSavedLocation() reusing what's
// already in localStorage, this is just belt-and-suspenders.
async function resolveZipToLatLon(zip) {
  const saved = loadSavedLocation();
  if (saved && saved.zip === zip) {
    return { latitude: saved.lat, longitude: saved.lon };
  }

  const params = new URLSearchParams({ zip });
  const res = await fetch(`${window.APP_CONFIG.GEOCODE_API_BASE}/geocode?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Geocode API returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const savedLocation = loadSavedLocation();
if (savedLocation) {
  window.APP_CONFIG.LOCATION = { lat: savedLocation.lat, lon: savedLocation.lon };
}

let dailyForecastDaysPromise = null;

function hasLocation() {
  const location = window.APP_CONFIG.LOCATION;
  return Boolean(location && location.lat != null && location.lon != null);
}

// Fetched once and cached — every caller (the weather section render below,
// and calendar.js's per-day lookup) shares the same in-flight/settled request.
function fetchDailyForecastDays() {
  if (!hasLocation()) return Promise.resolve([]);
  if (!dailyForecastDaysPromise) {
    const params = new URLSearchParams({
      lat: window.APP_CONFIG.LOCATION.lat,
      lon: window.APP_CONFIG.LOCATION.lon,
      unitsSystem: "IMPERIAL",
      days: 10,
      // The API pages results separately from `days` -- pageSize defaults to
      // 5, so without this we'd only ever see the first 5 days back.
      pageSize: 10,
    });
    dailyForecastDaysPromise = fetch(`${window.APP_CONFIG.GOOGLE_WEATHER_API_BASE}/forecast/daily?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
        return res.json();
      })
      .then((data) => data.forecastDays);
  }
  return dailyForecastDaysPromise;
}

// forecastDays is already one-per-calendar-day, so this just matches on a
// "YYYY-M-D" dateString (the same non-padded format calendar.js's
// getFormattedDay produces) against each day's displayDate.
async function getWeatherForDateString(dateString) {
  const days = await fetchDailyForecastDays().catch((e) => {
    console.error("Failed to fetch weather", e);
    return [];
  });

  const day = days.find((d) => displayDateString(d.displayDate) === dateString);
  if (!day) return null;

  return dayToWeather(day);
}

function displayDateString(displayDate) {
  return `${displayDate.year}-${displayDate.month}-${displayDate.day}`;
}

function dayToWeather(day) {
  const condition = day.daytimeForecast.weatherCondition;
  return {
    temperature: Math.round(day.maxTemperature.degrees),
    temperatureUnit: day.maxTemperature.unit === "FAHRENHEIT" ? "F" : "C",
    weatherType: condition.type,
    description: condition.description.text,
    iconUrl: `${condition.iconBaseUri}.svg`,
  };
}

const HOURLY_FORECAST_COUNT = 12;

async function fetchHourlyForecastHours() {
  if (!hasLocation()) return [];

  const params = new URLSearchParams({
    lat: window.APP_CONFIG.LOCATION.lat,
    lon: window.APP_CONFIG.LOCATION.lon,
    unitsSystem: "IMPERIAL",
    hours: HOURLY_FORECAST_COUNT,
  });
  const res = await fetch(`${window.APP_CONFIG.GOOGLE_WEATHER_API_BASE}/forecast/hourly?${params.toString()}`);
  if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
  const data = await res.json();
  return data.forecastHours;
}

function formatHour(hours) {
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour} ${period}`;
}

async function renderWeatherSection() {
  const weatherDOM = document.querySelector("#weather-section");
  weatherDOM.innerHTML = "";
  const hours = await fetchHourlyForecastHours().catch((e) => {
    console.error("Failed to fetch weather", e);
    return [];
  });

  for (const hour of hours) {
    const condition = hour.weatherCondition;
    const div = document.createElement("div");
    div.className = "hourly-weather-entry";

    const timeSpan = document.createElement("span");
    timeSpan.className = "hour";
    timeSpan.textContent = formatHour(hour.displayDateTime.hours);

    const img = document.createElement("img");
    img.src = `${condition.iconBaseUri}.svg`;
    img.alt = condition.description.text;
    img.title = condition.description.text;
    img.width = 32;
    img.height = 32;

    const tempSpan = document.createElement("span");
    tempSpan.className = "temp";
    tempSpan.textContent = `${Math.round(hour.temperature.degrees)}°${hour.temperature.unit === "FAHRENHEIT" ? "F" : "C"}`;

    div.appendChild(timeSpan);
    div.appendChild(img);
    div.appendChild(tempSpan);
    weatherDOM.appendChild(div);
  }
}

const WEATHER_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

renderWeatherSection();

// Drop the cached daily forecast and re-render the standalone weather
// section every hour. The calendar's per-day weather icons pick up the
// fresh data the next time they're rendered too (calendar.js already
// re-renders every 5 minutes for calendar sync), so nothing else to wire up.
setInterval(() => {
  dailyForecastDaysPromise = null;
  renderWeatherSection();
}, WEATHER_REFRESH_INTERVAL_MS);
