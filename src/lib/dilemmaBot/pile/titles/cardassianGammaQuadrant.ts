import { allButOne, attrAbove, attrBelow, botChooses, chooseOrElse, either, handWeapons, hasAny, killRandom, killRandomThenStopAll, noEffect, playerStops, req, selectRandom, selectUntil, sk, stopAll, stopRandom, unless, unlessGroup } from '../families';
import { Attr, skillName } from '../play';
import { DilemmaModel } from '../model';
import { D, NAMEABLE, P, S, addableModels, dilemmaList, discardToRaise, lowCost, mostHeldSkill, speciesKey } from '../define';

// The 33 titles of Cardassian in Gamma Quadrant (Matthias Weller, 2026 European Continental) that Think
// Tank 50's lacks: the second pilot pile of #1320.

const { models, dilemma } = dilemmaList();

dilemma('Alternatives to Fighting', S, 3, 'own', (s) => {
  if (s.attempt.mission.nebula) return;
  const navigation = s.unstopped().some((k) => s.hasSkill(k, sk('navigation')));
  if (navigation && (s.attempt.ship?.weapons ?? 0) > 7) return;
  if (s.attempt.table.nebulaMission ?? true) s.move(s.unstopped()); // the ship goes to a Nebula mission, with its crew
  else s.stopAll(); // no Nebula mission to go to; the Damage on the ship is dropped (#1478)
});

dilemma('An Issue of Trust', D, 4, 'all-but-one', allButOne(hasAny('honor', 'treachery')));

dilemma('Archaic Snare', S, 4, 'unless', unless('Archaeology, 2 Security, and Cunning>32 or 3 Engineer, Navigation, and Physics', stopAll));

dilemma('Artistic License', D, 2, 'choose', playerStops((s) => {
  const under = new Set(s.attempt.table.underMission);
  for (const title of s.faced.slice(0, -1)) under.add(title);
  return under.size;
}), { assumption: 'every dilemma faced before it in this stack counts as beneath the mission (#1518)' });

dilemma('Back Room Dealings', D, 2, 'choose-or-else', chooseOrElse(either(hasAny('treachery'), attrBelow(0, 4)), killRandom(1)));

dilemma('Back to Basics', D, 4, 'assumed-fires', (s) => {
  s.label('Shuffled back 14 personnel and ships');
  s.stopAll();
}, { category: '6', assumption: 'the bot\'s discard pile holds 14 or more personnel and ships' });

dilemma('Becalmed', D, 0, 'random-select', selectRandom(3, (s, sel) => {
  s.stop(sel.filter((k) => ([0, 1, 2] as Attr[]).some((a) => s.attr(k, a) > 6)));
}), { cost: (a) => a.mission.span });

dilemma('Center of Attention', D, 3, 'unless', unlessGroup(
  (s) => s.has(req('3 Security')) || (handWeapons(s) > 0 && s.has(req('Cunning>28'))) || s.unstopped().some((k) => /\bquark\b/i.test(s.name(k))),
  (s) => {
    s.kill(s.botChoice(s.unstopped().filter((k) => s.hasSkill(k, sk('treachery')))));
    s.stopAll();
  },
  '3 Security or a Hand Weapon and Cunning>28 or Quark',
));

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

// goesUnder: false, never beneath this mission: it is placed on the mission, and when the mission is completed it goes beneath another mission.
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

dilemma('Rogue Borg Ambush', P, 3, 'unless', unlessGroup(
  (s) => s.has(req('Intelligence and Cunning>35')) || (handWeapons(s) > 0 && s.has(req('Strength>35'))),
  killRandomThenStopAll,
  'Intelligence and Cunning>35 or a Hand Weapon and Strength>35',
));

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

// No family fits: at reveal, the bot takes the planet dilemma beneath the player's missions that does the
// attempt most harm, and faces it next (#1518).
const talosianFits = (m: DilemmaModel) => m.kind !== 'space';
const NO_TITLES: string[] = [];
dilemma('Talosian Trial', P, 0, 'adds-dilemma', (s) => {
  const added = s.addBestOnTop(addableModels(s.attempt.table.underPlayerMissions ?? NO_TITLES, talosianFits));
  if (added) s.label(`Added ${added}`);
}, { assumption: 'the bot chooses at reveal the planet dilemma beneath your missions that does the attempt most harm (#1518)' });

dilemma('The Oracle\'s Punishment', D, 5, 'bot-chooses', botChooses(2, 'stop'));

dilemma('Triage', P, 1, 'choose-or-else', chooseOrElse(hasAny('biology', 'medical'), killRandom(1)));

export const CARDASSIAN_GQ_MODELS = models;
