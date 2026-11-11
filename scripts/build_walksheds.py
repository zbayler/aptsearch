"""Build 15-minute walking areas (walksheds) around RTD stations.

Samples a grid of points around each station, asks the OpenStreetMap foot
router (FOSSGIS OSRM, routing.openstreetmap.de) for the street-network walking
distance from the station to every point, and merges the grid cells that are
reachable within the walking budget into one polygon per station.

Pace: 3 mph (~80 m/min), so 15 min = 1,200 m along streets and paths.

Usage: python3 scripts/build_walksheds.py  ->  writes data/walksheds.geojson
"""

import json
import math
import time
import urllib.request
from pathlib import Path

from shapely.geometry import box, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
STATIONS = json.loads((ROOT / "data" / "stations.json").read_text())

PACE_M_PER_MIN = 80.0
MINUTES = 15
BUDGET_M = PACE_M_PER_MIN * MINUTES  # 1,200 m
STEP_M = 50  # grid spacing
RADIUS_M = BUDGET_M + 150  # straight-line search radius
MAX_SNAP_M = 60  # grid points farther than this from any path are skipped
BATCH = 90
OSRM = "https://routing.openstreetmap.de/routed-foot/table/v1/foot/"


def offsets(lat):
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat))
    return m_per_deg_lat, m_per_deg_lon


def fetch(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception:  # network hiccup: back off and retry
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed: {url[:120]}")


def walkshed(station):
    lat0, lon0 = station["lat"], station["lon"]
    mlat, mlon = offsets(lat0)
    n = int(RADIUS_M // STEP_M)
    pts = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            if math.hypot(i * STEP_M, j * STEP_M) <= RADIUS_M:
                pts.append((lat0 + i * STEP_M / mlat, lon0 + j * STEP_M / mlon))

    cells = []
    for k in range(0, len(pts), BATCH):
        chunk = pts[k : k + BATCH]
        coords = ";".join([f"{lon0},{lat0}"] + [f"{lo:.6f},{la:.6f}" for la, lo in chunk])
        data = fetch(f"{OSRM}{coords}?sources=0&annotations=distance")
        dists = data["distances"][0][1:]
        for (la, lo), d, dest in zip(chunk, dists, data["destinations"][1:]):
            if d is None or dest["distance"] > MAX_SNAP_M:
                continue
            if d + dest["distance"] <= BUDGET_M:
                hx, hy = STEP_M / 2 / mlon, STEP_M / 2 / mlat
                cells.append(box(lo - hx, la - hy, lo + hx, la + hy))
        time.sleep(0.3)  # be polite to the free router

    # Close small gaps between cells, then simplify the outline.
    shape = unary_union(cells).buffer(0.0002).buffer(-0.0001).simplify(0.00005)
    return shape


def main():
    features = []
    for s in STATIONS:
        print("walkshed:", s["name"])
        shape = walkshed(s)
        features.append(
            {
                "type": "Feature",
                "properties": {"station": s["id"], "name": s["name"], "minutes": MINUTES, "meters": BUDGET_M},
                "geometry": mapping(shape),
            }
        )
    out = {"type": "FeatureCollection", "features": features}
    (ROOT / "data" / "walksheds.geojson").write_text(json.dumps(out, separators=(",", ":")))
    print("wrote data/walksheds.geojson")


if __name__ == "__main__":
    main()
