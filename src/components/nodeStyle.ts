// Shared labels and colours for nodes, actions and collections, used by both views.

import type { ActionType, IdeaNode, Role } from "@/domain/types";
import { DIMENSIONS } from "@/lib/dimensions";

export const ROLES: Role[] = ["concept", "motif", "visual", "note"];

export const ROLE_STYLE: Record<Role, {
  bg: string; border: string; selectedBorder: string;
  badgeBg: string; badgeText: string; line: string; clusterBg: string;
}> = {
  concept: { bg: "#dde1f2", border: "#8b96c8", selectedBorder: "#3c4a8a", badgeBg: "#3c4a8a", badgeText: "#ffffff", line: "rgba(60,74,138,0.45)",  clusterBg: "#e8eaf8" },
  motif:   { bg: "#fdf8ef", border: "#c8a055", selectedBorder: "#8b6410", badgeBg: "#8b6410", badgeText: "#ffffff", line: "rgba(139,100,16,0.45)", clusterBg: "#faf6ea" },
  visual:  { bg: "#fdf4f2", border: "#c89088", selectedBorder: "#8b4035", badgeBg: "#8b4035", badgeText: "#ffffff", line: "rgba(139,64,53,0.40)",  clusterBg: "#f8efee" },
  note:    { bg: "#f3f8f5", border: "#7aab8a", selectedBorder: "#2e6e45", badgeBg: "#2e6e45", badgeText: "#ffffff", line: "rgba(46,110,69,0.40)",  clusterBg: "#eff6f2" },
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
    description: "Renders each selected concept or motif as an image. A selected image is used as the base.",
  },
];

export const ACTION_LABEL: Record<ActionType, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a.label]),
) as Record<ActionType, string>;

// Short line under a node saying where it came from.
export function originLabel(n: IdeaNode): string {
  if (n.origin.kind === "user") return "Your idea";
  const dim = n.origin.params?.dimensionId;
  const dimLabel = dim ? DIMENSIONS.find((d) => d.id === dim)?.label : undefined;
  return dimLabel ? `${ACTION_LABEL[n.origin.action]} · ${dimLabel}` : ACTION_LABEL[n.origin.action];
}

export const COLLECTION_COLORS = [
  "#c9a84c", // warm gold
  "#7a9e5e", // sage green
  "#c14f58", // muted rose
  "#4a7a9b", // slate blue
  "#8b6b4a", // warm brown
  "#7b6b8e", // muted violet
  "#4a8b7a", // teal
  "#9b4a4a", // terracotta
];
