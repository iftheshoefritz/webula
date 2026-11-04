import { BOT_SKILLS } from '../../../lib/dilemmaBot/requirements';
import { botPersonnelOf } from '../../../lib/dilemmaBot/simulator';

// The cases of the Chula bot's play moved to the pile play, `pile/chulaPile.test.ts` (#1507).

describe('botPersonnelOf', () => {
  it('reads a lowercased card data row', () => {
    const p = botPersonnelOf({
      originalName: 'Kira Nerys',
      name: 'kira nerys',
      cost: '3',
      integrity: '6',
      cunning: '6',
      strength: '6',
      skills: 'anthropology 2 honor leadership',
    });
    expect(p.name).toBe('Kira Nerys');
    expect(p.attrs).toEqual([6, 6, 6]);
    expect(p.skills[BOT_SKILLS.indexOf('honor')]).toBe(2);
    expect(p.skills[BOT_SKILLS.indexOf('leadership')]).toBe(1);
  });
});
