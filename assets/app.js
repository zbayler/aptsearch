/* Apartment Walk Map: stations, 15-minute walk zones, and apartment buildings. */
(function () {
  "use strict";

  const OVERPASS = "https://overpass-api.de/api/interpreter";

  const state = { station: "all", maxWalk: 15, stations: [], apts: [], osm: [], markers: new Map(), active: null };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true }).setView([39.697, -104.984], 15);
  // Standard OpenStreetMap tiles: free, no API key (light personal use is within
  // the OSM tile policy). Dark mode dims them with a CSS filter (see style.css).
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "base-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const zoneLayer = L.layerGroup().addTo(map);
  const aptLayer = L.layerGroup().addTo(map);
  const osmLayer = L.layerGroup().addTo(map);

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
          icon: L.divIcon({ className: "", html: `<div class="station-icon" style="background:${stationColor(s.id)}">RTD</div>`, iconSize: [36, 22], iconAnchor: [18, 11] }),
          zIndexOffset: 1000, title: s.name,
        }).bindPopup(`<strong>${esc(s.name)} station</strong><br>${esc(s.address)}<br>Lines: ${s.lines.join(", ")}<br>Shaded: 15-minute walk`).addTo(zoneLayer);
      });
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
