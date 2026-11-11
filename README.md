# aptsearch

Personal map of apartment buildings within a **15-minute walk** of the **Louisiana–Pearl** and
**I-25 & Broadway** RTD light rail stations (South Denver). Static site for GitHub Pages, kept out of
search engines (`noindex` meta tags + `robots.txt`).

See [REQUIREMENTS.md](REQUIREMENTS.md) for the full requirement list and status.

## Files

- `index.html`, `assets/` — the map page (Leaflet).
- `data/stations.json` — the two stations.
- `data/walksheds.geojson` — 15-minute walking areas built from real street/path distances.
- `data/candidates.json` — hand-researched buildings (edit this to add/remove buildings).
- `data/apartments.json` — candidates within 15 min, with walk times (generated).
- `data/excluded.json` — candidates checked and found to be over 15 min (generated).

The page's "Also show other apartment buildings from OpenStreetMap" button queries OpenStreetMap live
from your browser for any other mapped apartment buildings inside the walk zones.

## Rebuild data

```sh
pip install shapely
python3 scripts/build_walksheds.py      # walk zones (OSM foot router, 3 mph)
python3 scripts/enrich_apartments.py    # geocode (US Census) + walk times
```

## Publish (GitHub Pages)

Settings → Pages → Build and deployment → Source: *Deploy from a branch* → `main` / `/ (root)`.
