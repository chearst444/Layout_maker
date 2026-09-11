# Layout Maker

Tile-based visual layout mockup tool for Snack Quests and other indie game UI work. Built as a static site with HTML, Tailwind CSS (CDN), and vanilla JavaScript. No build step.

## Open it

- **Local file:** open `index.html` in a modern browser.
- **Local server:** from this folder run `python3 -m http.server 8080`, then visit [http://localhost:8080](http://localhost:8080).
- **GitHub Pages:** serve the repository root (`/`) from the `main` branch. The app is `index.html` at the site root.

## What you can do

### Grid and workspace
- Choose **32 x 32 grid** or **48 x 48 grid** in the toolbar.
- Toggle grid lines with the grid button.
- Zoom in and out from the toolbar on every screen size. Click the **100%** label to reset zoom. Zoom only scales the workspace view.
- The toolbar shows **Image** size (PNG pixels, 32 px per tile). The status bar also shows **View** size (24 px per tile at 100% zoom). A 32 x 32 board is 768 x 768 on screen and 1024 x 1024 in the PNG. A 48 x 48 board is 1152 x 1152 on screen and 1536 x 1536 in the PNG. Zoom does not change the image size.

### Layers
Three stacked layers: **Background**, **Middle**, **Foreground**.

- Click a layer name (or its color dot) to make it the active placement layer.
- Eye control hides or shows that layer.
- Lock control blocks placing, moving, resizing, and deleting on that layer.

### Sprites
The left sidebar has built-in placeholder shapes (rect, circle, rounded rect, triangle, panel frame, button, diamond, hexagon, badge, bar, item slot, window, terrain, pip).

- Upload PNG, SVG, or WebP images, or drop files on the upload zone. Uploaded sprites appear under **Uploads**.
- Click a sprite to enter stamp mode (card highlight, "Click the grid to place" hint). Then click the grid to stamp it on the **active** layer (snaps to tiles, stacks over existing items).
- Drag a sprite from the sidebar onto the grid. A ghost preview follows the pointer. Release to place.
- Click the same sprite again, or press **Escape**, to leave stamp mode.

### Edit placed sprites
- Click to select (when not in stamp mode). Drag to move (tile snap). Drag the honey-colored handles to resize across tiles.
- Inspector fields edit X, Y, W, H in tiles. Send back / Bring front changes stacking inside the layer.
- **Delete** or **Backspace** removes the selection. The trash control in the inspector does the same.
- **Escape** clears the selection and stamp tool.
- Arrow keys nudge one tile. Toolbar **Undo** and **Redo** buttons share the same history as **Ctrl/Cmd+Z**, **Ctrl/Cmd+Shift+Z**, and **Ctrl/Cmd+Y**. Buttons disable when there is nothing to undo or redo.

**Load sample** drops a small HUD mockup onto a 32 x 32 board so you can try hide, lock, move, and export immediately.

## Export

### PNG
**Export PNG** rasterizes currently **visible** layers (hidden layers are skipped). Grid lines are included **only if the grid is currently shown**. If you hide the grid first, the PNG has no grid overlay. Export resolution is 32 pixels per tile.

### JSON
**Export JSON** writes layer structure with tile coordinates:

- `grid.cols` / `grid.rows`
- each layer: `id`, `name`, `visible`, `locked`, `items`
- each item: `id`, `x`, `y`, `width`, `height` (tiles), `sprite` (`id`, `type`, `source`)

`type` is `shape` or `image`. For shapes, `source` is the shape key (for example `panel`). For uploads, `source` is the original filename. Image pixels are not embedded in the JSON.

## Notes
- Placement always targets the active layer. You cannot drop onto a hidden or locked active layer.
- Switching from 48 x 48 down to 32 x 32 clamps any items that would sit outside the new bounds.
- Tailwind is loaded from the CDN, so the browser needs network access the first time you open the page.
