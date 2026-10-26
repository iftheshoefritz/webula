import { SKILLS } from '../missionRequirements';

// The mission requirements as a list of alternatives (#1282). The group meets the mission when it
// meets one branch: every skill count of the branch, and every attribute total above its threshold.
// `parseMissionRequirements` keeps the skills only; the bot needs the attribute checks too.

export const BOT_SKILLS = SKILLS.map((s) => s.toLowerCase());
export const SKILL_INDEX: Record<string, number> = Object.fromEntries(BOT_SKILLS.map((s, i) => [s, i]));

/** The attributes in the order of `BotPersonnel.attrs`. */
export const ATTRIBUTES = ['integrity', 'cunning', 'strength'] as const;

export interface RequirementBranch {
  /** The count needed of each skill, indexed as `BOT_SKILLS`. */
  skills: number[];
  /** The total of each attribute must be greater than this; -1 means no check. */
  attrs: [number, number, number];
}

export interface RequirementPersonnel {
  skills: number[];
  attrs: [number, number, number];
}

function emptyBranch(): RequirementBranch {
  return { skills: new Array(BOT_SKILLS.length).fill(0), attrs: [-1, -1, -1] };
}

function both(a: RequirementBranch, b: RequirementBranch): RequirementBranch {
  return {
    skills: a.skills.map((n, i) => n + b.skills[i]),
    attrs: [
      Math.max(a.attrs[0], b.attrs[0]),
      Math.max(a.attrs[1], b.attrs[1]),
      Math.max(a.attrs[2], b.attrs[2]),
    ],
  };
}

/**
 * Parse the mission's requirement text, for example
 * "Anthropology, 2 Diplomacy, Law and Integrity>31 or Leadership, Security, and Cunning>36".
 * `or` binds less tightly than `,` and `and`. "any attribute>32" is an alternative of the three.
 * Returns null for a text with a part the bot cannot check, such as "total Weapons at this mission>10".
 */
export function parseRequirementBranches(text: string): RequirementBranch[] | null {
  const tokens =
    text
      .replace(/&gt;/g, '>')
      .toLowerCase()
      .match(/\(|\)|,|any attribute>\d+|[a-z]+>\d+|\d+|[a-z]+/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];

  const expr = (): RequirementBranch[] => {
    let out = term();
    while (peek() === 'or') {
      pos++;
      out = out.concat(term());
    }
    return out;
  };
  const term = (): RequirementBranch[] => {
    let out = factor();
    for (;;) {
      while (peek() === ',' || peek() === 'and') pos++;
      if (peek() === undefined || peek() === ')' || peek() === 'or') return out;
      const next = factor();
      out = out.flatMap((a) => next.map((b) => both(a, b)));
    }
  };
  const factor = (): RequirementBranch[] => {
    const token = tokens[pos++];
    if (token === '(') {
      const inner = expr();
      if (tokens[pos++] !== ')') throw new Error('unclosed parenthesis');
      return inner;
    }
    let match = /^any attribute>(\d+)$/.exec(token);
    if (match) {
      const threshold = Number(match[1]);
      return [0, 1, 2].map((i) => {
        const b = emptyBranch();
        b.attrs[i] = threshold;
        return b;
      });
    }
    match = /^([a-z]+)>(\d+)$/.exec(token);
    if (match) {
      const i = (ATTRIBUTES as readonly string[]).indexOf(match[1]);
      if (i < 0) throw new Error(`unknown attribute ${match[1]}`);
      const b = emptyBranch();
      b.attrs[i] = Number(match[2]);
      return [b];
    }
    let count = 1;
    let word = token;
    if (/^\d+$/.test(token)) {
      count = Number(token);
      word = tokens[pos++];
    }
    const skill = word === undefined ? undefined : SKILL_INDEX[word];
    if (skill === undefined) throw new Error(`unknown word ${word}`);
    const b = emptyBranch();
    b.skills[skill] = count;
    return [b];
  };

  try {
    const branches = expr();
    return pos === tokens.length && branches.length > 0 ? branches : null;
  } catch {
    return null;
  }
}

/** Do the personnel with `alive[k]` true meet one branch? `alive` defaults to every personnel. */
export function meetsRequirements(
  branches: RequirementBranch[],
  personnel: RequirementPersonnel[],
  alive?: ArrayLike<number | boolean>,
): boolean {
  const skills = new Array(BOT_SKILLS.length).fill(0);
  const attrs = [0, 0, 0];
  personnel.forEach((p, k) => {
    if (alive && !alive[k]) return;
    for (let i = 0; i < skills.length; i++) skills[i] += p.skills[i];
    for (let i = 0; i < 3; i++) attrs[i] += p.attrs[i];
  });
  return branches.some(
    (b) => b.skills.every((n, i) => skills[i] >= n) && b.attrs.every((t, i) => t < 0 || attrs[i] > t),
  );
}
