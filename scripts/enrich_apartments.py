"""Geocode candidate buildings and measure walking time to each station.

Geocoder: US Census Bureau (free, no key). Walking: OSM foot router (OSRM).
Pace 80 m/min (3 mph). Writes data/apartments.json with buildings that are
within 15 minutes of at least one station; the rest go to data/excluded.json.
"""
import json, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACE = 80.0
LIMIT_MIN = 15
stations = json.loads((ROOT / "data/stations.json").read_text())
cands = json.loads((ROOT / "data/candidates.json").read_text())

def get(url):
    for a in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 ** a)
    raise RuntimeError(url)

def geocode(addr):
    q = urllib.parse.urlencode({"address": f"{addr}, Denver, CO", "benchmark": "Public_AR_Current", "format": "json"})
    m = get(f"https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?{q}")["result"]["addressMatches"]
    if not m:
        return None
    c = m[0]["coordinates"]
    return round(c["y"], 6), round(c["x"], 6)

keep, drop = [], []
for c in cands:
    ll = geocode(c["address"])
    if not ll:
        print("NO GEOCODE", c["name"]); drop.append({**c, "reason": "not geocoded"}); continue
    c["lat"], c["lon"] = ll
    c["walk"] = {}
    for s in stations:
        r = get(f"https://routing.openstreetmap.de/routed-foot/route/v1/foot/{s['lon']},{s['lat']};{c['lon']},{c['lat']}?overview=false")
        d = r["routes"][0]["distance"]
        c["walk"][s["id"]] = {"meters": round(d), "minutes": round(d / PACE, 1)}
        time.sleep(0.3)
    best = min(c["walk"].values(), key=lambda w: w["meters"])
    print(f"{c['name']:32s} " + "  ".join(f"{k}: {v['minutes']:5.1f} min" for k, v in c["walk"].items()))
    (keep if best["minutes"] <= LIMIT_MIN else drop).append(c)

keep.sort(key=lambda c: min(w["minutes"] for w in c["walk"].values()))
(ROOT / "data/apartments.json").write_text(json.dumps(keep, indent=1, ensure_ascii=False))
(ROOT / "data/excluded.json").write_text(json.dumps(drop, indent=1, ensure_ascii=False))
print(len(keep), "kept;", len(drop), "excluded")
