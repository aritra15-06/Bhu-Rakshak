import urllib.request
import urllib.parse
import json

query = """[out:json][timeout:15];
(
  way["waterway"="river"](27.0,88.35,28.1,88.85);
);
out geom;"""

url = "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={"User-Agent": "FLOWS-EarlyWarningSystem/1.0"})

try:
    print("Querying Overpass API...")
    with urllib.request.urlopen(req, timeout=12) as resp:
        data = json.loads(resp.read().decode())
        elements = data.get("elements", [])
        print("Live OSM Overpass returned river segments:", len(elements))
        for el in elements[:6]:
            print(" -", el.get("tags", {}).get("name", "Unnamed reach"), "Nodes:", len(el.get("geometry", [])))
except Exception as e:
    print("Overpass query result:", e)
