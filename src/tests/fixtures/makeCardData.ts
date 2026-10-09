import type { CardData } from '../../lib/loadCards';

// A `CardData` row with every required field set, so a test names only the fields it cares about.
export function makeCardData(partial: Partial<CardData> = {}): CardData {
  return {
    collectorsinfo: '1R000',
    dilemmatype: '',
    imagefile: '',
    name: 'test card',
    type: 'event',
    originalName: 'Test Card',
    missiontype: '',
    unique: '',
    ...partial,
  };
}

// Deliberate type error to prove the typecheck CI job fails (#1062). Reverted in the next commit.
export const deliberateTypeError: number = "not a number";
