import { BOT_SKILLS } from '../requirements';
import {
  Play,
  allButOne,
  anyOfAffiliation,
  attrAbove,
  attrBelow,
  botChooses,
  brigRandom,
  chooseOrElse,
  costAtMost,
  either,
  hasAny,
  killRandom,
  killRandomThenStopAll,
  loseShip,
  noEffect,
  playerStops,
  req,
  selectRandom,
  selectUntil,
  sk,
  stopAll,
  stopRandom,
  unless,
  unlessGroup,
} from './families';
import { BotSideCategory, DilemmaModel, PileAttempt } from './model';
import { Attr, ATTR_NAMES, PlayState, skillName } from './play';

// The dilemma registry of the pilot of #1320: every title of Think Tank 50's (Matt S, 2026 Trek Masters)
// and of Cardassian in Gamma Quadrant (Matthias Weller, 2026 European Continental). Each entry names its
// family, so `familyReport` can count how far the families reach.

type Kind = DilemmaModel['kind'];
const P: Kind = 'planet';
const S: Kind = 'space';
const D: Kind = 'dual';

interface Extras {
  cost?: (a: PileAttempt) => number;
  leads?: boolean;
  goesUnder?: boolean;
  category?: BotSideCategory;
  assumption?: string;
  gap?: string;
}

const MODELS: DilemmaModel[] = [];
function dilemma(title: string, kind: Kind, printedCost: number, family: string, play: Play, extras: Extras = {}) {
  MODELS.push({ title, kind, printedCost, family, play, status: 'play', goesUnder: extras.goesUnder ?? true, ...extras });
}

const lowCost = (a: PileAttempt) => a.personnel.filter((p) => p.cost <= 2).length;
/** The assumption of category 1 (#1320): the bot's core holds 6 events, none of them Decay or Paranoia events. */
export const CORE_EVENTS = 6;
/** The four skills Counterinsurgency Program and Garak Has Some Issues do not let the bot name. */
const UNNAMEABLE = ['acquisition', 'intelligence', 'law', 'telepathy'].map(sk);
const NAMEABLE = BOT_SKILLS.map((_, i) => i).filter((i) => !UNNAMEABLE.includes(i));

/** Category 4a: the fewest discards, up to the cap, that make the group fail `attribute>30+5×discards`. */
export const discardCap = (a: PileAttempt) => (a.table.completedMissions >= 1 ? 6 : 3);
function discardToRaise(attr: Attr): Play {
  return (s) => {
    const total = s.totalAttr(attr);
    const cap = discardCap(s.attempt);
    let discards = 0;
    while (discards < cap && total > 30 + 5 * discards) discards++;
    if (total > 30 + 5 * discards) discards = 0; // no discard within the cap makes the group fail
    if (discards) s.label(`Discarded ${discards} card${discards === 1 ? '' : 's'}`);
    if (total <= 30 + 5 * discards) s.stopAll();
    else s.trace?.(`  ${ATTR_NAMES[attr]} ${total}>${30 + 5 * discards}: no effect`);
  };
}

/** The skill of `among` the most unstopped personnel have: what the bot names when a named skill stops its holders. */
function mostHeldSkill(s: PlayState, among: number[]): number {
  const ks = s.unstopped();
  let best = among[0];
  let bestCount = -1;
  for (const i of among) {
    const count = ks.filter((k) => s.skill(k, i) > 0).length;
    if (count > bestCount) [best, bestCount] = [i, count];
  }
  return best;
}

const speciesKey = (s: PlayState, k: number) => s.group[k].species.join('/');

// ---- Think Tank 50's ----

dilemma('Adopted Authority', D, 3, 'random-select', selectRandom(1, (s, [k]) => {
  if ([0, 1, 2].some((a) => s.attr(k, a as Attr) < 5)) s.stop([k]);
  else s.stop([k, ...s.select(1, s.unstopped().filter((j) => j !== k))]);
}), { gap: 'the return to the dilemma pile is not modelled; it always goes under' });

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
}, { goesUnder: false });

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

dilemma('Hard Time', P, 3, 'random-select', selectRandom(1, (s, sel) => s.holdInCore(sel)), { goesUnder: false });

dilemma('Harsh Conditions', P, 3, 'changes-later', (s) => {
  const named: number[] = [];
  for (let h = 0; h < s.attempt.table.headquarters; h++) {
    const i = mostHeldSkill(s, BOT_SKILLS.map((_, j) => j).filter((j) => !named.includes(j)));
    named.push(i);
    s.blockedSkills.add(i);
  }
  if (named.length) s.label(`Named ${named.map(skillName).join(', ')}`);
}, { goesUnder: false });

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

dilemma('Inferiority', D, 3, 'no-effect', noEffect, { goesUnder: false, gap: 'the extra dilemmas of a later attempt are dropped (#1478)' });

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
  s.kill(s.botChooses(s.unstopped(), s.attempt.table.completedSpaceMission ? 1 : 2));
});

dilemma('Occupational Hazards', D, 3, 'unless', unless('2 Acquisition or 2 Treachery', killRandom(1)), {
  gap: 'the return to the dilemma pile is not modelled; it always goes under',
});

dilemma('Old Differences', D, 4, 'random-select', stopRandom(2), { cost: (a) => (a.mission.points <= 35 ? 3 : 4) });

dilemma('Outclassed', S, 3, 'unless', unlessGroup(
  (s) => !!s.attempt.ship && (s.attempt.ship.range > 8 || s.attempt.ship.weapons > 8),
  stopAll,
  'Range>8 or Weapons>8',
), { gap: '"unused" Range is read as the ship\'s printed Range' });

dilemma('Outmatched', P, 1, 'unless', (s) => {
  if (s.totalAttr(1) > 15) s.trace?.('  Cunning>15: no effect');
  else s.stopAll();
}, { gap: 'the bot consumes no dilemma: the Cunning requirement stays 15' });

dilemma('Personal Duty', S, 2, 'all-but-one', allButOne(hasAny('leadership', 'officer')));

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
}, { gap: '"nine personnel remaining" is read as nine or more, counted after the first is selected' });

dilemma('Secret Identity', D, 0, 'bot-chooses', botChooses(1, 'discard'), {
  gap: 'the replacement from the player\'s deck is not modelled: the chosen personnel only leaves',
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
  else s.brig(s.botChooses(sel));
}), { cost: (a) => Math.max(0, 6 - lowCost(a)) });

dilemma('The Dal\'Rok', D, 3, 'unless', unlessGroup(
  (s) => s.unstopped().reduce((t, k) => t + s.group[k].cost, 0) > 17,
  (s) => s.kill(s.select(s.attempt.table.headquarters)),
  'total cost>17',
), { gap: 'the return to the dilemma pile is not modelled; it always goes under' });

dilemma('The Killing Game', S, 8, 'unless', unless('2 Engineer, 2 Medical, and Cunning>38 or 2 Diplomacy, Leadership, and 2 Physics', brigRandom(2)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('The Weak Will Perish', D, 3, 'random-select', selectRandom(1, (s, sel) => s.kill(sel)));

dilemma('Timescape', D, 0, 'no-effect', noEffect, { goesUnder: false, gap: 'it stops a later attempt at this mission, not this one' });

dilemma('Tsiolkovsky Infection', S, 8, 'unless', unless('2 Anthropology, 2 Programming, and Cunning>38 or 2 Biology, Exobiology, and 2 Medical', killRandom(3)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

dilemma('Unconventional Consideration', D, 2, 'choose-or-else', chooseOrElse(hasAny('acquisition', 'intelligence', 'law', 'telepathy'), stopAll));

dilemma('Vault of Tomorrow', P, 1, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'the dilemma it adds to the top of the stack is not modelled',
});

dilemma('Well-Prepared Defenses', D, 2, 'bot-chooses', (s) => {
  s.label('Bot\'s missions: more points');
  s.stop(s.botChooses(s.unstopped()));
}, { category: '3', assumption: 'the bot\'s missions are worth more points than yours' });

dilemma('Where No One Has Gone Before', S, 4, 'unless', unless('Astrometrics, Navigation, Physics, and Cunning>34 or Exobiology, Leadership, Medical, and Integrity>32', loseShip), { goesUnder: false });

dilemma('Whisper in the Dark', P, 8, 'unless', unless('2 Geology, 2 Physics, and Cunning>38 or 2 Honor, 2 Officer, and Transporters', killRandom(3)), {
  cost: () => 8 - CORE_EVENTS,
  category: '1',
  assumption: 'the bot\'s core holds 6 events',
});

// ---- Cardassian in Gamma Quadrant, the titles Think Tank 50's lacks ----

dilemma('Alternatives to Fighting', S, 3, 'own', (s) => {
  if (s.attempt.mission.nebula) return;
  const navigation = s.unstopped().some((k) => s.hasSkill(k, sk('navigation')));
  if (navigation && (s.attempt.ship?.weapons ?? 0) > 7) return;
  s.move(s.unstopped()); // the ship goes to a Nebula mission, with its crew
}, { gap: 'assumes a Nebula mission is in play, so the ship always can move' });

dilemma('An Issue of Trust', D, 4, 'all-but-one', allButOne(hasAny('honor', 'treachery')));

dilemma('Archaic Snare', S, 4, 'unless', unless('Archaeology, 2 Security, and Cunning>32 or 3 Engineer, Navigation, and Physics', stopAll));

dilemma('Artistic License', D, 2, 'choose', playerStops((s) => {
  const under = new Set(s.attempt.table.underMission);
  for (const title of s.faced.slice(0, -1)) under.add(title);
  return under.size;
}), { gap: 'every dilemma faced before it in this stack counts as beneath the mission' });

dilemma('Back Room Dealings', D, 2, 'choose-or-else', chooseOrElse(either(hasAny('treachery'), attrBelow(0, 4)), killRandom(1)));

dilemma('Back to Basics', D, 4, 'assumed-fires', (s) => {
  s.label('Shuffled back 14 personnel and ships');
  s.stopAll();
}, { category: '6', assumption: 'the bot\'s discard pile holds 14 or more personnel and ships' });

dilemma('Becalmed', D, 0, 'random-select', selectRandom(3, (s, sel) => {
  s.stop(sel.filter((k) => ([0, 1, 2] as Attr[]).some((a) => s.attr(k, a) > 6)));
}), { cost: (a) => a.mission.span });

dilemma('Center of Attention', D, 3, 'unless', unlessGroup(
  (s) => s.has(req('3 Security')) || s.unstopped().some((k) => /\bquark\b/i.test(s.name(k))),
  (s) => {
    s.kill(s.botChooses(s.unstopped().filter((k) => s.hasSkill(k, sk('treachery')))));
    s.stopAll();
  },
  '3 Security or Quark',
), { gap: 'the Hand Weapon branch is not modelled' });

dilemma('Chula: The Dice', D, 3, 'unless', unlessGroup((s) => {
  const ks = s.unstopped();
  return ks.some((a) => s.attr(a, 0) > 6 && ks.some((b) => b !== a && s.attr(b, 1) > 6 && ks.some((c) => c !== a && c !== b && s.attr(c, 2) > 6)));
}, stopAll, 'Integrity>6, Cunning>6 and Strength>6 on three personnel'));

dilemma('Covert Extraction', S, 1, 'choose-or-else', chooseOrElse(hasAny('intelligence', 'transporters'), killRandom(1)));

dilemma('Cutting Remark', D, 2, 'random-select', stopRandom(1));

dilemma('Divisive Patron', D, 1, 'no-effect', noEffect, { gap: 'the cost change acts at later attempts' });

dilemma('Excalbian Drama', P, 0, 'discard-to-raise', discardToRaise(0), {
  category: '4a',
  assumption: 'the bot discards up to 3 cards, or 6 once you have completed a mission',
});

dilemma('Fesarius Bluff', S, 0, 'discard-to-raise', discardToRaise(1), {
  category: '4a',
  assumption: 'the bot discards up to 3 cards, or 6 once you have completed a mission',
});

dilemma('Full Security Alert', D, 3, 'random-select', (s) => {
  const security = s.unstopped().filter((k) => s.hasSkill(k, sk('security')));
  const [k] = s.select(1, security);
  if (k === undefined) return;
  s.stop([k]);
  if (s.group[k].cost <= 2) s.stop(s.select(2, security.filter((j) => j !== k)));
});

dilemma('Garak Has Some Issues', D, 4, 'bot-names', (s) => {
  const named = mostHeldSkill(s, NAMEABLE);
  s.label(`Named ${skillName(named)}`);
  const sel = s.select(3);
  s.stop(sel.filter((k) => s.skill(k, named) > 0));
  s.kill(sel.filter((k) => s.alive[k] && s.group[k].affiliation === 'cardassian'));
});

dilemma('Gomtuu Shock Wave', S, 3, 'unless', unless('2 Diplomacy and Integrity>32 or Telepathy and Integrity>35', stopAll));

dilemma('Guess Who\'s Coming to Dinner?', D, 2, 'choose-or-else', chooseOrElse(either(hasAny('diplomacy'), attrAbove(0, 6)), killRandom(1)));

dilemma('Inquest', S, 3, 'select-until', selectUntil(
  (s, sel) => sel.reduce((t, k) => t + s.group[k].skillDots, 0) >= 8,
  (s, sel) => s.stop(sel),
));

dilemma('Insurrection', D, 0, 'changes-later', (s) => {
  if (s.attempt.mission.points < 30) return;
  s.requirements = s.requirements.map((b) => ({ ...b, attrs: b.attrs.map((t) => (t >= 0 && t < 32 ? t + 10 : t)) as [number, number, number] }));
  s.trace?.('  each attribute requirement below 32 is 10 more');
}, { cost: () => 1, goesUnder: false });

dilemma('Magnetic Field Disruptions', S, 1, 'choose-or-else', chooseOrElse(hasAny('astrometrics', 'navigation'), killRandom(1)));

dilemma('Miner Revolt', P, 3, 'select-until', selectUntil(
  (s, sel) => sel.reduce((t, k) => t + s.group[k].cost, 0) >= 6,
  (s, sel) => s.stop(sel),
));

dilemma('Nothing to Lose', D, 4, 'own', (s) => {
  const ks = s.unstopped();
  if (ks.some((k) => s.hasSkill(k, sk('acquisition')) && s.attr(k, 0) < 4)) return;
  const hologram = ks.find((k) => s.group[k].hologram && s.meetsWithout([k]));
  if (hologram !== undefined) s.kill([hologram]);
  else s.stopAll();
});

dilemma('Ominous Presence', D, 4, 'own', (s) => {
  const [k] = s.select(1, s.unstopped().filter((j) => s.hasSkill(j, sk('diplomacy'), sk('security'))));
  if (k === undefined) return;
  const same = s.unstopped().filter((j) => j !== k && speciesKey(s, j) === speciesKey(s, k));
  s.stop([k, ...s.playerChooses(same)]);
}, {
  cost: (a) => {
    const counts = new Map<string, number>();
    for (const p of a.personnel) counts.set(p.species.join('/'), (counts.get(p.species.join('/')) ?? 0) + 1);
    return Math.max(...counts.values()) >= 5 ? 2 : 4;
  },
});

dilemma('Pitching In', D, 4, 'choose', (s) => {
  s.stop(s.playerChooses(s.unstopped().filter((k) => s.hasSkill(k, sk('leadership'), sk('security')))));
  s.stop(s.playerChooses(s.unstopped().filter((k) => s.hasSkill(k, sk('engineer'), sk('programming')))));
}, { cost: (a) => (lowCost(a) >= 4 ? 1 : 4) });

dilemma('Racial Tension', D, 0, 'random-select', selectRandom(2, (s, sel) => {
  if (sel.length === 2 && speciesKey(s, sel[0]) !== speciesKey(s, sel[1])) s.stop(sel);
}));

dilemma('Rogue Borg Ambush', P, 3, 'unless', unless('Intelligence and Cunning>35', killRandomThenStopAll), {
  gap: 'the Hand Weapon branch is not modelled',
});

dilemma('Royale Casino: Craps', D, 2, 'unless', unlessGroup((s) => s.attempt.table.handHasCunning7Or11, stopAll, 'a personnel with Cunning 7 or 11 in hand'), {
  category: '2',
  assumption: 'you have more points; the points the bot may score later are dropped (#1478)',
});

dilemma('Shaken Confidence', D, 4, 'unless', unless('2 Intelligence', stopRandom(3)), {
  category: '1',
  assumption: 'the bot\'s core holds no Paranoia event, so the cost stays 4',
});

dilemma('Tactical Disadvantage', S, 2, 'assumed-fires', (s) => {
  s.label('Revealed ships with more Weapons than your Shields');
  killRandomThenStopAll(s);
}, { category: '4d', assumption: 'the ships in the bot\'s hand always have more Weapons' });

dilemma('Talosian Trial', P, 0, 'no-effect', noEffect, { gap: 'the dilemma it adds to the stack is not modelled' });

dilemma('The Oracle\'s Punishment', D, 5, 'bot-chooses', botChooses(2, 'stop'));

dilemma('Triage', P, 1, 'choose-or-else', chooseOrElse(hasAny('biology', 'medical'), killRandom(1)));

// ---- The Chula pile (#1507): the 7 Chula titles the two Championship piles lack ----
// Each draws its randoms and traces its lines as the Chula bot's `playStack` did, so the hand-worked cases
// of #1282 and the partner cases of #1357 hold on the pile play.

const names = (s: PlayState, ks: number[]) => ks.map((k) => s.name(k)).join(', ');

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

// ---- Lookup ----

/** The version suffixes of a deck line or a card name that one model covers, such as "*VP" or "(IDR)". */
const VERSION_SUFFIX = /\s*(\*VP|\*A|\*|\((IDR|ID|FOW|R2|SR|AC)\))\s*$/i;

/** The title of the model that covers a deck line's card name: "Sylvia *VP" and "Sylvia" are one model. */
export function pileTitleOf(name: string): string {
  let title = name.trim();
  while (VERSION_SUFFIX.test(title)) title = title.replace(VERSION_SUFFIX, '').trim();
  return title;
}

export const REGISTRY: ReadonlyMap<string, DilemmaModel> = new Map(MODELS.map((m) => [m.title, m]));

/** The model of a card name, by its title less the version suffix, or undefined for a title the registry lacks. */
export function modelOf(name: string): DilemmaModel | undefined {
  return REGISTRY.get(pileTitleOf(name));
}

/** The titles of each family, for the pilot's report. */
export function familyReport(titles: Iterable<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const title of titles) {
    const model = REGISTRY.get(title);
    const family = model ? model.family : 'missing';
    out.set(family, [...(out.get(family) ?? []), title]);
  }
  return out;
}
