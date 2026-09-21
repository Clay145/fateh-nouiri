import React from 'react';

// New landing design folds the 4 core mechanisms into ClinicalProofSection
// (#clinical-mechanism). This component is intentionally empty so the old
// 5-card grid is not duplicated. Kept mounted-safe for backwards compat.
interface FeaturesSectionProps {
  onOpenSoundPreview?: () => void;
}

export const FeaturesSection: React.FC<FeaturesSectionProps> = () => {
  return null;
};
