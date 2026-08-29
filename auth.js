// OAuth 2.0 implicit flow, done inline: clicking "Connect" navigates the whole
// page to Google's consent screen, and Google redirects back to this same page
// with the access token in the URL fragment (no popup window).
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly openid email";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const STATE_KEY = "oauth_state";
const NONCE_KEY = "oauth_nonce";
const SILENT_ATTEMPT_KEY = "oauth_silent_attempt";
const TOKEN_KEY = "access_token";
const HAS_CONNECTED_KEY = "has_connected";
const LOGIN_HINT_KEY = "login_hint_email";
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // silently refresh 5 min before expiry

let accessToken = null;
let refreshTimer = null;

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

// silent=true asks Google for a fresh token with no visible UI, using the
// user's existing Google session + prior consent. If neither is available,
// Google redirects straight back with an error instead of showing anything.
function beginSignIn({ silent = false } = {}) {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(NONCE_KEY, nonce);
  if (silent) {
    sessionStorage.setItem(SILENT_ATTEMPT_KEY, "true");
  } else {
    sessionStorage.removeItem(SILENT_ATTEMPT_KEY);
  }

  const params = new URLSearchParams({
    client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "token id_token",
    scope: CALENDAR_SCOPE,
    include_granted_scopes: "true",
    state,
    nonce,
  });
  if (silent) params.set("prompt", "none");

  // Pins the silent request to a specific account so Google doesn't need to
  // ask which one to use when the browser has more than one Google session.
  const loginHint = localStorage.getItem(LOGIN_HINT_KEY);
  if (loginHint) params.set("login_hint", loginHint);

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

// Decodes a Google ID token's payload. Not signature-verified — this is only
// ever used locally as a login_hint, never for authorization decisions.
function decodeIdTokenPayload(idToken) {
  try {
    const payloadBase64 = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(payloadBase64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const payload = JSON.parse(json);
    if (payload.aud !== window.APP_CONFIG.GOOGLE_CLIENT_ID) {
      console.error("ID token audience mismatch, ignoring");
      return null;
    }
    return payload;
  } catch (e) {
    console.error("Failed to decode ID token", e);
    return null;
  }
}

// Reads what Google appended to the URL fragment after a redirect back,
// e.g. #access_token=...&expires_in=3600&state=... on success, or
// #error=login_required&state=... when a silent attempt can't be satisfied.
function consumeTokenFromRedirect() {
  if (!window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.substring(1));
  if (!params.has("access_token") && !params.has("error")) return null;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const expectedNonce = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  history.replaceState(null, "", window.location.pathname + window.location.search);

  if (params.get("state") !== expectedState) {
    console.error("OAuth state mismatch, discarding response");
    return null;
  }

  if (params.has("error")) {
    console.warn("OAuth redirect returned an error:", params.get("error"));
    return null;
  }

  let email = null;
  const idToken = params.get("id_token");
  if (idToken) {
    const payload = decodeIdTokenPayload(idToken);
    if (payload && payload.nonce === expectedNonce) {
      email = payload.email || null;
    } else if (payload) {
      console.error("OAuth nonce mismatch, ignoring ID token");
    }
  }

  const expiresDate = new Date(Date.now() + 1000 * Number(params.get("expires_in")));
  return { accessToken: params.get("access_token"), expiresDate, email };
}

function loadStoredToken() {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;

  const stored = JSON.parse(raw);
  if (new Date(stored.expiresDate) <= new Date()) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return stored;
}

function scheduleSilentRefresh(expiresDate) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = new Date(expiresDate).getTime() - Date.now() - REFRESH_MARGIN_MS;
  refreshTimer = setTimeout(() => beginSignIn({ silent: true }), Math.max(delay, 0));
}

// If a request comes back 401 (e.g. access was revoked), drop the stale
// token and try a silent re-auth instead of leaving the page broken.
function handleUnauthorized(res) {
  if (res.status !== 401) return false;
  localStorage.removeItem(TOKEN_KEY);
  beginSignIn({ silent: true });
  return true;
}

function activate(token, expiresDate) {
  accessToken = token;
  document.getElementById("auth-section").style.display = "none";
  scheduleSilentRefresh(expiresDate);
  fetchCalendarList();
}

document.getElementById("connect-btn").addEventListener("click", () => beginSignIn());

const wasSilentAttempt = sessionStorage.getItem(SILENT_ATTEMPT_KEY) === "true";
sessionStorage.removeItem(SILENT_ATTEMPT_KEY);

const fromRedirect = consumeTokenFromRedirect();
if (fromRedirect) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(fromRedirect));
  localStorage.setItem(HAS_CONNECTED_KEY, "true");
  if (fromRedirect.email) localStorage.setItem(LOGIN_HINT_KEY, fromRedirect.email);
  activate(fromRedirect.accessToken, fromRedirect.expiresDate);
} else {
  const stored = loadStoredToken();
  if (stored) {
    activate(stored.accessToken, stored.expiresDate);
  } else if (!wasSilentAttempt && localStorage.getItem(HAS_CONNECTED_KEY) === "true") {
    // We've connected before but the stored token is gone/expired — try to
    // pick back up without making the user click Connect again.
    beginSignIn({ silent: true });
  }
}
