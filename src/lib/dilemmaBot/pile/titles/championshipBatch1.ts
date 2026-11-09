import {
  otherEquipment,
  thenReturns,
  allButOne,
  botChooses,
  chooseOrElse,
  hasAny,
  hasRequiredSkill,
  iconIs,
  keywordIs,
  killRandom,
  removeRandom,
  killRandomThenStopAll,
  noEffect,
  playerStops,
  req,
  revealOrElse,
  rollsBeforeChoice,
  selectEachWithout,
  selectRandom,
  sk,
  stopAll,
  stopRandom,
  unless,
  unlessGroup,
  unlessSelected,
} from '../families';
import { PileAttempt } from '../model';
import { Attr, PlayState } from '../play';
import { CORE_EVENTS, D, P, PLAYER_AHEAD_RULE, S, dilemmaList, names, playerAhead, speciesKey } from '../define';

// The Championship titles of batch 1 (#1515), A Bad Case of par'Mach to Galileo Grounded: the 48 titles
// of the 52 Championship piles that the other files of `titles/` lack, the most played first.

const { models, dilemma } = dilemmaList();

const BOTTOM_OF_DECK = 'a personnel placed on the bottom of the deck counts as killed';

const totalAttrs = (s: PlayState, k: number) => ([0, 1, 2] as Attr[]).reduce((t, a) => t + s.attr(k, a), 0);
/** "For each Persistent dilemma beneath this mission, this dilemma is cost -1." */
const lessPersistent = (cost: number) => (a: PileAttempt) => Math.max(0, cost - (a.table.persistentUnderMission ?? 0));

dilemma('Breaking the Ice', S, 3, 'unless', unlessGroup((s) => s.has(req('3 Geology')) || otherEquipment(s) >= 2, stopAll, '3 Geology or two non-Hand Weapon equipment'), {
});

// goesUnder: false, never beneath this mission: the bot assumes it is placed in your core, since the attempt holds neither your discard pile nor the points of your missions (#1534).
dilemma('Causal Recursion', S, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed in your core, and the 10 more points you need act past the attempt (#1478)',
});

dilemma('Dead Ringer', D, 3, 'bot-chooses', (s) => {
  s.botChoice(s.unstopped());
  s.stopAll();
}, {
  gap: 'your discard pile is not on the table, so you never replace the chosen personnel and all are stopped',
});

dilemma('Frozen by Fear', S, 5, 'unless', unless('2 Honor, Law, Medical, and Cunning>35 or Officer, 2 Science, and 2 Treachery', removeRandom(2)), {
  cost: lessPersistent(5),
});

dilemma('Flare of Rage', P, 5, 'unless', unless('Anthropology, Medical, 2 Security, and Strength>35 or 2 Archaeology, Transporters, and 2 Treachery', removeRandom(2)), {
  cost: lessPersistent(5),
});

dilemma('A Bad Case of par\'Mach', D, 3, 'choose', playerStops(2), { gap: 'the two cards you may draw are dropped' });

dilemma('Blended', P, 2, 'all-but-one', allButOne(hasAny('diplomacy', 'telepathy')));

dilemma('Arresting Display', D, 3, 'unless', unless('Anthropology, Security, and Telepathy or 2 Exobiology, Medical, and Cunning>38', stopAll), {
  gap: 'the interrupt that places it in your core is not modelled',
});

dilemma('A Taste of Armageddon', P, 4, 'random-select', (s) => {
  const first = s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k)));
  if (!first.length) {
    s.trace?.('  no personnel has a skill the mission requires: no effect');
    return;
  }
  s.kill(first);
  s.label('Discarded an interrupt');
  s.kill(s.select(1, s.unstopped().filter((k) => hasRequiredSkill(s, k))));
}, { category: '4f', assumption: 'the bot always discards an interrupt, so a second personnel is killed' });

dilemma('Ardent Predator', S, 2, 'unless-selected', unlessSelected(2, 'Exobiology and Cunning>11 or Strength>13', (s, sel) => s.kill(sel)));

dilemma('Divergent Goals', P, 2, 'unless-selected', unlessSelected(3, 'Anthropology, Geology, and Integrity>17', stopAll, 'Biology, Officer, and 2 Transporters'));

dilemma('Assassination Attempt', P, 4, 'select-each-without', selectEachWithout(2, hasAny('treachery'), 'kill'));

dilemma('Compromised Experiment', D, 1, 'random-select', (s) => {
  const title = s.attempt.table.eventDecayTitle;
  if (title) s.label(`Chose ${title}`);
  s.stop(s.select(s.attempt.table.eventDecayMax ?? 0));
}, {
  gap: 'the bot chooses the event with the highest Decay',
});

dilemma('Cornered', P, 3, 'unless', (() => {
  const branches = req('2 Astrometrics and 2 Navigation');
  return unlessGroup((s) => s.has(branches) || !!s.attempt.table.completedSpan4Mission, killRandom(2), '2 Astrometrics and 2 Navigation or a completed mission of span 4 or more');
})());

dilemma('Dead Weight', D, 3, 'own', (s) => s.stop(s.unstopped().filter((k) => !hasRequiredSkill(s, k))));

dilemma('Dignitaries and Witnesses', D, 4, 'unless', (() => {
  const branches = req('3 Leadership');
  const highRank = (s: PlayState) => s.unstopped().some((k) => keywordIs('admiral')(s, k) || keywordIs('general')(s, k));
  return unlessGroup((s) => highRank(s) || s.has(branches), thenReturns(stopAll), 'an Admiral or a General or 3 Leadership');
})());

dilemma('Distress Call', S, 9, 'stop-all', stopAll, { cost: (a) => Math.max(0, 9 - 3 * a.table.completedMissions) });

// No family fits: the selected personnel's Strength decides between a kill and no effect, and the stop
// spares the selected personnel.
dilemma('A Klingon Matter', P, 3, 'own', unless('2 Intelligence and Treachery or 2 Leadership and Cunning>32', (s) => {
  const [k] = s.select(1);
  s.trace?.(`  selects ${s.name(k)}`);
  if (s.attr(k, 2) >= 7) return;
  s.kill([k]);
  s.stopAll();
  s.returnsToPile();
}));

// No family fits: the species of the three selected decide between stopping all three and the player's choice.
dilemma('A Pattern of Lies', D, 2, 'own', rollsBeforeChoice(selectRandom(3, (s, sel) => {
  if (sel.every((k) => speciesKey(s, k) === speciesKey(s, sel[0]))) s.stop(sel);
  else s.stop(s.playerChooses(sel));
})));

dilemma('Adversarial Trial', S, 2, 'random-select', (s) => {
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('anthropology'), sk('programming')))));
  if (!s.live || !playerAhead(s.attempt)) return;
  s.label('You have more points');
  s.returnToHand(s.select(1));
}, { category: '2', assumption: `${PLAYER_AHEAD_RULE}, so a personnel returns to your hand only while you are ahead` });

dilemma('Alluring Spy', S, 2, 'unless', unless('Diplomacy, 2 Exobiology, and Strength>42 or Intelligence, 2 Leadership, and Cunning>38', thenReturns((s) =>
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('security'))))))));

// No family fits: the check reads the printed skills, and the effect moves the ship with every personnel
// aboard, the stopped ones too.
dilemma('Artificial Wormhole', S, 3, 'own', (() => {
  const branches = req('2 Leadership and 2 Officer or Engineer, Programming, and Cunning>33');
  return (s: PlayState) => {
    if (s.hasAmong(branches, s.unstopped(), true)) {
      s.trace?.('  the group has the requirements with no gained skill: no effect');
      return;
    }
    s.loseShip('moved');
  };
})(), { gap: 'the branch of this ship\'s Commander aboard is not read; the bot always moves the attempting ship' });

dilemma('Clashing Values', P, 2, 'select-each-without', selectEachWithout(3, hasAny('anthropology', 'science'), 'stop'));

dilemma('Code Forty-Seven', D, 2, 'choose', (s) => {
  const chosen = s.playerChooses(s.unstopped().filter((k) => iconIs('[cmd]')(s, k)));
  s.stop(chosen);
  if (chosen.reduce((t, k) => t + s.group[k].cost, 0) < 4) s.returnsToPile();
}, { assumption: 'the player stops one [Cmd] personnel' });

dilemma('Dangerous Liaisons', D, 4, 'unless', unless('2 Science and 2 Security or 3 Treachery', thenReturns(stopAll)));

dilemma('Edo Probe', D, 0, 'no-effect', noEffect, { status: 'ignore' });

dilemma('Elemental Instability', D, 3, 'own', (s) => {
  botChooses(s.attempt.table.trelliumD ?? 0, 'kill')(s);
  if (!s.live) return;
  unless('2 Engineer and 2 Science or 2 Acquisition and 2 Biology', (t) => t.stop(t.playerChooses(t.unstopped().filter((k) => iconIs('[cmd]')(t, k)), 2)))(s);
});

dilemma('Family', D, 3, 'reveal-or-else', revealOrElse('honor', 'treachery'), { gap: BOTTOM_OF_DECK });

dilemma('Formal Hearing', D, 7, 'unless', unless('Diplomacy, Intelligence, 2 Programming and Cunning>38 or 2 Honor, Law, and 2 Officer', stopRandom(3)), {
  cost: () => 7 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('Accelerated Aging', D, 2, 'changes-later', (s) => {
  s.firstSkillOff = true;
  s.trace?.('  the personnel cannot use their first-listed skill until the end of the attempt');
});

dilemma('Aceton Assimilators', D, 4, 'choose', (s) => {
  s.label('Named Aceton Assimilators');
  playerStops(1)(s);
}, { category: '3', assumption: 'the bot names Aceton Assimilators, and one copy is beneath your missions' });

dilemma('After Action Report', D, 2, 'random-select', (s) => s.stop(s.select(s.attempt.table.completedMissions)));

dilemma('Arena', D, 3, 'random-select', selectRandom(1, (s, sel) => {
  if (totalAttrs(s, sel[0]) > 18) s.trace?.('  total attributes>18: no effect');
  else s.move(sel);
}));

// No family fits: the cheap personnel lose their skills for this dilemma's own check only.
dilemma('Bread and Circuses', D, 4, 'own', (() => {
  const check = unless('Archaeology, Diplomacy, and Honor or Exobiology, Transporters, and Treachery', stopAll);
  return (s: PlayState) => {
    s.skillsOffCostAtMost = 1;
    check(s);
    s.skillsOffCostAtMost = -1;
  };
})());

// No family fits: the bot's choice is among the Engineer or Programming personnel, and with none, all are stopped.
dilemma('Bynars\' Password', D, 3, 'own', (s) => {
  const ks = s.unstopped();
  if (ks.some((k) => s.skill(k, sk('engineer')) >= 2 || s.skill(k, sk('programming')) >= 2)) {
    s.trace?.('  a personnel has 2 Engineer or 2 Programming: no effect');
    return;
  }
  const candidates = ks.filter((k) => s.hasSkill(k, sk('engineer'), sk('programming')));
  if (candidates.length) s.stop(s.botChoice(candidates));
  else thenReturns(stopAll)(s);
});

dilemma('Captain\'s Holiday', P, 3, 'unless', unless('2 Archaeology or 2 Geology', thenReturns(stopAll)));

dilemma('Conflict of Interests', D, 4, 'unless', unless('3 Archaeology or Integrity>36', stopAll), {
  category: '4g',
  assumption: 'the bot plays the "unless" only; the return to its pile is dropped',
});

dilemma('Contaminating a Culture', D, 3, 'random-select', killRandom(1), {
  gap: 'your discard pile is not on the table, so you never prevent the kill',
});

dilemma('Covert Ambush', S, 3, 'no-effect', unlessGroup(
  (s) => s.unstopped().some((k) => s.skill(k, sk('engineer')) >= 2 || s.skill(k, sk('programming')) >= 2),
  (s) => s.notPlacedUnder('to your core'),
  'a personnel with 2 Engineer or a personnel with 2 Programming',
), {
  gap: 'placed in your core, it acts past the attempt (#1478)',
});

dilemma('Cultural Differences', P, 1, 'choose-or-else', chooseOrElse(hasAny('acquisition', 'anthropology'), killRandom(1)));

dilemma('Derelict Robot', D, 3, 'select-each-without', selectEachWithout(3, hasAny('diplomacy', 'engineer'), 'stop'));

// No family fits: a second check decides whether the selected personnel is stopped or killed.
dilemma('Disgraceful Assault', S, 3, 'own', (() => {
  const medical = req('Biology and 2 Medical');
  return unless('2 Security and Transporters', (s) => {
    const sel = s.select(1);
    if (s.has(medical)) s.stop(sel);
    else {
      s.kill(sel);
      s.stopAll();
    }
  });
})());

// No family fits: the player stops personnel one at a time until their costs total 4.
dilemma('Distraction', D, 2, 'choose', (s) => {
  let total = 0;
  while (total < 4 && s.live > 0) {
    const [k] = s.playerChooses(s.unstopped());
    s.stop([k]);
    total += s.group[k].cost;
  }
});

// No family fits: the bot chooses between two victims, each found by its own rule.
dilemma('Dramatis Personae', P, 3, 'own', unless('2 Medical and 2 Science or 2 Archaeology and Transporters', (s) => {
  const ks = s.unstopped();
  const fewest = Math.min(...ks.map((k) => s.group[k].skillDots));
  const lowest = Math.min(...ks.map((k) => totalAttrs(s, k)));
  const [byDots] = s.playerChooses(ks.filter((k) => s.group[k].skillDots === fewest));
  const [byAttrs] = s.playerChooses(ks.filter((k) => totalAttrs(s, k) === lowest));
  const victims = byDots === byAttrs ? [byDots] : [byDots, byAttrs];
  s.trace?.(`  the bot chooses between ${names(s, victims)}`);
  s.kill(s.botChoice(victims));
}));

// No family fits: Restricted Area's shape, with kills, and the bot chooses the third.
dilemma('Exposed Power Relay', D, 3, 'own', (s) => {
  const [k] = s.select(1);
  const remaining = s.live - 1;
  if (remaining < 9) {
    s.stop([k]);
    return;
  }
  s.kill([k]);
  s.kill(s.select(1));
  if (remaining >= 10) s.kill(s.botChoice(s.unstopped()));
}, { assumption: '"nine personnel remaining" is nine or more, counted after the first is selected (#1518)' });

dilemma('Ferengi Locator Bomb', P, 3, 'unless', unless('Navigation, Physics, and Programming or Acquisition, Treachery, and Cunning>32', killRandomThenStopAll), {
  gap: BOTTOM_OF_DECK,
});

dilemma('Financial Pitfall', D, 2, 'unless', unless('3 Acquisition or Cunning>35', thenReturns(stopAll)));

dilemma('Galileo Grounded', P, 2, 'unless', (() => {
  const branches = req('Medical, Security, and Transporters');
  return unlessGroup((s) => s.has(branches) || !!s.attempt.table.staffedShipAtMission, stopAll, 'Medical, Security, and Transporters or a staffed ship');
})());

export const CHAMPIONSHIP_BATCH_1_MODELS = models;
