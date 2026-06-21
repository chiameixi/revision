/**
 * src/types/index.ts
 *
 * Central type definitions for the design workspace.
 *
 * Responsibility: Single source of truth for every data shape that crosses
 * the client/server boundary or is persisted to localStorage.  All action
 * identifiers, card shapes, API request/response envelopes, and UI-state
 * types live here so that route.ts and every component share the same
 * contracts.
 *
 * Design decision: `ResultCard` is a discriminated union keyed on `type`.
 * This lets TypeScript narrow exhaustively in switch statements throughout
 * the UI without casting.
 */

export type ActionType =
  | "unpack_brief"
  | "analyze"
  | "visual_variations"
  | "conceptual_variations"
  | "generate_concept_visuals"
  // | "synthesize"   // reserved – not yet wired up in the toolbar
  | "user_added";

export type CardType =
  | "concept"  // abstract idea or principle, eg "empathy", "whimsical unburdening"
  | "motif"    // reusable visual element, characteristic or theme that helps convey concepts
  | "visual"   // generated visual that embodies concepts and motifs
  | "note";    // user-created default category

export interface BaseCard {
  id: string;
  type: CardType;
  title: string;
  createdAt: string;
}

export interface ConceptCard extends BaseCard {
  type: "concept";
  description: string;  // what this concept means for the design
  rationale: string;    // why this direction is promising
}

export interface MotifCard extends BaseCard {
  type: "motif";
  visualQuality: string;    // what it looks like / how it manifests visually
  howItConveysIdea: string; // why this motif works for the concept
  category: string;         // color | texture | form | composition | subject | style
}

export interface VisualCard extends BaseCard {
  type: "visual";
  dimensionLabel: string;  // dimension name or concept title it visualizes
  analysisText: string;    // brief description / analysis
  imageDataUrl?: string;
  imageMimeType?: string;
  error?: string;
}

export interface NoteCard extends BaseCard {
  type: "note";
  body: string;
}

export type ResultCard = ConceptCard | MotifCard | VisualCard | NoteCard;

export interface Asset {
  id: string;
  type: "draft" | "reference";
  fileName: string;
  dataUrl: string;
  note: string;
}

export interface Highlight {
  id: string;
  card: ResultCard;
  note: string;
  pinned: boolean;
  orderIndex: number;
  includeInNextCall: boolean;
}

export interface Generation {
  id: string;
  actionType: ActionType;
  cards: ResultCard[];
  createdAt: string;
  error?: string;
  /** IDs of highlight cards that were included in the call that produced this generation. */
  sourceCardIds?: string[];
  /** IDs of draft assets that were sent to the model for this generation. */
  includedDraftIds?: string[];
  /** IDs of reference assets that were sent to the model for this generation. */
  includedReferenceIds?: string[];
}

export interface ProjectState {
  title: string;
  brief: string;
  assets: Asset[];
  generations: Generation[];
  highlights: Highlight[];
}

// Concept card reference passed to generate_concept_visuals
export interface ConceptCardRef {
  id: string;
  title: string;
  description: string;
  rationale: string;
}

// API types
export interface GenerateRequest {
  action: ActionType;
  brief: string;
  userInstructions: string;
  draftDataUrls: string[];
  referenceDataUrls: string[];
  highlightSummaries: string[];
  dimensionIds: string[];
  conceptCards?: ConceptCardRef[];
}

export interface GenerateResponse {
  cards: ResultCard[];
  error?: string;
}

// Call composer modal state
export interface ComposerState {
  open: boolean;
  action: ActionType | null;
  includedDraftIds: string[];
  includedReferenceIds: string[];
  includedHighlightIds: string[];
  /** Card IDs being branched from — tracked separately from highlights to avoid async state issues. */
  branchFromCardIds: string[];
  userInstructions: string;
  selectedDimensionIds: string[];
  conceptCards?: ConceptCardRef[];
}
