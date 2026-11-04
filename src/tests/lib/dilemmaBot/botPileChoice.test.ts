// Issue #1520: the choices of the bot's dilemma pile, and the pile and the bot side of a chosen deck.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CHULA_PILE_CHOICE, botPileChoices, botPileDeckOf } from '../../../lib/dilemmaBot/botPileChoice';
import { botPileOf } from '../../../lib/dilemmaBot/pile/pile';
import { DeckList } from '../../../types';

const ROOT = process.cwd();
const BEGINNER = join(ROOT, 'public/beginner-decks');
const index: { deckName: string; player: string; file: string }[] = JSON.parse(readFileSync(join(BEGINNER, 'index.json'), 'utf-8'));
const beginner = index.map((d) => ({ id: `beginner:${d.file}`, name: `${d.deckName} - ${d.player}` }));
const beginnerTexts = new Map(index.map((d) => [`beginner:${d.file}`, readFileSync(join(BEGINNER, d.file), 'utf-8')]));

const COVERED = 'Dilemmas:\n2\tChula: Echoes\n';
const UNCOVERED = 'Dilemmas:\n2\tChula: Echoes\n1\tNo Such Dilemma\n';

describe('botPileChoices (#1520)', () => {
  it('offers Chula first, then every Beginner Deck in index order, all of them covered', () => {
    const choices = botPileChoices(beginner, [], beginnerTexts);
    expect(choices[0]).toEqual(CHULA_PILE_CHOICE);
    expect(choices.slice(1)).toEqual(beginner);
    expect(readdirSync(BEGINNER).filter((f) => f.endsWith('.txt'))).toHaveLength(beginner.length);
  });

  it('puts the covered Championship decks after the Beginner Decks, and leaves out an uncovered deck and a deck with no text', () => {
    const champ = [
      { id: 'championship:a.txt', name: 'A' },
      { id: 'championship:b.txt', name: 'B' },
      { id: 'championship:c.txt', name: 'C' },
    ];
    const texts = new Map([
      ['championship:a.txt', UNCOVERED],
      ['championship:b.txt', COVERED],
      [beginner[0].id, beginnerTexts.get(beginner[0].id)!],
    ]);
    expect(botPileChoices([beginner[0], beginner[1]], champ, texts).map((c) => c.id)).toEqual(['chula', beginner[0].id, 'championship:b.txt']);
  });

  it('offers Chula alone with no deck', () => {
    expect(botPileChoices([], [], new Map())).toEqual([CHULA_PILE_CHOICE]);
  });
});

describe('botPileDeckOf (#1520)', () => {
  const row = (collectorsinfo: string, originalName: string, type: string, affiliation = '') => ({
    collectorsinfo,
    originalName,
    name: originalName.toLowerCase(),
    type,
    affiliation,
    pile: type === 'dilemma' ? 'dilemmaPile' : type === 'mission' ? 'mission' : 'drawDeck',
  });
  const rows = [
    row('P1', 'Worf', 'personnel', 'Klingon'),
    row('P2', 'Picard', 'personnel', 'Federation'),
    row('M1', 'Moab IV', 'mission'),
    row('D1', 'Chula: Echoes', 'dilemma'),
    row('D2', 'Chula: The Dice', 'dilemma'),
    row('D3', 'Edo Probe', 'dilemma'),
  ];
  const text = 'Deck:\n1\tWorf\n1\tPicard\nMissions:\n1\tMoab IV\nDilemmas:\n3\tChula: Echoes\n2\tChula: The Dice\n1\tEdo Probe\n';
  const parsed: DeckList = Object.fromEntries(
    [['P1', 1], ['P2', 1], ['M1', 1], ['D1', 3], ['D2', 2], ['D3', 1]].map(([key, count]) => {
      const r = rows.find((x) => x.collectorsinfo === key)!;
      return [key, { count: count as number, row: { ...r, count } }];
    })
  );

  it('keeps only the dilemmas, and drops the titles the pile ignores, so the counts are the played titles', () => {
    const pile = { played: ['Chula: Echoes', 'Chula: Echoes', 'Chula: Echoes', 'Chula: The Dice', 'Chula: The Dice'], ignored: ['Edo Probe'], missing: [] };
    const bot = botPileDeckOf(text, parsed, rows, pile);
    expect(Object.keys(bot.pile).sort()).toEqual(['D1', 'D2']);
    expect(Object.values(bot.pile).reduce((n, e) => n + e.count, 0)).toBe(pile.played.length);
    expect(Object.values(bot.pile).every((e) => e.row.pile === 'dilemmaPile')).toBe(true);
  });

  it('drops a title the registry lacks too, by default from botPileOf', () => {
    const bot = botPileDeckOf(text, parsed, rows);
    const fromRegistry = botPileOf(text);
    const dropped = new Set([...fromRegistry.ignored, ...fromRegistry.missing]);
    expect(Object.values(bot.pile).every((e) => !dropped.has(e.row.originalName))).toBe(true);
    expect(Object.values(bot.pile).reduce((n, e) => n + e.count, 0)).toBe(fromRegistry.played.length);
  });

  it('gives the affiliations of the Deck: section\'s personnel', () => {
    expect(botPileDeckOf(text, parsed, rows).affiliations).toEqual(['federation', 'klingon']);
  });
});
