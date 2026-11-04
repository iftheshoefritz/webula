import {
  allButOne, botChooses, chooseOrElse, hasAny, hasRequiredSkill, isCommand, killRandom, killRandomThenStopAll, noEffect,
  otherEquipment, playerStops, req, revealOrElse, selectEachLacking, selectRandom, sk, stopAll, stopRandom, thenReturns, unless, unlessGroup, unlessSelected,
} from '../families';
import { Attr } from '../play';
import { CORE_EVENTS, D, P, S, dilemmaList, names, speciesKey } from '../define';

// The Championship titles of batch 1 (#1515): A Bad Case of par'Mach to Galileo Grounded. Each plays
// only what acts during the attempt (#1478); what it leaves out is in its `gap`.

const { models, dilemma } = dilemmaList();

/** A personnel placed on the bottom of the deck or removed from the game leaves for good: it counts as killed. */
const LEAVES = 'a personnel placed on the bottom of the deck or removed from the game counts as killed';

const totalAttrs = (s: Parameters<typeof isCommand>[0], k: number) => ([0, 1, 2] as Attr[]).reduce((t, a) => t + s.attr(k, a), 0);

dilemma('A Bad Case of par\'Mach', D, 3, 'choose', playerStops(2), { gap: 'the cards the player may draw are not modelled' });

// No family fits: the selected personnel is killed only below Strength 7, and then only the others are stopped.
dilemma('A Klingon Matter', P, 3, 'own', unlessGroup((s) => s.has(req('2 Intelligence and Treachery or 2 Leadership and Cunning>32')), (s) => {
  const [k] = s.select(1);
  if (k === undefined || s.attr(k, 2) >= 7) {
    s.trace?.('  the selected personnel has Strength 7 or more: no effect');
    return;
  }
  s.kill([k]);
  s.stopAll();
  s.returnsToPile();
}, '2 Intelligence and Treachery or 2 Leadership and Cunning>32'));

// No family fits: all three are stopped when they share a species, otherwise the player stops one of them.
dilemma('A Pattern of Lies', D, 2, 'random-select', selectRandom(3, (s, sel) => {
  if (sel.length > 1 && sel.every((k) => speciesKey(s, k) === speciesKey(s, sel[0]))) s.stop(sel);
  else s.stop(s.playerChooses(sel));
}));

// No family fits: a personnel with a required skill is killed, and the bot always discards for a second.
dilemma('A Taste of Armageddon', P, 4, 'own', (s) => {
  const first = s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k)));
  if (!first.length) return;
  s.kill(first);
  s.label('Discarded an interrupt');
  s.kill(s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k))));
}, { category: '4f', assumption: 'the bot always discards an interrupt, so two personnel are killed' });

dilemma('Accelerated Aging', D, 2, 'changes-later', (s) => {
  s.firstSkillOff = true;
  s.trace?.('  no personnel can use its first-listed skill until the end of the attempt');
}, { gap: 'a personnel with no first-listed skill in the data loses none' });

dilemma('Aceton Assimilators', D, 4, 'choose', (s) => {
  s.label('Named Aceton Assimilators');
  playerStops(1)(s);
}, { category: '3', assumption: 'the bot names Aceton Assimilators and one copy is beneath your missions' });

// No family fits: the player has more points, so the bot returns a second personnel to the hand.
dilemma('Adversarial Trial', S, 2, 'own', (s) => {
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('anthropology'), sk('programming')))));
  if (!s.live) return;
  s.label('You have more points');
  s.returnToHand(s.select(1));
}, { category: '2', assumption: 'you have more points than the bot, so a personnel returns to the hand' });

dilemma('After Action Report', D, 2, 'random-select', (s) => s.stop(s.select(s.attempt.table.completedMissions)));

dilemma('Alluring Spy', S, 2, 'unless', unless(
  'Diplomacy, 2 Exobiology, and Strength>42 or Intelligence, 2 Leadership, and Cunning>38',
  thenReturns((s) => s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('security')))))),
));

dilemma('Ardent Predator', S, 2, 'unless-selected', unlessSelected(2, 'Exobiology and Cunning>11 or Strength>13', (s, sel) => s.kill(sel)));

dilemma('Arena', D, 3, 'random-select', selectRandom(1, (s, sel) => {
  if (sel.length && totalAttrs(s, sel[0]) > 18) s.trace?.('  total attributes>18: no effect');
  else s.move(sel);
}));

dilemma('Arresting Display', D, 3, 'unless', unless('Anthropology, Security, and Telepathy or 2 Exobiology, Medical, and Cunning>38', stopAll), {
  gap: 'the interrupt the player may play while facing it is not modelled',
});

// No family fits: the check reads the skills the personnel have with no gain, and the bot moves the ship.
dilemma('Artificial Wormhole', S, 3, 'own', (s) => {
  const branches = req('2 Leadership and 2 Officer or Engineer, Programming, and Cunning>33');
  const was = s.abilitiesOff;
  s.abilitiesOff = true;
  const holds = s.has(branches);
  s.abilitiesOff = was;
  if (holds) s.trace?.('  the group has the requirements with no gained skill: no effect');
  else s.moveShip();
}, { gap: 'the ship\'s Commander aboard is not read, and gained attributes are lost with gained skills' });

dilemma('Assassination Attempt', P, 4, 'select-each', selectEachLacking(2, hasAny('treachery'), 'kill'));

dilemma('Blended', P, 2, 'all-but-one', allButOne(hasAny('diplomacy', 'telepathy')));

// No family fits: the personnel of cost 1 or less cannot use their skills, for this dilemma's own check only.
dilemma('Bread and Circuses', D, 4, 'own', (s) => {
  s.skillsOffAtMostCost = 1;
  const holds = s.has(req('Archaeology, Diplomacy, and Honor or Exobiology, Transporters, and Treachery'));
  s.skillsOffAtMostCost = -1;
  if (holds) s.trace?.('  the group has the requirements without its cost-1 personnel\'s skills: no effect');
  else s.stopAll();
});

dilemma('Breaking the Ice', S, 3, 'unless', unlessGroup((s) => s.has(req('3 Geology')) || otherEquipment(s) >= 2, stopAll, '3 Geology or two non-Hand Weapon equipment'));

// No family fits: a personnel alone must have 2 Engineer or 2 Programming, and the bot chooses among them.
dilemma('Bynars\' Password', D, 3, 'own', unlessGroup(
  (s) => s.unstopped().some((k) => s.skill(k, sk('engineer')) >= 2 || s.skill(k, sk('programming')) >= 2),
  (s) => {
    const candidates = s.unstopped().filter((k) => s.hasSkill(k, sk('engineer'), sk('programming')));
    if (candidates.length) s.stop(s.botChooses(candidates));
    else thenReturns(stopAll)(s);
  },
  'a personnel with 2 Engineer or 2 Programming',
));

dilemma('Captain\'s Holiday', P, 3, 'unless', unless('2 Archaeology or 2 Geology', thenReturns(stopAll)));

dilemma('Causal Recursion', S, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed in the core, and the 10 more points needed act past the attempt (#1478)',
});

dilemma('Clashing Values', P, 2, 'select-each', selectEachLacking(3, hasAny('anthropology', 'science'), 'stop'));

dilemma('Code Forty-Seven', D, 2, 'choose', (s) => {
  const chosen = s.playerChooses(s.unstopped().filter((k) => isCommand(s, k)));
  s.stop(chosen);
  if (chosen.reduce((t, k) => t + s.group[k].cost, 0) < 4) s.returnsToPile();
}, { assumption: 'the player stops one [Cmd] personnel' });

dilemma('Compromised Experiment', D, 1, 'random-select', (s) => s.stop(s.select(s.attempt.table.highestDecay ?? 0)));

dilemma('Conflict of Interests', D, 4, 'unless', unless('3 Archaeology or Integrity>36', stopAll), {
  category: '4g',
  assumption: 'the bot plays the "unless" only; the return to its dilemma pile is dropped',
});

dilemma('Contaminating a Culture', D, 3, 'random-select', killRandom(1), {
  gap: 'the player\'s equipment in the discard pile is not on the table, so the player never prevents it',
});

dilemma('Cornered', P, 3, 'unless', unlessGroup(
  (s) => s.has(req('2 Astrometrics and 2 Navigation')) || !!s.attempt.table.completedSpan4Mission,
  killRandom(2),
  '2 Astrometrics and 2 Navigation or a completed mission with span 4 or more',
));

dilemma('Covert Ambush', S, 3, 'no-effect', noEffect, { goesUnder: false, gap: 'it is placed in the core and acts later (#1478)' });

dilemma('Cultural Differences', P, 1, 'choose-or-else', chooseOrElse(hasAny('acquisition', 'anthropology'), killRandom(1)));

dilemma('Dangerous Liaisons', D, 4, 'unless', unless('2 Science and 2 Security or 3 Treachery', thenReturns(stopAll)));

dilemma('Dead Ringer', D, 3, 'stop-all', stopAll, {
  gap: 'the player\'s discard pile is not on the table, so the player never replaces the chosen personnel',
});

dilemma('Dead Weight', D, 3, 'own', (s) => s.stop(s.unstopped().filter((k) => !hasRequiredSkill(s, k))));

dilemma('Derelict Robot', D, 3, 'select-each', selectEachLacking(3, hasAny('diplomacy', 'engineer'), 'stop'));

dilemma('Dignitaries and Witnesses', D, 4, 'unless', unlessGroup(
  (s) => s.unstopped().some((k) => (s.group[k].traits?.keywords ?? []).some((w) => w === 'admiral' || w === 'general')) || s.has(req('3 Leadership')),
  thenReturns(stopAll),
  'an Admiral or a General or 3 Leadership',
));

// No family fits: one requirement reads the three selected personnel, the other the personnel not selected.
dilemma('Divergent Goals', P, 2, 'own', (s) => {
  const sel = s.select(3);
  const rest = s.unstopped().filter((k) => !sel.includes(k));
  if (s.hasAmong(sel, req('Anthropology, Geology, and Integrity>17')) || s.hasAmong(rest, req('Biology, Officer, and 2 Transporters'))) {
    s.trace?.(`  selects ${names(s, sel)}: the requirements hold, no effect`);
    return;
  }
  s.stopAll();
});

// No family fits: one random personnel, killed (and every other stopped) unless the group has Biology and 2 Medical.
dilemma('Disgraceful Assault', S, 3, 'own', unless('2 Security and Transporters', (s) => {
  const sel = s.select(1);
  if (s.has(req('Biology and 2 Medical'))) {
    s.stop(sel);
    return;
  }
  s.kill(sel);
  s.stopAll();
}));

dilemma('Distress Call', S, 9, 'stop-all', stopAll, { cost: (a) => Math.max(0, 9 - 3 * a.table.completedMissions) });

// No family fits: the player stops the fewest personnel whose costs reach 4, all of them when the group cannot.
dilemma('Distraction', D, 2, 'choose', (s) => {
  let cost = 0;
  while (cost < 4 && s.live > 0) {
    const [k] = s.playerChooses(s.unstopped());
    cost += s.group[k].cost;
    s.stop([k]);
  }
});

// No family fits: the bot chooses between two victims, the one whose loss hurts the attempt more.
dilemma('Dramatis Personae', P, 3, 'bot-chooses', unless('2 Medical and 2 Science or 2 Archaeology and Transporters', (s) => {
  const ks = s.unstopped();
  const fewest = Math.min(...ks.map((k) => s.group[k].skillDots));
  const lowest = Math.min(...ks.map((k) => totalAttrs(s, k)));
  const [a] = s.playerChooses(ks.filter((k) => s.group[k].skillDots === fewest));
  const [b] = s.playerChooses(ks.filter((k) => totalAttrs(s, k) === lowest));
  const [victim] = s.botChooses([a, b]);
  s.kill([victim]);
}));

dilemma('Edo Probe', D, 0, 'no-effect', noEffect, {
  status: 'ignore',
  goesUnder: false,
  assumption: 'the bot takes it out of its pile: it scores points, and never acts on the attempt',
});

dilemma('Elemental Instability', D, 3, 'own', (s) => {
  const trellium = s.attempt.table.trelliumD ?? 0;
  if (trellium) botChooses(trellium, 'kill')(s);
  if (!s.live || s.has(req('2 Engineer and 2 Science or 2 Acquisition and 2 Biology'))) return;
  s.stop(s.playerChooses(s.unstopped().filter((k) => isCommand(s, k)), 2));
});

// No family fits: the Restricted Area of #1320 with kills, and the bot chooses the third.
dilemma('Exposed Power Relay', D, 3, 'own', (s) => {
  const [k] = s.select(1);
  if (s.live - 1 < 9) {
    s.stop([k]);
    return;
  }
  s.kill([k]);
  s.kill(s.select(1));
  if (s.live >= 10) s.kill(s.botChooses(s.unstopped()));
}, { assumption: '"nine personnel remaining" is nine or more, counted after the first is selected (#1518)' });

dilemma('Family', D, 3, 'reveal-or-else', revealOrElse('honor', 'treachery'), { gap: LEAVES });

dilemma('Ferengi Locator Bomb', P, 3, 'unless', unless('Navigation, Physics, and Programming or Acquisition, Treachery, and Cunning>32', killRandomThenStopAll), {
  gap: LEAVES,
});

dilemma('Financial Pitfall', D, 2, 'unless', unless('3 Acquisition or Cunning>35', thenReturns(stopAll)), { gap: 'its Consume is not paid' });

dilemma('Flare of Rage', P, 5, 'unless', unless('Anthropology, Medical, 2 Security, and Strength>35 or 2 Archaeology, Transporters, and 2 Treachery', killRandom(2)), {
  cost: (a) => Math.max(0, 5 - (a.table.persistentUnderMission ?? 0)),
  gap: LEAVES,
});

dilemma('Formal Hearing', D, 7, 'unless', unless('Diplomacy, Intelligence, 2 Programming, and Cunning>38 or 2 Honor, Law, and 2 Officer', stopRandom(3)), {
  cost: () => 7 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events, so it costs 1',
});

dilemma('Frozen by Fear', S, 5, 'unless', unless('2 Honor, Law, Medical, and Cunning>35 or Officer, 2 Science, and 2 Treachery', killRandom(2)), {
  cost: (a) => Math.max(0, 5 - (a.table.persistentUnderMission ?? 0)),
  gap: LEAVES,
});

dilemma('Galileo Grounded', P, 2, 'unless', unlessGroup(
  (s) => s.has(req('Medical, Security, and Transporters')) || !!s.attempt.table.staffedShipAtMission,
  stopAll,
  'Medical, Security, and Transporters or a staffed ship at this mission',
));

export const CHAMPIONSHIP_BATCH_1_MODELS = models;
