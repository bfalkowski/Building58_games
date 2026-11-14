// The API detective: Claude works one night at its own desk through tools, in lab mode. It gets the
// same brief, the same records and the same budgets as a seat, and nothing else. It has no shell,
// so it cannot read the seed, the code or the truth.
//
// It calls the Messages API with fetch and no SDK, because the repo is install-free. The key comes
// only from ANTHROPIC_API_KEY at run time. Every request and reply goes to a local log outside the
// repo (~/.games/find-the-ring/llm-log), and a spend cap stops the run before it goes over.

import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { briefFor } from './rules.js';
import { IDS, BOOKS } from './night.js';

// Dollars per million tokens: [input, output]. Used only for the spend cap and the report.
export const PRICES = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
export const costOf = (model, u = {}) => {
  const [i, o] = PRICES[model] ?? PRICES['claude-opus-5-5'];
  return ((u.input_tokens ?? 0) * i + (u.cache_creation_input_tokens ?? 0) * i * 1.25 + (u.cache_read_input_tokens ?? 0) * i * 0.1 + (u.output_tokens ?? 0) * o) / 1e6;
};

const ids = { type: 'array', items: { type: 'string' }, description: 'record ids such as "E12"' };
const regular = { type: 'string', description: 'R1 to R12' };
export const TOOLS = [
  { name: 'summary', description: 'The regulars, their known habits, the ships, the house rules and your budget left.', input_schema: { type: 'object', properties: {} } },
  { name: 'records', description: 'The house\'s free records, each with an id. Leave out a field to see everything.', input_schema: { type: 'object', properties: { book: { type: 'string', enum: BOOKS }, regular, from: { type: 'integer', description: 'first half hour, 0 to 15' }, to: { type: 'integer', description: 'last half hour' } } } },
  { name: 'read', description: 'Open the full text of one request or call. Costs one content read. Cite the records that made you look.', input_schema: { type: 'object', properties: { record: { type: 'string' }, because: ids }, required: ['record', 'because'] } },
  { name: 'tail', description: 'The doorman reports where one regular went each time they stepped out. Costs your one tail.', input_schema: { type: 'object', properties: { regular }, required: ['regular'] } },
  { name: 'ban', description: 'Ban a regular, citing the records behind the ban. Call again to change the citations.', input_schema: { type: 'object', properties: { regular, because: ids }, required: ['regular', 'because'] } },
  { name: 'clear', description: 'Take a ban back.', input_schema: { type: 'object', properties: { regular }, required: ['regular'] } },
  { name: 'handin', description: 'End your night: a score from 0 to 100 for every regular, the chance in percent they are in the ring. Bans are final after this.', input_schema: { type: 'object', properties: { scores: { type: 'object', properties: Object.fromEntries(IDS.map((id) => [id, { type: 'number' }])), required: IDS } }, required: ['scores'] } },
];

// The brief, with tools in place of the office's play command.
export function systemFor(names) {
  const brief = briefFor('S1', names);
  return `${brief.slice(0, brief.indexOf('Play with:')).trim()}\n\nUse the tools to work the night. When you have handed in, stop.`;
}

function runTool(desk, name, input) {
  if (name === 'summary') return desk.summary();
  if (name === 'records') return { records: desk.records(input) };
  if (name === 'read') return desk.read(input.record, input.because);
  if (name === 'tail') return desk.tail(input.regular);
  if (name === 'ban') return desk.ban(input.regular, input.because);
  if (name === 'clear') return desk.clear(input.regular);
  if (name === 'handin') return desk.handIn(input.scores);
  throw new Error(`no tool ${name}`);
}

export function apiDetective({ model = 'claude-opus-5-5', capUsd = 5, maxTurns = 40, apiKey = process.env.ANTHROPIC_API_KEY, fetch: post = globalThis.fetch, logDir = join(homedir(), '.games', 'find-the-ring', 'llm-log'), names } = {}) {
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY to run the API detective.');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const spend = { usd: 0, nights: 0, noHandIn: 0 };

  const ask = async (body) => {
    if (spend.usd >= capUsd) throw new Error(`Spend cap reached: $${spend.usd.toFixed(2)} of $${capUsd}`);
    let res;
    for (let attempt = 0; ; attempt++) {
      res = await post('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((ok) => setTimeout(ok, 2000 * 2 ** attempt)); continue; }
      break;
    }
    const reply = await res.json();
    appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), status: res.status, reply })}\n`);
    if (!res.ok) throw new Error(`API error ${res.status}: ${reply?.error?.message ?? 'unknown'}`);
    spend.usd += costOf(model, reply.usage);
    return reply;
  };

  const work = async (desk) => {
    spend.nights++;
    const messages = [{ role: 'user', content: 'The night is over and the records are in. Work the desk.' }];
    for (let turn = 0; turn < maxTurns && !desk.answer(); turn++) {
      const reply = await ask({ model, max_tokens: 8000, thinking: { type: 'adaptive' }, system: systemFor(names), tools: TOOLS, messages });
      messages.push({ role: 'assistant', content: reply.content });
      const uses = reply.content.filter((b) => b.type === 'tool_use');
      if (!uses.length) break;
      const results = uses.map((u) => {
        try { return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(runTool(desk, u.name, u.input ?? {})) }; }
        catch (err) { return { type: 'tool_result', tool_use_id: u.id, content: `Refused: ${err.message}`, is_error: true }; }
      });
      messages.push({ role: 'user', content: results });
    }
    // A detective that never hands in has banned whoever it banned, with no scores.
    if (!desk.answer()) { spend.noHandIn++; desk.handIn(Object.fromEntries(IDS.map((id) => [id, 0]))); }
  };
  work.spend = spend;
  return work;
}
