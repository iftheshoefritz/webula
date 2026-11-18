import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { DilemmaModel, PileAttempt, PilePersonnel, revealCostOf, stackCostOf } from '../../../../lib/dilemmaBot/pile/model';
import { missionCostOf } from '../../../../lib/dilemmaBot/pile/missionCost';
import { pileResolveOf } from '../../../../lib/dilemmaBot/pile/resolve';

// Issue #1760: Terlina III, Stakoron II, Stakoron Strait and Wadi Homeworld change the cost of a dilemma
// revealed there; a raise past the spend overcomes the dilemma and the rest of the stack.

function person(name: string): PilePersonnel {
  const levels = BOT_SKILLS.map(() => 0);
  return {
    name,
    cost: 3,
    attrs: [5, 5, 5],
    skills: levels,
    species: ['human'],
    affiliation: 'federation',
    skillDots: 0,
    hologram: false,
    printed: { skills: levels.slice(), attrs: [5, 5, 5] },
  };
}

function attemptOf(over: Partial<PileAttempt> = {}): PileAttempt {
  return {
    personnel: [person('Ann'), person('Bea'), person('Cy')],
    requirements: parseRequirementBranches('Cunning>0')!,
    mission: { kind: 'planet', points: 35, span: 2, nebula: false },
    table: {
      headquarters: 1,
      completedMissions: 0,
      completedSpaceMission: false,
      handSize: 7,
      handHasCunning7Or11: false,
      discardCopiesMax: 0,
      missionSkills: [],
      underMission: [],
      turn: 1,
    },
    ...over,
  };
}

// Invented models: only the title, the kind and the cost matter to the arithmetic.
const invented = (title: string, kind: DilemmaModel['kind'], printedCost: number, extra: Partial<DilemmaModel> = {}): DilemmaModel => ({
  title,
  kind,
  printedCost,
  goesUnder: true,
  status: 'play',
  family: 'own',
  play: () => {},
  ...extra,
});

const STAKORON_II = missionCostOf({ originalName: 'Stakoron II Mine Miszinite' })!;
const STAKORON_STRAIT = missionCostOf({ originalName: 'Stakoron Strait Patrol Shipping Lane' })!;
const WADI = missionCostOf({ originalName: 'Wadi Homeworld Dominate Gaming Championship' })!;
const TERLINA = missionCostOf({ originalName: 'Terlina III Follow Homing Beacon' })!;

describe('missionCostOf (#1760)', () => {
  it('knows the four missions by their whole title, and no other', () => {
    expect([STAKORON_II, STAKORON_STRAIT, WADI, TERLINA].map((m) => m.source)).toEqual(['Stakoron II', 'Stakoron Strait', 'Wadi Homeworld', 'Terlina III']);
    expect(missionCostOf({ originalName: 'Bilana System' })).toBeUndefined();
    expect(missionCostOf({ originalName: 'Stakoron II' })).toBeUndefined();
    expect(missionCostOf(undefined)).toBeUndefined();
  });
});

describe('revealCostOf with a mission cost change (#1760)', () => {
  const dual = invented('Some Dual', 'dual', 2);
  const planet = invented('Some Planet', 'planet', 2);
  const chula = invented('Chula: Invented', 'dual', 2);
  const freeChula = invented('Chula: Free', 'dual', 0);
  const method = invented('Unscientific Method', 'planet', 3);

  it('raises a dual dilemma by 1 at Stakoron II and Stakoron Strait', () => {
    expect(revealCostOf(attemptOf({ missionCost: STAKORON_II }), dual, 0).cost).toBe(3);
    expect(revealCostOf(attemptOf({ missionCost: STAKORON_STRAIT }), dual, 0).cost).toBe(3);
    expect(revealCostOf(attemptOf({ missionCost: STAKORON_II }), planet, 0).cost).toBe(2);
  });

  it('lowers a Chula dilemma by 1 at Wadi Homeworld, never below 0', () => {
    expect(revealCostOf(attemptOf({ missionCost: WADI }), chula, 0).cost).toBe(1);
    expect(revealCostOf(attemptOf({ missionCost: WADI }), freeChula, 0).cost).toBe(0);
    expect(revealCostOf(attemptOf({ missionCost: WADI }), dual, 0).cost).toBe(2);
  });

  it('lowers Unscientific Method by 2 at Terlina III', () => {
    expect(revealCostOf(attemptOf({ missionCost: TERLINA }), method, 0).cost).toBe(1);
    expect(revealCostOf(attemptOf({ missionCost: TERLINA }), dual, 0).cost).toBe(2);
  });

  it('applies the change before a discount, then floors at 0', () => {
    expect(revealCostOf(attemptOf({ missionCost: STAKORON_II }), dual, 3).cost).toBe(0);
    expect(revealCostOf(attemptOf({ missionCost: STAKORON_II }), dual, 1).cost).toBe(2);
  });

  it('reads printed costs with no change, as the search does', () => {
    expect(revealCostOf(attemptOf(), dual, 0).cost).toBe(2);
    expect(stackCostOf(attemptOf(), [dual, chula])).toBe(4);
    expect(stackCostOf(attemptOf({ missionCost: STAKORON_II }), [dual, chula])).toBe(6);
  });
});

describe('the Resolve of a dilemma raised past the spend (#1760)', () => {
  const ids = ['p1', 'p2', 'p3'];
  const input = (revealed: string[], rest: string[]) => ({
    personnelIds: ids,
    snapshotIds: ids,
    where: () => ({ at: 'row' as const, stopped: false }),
    revealed: revealed.map((originalName) => ({ originalName })),
    rest: rest.map((originalName) => ({ originalName })),
  });
  // Two dual dilemmas of the registry: Conflict of Interests costs 4 and Well-Prepared Defenses 2.
  const top = { originalName: 'Well-Prepared Defenses' };

  it('overcomes the card whose raise crosses the spend, with the rest of the stack', () => {
    // Printed 4 + 2 = 6, within a spend of 6; raised 5 + 3 = 8.
    const r = pileResolveOf(top, attemptOf({ spend: 6, missionCost: STAKORON_II }), input(['Conflict of Interests'], ['Chula: Echoes', 'Chula: Echoes']));
    expect(r).toMatchObject({
      resolvable: true,
      preview: 'Overcome with the 2 after it: Stakoron II raised the cost past the spend',
      changes: [],
      destination: 'under',
      overcome: { reason: 'Stakoron II raised the cost past the spend' },
    });
  });

  it('reads "Overcome: …" with no cards after it', () => {
    const r = pileResolveOf(top, attemptOf({ spend: 2, missionCost: STAKORON_STRAIT }), input([], []));
    expect(r).toMatchObject({ resolvable: true, preview: 'Overcome: Stakoron Strait raised the cost past the spend' });
  });

  it('resolves as usual when the raise stays within the spend, and with no change', () => {
    const within = pileResolveOf(top, attemptOf({ spend: 8, missionCost: STAKORON_II }), input(['Conflict of Interests'], []));
    expect(within.resolvable && within.overcome).toBeFalsy();
    const printed = pileResolveOf(top, attemptOf({ spend: 6 }), input(['Conflict of Interests'], []));
    expect(printed.resolvable && printed.overcome).toBeFalsy();
  });

  it('never overcomes at Wadi Homeworld, which only lowers a cost', () => {
    const r = pileResolveOf({ originalName: 'Chula: Echoes' }, attemptOf({ spend: 2, missionCost: WADI }), input(['Chula: Echoes'], []));
    expect(r.resolvable && r.overcome).toBeFalsy();
  });
});
