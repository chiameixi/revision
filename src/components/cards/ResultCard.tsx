"use client";

import type { ConceptualVariationCard as ConceptualVariationCardType, ResultCard as ResultCardType } from "@/types";
import InsightCard from "./InsightCard";
import VisualVariationCard from "./VisualVariationCard";
import ConceptualVariationCard from "./ConceptualVariationCard";
import ConceptCard from "./ConceptCard";

interface Props {
  card: ResultCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onGenerateVisuals?: (card: ConceptualVariationCardType) => void;
}

export default function ResultCard({ card, isSaved, onSave, onDismiss, onGenerateVisuals }: Props) {
  switch (card.type) {
    case "insight":
      return <InsightCard card={card} isSaved={isSaved} onSave={onSave} onDismiss={onDismiss} />;
    case "visual_variation":
      return <VisualVariationCard card={card} isSaved={isSaved} onSave={onSave} onDismiss={onDismiss} />;
    case "conceptual_variation":
      return (
        <ConceptualVariationCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onGenerateVisuals={onGenerateVisuals ? () => onGenerateVisuals(card) : undefined}
        />
      );
    case "concept":
      return <ConceptCard card={card} isSaved={isSaved} onSave={onSave} onDismiss={onDismiss} />;
  }
}
