# I/O Paths — Design Workspace

All generation actions share the same POST `/api/generate` endpoint.
The request envelope is `GenerateRequest`; the response is `GenerateResponse { cards }`.

---

## Shared envelope

```
GenerateRequest {
  action          : ActionType
  brief           : string            ← always included as background context
  userInstructions: string
  draftDataUrls   : string[]          ← user-selected draft images
  referenceDataUrls: string[]         ← user-selected reference images
  dimensionIds    : string[]          ← only used by visual_variations
  typedContext    : {                 ← canvas node selection, split by card type
    concepts : string[]              ← ConceptCard summaries ("direction to build on")
    motifs   : string[]              ← MotifCard summaries  ("visual language to maintain")
    visuals  : { text, imageDataUrl?,  ← VisualCard text + actual image data
                 imageMimeType? }[]
    notes    : string[]              ← NoteCard bodies
  }
  conceptCards?   : ConceptCardRef[] ← only for conceptual_variations (concepts to render)
}
```

### How canvas selection maps to the envelope

```
selected cards on canvas
  │
  ├─ type = "concept" ──┬─[action ≠ conceptual_variations]──▶ typedContext.concepts
  │                     └─[action = conceptual_variations] ──▶ conceptCards  (rendered)
  │
  ├─ type = "motif"  ───────────────────────────────────────▶ typedContext.motifs
  │
  ├─ type = "visual" ───────────────────────────────────────▶ typedContext.visuals
  │                                                           (text + imageDataUrl)
  │
  └─ type = "note"   ───────────────────────────────────────▶ typedContext.notes
```

---

## 1 — Unpack Brief

```
┌─────────────────────────────────────────────┐
│  IN                                         │
│  brief           ●  required, primary input │
│  typedContext                               │
│    .concepts     ○  "directions explored"   │
│    .motifs       ○  "visual language"       │
│    .notes        ○                          │
│  userInstructions○                          │
│                                             │
│  NOT USED: images, dimensionIds             │
└───────────────────┬─────────────────────────┘
                    │  gemini-2.5-flash (JSON)
                    ▼
┌─────────────────────────────────────────────┐
│  OUT                                        │
│  ConceptCard[]  (5–8)                       │
│    title, description, rationale            │
└─────────────────────────────────────────────┘
```

**Intent:** Unpack the brief into distinct concept directions.
Model avoids repeating directions already in `typedContext.concepts`.

---

## 2 — Analyze

```
┌─────────────────────────────────────────────┐
│  IN                                         │
│  draftDataUrls   ◐  at least one image req  │
│  referenceDataUrls◐ (any mix of drafts+refs)│
│  brief           ●  always included         │
│  typedContext                               │
│    .concepts     ○  "already identified"    │
│    .motifs       ○  "already found, extend" │
│    .notes        ○                          │
│  userInstructions○                          │
│                                             │
│  NOT USED: dimensionIds, conceptCards       │
└───────────────────┬─────────────────────────┘
                    │  gemini-2.5-flash (JSON, dual schema)
                    ▼
┌─────────────────────────────────────────────┐
│  OUT  (mixed in same generation)            │
│  ConceptCard[]  (3–5)                       │
│    title, description, rationale            │
│  MotifCard[]    (4–7)                       │
│    title, visualQuality,                    │
│    howItConveysIdea, category               │
└─────────────────────────────────────────────┘
```

**Intent:** Extract both concept-level interpretations and visual motifs from images.
Single JSON call; model returns `{ concepts: [...], motifs: [...] }`.

---

## 3 — Visual Variations

```
┌──────────────────────────────────────────────────┐
│  IN                                              │
│  draftDataUrls[0]  ●  primary analysis image     │
│  draftDataUrls[1+] ○  extra style refs           │
│  referenceDataUrls ○  style refs                 │
│  brief             ●  substituted as [A CONCEPT] │
│  dimensionIds      ●  which Arnheim dims to run  │
│                       (default: all 9)           │
│  typedContext                                    │
│    .concepts       ○  conceptual direction       │
│    .motifs         ○  visual language            │
│    .notes          ○                             │
│  userInstructions  ○                             │
│                                                  │
│  NOT USED: conceptCards                          │
└──────────────────┬───────────────────────────────┘
                   │  gemini-2.5-flash-image (parallel, 1 call per dim)
                   ▼
┌──────────────────────────────────────────────────┐
│  OUT  VisualCard[]  (one per selected dimension) │
│    title          = "<Dim> Variation"            │
│    dimensionLabel = dim name                     │
│    analysisText   = 2–3 sentence analysis        │
│    imageDataUrl   = 5×3 variation panel          │
└──────────────────────────────────────────────────┘

         dim₁ ──▶ call ──▶ VisualCard
         dim₂ ──▶ call ──▶ VisualCard   Promise.allSettled
         dim₃ ──▶ call ──▶ VisualCard   (failures → error card)
         ...
```

**Intent:** Analyse how a draft expresses the brief across each Arnheim dimension,
then generate a 5×3 variation panel that deliberately strengthens that dimension.

---

## 4 — Conceptual Variations

```
┌──────────────────────────────────────────────────────┐
│  IN                                                  │
│  conceptCards      ●  required; from ConceptCard     │
│                       canvas selection               │
│  draftDataUrls     ○  style reference images         │
│  referenceDataUrls ○  style reference images         │
│  brief             ●  thematic grounding             │
│  typedContext                                        │
│    .motifs         ○  visual language constraints    │
│    .visuals        ○  text + images of territory     │
│                       already explored               │
│    .notes          ○                                 │
│  userInstructions  ○                                 │
│                                                      │
│  NOT USED: dimensionIds                              │
│  NOTE: typedContext.concepts not used here           │
│        (concepts come through conceptCards instead)  │
└───────────────────────┬──────────────────────────────┘
                        │
                        │  style images =
                        │    draftDataUrls
                        │  + referenceDataUrls
                        │  + typedContext.visuals[].imageDataUrl
                        │
                        │  gemini-2.5-flash-image (parallel, 1 call per concept)
                        ▼
┌──────────────────────────────────────────────────────┐
│  OUT  VisualCard[]  (one per selected ConceptCard)   │
│    title          = concept title                    │
│    dimensionLabel = concept title                    │
│    analysisText   = concept description              │
│    imageDataUrl   = 2×2 image panel                  │
└──────────────────────────────────────────────────────┘

         concept₁ ──▶ call (+ all style images) ──▶ VisualCard
         concept₂ ──▶ call (+ all style images) ──▶ VisualCard   Promise.allSettled
         concept₃ ──▶ call (+ all style images) ──▶ VisualCard
```

**Intent:** Render 4 visual interpretations of each user-supplied concept.
MotifCards in selection constrain the visual language ("maintain these motifs").
VisualCards in selection (with images) show territory already explored.
Draft + ref images set the visual style / medium.

**How to trigger from a ConceptCard:** Click "Generate Visuals" on any ConceptCard —
this pre-selects that card and opens the Conceptual Variations modal.

---

## Card type semantics (context roles)

```
┌─────────────┬───────────────────────────────────────────────────────┐
│ Card type   │ Role when selected as context                         │
├─────────────┼───────────────────────────────────────────────────────┤
│ ConceptCard │ → typedContext.concepts (unpack/analyze/visual_var)   │
│             │ → conceptCards to render (conceptual_variations)       │
├─────────────┼───────────────────────────────────────────────────────┤
│ MotifCard   │ → typedContext.motifs — visual language to maintain   │
├─────────────┼───────────────────────────────────────────────────────┤
│ VisualCard  │ → typedContext.visuals — analysis text + image data   │
│             │   image passed to model for conceptual_variations      │
├─────────────┼───────────────────────────────────────────────────────┤
│ NoteCard    │ → typedContext.notes                                  │
└─────────────┴───────────────────────────────────────────────────────┘
```

---

## Prompt context injection order (inside each handler)

```
[system prompt from prompts.txt]

Brief: <brief>

Conceptual directions to build on:    ← typedContext.concepts
  1. [concept] Title
     Description: …

Visual language / motifs to maintain: ← typedContext.motifs
  1. [motif] Title
     Visual quality: …

Visuals already explored:             ← typedContext.visuals (text only)
  1. [visual] Title …

User notes:                           ← typedContext.notes

Additional instructions: …            ← userInstructions

[action-specific instructions + schema]
```

---

## Models

| Action               | Model                   | Output modality |
|----------------------|-------------------------|-----------------|
| unpack_brief         | gemini-2.5-flash        | JSON            |
| analyze              | gemini-2.5-flash        | JSON            |
| visual_variations    | gemini-2.5-flash-image  | TEXT + IMAGE    |
| conceptual_variations| gemini-2.5-flash-image  | TEXT + IMAGE    |

`visual_variations` and `conceptual_variations` use direct REST (not the SDK)
because `responseModalities` is not exposed in `@google/genai`'s typed config.
Both use `Promise.allSettled` — a failed item produces an error card without
cancelling the rest of the batch.
