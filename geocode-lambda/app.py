import json
import os
import urllib.error
import urllib.parse
import urllib.request

API_NINJAS_GEOCODING_URL = "https://api.api-ninjas.com/v1/geocoding"
API_KEY = os.environ["API_NINJAS_KEY"]


def handler(event, context):
    query = event.get("queryStringParameters") or {}
    zipcode = query.get("zip")
    if not zipcode:
        return _response(400, {"message": "zip query parameter is required"})

    url = f"{API_NINJAS_GEOCODING_URL}?{urllib.parse.urlencode({'zipcode': zipcode})}"
    request = urllib.request.Request(url, headers={"X-Api-Key": API_KEY})
    try:
        with urllib.request.urlopen(request, timeout=10) as res:
            results = json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        return _response(e.code, {"message": "api-ninjas.com returned an error", "detail": detail})
    except urllib.error.URLError as e:
        return _response(502, {"message": "Failed to reach api-ninjas.com", "detail": str(e.reason)})

    if not results:
        return _response(404, {"message": f"No location found for zip code {zipcode}"})

    match = results[0]
    return _response(200, {
        "latitude": match.get("latitude"),
        "longitude": match.get("longitude"),
        "name": match.get("name"),
        "state": match.get("state"),
    })


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
