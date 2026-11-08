import { BOT_SKILLS } from '../../requirements';
import { botChooses, chooseOrElse, either, hasAny, killRandom, killRandomThenStopAll, noEffect, revealOrElse, selectRandom, selectUntil, sk, stopAll, unless } from '../families';
import { Attr, skillName } from '../play';
import { D, P, PLAYER_AHEAD_RULE, S, dilemmaList, mostHeldSkill, names, playerAhead } from '../define';

// The 33 titles of the 14 Beginner Decks of trekcc.org (`public/beginner-decks/`, #1513) that the other
// piles of the registry lack.

const { models, dilemma } = dilemmaList();

/** The Genetically Enhanced personnel the bot commands under the assumption of category 5b (#1320): 3 × the turn. */
const geneticallyEnhanced = (turn: number) => 3 * turn;

dilemma('Abrasive Allies', P, 2, 'bot-chooses', (s) => {
  const own = new Set(s.group.map((p) => p.affiliation).filter(Boolean)).size;
  const bot = s.attempt.botAffiliations;
  if (bot && own > bot.length) {
    s.trace?.(`  ${own} affiliations against the bot's ${bot.length}: no effect`);
    return;
  }
  if (bot) s.label(`Affiliations: ${bot.map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}`);
  s.stop(s.botChoice(s.unstopped()));
}, {
  category: '5a',
  assumption: 'the bot\'s count is the affiliations of the personnel of its deck',
  gap: 'it counts the affiliations of the attempting personnel only, not every personnel you command',
});

// goesUnder: false, never beneath this mission: it is placed on top of its owner's dilemma pile.
dilemma('All-Consuming Evil', P, 2, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it acts only through a Consume dilemma, which is not modelled',
});

dilemma('Bold Plan', D, 0, 'no-effect', noEffect, { gap: 'it acts on the dilemmas beneath your other missions' });

dilemma('Brave Words', D, 2, 'bot-chooses', (s) => {
  s.label('Bot\'s missions: more span');
  s.stop(s.botChoice(s.unstopped()));
}, { category: '3', assumption: 'your missions have less total span than the bot\'s' });

dilemma('Brothers', S, 2, 'unless', unless('Engineer and Integrity>40 or Transporters and Cunning>40', (s) => {
  s.label('Discarded an Android');
  s.stopAll();
}), { category: '4a', assumption: 'the bot discards an Android, so each attribute requirement is 10 more' });

dilemma('Cardassian Processing', D, 2, 'unless', unless('Diplomacy, Honor, and Transporters or Law, Security, and Strength>30', (s) => {
  s.label('Commands Cardassia Prime');
  s.brig(s.select(1));
}), { category: '3', assumption: 'the bot commands Cardassia Prime, so the personnel goes to its brig' });

// No family fits: the personnel is the one with the fewest skill dots, and the effect reads its dots.
dilemma('Casualties', D, 3, 'own', (s) => {
  const ks = s.unstopped();
  const fewest = Math.min(...ks.map((k) => s.group[k].skillDots));
  const [k] = s.playerChooses(ks.filter((j) => s.group[j].skillDots === fewest));
  if (fewest < 4) s.kill([k]);
  else s.stop([k]);
});

dilemma('Compassionate Interference', P, 2, 'reveal-or-else', revealOrElse('biology', 'geology'));

dilemma('Dark Page', D, 2, 'choose-or-else', chooseOrElse(hasAny('anthropology', 'exobiology'), killRandom(1)));

dilemma('Entanglement', D, 1, 'changes-cost', (s) => s.trace?.('  the bot may spend 3 more on this stack'), { extraBudget: 3 });

dilemma('Environmental Contaminants', P, 4, 'unless', unless('Biology, 2 Diplomacy, and 2 Science or 2 Engineer, 2 Exobiology, and Cunning>38', killRandom(2)), {
  cost: (a) => (playerAhead(a) ? 1 : 4),
  category: '2',
  assumption: `${PLAYER_AHEAD_RULE}, so it costs 1 while you are ahead and 4 at 0 points`,
});

dilemma('Hard of Heart', P, 2, 'random-select', selectRandom(2, (s, sel) => {
  const geology = sel.some((k) => s.hasSkill(k, sk('geology')));
  const sum = (a: Attr) => sel.reduce((t, k) => t + s.attr(k, a), 0);
  if ((geology && sum(1) > 11) || sum(2) > 13) s.trace?.('  Geology and Cunning>11 or Strength>13: no effect');
  else s.kill(sel);
}));

dilemma('Healing Hand', D, 2, 'choose-or-else', chooseOrElse(hasAny('medical'), null), {
  gap: 'the return to the dilemma pile is not modelled; it always goes under',
});

dilemma('Honorable Pursuit', D, 2, 'choose-or-else', chooseOrElse(hasAny('honor'), null), {
  gap: 'the return to the dilemma pile is not modelled; it always goes under',
});

dilemma('Hull Breach', S, 2, 'reveal-or-else', revealOrElse('astrometrics', 'navigation'));

dilemma('Know Thy Enemy', P, 2, 'own', (s) => {
  const strength = (s.attempt.table.hand ?? []).reduce((t, h) => t + h.strength, 0);
  s.label(`Revealed personnel with Strength ${strength + 1}`);
  killRandomThenStopAll(s);
}, { category: '4d', assumption: 'the bot reveals personnel with 1 more Strength than those in your hand' });

dilemma('Last Gasp', D, 3, 'reveal-or-else', revealOrElse('leadership', 'officer'));

// No family fits: how many personnel return to the hand depends on how many remain once the first is
// selected. It decides before it acts, since a stopped personnel can no longer return.
dilemma('Mark of Gideon', D, 3, 'own', (s) => {
  const [k] = s.select(1);
  const remaining = s.live - 1;
  if (remaining < 9) {
    s.stop([k]);
    return;
  }
  s.returnToHand([k]);
  // The second and the third choice in one label: the bot picks the third as if the second were gone.
  s.returnToHand(s.botChoice(s.unstopped(), remaining >= 10 ? 2 : 1));
}, { assumption: '"nine personnel remaining" is nine or more, counted after the first is selected (#1518)' });

dilemma('No Kill I', P, 2, 'stop-all', stopAll);

dilemma('Overburdened', D, 3, 'no-effect', noEffect, { gap: 'it reads the top of your own dilemma pile, which the bot does not know' });

dilemma('Peremptory Plea', D, 1, 'choose-or-else', (s) => {
  s.label(`${geneticallyEnhanced(s.attempt.table.turn)} Genetically Enhanced personnel`);
  chooseOrElse(hasAny('biology'), null)(s);
}, {
  category: '5b',
  assumption: 'the bot commands 3 Genetically Enhanced personnel per turn, so the next dilemma costs that much less',
  discountsNext: (a) => geneticallyEnhanced(a.table.turn),
});

dilemma('Pillage and Plunder', P, 1, 'choose-or-else', chooseOrElse(hasAny('archaeology', 'treachery'), killRandom(1)));

dilemma('Security Weapons', D, 3, 'random-select', selectRandom(1, (s, sel) => {
  if (s.group[sel[0]].cost <= 2) s.kill(sel);
  else s.stop(sel);
}));

dilemma('Show Trial', D, 2, 'random-select', (s) => {
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('leadership'), sk('medical')))));
  if (!s.live || !playerAhead(s.attempt)) return;
  s.label('You have more points');
  s.stop(s.select(1));
}, { category: '2', assumption: `${PLAYER_AHEAD_RULE}, so a second personnel is stopped only while you are ahead` });

dilemma('Space Seed', P, 9, 'unless', unless('3 Security and Strength>40 or 2 Telepathy and Cunning>40', (s) => {
  s.label('Commands To Rule in Hell');
  s.brig(s.select(2));
}), {
  cost: (a) => Math.max(0, 9 - geneticallyEnhanced(a.table.turn)),
  category: '5b',
  assumption: 'the bot commands 3 Genetically Enhanced personnel per turn (5b) and To Rule in Hell (5c), so it takes the two personnel',
});

// goesUnder: false, never beneath this mission: it returns to the dilemma pile at the end of the turn.
dilemma('The Clown: Celebration', D, 1, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it acts when an attempt fails, and returns at the end of the turn (#1478)',
});

// goesUnder: false, never beneath this mission: it is placed on the mission and stays there.
dilemma('The Clown: Fear Incarnate', D, 1, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed on the mission and acts when a later Clown dilemma is faced (#1478)',
});

// No family fits: the bot names a skill, and the second selection depends on the first personnel's attributes.
// goesUnder: false, never beneath this mission: it returns to the dilemma pile once played.
dilemma('The Clown: Guillotine', D, 2, 'bot-names', (s) => {
  const ks = s.unstopped();
  const held = (i: number) => ks.some((k) => s.skill(k, i) > 0);
  const required = BOT_SKILLS.map((_, i) => i).filter((i) => held(i) && s.requirements.some((b) => b.skills[i] > 0));
  const named = mostHeldSkill(s, required.length ? required : BOT_SKILLS.map((_, i) => i));
  s.label(`Named ${skillName(named)}`);
  const holders = ks.filter((k) => s.skill(k, named) > 0);
  const [first] = s.select(1, holders);
  if (first === undefined) return;
  const selected = [first];
  if (!([0, 1, 2] as Attr[]).some((a) => s.attr(first, a) > 6)) selected.push(...s.select(1, holders.filter((k) => k !== first)));
  s.trace?.(`  selects ${names(s, selected)}`);
  s.kill(selected);
}, { goesUnder: false });

dilemma('The Needs of the Few', S, 2, 'bot-chooses', (s) =>
  botChooses(1, s.attempt.table.completedPlanetMission ? 'kill' : 'stop', hasAny('engineer', 'security'))(s));

dilemma('The Phase', D, 2, 'choose-or-else', chooseOrElse(
  either((s, k) => s.hasSkill(k, sk('officer')), (s, k) => s.group[k].species.includes('android') || s.group[k].hologram),
  selectUntil((s, sel) => sel.reduce((t, k) => t + s.group[k].cost, 0) >= 4, (s, sel) => s.move(sel)),
), { gap: 'the [Cmd] icon is not read, so any Officer qualifies; the personnel placed on the deck count as moved' });

// No family fits: the player may stop a second personnel of the same cost to save the first.
dilemma('Toe to Toe', D, 1, 'own', (s) => {
  const [k] = s.select(1);
  const partners = s.unstopped().filter((j) => j !== k && s.group[j].cost === s.group[k].cost);
  if (partners.length) s.stop([k, ...s.playerChooses(partners)]);
  else s.kill([k]);
});

// goesUnder: false, never beneath this mission: it is placed on the mission and stays there.
dilemma('Tragic Turn', D, 3, 'no-effect', noEffect, {
  goesUnder: false,
  gap: 'it is placed on the mission and acts when a later dilemma is overcome (#1478)',
});

dilemma('Unwanted Guests', D, 2, 'bot-names', (s) => {
  const lacked = s.lackedSkills().slice(0, 2);
  if (!lacked.length) {
    s.trace?.('  the group has every skill: no effect');
    return;
  }
  s.label(`Discarded a personnel with ${lacked.map(skillName).join(', ')}`);
  s.stopAll();
}, { category: '4e', assumption: 'the bot discards a personnel with skills the group lacks' });

export const BEGINNER_DECK_MODELS = models;
