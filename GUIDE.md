# Design Workspace — User Guide

A design ideation tool where you upload drafts and references, run AI-powered actions, and build a concept tree you can explore, annotate, and steer.

Everything is saved automatically to your browser's local storage — no account or server needed.

---

## The layout

```
┌──────────────────────────────────────────────────────────────┐
│  Action toolbar (Unpack Brief · Analyze · Variations…)       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Canvas — concept tree, feed, or clusters                   │
│   (this is where you spend most of your time)               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The canvas has three views, toggled by tabs at the top:

| View | What it shows |
|---|---|
| **Feed** | Cards in reverse-chronological order, one column per action run |
| **Tree** | Interactive node graph showing how ideas branched from each other |
| **Clusters** | Cards grouped by the collection they belong to |

---

## Starting: the Brief and inputs

When you first open the workspace, the Tree view shows two input nodes on the left column:

### Brief node (amber border)
- **Project title** — rename your project at the top.
- **Brief textarea** — describe the design problem, goals, constraints, and audience. The model reads this verbatim before every action.
- **+ Draft / + Reference buttons** — open a file picker to upload images.

### Draft nodes (grey border)
Images you want the model to analyze or use as a visual starting point. Drafts are sent when you run **Analyze**, **Visual Variations**, **Conceptual Variations**, or **Generate Concept Visuals**.

### Reference nodes (blue-grey border)
Inspirational images or benchmarks. References are sent when you run **Analyze** or **Conceptual Variations**.

> **Tip:** You can drag any input node to reposition it on the canvas. Its position is remembered.

---

## Running an action

1. **Select context (optional)** — shift-click nodes on the canvas to multi-select them. They'll be offered as context in the next step.
2. **Click an action button** in the toolbar.
3. The **Call Composer** opens. Review what will be sent:
   - Brief preview
   - Selected canvas nodes (checkboxes — uncheck any you want to exclude)
   - Draft / reference images (click to toggle)
   - Any extra instructions you want to add
4. Click **Send →**.

Cards appear in the canvas as the model responds. A spinner in the top-center shows which action is running.

---

## Actions

### Unpack Brief
Reads your brief and returns a set of **Concept** cards — goals, constraints, tensions, and possible idea directions.  
*No images required.*

### Analyze
Reads your brief plus any selected draft and reference images and returns **Motif** cards — recurring visual elements, qualities, and patterns worth carrying forward.

### Visual Variations
Generates one **Visual** card per selected Arnheim dimension. Each card contains a generated image showing what your concept looks like when that dimension is pushed to an extreme. Runs up to 9 parallel image-generation calls.

**Arnheim dimensions:** Balance · Shape · Form · Growth · Space · Light · Color · Movement · Dynamics

Deselect dimensions in the composer to run only a subset.

### Conceptual Variations
Returns **Concept** cards that reframe or extend your existing directions — grounded in your brief, drafts, and any context nodes you selected.

### Generate Concept Visuals
Takes selected **Concept** cards and generates a 2×2 panel of four visuals for each one. Select the concept cards you want visualized before clicking the action.

---

## Card types

| Type | Fields | Typical source |
|---|---|---|
| **Concept** | Title · Description · Rationale | Unpack Brief, Conceptual Variations |
| **Motif** | Title · Visual quality · How it conveys the idea · Category | Analyze |
| **Visual** | Title · Dimension label · Analysis · Generated image | Visual Variations, Generate Concept Visuals |
| **Note** | Title · Body | Hand-added by you |

---

## The canvas (Tree view)

### Navigating
- **Pan** — click and drag on empty space, or scroll.
- **Zoom** — scroll wheel, or use the zoom controls (bottom-left).
- **Fit view** — click the fit icon in the bottom-left controls.

### Selecting nodes
- **Single click** — select a node and open its detail panel on the right.
- **Shift-click** — add a node to the multi-selection.
- **Click empty space** — deselect everything.

### Detail panel (single node selected)
Appears on the right when you click a card node. Lets you:
- **Edit any field** inline — changes save automatically on every keystroke.
- **Duplicate** — creates an identical copy connected to the same parents, and inherits any children the original had.
- **Remove (✕)** — removes the node from the canvas (does not delete underlying data).
- **Quick branch** — small action buttons on hover (inside the node) let you branch directly from that card without opening the composer.

For **Brief / Draft / Reference** nodes, clicking opens a simplified panel showing the brief text or image preview.

### Multi-select action bar
When two or more nodes are selected, a bar appears at the bottom of the canvas with:
- **Unpack Brief / Analyze / Variations** — run an action using the selected nodes as context.
- **Collection →** — add the selected nodes to a collection (or create a new one).
- **✕ Clear** — deselect.

### Adding a node manually
Click **+ Add node** (top-right of canvas). If nodes are already selected, the new node will be connected to them as children. Fill in a title and body; the card is added as a **Note**.

### Removing nodes
- Hover a card and click the **✕** button that appears.
- Or select a node and press **Delete** / **Backspace**.

### Dragging nodes
Click and drag any node to reposition it. Positions persist across sessions.

---

## Connections (edges)

Edges show how cards relate to each other. There are two kinds:

### Provenance edges (automatically drawn)
Dashed lines with a small arrow, colored by the action type or source asset. They show which cards were used as context when a child batch was generated.

- Hovering over a card highlights its provenance — which earlier cards fed into it.

### Manual connections
You can draw your own connections between any nodes, including Brief and asset nodes.

1. Click **Connect** (top-right of canvas). The button turns dark and small dots appear on node edges.
2. **Drag** from a source dot (right side of a node) to a target dot (left side of another node). Release to create the connection.
3. To **delete** a connection, hover it until the **✕** button appears at its midpoint, then click it.
4. Click **Connect** again (or the button) to exit connect mode.

Manual connections are shown as dashed slate lines — visually distinct from provenance edges.

---

## Collections

Collections are named groups with a color. Use them to cluster thematically related cards.

### Creating a collection
1. Shift-click two or more nodes to multi-select them.
2. Click **Collection →** in the bottom action bar.
3. Pick an existing collection or type a name and press **Enter** to create a new one.

### Viewing collection colors
When at least one collection exists, a **◉ Colors** button appears in the top-right. Toggle it to show soft color halos around each node — one halo layer per collection, so nodes in multiple collections show overlapping colors.

### Managing collections
In the **Clusters** view, each collection is shown as a column. You can rename, recolor, or delete collections from there.

---

## Tips and workflows

**Start with the brief.** The more specific your brief, the more targeted the model's output. Include constraints ("mobile-first", "must feel playful but trustworthy") not just goals.

**Unpack first, then branch.** Run Unpack Brief to get concept directions, then select one or two you find most promising and run Conceptual Variations or Visual Variations to go deeper on those.

**Select for context.** Any nodes you shift-click before hitting an action will be offered as context. The model can use them to stay grounded in a specific direction rather than exploring freely.

**Edit cards freely.** Double-click any field in the detail panel to refine the model's output — correct descriptions, sharpen titles, or add your own framing.

**Use manual connections to map relationships.** If you notice a motif card from Analyze directly informs a concept from Unpack Brief, draw a connection between them. This builds a richer picture of how your ideas relate.

**Duplicate to fork.** Duplicate a card to explore a variant of it — the copy inherits all parent and child connections, so it slots into the same part of the tree.

**Collections for synthesis.** As your canvas grows, use collections to group the strongest directions. Switch to the Clusters view for a side-by-side comparison.

**Clear and start over.** Click **Clear all** (top-right) when you want to wipe the canvas for a new round. Your brief and assets stay intact.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| **Shift-click** | Add node to multi-selection |
| **Delete / Backspace** | Remove selected node(s) or selected connection |
| **Scroll** | Zoom canvas |
| **Click + drag on canvas** | Pan |

---

## Data and persistence

All project data — brief, uploaded images, generated cards, collections, and manual connections — is stored in your browser's **localStorage** under the key `design_workspace_v0`. Nothing is sent to a server except the API calls to Gemini during generation.

Clearing browser storage will erase your project. If you want to back up your work, export your brief and key card content manually before clearing.
