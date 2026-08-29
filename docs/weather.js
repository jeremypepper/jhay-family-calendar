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

const HOURLY_FORECAST_COUNT = 16;

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

  renderHourlyLineChart(weatherDOM, hours);
}

// Minimalist single-series line chart: no axes/gridlines/legend (one series
// needs none), a thin line, and direct labels only at the low/high points --
// everything else (most hour ticks) stays out rather than labeling every dot.
const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_WIDTH = 280;
const CHART_HEIGHT = 164;
const CHART_PADDING_X = 20;
// Extra room up top for the icon + value label stacked above a high point.
const CHART_PADDING_TOP = 50;
const CHART_PADDING_BOTTOM = 24;
const CHART_ICON_SIZE = 16;

function renderHourlyLineChart(weatherDOM, hours) {
  if (hours.length === 0) return;

  const plotWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const temps = hours.map((h) => h.temperature.degrees);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp || 1;

  const points = hours.map((h, i) => ({
    x: CHART_PADDING_X + (hours.length === 1 ? 0 : (i / (hours.length - 1)) * plotWidth),
    y: CHART_PADDING_TOP + plotHeight - ((h.temperature.degrees - minTemp) / tempRange) * plotHeight,
    hour: h.displayDateTime.hours,
    temp: Math.round(h.temperature.degrees),
    iconUrl: `${h.weatherCondition.iconBaseUri}.svg`,
    description: h.weatherCondition.description.text,
  }));

  const minIndex = temps.indexOf(minTemp);
  const maxIndex = temps.indexOf(maxTemp);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  svg.setAttribute("class", "hourly-line-chart");

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("class", "hourly-line-chart-line");
  svg.appendChild(path);

  const lastIndex = points.length - 1;
  // Targets ~5-6 hour ticks regardless of how many points there are, so a
  // denser chart (more hours) doesn't crowd its axis labels into each other.
  const hourTickInterval = Math.max(1, Math.ceil(points.length / 5));

  // A hairline baseline above the hour labels, spanning first-to-last point,
  // with a vertical drop from the first/last point's actual position on the
  // curve down through the baseline to its time label -- ties the point to
  // its time directly, rather than just marking the chart's time extent.
  const axisY = CHART_HEIGHT - CHART_PADDING_BOTTOM + 6;
  const axisLine = document.createElementNS(SVG_NS, "line");
  axisLine.setAttribute("x1", points[0].x);
  axisLine.setAttribute("y1", axisY);
  axisLine.setAttribute("x2", points[lastIndex].x);
  axisLine.setAttribute("y2", axisY);
  axisLine.setAttribute("class", "hourly-line-chart-axis");
  svg.appendChild(axisLine);

  [points[0], points[lastIndex]].forEach((p) => {
    const tick = document.createElementNS(SVG_NS, "line");
    tick.setAttribute("x1", p.x);
    tick.setAttribute("y1", p.y);
    tick.setAttribute("x2", p.x);
    tick.setAttribute("y2", axisY + 5);
    tick.setAttribute("class", "hourly-line-chart-axis");
    svg.appendChild(tick);
  });

  points.forEach((p, i) => {
    const isLabeled = i === minIndex || i === maxIndex || i === 0 || i === lastIndex;

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", isLabeled ? 4 : 2.5);
    dot.setAttribute("class", "hourly-line-chart-dot");
    svg.appendChild(dot);

    if (isLabeled) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", p.x);
      // Both labels sit above their dot -- the min point is always close to
      // the bottom edge (right where the hour ticks live), so "below" risked
      // colliding with them; "above" has room in every case that matters here.
      label.setAttribute("y", p.y - 10);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "hourly-line-chart-value");
      label.textContent = `${p.temp}°`;
      svg.appendChild(label);

      const icon = document.createElementNS(SVG_NS, "image");
      icon.setAttribute("href", p.iconUrl);
      icon.setAttribute("x", p.x - CHART_ICON_SIZE / 2);
      icon.setAttribute("y", p.y - 10 - 9 - 6 - CHART_ICON_SIZE);
      icon.setAttribute("width", CHART_ICON_SIZE);
      icon.setAttribute("height", CHART_ICON_SIZE);
      const iconTitle = document.createElementNS(SVG_NS, "title");
      iconTitle.textContent = p.description;
      icon.appendChild(iconTitle);
      svg.appendChild(icon);
    }

    // Hour ticks stay sparse so denser charts don't crowd their labels --
    // this is axis text, not a per-point value label. Start/end always show
    // regardless of the interval, so the chart's time range is never unclear.
    if (i % hourTickInterval === 0 || i === 0 || i === lastIndex) {
      const hourLabel = document.createElementNS(SVG_NS, "text");
      hourLabel.setAttribute("x", p.x);
      hourLabel.setAttribute("y", CHART_HEIGHT - 6);
      hourLabel.setAttribute("text-anchor", "middle");
      hourLabel.setAttribute("class", "hourly-line-chart-hour");
      hourLabel.textContent = formatHour(p.hour).replace(" ", "");
      svg.appendChild(hourLabel);
    }
  });

  weatherDOM.appendChild(svg);
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
