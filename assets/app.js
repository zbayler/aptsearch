/* Apartment Walk Map: stations, 15-minute walk zones, and apartment buildings. */
(function () {
  "use strict";

  const OVERPASS = "https://overpass-api.de/api/interpreter";

  const state = { station: "all", maxWalk: 15, stations: [], apts: [], osm: [], markers: new Map(), active: null };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true }).setView([39.697, -104.984], 15);
  // Basemaps: all free, no API key. "Muted" is the standard OSM map greyed out
  // with a CSS filter (see style.css) so the bike network and pins stand out.
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const basemaps = {
    "Muted (grey)": L.tileLayer(OSM_URL, { maxZoom: 19, className: "base-tiles base-muted", attribution: OSM_ATTR }),
    "Standard (colour)": L.tileLayer(OSM_URL, { maxZoom: 19, className: "base-tiles", attribution: OSM_ATTR }),
    "Cycling (CyclOSM)": L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
      maxZoom: 19, subdomains: "abc", className: "base-tiles",
      attribution: `${OSM_ATTR} &middot; <a href="https://www.cyclosm.org">CyclOSM</a>`,
    }),
  };
  const BASEMAP_KEY = "aptsearch.basemap";
  let startBase = "Muted (grey)";
  try { const saved = localStorage.getItem(BASEMAP_KEY); if (saved && basemaps[saved]) startBase = saved; } catch (_) {}
  basemaps[startBase].addTo(map);
  map.on("baselayerchange", (e) => { try { localStorage.setItem(BASEMAP_KEY, e.name); } catch (_) {} });

  const zoneLayer = L.layerGroup().addTo(map);
  const railLayer = L.layerGroup().addTo(map);
  const bikeLayer = L.layerGroup().addTo(map);
  const stationLayer = L.layerGroup().addTo(map);
  const aptLayer = L.layerGroup().addTo(map);
  const osmLayer = L.layerGroup().addTo(map);
  L.control.layers(basemaps, {
    "15-min walk zones": zoneLayer,
    "Bike trails &amp; lanes (½ mi)": bikeLayer,
    "Light rail tracks": railLayer,
  }, { position: "topright", collapsed: true }).addTo(map);

  const stationColor = (id) => (id === "louisiana-pearl" ? css("--lp") : css("--ib"));

  // ---------- helpers ----------
  function inStations(apt) {
    // Station ids this building is within `maxWalk` minutes of, honoring the station filter.
    return Object.entries(apt.walk || {})
      .filter(([id, w]) => w.minutes <= state.maxWalk && (state.station === "all" || state.station === id))
      .map(([id]) => id);
  }
  function klass(ids) {
    if (ids.length > 1) return "both";
    return ids[0] === "louisiana-pearl" ? "lp" : "ib";
  }
  function colorFor(k) { return css({ lp: "--lp", ib: "--ib", both: "--both", osm: "--osm" }[k]); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function stationName(id) { return (state.stations.find((s) => s.id === id) || {}).name || id; }

  function walkChips(apt) {
    return state.stations.map((s) => {
      const w = apt.walk && apt.walk[s.id];
      if (!w) return "";
      const ok = w.minutes <= state.maxWalk;
      return `<span class="walk ${ok ? "in" : "out"}" title="${w.meters} m">${esc(s.name)}: ${Math.ceil(w.minutes)} min</span>`;
    }).join("");
  }

  function pointInPoly(lat, lon, geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    return polys.some((rings) => {
      let inside = false;
      rings.forEach((ring, ri) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
        }
        if (c) inside = ri === 0 ? true : false;
      });
      return inside;
    });
  }
  function metersBetween(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- render ----------
  function render() {
    aptLayer.clearLayers();
    osmLayer.clearLayers();
    state.markers.clear();
    const list = document.getElementById("list");
    list.innerHTML = "";

    const shown = state.apts
      .map((a) => ({ a, ids: inStations(a) }))
      .filter((x) => x.ids.length)
      .sort((x, y) => Math.min(...x.ids.map((id) => x.a.walk[id].minutes)) - Math.min(...y.ids.map((id) => y.a.walk[id].minutes)));

    shown.forEach(({ a, ids }) => addItem(list, a, klass(ids)));

    const osmShown = state.osm
      .map((a) => ({ a, ids: state.station === "all" ? a.zones : a.zones.filter((z) => z === state.station) }))
      .filter((x) => x.ids.length);
    if (osmShown.length) {
      const h = document.createElement("li");
      h.className = "section-h";
      h.textContent = `OpenStreetMap: other apartment buildings (${osmShown.length}, unverified)`;
      list.appendChild(h);
      osmShown.forEach(({ a }) => addItem(list, a, "osm"));
    }

    document.getElementById("count").textContent =
      `${shown.length} researched building${shown.length === 1 ? "" : "s"} within ${state.maxWalk} min` +
      (state.station === "all" ? " of either station" : ` of ${stationName(state.station)}`) + ", closest first.";
  }

  function addItem(list, a, k) {
    const key = a.key;
    const li = document.createElement("li");
    li.className = `item ${k}`;
    li.tabIndex = 0;
    li.dataset.key = key;
    const facts = [a.built && `Built ${esc(a.built)}`, a.units && `${esc(a.units)} units`, a.notes && esc(a.notes)].filter(Boolean).join(" · ");
    const links = [a.website && `<a href="${esc(a.website)}" target="_blank" rel="noopener noreferrer">Website</a>`,
      a.source && `<a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">Source</a>`,
      a.osmUrl && `<a href="${esc(a.osmUrl)}" target="_blank" rel="noopener noreferrer">OSM</a>`].filter(Boolean).join(" · ");
    li.innerHTML = `<h3>${esc(a.name)}</h3><div class="addr">${esc(a.address || "Address not tagged")}</div>
      <div class="walks">${a.walk ? walkChips(a) : '<span class="walk in">Inside 15-min walk zone</span>'}</div>
      ${facts || links ? `<div class="meta">${facts}${facts && links ? "<br>" : ""}${links}</div>` : ""}`;
    li.addEventListener("click", () => focus(key, true));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focus(key, true); } });
    list.appendChild(li);

    const m = L.circleMarker([a.lat, a.lon], {
      radius: k === "osm" ? 6 : 9, weight: 2, color: css("--surface"), fillColor: colorFor(k), fillOpacity: k === "osm" ? 0.75 : 0.95,
    }).bindPopup(`<strong>${esc(a.name)}</strong><br>${esc(a.address || "")}<br>${a.walk ? walkChips(a) : "Inside 15-min walk zone"}`);
    m.on("click", () => focus(key, false));
    (k === "osm" ? osmLayer : aptLayer).addLayer(m);
    state.markers.set(key, { m, li });
  }

  function focus(key, fromList) {
    if (state.active && state.markers.get(state.active)) state.markers.get(state.active).li.classList.remove("active");
    state.active = key;
    const hit = state.markers.get(key);
    if (!hit) return;
    hit.li.classList.add("active");
    if (fromList) { map.panTo(hit.m.getLatLng()); hit.m.openPopup(); }
    else hit.li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- OpenStreetMap live layer (runs in the visitor's browser) ----------
  async function loadOsm(zones) {
    const btn = document.getElementById("osmBtn");
    const status = document.getElementById("osmStatus");
    btn.disabled = true;
    status.textContent = "Asking OpenStreetMap for apartment buildings…";
    try {
      const b = L.geoJSON(zones).getBounds();
      const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(5)).join(",");
      const q = `[out:json][timeout:25];(nwr["building"="apartments"](${bbox});nwr["building"="residential"]["name"](${bbox});nwr["residential"="apartments"](${bbox}););out center tags;`;
      const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const els = (await res.json()).elements || [];
      const found = [];
      for (const e of els) {
        const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
        if (lat == null) continue;
        const inZones = zones.features.filter((f) => pointInPoly(lat, lon, f.geometry)).map((f) => f.properties.station);
        if (!inZones.length) continue;
        // Skip buildings already in the researched list.
        if (state.apts.some((a) => metersBetween([a.lat, a.lon], [lat, lon]) < 90)) continue;
        const t = e.tags || {};
        const addr = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
        found.push({
          key: `osm-${e.type}-${e.id}`, name: t.name || (addr ? `Apartment building, ${addr}` : "Unnamed apartment building"),
          address: addr, lat, lon, zones: inZones, units: t["building:flats"] || null, built: t.start_date || null,
          website: t.website || null, osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        });
      }
      state.osm = found;
      status.textContent = `${found.length} more apartment buildings from OpenStreetMap (grey). These are unverified and may include condos.`;
      render();
    } catch (err) {
      status.textContent = `Couldn't load OpenStreetMap data (${err.message}). Try again in a minute.`;
      btn.disabled = false;
    }
  }

  // ---------- bike network + light rail (OpenStreetMap, fetched in the browser) ----------
  const BIKE_RADIUS_M = 805; // 0.5 mile
  const BIKE_CACHE_KEY = "aptsearch.bike.v1";
  const BIKE_CACHE_MS = 7 * 24 * 3600 * 1000;

  // Off-street trail > protected lane > painted lane > shared lane (sharrows).
  function bikeClass(t) {
    const any = (re) => ["cycleway", "cycleway:both", "cycleway:left", "cycleway:right"].some((k) => re.test(t[k] || ""));
    if (t.highway === "cycleway" || (/^(path|footway|track)$/.test(t.highway || "") && t.bicycle === "designated")) return "trail";
    if (any(/^track$/)) return "protected";
    if (any(/^lane$/)) return "lane";
    if (any(/^shared_lane$/) || t.bicycle_road === "yes") return "shared";
    return null;
  }
  const BIKE_STYLE = {
    trail: { cls: "bk-trail", weight: 6, dash: null, label: "Off-street trail" },
    protected: { cls: "bk-protected", weight: 5, dash: null, label: "Protected bike lane" },
    lane: { cls: "bk-lane", weight: 4, dash: "8 6", label: "Painted bike lane" },
    shared: { cls: "bk-shared", weight: 3, dash: "2 6", label: "Shared lane (sharrows)" },
  };

  // Keep only the parts of a line that fall inside any of the circles.
  function clipToCircles(pts, circles) {
    const out = []; let cur = null;
    const lat0 = circles[0].lat, mx = 111320 * Math.cos(lat0 * Math.PI / 180), my = 111320;
    const P = (p) => [(p[1] - circles[0].lon) * mx, (p[0] - lat0) * my];
    const C = circles.map((c) => ({ x: (c.lon - circles[0].lon) * mx, y: (c.lat - lat0) * my, r: c.r }));
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], A = P(a), B = P(b);
      const dx = B[0] - A[0], dy = B[1] - A[1], qa = dx * dx + dy * dy;
      const iv = [];
      for (const c of C) {
        const fx = A[0] - c.x, fy = A[1] - c.y;
        if (qa === 0) { if (fx * fx + fy * fy <= c.r * c.r) iv.push([0, 1]); continue; }
        const qb = 2 * (fx * dx + fy * dy), qc = fx * fx + fy * fy - c.r * c.r, disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const s = Math.sqrt(disc), t0 = Math.max(0, (-qb - s) / (2 * qa)), t1 = Math.min(1, (-qb + s) / (2 * qa));
        if (t1 > t0) iv.push([t0, t1]);
      }
      iv.sort((u, v) => u[0] - v[0]);
      const merged = [];
      for (const [s0, s1] of iv) {
        if (merged.length && s0 <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], s1);
        else merged.push([s0, s1]);
      }
      for (const [s0, s1] of merged) {
        const p0 = lerp(a, b, s0), p1 = lerp(a, b, s1);
        if (cur && s0 === 0) cur.push(p1);
        else { if (cur) out.push(cur); cur = [p0, p1]; }
        if (s1 < 1) { out.push(cur); cur = null; }
      }
      if (!merged.length && cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter((l) => l.length > 1);
  }

  async function fetchBikeAndRail(stations) {
    try {
      const c = JSON.parse(localStorage.getItem(BIKE_CACHE_KEY) || "null");
      if (c && Date.now() - c.at < BIKE_CACHE_MS) return c.elements;
    } catch (_) {}
    const parts = stations.map((s) => {
      const a = `(around:${BIKE_RADIUS_M},${s.lat},${s.lon})`;
      return `way["highway"="cycleway"]${a};way["highway"~"^(path|footway|track)$"]["bicycle"="designated"]${a};` +
        `way["cycleway"~"^(lane|track|shared_lane)$"]${a};way["cycleway:both"~"^(lane|track|shared_lane)$"]${a};` +
        `way["cycleway:left"~"^(lane|track|shared_lane)$"]${a};way["cycleway:right"~"^(lane|track|shared_lane)$"]${a};` +
        `way["bicycle_road"="yes"]${a};way["railway"="light_rail"](around:2000,${s.lat},${s.lon});`;
    }).join("");
    const q = `[out:json][timeout:30];(${parts});out geom tags;`;
    const res = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const elements = ((await res.json()).elements || []).filter((e) => e.geometry)
      .map((e) => ({ id: e.id, tags: e.tags || {}, g: e.geometry.map((p) => [+p.lat.toFixed(6), +p.lon.toFixed(6)]) }));
    try { localStorage.setItem(BIKE_CACHE_KEY, JSON.stringify({ at: Date.now(), elements })); } catch (_) {}
    return elements;
  }

  async function loadBikeAndRail(stations) {
    const status = document.getElementById("bikeStatus");
    status.textContent = "Loading bike trails and lanes from OpenStreetMap…";
    try {
      const els = await fetchBikeAndRail(stations);
      bikeLayer.clearLayers(); railLayer.clearLayers();
      const circles = stations.map((s) => ({ lat: s.lat, lon: s.lon, r: BIKE_RADIUS_M }));
      const counts = {}; const names = new Set();
      const order = ["shared", "lane", "protected", "trail"]; // draw trails on top
      const byClass = { trail: [], protected: [], lane: [], shared: [] };
      for (const e of els) {
        if (e.tags.railway === "light_rail") {
          if (/^(yard|siding|spur)$/.test(e.tags.service || "")) continue;
          L.polyline(e.g, { className: "rail-casing", weight: 7, interactive: false }).addTo(railLayer);
          L.polyline(e.g, { className: "rail-line", weight: 3, interactive: false }).addTo(railLayer);
          continue;
        }
        const k = bikeClass(e.tags);
        if (k) byClass[k].push(e);
      }
      for (const k of order) {
        const st = BIKE_STYLE[k];
        for (const e of byClass[k]) {
          const pieces = clipToCircles(e.g, circles);
          if (!pieces.length) continue;
          counts[k] = (counts[k] || 0) + 1;
          const nm = e.tags.name || "";
          if (k === "trail" && nm) names.add(nm);
          const tip = `<strong>${esc(st.label)}</strong>${nm ? `<br>${esc(nm)}` : ""}`;
          L.polyline(pieces, { className: "bk-casing", weight: st.weight + 4, interactive: false }).addTo(bikeLayer);
          L.polyline(pieces, { className: st.cls, weight: st.weight, dashArray: st.dash, lineCap: "round" })
            .bindTooltip(tip, { sticky: true }).addTo(bikeLayer);
        }
      }
      stations.forEach((s) => L.circle([s.lat, s.lon], { radius: BIKE_RADIUS_M, className: "bike-ring", weight: 1.5, dashArray: "2 5", fill: false, interactive: false }).addTo(bikeLayer));
      const total = Object.values(counts).reduce((x, y) => x + y, 0);
      status.textContent = total
        ? "Bike trails and lanes within ½ mile of each station are shown in green; hover or tap one for details." +
          (names.size ? ` Named trails: ${[...names].sort().join(", ")}.` : "")
        : "No mapped bike trails or lanes found within ½ mile.";
    } catch (err) {
      status.innerHTML = `Couldn't load bike routes (${esc(err.message)}). <button type="button" class="linkbtn" id="bikeRetry">Retry</button>`;
      document.getElementById("bikeRetry").addEventListener("click", () => loadBikeAndRail(stations));
    }
  }

  function stationLabel(s) {
    const badges = s.lines.map((l) => `<span class="ln">${esc(l.id)}</span>`).join("") +
      (s.suspended || []).map((l) => `<span class="ln ln-off" title="${esc(l.id)} Line ${esc(l.note)}">${esc(l.id)}</span>`).join("");
    return `<div class="station-label" style="--st:${stationColor(s.id)}"><span class="st-name">${esc(s.name)}</span><span class="lns">${badges}</span></div>`;
  }
  function stationPopup(s) {
    const row = (l, off) => `<li${off ? ' class="off"' : ""}><span class="ln${off ? " ln-off" : ""}">${esc(l.id)}</span> ${esc(l.id)} Line: ${esc(l.route)}${l.note ? ` <em>(${esc(l.note)})</em>` : ""}</li>`;
    return `<strong>${esc(s.name)} station</strong><br>${esc(s.address)}
      <ul class="line-list">${s.lines.map((l) => row(l, false)).join("")}${(s.suspended || []).map((l) => row(l, true)).join("")}</ul>
      <span class="hint">RTD service as of the Sept 27, 2026 changes.</span>`;
  }

  // ---------- boot ----------
  Promise.all(["data/stations.json", "data/apartments.json", "data/walksheds.geojson"].map((u) => fetch(u).then((r) => r.json())))
    .then(([stations, apts, zones]) => {
      state.stations = stations;
      state.apts = apts.map((a, i) => ({ ...a, key: `apt-${i}` }));

      const zoneLayers = {};
      zones.features.forEach((f) => {
        const c = stationColor(f.properties.station);
        zoneLayers[f.properties.station] = L.geoJSON(f, { style: { color: c, weight: 2, fillColor: c, fillOpacity: 0.1, dashArray: "4 4" }, interactive: false }).addTo(zoneLayer);
      });
      stations.forEach((s) => {
        L.marker([s.lat, s.lon], {
          icon: L.divIcon({ className: "station-marker", html: stationLabel(s), iconSize: null, iconAnchor: [9, 9] }),
          zIndexOffset: 1000, title: `${s.name} station`, keyboard: true,
        }).bindPopup(stationPopup(s)).addTo(stationLayer);
      });
      loadBikeAndRail(stations);
      if (matchMedia("(max-width: 760px)").matches) document.getElementById("legend").open = false;
      map.fitBounds(L.geoJSON(zones).getBounds(), { padding: [20, 20] });

      document.querySelectorAll('input[name="station"]').forEach((r) => r.addEventListener("change", (e) => {
        state.station = e.target.value;
        Object.entries(zoneLayers).forEach(([id, layer]) => {
          const on = state.station === "all" || state.station === id;
          if (on && !zoneLayer.hasLayer(layer)) zoneLayer.addLayer(layer);
          if (!on) zoneLayer.removeLayer(layer);
        });
        render();
      }));
      const slider = document.getElementById("maxWalk");
      slider.addEventListener("input", () => { state.maxWalk = +slider.value; document.getElementById("maxOut").textContent = slider.value; render(); });
      document.getElementById("osmBtn").addEventListener("click", () => loadOsm(zones));

      render();
    })
    .catch((err) => { document.getElementById("count").textContent = "Couldn't load data: " + err.message; });
})();
