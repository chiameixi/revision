// Why an action can't run on the current selection, or null if it can.
// Shared by the selection bar (disabled buttons) and the run composer, so they
// never disagree. Mirrors the rules in services/generate.ts planRun.

import type { ActionType, ProjectState } from "@/domain/types";
import { resolveSelection } from "@/domain/graph";

export function whyUnavailable(action: ActionType, project: ProjectState, selection: string[]): string | null {
  const { nodes, edges } = resolveSelection(project, selection);
  const ends = edges.flatMap((e) => [project.nodes[e.from], project.nodes[e.to]]).filter(Boolean);
  switch (action) {
    case "expand":
      return nodes.length + edges.length === 0 && !project.brief.trim() ? "Write a brief or select something to expand." : null;
    case "visual_variations":
      return [...nodes, ...ends].some((n) => n.image) ? null : "Select an image to vary.";
    case "conceptual_variations":
      return nodes.some((n) => n.role === "concept" || n.role === "motif") || edges.length > 0
        ? null
        : "Select a concept, motif or connection to visualize.";
  }
}
