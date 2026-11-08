import { BOT_SKILLS } from '../../requirements';
import { allButOne, anyOfAffiliation, botChooses, brigRandom, chooseOrElse, hasAny, killRandom, loseShip, noEffect, playerStops, selectRandom, selectUntil, sk, stopAll, stopRandom, thenReturns, unless, unlessGroup } from '../families';
import { Attr, ATTR_NAMES, skillName } from '../play';
import { DilemmaModel } from '../model';
import { CORE_EVENTS, D, NAMEABLE, P, S, UNNAMEABLE, addableModels, dilemmaList, lowCost, mostHeldSkill, speciesKey } from '../define';

// The 45 titles of Think Tank 50's (Matt S, 2026 Trek Masters), the first pilot pile of #1320.

const { models, dilemma } = dilemmaList();

dilemma('Adopted Authority', D, 3, 'random-select', selectRandom(1, (s, [k]) => {
  if ([0, 1, 2].some((a) => s.attr(k, a as Attr) < 5)) s.stop([k]);
  else {
    s.stop([k, ...s.select(1, s.unstopped().filter((j) => j !== k))]);
    s.returnsToPile();
  }
}));

dilemma('Agonizing Encounter', D, 5, 'own', (s) => {
  const missions = s.attempt.table.missionSkills;
  if (!missions.length) return;
  const named = NAMEABLE.concat(UNNAMEABLE).reduce((best, i) =>
    missions.filter((m) => m.includes(i)).length > missions.filter((m) => m.includes(best)).length ? i : best);
  const count = missions.filter((m) => m.includes(named)).length;
  s.label(`Named ${skillName(named)}`);
  s.stop(s.select(count));
}, { cost: (a) => Math.max(0, 5 - a.table.headquarters) });

dilemma('An Old Debt', D, 3, 'unless', unless('Biology, Physics, and Cunning>32 or Intelligence and 2 Medical', killRandom(1, hasAny('leadership'))));

dilemma('Artificial Ability', D, 2, 'bot-names', (s) => {
  const stopsOf = (a: Attr) => s.unstopped().filter((k) => s.attr(k, a) > 7);
  const breaks = ([0, 1, 2] as Attr[]).filter((a) => !s.meetsWithout(stopsOf(a)));
  const named = breaks[0] ?? ([0, 1, 2] as Attr[]).reduce((best, a) => (stopsOf(a).length > stopsOf(best).length ? a : best));
  s.label(`Named ${ATTR_NAMES[named]}`);
  s.stop(stopsOf(named));
});

dilemma('Chula: The Chandra', D, 4, 'select-until', selectUntil(
  (s, sel) => sel.length > 1 && s.group[sel[sel.length - 1]].cost >= s.group[sel[0]].cost,
  (s, sel) => s.stop(sel),
));

dilemma('Counterinsurgency Program', D, 2, 'bot-names', (s) => {
  const named = s.lackedSkills(NAMEABLE).slice(0, 2);
  if (!named.length) {
    s.trace?.('  the group has every skill the bot can name: no effect');
    return;
  }
  s.label(`Discarded ${named.length} event${named.length === 1 ? '' : 's'}. Named ${named.map(skillName).join(', ')}`);
  s.stopAll();
}, { category: '4b', assumption: 'the bot discards up to 2 events and names skills you lack' });

dilemma('Dereliction of Duty', D, 0, 'changes-later', (s) => {
  s.abilitiesOff = true;
  s.trace?.('  the personnel cannot use their abilities until the end of the attempt');
});

dilemma('Discommendation', D, 2, 'any-of-affiliation', anyOfAffiliation('klingon'));

dilemma('Dragon\'s Teeth', D, 3, 'random-select', selectRandom(2, (s, sel) => {
  const total = sel.reduce((t, k) => t + s.group[k].cost, 0);
  if (total <= s.attempt.table.handSize) s.kill(sel);
}));

dilemma('Equipment Malfunction', D, 1, 'no-effect', noEffect, { gap: 'equipment is not part of the attempt the bot reads' });

dilemma('Ghosts of Reality', P, 5, 'select-until', selectUntil(
  (s, sel) => sel.some((k) => s.hasSkill(k, sk('telepathy'))) || ([0, 1, 2] as Attr[]).some((a) => sel.reduce((t, k) => t + s.attr(k, a), 0) > 20),
  (s, sel) => s.kill(sel),
));

// goesUnder: false, never beneath this mission: it is placed in your core, with the personnel it holds.
dilemma('Hard Time', P, 3, 'random-select', selectRandom(1, (s, sel) => s.holdInCore(sel)), { goesUnder: false });

dilemma('Harsh Conditions', P, 3, 'changes-later', (s) => {
  const named: number[] = [];
  for (let h = 0; h < s.attempt.table.headquarters; h++) {
    const i = mostHeldSkill(s, BOT_SKILLS.map((_, j) => j).filter((j) => !named.includes(j)));
    named.push(i);
    s.blockedSkills.add(i);
  }
  if (named.length) s.label(`Named ${named.map(skillName).join(', ')}`);
});

dilemma('He Wasn\'t Nice', D, 0, 'bot-chooses', (s) => {
  const [k] = s.botChooses(s.unstopped());
  const title = s.name(k);
  s.label(`Named ${title}`);
  s.kill(s.unstopped().filter((j) => s.name(j) === title));
}, { cost: () => 5 });

dilemma('Hippocratic Oath', D, 3, 'own', (s) => {
  const candidates = s.unstopped().filter((k) => s.hasSkill(k, sk('exobiology'), sk('medical')));
  const keeps = candidates.find((k) => s.meetsWithout([k]));
  if (keeps !== undefined) s.move([keeps]);
  else s.stopAll(); // a placed personnel cannot save the attempt: stopping all does no lasting damage
});

dilemma('Identity Theft', D, 4, 'own', (s) => {
  const copies = s.attempt.table.discardCopiesMax;
  const title = s.attempt.table.discardCopiesTitle;
  if (copies >= 1 && title) s.label(`Named ${title}`);
  if (copies >= 1) s.stop(s.playerChooses(s.unstopped()));
  if (copies >= 2) s.kill(s.select(1));
  if (copies >= 3) s.stopAll();
});

dilemma('In Development', D, 6, 'random-select', (s) => {
  const low = s.unstopped().filter((k) => s.group[k].cost <= 2);
  const [kept] = s.select(1, low);
  s.stop(low.filter((k) => k !== kept));
}, { cost: (a) => Math.max(0, 6 - a.table.headquarters) });

dilemma('Inequitable Exchange', D, 6, 'bot-chooses', botChooses(1, 'brig'), {
  category: '7',
  assumption: 'the bot\'s brig is empty, so the cost stays 6 and nothing is freed',
});

// goesUnder: false, never beneath this mission: it is placed in your core.
dilemma('Inferiority', D, 3, 'no-effect', noEffect, { goesUnder: false, gap: 'the extra dilemmas of a later attempt are dropped (#1478)' });

// goesUnder: false, never beneath this mission: it is placed in your core, whether or not a personnel is stopped.
dilemma('Ingenious Jury-rig', D, 3, 'choose-or-else', chooseOrElse(hasAny('transporters'), null), { goesUnder: false });

dilemma('Intimidation', D, 4, 'select-until', selectUntil(
  (s, sel) => sel.length > 1 && speciesKey(s, sel[sel.length - 1]) !== speciesKey(s, sel[0]),
  (s, sel) => s.stop(sel),
));

dilemma('Moral Choice', D, 2, 'any-of-affiliation', anyOfAffiliation('federation'));

dilemma('More of Gravy Than of Grave', D, 4, 'random-select', selectRandom(3, (s, sel) => {
  const rest = s.unstopped().filter((k) => !sel.includes(k));
  const covered = BOT_SKILLS.every((_, i) => !sel.some((k) => s.skill(k, i) > 0) || rest.some((k) => s.skill(k, i) > 0));
  if (!covered) s.stop(sel);
}));

dilemma('Necessary Execution', P, 5, 'bot-chooses', (s) => {
  s.kill(s.botChoice(s.unstopped(), s.attempt.table.completedSpaceMission ? 1 : 2));
});

dilemma('Occupational Hazards', D, 3, 'unless', unless('2 Acquisition or 2 Treachery', thenReturns(killRandom(1))));

dilemma('Old Differences', D, 4, 'random-select', stopRandom(2), { cost: (a) => (a.mission.points <= 35 ? 3 : 4) });

dilemma('Outclassed', S, 3, 'unless', unlessGroup(
  (s) => !!s.attempt.ship && (s.attempt.ship.range > 8 || s.attempt.ship.weapons > 8),
  stopAll,
  'Range>8 or Weapons>8',
), { gap: '"unused" Range is read as the ship\'s printed Range' });

// No family fits: the bot consumes the fewest dilemmas from the top of its pile that make the group fail
// Cunning>15+10×consumed, when its pile holds that many (#1518).
dilemma('Outmatched', P, 1, 'bot-consumes', (s) => {
  const cunning = s.totalAttr(1);
  const needed = Math.max(0, Math.ceil((cunning - 15) / 10));
  const available = s.attempt.botPile?.length ?? Infinity;
  if (needed > available) {
    s.trace?.(`  Cunning ${cunning}: the pile holds ${available}, too few to consume: no effect`);
    return;
  }
  if (needed) s.label(`Consumed ${needed} dilemma${needed === 1 ? '' : 's'}`);
  s.stopAll();
}, { assumption: 'the bot consumes from the top of its pile, as many as make Cunning>15 fail (#1518)' });

dilemma('Personal Duty', S, 2, 'all-but-one', allButOne(hasAny('leadership', 'officer')));

// goesUnder: false, never beneath this mission: it returns to the dilemma pile once played.
dilemma('Polywater Intoxication', D, 0, 'choose', playerStops(1), {
  cost: (a) => (a.personnel.length >= 6 ? 3 : 0),
  goesUnder: false,
});

dilemma('Restricted Area', D, 3, 'own', (s) => {
  const [k] = s.select(1);
  if (s.live - 1 < 9) {
    s.stop([k]);
    return;
  }
  s.brig([k]);
  s.brig(s.select(1));
  if (s.live >= 10) s.brig(s.select(1));
}, { assumption: '"nine personnel remaining" is nine or more, counted after the first is selected (#1518)' });

// Still 'no-effect', so the search leaves it out, but the bot makes its choice for the label (#1574).
dilemma('Secret Identity', D, 0, 'no-effect', (s) => {
  s.botChoice(s.unstopped());
}, {
  assumption: 'the player replaces the chosen personnel with an identical copy, so the attempt does not change (#1518)',
});

dilemma('Swashbuckler at Heart', D, 2, 'no-effect', noEffect, { gap: 'it reads only the player\'s hand' });

dilemma('Sylvia', P, 8, 'unless', unless('2 Leadership, Officer, Security, and Cunning>38 or 2 Engineer, Programming, and 2 Science', brigRandom(2)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('The Alien\'s Graveyard', D, 6, 'random-select', selectRandom(3, (s, sel) => {
  const low = sel.filter((k) => s.group[k].cost <= 2);
  if (low.length) s.kill(low);
  else s.brig(s.botChoice(sel));
}), { cost: (a) => Math.max(0, 6 - lowCost(a)) });

dilemma('The Dal\'Rok', D, 3, 'unless', unlessGroup(
  (s) => s.unstopped().reduce((t, k) => t + s.group[k].cost, 0) > 17,
  thenReturns((s) => s.kill(s.select(s.attempt.table.headquarters))),
  'total cost>17',
));

dilemma('The Killing Game', S, 8, 'unless', unless('2 Engineer, 2 Medical, and Cunning>38 or 2 Diplomacy, Leadership, and 2 Physics', brigRandom(2)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('The Weak Will Perish', D, 3, 'random-select', selectRandom(1, (s, sel) => s.kill(sel)));

// goesUnder: false, never beneath this mission: it returns to the dilemma pile at the end of the turn.
dilemma('Timescape', D, 0, 'no-effect', noEffect, { goesUnder: false, gap: 'it stops a later attempt at this mission, not this one' });

dilemma('Tsiolkovsky Infection', S, 8, 'unless', unless('2 Anthropology, 2 Programming, and Cunning>38 or 2 Biology, Exobiology, and 2 Medical', killRandom(3)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('Unconventional Consideration', D, 2, 'choose-or-else', chooseOrElse(hasAny('acquisition', 'intelligence', 'law', 'telepathy'), stopAll));

// No family fits: at reveal, the bot takes the dilemma of cost 2 or less from its pile that does the
// attempt most harm, and faces it next (#1518).
const vaultFits = (m: DilemmaModel) => m.printedCost <= 2 && m.kind !== 'space';
const NO_TITLES: string[] = [];
dilemma('Vault of Tomorrow', P, 1, 'adds-dilemma', (s) => {
  const added = s.addBestOnTop(addableModels(s.attempt.botPile ?? NO_TITLES, vaultFits));
  if (added) s.label(`Added ${added}`);
  s.returnsToPile();
}, { assumption: 'the bot chooses at reveal the dilemma of its pile that does the attempt most harm (#1518)' });

dilemma('Well-Prepared Defenses', D, 2, 'bot-chooses', (s) => {
  s.label('Bot\'s missions: more points');
  s.stop(s.botChoice(s.unstopped()));
}, { category: '3', assumption: 'the bot\'s missions are worth more points than yours' });

dilemma('Where No One Has Gone Before', S, 4, 'unless', unless('Astrometrics, Navigation, Physics, and Cunning>34 or Exobiology, Leadership, Medical, and Integrity>32', (s) => {
  s.notPlacedUnder('to your core');
  s.loseShip();
}));

dilemma('Whisper in the Dark', P, 8, 'unless', unless('2 Geology, 2 Physics, and Cunning>38 or 2 Honor, 2 Officer, and Transporters', killRandom(3)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

export const THINK_TANK_MODELS = models;
