// Reads the result record of a Claude Code run out of the text of its workflow log (#1431).
//
// The log is the top-level `*.txt` files of the run's log zip, joined, as
// `scripts/classify_agent_failure.sh` reads them. Each line starts with a timestamp. Claude Code
// prints its records as pretty-printed JSON, so a top-level object starts with a line that is
// `{` alone once the timestamp is gone. The field order of the result record changes between
// runs, so the record is parsed as a whole object, never read field by field.

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

/** The log with the timestamp at the start of each line removed. */
export function stripTimestamps(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(TIMESTAMP, ''))
    .join('\n');
}

/**
 * The end of the JSON object that starts at `start`, the index of its `{`, or -1 when the text
 * ends first. A raw line break inside a string is taken as part of the string.
 */
function objectEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Escapes the raw line breaks and tabs inside the strings of a JSON text, so it parses. */
function escapeRawControls(json) {
  let out = '';
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === '\\') {
        out += ch + (json[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      else if (ch === '\n') {
        out += '\\n';
        continue;
      } else if (ch === '\r') {
        out += '\\r';
        continue;
      } else if (ch === '\t') {
        out += '\\t';
        continue;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

/** The last top-level JSON object of the log whose `type` is `result`, or null. */
export function findResultRecord(logText) {
  const text = stripTimestamps(logText);
  const starts = [];
  const re = /^\{[ \t]*$/gm;
  let match;
  while ((match = re.exec(text))) starts.push(match.index);
  for (let s = starts.length - 1; s >= 0; s--) {
    const end = objectEnd(text, starts[s]);
    if (end < 0) continue;
    const body = text.slice(starts[s], end + 1);
    if (!/"type"\s*:\s*"result"/.test(body)) continue;
    let record;
    try {
      record = JSON.parse(escapeRawControls(body));
    } catch {
      continue;
    }
    if (record && record.type === 'result') return record;
  }
  return null;
}

const orNull = (value) => (value === undefined ? null : value);

/**
 * The `claude` field of a run record, from the result record, or undefined when there is no
 * record. The cost is the API-price estimate Claude Code prints: the workflows run on a
 * subscription token. Only the input and output tokens of each model are kept.
 */
export function claudeFromRecord(record) {
  if (!record) return undefined;
  const models = {};
  for (const name of Object.keys(record.modelUsage ?? {}).sort()) {
    const usage = record.modelUsage[name] ?? {};
    models[name] = {
      input_tokens: orNull(usage.inputTokens),
      output_tokens: orNull(usage.outputTokens),
    };
  }
  return {
    subtype: orNull(record.subtype),
    is_error: orNull(record.is_error),
    num_turns: orNull(record.num_turns),
    duration_ms: orNull(record.duration_ms),
    duration_api_ms: orNull(record.duration_api_ms),
    total_cost_usd_estimate: orNull(record.total_cost_usd),
    models,
  };
}

/** The `claude` field of a run whose log text this is, or undefined. */
export function claudeFromLog(logText) {
  return claudeFromRecord(findResultRecord(logText));
}

/**
 * The issue or PR number a run acted on, from its log, the way `classify_agent_failure.sh` finds
 * `target`: the first `issue #N` or `pull request #N` in the first 800 lines, where the runner
 * echoes the prompt, and then the `issue-<N>-…` branch name. Null when neither is there.
 */
export function targetFromLog(logText) {
  const head = logText.split(/\r?\n/).slice(0, 800).join('\n');
  const hit = head.match(/(?:github issue|pull request|issue|PR) #(\d+)/i);
  if (hit) return Number(hit[1]);
  const branch = logText.match(/issue-(\d+)-[a-z0-9-]+/);
  return branch ? Number(branch[1]) : null;
}
