const UNSPLASH_API_BASE = "https://api.unsplash.com";
const UNSPLASH_APP_NAME = "jhay-calendar";

// Downloads the image fully via a plain <img>-style load (not fetch(), so
// the response ends up in the browser's normal image cache) and resolves
// once it's actually decoded and ready to paint.
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

const BACKGROUND_PHOTO_STORAGE_KEY = "background_photo_data";

// Fetches a brand-new random photo from Unsplash, caches it, and applies it.
// This is the only path that spends an Unsplash API call -- called on page
// load only when there's no cached photo yet, and always by the hourly timer.
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
  localStorage.setItem(BACKGROUND_PHOTO_STORAGE_KEY, JSON.stringify(photo));
  await applyBackgroundPhoto(photo);
}

function loadCachedBackgroundPhoto() {
  const raw = localStorage.getItem(BACKGROUND_PHOTO_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse cached background photo", e);
    return null;
  }
}

// Renders a given photo object -- shared by both a fresh fetch and a cached
// one from localStorage, since Unsplash's tracking/attribution requirements
// apply every time the photo is displayed, not just when it's first fetched.
async function applyBackgroundPhoto(photo) {
  // Fully download the image before swapping it in, so the change is an
  // instant paint instead of the background showing blank/blend-only while
  // it loads in lazily. Setting the same URL afterward is a cache hit.
  try {
    await preloadImage(photo.urls.full);
  } catch (e) {
    console.error("Failed to preload background photo, applying anyway", e);
  }
  const url = photo.urls.raw + `&w=1024&h=600&auto=true&fit=fill`
  document.body.style.backgroundImage = `url("${url}")`;
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

const cachedBackgroundPhoto = loadCachedBackgroundPhoto();
if (cachedBackgroundPhoto) {
  applyBackgroundPhoto(cachedBackgroundPhoto);
} else {
  setBackgroundPhoto();
}

// The timer always fetches fresh -- it's the only thing that's supposed to
// spend a new Unsplash call once a cached photo already covers page load.
setInterval(setBackgroundPhoto, BACKGROUND_REFRESH_INTERVAL_MS);
window.setBackgroundPhoto = setBackgroundPhoto