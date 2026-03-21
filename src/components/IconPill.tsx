import React from 'react';
import { CARD_ICON_IMAGES } from '../lib/missionRequirements';

interface IconPillProps {
  icon: string;
  count: number;
}

export default function IconPill({ icon, count }: IconPillProps) {
  const iconSrc = CARD_ICON_IMAGES[icon.toLowerCase()];
  return (
    <div className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
      <span className="px-1 text-text-secondary flex items-center gap-1">
        {count}x{' '}
        {iconSrc
          ? <img src={iconSrc} alt={icon} title={icon} className="inline h-4 w-4" />
          : <b className="text-text-primary">[{icon}]</b>
        }
      </span>
    </div>
  );
}
