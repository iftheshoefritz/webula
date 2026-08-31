'use client';

import React from 'react';
import { CARD_ICON_IMAGES } from '../lib/missionRequirements';

interface IconGlyphProps {
  icon: string;
}

export default function IconGlyph({ icon }: IconGlyphProps) {
  const iconSrc = CARD_ICON_IMAGES[icon.toLowerCase()];
  return iconSrc
    ? <img src={iconSrc} alt={icon} title={icon} className="inline h-4 w-4" />
    : <b className="text-text-primary">[{icon}]</b>;
}
