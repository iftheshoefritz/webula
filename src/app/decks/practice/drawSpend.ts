// The number of dilemmas the opponent draws and spends in a mission attempt (#1163): the personnel
// in the attempt less the dilemmas under the mission, floored at 0. A file of its own, with no
// imports, so the popup, the overlay and the log text share it without loading the reducer.
export const drawSpend = (personnel: number, subtract: number): number => Math.max(0, personnel - subtract);

// The text of the draw and the spend (#1291): "draw/spend N" when both are N, as in a game with a
// deck's dilemmas, and "draw D, spend S" when the player set a bot game's two numbers apart.
export const drawSpendText = (draw: number, spend: number): string =>
  draw === spend ? `draw/spend ${draw}` : `draw ${draw}, spend ${spend}`;
