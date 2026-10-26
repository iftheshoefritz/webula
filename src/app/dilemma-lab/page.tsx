import type { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CardData, loadCards } from '../../lib/loadCards';
import { DilemmaId, OPPONENT_DILEMMAS, collectorsKey } from '../../lib/dilemmaBot/opponentPile';
import DilemmaLabClient, { LabDeck, LabMission, LabPersonnel } from '../../components/DilemmaLabClient';

export const metadata: Metadata = { title: 'Dilemma bot lab – Webula' };

interface TournamentDeckRow {
  event: string;
  deckName: string;
  player: string;
  file: string;
}

/** A page to test the dilemma bot (#1282): set a mission, a crew and N, and see the stack it chooses. */
export default function DilemmaLabPage() {
  const { data } = loadCards();

  // A card can have more than one version with the same name; the lab keeps the first.
  const missionsByName = new Map<string, LabMission>();
  for (const c of data) {
    if (c.type !== 'mission' || c.missiontype === 'h' || missionsByName.has(c.originalName)) continue;
    missionsByName.set(c.originalName, { name: c.originalName, requirements: String(c.skills) });
  }
  const missions = Array.from(missionsByName.values());

  const seen = new Set<string>();
  const personnel: LabPersonnel[] = [];
  for (const c of data) {
    if (c.type !== 'personnel' || seen.has(c.originalName)) continue;
    seen.add(c.originalName);
    personnel.push({
      originalName: c.originalName,
      name: c.name,
      cost: String(c.cost),
      integrity: String(c.integrity),
      cunning: String(c.cunning),
      strength: String(c.strength),
      skills: String(c.skills),
    });
  }

  const dilemmaCards = Object.fromEntries(
    OPPONENT_DILEMMAS.map((d) => [d.id, data.find((c) => c.collectorsinfo === collectorsKey(d.collectorsInfo))]),
  ) as Record<DilemmaId, CardData>;

  const folder = join(process.cwd(), 'public', 'tournament-decks');
  const index: TournamentDeckRow[] = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf-8'));
  const personnelNames = new Set(personnel.map((p) => p.originalName));
  const missionNames = new Set(missions.map((m) => m.name));
  const decks: LabDeck[] = index.map((row) => {
    const deck: LabDeck = { label: `${row.event}: ${row.deckName} (${row.player})`, personnel: [], missions: [] };
    let section = '';
    for (const line of readFileSync(join(folder, row.file), 'utf-8').split('\n')) {
      if (/^\w+:\s*$/.test(line)) {
        section = line.trim();
        continue;
      }
      const name = /^\d+\t(.+?)\s*$/.exec(line)?.[1];
      if (!name) continue;
      if (section === 'Deck:' && personnelNames.has(name) && !deck.personnel.includes(name)) deck.personnel.push(name);
      if (section === 'Missions:' && missionNames.has(name)) deck.missions.push(name);
    }
    return deck;
  });

  return <DilemmaLabClient missions={missions} personnel={personnel} decks={decks} dilemmaCards={dilemmaCards} />;
}
