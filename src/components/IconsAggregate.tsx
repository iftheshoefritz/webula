import React from 'react';
import PileAggregate from './PileAggregate';
import { CARD_ICON_IMAGES } from '../lib/missionRequirements';

interface IconsAggregateProps {
  currentDeckRows: Array<Record<string, any>>;
}

export default function IconsAggregate({ currentDeckRows }: IconsAggregateProps) {
  return (
    <PileAggregate
      currentDeckRows={currentDeckRows}
      characteristicName="icons"
      filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
      splitFunction={(keywords) =>
        keywords
          .split(/[\[\]]/)
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0)
      }
      assembleCounts={(counts, icon, count) => {
        counts[icon] = (counts[icon] || 0) + count;
        return counts;
      }}
    >
      {([icon, count]) => {
        const iconSrc = CARD_ICON_IMAGES[icon.toLowerCase()];
        return (
          <div key={icon} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
            <span className="px-1 text-text-secondary flex items-center gap-1">
              {count}x{' '}
              {iconSrc
                ? <img src={iconSrc} alt={icon} title={icon} className="inline h-4 w-4" />
                : <b className="text-text-primary">[{icon}]</b>
              }
            </span>
          </div>
        );
      }}
    </PileAggregate>
  );
}
