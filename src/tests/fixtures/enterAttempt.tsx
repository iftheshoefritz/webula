import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// A mission card for a test deck: a planet mission, so slot 0 holds a mission an attempt can take.
export const mockAttemptMission = {
  collectorsinfo: '1U900',
  originalName: 'Moab IV',
  type: 'mission',
  name: 'moab iv',
  imagefile: 'moab_iv',
  missiontype: 'p',
  pile: 'mission',
  count: 1,
};

// The dilemma stack mounts only in the attempt layout (#1170). This puts an attempt at
// `missionIndex` into the game the page saved, and renders `page` again, which restores the game in
// the attempt layout, with the game menu closed. The slot must hold a mission card, or the restore drops the attempt.
// `fields` sets more of the attempt, such as `phase: 'choose'` (#1191).
export const enterAttempt = async (page: React.ReactElement, missionIndex = 0, fields: Record<string, unknown> = {}) => {
  // The key of the builder deck's game, `PRACTICE_GAME_KEY` in `PracticeTable.tsx`.
  const key = 'practiceGame';
  const save = JSON.parse(localStorage.getItem(key)!);
  save.table.attempt = { missionIndex, personnel: 0, subtract: 0, ...fields };
  localStorage.setItem(key, JSON.stringify(save));
  cleanup();
  await act(async () => {
    render(page);
  });
  // The game menu opens on every load (#781), so Continue closes it again.
  const resume = screen.queryByRole('button', { name: 'Continue' });
  if (resume) {
    await act(async () => {
      fireEvent.click(resume);
    });
  }
};

// The dilemma hand shows only in the dilemma choice of an attempt (#1223), and the Draw dilemma
// button is the only tap that draws into it. This enters the choice at `missionIndex`, whose slot
// must hold a mission card, as `enterAttempt` does.
export const enterDilemmaChoice = (page: React.ReactElement, missionIndex = 0) =>
  enterAttempt(page, missionIndex, { phase: 'choose', drawn: 0 });

// The counted draw of the dilemma choice (#1191), which opens the dilemma hand as its arc.
export const drawChoiceDilemma = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('attempt-draw-dilemma'));
  });
};

// The ids of the cards in the dilemma hand of the builder deck's saved game, in hand order.
export const dilemmaHandIds = (): string[] =>
  JSON.parse(localStorage.getItem('practiceGame')!).table.dilemmaHand.map((card: { id: string }) => card.id);
