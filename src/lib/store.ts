"use client";

/**
 * src/lib/store.ts
 *
 * Responsibility: The single global state hook for the workspace.
 *
 * `useProject()` exposes `{ state, actions, ready }`.  All project data —
 * brief, uploaded assets, generation history, and saved highlights — lives in
 * one `ProjectState` object that is hydrated from `localStorage` on first
 * render and written back on every state change.
 *
 * Design decisions:
 * - State is stored in a single localStorage key (`design_workspace_v0`) so
 *   the whole project survives page reloads without a backend.
 * - `ready` starts as `false` to prevent the server render from showing stale
 *   default state before hydration completes (avoids a flash of empty content).
 * - `update` is a thin wrapper around `setState` that accepts a pure function,
 *   keeping every action immutable and easy to trace.
 * - Newly saved highlights default `includeInNextCall: true` so they are
 *   immediately offered to the next API call.
 * - `saveHighlight` is a no-op when the card is already saved (deduplicates by
 *   card ID, not highlight ID).
 * - `updateCard` patches the card both inside `generations` and inside any
 *   matching `highlights` so an in-place edit propagates everywhere.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ProjectState,
  Asset,
  Collection,
  Generation,
  Highlight,
  ManualEdge,
  ResultCard,
} from "@/types";

const STORAGE_KEY = "design_workspace_v0";
const BACKUP_KEY = "design_workspace_v0_backup";
const BACKUP_INTERVAL_MS = 30_000;

const DEFAULT_STATE: ProjectState = {
  title: "Untitled Project",
  brief: "",
  assets: [],
  generations: [],
  highlights: [],
  collections: [],
  manualEdges: [],
};

function tryParse(raw: string | null): ProjectState | null {
  if (!raw) return null;
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function loadFromStorage(): { state: ProjectState; usedBackup: boolean } {
  if (typeof window === "undefined") return { state: DEFAULT_STATE, usedBackup: false };
  const primary = tryParse(localStorage.getItem(STORAGE_KEY));
  if (primary) return { state: primary, usedBackup: false };
  const backup = tryParse(localStorage.getItem(BACKUP_KEY));
  if (backup) return { state: backup, usedBackup: true };
  return { state: DEFAULT_STATE, usedBackup: false };
}

function stripImagesFromState(state: ProjectState): ProjectState {
  return {
    ...state,
    generations: state.generations.map((gen) => ({
      ...gen,
      cards: gen.cards.map((card) =>
        card.type === "visual" ? { ...card, imageDataUrl: "" } : card
      ),
    })),
    highlights: state.highlights.map((h) =>
      h.card.type === "visual"
        ? { ...h, card: { ...h.card, imageDataUrl: "" } }
        : h
    ),
  };
}

function saveToStorage(state: ProjectState, key = STORAGE_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(stripImagesFromState(state)));
  } catch {
    // Storage still full after stripping images — silently degrade
  }
}

export function useProject() {
  const [state, setState] = useState<ProjectState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [restoredFromBackup, setRestoredFromBackup] = useState(false);
  // Prevents the save that fires immediately after hydration from overwriting
  // localStorage with DEFAULT_STATE when the initial JSON.parse fails.
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    const { state: loaded, usedBackup } = loadFromStorage();
    setState(loaded);
    if (usedBackup) setRestoredFromBackup(true);
    setReady(true);
  }, []);

  // Primary save on every state change
  useEffect(() => {
    if (!ready) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveToStorage(state);
  }, [state, ready]);

  // Periodic backup every 30s — independent of the primary save
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => saveToStorage(state, BACKUP_KEY), BACKUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state, ready]);

  const update = useCallback(
    (fn: (prev: ProjectState) => ProjectState) => setState(fn),
    []
  );

  const actions = {
    setTitle: (title: string) => update((s) => ({ ...s, title })),
    setBrief: (brief: string) => update((s) => ({ ...s, brief })),

    addAsset: (asset: Asset) =>
      update((s) => ({ ...s, assets: [...s.assets, asset] })),
    removeAsset: (id: string) =>
      update((s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) })),
    updateAssetNote: (id: string, note: string) =>
      update((s) => ({
        ...s,
        assets: s.assets.map((a) => (a.id === id ? { ...a, note } : a)),
      })),

    addGeneration: (gen: Generation) =>
      update((s) => ({ ...s, generations: [gen, ...s.generations] })),

    saveHighlight: (card: ResultCard) =>
      update((s) => {
        if (s.highlights.some((h) => h.card.id === card.id)) return s;
        const newH: Highlight = {
          id: crypto.randomUUID(),
          card,
          note: "",
          pinned: false,
          orderIndex: s.highlights.length,
          includeInNextCall: true,
        };
        return { ...s, highlights: [...s.highlights, newH] };
      }),

    removeHighlight: (id: string) =>
      update((s) => ({
        ...s,
        highlights: s.highlights.filter((h) => h.id !== id),
      })),

    toggleHighlightInclude: (id: string) =>
      update((s) => ({
        ...s,
        highlights: s.highlights.map((h) =>
          h.id === id ? { ...h, includeInNextCall: !h.includeInNextCall } : h
        ),
      })),

    toggleHighlightPin: (id: string) =>
      update((s) => ({
        ...s,
        highlights: s.highlights.map((h) =>
          h.id === id ? { ...h, pinned: !h.pinned } : h
        ),
      })),

    updateHighlightNote: (id: string, note: string) =>
      update((s) => ({
        ...s,
        highlights: s.highlights.map((h) =>
          h.id === id ? { ...h, note } : h
        ),
      })),

    updateCard: (card: ResultCard) =>
      update((s) => ({
        ...s,
        generations: s.generations.map((gen) => ({
          ...gen,
          cards: gen.cards.map((c) => (c.id === card.id ? card : c)),
        })),
        highlights: s.highlights.map((h) =>
          h.card.id === card.id ? { ...h, card } : h
        ),
      })),

    removeProvenanceEdge: (fromId: string, toCardId: string) =>
      update((s) => ({
        ...s,
        generations: s.generations.map((gen) => {
          if (!gen.cards.some((c) => c.id === toCardId)) return gen;
          if (fromId.startsWith("__asset_")) {
            const assetId = fromId.replace("__asset_", "");
            return {
              ...gen,
              includedDraftIds: (gen.includedDraftIds ?? []).filter((id) => id !== assetId),
              includedReferenceIds: (gen.includedReferenceIds ?? []).filter((id) => id !== assetId),
            };
          }
          return { ...gen, sourceCardIds: (gen.sourceCardIds ?? []).filter((id) => id !== fromId) };
        }),
      })),

    addManualEdge: (edge: ManualEdge) =>
      update((s) => ({
        ...s,
        manualEdges: s.manualEdges.some(
          (e) => e.fromCardId === edge.fromCardId && e.toCardId === edge.toCardId
        ) ? s.manualEdges : [...s.manualEdges, edge],
      })),

    removeManualEdge: (id: string) =>
      update((s) => ({
        ...s,
        manualEdges: s.manualEdges.filter((e) => e.id !== id),
      })),

    adoptChildGenerations: (originalCardId: string, newCardId: string) =>
      update((s) => ({
        ...s,
        generations: s.generations.map((gen) =>
          gen.sourceCardIds?.includes(originalCardId)
            ? { ...gen, sourceCardIds: [...gen.sourceCardIds, newCardId] }
            : gen
        ),
      })),

    clearGenerations: () => update((s) => ({ ...s, generations: [] })),

    addCollection: (col: Collection) =>
      update((s) => ({ ...s, collections: [...s.collections, col] })),

    removeCollection: (id: string) =>
      update((s) => ({
        ...s,
        collections: s.collections.filter((c) => c.id !== id),
      })),

    updateCollection: (id: string, patch: Partial<Pick<Collection, "title" | "description" | "color">>) =>
      update((s) => ({
        ...s,
        collections: s.collections.map((c) => c.id === id ? { ...c, ...patch } : c),
      })),

    addCardsToCollection: (collectionId: string, cardIds: string[]) =>
      update((s) => ({
        ...s,
        collections: s.collections.map((c) => {
          if (c.id === collectionId) {
            const existing = new Set(c.cardIds);
            const newIds = cardIds.filter((id) => !existing.has(id));
            return { ...c, cardIds: [...c.cardIds, ...newIds] };
          }
          return c;
        }),
      })),

    moveCardToCollection: (cardId: string, toCollectionId: string | null) =>
      update((s) => ({
        ...s,
        collections: s.collections.map((c) => {
          if (c.id === toCollectionId) {
            if (c.cardIds.includes(cardId)) return c;
            return { ...c, cardIds: [...c.cardIds, cardId] };
          }
          return c;
        }),
      })),

    removeCardFromCollection: (collectionId: string, cardId: string) =>
      update((s) => ({
        ...s,
        collections: s.collections.map((c) =>
          c.id === collectionId
            ? { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) }
            : c
        ),
      })),

    removeCardFromCollections: (cardId: string) =>
      update((s) => ({
        ...s,
        collections: s.collections.map((c) => ({
          ...c,
          cardIds: c.cardIds.filter((id) => id !== cardId),
        })),
      })),
  };

  return { state, actions, ready, restoredFromBackup };
}
