(() => {
  "use strict";

  const BASE_TILE = 20;
  const EXPORT_TILE = 32;
  const HISTORY_LIMIT = 50;
  const LAYER_ORDER = ["background", "middle", "foreground"];
  const LAYER_META = {
    background: { label: "Background", color: "#5b8def" },
    middle: { label: "Middle", color: "#f0a14e" },
    foreground: { label: "Foreground", color: "#4ecdc4" },
  };

  const SHAPES = [
    { id: "rect", name: "Rectangle", w: 4, h: 3, fill: "#3d5a80" },
    { id: "rounded", name: "Rounded rect", w: 4, h: 3, fill: "#4ecdc4" },
    { id: "circle", name: "Circle", w: 4, h: 4, fill: "#f0a14e" },
    { id: "triangle", name: "Triangle", w: 4, h: 4, fill: "#e76f51" },
    { id: "diamond", name: "Diamond", w: 4, h: 4, fill: "#9b5de5" },
    { id: "hexagon", name: "Hexagon", w: 4, h: 4, fill: "#00bbf9" },
    { id: "panel", name: "Panel frame", w: 10, h: 8, fill: "#1d3557" },
    { id: "button", name: "Button", w: 6, h: 2, fill: "#e9c46a" },
    { id: "slot", name: "Icon slot", w: 2, h: 2, fill: "#264653" },
    { id: "hbar", name: "HUD bar", w: 8, h: 1, fill: "#2a9d8f" },
    { id: "window", name: "Window frame", w: 12, h: 10, fill: "#1a1f2b" },
    { id: "badge", name: "Badge", w: 3, h: 1, fill: "#ef476f" },
  ];

  const $ = (id) => document.getElementById(id);

  const els = {
    board: $("board"),
    workspace: $("workspace"),
    gridLines: $("grid-lines"),
    selection: $("selection"),
    hover: $("hover-preview"),
    hint: $("empty-hint"),
    palette: $("palette"),
    layerList: $("layer-list"),
    inspector: $("inspector"),
    toast: $("toast"),
    ghost: $("drag-ghost"),
    spriteDrop: $("sprite-drop"),
    statusGrid: $("status-grid"),
    statusHover: $("status-hover"),
    statusSel: $("status-sel"),
    statusStamp: $("status-stamp"),
    btnGrid32: $("btn-grid-32"),
    btnGrid48: $("btn-grid-48"),
    btnGridLines: $("btn-grid-lines"),
    selZoom: $("sel-zoom"),
    fileImages: $("file-images"),
    fileJson: $("file-json"),
  };

  const layers = () => ({
    background: { visible: true, locked: false, items: [] },
    middle: { visible: true, locked: false, items: [] },
    foreground: { visible: true, locked: false, items: [] },
  });

  const state = {
    gridSize: 32,
    zoom: 1,
    showGrid: true,
    activeLayer: "middle",
    layers: layers(),
    library: [],
    selectedId: null,
    stampId: null,
  };

  let history = [];
  let historyIndex = -1;
  let gesture = null;
  let toastTimer = 0;
  let hoverTile = null;

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function tilePx() {
    return Math.round(BASE_TILE * state.zoom);
  }

  function clone(value) {
    return structuredClone(value);
  }

  function snapshot() {
    return clone({
      gridSize: state.gridSize,
      layers: state.layers,
      library: state.library,
    });
  }

  function record() {
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot());
    if (history.length > HISTORY_LIMIT) history.shift();
    historyIndex = history.length - 1;
  }

  function restore(snap) {
    const view = {};
    for (const name of LAYER_ORDER) {
      view[name] = {
        visible: state.layers[name].visible,
        locked: state.layers[name].locked,
      };
    }
    state.gridSize = snap.gridSize;
    state.layers = clone(snap.layers);
    state.library = clone(snap.library);
    for (const name of LAYER_ORDER) {
      state.layers[name].visible = view[name].visible;
      state.layers[name].locked = view[name].locked;
    }
    state.selectedId = null;
    state.stampId = null;
    gesture = null;
    renderAll();
  }

  function undo() {
    if (historyIndex <= 0) {
      toast("Nothing to undo");
      return;
    }
    historyIndex -= 1;
    restore(history[historyIndex]);
    toast("Undo");
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      toast("Nothing to redo");
      return;
    }
    historyIndex += 1;
    restore(history[historyIndex]);
    toast("Redo");
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function parseHex(hex) {
    let h = hex.replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return { r: 80, g: 80, b: 80 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function shade(hex, factor) {
    const { r, g, b } = parseHex(hex);
    const t = (c) => Math.round(Math.min(255, Math.max(0, c * factor)));
    return `rgb(${t(r)}, ${t(g)}, ${t(b)})`;
  }

  function mix(hex, other, amount) {
    const a = parseHex(hex);
    const b = parseHex(other);
    const t = (x, y) => Math.round(x + (y - x) * amount);
    return `rgb(${t(a.r, b.r)}, ${t(a.g, b.g)}, ${t(a.b, b.b)})`;
  }

  function shapeSvg(type, fill, stretch) {
    const light = mix(fill, "#ffffff", 0.28);
    const dark = shade(fill, 0.55);
    const stroke = mix(fill, "#ffffff", 0.18);
    const par = stretch ? 'preserveAspectRatio="none"' : 'preserveAspectRatio="xMidYMid meet"';
    const shapes = {
      rect: `<rect x="3" y="3" width="58" height="58" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      rounded: `<rect x="3" y="3" width="58" height="58" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      circle: `<circle cx="32" cy="32" r="28" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      triangle: `<polygon points="32,6 58,56 6,56" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      diamond: `<polygon points="32,4 60,32 32,60 4,32" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      hexagon: `<polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      panel: `<rect x="2" y="2" width="60" height="60" rx="4" fill="${fill}" stroke="${light}" stroke-width="2.5"/>
        <rect x="2" y="2" width="60" height="12" rx="4" fill="${light}"/>
        <rect x="2" y="10" width="60" height="4" fill="${light}"/>
        <rect x="6" y="18" width="52" height="40" rx="2" fill="${dark}" opacity="0.55"/>`,
      button: `<rect x="2" y="10" width="60" height="44" rx="8" fill="${dark}"/>
        <rect x="2" y="6" width="60" height="42" rx="8" fill="${fill}" stroke="${light}" stroke-width="1.5"/>
        <rect x="8" y="12" width="48" height="10" rx="4" fill="${light}" opacity="0.35"/>`,
      slot: `<rect x="4" y="4" width="56" height="56" rx="8" fill="${dark}" stroke="${light}" stroke-width="2" stroke-dasharray="5 4"/>
        <rect x="14" y="14" width="36" height="36" rx="4" fill="${fill}" opacity="0.35"/>`,
      hbar: `<rect x="2" y="18" width="60" height="28" rx="6" fill="${dark}" stroke="${stroke}" stroke-width="2"/>
        <rect x="6" y="22" width="40" height="20" rx="4" fill="${fill}"/>
        <rect x="8" y="24" width="24" height="6" rx="2" fill="${light}" opacity="0.4"/>`,
      window: `<rect x="2" y="2" width="60" height="60" rx="5" fill="${fill}" stroke="${light}" stroke-width="2"/>
        <rect x="2" y="2" width="60" height="14" rx="5" fill="${dark}"/>
        <rect x="2" y="12" width="60" height="4" fill="${dark}"/>
        <circle cx="10" cy="9" r="2.2" fill="#ef476f"/>
        <circle cx="17" cy="9" r="2.2" fill="#e9c46a"/>
        <circle cx="24" cy="9" r="2.2" fill="#2a9d8f"/>
        <rect x="7" y="22" width="50" height="34" rx="2" fill="${mix(fill, "#000000", 0.25)}"/>`,
      badge: `<rect x="2" y="18" width="60" height="28" rx="14" fill="${fill}" stroke="${light}" stroke-width="2"/>
        <circle cx="16" cy="32" r="7" fill="${light}" opacity="0.85"/>`,
    };
    return `<svg viewBox="0 0 64 64" ${par} xmlns="http://www.w3.org/2000/svg">${shapes[type] || shapes.rect}</svg>`;
  }

  function paintShape(ctx, type, x, y, w, h, fill) {
    const light = mix(fill, "#ffffff", 0.28);
    const dark = shade(fill, 0.55);
    const stroke = mix(fill, "#ffffff", 0.18);
    const px = (nx, ny) => [x + nx * w, y + ny * h];
    const roundRect = (rx, ry, rw, rh, r) => {
      const radius = Math.min(r, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, radius);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, radius);
      ctx.arcTo(rx, ry + rh, rx, ry, radius);
      ctx.arcTo(rx, ry, rx + rw, ry, radius);
      ctx.closePath();
    };
    const poly = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [ax, ay] = px(p[0], p[1]);
        if (i === 0) ctx.moveTo(ax, ay);
        else ctx.lineTo(ax, ay);
      });
      ctx.closePath();
    };
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.03);

    if (type === "circle") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.44, h * 0.44, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      return;
    }
    if (type === "triangle") {
      poly([[0.5, 0.08], [0.92, 0.9], [0.08, 0.9]]);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      return;
    }
    if (type === "diamond") {
      poly([[0.5, 0.06], [0.94, 0.5], [0.5, 0.94], [0.06, 0.5]]);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      return;
    }
    if (type === "hexagon") {
      poly([[0.5, 0.06], [0.88, 0.28], [0.88, 0.72], [0.5, 0.94], [0.12, 0.72], [0.12, 0.28]]);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      return;
    }
    if (type === "rounded") {
      roundRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92, Math.min(w, h) * 0.16);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      return;
    }
    if (type === "panel") {
      roundRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.94, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.035);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.fillRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.18);
      roundRect(x + w * 0.09, y + h * 0.28, w * 0.82, h * 0.62, 4);
      ctx.fillStyle = dark;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (type === "button") {
      roundRect(x + w * 0.03, y + h * 0.18, w * 0.94, h * 0.7, Math.min(w, h) * 0.2);
      ctx.fillStyle = dark;
      ctx.fill();
      roundRect(x + w * 0.03, y + h * 0.1, w * 0.94, h * 0.66, Math.min(w, h) * 0.2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.stroke();
      return;
    }
    if (type === "slot") {
      roundRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, 8);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = light;
      ctx.stroke();
      ctx.setLineDash([]);
      roundRect(x + w * 0.22, y + h * 0.22, w * 0.56, h * 0.56, 4);
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (type === "hbar") {
      roundRect(x + w * 0.03, y + h * 0.22, w * 0.94, h * 0.56, Math.min(w, h) * 0.2);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      roundRect(x + w * 0.08, y + h * 0.3, w * 0.62, h * 0.4, 4);
      ctx.fillStyle = fill;
      ctx.fill();
      return;
    }
    if (type === "window") {
      roundRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.94, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.2);
      const r = Math.min(w, h) * 0.035;
      const cy = y + h * 0.13;
      ctx.beginPath(); ctx.arc(x + w * 0.14, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#ef476f"; ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.24, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#e9c46a"; ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.34, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#2a9d8f"; ctx.fill();
      roundRect(x + w * 0.1, y + h * 0.32, w * 0.8, h * 0.55, 3);
      ctx.fillStyle = mix(fill, "#000000", 0.25);
      ctx.fill();
      return;
    }
    if (type === "badge") {
      roundRect(x + w * 0.03, y + h * 0.22, w * 0.94, h * 0.56, Math.min(w, h) * 0.5);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + w * 0.22, y + h * 0.5, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92);
  }

  function getSprite(id) {
    const shape = SHAPES.find((s) => `shape-${s.id}` === id);
    if (shape) {
      return {
        id,
        type: "shape",
        source: shape.id,
        name: shape.name,
        w: shape.w,
        h: shape.h,
        fill: shape.fill,
      };
    }
    return state.library.find((s) => s.id === id) || null;
  }

  function allItems() {
    const out = [];
    for (const name of LAYER_ORDER) {
      for (const item of state.layers[name].items) {
        out.push({ layerName: name, item });
      }
    }
    return out;
  }

  function findItem(id) {
    if (!id) return null;
    for (const name of LAYER_ORDER) {
      const item = state.layers[name].items.find((it) => it.id === id);
      if (item) return { layerName: name, item, layer: state.layers[name] };
    }
    return null;
  }

  function itemCount() {
    return allItems().length;
  }

  function clampItem(item) {
    const g = state.gridSize;
    item.w = Math.max(1, Math.min(item.w, g));
    item.h = Math.max(1, Math.min(item.h, g));
    item.x = Math.max(0, Math.min(item.x, g - item.w));
    item.y = Math.max(0, Math.min(item.y, g - item.h));
  }

  function clampAllItems() {
    for (const { item } of allItems()) clampItem(item);
  }

  function clientToBoard(clientX, clientY) {
    const rect = els.board.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function clientToTile(clientX, clientY, useFloor = true) {
    const p = clientToBoard(clientX, clientY);
    const t = tilePx();
    const x = p.x / t;
    const y = p.y / t;
    if (useFloor) return { x: Math.floor(x), y: Math.floor(y) };
    return { x, y };
  }

  function inBoardTiles(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < state.gridSize && ty < state.gridSize;
  }

  function isOverBoard(clientX, clientY) {
    const node = document.elementFromPoint(clientX, clientY);
    return !!(node && (node === els.board || els.board.contains(node)));
  }

  function canEditLayer(name) {
    const layer = state.layers[name];
    return layer.visible && !layer.locked;
  }

  function placeSprite(sprite, tileX, tileY, layerName) {
    const layer = layerName || state.activeLayer;
    if (!canEditLayer(layer)) {
      toast(state.layers[layer].locked ? "Active layer is locked" : "Active layer is hidden");
      return null;
    }
    const item = {
      id: uid("item"),
      spriteId: sprite.id,
      type: sprite.type,
      source: sprite.source,
      name: sprite.name,
      x: tileX - Math.floor((sprite.w || 4) / 2),
      y: tileY - Math.floor((sprite.h || 4) / 2),
      w: sprite.w || 4,
      h: sprite.h || 4,
      fill: sprite.fill || "#4ecdc4",
      src: sprite.type === "image" ? sprite.src : undefined,
    };
    clampItem(item);
    state.layers[layer].items.push(item);
    state.selectedId = item.id;
    return item;
  }

  function deleteSelected() {
    const found = findItem(state.selectedId);
    if (!found) return;
    if (!canEditLayer(found.layerName)) {
      toast("Layer is locked or hidden");
      return;
    }
    found.layer.items = found.layer.items.filter((it) => it.id !== state.selectedId);
    state.selectedId = null;
    record();
    renderAll();
    toast("Deleted");
  }

  function duplicateSelected() {
    const found = findItem(state.selectedId);
    if (!found || !canEditLayer(found.layerName)) return;
    const copy = clone(found.item);
    copy.id = uid("item");
    copy.x += 1;
    copy.y += 1;
    clampItem(copy);
    found.layer.items.push(copy);
    state.selectedId = copy.id;
    record();
    renderAll();
    toast("Duplicated");
  }

  function nudge(dx, dy) {
    const found = findItem(state.selectedId);
    if (!found || !canEditLayer(found.layerName)) return;
    found.item.x += dx;
    found.item.y += dy;
    clampItem(found.item);
    record();
    renderItems();
    renderSelection();
    renderStatus();
    renderInspector();
  }

  function applyCssVars() {
    els.board.style.setProperty("--grid-size", String(state.gridSize));
    els.board.style.setProperty("--tile", `${tilePx()}px`);
    els.gridLines.classList.toggle("off", !state.showGrid);
  }

  function itemInner(item) {
    if (item.type === "image" && item.src) {
      return `<img alt="" draggable="false" src="${item.src}">`;
    }
    return shapeSvg(item.source || "rect", item.fill || "#4ecdc4", true);
  }

  function renderItems() {
    for (const name of LAYER_ORDER) {
      const layer = state.layers[name];
      const node = $(`layer-${name}`);
      if (!layer.visible) {
        node.innerHTML = "";
        node.style.display = "none";
        continue;
      }
      node.style.display = "";
      const t = tilePx();
      node.innerHTML = layer.items.map((item) => {
        const locked = layer.locked ? " is-locked" : "";
        const selected = item.id === state.selectedId ? " is-selected" : "";
        return `<div class="item${locked}${selected}" data-item-id="${item.id}" data-layer="${name}"
          style="left:${item.x * t}px;top:${item.y * t}px;width:${item.w * t}px;height:${item.h * t}px;">${itemInner(item)}</div>`;
      }).join("");
    }
    els.hint.classList.toggle("hide", itemCount() > 0);
  }

  function renderSelection() {
    const found = findItem(state.selectedId);
    if (!found || !found.layer.visible) {
      els.selection.innerHTML = "";
      return;
    }
    const t = tilePx();
    const { item } = found;
    const handles = found.layer.locked ? "" : `
      <div class="handle nw" data-handle="nw"></div>
      <div class="handle n" data-handle="n"></div>
      <div class="handle ne" data-handle="ne"></div>
      <div class="handle e" data-handle="e"></div>
      <div class="handle se" data-handle="se"></div>
      <div class="handle s" data-handle="s"></div>
      <div class="handle sw" data-handle="sw"></div>
      <div class="handle w" data-handle="w"></div>`;
    els.selection.innerHTML = `<div class="sel-box" style="left:${item.x * t}px;top:${item.y * t}px;width:${item.w * t}px;height:${item.h * t}px;">${handles}</div>`;
  }

  function updateItemDom(item) {
    const el = els.board.querySelector(`[data-item-id="${item.id}"]`);
    if (!el) return;
    const t = tilePx();
    el.style.left = `${item.x * t}px`;
    el.style.top = `${item.y * t}px`;
    el.style.width = `${item.w * t}px`;
    el.style.height = `${item.h * t}px`;
    const box = els.selection.querySelector(".sel-box");
    if (box) {
      box.style.left = el.style.left;
      box.style.top = el.style.top;
      box.style.width = el.style.width;
      box.style.height = el.style.height;
    }
  }

  function renderPalette() {
    const shapeCards = SHAPES.map((shape) => {
      const id = `shape-${shape.id}`;
      const stamp = state.stampId === id ? " stamp" : "";
      return `<button type="button" class="sprite-card${stamp}" data-sprite-id="${id}" title="Drag onto the grid, or click to stamp">
        <div class="sprite-thumb">${shapeSvg(shape.id, shape.fill, false)}</div>
        <span>${escapeHtml(shape.name)}</span>
      </button>`;
    }).join("");

    const uploads = state.library.map((spr) => {
      const stamp = state.stampId === spr.id ? " stamp" : "";
      return `<button type="button" class="sprite-card${stamp}" data-sprite-id="${spr.id}" title="${escapeHtml(spr.name)}">
        <div class="sprite-thumb"><img alt="" draggable="false" src="${spr.src}"></div>
        <span>${escapeHtml(spr.name)}</span>
      </button>`;
    }).join("");

    els.palette.innerHTML = `
      <div>
        <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">UI shapes</p>
        <div class="grid grid-cols-2 gap-2">${shapeCards}</div>
      </div>
      <div>
        <p class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Uploads</p>
        ${uploads ? `<div class="grid grid-cols-2 gap-2">${uploads}</div>` : `<p class="text-[11px] text-slate-600">No custom sprites yet</p>`}
      </div>`;
  }

  function renderLayersPanel() {
    els.layerList.innerHTML = LAYER_ORDER.map((name) => {
      const layer = state.layers[name];
      const meta = LAYER_META[name];
      const active = state.activeLayer === name ? " active" : "";
      const eye = layer.visible
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/></svg>`;
      const lock = layer.locked
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
      return `<div class="flex items-center gap-1">
        <button type="button" class="layer-row${active}" data-select-layer="${name}">
          <span class="layer-swatch" style="background:${meta.color}"></span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium">${meta.label}</span>
            <span class="block text-[10px] text-slate-500">${layer.items.length} item${layer.items.length === 1 ? "" : "s"}</span>
          </span>
        </button>
        <button type="button" class="icon-btn ${layer.visible ? "" : "off"}" data-vis="${name}" title="${layer.visible ? "Hide layer" : "Show layer"}" aria-label="${layer.visible ? "Hide" : "Show"} ${meta.label}">${eye}</button>
        <button type="button" class="icon-btn ${layer.locked ? "on-lock" : ""}" data-lock="${name}" title="${layer.locked ? "Unlock layer" : "Lock layer"}" aria-label="${layer.locked ? "Unlock" : "Lock"} ${meta.label}">${lock}</button>
      </div>`;
    }).join("");
  }

  function renderInspector() {
    const found = findItem(state.selectedId);
    if (!found) {
      els.inspector.innerHTML = `<div class="rounded-lg border border-ink-700 bg-ink-950 p-3 text-[12px] text-slate-500">Select a sprite on the grid to edit position, size, and color.</div>`;
      return;
    }
    const { item, layerName } = found;
    const colorField = item.type === "image" ? "" : `
      <div class="field mt-2">
        <label for="insp-fill">Fill</label>
        <input id="insp-fill" type="color" value="${toHex(item.fill)}" class="h-8 w-full rounded-md bg-ink-950 border border-ink-700 p-0.5 cursor-pointer" />
      </div>`;
    els.inspector.innerHTML = `
      <div class="rounded-lg border border-ink-700 bg-ink-950 p-3 space-y-3">
        <div>
          <p class="text-sm font-medium text-slate-100">${escapeHtml(item.name)}</p>
          <p class="text-[11px] text-slate-500">${LAYER_META[layerName].label} · ${item.type === "image" ? "image" : item.source}</p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="field"><label for="insp-x">X</label><input id="insp-x" type="number" min="0" value="${item.x}" /></div>
          <div class="field"><label for="insp-y">Y</label><input id="insp-y" type="number" min="0" value="${item.y}" /></div>
          <div class="field"><label for="insp-w">Width</label><input id="insp-w" type="number" min="1" value="${item.w}" /></div>
          <div class="field"><label for="insp-h">Height</label><input id="insp-h" type="number" min="1" value="${item.h}" /></div>
        </div>
        ${colorField}
        <button type="button" id="btn-delete-item" class="w-full mt-1 px-2 py-1.5 rounded-md text-xs font-medium bg-ink-800 border border-ink-700 hover:border-red-400 hover:text-red-300">Delete sprite</button>
      </div>`;
  }

  function toHex(color) {
    if (!color) return "#888888";
    if (color.startsWith("#")) return color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color.slice(0, 7);
    const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return "#888888";
    const h = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }

  function renderToolbar() {
    els.btnGrid32.classList.toggle("on", state.gridSize === 32);
    els.btnGrid48.classList.toggle("on", state.gridSize === 48);
    els.btnGridLines.classList.toggle("on", state.showGrid);
    els.btnGridLines.setAttribute("aria-pressed", state.showGrid ? "true" : "false");
    els.selZoom.value = String(state.zoom);
  }

  function renderStatus() {
    els.statusGrid.textContent = `${state.gridSize} x ${state.gridSize} · ${tilePx()}px tiles`;
    if (hoverTile && inBoardTiles(hoverTile.x, hoverTile.y)) {
      els.statusHover.textContent = `Hover: ${hoverTile.x}, ${hoverTile.y}`;
    } else {
      els.statusHover.textContent = "Hover: -";
    }
    const found = findItem(state.selectedId);
    if (found) {
      const { item, layerName } = found;
      els.statusSel.textContent = `${item.name} · ${item.w}x${item.h} @ ${item.x},${item.y} · ${LAYER_META[layerName].label}`;
    } else {
      els.statusSel.textContent = "No selection";
    }
    if (state.stampId) {
      const spr = getSprite(state.stampId);
      els.statusStamp.textContent = spr ? `Stamp: ${spr.name}` : "";
    } else {
      els.statusStamp.textContent = "";
    }
  }

  function renderStampPreview(tileX, tileY) {
    if (!state.stampId || gesture) {
      els.hover.classList.remove("show");
      return;
    }
    if (!inBoardTiles(tileX, tileY) || !canEditLayer(state.activeLayer)) {
      els.hover.classList.remove("show");
      return;
    }
    const spr = getSprite(state.stampId);
    if (!spr) {
      els.hover.classList.remove("show");
      return;
    }
    const item = { x: tileX - Math.floor(spr.w / 2), y: tileY - Math.floor(spr.h / 2), w: spr.w, h: spr.h };
    clampItem(item);
    const t = tilePx();
    els.hover.style.left = `${item.x * t}px`;
    els.hover.style.top = `${item.y * t}px`;
    els.hover.style.width = `${item.w * t}px`;
    els.hover.style.height = `${item.h * t}px`;
    els.hover.classList.add("show");
  }

  function renderAll() {
    applyCssVars();
    renderToolbar();
    renderItems();
    renderSelection();
    renderPalette();
    renderLayersPanel();
    renderInspector();
    renderStatus();
  }

  function setGridSize(size) {
    if (state.gridSize === size) return;
    state.gridSize = size;
    clampAllItems();
    record();
    renderAll();
  }

  function hitItem(clientX, clientY) {
    const { x, y } = clientToTile(clientX, clientY, false);
    for (const name of [...LAYER_ORDER].reverse()) {
      const layer = state.layers[name];
      if (!layer.visible || layer.locked) continue;
      for (let i = layer.items.length - 1; i >= 0; i -= 1) {
        const item = layer.items[i];
        if (x >= item.x && y >= item.y && x < item.x + item.w && y < item.y + item.h) {
          return { layerName: name, item };
        }
      }
    }
    return null;
  }

  function startPaletteDrag(spriteId, event) {
    const sprite = getSprite(spriteId);
    if (!sprite) return;
    gesture = {
      kind: "palette",
      spriteId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    els.ghost.innerHTML = sprite.type === "image"
      ? `<img alt="" src="${sprite.src}">`
      : shapeSvg(sprite.source, sprite.fill, false);
  }

  function resizeFromHandle(item, handle, tileX, tileY) {
    let x1 = item.x;
    let y1 = item.y;
    let x2 = item.x + item.w;
    let y2 = item.y + item.h;
    const tx = Math.round(tileX);
    const ty = Math.round(tileY);
    if (handle.includes("w")) x1 = tx;
    if (handle.includes("e")) x2 = tx;
    if (handle.includes("n")) y1 = ty;
    if (handle.includes("s")) y2 = ty;
    if (x2 <= x1) {
      if (handle.includes("w")) x1 = x2 - 1;
      else x2 = x1 + 1;
    }
    if (y2 <= y1) {
      if (handle.includes("n")) y1 = y2 - 1;
      else y2 = y1 + 1;
    }
    item.x = x1;
    item.y = y1;
    item.w = x2 - x1;
    item.h = y2 - y1;
    clampItem(item);
  }

  function onPointerMove(event) {
    const tile = clientToTile(event.clientX, event.clientY);
    hoverTile = tile;
    if (!gesture) {
      renderStampPreview(tile.x, tile.y);
      renderStatus();
      return;
    }

    if (gesture.kind === "palette") {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.moved && dx * dx + dy * dy > 36) {
        gesture.moved = true;
        els.ghost.classList.add("show");
      }
      if (gesture.moved) {
        els.ghost.style.left = `${event.clientX + 12}px`;
        els.ghost.style.top = `${event.clientY + 12}px`;
        if (isOverBoard(event.clientX, event.clientY) && inBoardTiles(tile.x, tile.y)) {
          state.stampId = gesture.spriteId;
          renderStampPreview(tile.x, tile.y);
        } else {
          els.hover.classList.remove("show");
        }
      }
      return;
    }

    if (gesture.kind === "move") {
      const pos = clientToTile(event.clientX, event.clientY, false);
      const found = findItem(gesture.itemId);
      if (!found) return;
      found.item.x = Math.round(pos.x - gesture.offsetX);
      found.item.y = Math.round(pos.y - gesture.offsetY);
      clampItem(found.item);
      gesture.dirty = found.item.x !== gesture.origin.x || found.item.y !== gesture.origin.y;
      updateItemDom(found.item);
      renderStatus();
      return;
    }

    if (gesture.kind === "resize") {
      const pos = clientToTile(event.clientX, event.clientY, false);
      const found = findItem(gesture.itemId);
      if (!found) return;
      resizeFromHandle(found.item, gesture.handle, pos.x, pos.y);
      gesture.dirty = found.item.x !== gesture.origin.x || found.item.y !== gesture.origin.y
        || found.item.w !== gesture.origin.w || found.item.h !== gesture.origin.h;
      updateItemDom(found.item);
      renderStatus();
    }
  }

  function onPointerUp(event) {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    els.ghost.classList.remove("show");

    if (current.kind === "palette") {
      const tile = clientToTile(event.clientX, event.clientY);
      const overBoard = inBoardTiles(tile.x, tile.y) && isOverBoard(event.clientX, event.clientY);
      state.stampId = current.spriteId;
      if (current.moved && overBoard) {
        const spr = getSprite(current.spriteId);
        if (spr) {
          placeSprite(spr, tile.x, tile.y);
          record();
        }
      }
      renderAll();
      return;
    }

    if ((current.kind === "move" || current.kind === "resize") && current.dirty) {
      record();
      renderInspector();
      renderStatus();
      renderLayersPanel();
    }
  }

  function onBoardPointerDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest("input, textarea, select, button.icon-btn")) return;

    const handle = event.target.closest("[data-handle]");
    if (handle && state.selectedId) {
      const found = findItem(state.selectedId);
      if (!found || !canEditLayer(found.layerName)) return;
      event.preventDefault();
      els.board.focus();
      gesture = {
        kind: "resize",
        itemId: found.item.id,
        handle: handle.dataset.handle,
        origin: { x: found.item.x, y: found.item.y, w: found.item.w, h: found.item.h },
        dirty: false,
      };
      return;
    }

    const tile = clientToTile(event.clientX, event.clientY);
    const hit = hitItem(event.clientX, event.clientY);

    if (state.stampId && inBoardTiles(tile.x, tile.y)) {
      const spr = getSprite(state.stampId);
      const blockedBySameLayer = hit && hit.layerName === state.activeLayer;
      if (spr && !blockedBySameLayer) {
        event.preventDefault();
        els.board.focus();
        placeSprite(spr, tile.x, tile.y);
        record();
        renderAll();
        return;
      }
    }

    if (hit) {
      event.preventDefault();
      els.board.focus();
      state.selectedId = hit.item.id;
      state.activeLayer = hit.layerName;
      state.stampId = null;
      const pos = clientToTile(event.clientX, event.clientY, false);
      gesture = {
        kind: "move",
        itemId: hit.item.id,
        offsetX: pos.x - hit.item.x,
        offsetY: pos.y - hit.item.y,
        origin: { x: hit.item.x, y: hit.item.y, w: hit.item.w, h: hit.item.h },
        dirty: false,
      };
      renderItems();
      renderSelection();
      renderLayersPanel();
      renderInspector();
      renderPalette();
      renderStatus();
      return;
    }

    state.selectedId = null;
    renderSelection();
    renderInspector();
    renderStatus();
  }

  function onKeyDown(event) {
    const typing = event.target.matches("input, textarea, select");
    const key = event.key;
    const cmd = event.metaKey || event.ctrlKey;

    if (cmd && key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (cmd && key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (typing) return;

    if (key === "Escape") {
      state.selectedId = null;
      state.stampId = null;
      els.hover.classList.remove("show");
      renderPalette();
      renderSelection();
      renderInspector();
      renderStatus();
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (cmd && key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (key === "ArrowLeft") { event.preventDefault(); nudge(-1, 0); }
    if (key === "ArrowRight") { event.preventDefault(); nudge(1, 0); }
    if (key === "ArrowUp") { event.preventDefault(); nudge(0, -1); }
    if (key === "ArrowDown") { event.preventDefault(); nudge(0, 1); }
  }

  function addUploadedFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      toast("No images found");
      return;
    }
    let pending = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = Math.max(img.width, img.height);
          const tiles = Math.max(2, Math.min(8, Math.round(maxDim / 32)));
          state.library.push({
            id: uid("img"),
            type: "image",
            source: file.name,
            name: file.name.replace(/\.[^.]+$/, ""),
            src: reader.result,
            w: tiles,
            h: Math.max(2, Math.round(tiles * (img.height / img.width) || tiles)),
            fill: "#888888",
          });
          pending -= 1;
          if (pending === 0) {
            record();
            renderPalette();
            toast(`Added ${files.length} sprite${files.length === 1 ? "" : "s"}`);
          }
        };
        img.onerror = () => {
            pending -= 1;
            if (pending === 0) {
              record();
              renderPalette();
              toast(`Added sprites`);
            }
          };
          img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function exportLayoutData() {
    const data = {
      app: "layout-maker",
      version: 1,
      grid: { cols: state.gridSize, rows: state.gridSize },
      layers: LAYER_ORDER.map((name) => {
        const layer = state.layers[name];
        return {
          id: name,
          name: LAYER_META[name].label,
          visible: layer.visible,
          locked: layer.locked,
          items: layer.items.map((item) => ({
            id: item.id,
            x: item.x,
            y: item.y,
            width: item.w,
            height: item.h,
            fill: item.fill,
            sprite: {
              id: item.spriteId,
              type: item.type,
              source: item.type === "image" ? item.src : item.source,
              name: item.name,
            },
          })),
        };
      }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    download(`layout-${state.gridSize}x${state.gridSize}.json`, blob);
    toast("Exported JSON");
  }

  function loadLayoutData(data) {
    if (!data || !data.layers) throw new Error("Invalid layout file");
    const size = (data.grid && (data.grid.cols || data.grid.size)) || 32;
    state.gridSize = size === 48 ? 48 : 32;
    state.layers = layers();
    state.library = [];
    const seen = new Set();
    for (const layer of data.layers) {
      const name = layer.id || String(layer.name || "").toLowerCase();
      if (!state.layers[name]) continue;
      state.layers[name].visible = layer.visible !== false;
      state.layers[name].locked = !!layer.locked;
      state.layers[name].items = (layer.items || []).map((raw) => {
        const sprite = raw.sprite || {};
        const type = sprite.type === "image" ? "image" : "shape";
        const item = {
          id: raw.id || uid("item"),
          spriteId: sprite.id || uid("spr"),
          type,
          source: type === "shape" ? (sprite.source || "rect") : (sprite.name || "image"),
          name: sprite.name || raw.name || "Sprite",
          x: Number(raw.x) || 0,
          y: Number(raw.y) || 0,
          w: Number(raw.width || raw.w) || 1,
          h: Number(raw.height || raw.h) || 1,
          fill: raw.fill || "#4ecdc4",
          src: type === "image" ? sprite.source : undefined,
        };
        clampItem(item);
        if (type === "image" && item.src && !seen.has(item.spriteId)) {
          seen.add(item.spriteId);
          state.library.push({
            id: item.spriteId,
            type: "image",
            source: sprite.name || "image",
            name: item.name,
            src: item.src,
            w: item.w,
            h: item.h,
            fill: item.fill,
          });
        }
        return item;
      });
    }
    state.selectedId = null;
    state.stampId = null;
    record();
    renderAll();
    toast("Layout loaded");
  }

  async function exportPng() {
    const g = state.gridSize;
    const t = EXPORT_TILE;
    const canvas = document.createElement("canvas");
    canvas.width = g * t;
    canvas.height = g * t;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#141822";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imageCache = {};
    const loaders = [];
    for (const { item } of allItems()) {
      if (item.type === "image" && item.src && !imageCache[item.src]) {
        imageCache[item.src] = null;
        loaders.push(new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { imageCache[item.src] = img; resolve(); };
          img.onerror = () => resolve();
          img.src = item.src;
        }));
      }
    }
    await Promise.all(loaders);

    for (const name of LAYER_ORDER) {
      const layer = state.layers[name];
      if (!layer.visible) continue;
      for (const item of layer.items) {
        const x = item.x * t;
        const y = item.y * t;
        const w = item.w * t;
        const h = item.h * t;
        if (item.type === "image" && imageCache[item.src]) {
          ctx.drawImage(imageCache[item.src], x, y, w, h);
        } else {
          paintShape(ctx, item.source || "rect", x, y, w, h, item.fill || "#4ecdc4");
        }
      }
    }

    if (state.showGrid) {
      ctx.strokeStyle = "rgba(232, 236, 241, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= g; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * t + 0.5, 0);
        ctx.lineTo(i * t + 0.5, g * t);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * t + 0.5);
        ctx.lineTo(g * t, i * t + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(240, 161, 78, 0.28)";
      for (let i = 0; i <= g; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i * t + 0.5, 0);
        ctx.lineTo(i * t + 0.5, g * t);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * t + 0.5);
        ctx.lineTo(g * t, i * t + 0.5);
        ctx.stroke();
      }
    }

    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          download(`layout-${g}x${g}.png`, blob);
          toast("Exported PNG");
        } else {
          toast("PNG export failed");
        }
        resolve();
      }, "image/png");
    });
  }

  function download(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function bindInspectorEvents() {
    els.inspector.addEventListener("change", (event) => {
      const found = findItem(state.selectedId);
      if (!found || !canEditLayer(found.layerName)) return;
      const { item } = found;
      const id = event.target.id;
      if (id === "insp-x") item.x = Number(event.target.value);
      if (id === "insp-y") item.y = Number(event.target.value);
      if (id === "insp-w") item.w = Number(event.target.value);
      if (id === "insp-h") item.h = Number(event.target.value);
      if (id === "insp-fill") {
        item.fill = event.target.value;
        record();
        renderItems();
        renderSelection();
        return;
      }
      clampItem(item);
      record();
      renderItems();
      renderSelection();
      renderStatus();
    });
    els.inspector.addEventListener("click", (event) => {
      if (event.target.id === "btn-delete-item") deleteSelected();
    });
  }

  function setupEvents() {
    els.btnGrid32.addEventListener("click", () => setGridSize(32));
    els.btnGrid48.addEventListener("click", () => setGridSize(48));
    els.btnGridLines.addEventListener("click", () => {
      state.showGrid = !state.showGrid;
      applyCssVars();
      renderToolbar();
    });
    els.selZoom.addEventListener("change", () => {
      state.zoom = Number(els.selZoom.value) || 1;
      renderAll();
    });
    $("btn-new").addEventListener("click", () => {
      if (itemCount() && !window.confirm("Clear the current layout?")) return;
      state.layers = layers();
      state.selectedId = null;
      state.stampId = null;
      record();
      renderAll();
      toast("New layout");
    });
    $("btn-export-json").addEventListener("click", exportLayoutData);
    $("btn-export-png").addEventListener("click", () => { exportPng(); });
    $("btn-load").addEventListener("click", () => els.fileJson.click());
    $("btn-upload").addEventListener("click", () => els.fileImages.click());
    els.fileImages.addEventListener("change", (e) => {
      addUploadedFiles(e.target.files);
      e.target.value = "";
    });
    els.fileJson.addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadLayoutData(JSON.parse(reader.result));
        } catch (err) {
          toast("Could not load JSON");
        }
      };
      reader.readAsText(file);
    });

    els.palette.addEventListener("pointerdown", (event) => {
      const card = event.target.closest("[data-sprite-id]");
      if (!card || event.button !== 0) return;
      event.preventDefault();
      startPaletteDrag(card.dataset.spriteId, event);
    });

    els.layerList.addEventListener("click", (event) => {
      const vis = event.target.closest("[data-vis]");
      if (vis) {
        const name = vis.dataset.vis;
        state.layers[name].visible = !state.layers[name].visible;
        if (!state.layers[name].visible && findItem(state.selectedId)?.layerName === name) {
          state.selectedId = null;
        }
        renderAll();
        return;
      }
      const lock = event.target.closest("[data-lock]");
      if (lock) {
        const name = lock.dataset.lock;
        state.layers[name].locked = !state.layers[name].locked;
        renderAll();
        return;
      }
      const row = event.target.closest("[data-select-layer]");
      if (row) {
        state.activeLayer = row.dataset.selectLayer;
        renderLayersPanel();
        renderStatus();
      }
    });

    els.board.addEventListener("pointerdown", onBoardPointerDown);
    els.board.addEventListener("pointermove", (event) => {
      if (gesture) return;
      const tile = clientToTile(event.clientX, event.clientY);
      hoverTile = tile;
      renderStampPreview(tile.x, tile.y);
      renderStatus();
    });
    els.board.addEventListener("pointerleave", () => {
      if (gesture) return;
      hoverTile = null;
      els.hover.classList.remove("show");
      renderStatus();
    });

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    ["dragenter", "dragover"].forEach((name) => {
      els.spriteDrop.addEventListener(name, (e) => {
        e.preventDefault();
        els.spriteDrop.classList.add("border-quest-400");
      });
      els.board.addEventListener(name, (e) => e.preventDefault());
    });
    ["dragleave", "drop"].forEach((name) => {
      els.spriteDrop.addEventListener(name, (e) => {
        e.preventDefault();
        els.spriteDrop.classList.remove("border-quest-400");
      });
    });
    els.spriteDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      addUploadedFiles(e.dataTransfer.files);
    });
    els.board.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) addUploadedFiles(e.dataTransfer.files);
    });

    bindInspectorEvents();
  }

  setupEvents();
  record();
  renderAll();
})();
