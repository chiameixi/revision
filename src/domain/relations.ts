// What a connection between two nodes says, by the roles at each end. Pure; no React.
//
// Each pair has a reading (shown on the canvas: "Ebb embodied as Foam") and the
// question the prompt asks when the model writes the connection's word and
// explanation. The canvas, panels and prompts all read from here.
//
// Readings are fixed per role pair for now. Later: give each pair a short list
// (e.g. visual → concept: suggests / contrasts with / evokes) and let the model
// pick one, or let the designer retype it. The chosen reading would then be
// stored on the relation (`reading?`) and override the default, so a study can
// compare model-chosen against designer-chosen readings.

import type { Role } from "./types";

// One end of a connection: a node's role, or the brief.
export type End = Role | "brief";

export interface Reading {
  reading: string;   // reads between the two titles: "<from> embodied as <to>"
  question: string;  // asked of the model about the pair
}

const READINGS: Partial<Record<`${End}->${End}`, Reading>> = {
  "concept->motif": { reading: "embodied as", question: "How does this motif give visual form to the concept?" },
  "motif->concept": { reading: "connotes", question: "What does this visual quality connote or stand for?" },
  "visual->concept": { reading: "suggests", question: "What in the image suggests this idea?" },
  "visual->motif": { reading: "contains", question: "Where and how does this quality appear in the image?" },
  "concept->visual": { reading: "expressed in", question: "How does the image express the concept?" },
  "motif->visual": { reading: "applied in", question: "How is the motif used in the image?" },
  "visual->visual": { reading: "varied as", question: "What changed, and what does the change do?" },
  "concept->concept": { reading: "leads to", question: "How does the new idea follow from, push on, or reframe the input?" },
  "motif->motif": { reading: "becomes", question: "How does the new motif develop the input motif?" },
  "brief->concept": { reading: "suggests", question: "What in the brief suggests this idea?" },
  "brief->motif": { reading: "embodied as", question: "How does this motif give visual form to the brief?" },
};

const FALLBACK: Reading = { reading: "relates to", question: "How do these two connect?" };

export function readingFor(from: End, to: End): Reading {
  return READINGS[`${from}->${to}`] ?? FALLBACK;
}
