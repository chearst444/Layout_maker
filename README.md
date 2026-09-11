# Layout Maker

Tile-based visual layout mockup tool for Snack Quests and other indie game UI. Built as a static site with HTML, Tailwind CSS (CDN), and vanilla JavaScript. No build step.

Live path when GitHub Pages is enabled on `main` from `/` (root):

https://chearst444.github.io/Layout_maker/

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080/

## GitHub Pages

1. Open the repo **Settings**.
2. Go to **Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose branch `main` and folder `/` (root).
5. Save. The app publishes at `https://chearst444.github.io/Layout_maker/`.

Assets use relative paths (`./styles.css`, `./app.js`), so the site works at the project URL. A `.nojekyll` file is included so GitHub Pages does not process the tree with Jekyll.

## How to use

### Grid and workspace
- Choose **32 x 32** or **48 x 48** in the toolbar.
- Toggle **Grid lines** on or off. The workspace scrolls when the board is larger than the view.
- **Zoom** changes tile size on screen only. Layout coordinates stay in tiles.

### Layers
Three stacked layers: **Background**, **Middle**, **Foreground**.
- Click a layer row to make it the active placement target.
- Eye icon hides or shows that layer (hidden layers are skipped in PNG export).
- Lock icon blocks placing, moving, resizing, and deleting on that layer.

### Sprites
The left sidebar has built-in UI placeholders (rect, circle, rounded rect, triangle, diamond, hexagon, panel frame, button, icon slot, HUD bar, window frame, badge).

- Click a sprite to enter stamp mode, then click empty tiles on the grid.
- Drag a sprite from the sidebar onto the board. Drops snap to tile coordinates.
- **Upload** (or drop images on the dashed zone) to add custom sprites.

### Edit
- Drag a placed sprite to move it. It snaps to tiles.
- Use the selection handles to resize. Size snaps to whole tiles.
- Inspector fields edit X, Y, width, height, and fill color (shapes).
- **Delete sprite** in the inspector, or press Delete / Backspace.
- Escape clears the selection and stamp.
- Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo.
- Arrow keys nudge one tile. Ctrl/Cmd+D duplicates the selection.

## Export

### PNG
Toolbar **PNG** downloads `layout-{size}x{size}.png`.

- Only **visible** layers are drawn (eye-off layers are omitted).
- Locked layers still export if they are visible.
- Grid lines are included in the PNG **only when Grid lines is currently on** in the workspace. Turn the grid off before export for a clean mockup.
- Raster size is 32 pixels per tile (32x32 grid = 1024px, 48x48 grid = 1536px), independent of zoom.

### JSON
Toolbar **JSON** downloads layout data. **Load JSON** restores a saved file.

Each item stores tile `x`, `y`, `width`, `height`, fill, and a sprite reference:

```json
{
  "id": "item_...",
  "x": 4,
  "y": 2,
  "width": 6,
  "height": 2,
  "fill": "#e9c46a",
  "sprite": {
    "id": "shape-button",
    "type": "shape",
    "source": "button",
    "name": "Button"
  }
}
```

Uploaded images use `"type": "image"` and put the data URL in `sprite.source`. Those files can be large.

## Files

- `index.html` - shell and layout
- `styles.css` - workspace, sprites, handles
- `app.js` - grid, layers, drag/resize, export, history
