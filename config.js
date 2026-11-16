export const CONFIG = {
  map: {
    center: [-20.15, 28.58],
    zoom: 12,
    minZoom: 9,
    maxZoom: 19,
    polygonZoom: 15,
    bounds: [
      [-20.32, 28.39],
      [-19.99, 28.78],
    ],
  },
  colors: {
    navy: "#101e35",
    ink: "#17243a",
    gold: "#d6a646",
    canvas: "#f3f5f8",
  },
  files: {
    facilities: "./data/facilities.geojson",
    cadastre: "./data/cadastre.geojson",
  },
  basemaps: {
    osm: {
      label: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" },
    },
    light: {
      label: "CARTO Positron",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      options: { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" },
    },
    dark: {
      label: "CARTO Dark Matter",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      options: { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" },
    },
    satellite: {
      label: "Esri World Imagery",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      options: {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
      },
    },
  },
  categories: {
    "Health": { color: "#cc6674", icon: "health", keywords: ["clinic", "hospital", "health", "medical", "dispensary"] },
    "Education": { color: "#4b79b9", icon: "education", keywords: ["school", "college", "nursery", "preschool", "pre-school", "training institute"] },
    "Community": { color: "#8a69af", icon: "community", keywords: ["community", "hall", "youth centre", "women day centre", "public building", "social hall"] },
    "Parks & recreation": { color: "#3d9879", icon: "park", keywords: ["park", "playground", "play ground", "open space", "sports", "stadium", "swimming", "garden", "recreation", "beer garden"] },
    "Transport": { color: "#cc8b3c", icon: "transport", keywords: ["bus terminus", "bus rank", "terminus"] },
    "Emergency": { color: "#d35d42", icon: "emergency", keywords: ["fire station"] },
    "Cemetery": { color: "#777f8d", icon: "cemetery", keywords: ["cemetery", "graveyard"] },
    "Markets": { color: "#bf8e3f", icon: "market", keywords: ["market", "flea market"] },
    "Utilities": { color: "#378f9e", icon: "utilities", keywords: ["water works", "waterworks", "sewer", "sewerage", "water treatment", "water pump"] },
    "Civic offices": { color: "#64728d", icon: "civic", keywords: ["municipal office", "municipal offices", "administration office", "admin offices", "local authority", "township lands"] },
  },
};
