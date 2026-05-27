# User Guide

design exploration tool. Upload your drafts and references, run structured analysis actions, collect the best ideas as Highlights, and build on them iteratively.

---

## Layout

The workspace has three panels side by side:

| Panel | What it does |
|---|---|
| **Left — Inputs** | Project title, design brief, draft images, reference images |
| **Center — Feed / Tree / Clusters** | Where you run actions and see results |
| **Right — Highlights** | Your saved cards; drives future generations |

---

## Getting started

1. **Write a brief** in the left sidebar — describe your design challenge, users, goals, and constraints.
2. **Upload images** — drag or click *+ Add* under Drafts (your sketches / wireframes) and References (inspiration / style images).
3. **Pick an action** from the toolbar at the top of the center panel and hit Send in the modal that appears.

---

## Actions

Each action opens a **Call Composer modal** where you can review what context is being sent (brief, images, highlights) and add custom instructions before confirming.

| Action | What you get |
|---|---|
| **Unpack Brief** | Insight cards that break down your brief into design directions |
| **Analyze** | Insight cards examining your draft and reference images |
| **Visual Variations** | AI-generated images exploring Arnheim visual dimensions (shape, color, texture, …) |
| **Conceptual Variations** | Cards proposing alternative design concepts seeded from your highlights |
| **Synthesize** | High-level concept cards that combine and reconcile your saved highlights |

---

## Result cards

Cards appear in the center feed after each action. On every card you can:

- **Save to Highlights** (★ button or drag to right panel) — adds it to your working set
- **Dismiss** (×) — removes it from the feed without deleting
- **Generate Concept Visuals** — available on Conceptual Variation cards; spawns visual images for that concept
- **Branch from here** — saves the card as a highlight and immediately opens the composer for a follow-up action

---

## Highlights panel (right)

Highlights are your curated collection. Each one has:

- **Include toggle** — checked cards are sent as context in the next generation call
- **Pin (☆)** — keeps a card at the top of the list
- **Note** — add a free-text annotation
- **Edit (✎)** — edit the card title and main text inline
- **Remove (×)** — removes it from highlights (the original card stays in the feed)

You can also **drag any result card** from the center feed and drop it onto the Highlights panel to save it.

Use the **+ Note** button to write a free-form note directly into Highlights (useful for observations or decisions that didn't come from a generation).

---

## Three views

Switch between views using the row of tabs below the action toolbar.

### Feed
The default chronological view. Each generation is a labeled block showing the action, time, card count, and **source chips** (which highlights, drafts, and references fed into it). Hover over a block to see its sources light up amber in the Highlights panel and the left sidebar.

### Tree
A spatial node graph. Each card is a node; edges show which highlights seeded which generation.

- **Click a node** to open the detail panel on the right (full text, image gallery for visual variations, siblings, branch actions)
- **Hover a node** to amber-highlight its ancestor nodes, the connecting edges, and any source images in the sidebar
- **Drag a node** to the Highlights panel to save it
- **Zoom controls** (bottom-right corner): `−` / `+` to zoom, `1:1` to reset, **Fit** to auto-zoom so all nodes are visible at once

### Clusters
Cards grouped by type (Insights, Visual Variations, Conceptual Variations, Concepts, Notes).

- **Click a card** to open the detail panel with full content, siblings from the same generation, and source information
- **Hover a card** to highlight its source images in the sidebar
- **Drag cards between clusters** to reorganize
- **Create a custom cluster** with the *+ New Cluster* button, then drag cards into it
- **+ Add** in any text cluster to write a new card directly

---

## Source lineage

Every generation tracks which inputs were used:

- **Amber chips** in the feed header = saved highlight cards that were included
- **Grey ✎ chips** = draft images that were sent
- **Blue ◈ chips** = reference images that were sent

Hover any generation row (feed), node (tree), or card (clusters) to see its sources glow:
- **Highlight cards** glow amber in the right Highlights panel
- **Draft / reference images** glow amber in the left Inputs sidebar

In the tree and cluster **detail panels**, a *Sources* section lists all inputs with inline thumbnails.

---

## Iterative workflow

The intended loop:

```
Write brief → Run action → Review cards → Save best to Highlights
→ Toggle which highlights to include → Run next action
→ Cards are now informed by your selections → Repeat
```

The Highlights panel shows `X / Y included` — keep this to the most relevant cards so the model has a focused context.

---

## Tips/limitations

- **Synthesize works best** after you have 3–6 diverse highlights included; it reconciles them into coherent concepts.
- **Visual Variations** let you select which Arnheim dimensions to explore in the composer — uncheck dimensions you don't need.
- **Custom instructions** in the composer modal are a good place to add constraints ("keep it minimal", "target mobile", "avoid dark patterns").
- Use **Fit** in the tree view after a few generations to get the big picture without losing the structure.
- The brief and all cards are saved to `localStorage` automatically — your work persists across page refreshes.
- only highlights can be selected for inclusion into further calls/branching
    - selecting an action from the `branch from here` section in the gallery view automatically adds a card as a highlight, which **you must then select** for it to be included in a call