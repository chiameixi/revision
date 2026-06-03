# Design Workspace — Data Flow Reference

This document is a guide to the architecture and data flow of the design
workspace prototype for researchers and developers new to the codebase.

---

## 1. Three-Panel Layout

The workspace is a single Next.js page (`app/page.tsx`) that renders three
fixed-height panels side-by-side.

```
┌──────────────────┬──────────────────────────────────┬──────────────────┐
│  InputsSidebar   │         CenterPanel              │ HighlightsPanel  │
│  (w-72, left)    │   (flex-1, centre)               │  (w-72, right)   │
│                  │                                  │                  │
│  Project title   │  Action toolbar                  │  Saved cards     │
│  Design brief    │  View toggle (Feed/Tree/Cluster) │  Pin / Include   │
│  Draft images    │  Generation feed / Tree / Cluster│  Researcher note │
│  Reference images│                                  │  + Note button   │
└──────────────────┴──────────────────────────────────┴──────────────────┘
```

### State ownership

All persistent state lives in `useProject()` (`src/lib/store.ts`) and is
serialised to `localStorage`.  `app/page.tsx` holds transient UI state
(modal open/closed, hover highlights, dismissed cards) and passes slices down
as props:

```
page.tsx
│
├─ state.{title, brief, assets}          → InputsSidebar
├─ state.{generations, highlights}       → CenterPanel
│     (generations filtered by dismissed set)
├─ state.highlights                      → HighlightsPanel
│
├─ hoveredSourceIds                      → HighlightsPanel (amber border)
├─ hoveredAssetIds                       → InputsSidebar (amber border)
│     ↑ both set when user hovers a result block in CenterPanel
│
└─ composer (ComposerState)              → CallComposerModal
```

No state flows upward through props; children call callback props
(`onActionClick`, `onSaveCard`, `onAddAsset`, etc.) which mutate the store
through the `actions` object.

---

## 2. The Three Card Types

Every result from an API call is a `ResultCard`, a discriminated union:

### ConceptCard (`type: "concept"`)

Abstract design direction or idea — what the design is *about*.

| Field | Description |
|---|---|
| `title` | 3–6 word name for the direction |
| `description` | What this concept means for the design |
| `rationale` | Why this direction is promising |

Produced by: `unpack_brief`, `conceptual_variations`.

### MotifCard (`type: "motif"`)

Reusable visual quality extracted from uploaded images.  Bridges the gap
between visual observation and conceptual intent.

| Field | Description |
|---|---|
| `title` | 2–5 word name of the motif |
| `visualQuality` | What it looks like in the image |
| `howItConveysIdea` | What concept or feeling this quality communicates |
| `category` | One of: color / texture / form / composition / subject / style / typography |

Produced by: `analyze`.

### VisualCard (`type: "visual"`)

A model-generated image paired with a short analysis.  The `imageDataUrl`
field is a base64 data URL (e.g. `data:image/png;base64,...`) constructed in
the route handler from the raw bytes returned by Gemini.

| Field | Description |
|---|---|
| `dimensionLabel` | Arnheim dimension name (Visual Variations) or concept title (Generate Concept Visuals) |
| `analysisText` | 2–3 sentence model analysis of the dimension/concept |
| `imageDataUrl` | Full data URL of the generated image (may be absent if generation failed) |
| `error` | Error message if this individual card failed |

Produced by: `visual_variations`, `generate_concept_visuals`.

---

## 3. The Six Action Types

| Action ID | Toolbar label | Model | Output cards | Images required |
|---|---|---|---|---|
| `unpack_brief` | Unpack Brief | gemini-2.5-flash (JSON) | ConceptCard[] (5–8) | No |
| `analyze` | Analyze | gemini-2.5-flash (JSON + images) | MotifCard[] (5–9) | Draft and/or Reference |
| `visual_variations` | Visual Variations | gemini-2.5-flash-image (REST, parallel) | VisualCard[] (one per dimension) | Draft (1st image used) |
| `conceptual_variations` | Conceptual Variations | gemini-2.5-flash (JSON + images) | ConceptCard[] (4–6) | Optional draft + refs |
| `generate_concept_visuals` | (from ConceptCard button) | gemini-2.5-flash-image (REST, parallel) | VisualCard[] (one per concept) | Optional draft as style ref |
| `user_added` | — (programmatic) | — | NoteCard[] | No |

`visual_variations` and `generate_concept_visuals` use `Promise.allSettled`
to run one Gemini image-generation call per dimension/concept in parallel.
A failed individual call produces an error VisualCard without crashing the
batch.

---

## 4. Full API Call Lifecycle

```
User clicks toolbar button (e.g. "Analyze")
        │
        ▼
handleActionClick(action)  [page.tsx]
  • Collects default draft/reference IDs for this action
  • Collects included highlight IDs (those with includeInNextCall=true)
  • Opens CallComposerModal with ComposerState
        │
        ▼
CallComposerModal renders
  • Shows brief preview (read-only)
  • Shows draft/reference image toggles (clickable to include/exclude)
  • Shows Arnheim dimension checkboxes (only for visual_variations)
  • Shows highlights checklist (all, pre-checked by includeInNextCall)
  • Free-text "Additional Instructions" textarea
        │
  User clicks "Send →"
        │
        ▼
handleSend(composerState)  [page.tsx]
  • Closes modal, sets isGenerating=true
  • Resolves asset data URLs from included IDs
  • Converts included highlights → plain-text summaries (formatHighlightForContext)
  • Collects sourceCardIds (highlight card IDs, for provenance)
  • Builds GenerateRequest and POST /api/generate
        │
        ▼
POST /api/generate  [app/api/generate/route.ts]
  • Parses body as GenerateRequest
  • Dispatches to the matching handler function
  • Handler builds prompt (with highlight context + user instructions injected)
  • Calls Gemini (JSON mode or image REST)
  • Maps raw model output → typed ResultCard[]
  • Writes artefacts to logs/ directory
  • Returns GenerateResponse { cards, error? }
        │
        ▼
Back in page.tsx
  • Wraps cards in a Generation object (id, actionType, createdAt,
    sourceCardIds, includedDraftIds, includedReferenceIds)
  • Calls actions.addGeneration(gen)  → prepends to state.generations
  • Sets isGenerating=false
        │
        ▼
CenterPanel re-renders
  • Feed view: new GenerationBlock appears at top
  • Tree view: new nodes added at appropriate BFS depth
  • Cluster view: new cards appear in their type cluster
```

---

## 5. Highlights Feed-Back Loop

Highlights are the mechanism for steering subsequent calls with earlier
results.

```
User saves a card (clicks "Save" button or drags to HighlightsPanel)
        │
        ▼
actions.saveHighlight(card)  [store.ts]
  Creates Highlight {
    id, card, note: "", pinned: false,
    orderIndex, includeInNextCall: true   ← defaults to included
  }
        │
        ▼
HighlightsPanel shows the card with an "Include" checkbox (checked)
        │
User toggles the checkbox → actions.toggleHighlightInclude(id)
        │
        ▼
Next time an action is triggered:
  handleActionClick reads state.highlights.filter(h => h.includeInNextCall)
  → these IDs pre-populate ComposerState.includedHighlightIds

In the modal the researcher can uncheck individual highlights.

On Send:
  includedHighlights.map(formatHighlightForContext)
  → plain-text summaries injected into the model prompt under
    "Saved ideas to consider:"
  → highlight card IDs recorded as generation.sourceCardIds
```

The `sourceCardIds` on a generation enable the provenance hover effect:
mousing over a result block in the Feed highlights the contributing highlights
with an amber border in HighlightsPanel.

---

## 6. "Use as Reference Input" Flow

Generated images can be fed back as reference inputs for later analysis.

```
VisualCard (in Feed or Tree/Cluster detail panel)
  "Use as Reference Input" / "+ Use as Input" button
        │
        ▼
onAddAsReference(dataUrl, dimensionLabel)  [page.tsx]
  Creates Asset {
    id: uuid,
    type: "reference",
    fileName: `${dimensionLabel} (generated)`,
    dataUrl,          ← the original base64 data URL
    note: ""
  }
  Calls actions.addAsset(asset)
        │
        ▼
state.assets gains the new reference
        │
        ▼
InputsSidebar re-renders, shows the image in the References grid
        │
        ▼
Next Analyze or Conceptual Variations call can include this image
```

This closes the loop: generated images influence future concept extraction,
enabling iterative refinement guided by what the model itself produced.

---

## 7. TreeView Layout Algorithm

`computeLayout` in `src/components/TreeView.tsx` produces an x/y position
for every card using the following steps:

```
1. Flatten all generations into entries (oldest first — generations are
   stored newest-first, so they are reversed before processing).

2. BFS depth assignment:
   - Cards with no sourceCardIds, or whose parents are not in the current
     session, are roots at depth 0.
   - Iteratively propagate: depth(card) = max(depth(parents)) + 1.
   - The while loop repeats until no new depths are assigned (handles
     arbitrary DAG shapes; cycles fall back to depth 0).

3. Group entries by depth into columns.

4. Measure column height: sum of node heights + row gaps.
   - Text nodes:   NODE_W=168  NODE_H=76
   - Visual nodes (with image):  VISUAL_NODE_W=224  VISUAL_NODE_H=132

5. Vertical centering: each column is centred relative to the tallest column
   so short columns align to the middle rather than the top.

6. Horizontal positioning: columns are placed at x = PAD + depth × COL_STRIDE.
   COL_STRIDE = VISUAL_NODE_W + COL_GAP = 224 + 96 = 320px.
   Using the wider visual node as the stride prevents text and image nodes
   in adjacent columns from overlapping horizontally.

7. Edge list: for each entry, one edge is added per parent card ID that
   exists in the layout (off-tree parents are not drawn as edges).

SVG edges are cubic Bézier curves:
  M (right midpoint of from-node)
  C (horizontal midpoint, same y as from)
    (horizontal midpoint, same y as to)
  (left midpoint of to-node)
```

---

## 8. localStorage Persistence

`useProject()` in `src/lib/store.ts` manages all persistence.

```
Key:  "design_workspace_v0"
Value: JSON.stringify(ProjectState)

ProjectState {
  title: string
  brief: string
  assets: Asset[]          ← includes full base64 data URLs
  generations: Generation[] ← includes all ResultCards (VisualCards have imageDataUrl)
  highlights: Highlight[]
}
```

**Storage lifecycle:**

1. On first render, `useEffect` reads `localStorage` and calls `setState`.
   `ready` is set to `true` after hydration to prevent a flash of empty state.

2. A second `useEffect` watches `[state, ready]` and writes the full state
   to `localStorage` on every change (when `ready=true`).

3. Writes are wrapped in a try/catch so a full `localStorage` quota
   (common when many large images are stored) silently degrades rather than
   crashing the app.

**Storage caveats:**

- Base64 images are large. A project with several Visual Variation batches can
  easily reach tens of MB. Browsers typically allow 5–10 MB per origin;
  exceeding this causes silent write failures.
- There is no migration path between storage key versions. Changing
  `STORAGE_KEY` produces a fresh empty state for existing users.
- All state is stored in one key, so a partial update to `title` still
  serialises the entire project including all image bytes.
