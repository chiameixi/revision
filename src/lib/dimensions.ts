export interface Dimension {
  id: string;
  label: string;
  summary: string;
}

export const DIMENSIONS: Dimension[] = [
  {
    id: "balance",
    label: "Balance",
    summary:
      "structural skeleton, spatial relations, visual weight of components, equilibrium, direction, and movement",
  },
  {
    id: "shape",
    label: "Shape",
    summary:
      "representation that gives the illusion of shape through creative visual perception — how forms are read and understood at a glance",
  },
  {
    id: "form",
    label: "Form",
    summary:
      "roundness vs sharpness, strength vs frailty, harmony vs discord — the purely visual qualities that symbolically read as images of the human condition",
  },
  {
    id: "growth",
    label: "Growth",
    summary:
      "progression from general to specific forms, how complexity unfolds, visual thinking that reflects something about the observer",
  },
  {
    id: "space",
    label: "Space",
    summary:
      "spatial composition, depth cues, figure-ground relationships, and how elements occupy and define the canvas",
  },
  {
    id: "light",
    label: "Light",
    summary:
      "depth, volume, shadow, and luminance — how light sources create three-dimensionality and guide the eye",
  },
  {
    id: "color",
    label: "Color",
    summary:
      "symbolic meaning of hues, color as a tool for distinguishing shapes, emotional signal, and compositional harmony",
  },
  {
    id: "dynamics",
    label: "Dynamics",
    summary:
      "sense of movement, tension, and visual energy — how the eye is led through the composition",
  },
  {
    id: "expression",
    label: "Expression",
    summary:
      "overall expressive quality and emotional resonance conveyed by the composition as a unified whole",
  },
];

export const DIMENSION_MAP: Record<string, Dimension> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, d])
);
