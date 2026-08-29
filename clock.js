// 12-hour clock, hours:minutes only -- AM/PM is left out, it's implied.
// Also keeps the small full-date line under it in sync.
function updateClock() {
  const now = new Date();

  const clockEl = document.getElementById("clock");
  if (clockEl) {
    let hours = now.getHours() % 12;
    if (hours === 0) hours = 12;
    const minutes = String(now.getMinutes()).padStart(2, "0");
    clockEl.textContent = `${hours}:${minutes}`;
  }

  const dateEl = document.getElementById("date");
  if (dateEl) {
    const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
    const month = now.toLocaleDateString("en-US", { month: "short" });
    dateEl.textContent = `${weekday} ${month} ${now.getDate()}`;
  }
}

updateClock();
setInterval(updateClock, 1000 * 15);
