import { SPECIES } from '../../../missionRequirements';
import { BOT_SKILLS, RequirementBranch } from '../../requirements';
import {
  handWeapons,
  thenReturns,
  allButOne,
  anyOfThree,
  both,
  botChooses,
  chooseOrElse,
  hasAny,
  killRandom,
  noEffect,
  playerBrigs,
  playerStops,
  req,
  selectRandom,
  sk,
  stopAll,
  stopRandom,
  unless,
  unlessGroup,
  unlessSelected,
} from '../families';
import { DEFAULT_STAFFING, PileAttempt } from '../model';
import { Attr, PlayState, skillName } from '../play';
import { D, NAMEABLE, P, S, dilemmaList, speciesKey } from '../define';

// The Championship titles of batch 2 (#1516), Gorgan to Rush Job: the 48 titles of the 52 Championship
// piles that the other files of `titles/` lack, the most played first.

const { models, dilemma } = dilemmaList();

const IN_CORE = 'it is placed in your core when it fires, and the top card of your deck each turn is dropped (#1478)';
const ON_SHIP = 'it is placed on your ship when it fires, and its Damage is dropped (#1478)';

/** "For each of your completed missions, this dilemma is cost -1." */
const lessCompleted = (cost: number) => (a: PileAttempt) => Math.max(0, cost - a.table.completedMissions);

const ATTRS: Attr[] = [0, 1, 2];

dilemma('Rapid Progress', D, 3, 'bot-names', (s) => {
  const named = s.lackedSkills(NAMEABLE).slice(0, 2);
  if (!named.length) {
    s.trace?.('  the group has every skill the bot can name: no effect');
    return;
  }
  s.label(`Removed ${named.length} card type${named.length === 1 ? '' : 's'}. Named ${named.map(skillName).join(', ')}`);
  s.stopAll();
}, { category: '6', assumption: 'the bot removes 2 card types and names 2 skills you lack' });

dilemma('Morphogenic Virus', D, 0, 'random-select', stopRandom(2), {
  cost: (a) => (a.personnel.filter((p) => p.affiliation !== 'dominion').length >= 6 ? 4 : 0),
});

dilemma('Gorgan', D, 2, 'stop-all', (s) => {
  const max = s.attempt.table.handCostMax;
  s.label(max === undefined ? 'Discarded a card' : `Discarded a card of cost ${max + 1}`);
  s.stopAll();
}, { category: '4d', assumption: 'the bot discards a card one more than the dearest card in your hand, so all are stopped' });

dilemma('Overindulgence', D, 2, 'bot-names', (s) => {
  const ks = s.unstopped();
  let named = 0;
  let most = -1;
  BOT_SKILLS.forEach((_, i) => {
    const levels = ks.reduce((t, k) => t + s.skill(k, i), 0);
    if (levels > most) [named, most] = [i, levels];
  });
  s.label(`Named ${skillName(named)}`);
  if (most >= 5) s.stopAll();
  else s.trace?.(`  ${most} ${skillName(named)}: no effect`);
});

// goesUnder: false, never beneath this mission: it is placed in your core.
dilemma('Pivotal Destiny', P, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed in your core, and the 10 more points you need act past the attempt (#1478)',
});

dilemma('Infestation', D, 2, 'choose', playerStops(1), { repeatable: true });

dilemma('Prisoner of the Exile', P, 4, 'player-brigs', playerBrigs(1));

dilemma('New Face', D, 2, 'any-of-three', anyOfThree((s, k) => ATTRS.some((a) => s.attr(k, a) > 7), 'player'));

dilemma('Neurogenic Field', P, 1, 'choose-or-else', chooseOrElse(hasAny('anthropology', 'medical'), killRandom(1)));

dilemma('If Shoe Fits, Wear It!', S, 4, 'player-brigs', playerBrigs(1));

dilemma('Night Terrors', S, 1, 'choose-or-else', chooseOrElse(hasAny('medical', 'science'), killRandom(1)));

dilemma('Local Trouble', S, 4, 'unless', (() => {
  const branches = req('Engineer, Leadership, 2 Security, and Cunning>38');
  return unlessGroup(
    (s) => s.has(branches) || ((s.attempt.ship?.weapons ?? 0) > 7 && !!s.attempt.table.headquartersOtherQuadrant),
    killRandom(2),
    'Engineer, Leadership, 2 Security, and Cunning>38 or Weapons>7 and a headquarters in another quadrant',
  );
})());

// No family fits: the bot names the skill, and the check pairs it with Anthropology or Science.
dilemma('Infinite Diversity', D, 2, 'bot-names', (s) => {
  const ks = s.unstopped();
  const groupHas = (i: number) => ks.some((k) => s.skill(k, i) > 0);
  const anthropology = sk('anthropology');
  const science = sk('science');
  const passes = (i: number) => groupHas(i) && (groupHas(anthropology) || groupHas(science));
  const named = s.lackedSkills(NAMEABLE)[0] ?? NAMEABLE.find((i) => !passes(i)) ?? NAMEABLE[0];
  s.label(`Discarded 2 cards. Named ${skillName(named)}`);
  const branch = (paired: number): RequirementBranch => {
    const skills = BOT_SKILLS.map(() => 0);
    skills[paired] = 1;
    skills[named] = 1;
    return { skills, attrs: [-1, -1, -1] };
  };
  if (s.has([branch(anthropology), branch(science)])) s.trace?.(`  the group has Anthropology or Science, and ${skillName(named)}: no effect`);
  else s.stopAll();
}, { category: '4b', assumption: 'the bot always discards 2 cards and names a skill you lack' });

// No family fits: the stops raise every attribute of the personnel left, until the end of the attempt.
dilemma('Parallel Romance', D, 2, 'own', (s) => {
  const selected = s.select(2);
  s.stop(selected);
  s.attrBonus += selected.length;
  s.trace?.(`  each personnel is attributes +${s.attrBonus} until the end of the attempt`);
});

dilemma('Greater Needs', P, 3, 'unless', unless('Anthropology, Diplomacy, Exobiology, and Integrity>30 or Leadership, Transporters, Treachery, and Strength>30', stopAll), {
  gap: ON_SHIP,
});

dilemma('Hazardous Materials', S, 3, 'random-select', (s) => {
  s.label('2 Trellium-D');
  killRandom(2)(s);
}, { category: '5b', assumption: 'the bot commands 2 Trellium-D, so two personnel are killed', gap: ON_SHIP });

dilemma('Organ Theft', P, 1, 'random-select', (s) => {
  if (s.attempt.table.onMission?.includes('Organ Theft')) killRandom(1)(s);
  else s.trace?.('  no copy is on the mission: no effect');
}, {
  category: '8',
  assumption: 'the bot commands no Vidiian, so it kills only when a copy is already on the mission',
  gap: 'the cards each opponent may draw act past the attempt (#1478)',
});

// goesUnder: false, never beneath this mission: it returns to the dilemma pile at the end of the turn.
dilemma('Overwhelmed', D, 4, 'changes-later', (s) => {
  s.overwhelmed = true;
  s.trace?.('  each later dilemma check that passes stops the personnel who supplied its skills');
}, {
  goesUnder: false,
  gap: 'the personnel who use their skills are the fewest, chosen greedily, who cover the skills of the branch that passes',
});

dilemma('Interstellar Exigence', D, 2, 'choose', (s) => {
  s.label('2 headquarters');
  both(chooseOrElse(hasAny('law'), null), stopRandom(2))(s);
}, { category: '3', assumption: 'the bot commands 2 headquarters missions' });

// No family fits: the turn sets the number of cards revealed, and each event or interrupt among them a stop.
dilemma('Reflections', S, 2, 'own', (s) => {
  const count = 3 * s.attempt.table.turn;
  s.label(`${count} [AU] cards`);
  const deck = s.attempt.table.drawDeck;
  let hits = 0;
  if (deck) {
    let size = deck.size;
    let left = deck.eventsAndInterrupts;
    for (let i = 0; i < count && size > 0; i++, size--) {
      if (s.rand() * size < left) {
        hits++;
        left--;
      }
    }
  } else for (let i = 0; i < count; i++) if (s.rand() < 1 / 3) hits++;
  s.trace?.(`  reveals ${hits} event${hits === 1 ? '' : 's'} or interrupts`);
  s.stop(s.botChoice(s.unstopped(), hits));
}, { category: '5b', assumption: 'the bot commands 3 [AU] cards for each turn of the game' });

dilemma('Picking Up the Pieces', P, 2, 'all-but-one', allButOne(hasAny('geology', 'programming')));

dilemma('Psychokinetic Control', D, 0, 'changes-later', (s) => {
  s.abilitiesOff = true;
  s.trace?.('  the personnel lose their gained skills and attribute increases until the end of the attempt');
});

// No family fits: the ship's staffing icons decide the second and the third stop.
dilemma('Rush Job', S, 3, 'own', (s) => {
  const staffing = s.attempt.ship?.staffing ?? DEFAULT_STAFFING;
  s.stop(s.playerChooses(s.unstopped()));
  if (staffing.length < 4 && s.live) s.stop(s.playerChooses(s.unstopped()));
  if (!staffing.includes('[cmd]') && s.live) s.stop(s.botChoice(s.unstopped()));
});

dilemma('Malfunctioning Generator', P, 4, 'unless', unless('2 Exobiology, 2 Physics, and Treachery or 2 Honor, 2 Medical, and Integrity>38', killRandom(2)), {
  cost: lessCompleted(4),
});

dilemma('Revealed', P, 3, 'choose', (s) => {
  s.label('Revealed a personnel with 2 Treachery');
  const chosen = s.playerChooses(s.unstopped(), 2);
  if (s.attempt.table.shipAtMission ?? true) s.stop(chosen, 'beamed aboard the ship');
  else s.kill(chosen);
}, { category: '5c', assumption: 'the bot reveals a personnel with 2 Treachery' });

dilemma('Hall of Mirrors', S, 4, 'unless', unless('Astrometrics, 2 Geology, and 2 Navigation or 2 Science, 2 Security, and Strength>38', killRandom(2)), {
  cost: lessCompleted(4),
});

dilemma('Isolated Detachment', S, 2, 'unless-selected', unlessSelected(3, 'Diplomacy, Programming, and Cunning>17', stopAll, 'Engineer, Physics, and 2 Security'));

dilemma('Lending a Hand', P, 2, 'bot-chooses', botChooses(2, 'stop'), {
  gap: 'the personnel you may place from your hand to join the attempt is not modelled',
});

// No family fits: the player weighs the bot's choice beamed aboard against two random stops.
dilemma('Mr. Tricorder', P, 3, 'own', (s) => {
  const [k] = s.botChoice(s.unstopped());
  if ((s.attempt.table.shipAtMission ?? true) && s.meetsWithout([k])) s.stop([k], 'placed aboard the ship');
  else s.stop(s.select(2));
}, { gap: 'the player places the chosen personnel aboard when the rest still meet the requirements, else takes two random stops' });

dilemma('Mugato', P, 2, 'unless', unless('2 Biology and 2 Medical or Leadership, 2 Security, and Strength>34', stopRandom(2)), { gap: IN_CORE });

dilemma('Murder Investigation', D, 3, 'any-of-three', anyOfThree(hasAny('security'), 'random'));

dilemma('Pest Control', S, 2, 'unless', unless('2 Engineer and 2 Exobiology or Transporters, 2 Treachery, and Cunning>34', stopRandom(2)), { gap: IN_CORE });

dilemma('Rascals', D, 2, 'unless', unlessGroup(
  (s) => s.unstopped().reduce((t, k) => t + s.group[k].cost, 0) < 17,
  (s) => killRandom(s.attempt.table.headquarters)(s),
  'a total cost<17',
));

dilemma('Heart to Heart', D, 0, 'random-select', selectRandom(2, (s, sel) => {
  if (sel.length === 2 && BOT_SKILLS.some((_, i) => s.skill(sel[0], i) > 0 && s.skill(sel[1], i) > 0)) s.stop(sel);
}));

dilemma('Information Extraction', D, 1, 'own', (() => {
  const branches = req('Intelligence, Officer, and Programming or Exobiology, Medical, and Treachery');
  return (s: PlayState) => {
    if (s.hasAmong(branches, s.unstopped(), true)) {
      s.trace?.('  the group has the requirements with no gained skill: no effect');
      return;
    }
    s.stop(s.select(1));
    if (!s.requirements.some((b) => b.attrs.some((t) => t >= 0))) return;
    s.label('Lost 5 points');
    s.requirements = s.requirements.map((b) => ({ ...b, attrs: b.attrs.map((t) => (t >= 0 ? t + 10 : t)) as [number, number, number] }));
    s.trace?.('  each attribute requirement is 10 more');
  };
})(), { category: '2', assumption: 'the bot loses 5 points whenever the mission has an attribute requirement' });

dilemma('Journey to the Past', P, 4, 'unless', unless('Anthropology, Geology, Science, and Cunning>34 or Diplomacy, Programming, Security, and Strength>32', (s) =>
  s.holdInCore(s.select(3))), { gap: 'it is placed in your core with the personnel when it fires' });

// No family fits: it ends the stack, and what it reads is the mission's skills.
dilemma('Lack of Preparation', D, 2, 'own', (s) => {
  if (s.has(s.requirements.map((b) => ({ skills: b.skills, attrs: [-1, -1, -1] })))) {
    s.trace?.('  the group has the skills of the mission: no effect');
    return;
  }
  s.stackEnded = true;
  s.trace?.('  the rest of the stack returns to the dilemma pile');
}, { gap: 'when it fires it returns to the dilemma pile with the rest of the stack, which `goesUnder` cannot say' });

// No family fits: the two selected cannot use their skills in the check, and the second branch reads the ship.
dilemma('Left Behind', S, 4, 'own', (() => {
  const biology = req('2 Biology and 2 Medical');
  const navigation = req('2 Navigation and Transporters');
  return selectRandom(2, (s, sel) => {
    const others = s.unstopped().filter((k) => !sel.includes(k));
    if (s.hasAmong(biology, others) || ((s.attempt.ship?.shields ?? 0) > 8 && s.hasAmong(navigation, others))) {
      s.trace?.('  the others have 2 Biology and 2 Medical or 2 Navigation, Transporters, and Shields>8: no effect');
      return;
    }
    s.move(sel);
  });
})());

// No family fits: the player picks the least harmful of three options.
dilemma('Logical Solution', S, 1, 'own', (s) => {
  if (s.attempt.table.handSize >= 1) {
    s.trace?.('  the player discards the hand: no effect on the attempt');
    return;
  }
  const ks = s.unstopped();
  const most = Math.max(...ks.map((k) => s.group[k].skillDots));
  const [k] = s.botChooses(ks.filter((j) => s.group[j].skillDots === most));
  if (s.meetsWithout([k])) {
    s.labelChosen([k]);
    s.kill([k]);
  } else s.stopAll();
}, { gap: 'the discarded hand is dropped; a personnel placed in the discard pile counts as killed' });

dilemma('Macrovirus', D, 4, 'random-select', (() => {
  const branches = req('2 Exobiology and 2 Science');
  const medicalSecurity = req('Medical and Security');
  return selectRandom(1, (s, sel) => {
    if (s.has(branches) || (handWeapons(s) > 0 && s.has(medicalSecurity))) s.stop(sel);
    else s.kill(sel);
  });
})(), {
  category: '8',
  assumption: 'the stop and the kill only',
  gap: ON_SHIP,
});

dilemma('Manufactured Triumph', D, 0, 'bot-names', (s) => {
  const ks = s.unstopped();
  const species = new Set(ks.map((k) => speciesKey(s, k)));
  if (species.size > 2) {
    s.trace?.(`  ${species.size} species: no effect`);
    return;
  }
  const count = species.size + 1;
  const discarded = SPECIES.filter((name) => !species.has(name.toLowerCase())).slice(0, count);
  s.label(`Discarded ${count} personnel: ${discarded.join(', ')}`);
  s.stopAll();
}, { category: '4b', assumption: 'the bot discards one more species than you have, up to 3' });

dilemma('Name and Shame', D, 0, 'bot-names', (s) => {
  const [k] = s.botChooses(s.unstopped());
  const title = s.name(k);
  s.label(`Named ${title}`);
  s.stop(s.unstopped().filter((j) => s.name(j) === title));
}, { cost: () => 3 });

dilemma('Neural Parasites', P, 2, 'bot-chooses', (s) => botChooses(s.attempt.table.headquarters, 'kill')(s), {
  cost: (a) => 2 + 3 * a.table.completedMissions,
});

dilemma('Nose to Nose', D, 0, 'random-select', selectRandom(2, (s, sel) => {
  if (sel.length === 2 && s.group[sel[0]].cost === s.group[sel[1]].cost) s.stop(sel);
}));

dilemma('Oh No!', D, 4, 'unless', unless('2 Astrometrics or Integrity>30 or Strength>30', thenReturns(stopAll)), {
  gap: 'the 5 points lost act past the attempt (#1478)',
});

// goesUnder: false, never beneath this mission: it returns to the dilemma pile once played.
dilemma('Ostensible Malfunction', S, 1, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it only adds a Damage dilemma to the stack, which is not modelled, and returns to the dilemma pile',
});

// goesUnder: false, never beneath this mission: it is placed on the mission and stays there.
dilemma('Pattern Loss', S, 1, 'changes-later', (s) => {
  s.patternLoss = true;
  s.trace?.('  a later dilemma requiring Transporters needs one more level of each of its skills');
}, { goesUnder: false });

dilemma('Quarren Labor Shortage', D, 2, 'unless', unlessGroup(
  (s) => 2 * s.unstopped().filter((k) => s.group[k].affiliation !== 'non-aligned').length >= s.live,
  thenReturns(stopAll),
  'at least half the personnel are not [NA]',
));

export const CHAMPIONSHIP_BATCH_2_MODELS = models;
