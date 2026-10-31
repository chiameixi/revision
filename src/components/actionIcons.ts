// One icon per action, used wherever an action appears.
import { Image as ImageIcon, Shapes, Sparkles } from "lucide-react";
import type { ActionType } from "@/domain/types";

export const ACTION_ICON: Record<ActionType, typeof Sparkles> = {
  expand: Sparkles,
  visual_variations: Shapes,
  conceptual_variations: ImageIcon,
};
