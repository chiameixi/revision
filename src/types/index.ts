export type ActionType =
  | "unpack_brief"
  | "analyze"
  | "visual_variations"
  | "conceptual_variations"
  | "generate_concept_visuals"
  | "synthesize"
  | "user_added";

export type CardType =
  | "insight"
  | "visual_variation"
  | "conceptual_variation"
  | "concept"
  | "note";

export interface BaseCard {
  id: string;
  type: CardType;
  title: string;
  createdAt: string;
}

export interface InsightCard extends BaseCard {
  type: "insight";
  summary: string;
  evidence: string;
  implication: string;
}

export interface VisualVariationCard extends BaseCard {
  type: "visual_variation";
  dimensionId: string;
  dimensionLabel: string;
  analysisText: string;
  imageDataUrl?: string;
  imageMimeType?: string;
  error?: string;
}

export interface ConceptualVariationCard extends BaseCard {
  type: "conceptual_variation";
  coreIdea: string;
  howItDiffers: string;
  whyItMayWork: string;
  bestUseCase: string;
  tradeoffs: string;
  nextStep: string;
}

export interface ConceptCard extends BaseCard {
  type: "concept";
  coreIdea: string;
  interactionDirection: string;
  visualDirection: string;
  bestFor: string;
  risks: string;
  nextStep: string;
}

export interface NoteCard extends BaseCard {
  type: "note";
  body: string;
}

export type ResultCard =
  | InsightCard
  | VisualVariationCard
  | ConceptualVariationCard
  | ConceptCard
  | NoteCard;

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
  sourceCardIds?: string[]; // card IDs of highlights that seeded this generation
}

export interface ProjectState {
  title: string;
  brief: string;
  assets: Asset[];
  generations: Generation[];
  highlights: Highlight[];
}

// Conceptual variation data passed for visual generation
export interface ConceptCardRef {
  id: string;
  title: string;
  coreIdea: string;
  howItDiffers: string;
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
  conceptCards?: ConceptCardRef[]; // for generate_concept_visuals
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
  userInstructions: string;
  selectedDimensionIds: string[];
  conceptCards?: ConceptCardRef[]; // for generate_concept_visuals
}
