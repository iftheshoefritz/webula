'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OPPONENT_DILEMMAS } from '../lib/dilemmaBot/opponentPile';
import { meetsRequirements, parseRequirementBranches } from '../lib/dilemmaBot/requirements';
import {
  PlayerChoice,
  botPersonnelOf,
  requirementProfileOf,
  seededRandom,
  partnerGroupOf,
} from '../lib/dilemmaBot/simulator';
import { ThreadedSearchResponse, useSearchWorker } from '../lib/dilemmaBot/useSearchWorker';
import { LabMissionFacts, drawLabTitles, labPileAttemptOf } from '../lib/dilemmaBot/pile/labAttempt';
import { DAMAGE_WEIGHTS, PileResult } from '../lib/dilemmaBot/pile/model';
import { playPileStack } from '../lib/dilemmaBot/pile/play';
import { REGISTRY } from '../lib/dilemmaBot/pile/registry';
import { BEAM_DEFAULTS, PileStackScore, countPileStacks } from '../lib/dilemmaBot/pile/search';
import type { CardData } from '../lib/loadCards';
import CardPreview from '../app/decks/practice/CardPreview';
import { previewEnlargesElement } from '../app/decks/practice/previewSize';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH, TableCardImage } from '../app/decks/practice/TableCard';
import { HOLD_DELAY_MS, HOVER_DELAY_MS } from '../app/decks/practice/useCardHold';
import type { PreviewSide } from '../app/decks/practice/useCardHold';
import type { CardInstance } from '../app/decks/practice/tableReducer';

/**
 * A mission, with the fields of its row that the gains read (`attemptedMissionOf`), as the table passes
 * them, and its span and Nebula flag for the pile bot's `PileMission`.
 */
export interface LabMission extends LabMissionFacts {
  name: string;
}

export interface LabPersonnel {
  originalName: string;
  name: string;
  cost: string;
  integrity: string;
  cunning: string;
  strength: string;
  skills: string;
  /** The game text, only for a personnel with a gain or a skill loss the bot reads (`personnelGainsOf`, `personnelLossOf`). */
  gametext?: string;
  /** The printed traits a partner test reads, for every personnel, each only when not empty. */
  affiliation?: string;
  species?: string;
  keywords?: string;
  icons?: string;
}

export interface LabDeck {
  label: string;
  personnel: string[];
  missions: string[];
  /**
   * Whether the condition of Sphere 117 holds for the deck (#1363): a Sphere 117 in its draw deck and
   * every mission of it, the headquarters too, a [DQ] mission. The lab then assumes the Mostly
   * Assimilated skill loss (#1360) does not apply.
   */
  sphere117?: boolean;
}

interface Props {
  missions: LabMission[];
  personnel: LabPersonnel[];
  decks: LabDeck[];
  /** The card data row of each dilemma of the pile, by title, for its image. */
  dilemmaCards: Record<string, CardData>;
}

const stackText = (stack: ReadonlyArray<string>) => (stack.length ? stack.join(' → ') : '(no dilemmas)');
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
/** A title as a test id: "Chula: The Game" is `chula-the-game`. */
const slugOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The lab's search result, and the thread it ran on. */
type LabResponse = Extract<ThreadedSearchResponse, { kind: 'lab' }>;

/** One traced sample play of the chosen stack. */
interface Sample {
  lines: string[];
  labels: PileResult['labels'];
}

export default function DilemmaLabClient({ missions, personnel, decks, dilemmaCards }: Props) {
  const byName = useMemo(() => new Map(personnel.map((p) => [p.originalName, p])), [personnel]);

  const [missionName, setMissionName] = useState('');
  const [crew, setCrew] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [deckIndex, setDeckIndex] = useState<number | null>(null);
  const [crewSize, setCrewSize] = useState(9);
  const [n, setN] = useState(6);
  const [gameOnMission, setGameOnMission] = useState(0);
  const [choice, setChoice] = useState<PlayerChoice>('best');
  const [drawn, setDrawn] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [message, setMessage] = useState('');
  const [chosen, setChosen] = useState<LabResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [searchError, setSearchError] = useState('');
  const requestId = useRef(0);

  const deck = deckIndex === null ? null : decks[deckIndex];
  // The deck's missions, in the order of its list.
  const deckMissions = useMemo(
    () =>
      deck
        ? deck.missions.map((name) => missions.find((m) => m.name === name)).filter((m): m is LabMission => !!m)
        : [],
    [deck, missions],
  );
  const mission = deckMissions.find((m) => m.name === missionName);
  const sphere117 = Boolean(deck?.sphere117);
  const branches = useMemo(() => (mission ? parseRequirementBranches(mission.requirements) : null), [mission]);
  const crewGroup = useMemo(
    () =>
      partnerGroupOf(
        crew
          .map((name) => byName.get(name))
          .filter((p): p is LabPersonnel => !!p)
          .map((p) => botPersonnelOf(p, mission, undefined, sphere117)),
      ),
    [crew, byName, mission, sphere117],
  );
  const crewPersonnel = crewGroup.personnel;
  const meets = branches ? meetsRequirements(branches, crewPersonnel.map(requirementProfileOf)) : false;
  const under = Math.max(0, crew.length - n);
  // The pile bot's attempt (#1509): the crew as the pile's dilemmas read it, at the lab's plain table.
  const attempt = useMemo(
    () =>
      mission
        ? labPileAttemptOf(
            crew.map((name) => byName.get(name)).filter((p): p is LabPersonnel => !!p),
            mission,
            { gameOnMission, choice, sphere117 },
          )
        : null,
    [crew, byName, mission, gameOnMission, choice, sphere117],
  );
  const stackCount = useMemo(() => (attempt ? countPileStacks(attempt, drawn, n) : 0), [attempt, drawn, n]);

  // A result belongs to the inputs it came from: when one changes, the result clears in render.
  const inputs = [missionName, crew, n, gameOnMission, choice, drawn] as const;
  const [resultInputs, setResultInputs] = useState(inputs);
  if (inputs.some((input, i) => input !== resultInputs[i])) {
    setResultInputs(inputs);
    setChosen(null);
  }

  const search = useSearchWorker((response) => {
    if (response.id !== requestId.current || response.kind !== 'lab') return;
    setChosen(response);
    setRunning(false);
  }, (error) => {
    setRunning(false);
    setSearchError(`The search failed: ${error}`);
  });

  const run = () => {
    if (!attempt) return;
    requestId.current++;
    setSearchError('');
    setRunning(true);
    search({ id: requestId.current, kind: 'lab', attempt, drawn, n, seed });
  };

  const draw = () => {
    const next = seed + 1;
    setSeed(next);
    setDrawn(drawLabTitles(n, gameOnMission, under, seededRandom(next)));
  };

  // A checked title adds one copy; unchecking it takes every copy out of the draw.
  const toggleTitle = (title: string) =>
    setDrawn((d) => (d.includes(title) ? d.filter((x) => x !== title) : [...d, title]));

  // The mission list follows the deck: a new deck starts on its first mission that the bot reads.
  const chooseDeck = (index: number | null) => {
    setDeckIndex(index);
    const next = index === null ? undefined : decks[index];
    const readable = next
      ? next.missions.find((name) => parseRequirementBranches(missions.find((m) => m.name === name)?.requirements ?? ''))
      : undefined;
    setMissionName(readable ?? '');
    setCrew([]);
    setMessage('');
  };

  const randomCrew = () => {
    if (!deck) return;
    const rand = seededRandom(Date.now() >>> 0);
    const target = mission;
    const targetBranches = branches;
    if (!target || !targetBranches) {
      setMessage('Choose a mission of this deck whose requirements the bot reads.');
      return;
    }
    const size = Math.min(crewSize, deck.personnel.length);
    for (let t = 0; t < 1000; t++) {
      const pool = deck.personnel.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const group = pool.slice(0, size);
      const profiles = partnerGroupOf(group.map((name) => botPersonnelOf(byName.get(name)!, target, undefined, sphere117))).personnel.map(requirementProfileOf);
      if (meetsRequirements(targetBranches, profiles)) {
        setCrew(group);
        setMessage('');
        return;
      }
    }
    setMessage(`No random crew of ${size} from this deck meets the requirements of ${target.name}.`);
  };

  const addPersonnel = () => {
    if (!byName.has(addName)) {
      setMessage(`No personnel has the name "${addName}".`);
      return;
    }
    setCrew((c) => [...c, addName]);
    setAddName('');
    setMessage('');
  };

  const samples = useMemo((): Sample[] => {
    if (!chosen || !attempt) return [];
    const stack = chosen.result.best.stack;
    const models = stack.map((t) => REGISTRY.get(t)!);
    return [1, 2, 3].map((s) => {
      const lines: string[] = [];
      const result = playPileStack(attempt, models, seededRandom(1000 + s), (line) => lines.push(line), drawn.length - stack.length);
      return { lines, labels: result.labels };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  return (
    <div className="page-container p-4 flex flex-col gap-6 text-text-primary max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Dilemma bot lab</h1>
        <p className="text-sm text-text-secondary">
          Choose a deck, one of its missions, a crew and N. The bot draws from its Chula pile and chooses an ordered dilemma stack with the pile bot&apos;s beam search, the search the practice table uses (#1509).
        </p>
      </header>

      <section className="surface p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">1. The deck and the mission</h2>
        <select
          className="input max-w-md"
          value={deckIndex ?? ''}
          onChange={(e) => chooseDeck(e.target.value === '' ? null : Number(e.target.value))}
          data-testid="lab-deck"
        >
          <option value="">Choose a Championship deck</option>
          {decks.map((d, i) => (
            <option key={d.label} value={i}>
              {d.label}
            </option>
          ))}
        </select>
        {deck && (
          <select
            className="input max-w-md"
            value={missionName}
            onChange={(e) => setMissionName(e.target.value)}
            data-testid="lab-mission"
          >
            <option value="">Choose a mission of this deck</option>
            {deckMissions.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {parseRequirementBranches(m.requirements) ? '' : ' (the bot cannot read its requirements)'}
              </option>
            ))}
          </select>
        )}
        {mission && (
          <p className="text-sm" data-testid="lab-requirements">
            Requirements: {mission.requirements}{' '}
            {branches ? (
              <span className="text-accent">(the bot reads these)</span>
            ) : (
              <span className="text-red-400">(the bot cannot read these)</span>
            )}
          </p>
        )}
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. The crew</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm flex items-center gap-1">
            Size
            <input
              className="input w-16"
              type="number"
              min={1}
              max={20}
              value={crewSize}
              onChange={(e) => setCrewSize(Number(e.target.value))}
            />
          </label>
          <button className="btn-primary" onClick={randomCrew} disabled={!mission} data-testid="lab-random-crew">
            Random crew from this deck
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="input max-w-md"
            list="lab-personnel"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Personnel name"
          />
          <datalist id="lab-personnel">
            {personnel.map((p) => (
              <option key={p.originalName} value={p.originalName} />
            ))}
          </datalist>
          <button className="btn-primary" onClick={addPersonnel}>
            Add
          </button>
          {crew.length > 0 && (
            <button className="text-sm underline text-text-secondary" onClick={() => setCrew([])}>
              Remove all
            </button>
          )}
        </div>
        {message && <p className="text-sm text-red-400">{message}</p>}
        {crew.length > 0 && (
          <table className="text-sm w-full" data-testid="lab-crew">
            <thead className="text-text-secondary text-left">
              <tr>
                <th>Personnel</th>
                <th>Cost</th>
                <th>I / C / S</th>
                <th>Skills</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {crew.map((name, k) => {
                const p = byName.get(name)!;
                return (
                  <tr key={`${name}-${k}`} className="border-t border-default">
                    <td>{name}</td>
                    <td>{p.cost}</td>
                    <td>
                      {p.integrity} / {p.cunning} / {p.strength}
                    </td>
                    <td className="capitalize">{p.skills}</td>
                    <td>
                      <button
                        className="text-text-muted hover:text-text-primary"
                        onClick={() => setCrew((c) => c.filter((_, i) => i !== k))}
                        aria-label={`Remove ${name}`}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {mission && crew.length > 0 && (
          <p className="text-sm" data-testid="lab-meets">
            {crew.length} personnel.{' '}
            {meets ? 'They meet the mission requirements.' : 'They do not meet the mission requirements, so every stack fails the attempt.'}
          </p>
        )}
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">3. The attempt and the draw</h2>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-1">
            N
            <input
              className="input w-16"
              type="number"
              min={0}
              max={27}
              value={n}
              onChange={(e) => setN(Math.max(0, Number(e.target.value)))}
              data-testid="lab-n"
            />
          </label>
          <span className="text-text-secondary">Dilemmas under the mission: {under}</span>
          <label className="flex items-center gap-1">
            Copies of Chula: The Game on the mission
            <select className="input w-16" value={gameOnMission} onChange={(e) => setGameOnMission(Number(e.target.value))}>
              {[0, 1, 2, 3].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Pick One to Save Two
            <select className="input" value={choice} onChange={(e) => setChoice(e.target.value as PlayerChoice)}>
              <option value="best">the player&apos;s best choice</option>
              <option value="random">a random choice</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" onClick={draw} data-testid="lab-draw">
            Draw N dilemmas
          </button>
          <span className="text-sm text-text-secondary" data-testid="lab-drawn">
            {drawn.length ? `${drawn.length} dilemmas drawn, in the order drawn: the first on the left. Hold or hover a card to preview it.` : 'Nothing drawn yet.'}
          </span>
        </div>
        {drawn.length > 0 && <DrawnCards drawn={drawn} cards={dilemmaCards} />}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {OPPONENT_DILEMMAS.map((d) => (
            <label key={d.title} className="flex items-center gap-1">
              <input type="checkbox" checked={drawn.includes(d.title)} onChange={() => toggleTitle(d.title)} />
              {d.title} ({d.cost})
            </label>
          ))}
        </div>
        <p className="text-sm text-text-secondary">{stackCount.toLocaleString()} legal ordered stacks.</p>
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">4. The bot&apos;s choice</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!attempt || crew.length === 0 || running}
            onClick={run}
            data-testid="lab-choose"
          >
            {running ? 'Choosing…' : 'Choose the stack'}
          </button>
        </div>
        {!attempt && <p className="text-sm text-text-secondary">Choose a deck, then a mission whose requirements the bot reads.</p>}
        {running && (
          <p className="text-sm" role="status" data-testid="lab-status">
            The bot is choosing a stack…
          </p>
        )}
        {searchError && <p className="text-sm text-red-400" data-testid="lab-search-error">{searchError}</p>}
        {chosen && <ResultView response={chosen} />}
        {samples.length > 0 && (
          <details className="text-sm" data-testid="lab-samples">
            <summary className="cursor-pointer">Three sample plays of the chosen stack</summary>
            {samples.map((sample, i) => (
              <div key={i} className="mt-2 flex flex-col gap-1">
                <pre className="whitespace-pre-wrap text-xs bg-bg-secondary p-2 rounded" data-testid="lab-sample">
                  {sample.lines.join('\n')}
                </pre>
                {sample.labels.length > 0 && (
                  <ul className="text-xs text-text-secondary list-disc pl-5" data-testid="lab-sample-labels">
                    {sample.labels.map((l, k) => (
                      <li key={k}>
                        {l.title}: {l.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </details>
        )}
      </section>
    </div>
  );
}

interface Preview {
  instance: CardInstance;
  side: PreviewSide;
  /** A hold dims the page; a mouse hover does not, as on the practice table (#985). */
  dim: boolean;
}

/**
 * Each drawn dilemma, duplicates too, as the art crop of a table card. A press and hold (touch or
 * pen) or a mouse hover shows the card in `CardPreview`, with the delays of the practice table.
 * The practice table's `useCardHold` needs its page's provider, so the lab keeps this smaller copy.
 */
function DrawnCards({ drawn, cards }: { drawn: string[]; cards: Record<string, CardData> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // On a desktop the preview opens only when it is clearly larger than the card (#1458).
  const later = (ms: number, next: Preview, card: Element) => {
    cancel();
    timer.current = setTimeout(() => {
      if (previewEnlargesElement(card)) setPreview(next);
    }, ms);
  };

  // The preview takes the edge away from the press point (#879).
  const side = (x: number): PreviewSide => (x > window.innerWidth / 2 ? 'left' : 'right');

  // A hold ends wherever the pointer is released.
  useEffect(() => {
    const end = () => {
      cancel();
      setPreview((p) => (p?.dim ? null : p));
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('touchend', end);
    return () => {
      cancel();
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchend', end);
    };
  }, []);

  return (
    <div className="flex flex-wrap gap-2" data-testid="lab-drawn-cards">
      {drawn.map((title, i) => {
        const instance: CardInstance = { id: `drawn-${i}`, card: cards[title], face: 'up' };
        return (
          <div
            key={instance.id}
            data-testid={`lab-drawn-card-${slugOf(title)}`}
            data-draw-index={i + 1}
            className="relative select-none touch-manipulation"
            style={{ width: TABLE_CARD_WIDTH }}
            title={title}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse') later(HOLD_DELAY_MS, { instance, side: side(e.clientX), dim: true }, e.currentTarget);
            }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse' && e.buttons === 0) later(HOVER_DELAY_MS, { instance, side: side(e.clientX), dim: false }, e.currentTarget);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return;
              cancel();
              setPreview((p) => (p && !p.dim ? null : p));
            }}
          >
            <TableCardImage instance={instance} width={TABLE_CARD_WIDTH} height={TABLE_CARD_ART_HEIGHT} />
            <span className="absolute bottom-1 right-1 bg-black/70 text-text-primary text-xs font-medium px-1 rounded pointer-events-none">
              {i + 1}
            </span>
          </div>
        );
      })}
      {preview && <CardPreview instance={preview.instance} side={preview.side} dim={preview.dim} />}
    </div>
  );
}

/** The help text of the damage, built from the weights of #1320 (`DAMAGE_WEIGHTS`), so the two cannot drift. */
const DAMAGE_HELP =
  `Lasting damage is the average weighted count of personnel a stack takes out of the game for longer than the turn, over its plays: ` +
  `a personnel killed counts ${DAMAGE_WEIGHTS.killed}, held in the core ${DAMAGE_WEIGHTS.heldInCore}, ` +
  `moved off the attempt ${DAMAGE_WEIGHTS.moved}, placed in the brig ${DAMAGE_WEIGHTS.brig}, ` +
  `lost with a ship ${DAMAGE_WEIGHTS.shipLost}, and returned to the hand ${DAMAGE_WEIGHTS.returned}. ` +
  'Stops do not count: a stopped personnel is unstopped at the start of the next turn.';

function DamageHelp() {
  return (
    <p className="text-text-secondary" data-testid="lab-damage-help">
      {DAMAGE_HELP} It breaks ties between stacks with the same P(fail), and a tie after that goes to the stack with
      fewer dilemmas under the mission. When no stack can fail (P(fail) under 5%), damage alone ranks them, and when
      some stack is all but sure to fail (90% or more), damage ranks those stacks.
    </p>
  );
}

function ScoreLine({ score }: { score: PileStackScore }) {
  return (
    <span>
      P(fail) {pct(score.pFail)}, lasting damage {score.damage.toFixed(2)}, {score.under} under the mission
    </span>
  );
}

function ResultView({ response }: { response: LabResponse }) {
  const { result, baseline, ms, thread } = response;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="lab-result">
      <p className="text-base">
        <strong data-testid="lab-result-stack">{stackText(result.best.stack)}</strong>
      </p>
      <p data-testid="lab-result-score">
        <ScoreLine score={result.best} />
      </p>
      <DamageHelp />
      <p className="text-text-secondary">
        Decision mode: <span data-testid="lab-mode">{result.mode}</span>. Method: {result.method} search,{' '}
        {result.stackCount.toLocaleString()} stacks scored, {result.plays.toLocaleString()} plays,{' '}
        <span data-testid="lab-ms">{ms.toFixed(0)} ms</span> on the <span data-testid="lab-thread">{thread}</span> thread.
      </p>
      <p className="text-text-secondary" data-testid="lab-baseline">
        A random legal stack, the baseline: {stackText(baseline.stack)}: <ScoreLine score={baseline} />.
      </p>
      <RankTable
        ranked={result.ranked}
        caption={`The stacks the beam kept: its ${BEAM_DEFAULTS.finalists} best, each played ${BEAM_DEFAULTS.finalPlays} times`}
      />
    </div>
  );
}

function RankTable({ ranked, caption }: { ranked: PileStackScore[]; caption: string }) {
  return (
    <table className="text-xs w-full" data-testid="lab-ranked">
      <caption className="text-left text-text-secondary">{caption}</caption>
      <thead className="text-left text-text-secondary">
        <tr>
          <th>Stack</th>
          <th>P(fail)</th>
          <th title={DAMAGE_HELP}>Damage</th>
          <th>Under</th>
          <th>Plays</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((s) => (
          <tr key={s.stack.join(',')} className="border-t border-default">
            <td>{stackText(s.stack)}</td>
            <td>{pct(s.pFail)}</td>
            <td>{s.damage.toFixed(2)}</td>
            <td>{s.under}</td>
            <td>{s.plays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
