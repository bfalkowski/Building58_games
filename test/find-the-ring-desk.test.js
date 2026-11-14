// The desk page for people, run in node with a tiny fake page: it opens a case, pins, reads with a
// pin as the reason, tails, bans with pins as citations, hands in, and shows the front page. The
// server serves the page and the game's modules, and nothing outside the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakePage() {
  const els = {};
  const el = (id) => (els[id] ||= {
    id, hidden: false, innerHTML: '', textContent: '', value: '', disabled: false, children: [], handlers: {},
    classList: { toggle() {} }, setAttribute() {}, focus() {}, click() {},
    addEventListener(type, f) { this.handlers[type] = f; },
  });
  globalThis.document = { getElementById: el, createElement: () => el(`made-${Math.random()}`) };
  globalThis.requestAnimationFrame = () => {};
  globalThis.addEventListener = () => {};
  globalThis.URL.createObjectURL = () => 'blob:x';
  const press = (id, data) => els[id].handlers.click({ target: { closest: () => ({ dataset: data }) } });
  return { els, press };
}

test('a person works a case at the desk: pin, read, tail, ban, hand in, and the front page', async () => {
  const { els, press } = fakePage();
  const { start } = await import('../find-the-ring/desk/page.js');
  const S = start();
  assert.match(els.casepick.innerHTML, /People set, night 20 of 20/);
  assert.match(els.rule1.textContent, /Tube Runners Social Club/);
  els['go-file'].onclick();
  assert.equal(els.clock.textContent, '4:00 AM');
  const ringRecord = S.night.records.find((e) => e.ring && e.text);
  const who = ringRecord.who;
  const other = S.records.find((e) => e.who === who && e.id !== ringRecord.id);
  assert.ok(els.tape.innerHTML.includes(`data-read="${ringRecord.id}"`));
  press('tape', { read: ringRecord.id });
  assert.equal(S.desk.summary().budget.reads, 3, 'no read without a pin as the reason');
  press('tape', { pin: other.id });
  press('tape', { read: ringRecord.id });
  assert.equal(S.desk.summary().budget.reads, 2);
  assert.ok(els.tape.innerHTML.includes(ringRecord.text.replace(/"/g, '"')));
  press('tape', { pin: ringRecord.id });
  press('cards', { ban: who });
  assert.deepEqual(S.desk.log.filter((x) => x.kind === 'ban' && x.ok).at(-1).args.because.sort(), [other.id, ringRecord.id].sort());
  press('cards', { tail: S.night.ring.at(-1) });
  assert.equal(S.desk.summary().budget.tails, 0);
  await els.hand.onclick();
  assert.equal(els.press.hidden, false);
  assert.match(els.press.innerHTML, /Your books/);
  assert.match(els.press.innerHTML, /The Informant/);
  assert.match(els.press.innerHTML, /1 of 1 right bans cite one of the ring's own records/);
});

test('the desk server serves the page and modules, and nothing outside the repo', async () => {
  const { serve } = await import('../find-the-ring/desk/serve.js');
  const server = await serve(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/find-the-ring/desk/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /import \{ start \} from '\.\/page\.js'/);
    assert.equal((await fetch(`${base}/find-the-ring/night.js`)).status, 200);
    assert.equal((await fetch(`${base}/kit/rng.js`)).status, 200);
    assert.equal((await fetch(`${base}/..%2f..%2fetc/passwd`)).status, 404);
    assert.equal((await fetch(`${base}/.git/config`)).status, 404);
  } finally { server.close(); }
});
