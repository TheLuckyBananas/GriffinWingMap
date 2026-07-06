const TILE_URL = "https://cdn.th.gl/dune-awakening/map-tiles/survival_1-0c70ddebb3e41cf49915b22e103e94ed/{z}/{x}/{y}.webp?v=1";
const TILE_SIZE = 256;
const INITIAL_ZOOM = 2;
const MIN_ZOOM = INITIAL_ZOOM - 1;
const MAX_ZOOM = INITIAL_ZOOM + 2;
const MEMBER_BASE_LIMIT = 3;

const config = window.GRIFFIN_SUPABASE || {};
const supabaseClient = window.supabase?.createClient(config.url, config.anonKey);

const map = document.querySelector("#map");
const tileLayer = document.querySelector("#tileLayer");
const markerLayer = document.querySelector("#markerLayer");
const playerNameInput = document.querySelector("#playerName");
const seitchNameInput = document.querySelector("#seitchName");
const markerTypeField = document.querySelector("#markerTypeField");
const markerTypeInput = document.querySelector("#markerType");
const placeButton = document.querySelector("#placeButton");
const cancelButton = document.querySelector("#cancelButton");
const modeHint = document.querySelector("#modeHint");
const baseLimitHint = document.querySelector("#baseLimitHint");
const userIdHint = document.querySelector("#userIdHint");
const baseList = document.querySelector("#baseList");
const baseCount = document.querySelector("#baseCount");
const syncStatus = document.querySelector("#syncStatus");
const adminBadge = document.querySelector("#adminBadge");

syncStatus.textContent = "Loading app v3";

let markers = [];
let placing = false;
let movingMarkerId = null;
let selectedMarkerId = null;
let isDragging = false;
let dragStart = null;
let isAdmin = false;
let currentUserId = null;

const savedName = localStorage.getItem("griffinWingPlayerName");
if (savedName) playerNameInput.value = savedName;
const savedSeitchName = localStorage.getItem("griffinWingSeitchName");
if (savedSeitchName) seitchNameInput.value = savedSeitchName;

const view = {
  zoom: INITIAL_ZOOM,
  offsetX: 0,
  offsetY: 0,
};

function worldSize(zoom = view.zoom) {
  return TILE_SIZE * 2 ** zoom;
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
  return TILE_URL.replace("{z}", z).replace("{x}", y).replace("{y}", x);
}

function renderTiles() {
  const rect = map.getBoundingClientRect();
  const count = 2 ** view.zoom;
  const startX = Math.max(0, Math.floor(-view.offsetX / TILE_SIZE));
  const startY = Math.max(0, Math.floor(-view.offsetY / TILE_SIZE));
  const endX = Math.min(count - 1, Math.floor((rect.width - view.offsetX) / TILE_SIZE));
  const endY = Math.min(count - 1, Math.floor((rect.height - view.offsetY) / TILE_SIZE));
  const wanted = new Set();

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      const key = `${view.zoom}:${x}:${y}`;
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
        img.src = tileUrl(view.zoom, x, y);
        tileLayer.appendChild(img);
      }
      img.style.transform = `translate(${view.offsetX + x * TILE_SIZE}px, ${view.offsetY + y * TILE_SIZE}px)`;
    }
  }

  for (const img of [...tileLayer.children]) {
    if (!wanted.has(img.dataset.key)) img.remove();
  }
}

function markerIconClass(marker) {
  return marker.iconType === "other" ? "other" : marker.ownerId === currentUserId ? "own" : "other";
}

function renderMarkers() {
  markerLayer.replaceChildren();
  const size = worldSize();

  for (const marker of markers) {
    const left = view.offsetX + marker.x * size;
    const top = view.offsetY + marker.y * size;

    const markerWrap = document.createElement("div");
    markerWrap.className = "marker-wrap";
    markerWrap.style.left = `${left}px`;
    markerWrap.style.top = `${top}px`;

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

    if (marker.seitchName) {
      const seitchLine = document.createElement("small");
      seitchLine.textContent = marker.seitchName;
      label.appendChild(seitchLine);
    }

    markerWrap.append(pin, label);
    markerLayer.append(markerWrap);
  }
}

function renderList() {
  updateBaseLimitHint();
  baseCount.textContent = String(markers.length);
  baseList.replaceChildren();

  if (!markers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No guild bases placed yet.";
    baseList.appendChild(empty);
    return;
  }

  for (const marker of [...markers].sort((a, b) => a.label.localeCompare(b.label))) {
    const canEdit = isAdmin || marker.ownerId === currentUserId;
    const item = document.createElement("article");
    item.className = "base-item";

    const title = document.createElement("strong");
    title.textContent = marker.label;

    const details = document.createElement("small");
    details.textContent = [
      marker.seitchName ? `Seitch: ${marker.seitchName}` : "",
      canEdit ? "You can move or delete this marker." : "Placed by another member.",
    ].filter(Boolean).join(" ");

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

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editMarkerDetails(marker));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteMarker(marker));
      actions.append(move, edit, remove);
    }

    item.append(title, details, actions);
    baseList.appendChild(item);
  }
}

function render() {
  clampView();
  renderTiles();
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
  return markers.filter((marker) => marker.ownerId === currentUserId).length;
}

function updateBaseLimitHint() {
  if (isAdmin) {
    baseLimitHint.textContent = "Admin placement is unlimited.";
    placeButton.disabled = false;
    return;
  }

  const used = ownedBaseCount();
  baseLimitHint.textContent = `Your bases: ${used}/${MEMBER_BASE_LIMIT}`;
  placeButton.disabled = used >= MEMBER_BASE_LIMIT && !movingMarkerId;
}

function normalizeMarker(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    playerName: row.player_name,
    seitchName: row.seitch_name || "",
    label: row.label,
    x: row.x,
    y: row.y,
    type: row.type,
    iconType: row.icon_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function markerPayload(point, marker) {
  const name = playerName();
  return {
    player_name: marker?.playerName || name,
    seitch_name: marker?.seitchName || seitchName(),
    icon_type: isAdmin ? markerTypeInput.value : "auto",
    x: point.x,
    y: point.y,
  };
}

function upsertMarker(marker) {
  const existingIndex = markers.findIndex((item) => item.id === marker.id);
  if (existingIndex >= 0) {
    markers = markers.map((item) => (item.id === marker.id ? marker : item));
  } else {
    markers = [...markers, marker];
  }
}

function removeMarker(markerId) {
  markers = markers.filter((item) => item.id !== markerId);
  if (selectedMarkerId === markerId) selectedMarkerId = null;
}

async function saveMarker(point, marker = null) {
  const name = playerName();
  if (!name) {
    playerNameInput.focus();
    modeHint.textContent = "Enter your name first, then place your base.";
    return;
  }

  localStorage.setItem("griffinWingPlayerName", name);
  localStorage.setItem("griffinWingSeitchName", seitchName());

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
        label: `${name}'s Base`,
        type: "base",
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

  placing = false;
  movingMarkerId = null;
  upsertMarker(normalizeMarker(data));
  map.classList.remove("placing");
  placeButton.textContent = "Place my base";
  cancelButton.classList.add("hidden");
  modeHint.textContent = "Base saved. Connected guild members will see it automatically.";
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
  modeHint.textContent = "Base deleted. Connected guild members will see it automatically.";
  render();
}

async function editMarkerDetails(marker) {
  const nextPlayerName = prompt("Base owner name", marker.playerName || "");
  if (nextPlayerName === null) return;

  const cleanPlayerName = nextPlayerName.trim().replace(/\s+/g, " ");
  if (!cleanPlayerName) {
    modeHint.textContent = "Base owner name cannot be blank.";
    return;
  }

  const nextSeitchName = prompt("Seitch Name", marker.seitchName || "");
  if (nextSeitchName === null) return;

  const { data, error } = await supabaseClient
    .from("base_markers")
    .update({
      player_name: cleanPlayerName,
      seitch_name: nextSeitchName.trim().replace(/\s+/g, " "),
    })
    .eq("id", marker.id)
    .select()
    .single();

  if (error) {
    modeHint.textContent = error.message || "Could not edit base details.";
    return;
  }

  upsertMarker(normalizeMarker(data));
  modeHint.textContent = "Base details updated. Connected guild members will see it automatically.";
  render();
}

function startPlacing() {
  if (!isAdmin && ownedBaseCount() >= MEMBER_BASE_LIMIT) {
    modeHint.textContent = `Members can place up to ${MEMBER_BASE_LIMIT} bases. Delete one first to place another.`;
    updateBaseLimitHint();
    return;
  }

  placing = true;
  movingMarkerId = null;
  map.classList.add("placing");
  placeButton.textContent = "Click the map";
  cancelButton.classList.remove("hidden");
  modeHint.textContent = "Click the exact spot where your base is located.";
}

function startMoving(marker) {
  selectedMarkerId = marker.id;
  placing = true;
  movingMarkerId = marker.id;
  if (isAdmin) markerTypeInput.value = marker.iconType || "other";
  map.classList.add("placing");
  placeButton.textContent = "Moving base";
  cancelButton.classList.remove("hidden");
  modeHint.textContent = `Click the new location for ${marker.label}.`;
  render();
}

function cancelPlacement() {
  placing = false;
  movingMarkerId = null;
  map.classList.remove("placing");
  placeButton.textContent = "Place my base";
  cancelButton.classList.add("hidden");
  modeHint.textContent = "Pan and zoom the map. Choose Place my base, then click your base location.";
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
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + delta));
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

placeButton.addEventListener("click", startPlacing);
cancelButton.addEventListener("click", cancelPlacement);

map.addEventListener("pointerdown", (event) => {
  if (placing) return;
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
  if (!isDragging || !dragStart) return;
  view.offsetX = dragStart.offsetX + event.clientX - dragStart.x;
  view.offsetY = dragStart.offsetY + event.clientY - dragStart.y;
  render();
});

map.addEventListener("pointerup", (event) => {
  if (isDragging && dragStart?.pointerId === event.pointerId) {
    map.releasePointerCapture(event.pointerId);
  }
  isDragging = false;
  dragStart = null;
  map.classList.remove("dragging");
});

map.addEventListener("click", (event) => {
  if (!placing) return;
  const marker = markers.find((item) => item.id === movingMarkerId);
  saveMarker(mapPointFromEvent(event), marker);
});

map.addEventListener("wheel", (event) => {
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 1 : -1, event.clientX, event.clientY);
}, { passive: false });

window.addEventListener("resize", render);

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
  markerTypeField.classList.toggle("hidden", !isAdmin);
}

async function loadMarkers() {
  const { data, error } = await supabaseClient
    .from("base_markers")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  markers = data.map(normalizeMarker);
  render();
}

function connectEvents() {
  supabaseClient
    .channel("base_markers_live")
    .on("postgres_changes", { event: "*", schema: "public", table: "base_markers" }, (payload) => {
      if (payload.eventType === "DELETE") {
        removeMarker(payload.old.id);
      } else {
        upsertMarker(normalizeMarker(payload.new));
      }
      syncStatus.textContent = "Live";
      render();
    })
    .subscribe((status) => {
      syncStatus.textContent = status === "SUBSCRIBED" ? "Live" : "Connecting";
    });
}

async function boot() {
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
  await loadMarkers();
  connectEvents();
}

boot().catch((error) => {
  syncStatus.textContent = "Setup needed";
  modeHint.textContent = error.message || "The map loaded, but Supabase is not reachable.";
  centerMap();
});
