const MAPS = {
  hagga: {
    id: "hagga",
    title: "Hagga Basin",
    tileUrl: "https://cdn.th.gl/dune-awakening/map-tiles/survival_1-0c70ddebb3e41cf49915b22e103e94ed/{z}/{y}/{x}.webp?v=1",
    emptyText: "No guild bases placed yet.",
  },
  deep: {
    id: "deep",
    title: "Deep Desert",
    tileUrl: "https://cdn.th.gl/dune-awakening/map-tiles/deepdesert_1-0d22aa96e0f7e8eb77b2c3a6623dad7c/{z}/{y}/{x}.webp?v=1",
    emptyText: "No Deep Desert locations placed yet.",
  },
};

const TILE_SIZE = 256;
const INITIAL_ZOOM = 2;
const MIN_ZOOM = INITIAL_ZOOM - 1;
const MAX_ZOOM = INITIAL_ZOOM + 2;
const ZOOM_STEPS_PER_LEVEL = 3;
const ZOOM_STEP = 1 / ZOOM_STEPS_PER_LEVEL;
const MEMBER_BASE_LIMIT = 3;
const APP_VERSION = "v33";
const VERSION_URL = "https://cdn.th.gl/dune-awakening/version.json";
const SPICE_FIELDS_URL = "./deep-spice-fields.json?v=3";

const config = window.GRIFFIN_SUPABASE || {};
const supabaseClient = window.supabase?.createClient(config.url, config.anonKey);

const map = document.querySelector("#map");
const tileLayer = document.querySelector("#tileLayer");
const gridLayer = document.querySelector("#gridLayer");
const spiceLayer = document.querySelector("#spiceLayer");
const markerLayer = document.querySelector("#markerLayer");
const deepResourceLegend = document.querySelector("#deepResourceLegend");
const resourceToggles = [...document.querySelectorAll(".resource-toggle")];
const resourceToggleAll = document.querySelector("#resourceToggleAll");
const pageTitle = document.querySelector("#pageTitle");
const zoomSlider = document.querySelector("#zoomSlider");
const playerNameInput = document.querySelector("#playerName");
const seitchNameInput = document.querySelector("#seitchName");
const seitchField = document.querySelector("#seitchField");
const deepTypeField = document.querySelector("#deepTypeField");
const deepMarkerTypeInput = document.querySelector("#deepMarkerType");
const deepZoneField = document.querySelector("#deepZoneField");
const deepPvpZoneInput = document.querySelector("#deepPvpZone");
const deepGuildField = document.querySelector("#deepGuildField");
const deepGuildBaseInput = document.querySelector("#deepGuildBase");
const markerTypeField = document.querySelector("#markerTypeField");
const markerTypeInput = document.querySelector("#markerType");
const placeButton = document.querySelector("#placeButton");
const cancelButton = document.querySelector("#cancelButton");
const actionRow = placeButton.closest(".actions");
const modeHint = document.querySelector("#modeHint");
const baseLimitHint = document.querySelector("#baseLimitHint");
const userIdHint = document.querySelector("#userIdHint");
const baseList = document.querySelector("#baseList");
const baseCount = document.querySelector("#baseCount");
const syncStatus = document.querySelector("#syncStatus");
const adminBadge = document.querySelector("#adminBadge");
const deepResetStatus = document.querySelector("#deepResetStatus");
const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const editPlayerNameInput = document.querySelector("#editPlayerName");
const editSeitchNameInput = document.querySelector("#editSeitchName");
const editGuildField = document.querySelector("#editGuildField");
const editGuildAccessInput = document.querySelector("#editGuildAccess");
const editCancelButton = document.querySelector("#editCancelButton");
const mapTabs = [...document.querySelectorAll(".map-tab")];

setSyncStatus("Loading");

let markers = [];
let spiceFieldData = { bySignature: {}, default: [] };
let currentDeepOverlays = emptyDeepOverlays();
let placing = false;
let movingMarkerId = null;
let selectedMarkerId = null;
let isDragging = false;
let dragStart = null;
let isAdmin = false;
let currentUserId = null;
let editingMarkerId = null;
let activeMapId = initialMapIdFromUrl();
let deepDesertSignature = MAPS.deep.tileUrl;

const DEEP_OVERLAY_TYPES = {
  spice: {
    label: "Large Spice Field",
    itemLabel: "Large Spice Field",
    className: "spice",
  },
  titanium: {
    label: "Titanium",
    itemLabel: "Titanium",
    className: "titanium",
  },
  stravidium: {
    label: "Stravidium",
    itemLabel: "Stravidium",
    className: "stravidium",
  },
  testingStation: {
    label: "Testing Stations",
    itemLabel: "Testing Station",
    className: "testing-station",
  },
  cave: {
    label: "Loot Cave",
    itemLabel: "Loot Cave",
    className: "cave",
  },
};

const savedName = localStorage.getItem("griffinWingPlayerName");
if (savedName) playerNameInput.value = savedName;
const savedSeitchName = localStorage.getItem("griffinWingSeitchName");
if (savedSeitchName) seitchNameInput.value = savedSeitchName;

const view = {
  zoom: INITIAL_ZOOM,
  offsetX: 0,
  offsetY: 0,
};

function activeMap() {
  return MAPS[activeMapId];
}

function setSyncStatus(status) {
  syncStatus.textContent = `${APP_VERSION} ${status}`;
}

function initialMapIdFromUrl() {
  const params = new URLSearchParams(location.search);
  const rawValue = params.get("map") || location.hash.slice(1) || "";
  const value = rawValue.toLowerCase().replace(/[^a-z]/g, "");

  if (["deep", "dd", "deepdesert", "thedeepdesert"].includes(value)) return "deep";
  if (["hagga", "haggabasin"].includes(value)) return "hagga";
  return "hagga";
}

function updateMapUrl(mapId) {
  const url = new URL(location.href);
  url.hash = "";

  if (mapId === "deep") {
    url.searchParams.set("map", "deep");
  } else {
    url.searchParams.delete("map");
  }

  history.replaceState(null, "", url);
}

function isDeepMap() {
  return activeMapId === "deep";
}

function deepDesertSignatureId() {
  const match = deepDesertSignature.match(/map-tiles\/([^/]+)\//);
  return match?.[1] || deepDesertSignature;
}

function emptyDeepOverlays() {
  return {
    spice: [],
    titanium: [],
    stravidium: [],
    testingStation: [],
    cave: [],
  };
}

function normalizeDeepOverlayData(value) {
  const overlays = emptyDeepOverlays();
  if (Array.isArray(value)) {
    overlays.spice = value;
    return overlays;
  }
  if (!value || typeof value !== "object") return overlays;

  overlays.spice = Array.isArray(value.spice) ? value.spice : Array.isArray(value.largeSpice) ? value.largeSpice : [];
  overlays.titanium = Array.isArray(value.titanium) ? value.titanium : [];
  overlays.stravidium = Array.isArray(value.stravidium) ? value.stravidium : [];
  overlays.testingStation = Array.isArray(value.testingStation) ? value.testingStation : Array.isArray(value.testingStations) ? value.testingStations : [];
  overlays.cave = Array.isArray(value.cave) ? value.cave : Array.isArray(value.caves) ? value.caves : [];
  return overlays;
}

function currentDeepOverlayData() {
  const signatureId = deepDesertSignatureId();
  return normalizeDeepOverlayData(spiceFieldData.bySignature?.[signatureId] || spiceFieldData.default || []);
}

async function loadSpiceFieldData() {
  try {
    const response = await fetch(SPICE_FIELDS_URL, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    spiceFieldData = {
      bySignature: data.bySignature || {},
      default: data.default || [],
    };
    currentDeepOverlays = currentDeepOverlayData();
  } catch {
    currentDeepOverlays = emptyDeepOverlays();
  }
}

function formatResetTimestamp(value) {
  if (!value) return "";
  const resetDate = new Date(value);
  if (Number.isNaN(resetDate.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(resetDate);
}

function updateDeepResetStatus(value) {
  const formatted = formatResetTimestamp(value);
  deepResetStatus.classList.toggle("hidden", !formatted);
  if (formatted) deepResetStatus.textContent = `DD reset: ${formatted}`;
}

function worldSize(zoom = view.zoom) {
  return TILE_SIZE * 2 ** zoom;
}

function normalizeZoom(zoom) {
  const snapped = Math.round(zoom * ZOOM_STEPS_PER_LEVEL) / ZOOM_STEPS_PER_LEVEL;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, snapped));
}

function tileZoomForView() {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.ceil(view.zoom)));
}

function displayTileSize(tileZoom = tileZoomForView()) {
  return TILE_SIZE * 2 ** (view.zoom - tileZoom);
}

function panBounds() {
  const size = worldSize();
  const rect = map.getBoundingClientRect();
  const marginX = rect.width * 0.35;
  const marginY = rect.height * 0.35;
  return {
    minX: Math.min(marginX, rect.width - size - marginX),
    maxX: Math.max(marginX, rect.width - size - marginX),
    minY: Math.min(marginY, rect.height - size - marginY),
    maxY: Math.max(marginY, rect.height - size - marginY),
  };
}

function clampView() {
  const { minX, maxX, minY, maxY } = panBounds();
  view.offsetX = Math.max(minX, Math.min(maxX, view.offsetX));
  view.offsetY = Math.max(minY, Math.min(maxY, view.offsetY));
}

function centerMap() {
  const { minX, maxX, minY, maxY } = panBounds();
  view.offsetX = (minX + maxX) / 2;
  view.offsetY = (minY + maxY) / 2;
  render();
}

function tileUrl(z, x, y) {
  return activeMap().tileUrl
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y);
}

async function refreshMapTileUrls() {
  const response = await fetch(VERSION_URL, { cache: "no-store" });
  if (!response.ok) return;

  const version = await response.json();
  const tiles = version?.data?.tiles || {};
  for (const [mapId, tileKey] of Object.entries({ hagga: "survival_1", deep: "deepdesert_1" })) {
    const tile = tiles[tileKey];
    if (tile?.url) {
      MAPS[mapId].tileUrl = `https://cdn.th.gl/dune-awakening${tile.url}?v=1`;
    }
  }

  deepDesertSignature = MAPS.deep.tileUrl;
}

function renderTiles() {
  const rect = map.getBoundingClientRect();
  const tileZoom = tileZoomForView();
  const tileSize = displayTileSize(tileZoom);
  const count = 2 ** tileZoom;
  const startX = Math.max(0, Math.floor(-view.offsetX / tileSize));
  const startY = Math.max(0, Math.floor(-view.offsetY / tileSize));
  const endX = Math.min(count - 1, Math.floor((rect.width - view.offsetX) / tileSize));
  const endY = Math.min(count - 1, Math.floor((rect.height - view.offsetY) / tileSize));
  const wanted = new Set();

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      const key = `${activeMapId}:${tileZoom}:${x}:${y}`;
      wanted.add(key);
      let img = tileLayer.querySelector(`[data-key="${key}"]`);
      if (!img) {
        img = document.createElement("img");
        img.className = "tile";
        img.dataset.key = key;
        img.decoding = "async";
        img.draggable = false;
        img.addEventListener("error", () => {
          modeHint.textContent = "Map tiles did not load. Check internet access or CDN blocking.";
        }, { once: true });
        img.src = tileUrl(tileZoom, x, y);
        tileLayer.appendChild(img);
      }
      img.style.width = `${tileSize}px`;
      img.style.height = `${tileSize}px`;
      img.style.transform = `translate(${view.offsetX + x * tileSize}px, ${view.offsetY + y * tileSize}px)`;
    }
  }

  for (const img of [...tileLayer.children]) {
    if (!wanted.has(img.dataset.key)) img.remove();
  }
}

function markerIconClass(marker) {
  if (marker.targetType === "enemy" || marker.iconType === "enemy") return "enemy";
  if (marker.iconType === "guild") return "guild";
  return marker.iconType === "other" ? "other" : marker.ownerId === currentUserId || marker.claimedByMe ? "own" : "other";
}

function renderGrid() {
  gridLayer.replaceChildren();
  gridLayer.classList.toggle("hidden", !isDeepMap());
  if (!isDeepMap()) return;

  const size = worldSize();
  gridLayer.style.left = `${view.offsetX}px`;
  gridLayer.style.top = `${view.offsetY}px`;
  gridLayer.style.width = `${size}px`;
  gridLayer.style.height = `${size}px`;

  for (let index = 1; index < 9; index += 1) {
    const vertical = document.createElement("span");
    vertical.className = "grid-line vertical";
    vertical.style.left = `${(index / 9) * 100}%`;

    const horizontal = document.createElement("span");
    horizontal.className = "grid-line horizontal";
    horizontal.style.top = `${(index / 9) * 100}%`;

    gridLayer.append(vertical, horizontal);
  }

  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const label = document.createElement("span");
      label.className = "grid-label sector";
      label.textContent = sectorName(column, row);
      label.style.left = `${((column + 0.5) / 9) * 100}%`;
      label.style.top = `${((row + 0.5) / 9) * 100}%`;
      gridLayer.appendChild(label);
    }
  }
}

function sectorNameFromPoint(x, y) {
  const column = Math.max(0, Math.min(8, Math.floor(x * 9)));
  const row = Math.max(0, Math.min(8, Math.floor(y * 9)));
  return sectorName(column, row);
}

function sectorName(column, row) {
  const lettersBottomToTop = "ABCDEFGHI";
  return `${lettersBottomToTop[8 - row]}${column + 1}`;
}

function renderSpiceFields() {
  spiceLayer.replaceChildren();
  const visible = isDeepMap() && Object.keys(DEEP_OVERLAY_TYPES).some((type) => {
    return resourceEnabled(type) && currentDeepOverlays[type]?.length > 0;
  });
  spiceLayer.classList.toggle("hidden", !visible);
  if (!visible) return;

  const size = worldSize();
  for (const [type, config] of Object.entries(DEEP_OVERLAY_TYPES)) {
    if (!resourceEnabled(type)) continue;
    const fields = currentDeepOverlays[type] || [];
    for (const field of fields) {
      const fieldWrap = document.createElement("div");
      fieldWrap.className = `spice-field ${config.className}`;
      fieldWrap.style.left = `${view.offsetX + field.x * size}px`;
      fieldWrap.style.top = `${view.offsetY + field.y * size}px`;
      fieldWrap.title = config.itemLabel;

      const label = document.createElement("span");
      label.className = "spice-field-label";

      const labelName = document.createElement("strong");
      labelName.textContent = config.itemLabel;
      label.appendChild(labelName);

      const sectorLine = document.createElement("small");
      sectorLine.textContent = sectorNameFromPoint(field.x, field.y);
      label.appendChild(sectorLine);

      fieldWrap.appendChild(label);
      spiceLayer.appendChild(fieldWrap);
    }
  }
}

function resourceEnabled(type) {
  const toggle = deepResourceLegend?.querySelector(`.resource-toggle[data-resource-type="${type}"]`);
  return !toggle || toggle.checked;
}

function syncResourceToggleAll() {
  if (!resourceToggleAll) return;
  const resourceTypeToggles = resourceToggles.filter((toggle) => toggle.dataset.resourceType);
  const checkedCount = resourceTypeToggles.filter((toggle) => toggle.checked).length;
  resourceToggleAll.checked = checkedCount === resourceTypeToggles.length;
  resourceToggleAll.indeterminate = checkedCount > 0 && checkedCount < resourceTypeToggles.length;
}

function clearResourceHover() {
  spiceLayer.querySelectorAll(".spice-field.hovered").forEach((item) => item.classList.remove("hovered"));
}

function updateResourceHover(event) {
  if (!isDeepMap() || isDragging) {
    clearResourceHover();
    return;
  }

  let closest = null;
  let closestDistance = Infinity;
  for (const field of spiceLayer.querySelectorAll(".spice-field")) {
    const rect = field.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
    const hoverRadius = Math.max(rect.width, rect.height) / 2 + 6;
    if (distance <= hoverRadius && distance < closestDistance) {
      closest = field;
      closestDistance = distance;
    }
  }

  for (const field of spiceLayer.querySelectorAll(".spice-field")) {
    field.classList.toggle("hovered", field === closest);
  }
}

function renderMarkers() {
  markerLayer.replaceChildren();
  const size = worldSize();

  for (const marker of markers) {
    if (marker.mapId !== activeMapId) continue;

    const markerWrap = document.createElement("div");
    markerWrap.className = "marker-wrap";
    markerWrap.style.left = `${view.offsetX + marker.x * size}px`;
    markerWrap.style.top = `${view.offsetY + marker.y * size}px`;

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = [
      "marker",
      markerIconClass(marker),
      marker.id === selectedMarkerId ? "selected" : "",
    ].filter(Boolean).join(" ");
    pin.title = marker.label;
    pin.dataset.id = marker.id;
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedMarkerId = marker.id;
      render();
    });

    const label = document.createElement("span");
    label.className = "marker-label";

    const labelName = document.createElement("strong");
    labelName.textContent = marker.label;
    label.appendChild(labelName);

    const secondary = marker.mapId === "deep"
      ? marker.targetType === "enemy" ? sectorNameFromPoint(marker.x, marker.y) : `${marker.zoneType.toUpperCase()} Base`
      : marker.seitchName;

    if (secondary) {
      const secondaryLine = document.createElement("small");
      secondaryLine.textContent = secondary;
      label.appendChild(secondaryLine);
    }

    markerWrap.append(pin, label);
    markerLayer.append(markerWrap);
  }
}

function currentMapMarkers() {
  return markers.filter((marker) => marker.mapId === activeMapId);
}

function renderList() {
  updateBaseLimitHint();
  const visibleMarkers = currentMapMarkers();
  const friendlyMarkers = visibleMarkers.filter((marker) => marker.targetType !== "enemy");
  const enemyMarkers = visibleMarkers.filter((marker) => marker.targetType === "enemy");
  baseCount.textContent = isDeepMap() ? `${friendlyMarkers.length}/${enemyMarkers.length}` : String(visibleMarkers.length);
  baseList.replaceChildren();

  if (!visibleMarkers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = activeMap().emptyText;
    baseList.appendChild(empty);
    return;
  }

  if (isDeepMap()) {
    renderMarkerSection("Friendly Bases", friendlyMarkers);
    renderMarkerSection("Enemy Bases", enemyMarkers);
    return;
  }

  renderMarkerSection(null, visibleMarkers);
}

function renderMarkerSection(title, sectionMarkers) {
  if (title) {
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "base-section-header";

    const sectionTitle = document.createElement("strong");
    sectionTitle.textContent = title;

    const sectionCount = document.createElement("span");
    sectionCount.textContent = String(sectionMarkers.length);

    sectionHeader.append(sectionTitle, sectionCount);
    baseList.appendChild(sectionHeader);
  }

  if (!sectionMarkers.length) {
    const empty = document.createElement("p");
    empty.className = "empty compact";
    empty.textContent = title ? `No ${title.toLowerCase()} placed yet.` : activeMap().emptyText;
    baseList.appendChild(empty);
    return;
  }

  for (const marker of [...sectionMarkers].sort((a, b) => a.label.localeCompare(b.label))) {
    const isOwner = marker.ownerId === currentUserId;
    const canEdit = isAdmin || isOwner || marker.claimedByMe;
    const canDelete = isAdmin || isOwner || marker.targetType === "enemy";
    const canClaim = !isOwner && !isAdmin && marker.targetType !== "enemy";
    const canReleaseOwnership = isAdmin && isOwner && marker.targetType !== "enemy";
    const item = document.createElement("article");
    item.className = "base-item";

    if (canDelete) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger delete-chip";
      remove.title = "Delete";
      remove.setAttribute("aria-label", `Delete ${marker.label}`);
      remove.innerHTML = "<span>X</span><span>Delete</span>";
      remove.addEventListener("click", () => deleteMarker(marker));
      item.appendChild(remove);
    }

    const title = document.createElement("strong");
    title.textContent = marker.label;

    const details = document.createElement("div");
    details.className = "base-item-details";

    if (marker.mapId === "deep") {
      const locationType = document.createElement("small");
      locationType.textContent = marker.targetType === "enemy" ? `Sector: ${sectorNameFromPoint(marker.x, marker.y)}` : `Base - ${marker.zoneType.toUpperCase()}`;
      details.appendChild(locationType);
    } else if (marker.seitchName) {
      const seitch = document.createElement("small");
      seitch.textContent = `Seitch: ${marker.seitchName}`;
      details.appendChild(seitch);
    }

    const helperText = [
      marker.claimedByMe ? "Claimed by you." : "",
      !canEdit && marker.targetType !== "enemy" ? "Placed by another member." : "",
    ].filter(Boolean).join(" ");

    if (helperText) {
      const helper = document.createElement("small");
      helper.textContent = helperText;
      details.appendChild(helper);
    }

    const actions = document.createElement("div");
    actions.className = "base-item-actions";

    const focus = document.createElement("button");
    focus.type = "button";
    focus.className = "secondary";
    focus.textContent = "Show";
    focus.addEventListener("click", () => focusMarker(marker));
    actions.appendChild(focus);

    if (canEdit) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "secondary";
      move.textContent = "Move";
      move.addEventListener("click", () => startMoving(marker));

      actions.appendChild(move);

      if (marker.targetType !== "enemy") {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editMarkerDetails(marker));
        actions.appendChild(edit);
      }
    }

    if (canReleaseOwnership) {
      const release = document.createElement("button");
      release.type = "button";
      release.className = "secondary";
      release.textContent = "Release";
      release.title = "Make this an unclaimed imported base";
      release.addEventListener("click", () => releaseMarkerOwnership(marker));
      actions.appendChild(release);
    }

    if (canClaim) {
      const claim = document.createElement("button");
      claim.type = "button";
      claim.className = marker.claimedByMe ? "secondary" : "";
      claim.textContent = marker.claimedByMe ? "Unclaim" : "Claim";
      claim.addEventListener("click", () => toggleClaim(marker));
      actions.appendChild(claim);
    }

    item.append(title, details, actions);
    baseList.appendChild(item);
  }
}

function renderControls() {
  const enemyMode = isDeepMap() && deepMarkerTypeInput.value === "enemy";
  const deepBaseMode = isDeepMap() && deepMarkerTypeInput.value === "base";
  playerNameInput.closest(".field").classList.toggle("hidden", enemyMode);
  seitchField.classList.toggle("hidden", isDeepMap());
  deepResourceLegend?.classList.toggle("hidden", !isDeepMap());
  deepTypeField.classList.toggle("hidden", !isDeepMap());
  deepZoneField.classList.toggle("hidden", !deepBaseMode);
  deepGuildField.classList.toggle("hidden", !deepBaseMode);
  markerTypeField.classList.toggle("hidden", !isAdmin || enemyMode);
  baseLimitHint.classList.toggle("hidden", isDeepMap() || enemyMode);
  actionRow.classList.toggle("centered", !isDeepMap());
  mapTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mapId === activeMapId));
  map.setAttribute("aria-label", `${activeMap().title} map`);
  pageTitle.textContent = isDeepMap() ? "DD Bases and Enemy Locations" : "Griffin Wing Base Map";
  zoomSlider.value = String(view.zoom);
  syncMarkerTypeOptions();
}

function render() {
  clampView();
  renderControls();
  renderTiles();
  renderGrid();
  renderSpiceFields();
  renderMarkers();
  renderList();
}

function mapPointFromEvent(event) {
  const rect = map.getBoundingClientRect();
  const size = worldSize();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left - view.offsetX) / size)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top - view.offsetY) / size)),
  };
}

function playerName() {
  return playerNameInput.value.trim().replace(/\s+/g, " ");
}

function seitchName() {
  return seitchNameInput.value.trim().replace(/\s+/g, " ");
}

function ownedBaseCount() {
  return markers.filter((marker) => marker.mapId === activeMapId && marker.ownerId === currentUserId && marker.targetType === "base").length;
}

function updateBaseLimitHint() {
  if (isDeepMap()) {
    baseLimitHint.textContent = "";
    placeButton.disabled = false;
    return;
  }

  if (isAdmin) {
    baseLimitHint.textContent = "Admin placement is unlimited.";
    placeButton.disabled = false;
    return;
  }

  const used = ownedBaseCount();
  baseLimitHint.textContent = `Your ${activeMap().title} bases: ${used}/${MEMBER_BASE_LIMIT}`;
  placeButton.disabled = used >= MEMBER_BASE_LIMIT && !movingMarkerId;
}

function normalizeMarker(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    mapId: row.map_id || "hagga",
    playerName: row.player_name,
    seitchName: row.seitch_name || "",
    label: row.label,
    x: row.x,
    y: row.y,
    type: row.type,
    targetType: row.target_type || row.type || "base",
    zoneType: row.zone_type || "pve",
    iconType: row.icon_type,
    claimedByMe: Boolean(row.claimedByMe),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function markerPayload(point, marker) {
  const targetType = isDeepMap() ? deepMarkerTypeInput.value : "base";
  const nextIconType = marker?.iconType
    || (isDeepMap() && targetType === "base" && deepGuildBaseInput.checked ? "guild" : null)
    || (isAdmin ? markerTypeInput.value : "auto");

  return {
    player_name: marker?.playerName || (targetType === "enemy" ? "Enemy" : playerName()),
    seitch_name: isDeepMap() ? "" : marker?.seitchName || seitchName(),
    map_id: marker?.mapId || activeMapId,
    target_type: marker?.targetType || targetType,
    zone_type: marker?.zoneType || (isDeepMap() ? (deepPvpZoneInput.checked ? "pvp" : "pve") : "pve"),
    icon_type: marker?.targetType === "enemy" || targetType === "enemy" ? "enemy" : nextIconType,
    x: point.x,
    y: point.y,
  };
}

function upsertMarker(marker) {
  const existingIndex = markers.findIndex((item) => item.id === marker.id);
  if (existingIndex >= 0) {
    markers = markers.map((item) => (item.id === marker.id ? { ...marker, claimedByMe: item.claimedByMe } : item));
  } else {
    markers = [...markers, marker];
  }
}

function setMarkerClaim(markerId, claimedByMe) {
  markers = markers.map((marker) => marker.id === markerId ? { ...marker, claimedByMe } : marker);
}

function removeMarker(markerId) {
  markers = markers.filter((item) => item.id !== markerId);
  if (selectedMarkerId === markerId) selectedMarkerId = null;
}

async function saveMarker(point, marker = null) {
  const targetType = isDeepMap() ? deepMarkerTypeInput.value : "base";
  const name = targetType === "enemy" ? "Enemy" : playerName();
  if (!name) {
    playerNameInput.focus();
    modeHint.textContent = "Enter your name first, then place the marker.";
    return;
  }

  if (targetType !== "enemy") {
    localStorage.setItem("griffinWingPlayerName", name);
    localStorage.setItem("griffinWingSeitchName", seitchName());
  }

  let query;
  if (marker) {
    query = supabaseClient
      .from("base_markers")
      .update(markerPayload(point, marker))
      .eq("id", marker.id)
      .select()
      .single();
  } else {
    query = supabaseClient
      .from("base_markers")
      .insert({
        owner_id: currentUserId,
        label: targetType === "enemy" ? "Enemy Base" : `${name}'s Base`,
        type: targetType,
        ...markerPayload(point),
      })
      .select()
      .single();
  }

  const { data, error } = await query;
  if (error) {
    modeHint.textContent = error.message || "Could not save marker.";
    return;
  }

  const wasMoving = Boolean(marker);
  placing = false;
  movingMarkerId = null;
  if (wasMoving) selectedMarkerId = null;
  upsertMarker(normalizeMarker(data));
  map.classList.remove("placing");
  placeButton.textContent = "Place marker";
  cancelButton.classList.add("hidden");
  modeHint.textContent = "Marker saved. Connected guild members will see it automatically.";
  render();
}

async function deleteMarker(marker) {
  const { error } = await supabaseClient
    .from("base_markers")
    .delete()
    .eq("id", marker.id);

  if (error) {
    modeHint.textContent = error.message || "Could not delete marker.";
    return;
  }

  removeMarker(marker.id);
  modeHint.textContent = "Marker deleted. Connected guild members will see it automatically.";
  render();
}

async function saveMarkerDetails(marker) {
  const cleanPlayerName = editPlayerNameInput.value.trim().replace(/\s+/g, " ");
  if (!cleanPlayerName) {
    editPlayerNameInput.focus();
    modeHint.textContent = "Name cannot be blank.";
    return false;
  }

  const updates = {
    player_name: cleanPlayerName,
    seitch_name: marker.mapId === "deep" ? "" : editSeitchNameInput.value.trim().replace(/\s+/g, " "),
  };

  if (isAdmin) {
    updates.icon_type = editGuildAccessInput.checked ? "guild" : marker.iconType === "guild" ? "auto" : marker.iconType;
  }

  const { data, error } = await supabaseClient
    .from("base_markers")
    .update(updates)
    .eq("id", marker.id)
    .select()
    .single();

  if (error) {
    modeHint.textContent = error.message || "Could not edit marker details.";
    return false;
  }

  upsertMarker(normalizeMarker(data));
  modeHint.textContent = "Marker details updated. Connected guild members will see it automatically.";
  render();
  return true;
}

function editMarkerDetails(marker) {
  editingMarkerId = marker.id;
  editPlayerNameInput.value = marker.playerName || "";
  editSeitchNameInput.value = marker.seitchName || "";
  editSeitchNameInput.closest(".field").classList.toggle("hidden", marker.mapId === "deep");
  editGuildAccessInput.checked = marker.iconType === "guild";
  editGuildField.classList.toggle("hidden", !isAdmin || marker.targetType === "enemy");
  editDialog.showModal();
  editPlayerNameInput.focus();
}

async function toggleClaim(marker) {
  if (marker.claimedByMe) {
    const { error } = await supabaseClient
      .from("base_marker_claims")
      .delete()
      .eq("marker_id", marker.id)
      .eq("user_id", currentUserId);

    if (error) {
      modeHint.textContent = error.message || "Could not unclaim marker.";
      return;
    }

    setMarkerClaim(marker.id, false);
    modeHint.textContent = "Marker unclaimed. It will now appear as another member's marker.";
  } else {
    const { error } = await supabaseClient
      .from("base_marker_claims")
      .insert({ marker_id: marker.id, user_id: currentUserId });

    if (error) {
      modeHint.textContent = error.message || "Could not claim marker.";
      return;
    }

    setMarkerClaim(marker.id, true);
    modeHint.textContent = "Marker claimed. It will now use your base icon.";
  }

  render();
}

async function releaseMarkerOwnership(marker) {
  const { data, error } = await supabaseClient
    .from("base_markers")
    .update({ owner_id: null, icon_type: marker.iconType === "guild" ? "guild" : "auto" })
    .eq("id", marker.id)
    .select()
    .single();

  if (error) {
    modeHint.textContent = error.message || "Could not release marker ownership.";
    return;
  }

  upsertMarker(normalizeMarker(data));
  modeHint.textContent = "Marker released. It will now appear as another member's base until someone claims it.";
  render();
}

function startPlacing() {
  if (!isAdmin && !isDeepMap() && ownedBaseCount() >= MEMBER_BASE_LIMIT) {
    modeHint.textContent = `Members can place up to ${MEMBER_BASE_LIMIT} bases on this map. Delete one first to place another.`;
    updateBaseLimitHint();
    return;
  }

  placing = true;
  movingMarkerId = null;
  map.classList.add("placing");
  placeButton.textContent = "Click the map";
  cancelButton.classList.remove("hidden");
  modeHint.textContent = "Click the exact spot for this marker.";
}

function startMoving(marker) {
  if (movingMarkerId === marker.id) {
    cancelPlacement();
    selectedMarkerId = null;
    render();
    return;
  }

  selectedMarkerId = marker.id;
  placing = true;
  movingMarkerId = marker.id;
  if (isAdmin) markerTypeInput.value = marker.iconType || "other";
  map.classList.add("placing");
  placeButton.textContent = "Moving marker";
  cancelButton.classList.remove("hidden");
  modeHint.textContent = `Click the new location for ${marker.label}.`;
  render();
}

function cancelPlacement() {
  placing = false;
  movingMarkerId = null;
  selectedMarkerId = null;
  map.classList.remove("placing");
  placeButton.textContent = "Place marker";
  cancelButton.classList.add("hidden");
  modeHint.textContent = "Pan and zoom the map. Choose Place marker, then click the location.";
  render();
}

function focusMarker(marker) {
  const size = worldSize();
  const rect = map.getBoundingClientRect();
  selectedMarkerId = marker.id;
  view.offsetX = rect.width / 2 - marker.x * size;
  view.offsetY = rect.height / 2 - marker.y * size;
  render();
}

function changeZoom(delta, clientX, clientY) {
  const nextZoom = normalizeZoom(view.zoom + delta);
  if (nextZoom === view.zoom) return;

  const rect = map.getBoundingClientRect();
  const beforeSize = worldSize();
  const focusX = (clientX - rect.left - view.offsetX) / beforeSize;
  const focusY = (clientY - rect.top - view.offsetY) / beforeSize;

  view.zoom = nextZoom;
  const afterSize = worldSize();
  view.offsetX = clientX - rect.left - focusX * afterSize;
  view.offsetY = clientY - rect.top - focusY * afterSize;
  tileLayer.replaceChildren();
  render();
}

function zoomFromSlider() {
  const rect = map.getBoundingClientRect();
  changeZoom(Number(zoomSlider.value) - view.zoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function endDrag(pointerId = null) {
  if (pointerId !== null && dragStart?.pointerId !== pointerId) return;
  if (dragStart && map.hasPointerCapture?.(dragStart.pointerId)) {
    try {
      map.releasePointerCapture(dragStart.pointerId);
    } catch {
      // Pointer capture can already be gone if the browser ended it first.
    }
  }
  isDragging = false;
  dragStart = null;
  map.classList.remove("dragging");
}

function setDeepOverlayDefaults() {
}

async function switchMap(nextMapId) {
  if (!MAPS[nextMapId] || activeMapId === nextMapId) return;
  activeMapId = nextMapId;
  updateMapUrl(nextMapId);
  currentDeepOverlays = currentDeepOverlayData();
  if (activeMapId === "deep") setDeepOverlayDefaults();
  placing = false;
  movingMarkerId = null;
  selectedMarkerId = null;
  view.zoom = INITIAL_ZOOM;
  tileLayer.replaceChildren();
  map.classList.remove("placing");
  placeButton.textContent = "Place marker";
  cancelButton.classList.add("hidden");
  modeHint.textContent = "";
  centerMap();
}

function syncMarkerTypeOptions() {
  const enemyOption = markerTypeInput.querySelector('option[value="enemy"]');
  if (!enemyOption) return;

  enemyOption.hidden = !isDeepMap();
  enemyOption.disabled = !isDeepMap();

  if (!isDeepMap() && markerTypeInput.value === "enemy") {
    markerTypeInput.value = "other";
  }
}

placeButton.textContent = "Place marker";
placeButton.addEventListener("click", startPlacing);
cancelButton.addEventListener("click", cancelPlacement);
editCancelButton.addEventListener("click", () => editDialog.close());
deepMarkerTypeInput.addEventListener("change", () => {
  if (deepMarkerTypeInput.value === "enemy") {
    deepGuildBaseInput.checked = false;
    if (isAdmin) markerTypeInput.value = "enemy";
  } else if (isAdmin && markerTypeInput.value === "enemy") {
    markerTypeInput.value = deepGuildBaseInput.checked ? "guild" : "own";
  }
  render();
});
deepGuildBaseInput.addEventListener("change", () => {
  if (isAdmin && deepMarkerTypeInput.value === "base") {
    markerTypeInput.value = deepGuildBaseInput.checked ? "guild" : "own";
  }
  render();
});
mapTabs.forEach((tab) => tab.addEventListener("click", () => switchMap(tab.dataset.mapId)));
deepResourceLegend?.addEventListener("change", (event) => {
  const toggle = event.target.closest(".resource-toggle");
  if (!toggle) return;
  if (toggle === resourceToggleAll) {
    resourceToggles.forEach((item) => {
      if (item.dataset.resourceType) item.checked = resourceToggleAll.checked;
    });
  }
  syncResourceToggleAll();
  render();
});
deepResourceLegend?.addEventListener("click", (event) => {
  if (event.target.closest(".resource-toggle")) event.stopPropagation();
});
zoomSlider.addEventListener("input", zoomFromSlider);

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const marker = markers.find((item) => item.id === editingMarkerId);
  if (!marker) {
    editDialog.close();
    return;
  }

  const saved = await saveMarkerDetails(marker);
  if (saved) {
    editDialog.close();
    editingMarkerId = null;
  }
});

map.addEventListener("pointerdown", (event) => {
  if (placing || event.target.closest(".map-tabs, .zoom-control, .resource-legend")) return;
  if (event.button !== 0) return;
  event.preventDefault();
  window.getSelection?.().removeAllRanges();
  isDragging = true;
  dragStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
  };
  map.setPointerCapture(event.pointerId);
  map.classList.add("dragging");
});

map.addEventListener("pointermove", (event) => {
  updateResourceHover(event);
  if (!isDragging || !dragStart) return;
  event.preventDefault();
  if (event.pointerType === "mouse" && event.buttons === 0) {
    endDrag(event.pointerId);
    return;
  }
  view.offsetX = dragStart.offsetX + event.clientX - dragStart.x;
  view.offsetY = dragStart.offsetY + event.clientY - dragStart.y;
  render();
});

map.addEventListener("pointerup", (event) => {
  endDrag(event.pointerId);
});

map.addEventListener("pointercancel", (event) => endDrag(event.pointerId));
map.addEventListener("lostpointercapture", (event) => endDrag(event.pointerId));
map.addEventListener("pointerleave", clearResourceHover);

map.addEventListener("click", (event) => {
  if (event.target.closest(".map-tabs, .zoom-control, .resource-legend")) return;

  if (!placing) return;
  const marker = markers.find((item) => item.id === movingMarkerId);
  if (marker) {
    selectedMarkerId = null;
    render();
  }
  saveMarker(mapPointFromEvent(event), marker);
});

map.addEventListener("wheel", (event) => {
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, event.clientX, event.clientY);
}, { passive: false });

window.addEventListener("resize", render);
window.addEventListener("pointerup", (event) => endDrag(event.pointerId));
window.addEventListener("blur", () => endDrag());

async function ensureAuth() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData.session?.user) {
    currentUserId = sessionData.session.user.id;
    return;
  }

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  currentUserId = data.user.id;
}

async function loadAdminStatus() {
  const { data, error } = await supabaseClient.rpc("is_map_admin");
  isAdmin = !error && Boolean(data);
  adminBadge.classList.toggle("hidden", !isAdmin);
}

async function resetDeepDesertIfChanged() {
  const { data, error } = await supabaseClient.rpc("reset_deep_desert_if_changed", {
    next_signature: deepDesertSignature,
  });

  if (error) {
    modeHint.textContent = "Deep Desert weekly reset check is not installed yet. Run the latest Supabase query when ready.";
    return;
  }

  if (data) {
    markers = markers.filter((marker) => marker.mapId !== "deep");
    modeHint.textContent = "A new Deep Desert map was detected, so old Deep Desert markers were cleared.";
  }

  await loadDeepDesertResetTimestamp();
}

async function loadDeepDesertResetTimestamp() {
  const { data, error } = await supabaseClient.rpc("deep_desert_reset_timestamp");
  if (error) {
    deepResetStatus.classList.add("hidden");
    return;
  }

  updateDeepResetStatus(data);
}

async function loadMarkers() {
  const { data, error } = await supabaseClient
    .from("base_markers")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  markers = data.map(normalizeMarker);

  const { data: claims, error: claimsError } = await supabaseClient
    .from("base_marker_claims")
    .select("marker_id")
    .eq("user_id", currentUserId);

  if (claimsError) throw claimsError;
  const claimedMarkerIds = new Set(claims.map((claim) => claim.marker_id));
  markers = markers.map((marker) => ({ ...marker, claimedByMe: claimedMarkerIds.has(marker.id) }));
  render();
}

function connectEvents() {
  supabaseClient
    .channel("base_map_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "base_markers" }, (payload) => {
      if (payload.eventType === "DELETE") {
        removeMarker(payload.old.id);
      } else {
        upsertMarker(normalizeMarker(payload.new));
      }
      setSyncStatus("Live");
      render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "base_marker_claims" }, (payload) => {
      if (payload.eventType === "INSERT" && payload.new.user_id === currentUserId) {
        setMarkerClaim(payload.new.marker_id, true);
      }
      if (payload.eventType === "DELETE" && payload.old.user_id === currentUserId) {
        setMarkerClaim(payload.old.marker_id, false);
      }
      setSyncStatus("Live");
      render();
    })
    .subscribe((status) => {
      setSyncStatus(status === "SUBSCRIBED" ? "Live" : "Connecting");
    });
}

async function boot() {
  try {
    await refreshMapTileUrls();
  } catch {
    modeHint.textContent = "Using bundled map tiles. Weekly Deep Desert tiles may need a refresh later.";
  }
  await loadSpiceFieldData();
  currentDeepOverlays = currentDeepOverlayData();
  if (activeMapId === "deep") setDeepOverlayDefaults();

  centerMap();

  if (!supabaseClient || !config.url || config.url.includes("PASTE_")) {
    throw new Error("Missing Supabase config in supabase-config.js.");
  }

  const bootTimeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Supabase connection timed out. Check anonymous auth and project settings.")), 12000);
  });

  await Promise.race([connectSupabase(), bootTimeout]);
}

async function connectSupabase() {
  await ensureAuth();
  if (new URLSearchParams(location.search).has("setup")) {
    userIdHint.classList.remove("hidden");
    userIdHint.textContent = `Admin setup ID: ${currentUserId}`;
  }

  await loadAdminStatus();
  await resetDeepDesertIfChanged();
  await loadMarkers();
  connectEvents();
}

boot().catch((error) => {
  setSyncStatus("Setup needed");
  modeHint.textContent = error.message || "The map loaded, but Supabase is not reachable.";
  centerMap();
});



