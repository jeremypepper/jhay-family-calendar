import json
import os
import urllib.error
import urllib.parse
import urllib.request

WEATHER_API_BASE = "https://weather.googleapis.com/v1"
API_KEY = os.environ["GOOGLE_WEATHER_API_KEY"]

ROUTES = {
    "/current": "currentConditions:lookup",
    "/forecast/daily": "forecast/days:lookup",
    "/forecast/hourly": "forecast/hours:lookup",
}


def handler(event, context):
    path = event.get("rawPath") or event.get("path") or ""
    query = event.get("queryStringParameters") or {}

    for route, upstream_path in ROUTES.items():
        if path.endswith(route):
            return _proxy(upstream_path, query)

    return _response(404, {"message": f"No route for path {path}"})


def _proxy(upstream_path, query):
    lat = query.get("lat")
    lon = query.get("lon")
    if not lat or not lon:
        return _response(400, {"message": "lat and lon query parameters are required"})

    params = {
        "key": API_KEY,
        "location.latitude": lat,
        "location.longitude": lon,
    }
    # Pass through anything else the caller sent (days, hours, unitsSystem,
    # pageSize, pageToken, ...) straight to the upstream API.
    for key, value in query.items():
        if key not in ("lat", "lon"):
            params[key] = value

    url = f"{WEATHER_API_BASE}/{upstream_path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(request, timeout=10) as res:
            return _response(res.status, json.loads(res.read()))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        return _response(e.code, {"message": "weather.googleapis.com returned an error", "detail": detail})
    except urllib.error.URLError as e:
        return _response(502, {"message": "Failed to reach weather.googleapis.com", "detail": str(e.reason)})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
