import { botOpponent } from '../../../app/decks/practice/opponent';
import type { CardInstance } from '../../../app/decks/practice/tableReducer';

const card = (id: string, type = 'personnel'): CardInstance => ({ id, card: { name: id, type }, face: 'up' });

describe('botOpponent (#1823)', () => {
  it('gives no half outside a bot game', () => {
    expect(botOpponent({ dilemmaPile: [card('d1', 'dilemma')], botBrig: [] })).toBeNull();
  });

  it("gives the bot's half of a bot game: its dilemma pile and its brig, and empty locations", () => {
    const captive = card('card-3');
    const half = botOpponent({
      opponent: 'bot',
      dilemmaPile: [card('d1', 'dilemma'), card('d2', 'dilemma')],
      botBrig: [captive],
    });
    expect(half).not.toBeNull();
    expect(half!.kind).toBe('bot');
    expect(half!.dilemmaPileCount).toBe(2);
    expect(half!.brig).toEqual([captive]);
    expect(half!.missions).toEqual([null, null, null, null, null]);
    expect(half!.sidesAtYours.every((side) => side.awayTeam.length === 0 && side.ships.length === 0)).toBe(true);
    expect([half!.handCount, half!.drawDeckCount, half!.core.length, half!.score]).toEqual([0, 0, 0, 0]);
  });
});
