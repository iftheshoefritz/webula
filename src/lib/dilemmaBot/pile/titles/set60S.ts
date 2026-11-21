import {
  botChooses,
  keywordIs,
  noEffect,
  req,
  selectRandom,
  sk,
  stopAll,
  stopRandom,
  unless,
  unlessGroup,
} from '../families';
import { Attr, ATTR_NAMES } from '../play';
import { D, P, S, dilemmaList } from '../define';

// The dilemmas of set 67, 60S (#1845, part 1 of #1825): the 15 titles that fit the families and read no new
// fact of the table. The other six need a new fact or a new Resolve op (#1846).

const { models, dilemma } = dilemmaList();

const ATTRS: Attr[] = [0, 1, 2];

// ---- Random selections ----

dilemma('Alice in Wonderland', P, 2, 'random-select', selectRandom(3, (s, sel) => s.stop(sel)), {
  gap: 'the exchange with personnel aboard your ship is the player\'s, done by hand',
});

// No family fits: the bot chooses the parity of Cunning that stops more of the three, even on a tie.
dilemma('Cunning Illusion', D, 1, 'random-select', selectRandom(3, (s, sel) => {
  const even = sel.filter((k) => s.attr(k, 1) % 2 === 0);
  const odd = sel.filter((k) => s.attr(k, 1) % 2 !== 0);
  const hit = odd.length > even.length ? odd : even;
  s.label(`Chose ${hit === odd ? 'odd' : 'even'} Cunning`);
  s.stop(hit);
}));

dilemma('Emergency Surgery', D, 1, 'random-select', selectRandom(3, (s, sel) => {
  const met = sel.map((k) => s.hasSkill(k, sk('biology'), sk('medical')));
  s.check(sel, met, 'Biology or Medical');
  if (met.some(Boolean)) {
    s.trace?.('  one of the selected has Biology or Medical: no effect');
    return;
  }
  s.kill(s.botChoice(sel));
}));

dilemma('Frozen in Place', P, 0, 'random-select', selectRandom(2, (s, sel) => {
  const total = sel.reduce((sum, k) => sum + ATTRS.reduce((t, a) => t + s.attr(k, a), 0), 0);
  s.check(sel, sel.map(() => total < 36), 'total attributes<36', 'the selected personnel');
  if (total < 36) s.stop(sel);
  else s.kill(s.botChoice(sel));
}));

dilemma('Slide Bolt', P, 2, 'random-select', (s) => {
  const n = s.unstopped().filter((k) => s.hasSkill(k, sk('physics')) && s.attr(k, 1) < 7).length;
  s.stop(s.select(n ? n : 3));
});

dilemma('Unwarranted Interrogation', D, 3, 'random-select', (s) => {
  const n = s.unstopped().filter((k) => s.hasSkill(k, sk('security')) && !s.hasSkill(k, sk('honor'))).length;
  if (n) s.stop(s.select(n));
  else botChooses(1, 'kill')(s);
});

// No family fits: the bot names the attribute whose most common value the most personnel share, the
// first on a tie, then the value of one selected personnel stops every other personnel who shares it.
dilemma('Urgent Search', D, 4, 'random-select', (s) => {
  const ks = s.unstopped();
  const shared = (a: Attr) => {
    const counts = new Map<number, number>();
    for (const k of ks) counts.set(s.attr(k, a), (counts.get(s.attr(k, a)) ?? 0) + 1);
    return Math.max(0, ...counts.values());
  };
  const named = ATTRS.reduce((best, a) => (shared(a) > shared(best) ? a : best), 0 as Attr);
  s.label(`Named ${ATTR_NAMES[named]}`);
  const [sel] = s.select(1);
  if (sel === undefined) return;
  s.stop(s.unstopped().filter((k) => k !== sel && s.attr(k, named) === s.attr(sel, named)));
});

// ---- Unless ----

dilemma('Chaotic Space', S, 2, 'unless', unless('2 Anthropology and 2 Physics or Honor, Science, Security, and Cunning>34', noEffect), {
  gap: 'it is placed on your ship with its Damage, which the table does not model; it goes under',
});

// goesUnder: false, never beneath this mission: each is placed in your core.
dilemma('Face Your Fate', S, 2, 'unless', unless('Law', stopRandom(1)), {
  goesUnder: false, placement: 'core',
  gap: 'the limit of seven counters acts past the attempt (#1478)',
});

dilemma('Ki-ty-ha', P, 2, 'unless', unless('Telepathy', stopRandom(1)), {
  goesUnder: false, placement: 'core',
  gap: 'its discard that prevents a stop acts past the attempt (#1478)',
});

dilemma('Unwinnable Duel', P, 2, 'unless', unless('Intelligence', stopRandom(1)), {
  goesUnder: false, placement: 'core',
  gap: 'its return of a dilemma beneath your mission acts past the attempt (#1478)',
});

// No family fits: with the skills, the personnel who use them are stopped, as Overwhelmed does.
dilemma('Major-General\'s Song', D, 2, 'own', (() => {
  const branches = req('Biology, Geology, and Science');
  return (s) => {
    if (!s.has(branches)) s.stopAll();
    else s.stop(s.skillUsers(branches[0]));
  };
})());

dilemma('Pandora\'s Box', S, 2, 'unless', unless('Diplomacy, Navigation, and Treachery or Intelligence, Leadership, and Officer', stopAll), {
  assumption: 'the bot commands no ship at the mission, so it goes under',
});

dilemma('Pools of Mak\'ala', P, 3, 'unless', (() => {
  const branches = req('2 Exobiology and Cunning>32');
  return unlessGroup(
    (s) => s.has(branches) || s.unstopped().some((k) => keywordIs('host')(s, k)),
    (s) => {
      s.returnToHand(s.select(1));
      s.stopAll();
    },
    '2 Exobiology and Cunning>32 or a Host',
  );
})());

dilemma('You Need Therapy!', D, 2, 'unless', (() => {
  const branches = req('3 Leadership');
  return (s) => {
    s.label('Discarded an Infiltrator');
    if (s.has(branches)) s.trace?.('  the group has 3 Leadership: no effect');
    else s.stopAll();
  };
})(), {
  category: '4f',
  assumption: 'the bot always discards an Infiltrator whose skills, except Intelligence, the group lacks',
});

export const SET_60S_MODELS = models;
