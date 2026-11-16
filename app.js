import { CONFIG } from "./config.js";

const unavailable = "Not available";
const iconPaths = {
  health: '<path d="M12 3v18M3 12h18"/>',
  education: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8"/>',
  community: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
  park: '<path d="M12 21v-9"/><path d="M12 15c-5.3 0-8-2.7-8-6 4.7 0 7.3 1.8 8 6Zm0-3c0-4.3 2.3-7 6-7 0 3.8-1.6 6.3-6 7Z"/>',
  transport: '<path d="M5 17h14l-1-9a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2l-1 9ZM5 17v2M19 17v2M7 17h10M8 10h8"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  emergency: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
  cemetery: '<path d="M12 21V5M8 9h8M9 5a3 3 0 0 1 6 0M5 21h14"/>',
  market: '<path d="M3 10h18l-2-6H5l-2 6ZM5 10v10h14V10M9 20v-6h6v6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  utilities: '<path d="M12 22s7-4.4 7-12a7 7 0 0 0-14 0c0 7.6 7 12 7 12Z"/><path d="M12 7v7M9 11h6"/>',
  civic: '<path d="M3 9h18L12 4 3 9ZM5 20h14M7 9v11M12 9v11M17 9v11"/>',
};

const elements = {
  map: document.getElementById("map"),
  loader: document.getElementById("map-loader"),
  loadingMessage: document.getElementById("loading-message"),
  toast: document.getElementById("toast"),
  search: document.getElementById("search-input"),
  searchResults: document.getElementById("search-results"),
  categoryList: document.getElementById("category-list"),
  legendList: document.getElementById("legend-list"),
  total: document.getElementById("stat-total"),
  area: document.getElementById("stat-area"),
  categoryTotal: document.getElementById("stat-categories"),
  detailsPanel: document.getElementById("details-panel"),
  detailsEmpty: document.getElementById("details-empty"),
  detailsContent: document.getElementById("details-content"),
  cadastreToggle: document.getElementById("layer-cadastre"),
  facilitiesToggle: document.getElementById("layer-facilities"),
  basemap: document.getElementById("basemap-select"),
  measureResult: document.getElementById("measure-result"),
  measureClear: document.getElementById("measure-clear"),
};

const state = {
  map: null,
  facilities: [],
  facilitiesById: new Map(),
  markersById: new Map(),
  activeCategories: new Set(Object.keys(CONFIG.categories)),
  selectedId: null,
  markerCluster: null,
  facilityPolygons: null,
  cadastreLayer: null,
  cadastreLoading: null,
  basemapLayer: null,
  basemapKey: "osm",
  measurement: null,
  measurementPoints: [],
  measurementLine: null,
  measurementPolygon: null,
  toastTimer: null,
  searchTimer: null,
  searchOptions: [],
  searchIndex: -1,
  fullscreen: false,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function valueOrUnavailable(value) {
  if (value === null || value === undefined || String(value).trim() === "") return unavailable;
  return String(value).trim();
}

function svgIcon(name) {
  const content = iconPaths[name] || iconPaths.civic;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}

function categoryColor(category) {
  return CONFIG.categories[category]?.color || "#64728d";
}

function getCategoryIcon(category) {
  return svgIcon(CONFIG.categories[category]?.icon || "civic");
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3500);
}

function addBaseLayer(key) {
  const base = CONFIG.basemaps[key] || CONFIG.basemaps.osm;
  if (state.basemapLayer) state.map.removeLayer(state.basemapLayer);
  state.basemapLayer = L.tileLayer(base.url, { ...base.options, crossOrigin: true });
  state.basemapLayer.addTo(state.map);
  state.basemapKey = key;
}

function markerIcon(category, selected = false) {
  const color = categoryColor(category);
  return L.divIcon({
    className: "",
    html: `<span class="facility-marker${selected ? " selected" : ""}" style="--marker-color:${color}">${getCategoryIcon(category)}</span>`,
    iconSize: [31, 31],
    iconAnchor: [15, 28],
    tooltipAnchor: [0, -27],
  });
}

function setupMap() {
  state.map = L.map(elements.map, {
    center: CONFIG.map.center,
    zoom: CONFIG.map.zoom,
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom,
    zoomControl: false,
    preferCanvas: true,
    zoomSnap: 0.5,
    maxBoundsViscosity: 0.7,
  });
  state.map.setMaxBounds(CONFIG.map.bounds);
  addBaseLayer("osm");
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 105 }).addTo(state.map);

  const miniLayer = L.tileLayer(CONFIG.basemaps.light.url, { ...CONFIG.basemaps.light.options });
  if (L.Control.MiniMap) {
    new L.Control.MiniMap(miniLayer, {
      position: "bottomright",
      width: 120,
      height: 85,
      zoomLevelOffset: -5,
      toggleDisplay: true,
      minimized: false,
      aimingRectOptions: { color: "#b78d3c", weight: 1 },
      shadowRectOptions: { color: "#101e35", weight: 1, opacity: 0.6, fillOpacity: 0.08 },
    }).addTo(state.map);
  }
  state.map.on("zoomend", updateFacilityDisplay);
  state.map.on("click", handleMapClick);
  state.map.on("dblclick", finishMeasurement);
  state.map.on("locationerror", () => showToast("Your location could not be determined. Check location permissions.", true));

  state.markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 48,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count >= 100 ? "large" : count >= 10 ? "medium" : "small";
      return L.divIcon({
        html: `<span>${count > 999 ? "999+" : count}</span>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: [46, 46],
      });
    },
  });
  state.facilityPolygons = L.geoJSON([], {
    filter: (feature) => feature.properties?.display_layer === "facility",
    style: (feature) => polygonStyle(feature.properties),
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(valueOrUnavailable(feature.properties.name), { className: "facility-tooltip", sticky: true });
      layer.on("click", () => selectFacility(feature.properties.id, layer.getBounds().getCenter()));
    },
  });
  setTimeout(() => state.map.invalidateSize(), 100);
}

function polygonStyle(properties, highlighted = false) {
  const color = categoryColor(properties?.category);
  return {
    color: highlighted ? "#b18126" : color,
    weight: highlighted ? 3 : 1.5,
    opacity: 0.92,
    fillColor: color,
    fillOpacity: highlighted ? 0.45 : 0.22,
  };
}

function addMarker(feature) {
  const properties = feature.properties || {};
  const coordinates = feature.geometry.coordinates;
  const marker = L.marker([coordinates[1], coordinates[0]], {
    icon: markerIcon(properties.category, state.selectedId === properties.id),
    keyboard: true,
    title: valueOrUnavailable(properties.name),
    alt: `${valueOrUnavailable(properties.category)}: ${valueOrUnavailable(properties.name)}`,
  });
  marker.bindTooltip(valueOrUnavailable(properties.name), { className: "facility-tooltip", direction: "top" });
  marker.on("click", () => selectFacility(properties.id, marker.getLatLng()));
  return marker;
}

function renderFacilityLayers() {
  state.markerCluster.clearLayers();
  state.facilityPolygons.clearLayers();
  state.markersById.clear();
  if (elements.facilitiesToggle.checked) {
    for (const feature of state.facilities) {
      const properties = feature.properties;
      if (!state.activeCategories.has(properties.category)) continue;
      if (properties.display_layer === "marker" && feature.geometry?.type === "Point") {
        const marker = addMarker(feature);
        state.markersById.set(properties.id, marker);
        state.markerCluster.addLayer(marker);
      }
    }
    state.facilityPolygons.addData(state.facilities.filter((feature) =>
      feature.properties?.display_layer === "facility" &&
      state.activeCategories.has(feature.properties.category)));
  }
  updateFacilityDisplay();
  updatePolygonHighlight();
}

function updateFacilityDisplay() {
  if (!state.map || !state.markerCluster || !state.facilityPolygons) return;
  const polygonsAtCurrentZoom = state.map.getZoom() >= CONFIG.map.polygonZoom;
  const visibleLayer = polygonsAtCurrentZoom ? state.facilityPolygons : state.markerCluster;
  const hiddenLayer = polygonsAtCurrentZoom ? state.markerCluster : state.facilityPolygons;
  if (!elements.facilitiesToggle.checked) {
    if (state.map.hasLayer(state.markerCluster)) state.map.removeLayer(state.markerCluster);
    if (state.map.hasLayer(state.facilityPolygons)) state.map.removeLayer(state.facilityPolygons);
    return;
  }
  if (state.map.hasLayer(hiddenLayer)) state.map.removeLayer(hiddenLayer);
  if (!state.map.hasLayer(visibleLayer)) visibleLayer.addTo(state.map);
}

function updatePolygonHighlight() {
  if (!state.facilityPolygons) return;
  state.facilityPolygons.eachLayer((layer) => {
    const selected = layer.feature.properties.id === state.selectedId;
    layer.setStyle(polygonStyle(layer.feature.properties, selected));
    if (selected && layer.bringToFront) layer.bringToFront();
  });
}

function visibleFacilities() {
  const unique = new Map();
  for (const feature of state.facilities) {
    const properties = feature.properties || {};
    if (properties.display_layer !== "facility" || !state.activeCategories.has(properties.category)) continue;
    if (!unique.has(properties.id)) unique.set(properties.id, feature);
  }
  return [...unique.values()];
}

function renderStatistics() {
  const features = visibleFacilities();
  const counts = new Map();
  let area = 0;
  for (const feature of features) {
    const properties = feature.properties;
    counts.set(properties.category, (counts.get(properties.category) || 0) + 1);
    const value = Number(properties.area_m2);
    if (Number.isFinite(value)) area += value;
  }
  elements.total.textContent = features.length.toLocaleString();
  elements.area.textContent = `${(area / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km² mapped`;
  elements.categoryTotal.textContent = `${counts.size} ${counts.size === 1 ? "category" : "categories"}`;
  renderCategories(counts);
  renderLegend(counts);
}

function renderCategories(counts) {
  elements.categoryList.replaceChildren();
  for (const [category, configuration] of Object.entries(CONFIG.categories)) {
    const count = counts.get(category) || 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.setAttribute("aria-pressed", String(state.activeCategories.has(category)));
    button.style.setProperty("--category-color", configuration.color);
    button.innerHTML = `<span class="category-icon">${getCategoryIcon(category)}</span><span class="category-name">${escapeHtml(category)}</span><span class="category-count">${count.toLocaleString()}</span>`;
    button.addEventListener("click", () => {
      if (state.activeCategories.has(category)) state.activeCategories.delete(category);
      else state.activeCategories.add(category);
      renderFacilityLayers();
      renderStatistics();
    });
    elements.categoryList.append(button);
  }
}

function renderLegend(counts) {
  elements.legendList.replaceChildren();
  for (const [category, configuration] of Object.entries(CONFIG.categories)) {
    if (!counts.has(category)) continue;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="--legend-color:${configuration.color}"></span><span>${escapeHtml(category)}</span>`;
    elements.legendList.append(item);
  }
  if (elements.legendList.childElementCount === 0) {
    elements.legendList.innerHTML = '<span class="empty-legend">No active categories</span>';
  }
}

function selectFacility(id, location) {
  const feature = state.facilitiesById.get(id);
  if (!feature) return;
  state.selectedId = id;
  renderDetails(feature, location);
  updatePolygonHighlight();
  if (location) {
    state.map.flyTo(location, Math.max(state.map.getZoom(), CONFIG.map.polygonZoom), { duration: 0.85 });
  }
  if (window.matchMedia("(max-width: 760px)").matches) document.body.classList.add("has-details");
}

function renderDetails(feature, markerLocation) {
  const properties = feature.properties;
  const category = valueOrUnavailable(properties.category);
  const location = markerLocation || (() => {
    const marker = state.markersById.get(properties.id);
    return marker?.getLatLng();
  })();
  const center = location || L.latLng(CONFIG.map.center);
  document.getElementById("detail-icon").innerHTML = getCategoryIcon(category);
  document.getElementById("detail-icon").style.setProperty("--facility-color", categoryColor(category));
  const badge = document.getElementById("detail-category");
  badge.textContent = category;
  badge.style.setProperty("--facility-color", categoryColor(category));
  document.getElementById("detail-name").textContent = valueOrUnavailable(properties.name);
  document.getElementById("detail-context").textContent = [valueOrUnavailable(properties.suburb), valueOrUnavailable(properties.source_use)].filter((value) => value !== unavailable).join(" · ") || "Bulawayo, Zimbabwe";
  document.getElementById("detail-stand").textContent = valueOrUnavailable(properties.stand_number);
  document.getElementById("detail-address").textContent = valueOrUnavailable(properties.address);
  document.getElementById("detail-suburb").textContent = `${valueOrUnavailable(properties.suburb)} / ${valueOrUnavailable(properties.ward)}`;
  document.getElementById("detail-area").textContent = Number.isFinite(Number(properties.area_m2)) ? `${Number(properties.area_m2).toLocaleString()} m²` : unavailable;
  document.getElementById("detail-status").textContent = valueOrUnavailable(properties.status);
  document.getElementById("detail-hours").textContent = valueOrUnavailable(properties.operating_hours);
  document.getElementById("detail-contact").textContent = valueOrUnavailable(properties.contact);
  document.getElementById("detail-description").textContent = valueOrUnavailable(properties.description);
  const directions = document.getElementById("directions-link");
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${center.lat},${center.lng}`;
  elements.detailsEmpty.hidden = true;
  elements.detailsContent.hidden = false;
}

function closeDetails() {
  state.selectedId = null;
  document.body.classList.remove("has-details");
  elements.detailsEmpty.hidden = false;
  elements.detailsContent.hidden = true;
  updatePolygonHighlight();
}

function searchText(feature) {
  const properties = feature.properties;
  return `${properties.name || ""} ${properties.stand_number || ""} ${properties.suburb || ""}`.toLocaleLowerCase();
}

function searchFacilities(query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return visibleFacilities()
    .map((feature) => ({ feature, text: searchText(feature) }))
    .filter((entry) => entry.text.includes(needle))
    .slice(0, 8)
    .map((entry) => entry.feature);
}

function renderSearchResults(query) {
  const results = searchFacilities(query);
  state.searchOptions = results;
  state.searchIndex = -1;
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = false;
  if (!results.length) {
    const empty = document.createElement("li");
    empty.className = "search-no-results";
    empty.textContent = "No matching facilities found.";
    elements.searchResults.append(empty);
    return;
  }
  results.forEach((feature, index) => {
    const properties = feature.properties;
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-button";
    button.setAttribute("aria-selected", "false");
    button.style.setProperty("--mark-color", categoryColor(properties.category));
    const stand = valueOrUnavailable(properties.stand_number);
    const suburb = valueOrUnavailable(properties.suburb);
    button.innerHTML = `<span class="search-result-mark">${getCategoryIcon(properties.category)}</span><span class="search-result-name">${escapeHtml(valueOrUnavailable(properties.name))}<small class="search-result-meta">${escapeHtml(stand === unavailable ? suburb : `Stand ${stand}${suburb === unavailable ? "" : ` · ${suburb}`}`)}</small></span><span class="search-result-category">${escapeHtml(properties.category)}</span>`;
    button.addEventListener("click", () => chooseSearchResult(index));
    item.append(button);
    elements.searchResults.append(item);
  });
}

function chooseSearchResult(index) {
  const feature = state.searchOptions[index];
  if (!feature) return;
  const marker = state.markersById.get(feature.properties.id);
  const coordinates = marker?.getLatLng();
  const geometry = feature.geometry;
  const location = coordinates || (() => {
    const point = state.facilities.find((entry) => entry.properties?.id === feature.properties.id && entry.properties?.display_layer === "marker");
    if (point) return L.latLng(point.geometry.coordinates[1], point.geometry.coordinates[0]);
    return L.geoJSON(feature).getBounds().getCenter();
  })();
  elements.search.value = valueOrUnavailable(feature.properties.name);
  elements.searchResults.hidden = true;
  selectFacility(feature.properties.id, location);
  if (geometry?.type === "Polygon" || geometry?.type === "MultiPolygon") {
    const polygon = L.geoJSON(feature).getBounds();
    if (polygon.isValid()) state.map.flyToBounds(polygon, { maxZoom: 17, padding: [28, 28], duration: 0.85 });
  }
}

async function loadFacilities() {
  try {
    const response = await fetch(CONFIG.files.facilities, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Facilities data returned HTTP ${response.status}`);
    const collection = await response.json();
    if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new Error("Facilities file is not a valid GeoJSON FeatureCollection");
    }
    state.facilities = collection.features;
    state.facilitiesById.clear();
    for (const feature of state.facilities) {
      if (feature.properties?.display_layer === "facility") state.facilitiesById.set(feature.properties.id, feature);
    }
    renderFacilityLayers();
    renderStatistics();
    const features = visibleFacilities();
    if (features.length) {
      const bounds = L.geoJSON(features).getBounds();
      if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    } else {
      showToast("No facilities were found. Run data/build_geojson.py to process the supplied cadastral files.");
    }
  } catch (error) {
    elements.loadingMessage.textContent = "Facility data could not be loaded.";
    showToast(`${error.message}. Run data/build_geojson.py, then open the project with Live Server.`, true);
    console.error("Could not load facility GeoJSON:", error);
  } finally {
    elements.loader.classList.add("loaded");
    state.map.invalidateSize();
  }
}

async function setCadastreVisible(visible) {
  if (!visible) {
    if (state.cadastreLayer && state.map.hasLayer(state.cadastreLayer)) state.map.removeLayer(state.cadastreLayer);
    return;
  }
  if (state.cadastreLayer) {
    state.cadastreLayer.addTo(state.map);
    return;
  }
  if (state.cadastreLoading) {
    await state.cadastreLoading;
    return;
  }
  state.cadastreLoading = (async () => {
    const response = await fetch(CONFIG.files.cadastre);
    if (!response.ok) throw new Error(`Cadastre data returned HTTP ${response.status}`);
    const collection = await response.json();
    if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new Error("Cadastre file is not a valid GeoJSON FeatureCollection");
    }
    state.cadastreLayer = L.geoJSON(collection, {
      pane: "overlayPane",
      interactive: false,
      renderer: L.canvas({ padding: 0.5 }),
      style: { color: "#5c748e", weight: 0.65, opacity: 0.58, fillColor: "#a9bacb", fillOpacity: 0.04 },
      smoothFactor: 1.5,
      onEachFeature(feature, layer) {
        layer.bindTooltip(
          [feature.properties?.stand_number, feature.properties?.suburb].filter((value) => value && value !== unavailable).join(" · ") || "Cadastral parcel",
          { className: "cadastre-tooltip", sticky: true, direction: "top" },
        );
      },
    });
    if (elements.cadastreToggle.checked) state.cadastreLayer.addTo(state.map);
  })();
  try {
    await state.cadastreLoading;
  } catch (error) {
    elements.cadastreToggle.checked = false;
    showToast(`${error.message}. Run data/build_geojson.py to generate the parcel layer.`, true);
    console.error("Could not load cadastral GeoJSON:", error);
  } finally {
    state.cadastreLoading = null;
  }
}

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportGeoJSON() {
  const features = visibleFacilities();
  downloadFile(
    "bulawayo-facilities.geojson",
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
    "application/geo+json",
  );
  showToast(`${features.length.toLocaleString()} filtered facilities exported as GeoJSON.`);
}

function exportCSV() {
  const fields = ["id", "name", "category", "address", "stand_number", "suburb", "ward", "area_m2", "status", "operating_hours", "contact", "description", "photo", "owner_verification"];
  const records = visibleFacilities().map((feature) => feature.properties);
  const escapeCell = (value) => `"${String(valueOrUnavailable(value)).replace(/"/g, '""')}"`;
  const csv = [fields.join(","), ...records.map((record) => fields.map((field) => escapeCell(record[field])).join(","))].join("\r\n");
  downloadFile("bulawayo-facilities.csv", `\ufeff${csv}`, "text/csv;charset=utf-8");
  showToast(`${records.length.toLocaleString()} filtered facilities exported as CSV.`);
}

function haversineDistance(a, b) {
  const earthRadius = 6371008.8;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const firstLat = toRadians(a.lat);
  const secondLat = toRadians(b.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function sphericalArea(points) {
  if (points.length < 3) return 0;
  const radius = 6371008.8;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (next.lng - current.lng) * Math.PI / 180 *
      (2 + Math.sin(current.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180));
  }
  return Math.abs(sum * radius * radius / 2);
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function handleMapClick(event) {
  if (!state.measurement) return;
  state.measurementPoints.push(event.latlng);
  updateMeasurementGraphics();
}

function updateMeasurementGraphics() {
  const points = state.measurementPoints;
  if (state.measurementLine) state.map.removeLayer(state.measurementLine);
  if (state.measurementPolygon) state.map.removeLayer(state.measurementPolygon);
  state.measurementLine = null;
  state.measurementPolygon = null;
  if (points.length > 1) {
    state.measurementLine = L.polyline(points, { color: "#b78d3c", weight: 3, dashArray: "6 5" }).addTo(state.map);
  }
  if (state.measurement === "area" && points.length > 2) {
    state.measurementPolygon = L.polygon(points, { color: "#b78d3c", weight: 2, fillColor: "#d6a646", fillOpacity: 0.16 }).addTo(state.map);
  }
  const length = points.slice(1).reduce((total, point, index) => total + haversineDistance(points[index], point), 0);
  if (state.measurement === "distance") elements.measureResult.textContent = points.length > 1 ? formatDistance(length) : "Click to place points";
  else if (state.measurement === "area") {
    const area = sphericalArea(points);
    elements.measureResult.textContent = points.length > 2 ? `${area >= 10000 ? `${(area / 10000).toFixed(2)} ha` : `${Math.round(area)} m²`} · ${formatDistance(length)} perimeter` : "Place 3+ points";
  }
  elements.measureClear.hidden = points.length === 0;
}

function setMeasurement(mode) {
  if (state.measurement === mode) {
    clearMeasurement();
    return;
  }
  clearMeasurement();
  state.measurement = mode;
  state.map.doubleClickZoom.disable();
  document.getElementById("measure-distance").setAttribute("aria-pressed", String(mode === "distance"));
  document.getElementById("measure-area").setAttribute("aria-pressed", String(mode === "area"));
  elements.map.style.cursor = "crosshair";
  elements.measureResult.textContent = mode === "distance" ? "Click to place points · double-click to finish" : "Place 3+ points · double-click to finish";
}

function finishMeasurement() {
  if (!state.measurement) return;
  state.measurement = null;
  state.map.doubleClickZoom.enable();
  document.getElementById("measure-distance").setAttribute("aria-pressed", "false");
  document.getElementById("measure-area").setAttribute("aria-pressed", "false");
  elements.map.style.cursor = "";
  elements.measureClear.hidden = state.measurementPoints.length === 0;
}

function clearMeasurement() {
  const wasMeasuring = state.measurement !== null;
  state.measurement = null;
  if (wasMeasuring) state.map.doubleClickZoom.enable();
  state.measurementPoints = [];
  if (state.measurementLine) state.map.removeLayer(state.measurementLine);
  if (state.measurementPolygon) state.map.removeLayer(state.measurementPolygon);
  state.measurementLine = null;
  state.measurementPolygon = null;
  elements.measureResult.textContent = "";
  elements.measureClear.hidden = true;
  elements.map.style.cursor = "";
  document.getElementById("measure-distance").setAttribute("aria-pressed", "false");
  document.getElementById("measure-area").setAttribute("aria-pressed", "false");
}

function openAbout() {
  const dialog = document.getElementById("about-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeAbout() {
  const dialog = document.getElementById("about-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function setupEvents() {
  elements.search.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => renderSearchResults(elements.search.value), 160);
  });
  elements.search.addEventListener("keydown", (event) => {
    if (elements.searchResults.hidden || !state.searchOptions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      state.searchIndex = (state.searchIndex + step + state.searchOptions.length) % state.searchOptions.length;
      [...elements.searchResults.querySelectorAll(".search-result-button")].forEach((button, index) => {
        button.setAttribute("aria-selected", String(index === state.searchIndex));
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseSearchResult(state.searchIndex >= 0 ? state.searchIndex : 0);
    } else if (event.key === "Escape") {
      elements.searchResults.hidden = true;
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) elements.searchResults.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      elements.search.focus();
    }
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    state.activeCategories = new Set(Object.keys(CONFIG.categories));
    renderFacilityLayers();
    renderStatistics();
  });
  elements.facilitiesToggle.addEventListener("change", renderFacilityLayers);
  elements.cadastreToggle.addEventListener("change", () => setCadastreVisible(elements.cadastreToggle.checked));
  elements.basemap.addEventListener("change", () => addBaseLayer(elements.basemap.value));
  document.getElementById("locate-button").addEventListener("click", () => state.map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true }));
  document.getElementById("home-button").addEventListener("click", () => {
    const bounds = L.geoJSON(visibleFacilities()).getBounds();
    if (bounds.isValid()) state.map.flyToBounds(bounds, { padding: [38, 38], maxZoom: 13, duration: 0.75 });
    else state.map.flyTo(CONFIG.map.center, CONFIG.map.zoom, { duration: 0.75 });
  });
  document.getElementById("fullscreen-button").addEventListener("click", () => {
    state.fullscreen = !state.fullscreen;
    document.body.classList.toggle("fullscreen-map", state.fullscreen);
    setTimeout(() => state.map.invalidateSize(), 120);
  });
  document.getElementById("measure-distance").addEventListener("click", () => setMeasurement("distance"));
  document.getElementById("measure-area").addEventListener("click", () => setMeasurement("area"));
  elements.measureClear.addEventListener("click", clearMeasurement);
  document.getElementById("export-geojson").addEventListener("click", exportGeoJSON);
  document.getElementById("export-csv").addEventListener("click", exportCSV);
  document.getElementById("print-map").addEventListener("click", () => window.print());
  document.getElementById("close-details").addEventListener("click", closeDetails);
  document.getElementById("about-button").addEventListener("click", openAbout);
  document.getElementById("footer-about").addEventListener("click", openAbout);
  document.getElementById("about-close").addEventListener("click", closeAbout);
  document.getElementById("about-done").addEventListener("click", closeAbout);
  document.getElementById("about-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAbout();
  });
  const themeButton = document.getElementById("theme-button");
  const themeIcon = document.getElementById("theme-icon");
  const applyTheme = (dark) => {
    document.body.classList.toggle("dark-mode", dark);
    themeButton.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    themeIcon.textContent = dark ? "☼" : "◐";
  };
  applyTheme(localStorage.getItem("bulawayo-map-theme") === "dark");
  themeButton.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark-mode");
    localStorage.setItem("bulawayo-map-theme", dark ? "dark" : "light");
    applyTheme(dark);
  });
  window.addEventListener("resize", () => state.map.invalidateSize());
}

setupMap();
setupEvents();
loadFacilities();
