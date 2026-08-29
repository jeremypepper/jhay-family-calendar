// Local, editable configuration for the calendar page.
window.APP_CONFIG = {
  // Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID -> Web application.
  // Authorized JavaScript origin must match wherever this page is served from.
  GOOGLE_CLIENT_ID: "219257486318-f5f4l8uih4ku1s791ifoa9n974b8cq38.apps.googleusercontent.com",

  // weather-lambda's SAM-deployed API Gateway base URL (NWS). Kept around in
  // case we ever want to switch back -- weather.js/calendar.js no longer
  // read from this, see GOOGLE_WEATHER_API_BASE below.
  WEATHER_API_BASE: "https://appjzr33ae.execute-api.us-east-2.amazonaws.com",

  // weather-google-lambda's SAM-deployed API Gateway base URL (Google Maps
  // Platform Weather API). weather.js/calendar.js read from this now.
  GOOGLE_WEATHER_API_BASE: "https://rhciu1duwc.execute-api.us-east-2.amazonaws.com",

  // No default location -- weather.js only sets APP_CONFIG.LOCATION once a
  // zip code (or manual lat/lon) is saved via the calendars form, and skips
  // calling the weather API entirely until then.

  // geocode-lambda's SAM-deployed API Gateway base URL (zip -> lat/long,
  // via api-ninjas.com).
  GEOCODE_API_BASE: "https://389xg5cvy5.execute-api.us-east-2.amazonaws.com",

  // https://unsplash.com/oauth/applications
  UNSPLASH_CLIENT_ID: "xUM0Borj6JNm5uBLhjxdi48kVhH8NbJMeqiS8LgSCN0",
  // https://unsplash.com/collections/3330448/nature
  UNSPLASH_COLLECTION_ID: "3330448",
};
