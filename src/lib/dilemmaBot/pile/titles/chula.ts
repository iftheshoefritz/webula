import { BOT_SKILLS } from '../../requirements';
import { Play, sk } from '../families';
import { Attr, ATTR_NAMES } from '../play';
import { D, dilemmaList, names } from '../define';

// The Chula pile (#1507): the 7 Chula titles the two pilot piles lack. Each draws its randoms and traces
// its lines as the Chula bot's `playStack` did, so the hand-worked cases of #1282 and the partner cases of
// #1357 hold on the pile play.

const { models, dilemma } = dilemmaList();

// Each draws its randoms and traces its lines as the Chula bot's `playStack` did, so the hand-worked cases
// of #1282 and the partner cases of #1357 hold on the pile play.


/** Chula: Echoes and Chula: Move Along Home: three random personnel, all stopped when the highest `attr` is even. */
const highestEven = (attr: Attr): Play => (s) => {
  const ks = s.select(3);
  const highest = Math.max(...ks.map((k) => s.attr(k, attr)));
  const label = `selects ${names(s, ks)}, highest ${ATTR_NAMES[attr]} ${highest}`;
  if (highest % 2 === 0) s.stop(ks, label);
  else s.trace?.(`  ${label}: odd, no effect`);
};

dilemma('Chula: Echoes', D, 1, 'random-select', highestEven(1));
dilemma('Chula: Move Along Home', D, 3, 'random-select', highestEven(2));

dilemma('Chula: Unfortunate Roll', D, 1, 'random-select', (s) => {
  const ks = s.select(3);
  const total = ks.reduce((t, k) => t + s.attr(k, 0), 0);
  const label = `selects ${names(s, ks)}, total Integrity ${total}`;
  if (total % 2 === 1) s.stop(ks, label);
  else s.trace?.(`  ${label}: even, no effect`);
});

dilemma('Chula: Trickery', D, 2, 'random-select', (s) => {
  const ks = s.select(3);
  const officer = ks.reduce((t, k) => t + s.skill(k, sk('officer')), 0);
  const different = BOT_SKILLS.filter((_, i) => ks.some((k) => s.skill(k, i) > 0)).length;
  const label = `selects ${names(s, ks)}, ${officer} Officer, ${different} different skills`;
  if (officer >= 2 || different >= 12) s.trace?.(`  ${label}: no effect`);
  else s.stop(ks, label);
});

dilemma('Chula: The Precipice', D, 2, 'own', (s) => {
  if (s.live % 2 === 1) {
    s.trace?.(`  ${s.live} personnel, an odd number: no effect`);
    return;
  }
  const order = s.select(s.live);
  const halves = [order.slice(0, s.live / 2), order.slice(s.live / 2)];
  const met = (half: number[]) =>
    half.some((a) => s.hasSkill(a, sk('leadership')) &&
      half.some((b) => b !== a && s.attr(b, 1) > 5 && half.some((c) => c !== a && c !== b && s.hasSkill(c, sk('honor')))));
  if (halves.some(met)) s.trace?.('  one half has Leadership, Cunning>5 and Honor: no effect');
  else s.stop(halves[s.rand() < 0.5 ? 0 : 1], 'no half has Leadership, Cunning>5 and Honor');
});

dilemma('Chula: Pick One to Save Two', D, 2, 'choose', (s) => {
  const ks = s.select(3);
  // The best choice, without sight of the rest of the stack: return the first personnel whose loss keeps
  // the mission requirements met; when none does, stop all three, which is no lasting damage.
  const option = s.attempt.choice === 'random'
    ? Math.floor(s.rand() * (ks.length + 1)) - 1
    : ks.findIndex((k) => s.meetsWithout([k]));
  if (option < 0) {
    s.stop(ks, `selects ${names(s, ks)}; the player stops all`);
  } else {
    s.returnToHand([ks[option]], undefined, true);
    s.trace?.(`  selects ${names(s, ks)}; the player returns ${s.name(ks[option])} to the hand`);
  }
});

dilemma('Chula: The Game', D, 0, 'changes-later', (s) => {
  s.gameCopies++;
  s.trace?.(`  goes onto the mission (${s.gameCopies} there now)`);
}, { goesUnder: false, leads: true });

export const CHULA_MODELS = models;
