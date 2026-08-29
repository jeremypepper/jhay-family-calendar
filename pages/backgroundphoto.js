const UNSPLASH_API_BASE = "https://api.unsplash.com";
const UNSPLASH_APP_NAME = "jhay-calendar";
async function setBackgroundPhoto() {
  const params = new URLSearchParams({
    collections: window.APP_CONFIG.UNSPLASH_COLLECTION_ID,
    orientation: "landscape",
    client_id: window.APP_CONFIG.UNSPLASH_CLIENT_ID,
  });

  const res = await fetch(`${UNSPLASH_API_BASE}/photos/random?${params.toString()}`);
  if (!res.ok) {
    console.error("Failed to fetch background photo", res.status, await res.text());
    return;
  }

  const photo = await res.json();
  document.body.style.backgroundImage = `url("${photo.urls.full}")`;
  document.body.style.backgroundColor = getBlendColor(photo.color)
  document.body.style.backgroundBlendMode = "multiply"
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundAttachment = "fixed";
  document.body.style.backgroundRepeat = "no-repeat";

  trackDownload(photo);
  renderAttribution(photo);
}

// The multiply-blend color that gets layered over the photo to keep
// overlaid (near-white) text readable. Biased darker across the board:
// even dark photos get real darkening now (instead of a near-white
// no-op), and bright photos darken further, down to rgb(64, 64, 64).
const BLEND_DARK_THRESHOLD = 80;
const BLEND_MIN_VALUE = 64;
const BLEND_MAX_VALUE = 170;

function getBlendColor(hexColor) {
  if (!hexColor) return `rgb(${BLEND_MAX_VALUE}, ${BLEND_MAX_VALUE}, ${BLEND_MAX_VALUE})`;

  const { r, g, b } = hexToRgb(hexColor);
  const brightness = (r + g + b) / 3;
  if (brightness <= BLEND_DARK_THRESHOLD) {
    return `rgb(${BLEND_MAX_VALUE}, ${BLEND_MAX_VALUE}, ${BLEND_MAX_VALUE})`;
  }

  const value = Math.max(BLEND_MIN_VALUE, BLEND_MAX_VALUE - (brightness - BLEND_DARK_THRESHOLD));
  return `rgb(${value}, ${value}, ${value})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

// Unsplash's API guidelines require pinging download_location whenever a
// photo is used/displayed on a page, not only when it's literally downloaded.
function trackDownload(photo) {
  const downloadLocation = photo.links && photo.links.download_location;
  if (!downloadLocation) return;

  fetch(`${downloadLocation}&client_id=${window.APP_CONFIG.UNSPLASH_CLIENT_ID}`).catch((e) =>
    console.error("Failed to register Unsplash download", e)
  );
}

// Unsplash also requires visible attribution: the photographer's name linked
// back to their profile (with a referral tag), per their API guidelines.
// Updates the existing link in place (rather than creating a new one each
// time) since this runs again on every background refresh.
function renderAttribution(photo) {
  let link = document.getElementById("photo-attribution");
  if (!link) {
    link = document.createElement("a");
    link.id = "photo-attribution";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
  }
  link.href = `${photo.user.links.html}?utm_source=${UNSPLASH_APP_NAME}&utm_medium=referral`;
  link.textContent = `Photo by ${photo.user.name} on Unsplash`;
}

const BACKGROUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

setBackgroundPhoto();
setInterval(setBackgroundPhoto, BACKGROUND_REFRESH_INTERVAL_MS);
