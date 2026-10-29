// Shared labels and colours for nodes, actions and collections, used by every view.
// Role colours are the data palette; the interface's own colours are tokens in
// app/globals.css.

import type { ActionType, IdeaNode, Role } from "@/domain/types";
import { DIMENSIONS } from "@/lib/dimensions";

export const ROLES: Role[] = ["concept", "motif", "visual", "note"];

export const ROLE_STYLE: Record<Role, {
  fill: string;       // node background
  border: string;     // node outline, edge colour
  ink: string;        // role-coloured text
  badgeBg: string;
  group: string;      // background of the role group in the collections view
}> = {
  concept: { fill: "#eef0fb", border: "#a3acdf", ink: "#2d3a8c", badgeBg: "#dfe3f8", group: "#f3f4fc" },
  motif:   { fill: "#fdf6e7", border: "#d8b56f", ink: "#6b4a06", badgeBg: "#f5e6c3", group: "#fcf8ee" },
  visual:  { fill: "#fbefec", border: "#d6a197", ink: "#7d3326", badgeBg: "#f5dcd6", group: "#fbf3f1" },
  note:    { fill: "#eef6f1", border: "#98c4a9", ink: "#245c3b", badgeBg: "#d9ece0", group: "#f2f8f4" },
};

export const ROLE_LABEL: Record<Role, string> = {
  concept: "Concept", motif: "Motif", visual: "Visual", note: "Note",
};

export const ROLE_LABEL_PLURAL: Record<Role, string> = {
  concept: "Concepts", motif: "Motifs", visual: "Visuals", note: "Notes",
};

// What the main text field is called for each role.
export const BODY_LABEL: Record<Role, string> = {
  concept: "Description", motif: "Visual quality", visual: "Analysis", note: "Note",
};

export const ACTIONS: { id: ActionType; label: string; description: string }[] = [
  {
    id: "expand",
    label: "Expand",
    description: "More concepts and motifs from what's selected, or from the brief if nothing is. Selected images are analyzed.",
  },
  {
    id: "visual_variations",
    label: "Visual variations",
    description: "Varies the form of the selected image along the Arnheim dimensions you choose. Other selected nodes guide it.",
  },
  {
    id: "conceptual_variations",
    label: "Conceptual variations",
    description: "Renders each selected concept, motif or link as an image. A selected image is used as the base.",
  },
];

export const ACTION_LABEL: Record<ActionType, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a.label]),
) as Record<ActionType, string>;

// Where a node came from, as a phrase that can't be mistaken for a button.
export function originLabel(n: IdeaNode): string {
  if (n.origin.kind === "user") return "Added by you";
  const dim = n.origin.params?.dimensionId;
  const dimLabel = dim ? DIMENSIONS.find((d) => d.id === dim)?.label : undefined;
  return dimLabel ? `Made by ${ACTION_LABEL[n.origin.action]} (${dimLabel})` : `Made by ${ACTION_LABEL[n.origin.action]}`;
}

export const COLLECTION_COLORS = [
  "#c9a84c", "#7a9e5e", "#c14f58", "#4a7a9b", "#8b6b4a", "#7b6b8e", "#4a8b7a", "#9b4a4a",
];

// Spoken names for the colours above, for the colour picker.
export const COLLECTION_COLOR_NAMES = ["Gold", "Sage", "Rose", "Slate blue", "Brown", "Violet", "Teal", "Terracotta"];
