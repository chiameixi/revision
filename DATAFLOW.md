# Design Workspace — Data Flow Reference

Architecture and data flow reference for researchers and developers working in this codebase.

---

## 1. Layout

The workspace is a single Next.js page (`app/page.tsx`) with one panel:

```
┌──────────────────────────────────────────────────────┐
│  ReVision wordmark  │  Tree · Collections view tabs  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CenterPanel                                         │
│  View toggle → Tree | Collections                    │
│                                                      │
│  Tree:        ReactFlow canvas (inputs + result nodes)│
│  Collections: cards grouped by collection (Clusters) │
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
├─ state.generations (filtered by dismissed)→ CenterPanel → Tree/Collections
├─ state.collections                        → TreeView (color halos, picker)
├─ state.manualEdges                        → TreeView (dashed manual connections)
│
├─ isGenerating / generatingAction          → CenterPanel (spinner)
├─ dismissed: Record<genId, Set<cardId>>    → visibleGenerations memo
├─ composer: ComposerState                  → CallComposerModal
├─ hoveredSourceIds: Set<cardId>            → TreeView (ancestor highlight)
└─ backupBanner: boolean                    → amber banner when restored from backup
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
| `title` | 2–5 word plain label — no poetic flourishes |
| `description` | Abstract intention or meaning, not a visual prescription |
| `rationale` | Why it is promising |

Produced by: `unpack_brief`, `analyze` (concept sub-array).

### MotifCard (`type: "motif"`)

| Field | Description |
|---|---|
| `title` | Motif name |
| `visualQuality` | How it manifests visually |
| `howItConveysIdea` | Why it works for the concept |
| `category` | color / texture / form / composition / subject / style / typography |

Produced by: `analyze` (motif sub-array).

### VisualCard (`type: "visual"`)

| Field | Description |
|---|---|
| `dimensionLabel` | Arnheim dimension name or concept title |
| `analysisText` | Short model analysis |
| `imageDataUrl` | Base64 data URL of generated image — **stripped before localStorage write** |
| `imageMimeType` | MIME type |
| `error` | Per-card error string if generation failed |

Produced by: `visual_variations`, `conceptual_variations`.

### NoteCard (`type: "note"`)

| Field | Description |
|---|---|
| `title` | Short title |
| `body` | Free-text body |

Produced by: `user_added` (manual node creation and duplicates).

**Reclassify:** User-added cards (any type) can be reclassified between `concept`, `motif`, and `note` from the detail panel. Field mapping: `body ↔ description ↔ visualQuality`, `rationale ↔ howItConveysIdea`.

---

## 5. Action types

| Action ID | Toolbar label | Model | Output |
|---|---|---|---|
| `unpack_brief` | Unpack Brief | gemini-2.5-flash (JSON) | ConceptCard[] 5–8 |
| `analyze` | Analyze | gemini-2.5-flash (JSON + images) | ConceptCard[] + MotifCard[] |
| `visual_variations` | Visual Variations | gemini-2.5-flash-image (REST, parallel) | VisualCard[] one per dimension |
| `conceptual_variations` | Conceptual Variations | gemini-2.5-flash-image (REST, parallel) | VisualCard[] one per concept |
| `user_added` | — (programmatic) | — | NoteCard |

`visual_variations` and `conceptual_variations` use `Promise.allSettled` — one REST call per dimension/concept runs in parallel; a failed call produces an error VisualCard without crashing the batch.

**Client-side guard:** `conceptual_variations` requires at least one ConceptCard selected. `page.tsx` checks this before sending the request and creates a local error generation rather than hitting the API.

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
  • Concept cards preview (conceptual_variations only)
  • Free-text "Additional Instructions" textarea
    │
User clicks "Send →"
    │
    ▼
handleSend(composerState)  [page.tsx]
  • Client-side guard: conceptual_variations with no conceptCards → local error gen, return
  • Closes modal, sets isGenerating=true
  • Resolves asset data URLs from includedDraftIds / includedReferenceIds
  • Builds typedContext (formatConceptForContext, formatMotifForContext, formatVisualForContext)
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
  • Tree: new nodes added at depth = max(parent depths) + 1
  • Collections: new cards appear under their collection (if any)
```

---

## 7. Canvas node selection as context

Nodes are selected via **lasso drag** (always on — drag on empty canvas area draws a selection box) or **Shift-click** to add individual nodes. **Space + drag** pans instead of selecting.

```
User lasso-drags or shift-clicks nodes on canvas
    │
    ▼
onSelectionChange({ nodes })  →  setMultiSelectedIds  [TreeView local state]
    │ (idempotency guard: no-op when IDs unchanged)
    ▼
multiSelectedIds: Set<string>  used in multi-select action bar + collection picker
    │
    ▼
handleActionClick(action, [...multiSelectedIds])  [page.tsx]
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
  selectedCards split by type → typedContext / conceptCards
  → stored on generation as sourceCardIds (provenance)
```

Multi-node drag: all `selected: true` nodes in ReactFlow move together. `onNodeDragStop(evt, node, draggedNodes)` receives all dragged nodes in the third argument; positions are saved to `positionOverrides` for all of them.

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
  Card type = "note"; can be reclassified to concept/motif from detail panel
```

---

## 10. Manual connections

```
User enters connect mode (Connect button, top-right of canvas)
  nodesConnectable=true on ReactFlow
  Handles become visible on all nodes
  All nodes have both target (left) and source (right) handles,
  including Brief, Draft, and Reference input nodes.
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
User lasso/shift-clicks nodes → Collection → [pick or create]
    │
    ▼
onAddCardsToCollection(collectionId, [...multiSelectedIds])
    │
    ▼
actions.addCardsToCollection adds card IDs to collection.cardIds (deduped)
    │
    ▼
cardCollectionsMap useMemo: cardId → string[] (hex colors)  [TreeView]
  Used to assign collectionColors to rfNodes data
    │
    ▼
Visual indicators when ◉ Collections toggle is on:
  Text/chip/note nodes:
    border color = primaryColor (first collection)
    tiny dot cluster (w-[3px] h-[3px], gap-[1px]) in top-left / inline
  Visual (image) nodes:
    3px solid left-border stripe in primaryColor
  SVG halo overlay: one <g> per collection, blurred circle per member
  Export PNG: "Include collection colors" checkbox in hover dropdown
    forces colors into DOM, waits 2 rAF frames, captures, restores
    │
    ▼
Collections view: one column per collection, cards listed inside
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
   • Chip node (concept/motif): CHIP_W=160   chipHeight(title) — estimated from title length
   • Note node:                 NODE_W=140   noteHeight(title) — estimated from title length
   • Visual node:               VISUAL_NODE_W=320  VISUAL_NODE_H=200
   • Asset (draft) node:        INPUT_NODE_W=320   VISUAL_NODE_H=200
   • Asset (ref) node:          INPUT_NODE_W=320   ASSET_NODE_H=200  (same visual format)

5. Vertical centering: each column is centred relative to the tallest column.

6. Horizontal position: x = PAD + INPUT_X_OFFSET + depth × COL_STRIDE
   COL_STRIDE = VISUAL_NODE_W + COL_GAP = 320 + 96 = 416 px

7. Edge list: one provenance edge per parent card ID that exists in the layout.
   Off-tree parents and asset-to-card edges are drawn separately from the
   inputRfEdges memo.
```

`chipHeight` and `noteHeight` estimate rendered height from title character count to keep ReactFlow's dimension hints in sync with actual DOM height. Mismatches cause handle centering bugs (the "wonky connection points" issue).

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
Primary key:  "design_workspace_v0"
Backup key:   "design_workspace_v0_backup"
```

**Write strategy:**

- `imageDataUrl` is stripped from all VisualCards before serialisation (`stripImagesFromState`), keeping the localStorage footprint small and preventing quota exhaustion.
- Primary key is written on every state change.
- Backup key is written every 30 seconds via `setInterval`.

**Lifecycle:**

1. On mount, `useEffect` tries the **primary** key. If `JSON.parse` fails, falls back to the **backup** key. If both fail, returns `DEFAULT_STATE`.
2. `restoredFromBackup: boolean` is exposed from `useProject()` — `page.tsx` shows an amber banner when true.
3. A `skipNextSaveRef` flag prevents the save effect from firing immediately after hydration, which would overwrite a still-corrupt primary key with `DEFAULT_STATE`.
4. After the first skip, subsequent state changes write normally.

**Adding new fields:** Add to `DEFAULT_STATE`. `loadFromStorage` does `{ ...DEFAULT_STATE, ...JSON.parse(raw) }`, so existing stored state picks up new fields automatically.
