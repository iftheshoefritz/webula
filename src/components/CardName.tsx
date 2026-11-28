import React from 'react';
import { versionSuffixOf } from '../lib/cardCount';

type CardNameProps = {
  // The printed title and subtitle (`originalTitle`, `originalSubtitle`, #1971).
  title?: string;
  subtitle?: string;
  // The joined name with its version suffix, as the list showed it before: the source of the
  // suffix, and the whole text for a row with no title, such as a deck line whose card is not in
  // the card data.
  name: string;
  unique?: boolean;
};

/**
 * A card's name in a card list (#1975): the unique dot, the title, then the subtitle and the
 * version suffix in smaller, muted type, so a reader sees where the title ends. It stays inline
 * on one line, so a parent's `truncate` cuts the subtitle first, and the spaces between the parts
 * keep the copied text and the accessible name "Title Subtitle".
 */
const CardName: React.FC<CardNameProps> = ({ title, subtitle, name, unique = false }) => {
  const dot = unique && <span>·</span>;
  if (!title) return <>{dot}{name}</>;
  const secondary = [subtitle, versionSuffixOf(name)].filter(Boolean).join(' ');
  return (
    <>
      {dot}
      <span data-testid="card-name-title">{title}</span>
      {secondary && (
        <>
          {' '}
          <span data-testid="card-name-subtitle" className="text-[0.8em] font-normal text-text-muted">
            {secondary}
          </span>
        </>
      )}
    </>
  );
};

export default CardName;
