# Apartment search: requirements

Source: Notion → Second Brain → Tidbits Master → "Apartment search: requirements map and priority list"
(section "Research: Apartment search web app requirements"). Area: South Denver.

Status key: ✅ done · 🟡 partial · ⏸ deferred · ⬜ not started

| # | Requirement (from Notion) | Status | Notes |
|---|---|---|---|
| 1 | **Base map:** roads, RTD light rail lines and stations, bike routes | ✅ | Muted grey OSM basemap (switchable to colour or CyclOSM). Light rail tracks drawn; stations labelled with the lines serving them (C/E/T, H suspended — RTD Sept 27, 2026 service). Bike routes within ½ mile of each station. |
| 2 | **Bikes:** off-street trails (High Line Canal, Cherry Creek Trail, South Platte River Trail) styled differently from on-street bike lanes; each building shows distance to both | 🟡 | Trails, protected lanes, painted lanes and sharrows styled differently within a ½-mile radius of each station (live from OpenStreetMap). Per-building distance to each not yet shown. |
| 3 | **Transit:** 10-minute walking area (~½ mi) around each station, based on actual streets, not a straight circle | ✅ (scope changed) | Now **15 min (~0.75 mi / 1,200 m)** per latest request, for **Louisiana–Pearl** and **I-25 & Broadway** only. Real street-network walksheds from the OSM foot router. |
| 4 | **Budget:** filter to $1,500–$2,500/month; flag places slightly over | ⬜ | Needs rent data. |
| 5 | **Must-haves:** extra storage, in-unit laundry | ⬜ | Needs per-building amenity data. |
| 6 | **Nice-to-haves:** gym, open space (add points to score) | ⬜ | |
| 7 | **Walkability:** heat map from groceries, cafés, restaurants, parks within walking distance (free OSM data; Walk Score API optional, has costs/limits) | ⬜ | |
| 8 | **Listings:** RentCast API (free tier 50 req/mo; paid $74/$199/$449 mo), cache results; backup: paste a listing link to auto-fill; Zillow has no public rentals API | ⏸ | **Excluded for now** per request. Building list is hand-researched + OSM instead. |
| 9 | **Scoring:** drop over-budget / missing must-haves; 0–10 per factor (train, trails, walkability, rent, nice-to-haves), weighted average with user sliders | ⬜ | Walk-time filter slider is the first piece. |
| 10 | **Score display:** pins green→red with score, ranked side list, list ↔ map linked | 🟡 | Ranked list (by walk time) linked to map pins is in place; score colouring waits on #9. |

## Hosting requirement (added)

- **Non-searchable GitHub Page.** `<meta name="robots" content="noindex, nofollow, …">` on the page and a
  `robots.txt` that disallows all crawlers. Note: anyone with the URL can still open it; GitHub Pages sites
  are public on personal accounts even when the repo is private (and Pages from a private repo needs GitHub Pro).
