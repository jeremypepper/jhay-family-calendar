const LOCALE_TIMESTRING_OPTIONS = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
}

async function fetchCalendarList() {
  const listEl = document.getElementById("calendar-list");
  listEl.innerHTML = "";

  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (handleUnauthorized(res)) return;
    console.error("Failed to fetch calendar list", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const calendarsFormData = getLocalStorageCalendarSelections();
  setCalendarsSectionVisible(!hasSavedCalendarSelection());
  prefillLocationInputs();

  for (const cal of data.items || []) {
    const li = document.createElement("li");
    const checkbox = document.createElement("input")
    checkbox.setAttribute("type", "checkbox")
    checkbox.setAttribute("name", cal.id)
    if (calendarsFormData[cal.id]) {
        checkbox.setAttribute("checked", "true")
    }
    const span = document.createElement("span");
    span.textContent = cal.summary + (cal.primary ? " (primary)" : "");
    li.appendChild(checkbox)
    li.appendChild(span)
    listEl.appendChild(li);
  }
  const selectButton = document.getElementById("cal-select-btn");
  const form = document.querySelector("#calendars-form")
  form.addEventListener("submit", async function(event) {
    event.preventDefault()
    const formData = new FormData(form)
    const formJsonObject = {};
    formData.forEach((value, key) => formJsonObject[key] = value);

    const zip = formJsonObject.zip
    const manualLat = formJsonObject.lat
    const manualLon = formJsonObject.lon
    delete formJsonObject.zip
    delete formJsonObject.lat
    delete formJsonObject.lon

    localStorage.setItem("calendars-form-data", JSON.stringify(formJsonObject))
    if (Object.keys(formJsonObject).length > 0) {
      setCalendarsSectionVisible(false)
    }

    if (zip) {
      try {
        const result = await resolveZipToLatLon(zip)
        saveLocation(result.latitude, result.longitude, zip)
        document.getElementById("lat-input").value = result.latitude
        document.getElementById("lon-input").value = result.longitude
        renderWeatherSection()
      } catch (e) {
        console.error("Failed to resolve zip code to a location", e)
      }
    } else if (manualLat && manualLon) {
      saveLocation(manualLat, manualLon, null)
      renderWeatherSection()
    }

    fetchAndDisplayCalendarsData(accessToken)
  });
  selectButton.style.display = "block";
  fetchAndDisplayCalendarsData(accessToken)
}

function prefillLocationInputs() {
  const saved = loadSavedLocation()
  const location = saved || window.APP_CONFIG.LOCATION
  if (!location) return

  const zipInput = document.getElementById("zip-input")
  const latInput = document.getElementById("lat-input")
  const lonInput = document.getElementById("lon-input")
  if (zipInput && saved && saved.zip) zipInput.value = saved.zip
  if (latInput && location.lat != null) latInput.value = location.lat
  if (lonInput && location.lon != null) lonInput.value = location.lon
}

function getLocalStorageCalendarSelections() {
  let calendarsFormData = {};
    try {
    calendarsFormData = JSON.parse(localStorage.getItem("calendars-form-data"))
  } catch(e) {
    log.error("could not parse cal form data", e)
  }
  // for empty data
  if (!calendarsFormData) {
    calendarsFormData = {}
  }
  return calendarsFormData
}

function hasSavedCalendarSelection() {
  return Object.keys(getLocalStorageCalendarSelections()).length > 0
}

function setCalendarsSectionVisible(visible) {
  document.getElementById("calendars-section").style.display = visible ? "" : "none"
}

document.getElementById("clock").addEventListener("click", () => {
  const section = document.getElementById("calendars-section")
  setCalendarsSectionVisible(section.style.display === "none")
});

async function fetchAndDisplayCalendarsData(accessToken) {
    const calDom = document.querySelector("#cal-section")
    calDom.innerHTML = ""
    const nowDay = getStartOfToday()
    const tomorrowDay = getTomorrow(nowDay)
    const endDay = getEndOfWeek(nowDay)
    const calData = await fetchCalendarsData(accessToken);
    const ol = document.createElement("ol")
    for (let currentDay = new Date(nowDay); currentDay <= endDay; currentDay.setDate(currentDay.getDate() + 1)) {
        const formattedDay = getFormattedDay(currentDay);
        const li = document.createElement("li")
        const entriesForDate = calData[formattedDay.dateString]

        const h3 = document.createElement("h3")
        let dateMarkup = `<span class="monthname">${formattedDay.monthName}</span> <span class="dayofweeknumber">${formattedDay.parsedDate.getDate()}</span>`
        if (nowDay.getTime() === currentDay.getTime()) {
            dateMarkup += "<span> Today</span>";
        } else if (tomorrowDay.getTime() === currentDay.getTime()) {
            dateMarkup += "<span> Tomorrow</span>";
        } else {
            dateMarkup += `<span> ${formattedDay.dayName}</span>`;
        }
        const weather = await getWeatherForDateString(formattedDay.dateString)
        let weatherMarkup = ""
        if (weather) {
            weatherMarkup = `<span class="temp">${weather.temperature}°${weather.temperatureUnit}</span> <img class="weather-icon" src="${weather.iconUrl}" alt="${weather.description}" title="${weather.description}" width="24" height="24">`
        }
        h3.innerHTML = `<span class="day-date">${dateMarkup}</span><span class="day-weather">${weatherMarkup}</span>`
        li.appendChild(h3)
        ol.appendChild(li)
        const innerOl = document.createElement("ol")
        li.appendChild(innerOl)
        if (entriesForDate && entriesForDate.length > 0) {
            for(const item of entriesForDate) {
                const innerLi = document.createElement("li")
                const timeSpan = document.createElement("span")
                timeSpan.className = "event-time"
                timeSpan.textContent = item.friendlyTime
                const summarySpan = document.createElement("span")
                summarySpan.className = "event-summary"
                summarySpan.textContent = item.summary
                innerLi.appendChild(timeSpan)
                innerLi.appendChild(summarySpan)
                innerOl.appendChild(innerLi)
            }
        } else {
            const innerLi = document.createElement("li")
            innerLi.innerHTML = "<i>no events</i>"
            innerOl.appendChild(innerLi)
        }
        calDom.appendChild(ol)
    }
    fitCalSectionToViewport()
}

// This is meant for a small, unscrollable display -- rather than letting
// the page grow taller than the viewport (forcing a scrollbar) or squeezing
// everything to fit, we give #cal-section exactly the vertical room it has
// left and let column-fill: auto (see styles.css) clip whichever later days
// don't fit, since days are appended in chronological order.
function fitCalSectionToViewport() {
    const calDom = document.querySelector("#cal-section")
    const top = calDom.getBoundingClientRect().top
    const bottomMargin = parseFloat(getComputedStyle(calDom).marginBottom) || 0
    calDom.style.height = `${window.innerHeight - top - bottomMargin}px`
}

window.addEventListener("resize", fitCalSectionToViewport)

// syncToken makes repeat fetches cheap (no-op when nothing changed), so it's
// fine to poll on a timer instead of needing push notifications from Google.
const CALENDAR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  if (accessToken && hasSavedCalendarSelection()) {
    fetchAndDisplayCalendarsData(accessToken);
  }
}, CALENDAR_REFRESH_INTERVAL_MS);

async function fetchCalendarsData(accessToken) {
    const calendarsFormData = getLocalStorageCalendarSelections();
    let calData = []
    for (const calId of Object.keys(calendarsFormData)) {
        calData = calData.concat(await fetchCalendarData(calId, accessToken))
    }
    calData.sort((a, b) => a.parsedDate - b.parsedDate)
    const groupedDays = Object.groupBy(calData, entry => entry.dateString)
    return groupedDays
}

function getStartOfToday() {
    const nowDay = new Date()
  nowDay.setHours(0)
  nowDay.setMinutes(0)
  nowDay.setSeconds(0)
  nowDay.setMilliseconds(0)
  return nowDay;
}

function getEndOfWeek(nowDay) {
  let endDay = new Date(nowDay)
  endDay.setDate(endDay.getDate() + 8)
  endDay = new Date(endDay -1)
  return endDay
}

function getTomorrow(date) {
  let tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

// Per-calendar incremental sync state, kept in memory for the life of the
// page. googleapis.com won't let syncToken be combined with timeMin/timeMax/
// orderBy, so once we have a token we stop date-filtering server-side and
// instead keep every event we've ever seen for that calendar, applying
// add/update/delete from each sync response, then filter to the display
// window ourselves when rendering.
const calendarSyncState = new Map();

function getCalendarSyncState(calendarId) {
  if (!calendarSyncState.has(calendarId)) {
    calendarSyncState.set(calendarId, { syncToken: null, eventsById: new Map() });
  }
  return calendarSyncState.get(calendarId);
}

async function fetchCalendarData(calendarId, accessToken) {
  const state = getCalendarSyncState(calendarId);
  const nowDay = getStartOfToday()
  const endDay = getEndOfWeek(nowDay)

  let pageToken;
  while (true) {
    const params = new URLSearchParams({ singleEvents: "true" });
    if (state.syncToken) {
      params.set("syncToken", state.syncToken);
    } else {
      params.set("timeMin", nowDay.toISOString());
      params.set("timeMax", endDay.toISOString());
      params.set("orderBy", "startTime");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events?" + params.toString(),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 410) {
      // Token expired/invalid -- Google requires a full resync from scratch.
      state.syncToken = null;
      state.eventsById.clear();
      return fetchCalendarData(calendarId, accessToken);
    }

    if (!res.ok) {
      if (handleUnauthorized(res)) return [];
      console.error("Failed to fetch calendar events", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    for (const item of data.items || []) {
      if (item.status === "cancelled") {
        state.eventsById.delete(item.id);
      } else {
        state.eventsById.set(item.id, item);
      }
    }

    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
      continue;
    }
    if (data.nextSyncToken) {
      state.syncToken = data.nextSyncToken;
    }
    break;
  }

  const calData = []
  for (const item of state.eventsById.values()) {
    const startValue = item.start && (item.start.dateTime || item.start.date)
    if (!startValue) continue;

    const formattedDay = getFormattedDay(startValue)
    if (formattedDay.parsedDate < nowDay || formattedDay.parsedDate > endDay) continue;

    calData.push({
        ...formattedDay,
        summary: item.summary,
        friendlyDate: startValue,
        friendlyTime: formattedDay.parsedDate.toLocaleTimeString([], LOCALE_TIMESTRING_OPTIONS),
        dateTime: item.start.dateTime,
        date: item.start.date
    })
  }
  return calData
}

function getFormattedDay(dateString) {
    const parsedDate = new Date(dateString)
    const year = parsedDate.getFullYear();     // Returns the 4-digit year (e.g., 2026)
    const month = parsedDate.getMonth() + 1;   // Returns 1-12 (0-indexed, so add 1)
    const day = parsedDate.getDate();         // Returns 1-31
    const hours = parsedDate.getHours();      // 0-23
    const minutes = parsedDate.getMinutes();  // 0-59
    return {
        dateString: `${year}-${month}-${day}`,
        timeString: `${hours}:${minutes}`,
        parsedDate,
        dayName: parsedDate.toLocaleDateString('en-US', { weekday: 'long' }),
        monthName: parsedDate.toLocaleDateString('en-US', { month: 'short' }),
    }
}
