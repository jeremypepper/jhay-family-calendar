import json
import urllib.error
import urllib.request

NWS_GRIDPOINT_BASE = "https://api.weather.gov/gridpoints/MTR/96,83"

UPSTREAM_HEADERS = {
    "Accept": "application/geo+json",
    "User-Agent": "jhay-weather-app, jeremy@jhay.net",
}

ROUTES = {
    "/forecast": f"{NWS_GRIDPOINT_BASE}/forecast",
    "/forecast/hourly": f"{NWS_GRIDPOINT_BASE}/forecast/hourly",
}


def handler(event, context):
    path = event.get("rawPath") or event.get("path") or ""

    for route, upstream_url in ROUTES.items():
        if path.endswith(route):
            return _proxy(upstream_url)

    return _response(404, {"message": f"No route for path {path}"})


def _proxy(upstream_url):
    request = urllib.request.Request(upstream_url, headers=UPSTREAM_HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=10) as res:
            return _response(res.status, json.loads(res.read()))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        return _response(e.code, {"message": "weather.gov returned an error", "detail": detail})
    except urllib.error.URLError as e:
        return _response(502, {"message": "Failed to reach weather.gov", "detail": str(e.reason)})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
