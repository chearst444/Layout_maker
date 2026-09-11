(() => {
  const TILE = 24;
  const EXPORT_TILE = 32;
  const LAYER_ORDER = ["background", "middle", "foreground"];
  const LAYER_META = {
    background: { name: "Background", accent: "#5b8def" },
    middle: { name: "Middle", accent: "#e8a838" },
    foreground: { name: "Foreground", accent: "#5ee4a3" },
  };

  const SHAPES = [
    { id: "rect", name: "Rect", w: 4, h: 3, color: "#5b8def" },
    { id: "circle", name: "Circle", w: 3, h: 3, color: "#7dd3fc" },
    { id: "rounded", name: "Rounded", w: 4, h: 3, color: "#c4b5fd" },
    { id: "triangle", name: "Triangle", w: 3, h: 3, color: "#fda4af" },
    { id: "panel", name: "Panel", w: 10, h: 7, color: "#e8a838" },
    { id: "button", name: "Button", w: 6, h: 2, color: "#fbbf24" },
    { id: "diamond", name: "Diamond", w: 2, h: 2, color: "#fde68a" },
    { id: "hex", name: "Hexagon", w: 3, h: 3, color: "#86efac" },
    { id: "badge", name: "Badge", w: 4, h: 2, color: "#fb7185" },
    { id: "bar", name: "Bar", w: 8, h: 1, color: "#34d399" },
    { id: "slot", name: "Slot", w: 2, h: 2, color: "#94a3b8" },
    { id: "window", name: "Window", w: 12, h: 9, color: "#93c5fd" },
    { id: "terrain", name: "Terrain", w: 4, h: 2, color: "#a3e635" },
    { id: "pip", name: "Pip", w: 1, h: 1, color: "#f87171" },
  ];

  const els = {
    board: document.getElementById("board"),
    boardWrap: document.getElementById("board-wrap"),
    workspace: document.getElementById("workspace"),
    ghost: document.getElementById("ghost"),
    selection: document.getElementById("selection"),
    builtin: document.getElementById("sprite-builtin"),
    uploads: document.getElementById("sprite-uploads"),
    uploadsWrap: document.getElementById("uploads-wrap"),
    layers: document.getElementById("layer-list"),
    inspector: document.getElementById("inspector"),
    statusLeft: document.getElementById("status-left"),
    statusRight: document.getElementById("status-right"),
    gridSize: document.getElementById("grid-size"),
    toggleGrid: document.getElementById("toggle-grid"),
    undo: document.getElementById("undo-btn"),
    redo: document.getElementById("redo-btn"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomLabel: document.getElementById("zoom-label"),
    sizeReadout: document.getElementById("size-readout"),
    stampBanner: document.getElementById("stamp-banner"),
    exportPng: document.getElementById("export-png"),
    exportJson: document.getElementById("export-json"),
    loadSample: document.getElementById("load-sample"),
    deleteItem: document.getElementById("delete-item"),
    upload: document.getElementById("sprite-upload"),
    uploadZone: document.getElementById("upload-zone"),
    stampHint: document.getElementById("stamp-hint"),
    toast: document.getElementById("toast"),
    layerNodes: {
      background: document.getElementById("layer-background"),
      middle: document.getElementById("layer-middle"),
      foreground: document.getElementById("layer-foreground"),
    },
  };

  const state = {
    gridSize: 32,
    showGrid: true,
    zoom: 1,
    activeLayer: "middle",
    selectedId: null,
    stampId: null,
    hoverTile: null,
    layers: {
      background: { visible: true, locked: false, items: [] },
      middle: { visible: true, locked: false, items: [] },
      foreground: { visible: true, locked: false, items: [] },
    },
    uploads: [],
  };

  const history = [];
  const future = [];
  const MAX_HISTORY = 60;

  let toastTimer = 0;
  let interaction = null;
  let hoverItemId = null;

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshot() {
    return {
      gridSize: state.gridSize,
      layers: clone(state.layers),
    };
  }

  function checkpoint() {
    history.push(snapshot());
    if (history.length > MAX_HISTORY) history.shift();
    future.length = 0;
    syncHistoryButtons();
  }

  function syncHistoryButtons() {
    els.undo.disabled = !history.length;
    els.redo.disabled = !future.length;
  }

  function restore(snap) {
    state.gridSize = snap.gridSize;
    state.layers = clone(snap.layers);
    if (!findItem(state.selectedId)) state.selectedId = null;
    els.gridSize.value = String(state.gridSize);
    renderAll();
  }

  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
    toast("Undid last change");
  }

  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
    toast("Redid last change");
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function spriteById(id) {
    const shape = SHAPES.find((s) => s.id === id);
    if (shape) return { kind: "shape", ...shape };
    const upload = state.uploads.find((s) => s.id === id);
    if (upload) return { kind: "image", ...upload };
    return null;
  }

  function findItem(id) {
    if (!id) return null;
    for (const layerId of LAYER_ORDER) {
      const item = state.layers[layerId].items.find((it) => it.id === id);
      if (item) return { item, layerId };
    }
    return null;
  }

  function selectedRecord() {
    return findItem(state.selectedId);
  }

  function layerOfItem(id) {
    return findItem(id)?.layerId || null;
  }

  function canEditLayer(layerId) {
    const layer = state.layers[layerId];
    return layer.visible && !layer.locked;
  }

  function bringToFront(id) {
    const rec = findItem(id);
    if (!rec) return;
    const items = state.layers[rec.layerId].items;
    const idx = items.findIndex((it) => it.id === id);
    if (idx >= 0) {
      items.push(items.splice(idx, 1)[0]);
    }
  }

  function sendToBack(id) {
    const rec = findItem(id);
    if (!rec) return;
    const items = state.layers[rec.layerId].items;
    const idx = items.findIndex((it) => it.id === id);
    if (idx >= 0) {
      items.unshift(items.splice(idx, 1)[0]);
    }
  }

  function defaultSize(sprite) {
    if (!sprite) return { w: 4, h: 4 };
    return { w: sprite.w || 4, h: sprite.h || 4 };
  }

  function viewPixels() {
    return state.gridSize * TILE;
  }

  function exportPixels() {
    return state.gridSize * EXPORT_TILE;
  }

  function sizeReadoutText() {
    const view = viewPixels();
    const exported = exportPixels();
    return `View ${view} x ${view} px. Export ${exported} x ${exported} px`;
  }

  function clampItem(item, grid) {
    item.w = clamp(item.w, 1, grid);
    item.h = clamp(item.h, 1, grid);
    item.x = clamp(item.x, 0, grid - item.w);
    item.y = clamp(item.y, 0, grid - item.h);
  }

  function eventToBoard(e) {
    const rect = els.board.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) {
      return { fx: -1, fy: -1, x: -1, y: -1, inside: false };
    }
    const fx = ((e.clientX - rect.left) / width) * state.gridSize;
    const fy = ((e.clientY - rect.top) / height) * state.gridSize;
    return {
      fx,
      fy,
      x: Math.floor(fx),
      y: Math.floor(fy),
      inside: fx >= 0 && fy >= 0 && fx < state.gridSize && fy < state.gridSize,
    };
  }

  function ghostForSprite(spriteId, e) {
    const sprite = spriteById(spriteId);
    const pos = eventToBoard(e);
    if (!sprite || !pos.inside) {
      hideGhost();
      return;
    }
    const size = defaultSize(sprite);
    const x = clamp(pos.x, 0, state.gridSize - size.w);
    const y = clamp(pos.y, 0, state.gridSize - size.h);
    showGhost(x, y, size.w, size.h);
  }

  function placeSpriteAtEvent(spriteId, e) {
    const sprite = spriteById(spriteId);
    const pos = eventToBoard(e);
    if (!sprite || !pos.inside) return null;
    const size = defaultSize(sprite);
    const x = clamp(pos.x, 0, state.gridSize - size.w);
    const y = clamp(pos.y, 0, state.gridSize - size.h);
    return placeSprite(spriteId, x, y, size);
  }

  function hitTest(layerId, fx, fy) {
    const items = state.layers[layerId].items;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (fx >= it.x && fy >= it.y && fx < it.x + it.w && fy < it.y + it.h) return it;
    }
    return null;
  }

  function hitTestAll(fx, fy) {
    for (let i = LAYER_ORDER.length - 1; i >= 0; i -= 1) {
      const layerId = LAYER_ORDER[i];
      const layer = state.layers[layerId];
      if (!layer.visible) continue;
      const item = hitTest(layerId, fx, fy);
      if (item) return { item, layerId };
    }
    return null;
  }

  function shapeSvg(shape, forCard) {
    const c = shape.color;
    const vb = "0 0 64 64";
    const stretch = forCard ? 'preserveAspectRatio="xMidYMid meet"' : 'preserveAspectRatio="none"';
    switch (shape.id) {
      case "rect":
        return `<svg viewBox="${vb}" ${stretch}><rect x="6" y="10" width="52" height="44" fill="${c}"/></svg>`;
      case "circle":
        return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><circle cx="32" cy="32" r="24" fill="${c}"/></svg>`;
      case "rounded":
        return `<svg viewBox="${vb}" ${stretch}><rect x="6" y="12" width="52" height="40" rx="12" fill="${c}"/></svg>`;
      case "triangle":
        return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><polygon points="32,8 56,54 8,54" fill="${c}"/></svg>`;
      case "panel":
        return `<svg viewBox="${vb}" ${stretch}><rect x="4" y="6" width="56" height="52" rx="8" fill="rgba(18,22,31,0.85)" stroke="${c}" stroke-width="4"/><rect x="10" y="12" width="44" height="8" rx="3" fill="${c}" opacity="0.35"/></svg>`;
      case "button":
        return `<svg viewBox="${vb}" ${stretch}><rect x="4" y="18" width="56" height="28" rx="10" fill="${c}"/><rect x="8" y="22" width="48" height="10" rx="6" fill="#fff" opacity="0.22"/><rect x="18" y="30" width="28" height="6" rx="3" fill="#0b0d12" opacity="0.35"/></svg>`;
      case "diamond":
        return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><polygon points="32,6 58,32 32,58 6,32" fill="${c}"/></svg>`;
      case "hex":
        return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><polygon points="32,6 56,18 56,46 32,58 8,46 8,18" fill="${c}"/></svg>`;
      case "badge":
        return `<svg viewBox="${vb}" ${stretch}><rect x="6" y="20" width="52" height="24" rx="12" fill="${c}"/><circle cx="20" cy="32" r="6" fill="#fff" opacity="0.85"/></svg>`;
      case "bar":
        return `<svg viewBox="${vb}" ${stretch}><rect x="4" y="24" width="56" height="16" rx="8" fill="#1f2937"/><rect x="6" y="26" width="36" height="12" rx="6" fill="${c}"/></svg>`;
      case "slot":
        return `<svg viewBox="${vb}" ${stretch}><rect x="8" y="8" width="48" height="48" rx="8" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="6 4"/><path d="M32 22v20M22 32h20" stroke="${c}" stroke-width="3"/></svg>`;
      case "window":
        return `<svg viewBox="${vb}" ${stretch}><rect x="4" y="8" width="56" height="48" rx="6" fill="#12161f" stroke="${c}" stroke-width="3"/><rect x="4" y="8" width="56" height="12" rx="6" fill="${c}"/><rect x="8" y="24" width="48" height="26" rx="3" fill="#1c2333"/></svg>`;
      case "terrain":
        return `<svg viewBox="${vb}" ${stretch}><rect x="4" y="20" width="56" height="32" fill="${c}"/><rect x="4" y="44" width="56" height="8" fill="#4d7c0f"/><rect x="4" y="16" width="56" height="8" fill="#d9f99d"/></svg>`;
      case "pip":
        return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><circle cx="32" cy="32" r="20" fill="${c}"/><circle cx="24" cy="24" r="6" fill="#fff" opacity="0.35"/></svg>`;
      default:
        return `<svg viewBox="${vb}"><rect x="8" y="8" width="48" height="48" fill="${c}"/></svg>`;
    }
  }

  function itemMarkup(item) {
    const sprite = spriteById(item.spriteId);
    if (!sprite) {
      return `<div class="h-full w-full bg-ink-line text-[9px] text-mist flex items-center justify-center">?</div>`;
    }
    if (sprite.kind === "image") {
      return `<img alt="${escapeAttr(sprite.name)}" src="${sprite.src}" draggable="false" />`;
    }
    return shapeSvg(sprite, false);
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderBoardFrame() {
    els.board.style.setProperty("--grid", String(state.gridSize));
    els.board.style.setProperty("--tile", `${TILE}px`);
    els.board.style.transform = `scale(${state.zoom})`;
    els.board.classList.toggle("show-grid", state.showGrid);
    const size = state.gridSize * TILE * state.zoom;
    els.boardWrap.style.width = `${size + 96}px`;
    els.boardWrap.style.height = `${size + 96}px`;
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (els.sizeReadout) els.sizeReadout.textContent = `Export ${exportPixels()} x ${exportPixels()} px`;
    els.toggleGrid.classList.toggle("on", state.showGrid);
    els.toggleGrid.setAttribute("aria-pressed", String(state.showGrid));
  }

  function renderItems() {
    for (const layerId of LAYER_ORDER) {
      const layer = state.layers[layerId];
      const node = els.layerNodes[layerId];
      node.dataset.hidden = layer.visible ? "false" : "true";
      node.style.zIndex = String(LAYER_ORDER.indexOf(layerId) + 1);
      node.innerHTML = layer.items
        .map((item) => {
          const selected = item.id === state.selectedId ? " selected" : "";
          return `<div class="placed${selected}" data-id="${item.id}" style="left:${item.x * TILE}px;top:${item.y * TILE}px;width:${item.w * TILE}px;height:${item.h * TILE}px">${itemMarkup(item)}</div>`;
        })
        .join("");
    }
    renderSelection();
  }

  function renderSelection() {
    const rec = selectedRecord();
    if (!rec || !state.layers[rec.layerId].visible) {
      els.selection.classList.remove("active");
      els.deleteItem.disabled = true;
      return;
    }
    const { item } = rec;
    els.selection.classList.add("active");
    els.selection.style.left = `${item.x * TILE}px`;
    els.selection.style.top = `${item.y * TILE}px`;
    els.selection.style.width = `${item.w * TILE}px`;
    els.selection.style.height = `${item.h * TILE}px`;
    const editable = canEditLayer(rec.layerId);
    els.selection.querySelectorAll(".handle").forEach((h) => {
      h.style.display = editable ? "block" : "none";
    });
    els.deleteItem.disabled = !editable;
  }

  function renderPalette() {
    els.builtin.innerHTML = SHAPES.map((shape) => spriteCard(shape.id, shapeSvg(shape, true), shape.name)).join("");
    if (!state.uploads.length) {
      els.uploadsWrap.classList.add("hidden");
      els.uploads.innerHTML = "";
    } else {
      els.uploadsWrap.classList.remove("hidden");
      els.uploads.innerHTML = state.uploads
        .map((up) => spriteCard(up.id, `<img alt="${escapeAttr(up.name)}" src="${up.src}" draggable="false" class="h-10 w-full object-contain" />`, up.name))
        .join("");
    }
    els.stampHint.textContent = stampHintText();
    syncStampClass();
  }

  function spriteCard(id, preview, name) {
    const active = state.stampId === id ? " active" : "";
    const pressed = state.stampId === id ? "true" : "false";
    return `<button type="button" draggable="false" class="sprite-card${active} px-2 py-2 text-left" data-sprite="${id}" aria-pressed="${pressed}" title="Click to stamp, or drag onto the grid">
      <div class="mb-1 flex h-12 items-center justify-center pointer-events-none">${preview}</div>
      <div class="truncate text-[10px] font-medium text-mist pointer-events-none">${escapeAttr(name)}</div>
    </button>`;
  }

  function renderLayers() {
    els.layers.innerHTML = LAYER_ORDER.map((id) => {
      const layer = state.layers[id];
      const meta = LAYER_META[id];
      const active = state.activeLayer === id ? " active" : "";
      const eye = layer.visible
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 6.2A9 9 0 0 1 12 6c6 0 10 6 10 6a16 16 0 0 1-3.2 3.4M6.7 6.7C4.2 8.4 2 12 2 12a16 16 0 0 0 6.1 5.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
      const lock = layer.locked
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>`;
      return `<div class="layer-row${active} flex items-center gap-2 rounded-xl border border-ink-line bg-ink-raised px-2 py-2" data-layer="${id}" style="--accent:${meta.accent}">
        <button type="button" class="h-2 w-2 shrink-0 rounded-full" style="background:${meta.accent}" data-select-layer="${id}" title="Edit ${meta.name}"></button>
        <button type="button" class="min-w-0 flex-1 text-left text-xs font-medium" data-select-layer="${id}">${meta.name}</button>
        <span class="mono text-[10px] text-mist">${layer.items.length}</span>
        <button type="button" class="icon-btn h-7 w-7 ${layer.visible ? "" : "on"}" data-vis="${id}" title="${layer.visible ? "Hide layer" : "Show layer"}">${eye}</button>
        <button type="button" class="icon-btn h-7 w-7 ${layer.locked ? "on" : ""}" data-lock="${id}" title="${layer.locked ? "Unlock layer" : "Lock layer"}">${lock}</button>
      </div>`;
    }).join("");
  }

  function renderInspector() {
    const rec = selectedRecord();
    if (!rec) {
      els.inspector.innerHTML = `<p>Select a placed sprite to edit it.</p>`;
      return;
    }
    const { item, layerId } = rec;
    const sprite = spriteById(item.spriteId);
    const locked = !canEditLayer(layerId);
    const disabled = locked ? "disabled" : "";
    els.inspector.innerHTML = `
      <div class="mb-3 rounded-lg border border-ink-line bg-ink-raised p-2">
        <div class="text-[10px] uppercase tracking-wider text-mist">Sprite</div>
        <div class="mt-1 font-medium text-slate-100">${escapeAttr(sprite ? sprite.name : "Missing")}</div>
        <div class="mt-0.5 text-[10px] text-mist">${LAYER_META[layerId].name} layer</div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        ${numField("X", "insp-x", item.x, disabled)}
        ${numField("Y", "insp-y", item.y, disabled)}
        ${numField("W", "insp-w", item.w, disabled)}
        ${numField("H", "insp-h", item.h, disabled)}
      </div>
      <div class="mt-3 flex gap-2">
        <button type="button" id="send-back" class="flex-1 rounded-lg border border-ink-line bg-ink-raised px-2 py-1.5 text-[11px]" ${disabled}>Send back</button>
        <button type="button" id="bring-front" class="flex-1 rounded-lg border border-ink-line bg-ink-raised px-2 py-1.5 text-[11px]" ${disabled}>Bring front</button>
      </div>
      ${locked ? `<p class="mt-2 text-[10px] text-mist">Layer is hidden or locked. Unlock it to edit.</p>` : ""}
    `;
    const bind = (id, key, min, maxFn) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("change", () => {
        const recNow = selectedRecord();
        if (!recNow || !canEditLayer(recNow.layerId)) return;
        checkpoint();
        recNow.item[key] = clamp(parseInt(input.value, 10) || 0, min, maxFn(recNow.item));
        clampItem(recNow.item, state.gridSize);
        renderItems();
        renderInspector();
        renderStatus();
      });
    };
    bind("insp-x", "x", 0, (it) => state.gridSize - it.w);
    bind("insp-y", "y", 0, (it) => state.gridSize - it.h);
    bind("insp-w", "w", 1, (it) => state.gridSize - it.x);
    bind("insp-h", "h", 1, (it) => state.gridSize - it.y);
    document.getElementById("bring-front")?.addEventListener("click", () => {
      if (!canEditLayer(layerId)) return;
      checkpoint();
      bringToFront(item.id);
      renderItems();
    });
    document.getElementById("send-back")?.addEventListener("click", () => {
      if (!canEditLayer(layerId)) return;
      checkpoint();
      sendToBack(item.id);
      renderItems();
    });
  }

  function numField(label, id, value, disabled) {
    return `<label class="block">
      <span class="mb-1 block text-[10px] uppercase tracking-wider text-mist">${label}</span>
      <input id="${id}" type="number" ${disabled} value="${value}" class="w-full rounded-lg border border-ink-line bg-ink px-2 py-1.5 font-mono text-xs text-slate-100 outline-none ring-honey focus:ring-1" />
    </label>`;
  }

  function renderStatus() {
    const rec = selectedRecord();
    const hover = state.hoverTile;
    const stamp = state.stampId ? spriteById(state.stampId) : null;
    let tileText = hover ? `Tile ${hover.x}, ${hover.y}` : "Tile -, -";
    if (stamp) {
      const size = defaultSize(stamp);
      tileText = `${stampHintText()} (${size.w} x ${size.h} tiles)` + (hover ? `  |  ${tileText}` : "");
    } else if (rec) {
      tileText += `  |  ${rec.item.w} x ${rec.item.h} at ${rec.item.x}, ${rec.item.y}`;
    } else if (hoverItemId) {
      tileText += "  |  click to select";
    }
    els.statusLeft.textContent = tileText;
    const counts = LAYER_ORDER.map((id) => state.layers[id].items.length).reduce((a, b) => a + b, 0);
    els.statusRight.textContent = `${sizeReadoutText()}  |  ${LAYER_META[state.activeLayer].name}  |  ${counts} items`;
  }

  function renderAll() {
    renderBoardFrame();
    renderItems();
    renderPalette();
    renderLayers();
    renderInspector();
    renderStatus();
    syncHistoryButtons();
  }

  function placeSprite(spriteId, x, y, size) {
    if (!canEditLayer(state.activeLayer)) {
      toast(state.layers[state.activeLayer].locked ? "Active layer is locked" : "Active layer is hidden");
      return null;
    }
    const sprite = spriteById(spriteId);
    if (!sprite) return null;
    const def = size || defaultSize(sprite);
    const item = {
      id: uid("item"),
      spriteId,
      x,
      y,
      w: def.w,
      h: def.h,
    };
    clampItem(item, state.gridSize);
    checkpoint();
    state.layers[state.activeLayer].items.push(item);
    state.selectedId = item.id;
    renderItems();
    renderLayers();
    renderInspector();
    renderStatus();
    return item;
  }

  function deleteSelected() {
    const rec = selectedRecord();
    if (!rec || !canEditLayer(rec.layerId)) return;
    checkpoint();
    state.layers[rec.layerId].items = state.layers[rec.layerId].items.filter((it) => it.id !== rec.item.id);
    state.selectedId = null;
    renderItems();
    renderLayers();
    renderInspector();
    renderStatus();
    toast("Deleted sprite");
  }

  function stampHintText() {
    if (!state.stampId) return "";
    const sprite = spriteById(state.stampId);
    const name = sprite?.name || "sprite";
    return `Click the grid to place ${name}`;
  }

  function syncStampClass() {
    els.board.classList.toggle("stamping", Boolean(state.stampId));
    if (els.stampBanner) {
      const hint = stampHintText();
      els.stampBanner.hidden = !hint;
      els.stampBanner.textContent = hint || "Click the grid to place";
    }
  }

  function syncStampUI() {
    document.querySelectorAll("[data-sprite]").forEach((el) => {
      const on = el.dataset.sprite === state.stampId;
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", String(on));
    });
    els.stampHint.textContent = stampHintText();
    els.board.style.cursor = state.stampId ? "copy" : "default";
    syncStampClass();
    renderStatus();
  }

  function showGhost(x, y, w, h) {
    els.ghost.classList.add("on");
    els.ghost.style.left = `${x * TILE}px`;
    els.ghost.style.top = `${y * TILE}px`;
    els.ghost.style.width = `${w * TILE}px`;
    els.ghost.style.height = `${h * TILE}px`;
  }

  function hideGhost() {
    els.ghost.classList.remove("on");
  }

  function applyResize(start, handle, pos) {
    const grid = state.gridSize;
    let { x, y, w, h } = start;
    const right = x + w;
    const bottom = y + h;
    const snapX = clamp(Math.round(pos.fx), 0, grid);
    const snapY = clamp(Math.round(pos.fy), 0, grid);
    if (handle.includes("e")) {
      w = clamp(snapX - x, 1, grid - x);
    }
    if (handle.includes("s")) {
      h = clamp(snapY - y, 1, grid - y);
    }
    if (handle.includes("w")) {
      x = clamp(snapX, 0, right - 1);
      w = right - x;
    }
    if (handle.includes("n")) {
      y = clamp(snapY, 0, bottom - 1);
      h = bottom - y;
    }
    return { x, y, w, h };
  }

  function liveUpdateItem(item) {
    const node = els.board.querySelector(`.placed[data-id="${item.id}"]`);
    if (node) {
      node.style.left = `${item.x * TILE}px`;
      node.style.top = `${item.y * TILE}px`;
      node.style.width = `${item.w * TILE}px`;
      node.style.height = `${item.h * TILE}px`;
    }
    renderSelection();
    renderStatus();
  }

  function setGridSize(next) {
    const size = Number(next);
    if (size === state.gridSize) return;
    checkpoint();
    state.gridSize = size;
    let clamped = false;
    for (const layerId of LAYER_ORDER) {
      for (const item of state.layers[layerId].items) {
        const before = `${item.x},${item.y},${item.w},${item.h}`;
        clampItem(item, size);
        if (`${item.x},${item.y},${item.w},${item.h}` !== before) clamped = true;
      }
    }
    renderAll();
    if (clamped) toast("Items outside the new grid were clamped");
  }

  function loadSample() {
    checkpoint();
    state.gridSize = 32;
    els.gridSize.value = "32";
    state.layers = {
      background: {
        visible: true,
        locked: false,
        items: [
          { id: uid("item"), spriteId: "terrain", x: 0, y: 28, w: 32, h: 4 },
          { id: uid("item"), spriteId: "panel", x: 1, y: 1, w: 14, h: 10 },
          { id: uid("item"), spriteId: "rect", x: 18, y: 2, w: 12, h: 8 },
        ],
      },
      middle: {
        visible: true,
        locked: false,
        items: [
          { id: uid("item"), spriteId: "window", x: 17, y: 12, w: 13, h: 10 },
          { id: uid("item"), spriteId: "button", x: 3, y: 4, w: 10, h: 2 },
          { id: uid("item"), spriteId: "button", x: 3, y: 7, w: 10, h: 2 },
          { id: uid("item"), spriteId: "bar", x: 3, y: 22, w: 12, h: 2 },
          { id: uid("item"), spriteId: "slot", x: 3, y: 12, w: 3, h: 3 },
          { id: uid("item"), spriteId: "slot", x: 7, y: 12, w: 3, h: 3 },
          { id: uid("item"), spriteId: "slot", x: 11, y: 12, w: 3, h: 3 },
        ],
      },
      foreground: {
        visible: true,
        locked: false,
        items: [
          { id: uid("item"), spriteId: "badge", x: 19, y: 3, w: 6, h: 2 },
          { id: uid("item"), spriteId: "diamond", x: 27, y: 3, w: 2, h: 2 },
          { id: uid("item"), spriteId: "pip", x: 3, y: 20, w: 1, h: 1 },
          { id: uid("item"), spriteId: "pip", x: 5, y: 20, w: 1, h: 1 },
          { id: uid("item"), spriteId: "pip", x: 7, y: 20, w: 1, h: 1 },
          { id: uid("item"), spriteId: "circle", x: 21, y: 15, w: 4, h: 4 },
        ],
      },
    };
    state.activeLayer = "middle";
    state.selectedId = null;
    renderAll();
    toast("Loaded sample HUD layout");
  }

  function spriteRef(item) {
    const sprite = spriteById(item.spriteId);
    if (!sprite) {
      return { id: item.spriteId, type: "unknown", source: item.spriteId };
    }
    if (sprite.kind === "image") {
      return { id: sprite.id, type: "image", source: sprite.name };
    }
    return { id: sprite.id, type: "shape", source: sprite.id };
  }

  function exportJSON() {
    const data = {
      app: "Layout Maker",
      version: 1,
      grid: { cols: state.gridSize, rows: state.gridSize },
      layers: LAYER_ORDER.map((id) => ({
        id,
        name: LAYER_META[id].name,
        visible: state.layers[id].visible,
        locked: state.layers[id].locked,
        items: state.layers[id].items.map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          width: item.width ?? item.w,
          height: item.height ?? item.h,
          sprite: spriteRef(item),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `layout-${state.gridSize}x${state.gridSize}.json`);
    toast("Exported layout JSON");
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawShape(ctx, shape, x, y, w, h) {
    const c = shape.color;
    ctx.save();
    switch (shape.id) {
      case "rect":
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
        break;
      case "circle":
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "rounded":
        ctx.fillStyle = c;
        roundedRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.2);
        ctx.fill();
        break;
      case "triangle":
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        break;
      case "panel":
        roundedRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.08);
        ctx.fillStyle = "rgba(18,22,31,0.9)";
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.06);
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.35;
        roundedRectPath(ctx, x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.14, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case "button":
        ctx.fillStyle = c;
        roundedRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.35);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        roundedRectPath(ctx, x + w * 0.08, y + h * 0.12, w * 0.84, h * 0.32, 6);
        ctx.fill();
        break;
      case "diamond":
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
        ctx.fill();
        break;
      case "hex":
        ctx.fillStyle = c;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          const px = x + w / 2 + (w / 2) * Math.cos(a);
          const py = y + h / 2 + (h / 2) * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case "badge":
        ctx.fillStyle = c;
        roundedRectPath(ctx, x, y, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x + h * 0.5, y + h / 2, h * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "bar":
        ctx.fillStyle = "#1f2937";
        roundedRectPath(ctx, x, y, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = c;
        roundedRectPath(ctx, x + 2, y + 2, Math.max(4, w * 0.62 - 4), h - 4, (h - 4) / 2);
        ctx.fill();
        break;
      case "slot":
        ctx.strokeStyle = c;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.08);
        roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h * 0.28);
        ctx.lineTo(x + w / 2, y + h * 0.72);
        ctx.moveTo(x + w * 0.28, y + h / 2);
        ctx.lineTo(x + w * 0.72, y + h / 2);
        ctx.stroke();
        break;
      case "window":
        ctx.fillStyle = "#12161f";
        roundedRectPath(ctx, x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h * 0.18);
        ctx.fillStyle = "#1c2333";
        ctx.fillRect(x + w * 0.06, y + h * 0.28, w * 0.88, h * 0.6);
        break;
      case "terrain":
        ctx.fillStyle = c;
        ctx.fillRect(x, y + h * 0.2, w, h * 0.8);
        ctx.fillStyle = "#d9f99d";
        ctx.fillRect(x, y + h * 0.12, w, h * 0.18);
        ctx.fillStyle = "#4d7c0f";
        ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
        break;
      case "pip":
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  async function exportPNG() {
    const unit = EXPORT_TILE;
    const canvas = document.createElement("canvas");
    canvas.width = state.gridSize * unit;
    canvas.height = state.gridSize * unit;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#151a24";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const checker = unit;
    ctx.fillStyle = "#131820";
    for (let y = 0; y < state.gridSize; y += 1) {
      for (let x = 0; x < state.gridSize; x += 1) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * checker, y * checker, checker, checker);
      }
    }

    for (const layerId of LAYER_ORDER) {
      const layer = state.layers[layerId];
      if (!layer.visible) continue;
      for (const item of layer.items) {
        const sprite = spriteById(item.spriteId);
        const x = item.x * unit;
        const y = item.y * unit;
        const w = item.w * unit;
        const h = item.h * unit;
        if (!sprite) continue;
        if (sprite.kind === "image") {
          const img = await loadImage(sprite.src);
          ctx.drawImage(img, x, y, w, h);
        } else {
          drawShape(ctx, sprite, x, y, w, h);
        }
      }
    }

    if (state.showGrid) {
      ctx.strokeStyle = "rgba(232, 236, 244, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= state.gridSize; i += 1) {
        ctx.moveTo(i * unit + 0.5, 0);
        ctx.lineTo(i * unit + 0.5, canvas.height);
        ctx.moveTo(0, i * unit + 0.5);
        ctx.lineTo(canvas.width, i * unit + 0.5);
      }
      ctx.stroke();
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    downloadBlob(blob, `layout-${state.gridSize}x${state.gridSize}.png`);
    toast(state.showGrid ? "Exported PNG with grid lines" : "Exported PNG without grid lines");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      toast("Only image files can be uploaded");
      return;
    }
    for (const file of files) {
      const src = await readFile(file);
      state.uploads.push({
        id: uid("img"),
        name: file.name,
        src,
        w: 4,
        h: 4,
      });
    }
    renderPalette();
    toast(`Added ${files.length} sprite${files.length === 1 ? "" : "s"}`);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function editingField() {
    const tag = document.activeElement?.tagName;
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
  }

  function onPointerDownBoard(e) {
    if (e.button !== 0) return;
    const pos = eventToBoard(e);
    const handle = e.target.closest?.(".handle");
    if (handle && state.selectedId && !state.stampId) {
      const rec = selectedRecord();
      if (!rec || !canEditLayer(rec.layerId)) return;
      checkpoint();
      interaction = {
        type: "resize",
        handle: handle.dataset.handle,
        start: { x: rec.item.x, y: rec.item.y, w: rec.item.w, h: rec.item.h },
        itemId: rec.item.id,
      };
      els.board.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (state.stampId && pos.inside) {
      placeSpriteAtEvent(state.stampId, e);
      e.preventDefault();
      return;
    }

    const hit = pos.inside ? hitTestAll(pos.fx, pos.fy) : null;
    if (hit) {
      state.activeLayer = hit.layerId;
      state.selectedId = hit.item.id;
      state.stampId = null;
      renderPalette();
      renderLayers();
      renderItems();
      renderInspector();
      syncStampUI();
      if (canEditLayer(hit.layerId)) {
        checkpoint();
        interaction = {
          type: "move",
          itemId: hit.item.id,
          ox: pos.fx - hit.item.x,
          oy: pos.fy - hit.item.y,
          moved: false,
        };
        els.board.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      return;
    }

    state.selectedId = null;
    renderItems();
    renderInspector();
    renderStatus();
  }

  function onPointerMove(e) {
    const pos = eventToBoard(e);
    if (pos.inside) {
      state.hoverTile = { x: pos.x, y: pos.y };
    } else {
      state.hoverTile = null;
    }

    if (!interaction) {
      if (state.stampId && pos.inside) {
        ghostForSprite(state.stampId, e);
      } else {
        hideGhost();
      }
      const hit = pos.inside ? hitTestAll(pos.fx, pos.fy) : null;
      hoverItemId = hit?.item.id || null;
      renderStatus();
      return;
    }

    const rec = findItem(interaction.itemId);
    if (!rec) return;
    if (interaction.type === "move") {
      const nx = clamp(Math.round(pos.fx - interaction.ox), 0, state.gridSize - rec.item.w);
      const ny = clamp(Math.round(pos.fy - interaction.oy), 0, state.gridSize - rec.item.h);
      if (nx !== rec.item.x || ny !== rec.item.y) interaction.moved = true;
      rec.item.x = nx;
      rec.item.y = ny;
      liveUpdateItem(rec.item);
    }
    if (interaction.type === "resize") {
      const next = applyResize(interaction.start, interaction.handle, pos);
      rec.item.x = next.x;
      rec.item.y = next.y;
      rec.item.w = next.w;
      rec.item.h = next.h;
      liveUpdateItem(rec.item);
    }
  }

  function onPointerUp() {
    if (!interaction || interaction.type === "palette") return;
    if (interaction.type === "move" && !interaction.moved) {
      history.pop();
      syncHistoryButtons();
    }
    if (interaction.type === "resize" || interaction.moved) {
      renderLayers();
      renderInspector();
    }
    interaction = null;
    hideGhost();
  }

  function onPalettePointerDown(e) {
    const card = e.target.closest("[data-sprite]");
    if (!card || e.button !== 0) return;
    e.preventDefault();
    const spriteId = card.dataset.sprite;
    if (!spriteById(spriteId)) return;
    try {
      card.setPointerCapture(e.pointerId);
    } catch (_) {
      /* capture is optional */
    }
    interaction = {
      type: "palette",
      spriteId,
      dragging: false,
      startX: e.clientX,
      startY: e.clientY,
      wasStamp: state.stampId === spriteId,
    };
    state.stampId = spriteId;
    state.selectedId = null;
    renderItems();
    renderInspector();
    syncStampUI();
  }

  function onPalettePointerMove(e) {
    if (interaction?.type !== "palette") return;
    if (Math.hypot(e.clientX - interaction.startX, e.clientY - interaction.startY) > 6) {
      interaction.dragging = true;
    }
    ghostForSprite(interaction.spriteId, e);
  }

  function onPalettePointerUp(e) {
    if (interaction?.type !== "palette") return;
    const pos = eventToBoard(e);
    if (pos.inside) {
      placeSpriteAtEvent(interaction.spriteId, e);
    } else if (!interaction.dragging && interaction.wasStamp) {
      state.stampId = null;
      syncStampUI();
    }
    interaction = null;
    hideGhost();
  }

  els.gridSize.addEventListener("change", () => setGridSize(els.gridSize.value));
  els.toggleGrid.addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    renderBoardFrame();
  });
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  els.zoomIn.addEventListener("click", () => {
    state.zoom = clamp(Math.round((state.zoom + 0.25) * 100) / 100, 0.5, 2);
    renderBoardFrame();
  });
  els.zoomOut.addEventListener("click", () => {
    state.zoom = clamp(Math.round((state.zoom - 0.25) * 100) / 100, 0.5, 2);
    renderBoardFrame();
  });
  els.zoomLabel.addEventListener("click", () => {
    state.zoom = 1;
    renderBoardFrame();
  });
  els.exportPng.addEventListener("click", () => {
    exportPNG().catch(() => toast("PNG export failed"));
  });
  els.exportJson.addEventListener("click", exportJSON);
  els.loadSample.addEventListener("click", loadSample);
  els.deleteItem.addEventListener("click", deleteSelected);
  els.upload.addEventListener("change", (e) => addFiles(e.target.files));

  ["dragenter", "dragover"].forEach((type) => {
    els.uploadZone.addEventListener(type, (e) => {
      e.preventDefault();
      els.uploadZone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    els.uploadZone.addEventListener(type, () => els.uploadZone.classList.remove("dragover"));
  });
  els.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  els.builtin.addEventListener("pointerdown", onPalettePointerDown);
  els.uploads.addEventListener("pointerdown", onPalettePointerDown);
  els.builtin.addEventListener("dragstart", (e) => e.preventDefault(), true);
  els.uploads.addEventListener("dragstart", (e) => e.preventDefault(), true);
  window.addEventListener("pointermove", onPalettePointerMove);
  window.addEventListener("pointerup", onPalettePointerUp);
  window.addEventListener("pointercancel", onPalettePointerUp);

  els.board.addEventListener("pointerdown", onPointerDownBoard);
  els.board.addEventListener("dragover", (e) => {
    if (!state.stampId) return;
    e.preventDefault();
    ghostForSprite(state.stampId, e);
  });
  els.board.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.stampId) placeSpriteAtEvent(state.stampId, e);
    hideGhost();
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  els.layers.addEventListener("click", (e) => {
    const vis = e.target.closest("[data-vis]");
    const lock = e.target.closest("[data-lock]");
    const select = e.target.closest("[data-select-layer]");
    if (vis) {
      const id = vis.dataset.vis;
      state.layers[id].visible = !state.layers[id].visible;
      if (!state.layers[id].visible && layerOfItem(state.selectedId) === id) {
        state.selectedId = null;
      }
      renderItems();
      renderLayers();
      renderInspector();
      return;
    }
    if (lock) {
      const id = lock.dataset.lock;
      state.layers[id].locked = !state.layers[id].locked;
      renderLayers();
      renderInspector();
      renderSelection();
      return;
    }
    if (select) {
      state.activeLayer = select.dataset.selectLayer;
      renderLayers();
      renderStatus();
    }
  });

  window.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Escape") {
      state.selectedId = null;
      state.stampId = null;
      renderPalette();
      renderItems();
      renderInspector();
      syncStampUI();
      return;
    }
    if (editingField()) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      const rec = selectedRecord();
      if (!rec || !canEditLayer(rec.layerId)) return;
      e.preventDefault();
      checkpoint();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      rec.item.x = clamp(rec.item.x + dx, 0, state.gridSize - rec.item.w);
      rec.item.y = clamp(rec.item.y + dy, 0, state.gridSize - rec.item.h);
      renderItems();
      renderInspector();
      renderStatus();
    }
  });

  renderAll();
})();
