import { BOT_SKILLS } from '../../requirements';
import {
  allButOne, anyOfThree, attrAbove, botChooses, chooseOrElse, hasAny, killRandom, noEffect, playerBrigs, playerStops, req,
  selectRandom, sk, stopAll, stopRandom, unless, unlessGroup,
} from '../families';
import { Attr, PlayState, skillName } from '../play';
import { D, NAMEABLE, P, S, dilemmaList, names } from '../define';

// The Championship titles of batch 2 (#1516): Gorgan to Rush Job. Each plays only what acts during the
// attempt (#1478); what it leaves out is in its `gap`.

const { models, dilemma } = dilemmaList();

const RETURNS = 'the return to the dilemma pile is not modelled; it always goes under';
const CORE = 'it is placed in the core only when it fires, and the discard each turn acts past the attempt (#1478)';

/** The species names the bot's discards may take (Manufactured Triumph), in the order it uses them. */
const DISCARD_SPECIES = ['Human', 'Klingon', 'Vulcan', 'Bajoran', 'Cardassian', 'Romulan', 'Ferengi', 'Borg'];

/** "Randomly select <n> personnel. Unless those personnel have <a>, or your unselected personnel have <b>, all your personnel are stopped." */
function selectedOrRest(n: number, selected: string, rest: string) {
  const a = req(selected);
  const b = req(rest);
  return (s: PlayState) => {
    const sel = s.select(n);
    const others = s.unstopped().filter((k) => !sel.includes(k));
    if (s.hasAmong(sel, a) || s.hasAmong(others, b)) {
      s.trace?.(`  selects ${names(s, sel)}: the requirements hold, no effect`);
      return;
    }
    s.stopAll();
  };
}

/** The cost of a dilemma that is cost -1 for each completed mission. */
const lessPerCompleted = (printed: number) => (a: { table: { completedMissions: number } }) => Math.max(0, printed - a.table.completedMissions);

dilemma('Gorgan', D, 2, 'assumed-fires', (s) => {
  const dearest = s.attempt.table.handMaxCost;
  s.label(dearest === undefined ? 'Discarded a card your hand cannot match' : `Discarded a card of cost ${dearest + 1}`);
  s.stopAll();
}, { category: '4d', assumption: 'the bot discards a card one more than the dearest card in your hand' });

dilemma('Greater Needs', P, 3, 'unless', unless('Anthropology, Diplomacy, Exobiology, and Integrity>30 or Leadership, Transporters, Treachery, and Strength>30', stopAll), {
  gap: 'the placement on the ship and its Damage act past the attempt (#1478)',
});

dilemma('Hall of Mirrors', S, 4, 'unless', unless('Astrometrics, 2 Geology, and 2 Navigation or 2 Science, 2 Security, and Strength>38', killRandom(2)), {
  cost: lessPerCompleted(4),
});

dilemma('Hazardous Materials', S, 3, 'assumed-fires', (s) => {
  s.label('2 Trellium-D');
  killRandom(2)(s);
}, {
  category: '5b',
  assumption: 'the bot commands 2 Trellium-D, so two personnel are killed; the Damage is dropped',
  gap: 'the placement on the ship and its Damage act past the attempt (#1478)',
});

dilemma('Heart to Heart', D, 0, 'random-select', selectRandom(2, (s, sel) => {
  if (sel.length === 2 && BOT_SKILLS.some((_, i) => s.skill(sel[0], i) > 0 && s.skill(sel[1], i) > 0)) s.stop(sel);
}), { gap: 'its Consume is not paid' });

dilemma('If Shoe Fits, Wear It!', S, 4, 'brig', playerBrigs);

dilemma('Infestation', D, 2, 'choose', playerStops(1), { repeatable: true });

dilemma('Infinite Diversity', D, 2, 'bot-names', (s) => {
  const ks = s.unstopped();
  const held = (i: number) => ks.some((k) => s.skill(k, i) > 0);
  const partner = held(sk('anthropology')) || held(sk('science'));
  const named = NAMEABLE.find((i) => !partner || !held(i));
  if (named === undefined) {
    s.trace?.('  the group has every skill the bot can name: no effect');
    return;
  }
  s.label(`Discarded 2 cards. Named ${skillName(named)}`);
  s.stopAll();
}, { category: '4b', assumption: 'the bot always discards 2 cards and names a skill the group lacks' });

// No family fits: the player either answers with a card of the hand or loses the information; the bot
// takes the option whenever it adds to the mission's attribute requirements.
dilemma('Information Extraction', D, 1, 'own', (s) => {
  const was = s.abilitiesOff;
  s.abilitiesOff = true;
  const holds = s.has(req('Intelligence, Officer, and Programming or Exobiology, Medical, and Treachery'));
  s.abilitiesOff = was;
  if (holds) {
    s.trace?.('  the group has the requirements with no gained skill: no effect');
    return;
  }
  s.stop(s.select(1));
  if (!s.requirements.some((b) => b.attrs.some((t) => t >= 0))) return;
  s.label('Lost 5 points');
  s.requirements = s.requirements.map((b) => ({ ...b, attrs: b.attrs.map((t) => (t >= 0 ? t + 10 : t)) as [number, number, number] }));
}, { category: '2', assumption: 'the bot loses 5 points whenever the 10 more of each attribute requirement helps it' });

dilemma('Interstellar Exigence', D, 2, 'own', (s) => {
  chooseOrElse(hasAny('law'), null)(s);
  if (!s.live) return;
  s.label('2 headquarters');
  s.stop(s.select(2));
}, { category: '3', assumption: 'the bot commands 2 headquarters missions' });

dilemma('Isolated Detachment', S, 2, 'own', selectedOrRest(3, 'Diplomacy, Programming, and Cunning>17', 'Engineer, Physics, and 2 Security'));

dilemma('Journey to the Past', P, 4, 'unless', unless('Anthropology, Geology, Science, and Cunning>34 or Diplomacy, Programming, Security, and Strength>32', (s) => s.holdInCore(s.select(3))), {
  gap: 'it is placed in the core only when it fires; the personnel come back after the next turn',
});

// No family fits: it ends the stack, and the rest goes back to the pile.
dilemma('Lack of Preparation', D, 2, 'own', (s) => {
  const skillsOnly = s.requirements.map((b) => ({ ...b, attrs: [-1, -1, -1] as [number, number, number] }));
  if (s.has(skillsOnly)) {
    s.trace?.('  the group has the skills of the mission: no effect');
    return;
  }
  s.stackEnded = true;
  s.trace?.('  the rest of the stack returns to the dilemma pile');
}, { gap: 'it and the dilemmas not faced return to the dilemma pile; it counts as going under' });

dilemma('Left Behind', S, 4, 'own', (s) => {
  const sel = s.select(2);
  sel.forEach((k) => s.skillsOffFor.add(k));
  const holds = s.has(req('2 Biology and 2 Medical')) || (s.has(req('2 Navigation and Transporters')) && (s.attempt.ship?.shields ?? 0) > 8);
  s.skillsOffFor.clear();
  if (holds) s.trace?.(`  selects ${names(s, sel)}: the requirements hold without their skills, no effect`);
  else s.move(sel);
}, { gap: 'the two personnel placed on a planet mission count as moved' });

dilemma('Lending a Hand', P, 2, 'bot-chooses', botChooses(2, 'stop'), {
  gap: 'the personnel the player may add from hand is not modelled',
});

dilemma('Local Trouble', S, 4, 'unless', unlessGroup(
  (s) => s.has(req('Engineer, Leadership, 2 Security, and Cunning>38')) || ((s.attempt.ship?.weapons ?? 0) > 7 && !!s.attempt.table.headquartersOtherQuadrant),
  killRandom(2),
  'Engineer, Leadership, 2 Security, and Cunning>38 or Weapons>7 and a headquarters in another quadrant',
));

// No family fits: the player picks the option that costs the attempt least.
dilemma('Logical Solution', S, 1, 'own', (s) => {
  if (s.attempt.table.handSize >= 1) {
    s.trace?.('  the player discards the hand: no effect on the attempt');
    return;
  }
  const ks = s.unstopped();
  const most = Math.max(...ks.map((k) => s.group[k].skillDots));
  const [k] = s.botChooses(ks.filter((j) => s.group[j].skillDots === most));
  if (s.meetsWithout([k])) s.kill([k]);
  else s.stopAll();
}, { gap: 'the hand the player discards is not counted' });

dilemma('Macrovirus', D, 4, 'random-select', (s) => {
  const sel = s.select(1);
  if (s.has(req('2 Exobiology and 2 Science'))) s.stop(sel);
  else s.kill(sel);
}, { category: '8', assumption: 'the stop and the kill; the Damage is dropped', gap: 'the Hand Weapon branch is not modelled' });

dilemma('Malfunctioning Generator', P, 4, 'unless', unless('2 Exobiology, 2 Physics, and Treachery or 2 Honor, 2 Medical, and Integrity>38', killRandom(2)), {
  cost: lessPerCompleted(4),
});

dilemma('Manufactured Triumph', D, 0, 'assumed-fires', (s) => {
  const species = new Set(s.unstopped().flatMap((k) => s.group[k].species));
  if (species.size >= 3) {
    s.trace?.('  the group has 3 or more species: no effect');
    return;
  }
  const discarded = DISCARD_SPECIES.filter((x) => !species.has(x.toLowerCase())).slice(0, Math.min(3, species.size + 1));
  s.label(`Discarded ${discarded.length} personnel: ${discarded.join(', ')}`);
  s.stopAll();
}, { category: '4b', assumption: 'the bot discards personnel of up to 3 species, one more than the group has' });

dilemma('Morphogenic Virus', D, 0, 'random-select', stopRandom(2), {
  cost: (a) => (a.personnel.filter((p) => p.affiliation !== 'dominion').length >= 6 ? 4 : 0),
});

// No family fits: the player beams the bot's choice aboard when its loss keeps the requirements met.
dilemma('Mr. Tricorder', P, 3, 'own', (s) => {
  const [k] = s.botChooses(s.unstopped());
  if ((s.attempt.table.shipAtMission ?? true) && s.meetsWithout([k])) s.stop([k], 'beamed aboard the ship');
  else s.stop(s.select(2));
});

dilemma('Mugato', P, 2, 'unless', unless('2 Biology and 2 Medical or Leadership, 2 Security, and Strength>34', stopRandom(2)), { gap: CORE });

dilemma('Murder Investigation', D, 3, 'any-of-three', anyOfThree(hasAny('security'), 'random'));

dilemma('Name and Shame', D, 0, 'bot-chooses', (s) => {
  const [k] = s.botChooses(s.unstopped());
  const title = s.name(k);
  s.label(`Named ${title}`);
  s.stop(s.unstopped().filter((j) => s.name(j) === title));
}, { cost: () => 3 });

dilemma('Neural Parasites', P, 2, 'bot-chooses', (s) => botChooses(s.attempt.table.headquarters, 'kill')(s), {
  cost: (a) => 2 + 3 * a.table.completedMissions,
});

dilemma('Neurogenic Field', P, 1, 'choose-or-else', chooseOrElse(hasAny('anthropology', 'medical'), killRandom(1)));

dilemma('New Face', D, 2, 'any-of-three', anyOfThree((s, k) => ([0, 1, 2] as Attr[]).some((a) => attrAbove(a, 7)(s, k)), 'player'));

dilemma('Night Terrors', S, 1, 'choose-or-else', chooseOrElse(hasAny('medical', 'science'), killRandom(1)));

dilemma('Nose to Nose', D, 0, 'random-select', selectRandom(2, (s, sel) => {
  if (sel.length === 2 && s.group[sel[0]].cost === s.group[sel[1]].cost) s.stop(sel);
}));

dilemma('Oh No!', D, 4, 'unless', unless('2 Astrometrics or Integrity>30 or Strength>30', stopAll), {
  gap: `the 5 points lost act past the attempt; ${RETURNS}`,
});

dilemma('Organ Theft', P, 1, 'reads-table', (s) => {
  if ((s.attempt.table.onMission ?? []).includes('Organ Theft')) killRandom(1)(s);
  else s.trace?.('  no copy on this mission: no effect');
}, { category: '8', assumption: 'the kill when a copy is on the mission; otherwise ignored' });

dilemma('Ostensible Malfunction', S, 1, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'the Damage dilemma it adds to the stack is not modelled, and it returns to the pile',
});

// No family fits: from now on a personnel who uses skills to meet a dilemma's requirements is stopped.
dilemma('Overwhelmed', D, 4, 'changes-later', (s) => {
  s.overwhelmed = true;
  s.trace?.('  a personnel who uses skills to meet a later dilemma is stopped');
}, {
  goesUnder: false,
  gap: 'only an "unless" check stops users: the player keeps the fewest personnel who cover the skills of the branch met',
});

dilemma('Overindulgence', D, 2, 'bot-names', (s) => {
  const ks = s.unstopped();
  const levels = (i: number) => ks.reduce((t, k) => t + s.skill(k, i), 0);
  const named = BOT_SKILLS.map((_, i) => i).reduce((best, i) => (levels(i) > levels(best) ? i : best), 0);
  s.label(`Named ${skillName(named)}`);
  if (levels(named) >= 5) s.stopAll();
});

dilemma('Parallel Romance', D, 2, 'changes-later', (s) => {
  const before = s.result.stopped;
  s.stop(s.select(2));
  s.attrBonus += s.result.stopped - before;
});

// No family fits: it changes the requirements of every later dilemma that requires Transporters.
dilemma('Pattern Loss', S, 1, 'changes-later', (s) => {
  s.patternLoss = true;
  s.trace?.('  a later dilemma requiring Transporters requires one more of each skill');
}, { goesUnder: false });

dilemma('Pest Control', S, 2, 'unless', unless('2 Engineer and 2 Exobiology or Transporters, 2 Treachery, and Cunning>34', stopRandom(2)), { gap: CORE });

dilemma('Picking Up the Pieces', P, 2, 'all-but-one', allButOne(hasAny('geology', 'programming')));

dilemma('Pivotal Destiny', P, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed in the core, and the 10 more points needed act past the attempt (#1478)',
});

dilemma('Prisoner of the Exile', P, 4, 'brig', playerBrigs);

dilemma('Psychokinetic Control', D, 0, 'changes-later', (s) => {
  s.abilitiesOff = true;
  s.trace?.('  no gained skill and no attribute increase until the end of the attempt');
}, { gap: 'a printed ability that lowers an attribute is lost with the gains' });

dilemma('Quarren Labor Shortage', D, 2, 'unless', unlessGroup(
  (s) => {
    const ks = s.unstopped();
    return 2 * ks.filter((k) => s.group[k].affiliation !== 'non-aligned').length >= ks.length;
  },
  stopAll,
  'at least half the personnel not [NA]',
), { gap: RETURNS });

dilemma('Rapid Progress', D, 3, 'bot-names', (s) => {
  const named = s.lackedSkills(NAMEABLE).slice(0, 2);
  if (!named.length) {
    s.trace?.('  the group has every skill the bot can name: no effect');
    return;
  }
  s.label(`Removed ${named.length} card type${named.length === 1 ? '' : 's'}. Named ${named.map(skillName).join(', ')}`);
  s.stopAll();
}, { category: '6', assumption: 'the bot removes 2 card types and names 2 skills the group lacks' });

dilemma('Rascals', D, 2, 'unless', unlessGroup(
  (s) => s.unstopped().reduce((t, k) => t + s.group[k].cost, 0) < 17,
  (s) => s.kill(s.select(s.attempt.table.headquarters)),
  'a total cost<17',
));

dilemma('Reflections', S, 2, 'assumed-fires', (s) => {
  const t = s.attempt.table;
  const revealed = 3 * t.turn;
  const share = t.drawDeckSize ? (t.drawDeckEventsOrInterrupts ?? 0) / t.drawDeckSize : 1 / 3;
  s.label(`${revealed} [AU] cards`);
  s.stop(s.botChooses(s.unstopped(), Math.round(revealed * share)));
}, { category: '5b', assumption: 'the bot commands 3 [AU] cards per turn; the events and interrupts revealed are the draw deck\'s share' });

dilemma('Revealed', P, 3, 'choose', (s) => {
  s.label('Revealed a personnel with 2 Treachery');
  const chosen = s.playerChooses(s.unstopped(), 2);
  if (s.attempt.table.shipAtMission ?? true) s.stop(chosen, 'beamed aboard the ship');
  else s.kill(chosen);
}, { category: '5c', assumption: 'the bot commands a personnel with 2 Treachery' });

dilemma('Rush Job', S, 3, 'choose', (s) => {
  const staffing = s.attempt.ship?.staffing;
  s.stop(s.playerChooses(s.unstopped()));
  if (staffing && staffing.length < 4 && s.live) s.stop(s.playerChooses(s.unstopped()));
  if (staffing && !staffing.includes('[cmd]') && s.live) s.stop(s.botChooses(s.unstopped()));
}, { gap: 'with no staffing icons known, the ship counts as four or more with [Cmd]' });

export const CHAMPIONSHIP_BATCH_2_MODELS = models;
