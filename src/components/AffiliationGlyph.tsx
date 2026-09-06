'use client';

import React from 'react';
import { AFFILIATION_ICONS } from '../lib/missionRequirements';

interface AffiliationGlyphProps {
  affiliation: string;
}

export default function AffiliationGlyph({ affiliation }: AffiliationGlyphProps) {
  const iconSrc = AFFILIATION_ICONS[affiliation.toLowerCase()];
  return iconSrc
    ? <img src={iconSrc} alt={affiliation} title={affiliation} className="inline h-4 w-4" />
    : <b className="text-text-primary">[{affiliation}]</b>;
}
