# Design Workspace — Data Flow Reference

Architecture and data flow reference for researchers and developers working in this codebase.

---

## 1. Layout

The workspace is a single Next.js page (`app/page.tsx`) with one panel:

```
┌──────────────────────────────────────────────────────┐
│  Action toolbar                                      │
│  (Unpack Brief · Analyze · Variations…)              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CenterPanel                                         │
│  View toggle → Feed | Tree | Clusters                │
│                                                      │
│  Feed:     reverse-chron generation blocks           │
│  Tree:     ReactFlow canvas (inputs + result nodes)  │
│  Clusters: cards grouped by collection               │
│                                                      │
│  [Detail panel slides in on right when node selected]│
│                                                      │
└──────────────────────────────────────────────────────┘
```

There is no sidebar and no separate highlights panel. Brief, drafts, and references are **canvas nodes** in the Tree view. The detail panel only renders when a node is selected.

---

## 2. State ownership

All persistent project state lives in `useProject()` (`src/lib/store.ts`) and is serialised to `localStorage`. `app/page.tsx` holds transient UI state and passes slices down as props:

```
page.tsx
│
├─ state.title / state.brief                → TreeView (BriefNode data)
├─ state.assets                             → TreeView (AssetNode data)
├─ state.generations (filtered by dismissed)→ CenterPanel → Feed/Tree/Clusters
├─ state.collections                        → TreeView (color halos, picker)
├─ state.manualEdges                        → TreeView (dashed manual connections)
│
├─ isGenerating / generatingAction          → CenterPanel (spinner)
├─ dismissed: Record<genId, Set<cardId>>    → visibleGenerations memo
├─ composer: ComposerState                  → CallComposerModal
└─ hoveredSourceIds: Set<cardId>            → TreeView (ancestor highlight)
```

No state flows upward through props; children call callback props (`onActionClick`, `onAddAsset`, `onAddManualEdge`, etc.) which update the store through the `actions` object returned by `useProject()`.

---

## 3. ProjectState schema

```ts
ProjectState {
  title:        string
  brief:        string
  assets:       Asset[]          // drafts and references; full base64 dataUrl inline
  generations:  Generation[]     // newest-first; each has cards + provenance metadata
  highlights:   Highlight[]      // saved cards (legacy; not actively used in UX)
  collections:  Collection[]     // named groups with a hex color
  manualEdges:  ManualEdge[]     // user-drawn connections between node IDs
}
```

### Generation

```ts
Generation {
  id:                   string
  actionType:           ActionType
  cards:                ResultCard[]
  createdAt:            string            // ISO timestamp
  error?:               string            // top-level generation error
  sourceCardIds?:       string[]          // canvas node IDs used as context
  includedDraftIds?:    string[]
  includedReferenceIds?: string[]
}
```

`sourceCardIds` drives both the tree layout (parent–child edges) and provenance hover highlighting.

### ManualEdge

```ts
ManualEdge {
  id:          string   // UUID
  fromCardId:  string   // source node ID (card ID, "__brief__", or "__asset_<id>")
  toCardId:    string   // target node ID
}
```

---

## 4. Card types

`ResultCard` is a discriminated union on `type`.

### ConceptCard (`type: "concept"`)

| Field | Description |
|---|---|
| `title` | Short direction name |
| `description` | What this concept means for the design |
| `rationale` | Why it is promising |

Produced by: `unpack_brief`, `conceptual_variations`.

### MotifCard (`type: "motif"`)

| Field | Description |
|---|---|
| `title` | Motif name |
| `visualQuality` | How it manifests visually |
| `howItConveysIdea` | Why it works for the concept |
| `category` | color / texture / form / composition / subject / style / typography |

Produced by: `analyze`.

### VisualCard (`type: "visual"`)

| Field | Description |
|---|---|
| `dimensionLabel` | Arnheim dimension name or concept title |
| `analysisText` | Short model analysis |
| `imageDataUrl` | Base64 data URL of generated image (may be absent on failure) |
| `error` | Per-card error string if generation failed |

Produced by: `visual_variations`, `generate_concept_visuals`.

### NoteCard (`type: "note"`)

| Field | Description |
|---|---|
| `title` | Short title |
| `body` | Free-text body |

Produced by: `user_added` (manual node creation and duplicates).

---

## 5. Action types

| Action ID | Toolbar label | Model | Output | Images |
|---|---|---|---|---|
| `unpack_brief` | Unpack Brief | gemini-2.5-flash (JSON) | ConceptCard[] 5–8 | No |
| `analyze` | Analyze | gemini-2.5-flash (JSON + images) | MotifCard[] 5–9 | Draft + Reference |
| `visual_variations` | Visual Variations | gemini-2.5-flash-image (REST, parallel) | VisualCard[] one per dimension | Draft (optional) |
| `conceptual_variations` | Conceptual Variations | gemini-2.5-flash (JSON + images) | ConceptCard[] 4–6 | Draft + Reference (optional) |
| `generate_concept_visuals` | Generate Concept Visuals | gemini-2.5-flash-image (REST, parallel) | VisualCard[] one per concept | Draft as style ref (optional) |
| `user_added` | — (programmatic) | — | NoteCard | No |

`visual_variations` and `generate_concept_visuals` use `Promise.allSettled` — one REST call per dimension/concept runs in parallel; a failed call produces an error VisualCard without crashing the batch.

---

## 6. Full API call lifecycle

```
User clicks toolbar button (e.g. "Analyze")
    │
    ▼
handleActionClick(action, selectedCardIds)  [page.tsx]
  • Pre-populates includedDraftIds / includedReferenceIds for this action type
  • Resolves selectedCardIds → ResultCard[] for display in composer
  • Opens CallComposerModal with ComposerState
    │
    ▼
CallComposerModal renders
  • Brief preview (read-only)
  • Context cards checklist — nodes selected on canvas, each checkbox toggleable
  • Draft image toggles (for relevant actions)
  • Reference image toggles (for relevant actions)
  • Arnheim dimension pills (visual_variations only)
  • Concept cards preview (generate_concept_visuals only)
  • Free-text "Additional Instructions" textarea
    │
User clicks "Send →"
    │
    ▼
handleSend(composerState)  [page.tsx]
  • Closes modal, sets isGenerating=true
  • Resolves asset data URLs from includedDraftIds / includedReferenceIds
  • Formats selectedCards → plain-text summaries (formatCardForContext)
    → injected into request as highlightSummaries (model prompt field)
  • Builds GenerateRequest, POST /api/generate
    │
    ▼
POST /api/generate  [app/api/generate/route.ts]
  • Parses body as GenerateRequest
  • Dispatches to action handler
  • Handler builds prompt with brief + card context + user instructions
  • Calls Gemini (JSON schema mode or image REST)
  • Maps raw output → typed ResultCard[]
  • Returns GenerateResponse { cards, error? }
    │
    ▼
Back in page.tsx handleSend
  • Wraps cards in Generation {
      id, actionType, cards, createdAt,
      sourceCardIds: cfg.selectedCardIds,
      includedDraftIds, includedReferenceIds
    }
  • actions.addGeneration(gen) → prepended to state.generations
  • isGenerating=false
    │
    ▼
CenterPanel re-renders
  • Feed: new generation block appears at top
  • Tree: new nodes added at depth = max(parent depths) + 1
  • Clusters: new cards appear under their collection (if any)
```

---

## 7. Canvas node selection as context

Selecting canvas nodes before running an action is the primary mechanism for steering the model toward a specific direction.

```
User shift-clicks nodes on canvas
    │
    ▼
multiSelectedIds: Set<string>  [TreeView local state]
    │
    ▼
onSelectionChange(ids)  →  selectedCardIds  [CenterPanel local state]
    │ shown as "N nodes selected as context" hint in toolbar
    ▼
handleActionClick(action, selectedCardIds)  [page.tsx]
    │
    ▼
ComposerState.selectedCardIds = selectedCardIds
    │
    ▼
CallComposerModal shows checked list of selected cards
User can uncheck any before sending
    │
    ▼
On Send:
  selectedCards.map(formatCardForContext)
  → plain-text summaries sent to API as highlightSummaries
  → stored on generation as sourceCardIds (provenance)
```

`formatCardForContext` serialises each card to a compact text block (`[type] title\nfield: value\n…`) which is injected under "Relevant context from canvas:" in the model prompt.

---

## 8. Branch-from flows

### Single-card branch (detail panel or node quick-action)
`onBranchFrom(card, action)` pre-populates the composer with that card as the sole selected context and opens the modal.

If the card is a VisualCard with an image, its `imageDataUrl` is first registered as a new reference asset (`onAddAsReference`), so the image is available to the next action's image payload.

### Multi-card branch (multi-select bar)
`onMultiBranchFrom(cards, action)` additionally auto-converts any selected VisualCards into reference assets before opening the composer, so all selected images are immediately available.

---

## 9. Duplicate and user-added nodes

Both create a `user_added` generation with a single card:

```
Duplicate:
  new card = { ...original, id: newUUID, createdAt: now }
  Generation.sourceCardIds = original.parentCardIds
  actions.adoptChildGenerations(originalId, newId)
    → any generation whose sourceCardIds includes originalId
      also gains newId, so the duplicate inherits children

Add node manually:
  User fills in title + body in the "Add node" modal
  Generation.sourceCardIds = parentIds (selected nodes at time of add, or [])
```

---

## 10. Manual connections

```
User enters connect mode (Connect button, top-right of canvas)
  nodesConnectable=true on ReactFlow
  Handles become visible on all nodes (including brief/asset nodes)
    │
User drags source handle → target handle
    │
    ▼
ReactFlow onConnect(connection)
    │
    ▼
handleConnect  [TreeView]
  onAddManualEdge({ id: UUID, fromCardId: source, toCardId: target })
    │
    ▼
actions.addManualEdge(edge)  [store]
  Dedup check: skips if same fromCardId+toCardId pair already exists
  Appends to state.manualEdges
    │
    ▼
manualRfEdges useMemo recomputes
  Filters: both node IDs must exist in canvas (cardIds, __brief__, __asset_*)
  type: "manualEdge" → ManualEdge custom edge component
  data: { onDelete: () => onRemoveManualEdge(e.id) }
    │
    ▼
Rendered as dashed slate line with ✕ button on hover
```

---

## 11. Collections

```
User shift-clicks nodes → Collection → [pick or create]
    │
    ▼
onAddCardsToCollection(collectionId, [...multiSelectedIds])
    │
    ▼
actions.addCardsToCollection adds card IDs to collection.cardIds (deduped)
    │
    ▼
cardCollectionsMap useMemo: cardId → Collection[]  [TreeView]
  Used to assign collectionColors to rfNodes data
    │
    ▼
If Colors toggle is on:
  SVG halo overlay renders one <g> per collection
  Each member card gets a blurred circle in the collection color
  Multiple collections on one node → overlapping halos (mix-blend-mode: multiply)
    │
    ▼
Cluster view: one column per collection, cards listed inside
```

---

## 12. TreeView layout algorithm

`computeLayout` in `src/components/TreeView.tsx` assigns positions to result-card nodes. Input nodes (brief, assets) have positions independent of this algorithm (stored in `positionOverrides`, defaulting to a fixed left column).

```
1. Flatten visible generations oldest-first (reverse of storage order).

2. BFS depth assignment
   • Roots: cards with no sourceCardIds, or all parents outside the
     current visible set.
   • Iteratively: depth(card) = max(depth(parents)) + 1
   • while loop repeats until no new depths are assigned (handles DAG shapes)
   • Cards still unassigned after the loop fall back to depth 0

3. Group by depth → columns.

4. Column height = sum of node heights + row gaps
   • Text node:   NODE_W=168   NODE_H=76
   • Visual node: VISUAL_NODE_W=224  VISUAL_NODE_H=132

5. Vertical centering: each column is centred relative to the tallest column.

6. Horizontal position: x = PAD + INPUT_X_OFFSET + depth × COL_STRIDE
   COL_STRIDE = VISUAL_NODE_W + COL_GAP = 224 + 96 = 320 px
   Using the wider visual node as stride prevents column overlap.

7. Edge list: one provenance edge per parent card ID that exists in the layout.
   Off-tree parents and asset-to-card edges are drawn separately from the
   inputRfEdges memo.
```

---

## 13. ReactFlow controlled-mode sync

TreeView manages `displayNodes` and `displayEdges` as local state separate from the computed `allRfNodes`/`allRfEdges`. This is required because ReactFlow needs to own position updates during drag via `onNodesChange` + `applyNodeChanges`.

The sync effect uses `existing` as the merge base to preserve ReactFlow's internal node state (measured dimensions, drag flag, etc.):

```ts
setDisplayNodes((current) => {
  const nodeMap = new Map(current.map(n => [n.id, n]));
  return allRfNodes.map(n => {
    const existing = nodeMap.get(n.id);
    if (!existing) return n;                         // new node
    return {
      ...existing,                                   // preserve RF internals
      data: n.data,                                  // update isHovered, connectMode, etc.
      position: existing.dragging                    // keep drag position mid-drag;
        ? existing.position                          // use layout/override pos otherwise
        : n.position,
    };
  });
});
```

Positions are persisted to `positionOverrides: Record<nodeId, {x,y}>` local state on `onNodeDragStop`, which feeds back into `allRfNodes` so the saved position survives re-renders.

---

## 14. localStorage persistence

```
Key:   "design_workspace_v0"
Value: JSON.stringify(ProjectState)
```

**Lifecycle:**

1. On mount, `useEffect` reads storage and calls `setState`. `ready` is set to `true` after hydration to prevent a flash of empty state.
2. A second `useEffect` on `[state, ready]` writes the full state on every change.
3. New fields added to `ProjectState` must also be added to `DEFAULT_STATE`. `loadFromStorage` does `{ ...DEFAULT_STATE, ...JSON.parse(raw) }`, so existing stored state picks up new fields automatically (migration safety).
4. Writes are wrapped in try/catch — a full quota silently degrades rather than crashing.

**Caveats:**

- Base64 images are large. Several visual variation batches can easily exceed the 5–10 MB browser limit, causing silent write failures.
- All state is one key; updating `title` re-serialises every image byte.
- There is no version migration beyond the DEFAULT_STATE spread.
