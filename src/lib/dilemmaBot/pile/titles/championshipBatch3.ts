import { BOT_SKILLS, RequirementBranch } from '../../requirements';
import {
  botChooses,
  chooseOrElse,
  either,
  hasAny,
  hasRequiredSkill,
  iconIs,
  killRandom,
  killRandomThenStopAll,
  noEffect,
  anyOfThree,
  playerBrigs,
  playerDiscards,
  playerStops,
  req,
  selectEachWithout,
  selectRandom,
  sk,
  stopAll,
  stopRandom,
  unless,
  unlessGroup,
} from '../families';
import { Attr, ATTR_NAMES, PlayState, skillName } from '../play';
import { D, P, S, dilemmaList, mostHeldSkill } from '../define';

// The Championship titles of batch 3 (#1517), Shared Hallucination to Zero Hour: the 46 titles of the 52
// Championship piles that the other files of `titles/` lack, the most played first.

const { models, dilemma } = dilemmaList();

const RETURNS = 'the return to the dilemma pile is not modelled; it always goes under';
const BOTTOM_OF_DECK = 'a personnel placed on the bottom of the deck counts as killed';
const ALL_SKILLS = BOT_SKILLS.map((_, i) => i);

/** Category 3 of #1320: the bot commands three missions worth 40 or more points, so the dilemma costs 0. */
const FORTY_POINTS = { cost: () => 0, category: '3' as const, assumption: 'the bot commands 3 missions worth 40 or more points' };

/** Each attribute requirement of every branch, `add` more. A branch with no attribute requirement keeps none. */
const addToAttrs = (branches: RequirementBranch[], add: number) =>
  branches.map((b) => ({ ...b, attrs: b.attrs.map((t) => (t >= 0 ? t + add : t)) as [number, number, number] }));

/** "Replace attributes in this mission's requirements with <attr>": the higher threshold when two meet. */
const moveAttrs = (branches: RequirementBranch[], attr: Attr) =>
  branches.map((b) => {
    const top = Math.max(...b.attrs);
    const attrs: [number, number, number] = [-1, -1, -1];
    if (top >= 0) attrs[attr] = top;
    return { ...b, attrs };
  });

const titleCase = (word: string) => word.replace(/(^|[\s-])(\w)/g, (_, sep: string, c: string) => sep + c.toUpperCase());

// ---- The bot-side titles of #1320 ----

dilemma('Spatial Interphase', D, 6, 'bot-chooses', botChooses(1, 'kill', (s, k) => s.group[k].skillDots <= 3), FORTY_POINTS);

dilemma('Unfair Terms', P, 6, 'random-select', selectRandom(3, (s, sel) => s.kill(sel.filter((k) => s.group[k].cost <= 2))), FORTY_POINTS);

dilemma('Slightly Overbooked', S, 6, 'unless', unlessGroup(
  (s) => s.unstopped().filter((k) => s.group[k].cost >= 4).length >= 3,
  (s) => s.stop(s.unstopped().filter((k) => s.group[k].cost <= 2)),
  'three personnel of cost 4 or more',
), FORTY_POINTS);

dilemma('Simulated Prey', S, 4, 'random-select', (s) => {
  const first = s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k)));
  if (!first.length) {
    s.trace?.('  no personnel has a skill the mission requires: no effect');
    return;
  }
  s.kill(first);
  s.label('Discarded an interrupt');
  s.kill(s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k))));
}, { category: '4f', assumption: 'the bot always discards an interrupt, so a second personnel is killed' });

// No family fits: the player's stop, then the bot's kill among the affiliations of its deck's personnel.
dilemma('Shocking Betrayal', D, 2, 'own', (s) => {
  playerStops(1)(s);
  const bot = (s.attempt.botAffiliations ?? []).filter((a) => a !== 'non-aligned');
  const candidates = s.unstopped().filter((k) => bot.includes(s.group[k].affiliation));
  if (!candidates.length) {
    s.trace?.('  the bot deck holds no personnel of an affiliation in the group: no kill');
    return;
  }
  const [k] = s.botChooses(candidates);
  s.label(`Discarded a ${titleCase(s.group[k].affiliation)} personnel`);
  s.kill([k]);
}, {
  category: '4f',
  assumption: 'the bot discards a non-[NA] personnel of its deck whenever one shares an affiliation with the group',
});

dilemma('The Clown: Cloaking Device', D, 2, 'changes-later', (s) => {
  if (!s.requirements.some((b) => b.attrs.some((t) => t >= 0))) {
    s.trace?.('  the mission has no attribute requirement: no effect');
    return;
  }
  s.requirements = addToAttrs(s.requirements, 9);
  s.label('3 different equipment');
  s.trace?.('  each attribute requirement is 9 more');
}, { goesUnder: false, category: '5b', assumption: 'the bot commands 3 different equipment, so each attribute requirement is 9 more' });

dilemma('Standing Trial', P, 2, 'random-select', (s) => {
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('honor'), sk('transporters')))));
  if (!s.live) return;
  s.label('You have more points');
  s.returnToHand(s.select(1));
}, { category: '2', assumption: 'you have more points than the bot, so a personnel returns to your hand' });

dilemma('Tak Tak Negotiations', P, 3, 'no-effect', noEffect, { status: 'ignore' });

dilemma('Ungracious Hosts', P, 2, 'no-effect', noEffect, { status: 'ignore' });

// ---- A cost that reads the attempt ----

dilemma('Warm Welcome', D, 0, 'unless', unlessGroup(
  (() => {
    const officers = req('2 Officer');
    return (s: PlayState) => s.unstopped().filter((k) => iconIs('[cmd]')(s, k)).length >= 3 || s.has(officers);
  })(),
  playerDiscards(1),
  '3 [Cmd] personnel or 2 Officer',
), { cost: (a) => (a.personnel.length >= 6 ? 3 : 0), gap: `${BOTTOM_OF_DECK}; ${RETURNS}` });

// ---- The choices the bot makes during the attempt ----

dilemma('Unbelievable Emergency', S, 4, 'random-select', (s) => {
  const named = mostHeldSkill(s, ALL_SKILLS);
  s.label(`Named ${skillName(named)}`);
  for (let h = 0; h < s.attempt.table.headquarters && s.live > 0; h++) {
    const sel = s.select(2);
    s.kill(sel.filter((k) => s.skill(k, named) > 0));
    s.stop(sel.filter((k) => s.skill(k, named) === 0));
  }
});

// No family fits: the named skill lowers its holders' attributes for the rest of the play, so the later
// dilemmas and the final check read the loss.
dilemma('The Clown: Bitter Medicine', D, 4, 'changes-later', (s) => {
  const lossOf = (i: number) => {
    const loss = s.attrLoss ? s.attrLoss.slice() : new Int16Array(s.group.length);
    for (const k of s.unstopped()) if (s.skill(k, i) > 0) loss[k] += 2;
    return loss;
  };
  const before = s.attrLoss;
  let named = -1;
  for (const i of ALL_SKILLS) {
    if (!s.unstopped().some((k) => s.skill(k, i) > 0)) continue;
    s.attrLoss = lossOf(i);
    const fails = !s.meetsWithout();
    s.attrLoss = before;
    if (fails) {
      named = i;
      break;
    }
  }
  if (named < 0) named = mostHeldSkill(s, ALL_SKILLS);
  s.attrLoss = lossOf(named);
  s.label(`Named ${skillName(named)}`);
  s.trace?.(`  each personnel with ${skillName(named)} is attributes -2`);
}, { goesUnder: false, gap: RETURNS });

// No family fits: the requirements' attributes all move to the one the bot names.
dilemma('The Clown: On His Throne', D, 4, 'changes-later', (s) => {
  if (!s.requirements.some((b) => b.attrs.some((t) => t >= 0))) {
    s.trace?.('  the mission has no attribute requirement: no effect');
    return;
  }
  const before = s.requirements;
  const attrs: Attr[] = [0, 1, 2];
  let named = attrs.find((a) => {
    s.requirements = moveAttrs(before, a);
    const fails = !s.meetsWithout();
    s.requirements = before;
    return fails;
  });
  if (named === undefined) named = attrs.reduce((lo, a) => (s.totalAttr(a) < s.totalAttr(lo) ? a : lo), 0 as Attr);
  s.requirements = moveAttrs(before, named);
  s.label(`Named ${ATTR_NAMES[named]}`);
  s.trace?.(`  every attribute requirement is ${ATTR_NAMES[named]}`);
}, { goesUnder: false, gap: 'it is removed from the game at the end of the turn (#1478)' });

dilemma('The Captain\'s "Guest"', D, 2, 'random-select', (s) => {
  const counts = new Map<string, number>();
  for (const k of s.unstopped()) for (const w of s.group[k].traits?.keywords ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  let named = '';
  for (const [w, n] of counts) if (n > (counts.get(named) ?? 0)) named = w;
  if (named) s.label(`Named ${titleCase(named)}`);
  const sel = s.select(3);
  s.trace?.(`  selects ${sel.map((k) => s.name(k)).join(', ')}`);
  if (named && sel.some((k) => s.group[k].traits?.keywords.includes(named))) s.stop(sel);
  else s.stop(s.playerChooses(sel));
});

// No family fits: the player prevents the bot's stop by stopping two others who share a skill with the
// chosen personnel, and does it only when that keeps the requirements met and the bot's stop would not.
dilemma('Suspicion', P, 1, 'own', (s) => {
  const [k] = s.botChooses(s.unstopped());
  if (k === undefined) return;
  const shares = s.unstopped().filter((j) => j !== k && ALL_SKILLS.some((i) => s.skill(k, i) > 0 && s.skill(j, i) > 0));
  if (!s.meetsWithout([k])) {
    for (let a = 0; a < shares.length; a++) {
      for (let b = a + 1; b < shares.length; b++) {
        if (s.meetsWithout([shares[a], shares[b]])) {
          s.stop([shares[a], shares[b]], `the player prevents the stop of ${s.name(k)}`);
          return;
        }
      }
    }
  }
  s.stop([k]);
});

dilemma('The Caretaker\'s "Guests"', D, 2, 'bot-chooses', botChooses(1, 'discard'), {
  gap: 'a personnel placed on the top of the deck counts as killed; the replacement from the discard pile is not modelled',
});

// ---- The titles that fit a family ----

dilemma('Spatial Distortions', S, 3, 'choose', playerDiscards(1));

dilemma('The Phage', P, 3, 'choose', playerDiscards(1));

dilemma('Vian Test', P, 5, 'choose', playerBrigs(1), { gap: 'the bot\'s draw for a non-unique personnel is dropped' });

dilemma('We\'ll Never Know', P, 3, 'unless', unless('3 Physics', stopAll), { gap: 'the branch of two non-Hand Weapon equipment is not read' });

dilemma('Unknown Microorganism', P, 3, 'unless', unless('Biology, Medical, and Science', killRandomThenStopAll), {
  gap: `the branch of 2 Security and an equipment is not read; ${RETURNS}`,
});

dilemma('V\'Ger', S, 3, 'unless', unless('Diplomacy, Exobiology, and Cunning>35 or Archaeology, Programming, and Strength>35', stopAll), {
  gap: 'the placement on the ship and its Damage are not modelled; it always goes under',
});

dilemma('What Lies Beneath', S, 3, 'unless', unless('Archaeology, Geology, and Honor or Anthropology, Treachery, and Cunning>32', killRandomThenStopAll), {
  gap: BOTTOM_OF_DECK,
});

dilemma('Telepathic Deception', D, 4, 'unless', unless('Biology, Exobiology, and Security or Telepathy and Cunning>28', stopAll), { gap: RETURNS });

dilemma('Threading the Needle', S, 3, 'unless', unless('2 Navigation, 2 Officer, and Transporters or 2 Engineer, 2 Programming, and Strength>38', stopAll), {
  gap: 'the placement on the mission once overcome is not modelled; it always goes under',
});

dilemma('Telepathology', D, 3, 'unless', unless('2 Diplomacy, 2 Medical, and Telepathy', stopRandom(3)), {
  gap: 'the revealed cards of your deck are not read',
});

dilemma('Vastly Outnumbered', S, 3, 'unless', unless('Anthropology and 2 Honor or Integrity>28', stopAll), {
  gap: `the branch of two Hand Weapons and the 5 points lost are not modelled; ${RETURNS}`,
});

dilemma('Staffing Shortage', S, 3, 'random-select', selectRandom(1, (s, sel) => {
  if (ALL_SKILLS.some((i) => s.skill(sel[0], i) >= 2)) s.stop(sel);
  else s.kill(sel);
}));

dilemma('Suspected Minority', D, 3, 'random-select', (s) => {
  const species = new Set(s.unstopped().flatMap((k) => s.group[k].species));
  s.stop(s.select(species.size < 4 ? 1 : 3));
});

dilemma('Temptation', D, 3, 'select-each-without', selectEachWithout(3, hasAny('honor', 'treachery'), 'stop'));

dilemma('Shields Up!', S, 3, 'random-select', selectRandom(1, (s, sel) => {
  s.stop(sel);
  if (s.hasSkill(sel[0], sk('astrometrics'), sk('navigation'))) s.stop(s.select(1));
}));

dilemma('So Many Enemies', D, 3, 'any-of-three', anyOfThree(hasAny('treachery'), 'random'));

dilemma('Weight of Command', D, 3, 'random-select', selectRandom(3, (s, sel) => {
  s.stop(sel.filter((k) => s.hasSkill(k, sk('officer'))));
  s.move(sel.filter((k) => s.alive[k] && s.group[k].affiliation === 'romulan'));
}));

dilemma('The Big Goodbye', S, 2, 'random-select', (() => {
  const branches = req('Diplomacy, Engineer, and Medical or Anthropology, Leadership, and Strength>30');
  return selectRandom(1, (s, sel) => {
    if (s.has(branches)) s.stop(sel);
    else {
      s.kill(sel);
      s.stopAll();
    }
  });
})());

dilemma('The Needs of the Many', D, 4, 'random-select', killRandom(1, either(iconIs('[cmd]'), hasAny('science'))), {
  gap: 'the interrupts of your hand are not read, so no personnel is stopped for them',
});

dilemma('Soul Searching', S, 3, 'random-select', (s) => s.holdInCore(s.select(1)), { goesUnder: false });

dilemma('The First Duty', S, 1, 'choose-or-else', chooseOrElse(hasAny('honor', 'law'), killRandom(1)));

dilemma('Two-Dimensional Creatures', S, 1, 'choose-or-else', chooseOrElse((s, k) => s.skill(k, sk('science')) >= 2 || s.hasSkill(k, sk('telepathy')), null), {
  gap: 'the placement on your mission when you cannot is not modelled',
});

dilemma('Zero Hour', P, 1, 'changes-later', (s) => {
  const events = s.attempt.table.coreEvents ?? 0;
  if (!events) {
    s.trace?.('  your core holds no event: no effect');
    return;
  }
  s.requirements = addToAttrs(s.requirements, 3 * events);
  s.trace?.(`  each attribute requirement is ${3 * events} more`);
}, { goesUnder: false });

// ---- No effect during the attempt ----

dilemma('Skeleton Crew', D, 0, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed on the mission, and the six personnel a later attempt needs act past the attempt (#1478)',
});

dilemma('The Dreamer and the Dream', D, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed on the mission, and the discarded hand acts at the end of the turn (#1478)',
});

dilemma('The Clown: Go Away', D, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed on the mission, and acts when a later attempt begins (#1478)',
});

dilemma('Stripped Down', D, 1, 'no-effect', noEffect, { gap: 'it moves dilemmas beneath your other missions, which no attempt reads' });

dilemma('Temporal Conduit', D, 2, 'no-effect', noEffect, {
  gap: 'it is placed on a completed mission and acts at the end of your turns (#1478)',
});

dilemma('Shipboard Fire', S, 1, 'no-effect', noEffect, { gap: 'the table has no damage markers, so the ship is assumed to have none' });

dilemma('Shared Hallucination', D, 0, 'no-effect', noEffect, {
  gap: 'the player discards the whole hand, so no personnel is stopped (an open question of #1517)',
});

export const CHAMPIONSHIP_BATCH_3_MODELS = models;
