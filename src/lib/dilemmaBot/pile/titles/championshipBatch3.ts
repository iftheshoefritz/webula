import { BOT_SKILLS } from '../../requirements';
import {
  anyOfThree, chooseOrElse, handWeapons, hasAny, isCommand, killRandom, killRandomThenStopAll, noEffect, otherEquipment, playerBrigs, req,
  selectEachLacking, selectRandom, sk, stopAll, stopRandom, thenReturns, unless, unlessGroup,
} from '../families';
import { ATTR_NAMES, Attr, PlayState, skillName } from '../play';
import { D, P, S, dilemmaList, mostHeldSkill } from '../define';
import { PileAttempt } from '../model';

// The Championship titles of batch 3 (#1517): Shared Hallucination to Zero Hour. Each plays only what
// acts during the attempt (#1478); what it leaves out is in its `gap`.

const { models, dilemma } = dilemmaList();

/** A personnel placed in the discard pile, or on the top or the bottom of the deck, leaves for good: it counts as killed. */
const LEAVES = 'a personnel placed in the discard pile or on the deck counts as killed';

/** Category 3 (#1320): the bot commands three missions worth 40 or more points, and each takes 2 off the cost. */
const BOT_40_POINT_MISSIONS = 3;
const lessPer40PointMission = (printed: number) => () => Math.max(0, printed - 2 * BOT_40_POINT_MISSIONS);

/** Add `n` to each attribute requirement of the mission. */
const raiseAttrRequirements = (s: PlayState, n: number) => {
  s.requirements = s.requirements.map((b) => ({ ...b, attrs: b.attrs.map((t) => (t >= 0 ? t + n : t)) as [number, number, number] }));
};

dilemma('Shared Hallucination', D, 0, 'no-effect', noEffect, {
  gap: 'the player discards the whole hand, so no personnel is stopped',
});

dilemma('Shields Up!', S, 3, 'random-select', (s) => {
  const [k] = s.select(1);
  if (k === undefined) return;
  s.stop([k]);
  if (s.hasSkill(k, sk('astrometrics'), sk('navigation'))) s.stop(s.select(1));
});

dilemma('Shipboard Fire', S, 1, 'no-effect', noEffect, { gap: 'the table has no damage markers, so the ship is assumed to have none' });

dilemma('Shocking Betrayal', D, 2, 'own', (s) => {
  s.stop(s.playerChooses(s.unstopped()));
  const bot = (s.attempt.botAffiliations ?? []).filter((a) => a && a !== 'non-aligned');
  const targets = s.unstopped().filter((k) => bot.includes(s.group[k].affiliation));
  if (!targets.length) return;
  const [victim] = s.botChooses(targets);
  const affiliation = s.group[victim].affiliation;
  s.label(`Discarded a ${affiliation.charAt(0).toUpperCase()}${affiliation.slice(1)} personnel`);
  s.kill([victim]);
}, {
  category: '4f',
  assumption: 'the bot discards a personnel of its deck of an affiliation in the attempting group, when it has one',
  gap: 'the bot kills only an unstopped personnel, so the one the player stops is safe',
});

dilemma('Simulated Prey', S, 4, 'own', (s) => {
  const required = (k: number) => s.requirements.some((b) => b.skills.some((n, i) => n > 0 && s.skill(k, i) > 0));
  const first = s.select(1, s.unstopped().filter(required));
  if (!first.length) return;
  s.kill(first);
  s.label('Discarded an interrupt');
  s.kill(s.select(1, s.unstopped().filter(required)));
}, { category: '4f', assumption: 'the bot always discards an interrupt, so two personnel are killed' });

dilemma('Skeleton Crew', D, 0, 'no-effect', noEffect, { goesUnder: false, gap: 'it acts on later attempts at this mission' });

dilemma('Slightly Overbooked', S, 6, 'unless', (s) => {
  const ks = s.unstopped();
  if (ks.filter((k) => s.group[k].cost >= 4).length >= 3) {
    s.trace?.('  three personnel of cost 4 or more: no effect');
    return;
  }
  s.stop(ks.filter((k) => s.group[k].cost <= 2));
}, { cost: lessPer40PointMission(6), category: '3', assumption: 'the bot commands three missions worth 40 or more points, so it costs 0' });

dilemma('So Many Enemies', D, 3, 'any-of-three', anyOfThree(hasAny('treachery'), 'random'));

dilemma('Soul Searching', S, 3, 'random-select', (s) => s.holdInCore(s.select(1)), { goesUnder: false });

dilemma('Spatial Distortions', S, 3, 'choose', (s) => s.kill(s.playerChooses(s.unstopped())), { gap: LEAVES });

dilemma('Spatial Interphase', D, 6, 'bot-chooses', (s) => {
  s.kill(s.botChooses(s.unstopped().filter((k) => s.group[k].skillDots <= 3)));
}, { cost: lessPer40PointMission(6), category: '3', assumption: 'the bot commands three missions worth 40 or more points, so it costs 0' });

dilemma('Staffing Shortage', S, 3, 'random-select', selectRandom(1, (s, sel) => {
  if (sel.length && BOT_SKILLS.some((_, i) => s.skill(sel[0], i) >= 2)) s.stop(sel);
  else s.kill(sel);
}));

// The bot plays the "unless" only; the return to the hand is the bot's choice, with more points than the player.
dilemma('Standing Trial', P, 2, 'own', (s) => {
  s.stop(s.select(1, s.unstopped().filter((k) => s.hasSkill(k, sk('honor'), sk('transporters')))));
  if (!s.live) return;
  s.label('You have more points');
  s.returnToHand(s.select(1));
}, { category: '2', assumption: 'you have more points than the bot, so a personnel returns to the hand' });

dilemma('Stripped Down', D, 1, 'no-effect', noEffect, { gap: 'it moves the dilemmas beneath this mission, which acts past the attempt' });

dilemma('Suspected Minority', D, 3, 'random-select', (s) => {
  const species = new Set(s.unstopped().map((k) => s.group[k].species.join('/')));
  s.stop(s.select(species.size >= 4 ? 3 : 1));
});

// No family fits: the player stops two personnel who share a skill with the bot's choice, when that
// saves the attempt and the two can go.
dilemma('Suspicion', P, 1, 'own', (s) => {
  const [k] = s.botChooses(s.unstopped());
  if (k === undefined) return;
  if (!s.meetsWithout([k])) {
    const shares = s.unstopped().filter((j) => j !== k && BOT_SKILLS.some((_, i) => s.skill(j, i) > 0 && s.skill(k, i) > 0));
    for (let a = 0; a < shares.length; a++) {
      for (let b = a + 1; b < shares.length; b++) {
        if (s.meetsWithout([shares[a], shares[b]])) {
          s.stop([shares[a], shares[b]], 'they share a skill with the chosen personnel');
          return;
        }
      }
    }
  }
  s.stop([k]);
});

dilemma('Tak Tak Negotiations', P, 3, 'no-effect', noEffect, {
  status: 'ignore',
  assumption: 'the bot takes it out of its pile: it downloads a card the bot does not have',
});

dilemma('Telepathic Deception', D, 4, 'unless', unless('Biology, Exobiology, and Security or Telepathy and Cunning>28', thenReturns(stopAll)));

dilemma('Telepathology', D, 3, 'unless', unless('2 Diplomacy, 2 Medical, and Telepathy', stopRandom(3)), {
  gap: 'the skills of the personnel revealed from the player\'s deck are not read',
});

dilemma('Temporal Conduit', D, 2, 'no-effect', noEffect, { gap: 'it is placed on a completed mission and acts past the attempt (#1478)' });

dilemma('Temptation', D, 3, 'select-each', selectEachLacking(3, hasAny('honor', 'treachery'), 'stop'));

dilemma('The Big Goodbye', S, 2, 'random-select', (s) => {
  const sel = s.select(1);
  if (s.has(req('Diplomacy, Engineer, and Medical or Anthropology, Leadership, and Strength>30'))) s.stop(sel);
  else {
    s.kill(sel);
    s.stopAll();
  }
});

dilemma('The Captain\'s "Guest"', D, 2, 'bot-names', (s) => {
  const counts = new Map<string, number>();
  for (const k of s.unstopped()) for (const w of s.group[k].traits?.keywords ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  const named = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (named) s.label(`Named ${named.replace(/\b\w/g, (c) => c.toUpperCase())}`);
  anyOfThree((st, k) => !!named && (st.group[k].traits?.keywords ?? []).includes(named), 'player')(s);
});

dilemma('The Caretaker\'s "Guests"', D, 2, 'bot-chooses', (s) => s.kill(s.botChooses(s.unstopped())), {
  gap: `the replacement from the discard pile is not modelled; ${LEAVES}`,
});

dilemma('The Clown: Bitter Medicine', D, 4, 'bot-names', (s) => {
  const ks = s.unstopped();
  const held = BOT_SKILLS.map((_, i) => i).filter((i) => ks.some((k) => s.skill(k, i) > 0));
  if (!held.length) return;
  // The skill whose holders' -2 breaks the requirements, else the one most personnel hold.
  const breaks = held.find((i) => {
    const holders = ks.filter((k) => s.skill(k, i) > 0);
    s.addAttrs(holders, -2);
    const fails = !s.meetsWithout();
    s.addAttrs(holders, 2);
    return fails;
  });
  const named = breaks ?? mostHeldSkill(s, held);
  s.label(`Named ${skillName(named)}`);
  s.addAttrs(ks.filter((k) => s.skill(k, named) > 0), -2);
}, { goesUnder: false, gap: 'it returns to the dilemma pile at the end of the turn' });

dilemma('The Clown: Cloaking Device', D, 2, 'changes-later', (s) => {
  s.label('3 different equipment');
  raiseAttrRequirements(s, 9);
}, { goesUnder: false, category: '5b', assumption: 'the bot commands 3 different equipment, so each attribute requirement is 9 more' });

dilemma('The Clown: Go Away', D, 2, 'no-effect', noEffect, { goesUnder: false, gap: 'it acts when a later attempt at this mission begins' });

dilemma('The Clown: On His Throne', D, 4, 'bot-names', (s) => {
  const moved = (a: Attr) => s.requirements.map((b) => {
    const top = Math.max(...b.attrs);
    const attrs: [number, number, number] = [-1, -1, -1];
    if (top >= 0) attrs[a] = top;
    return { ...b, attrs };
  });
  if (!s.requirements.some((b) => b.attrs.some((t) => t >= 0))) return;
  const was = s.requirements;
  const options = [0, 1, 2] as Attr[];
  const fails = options.find((a) => {
    s.requirements = moved(a);
    const f = !s.meetsWithout();
    s.requirements = was;
    return f;
  });
  const named = fails ?? options.reduce((low, a) => (s.totalAttr(a) < s.totalAttr(low) ? a : low), 0 as Attr);
  s.label(`Named ${ATTR_NAMES[named]}`);
  s.requirements = moved(named);
}, { goesUnder: false, gap: 'its Consume is not paid; the alternate requirements in game text are not read' });

dilemma('The Dreamer and the Dream', D, 2, 'no-effect', noEffect, { goesUnder: false, gap: 'it discards the hand at the end of the turn (#1478)' });

dilemma('The First Duty', S, 1, 'choose-or-else', chooseOrElse(hasAny('honor', 'law'), killRandom(1)));

dilemma('The Needs of the Many', D, 4, 'random-select', killRandom(1, (s, k) => isCommand(s, k) || s.hasSkill(k, sk('science'))), {
  gap: 'the interrupts in the player\'s hand are not known, so no personnel more is stopped',
});

dilemma('The Phage', P, 3, 'choose', (s) => s.kill(s.playerChooses(s.unstopped())), { gap: LEAVES });

dilemma('Threading the Needle', S, 3, 'unless', unless('2 Navigation, 2 Officer, and Transporters or 2 Engineer, 2 Programming, and Strength>38', stopAll), {
  gap: 'when overcome it is placed on the mission until the end of the turn',
});

dilemma('Two-Dimensional Creatures', S, 1, 'choose-or-else', chooseOrElse(
  (s, k) => s.skill(k, sk('science')) >= 2 || s.hasSkill(k, sk('telepathy')),
  null,
), { gap: 'the placement on a mission, which limits later attempts, is not modelled' });

dilemma('Unbelievable Emergency', S, 4, 'bot-names', (s) => {
  const named = mostHeldSkill(s, BOT_SKILLS.map((_, i) => i));
  s.label(`Named ${skillName(named)}`);
  for (let h = 0; h < s.attempt.table.headquarters && s.live; h++) {
    const sel = s.select(2);
    s.kill(sel.filter((k) => s.skill(k, named) > 0));
    s.stop(sel.filter((k) => s.skill(k, named) <= 0));
  }
});

dilemma('Unfair Terms', P, 6, 'random-select', selectRandom(3, (s, sel) => s.kill(sel.filter((k) => s.group[k].cost <= 2))), {
  cost: lessPer40PointMission(6),
  category: '3',
  assumption: 'the bot commands three missions worth 40 or more points, so it costs 0',
});

dilemma('Ungracious Hosts', P, 2, 'brig', playerBrigs, {
  status: 'ignore',
  assumption: 'the bot takes it out of its pile: it reads the bot\'s hand',
});

dilemma('Unknown Microorganism', P, 3, 'unless', unlessGroup(
  (s) => s.has(req('Biology, Medical, and Science')) || (otherEquipment(s) > 0 && s.has(req('2 Security'))),
  thenReturns(killRandomThenStopAll),
  'Biology, Medical, and Science or 2 Security and a non-Hand Weapon equipment',
));

dilemma('V\'Ger', S, 3, 'unless', unless('Diplomacy, Exobiology, and Cunning>35 or Archaeology, Programming, and Strength>35', stopAll), {
  gap: 'the placement on the ship and its Damage act past the attempt (#1478)',
});

dilemma('Vastly Outnumbered', S, 3, 'unless', unlessGroup(
  (s) => s.has(req('Anthropology and 2 Honor or Integrity>28')) || handWeapons(s) >= 2,
  thenReturns(stopAll),
  'Anthropology and 2 Honor or two Hand Weapons or Integrity>28',
), { gap: 'the 5 points lost act past the attempt' });

dilemma('Vian Test', P, 5, 'brig', playerBrigs, { gap: 'the cards the bot may draw are not modelled' });

dilemma('Warm Welcome', D, 0, 'choose', (s) => {
  const ks = s.unstopped();
  if (ks.filter((k) => isCommand(s, k)).length >= 3 || s.has(req('2 Officer'))) {
    s.trace?.('  3 [Cmd] personnel or 2 Officer: no effect');
    return;
  }
  s.kill(s.playerChooses(ks));
  s.returnsToPile();
}, { cost: (a: PileAttempt) => (a.personnel.length >= 6 ? 3 : 0), gap: LEAVES });

dilemma('We\'ll Never Know', P, 3, 'unless', unlessGroup((s) => s.has(req('3 Physics')) || otherEquipment(s) >= 2, stopAll, '3 Physics or two non-Hand Weapon equipment'));

dilemma('Weight of Command', D, 3, 'random-select', selectRandom(3, (s, sel) => {
  s.stop(sel.filter((k) => s.hasSkill(k, sk('officer'))));
  s.move(sel.filter((k) => s.alive[k] && s.group[k].affiliation === 'romulan'));
}));

dilemma('What Lies Beneath', S, 3, 'unless', unless('Archaeology, Geology, and Honor or Anthropology, Treachery, and Cunning>32', killRandomThenStopAll), { gap: LEAVES });

dilemma('Zero Hour', P, 1, 'changes-later', (s) => {
  const events = s.attempt.table.coreEvents ?? 0;
  if (events) raiseAttrRequirements(s, 3 * events);
  s.trace?.(`  each attribute requirement is ${3 * events} more`);
}, { goesUnder: false, gap: 'its Consume is not paid; it returns to the dilemma pile at the end of the turn' });

export const CHAMPIONSHIP_BATCH_3_MODELS = models;
