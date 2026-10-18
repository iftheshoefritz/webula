// The number of dilemmas the opponent draws and spends in a mission attempt (#1163): the personnel
// in the attempt less the dilemmas under the mission, floored at 0. A file of its own, with no
// imports, so the popup, the overlay and the log text share it without loading the reducer.
export const drawSpend = (personnel: number, subtract: number): number => Math.max(0, personnel - subtract);
