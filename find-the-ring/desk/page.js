// The house detective's desk, for people. It runs the game's own engine in the browser: the night
// (night.js), one desk with its budgets and citations (desk.js), and the score (score.js). People
// pin records to a regular's card. Pins are the reason for a content read and the citations of a
// ban. At the end the page scores the night and shows what two scripted detectives did with it.

import * as theme from '../theme.js';
import { buildNight, IDS, HALF_HOURS, clock } from '../night.js';
import { openDesk } from '../desk.js';
import { scoreAnswer, tally } from '../score.js';
import { detective, informant } from '../investigators.js';
import { LOOKALIKES } from '../rules.js';

const $ = (id) => document.getElementById(id);
const names = theme.names;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const M = theme.machine.name.replace(/^the /, '');
const N = (id) => theme.regulars[IDS.indexOf(id)].name;
const members = theme.plural(names.member);
const TICK = 2.4;  // seconds a half hour, at 1x

// The cases. Learning cases add one thing each. The people set is the 20 test nights that machines
// also play, so a person's night can be compared with theirs.
const PEOPLE = Array.from({ length: 20 }, (_, i) => `test-${i * 10}`);
const CASES = [
  { key: 'learn-1', label: 'Learning case 1: the shared line, no tail', seed: 'learn-1', night: { ring: [2, 3], methods: ['line'] }, desk: { tails: 0 } },
  { key: 'learn-2', label: 'Learning case 2: both methods, no tail', seed: 'learn-2', night: { ring: [2, 3] }, desk: { tails: 0 } },
  { key: 'learn-3', label: 'Learning case 3: the full desk', seed: 'learn-3', night: {}, desk: {} },
  ...PEOPLE.map((seed, i) => ({ key: seed, label: `People set, night ${i + 1} of 20`, seed, night: {}, desk: {}, people: true })),
  { key: 'random', label: 'A new night', seed: null, night: {}, desk: {} },
];

const S = {};
const involved = (e) => [e.who, e.to, e.with].filter(Boolean);
const byId = (id) => S.records.find((e) => e.id === id);
const upto = () => (S.ended ? HALF_HOURS : S.half + 1);
const pinsOf = (id) => S.pins[id] || [];
const isPinned = (e) => involved(e).some((id) => pinsOf(id).includes(e.id));
const budget = () => S.desk.summary().budget;

function srcLabel(e) {
  return { call: 'Call records', msg: `${M} · message`, look: `${M} · lookup`, note: `${M} · note`, refused: `${M} · refused`, out: 'Door book', sit: 'The floor', cards: 'Card table' }[e.kind];
}
function lineOf(e) {
  if (e.kind === 'call') return `${N(e.who)} called ${e.line}, ${e.mins} min`;
  if (e.kind === 'msg') return `${N(e.who)} sent a message to ${N(e.to)}`;
  if (e.kind === 'look') return `${N(e.who)} looked up ${e.ship}`;
  if (e.kind === 'note') return `${N(e.who)} left a note to self`;
  if (e.kind === 'refused') return `${N(e.who)}: request refused under ${e.rule}`;
  if (e.kind === 'out') return `${N(e.who)} stepped outside`;
  if (e.kind === 'sit') return `${N(e.who)} sat with ${N(e.with)}`;
  return `${N(e.who)} played cards${e.pot === 'big' ? ', took a big pot' : ''}`;
}
const TABS = [['all', 'All'], ['machine', `The ${M}`], ['calls', 'Call records'], ['door', 'Door book'], ['floor', 'The floor']];

// A read needs a reason: a pin, on someone in the record, other than this record.
const reasonFor = (e) => [...new Set(involved(e).flatMap(pinsOf))].filter((x) => x !== e.id);
const canRead = (e) => e.text !== false && !S.texts[e.id] && budget().reads > 0 && reasonFor(e).length > 0 && !S.handed;

function renderTape() {
  const rows = [];
  for (let h = upto() - 1; h >= 0; h--) {
    for (const e of S.records.filter((x) => x.half === h).reverse()) {
      if (S.filter !== 'all' && e.book !== S.filter) continue;
      const readable = ['call', 'msg', 'look', 'note', 'refused'].includes(e.kind);
      const trip = S.tail?.trips.find((t) => t.record === e.id);
      const said = S.texts[e.id];
      const why = reasonFor(e).length ? 'Open the full text' : 'Needs a reason: pin a clue on someone in it first';
      rows.push(`<div class="rec"><span class="t">${e.time}</span><span><span class="src">${srcLabel(e)} · ${e.id}</span>${lineOf(e)}${said ? `<span class="said">${said}</span>` : ''}${trip ? `<span class="dest">Doorman: went to ${trip.went}.</span>` : ''}</span>
        <span class="acts">${readable && !said ? `<button type="button" data-read="${e.id}" ${canRead(e) ? '' : 'disabled'} title="${why}">Read</button>` : ''}<button type="button" data-pin="${e.id}" aria-pressed="${isPinned(e)}" ${S.handed ? 'disabled' : ''}>${isPinned(e) ? 'Pinned' : 'Pin'}</button></span></div>`);
    }
    const ship = S.night.ships.find((s) => s.at === h);
    if (ship && (S.filter === 'all' || S.filter === 'door')) rows.push(`<div class="rec ship"><span class="t">${clock(h)}</span><span><span class="src">Harbor</span>${cap(ship.name)} sounded her horn and sailed.</span><span></span></div>`);
  }
  $('tape').innerHTML = rows.length ? rows.join('') : '<div class="empty">Nothing on the tape yet.</div>';
  $('reccount').textContent = `${S.records.filter((e) => e.half < upto()).length} records`;
}

function renderCards() {
  const banned = S.desk.answer()?.bans ?? S.bans;
  $('cards').innerHTML = IDS.map((id, i) => {
    const c = theme.regulars[i];
    const pins = pinsOf(id).map(byId);
    const trips = S.tail?.regular === id ? S.tail.trips.filter((t) => byId(t.record).half < upto()) : null;
    const isBanned = Boolean(banned[id]);
    const tailsLeft = budget().tails;
    return `<article class="reg${isBanned ? ' banned' : ''}" aria-label="${c.name}">
      <header><b>${c.name}</b><span class="id">${id}</span></header>
      <span class="role">${c.role}${c.habit ? `<span class="habit"> · ${c.habit}</span>` : ''}</span>
      ${pins.length ? `<ul>${pins.map((e) => `<li><span>${e.time} ${lineOf(e)}</span><button type="button" data-unpin="${id}:${e.id}" aria-label="Remove pin" ${S.handed ? 'disabled' : ''}>×</button></li>`).join('')}</ul>` : ''}
      ${trips ? `<span class="tail">Tailed. ${trips.length ? trips.map((t) => `${t.time}: ${t.went}`).join('; ') : 'Has not stepped out yet.'}</span>` : ''}
      <label class="sus">Suspicion <input type="range" min="0" max="100" step="5" value="${S.scores[id]}" data-sus="${id}" ${S.handed ? 'disabled' : ''} aria-label="Suspicion of ${c.name}"><output>${S.scores[id]}</output></label>
      <div class="row"><button type="button" data-tail="${id}" ${tailsLeft <= 0 || S.handed ? 'disabled' : ''}>Tail</button><button type="button" class="ban" data-ban="${id}" aria-pressed="${isBanned}" ${(!pins.length && !isBanned) || S.handed ? 'disabled' : ''} title="${pins.length ? '' : 'A ban needs at least one pinned record'}">${isBanned ? 'Banned' : 'Ban'}</button></div>
      ${isBanned ? '<span class="stamp">BANNED</span>' : ''}
    </article>`;
  }).join('');
}

function renderBar() {
  const b = budget();
  $('clock').textContent = S.ended ? '4:00 AM' : clock(S.half);
  $('sail').innerHTML = S.night.ships.map((s) => { const t = `${cap(s.name)} sails ${clock(s.at)}`; return S.ended || S.half > s.at ? `<s>${t}</s>` : `<span>${t}</span>`; }).join('');
  $('reads').textContent = `Content reads: ${b.reads} left`; $('reads').classList.toggle('out', !b.reads);
  $('tails').textContent = `Tail: ${b.tails} left`; $('tails').classList.toggle('out', !b.tails);
  $('bancount').textContent = `Bans: ${Object.keys(S.bans).length}`;
  $('play').textContent = S.playing ? 'Pause' : 'Play'; $('play').disabled = S.ended || S.handed;
  $('file').disabled = S.ended; $('hand').disabled = S.handed;
}
const renderAll = () => { renderBar(); renderTape(); renderCards(); };

// A ban carries the regular's pins. A change of pins changes the ban's citations.
function syncBan(id) {
  if (!S.bans[id]) return;
  if (pinsOf(id).length) { S.desk.ban(id, pinsOf(id)); S.bans[id] = pinsOf(id).slice(); } else { S.desk.clear(id); delete S.bans[id]; }
}

function onTape(ev) {
  const b = ev.target.closest('button'); if (!b || S.handed) return;
  if (b.dataset.read) {
    const e = byId(b.dataset.read);
    if (canRead(e)) { S.texts[e.id] = S.desk.read(e.id, reasonFor(e)).text; }
  }
  if (b.dataset.pin) {
    const e = byId(b.dataset.pin), on = isPinned(e);
    for (const id of involved(e)) { const l = pinsOf(id); S.pins[id] = on ? l.filter((x) => x !== e.id) : l.includes(e.id) ? l : [...l, e.id]; syncBan(id); }
  }
  renderAll();
}
function onCards(ev) {
  const b = ev.target.closest('button'); if (!b || S.handed) return;
  if (b.dataset.unpin) { const [id, eid] = b.dataset.unpin.split(':'); S.pins[id] = pinsOf(id).filter((x) => x !== eid); syncBan(id); }
  if (b.dataset.tail && budget().tails > 0) S.tail = S.desk.tail(b.dataset.tail);
  if (b.dataset.ban) {
    const id = b.dataset.ban;
    if (S.bans[id]) { S.desk.clear(id); delete S.bans[id]; } else if (pinsOf(id).length) { S.desk.ban(id, pinsOf(id)); S.bans[id] = pinsOf(id).slice(); if (S.scores[id] < 70) S.scores[id] = 70; }
  }
  renderAll();
}
function onSlider(ev) {
  const r = ev.target; if (!r.dataset.sus) return;
  S.scores[r.dataset.sus] = Number(r.value); r.nextElementSibling.textContent = r.value;
}

function endNight() { S.ended = true; S.playing = false; S.half = HALF_HOURS - 1; renderAll(); }

// ---------- The reveal ----------
const FIG = '<svg viewBox="0 0 60 80" aria-hidden="true"><rect x="6" y="22" width="48" height="4" fill="#0d0d0e"/><rect x="18" y="8" width="24" height="16" fill="#0d0d0e"/><circle cx="30" cy="34" r="10" fill="#8f8f8f"/><path d="M8 80 C10 54 18 46 30 46 C42 46 50 54 52 80 Z" fill="#1a1a1b"/></svg>';
const list = (ids) => { const n = ids.map(N); return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`; };
const METHOD_WORDS = { line: 'one shared telephone line', relay: `messages passed through the ${M}` };

async function other(work) {
  const d = openDesk(S.night, S.case.desk);
  await work(d, { night: S.night, seed: S.seed });
  const a = d.answer();
  return { bans: Object.keys(a.bans), s: scoreAnswer(S.night, a, LOOKALIKES) };
}

async function showPaper() {
  const n = S.night, answer = S.desk.answer(), sc = scoreAnswer(n, answer, LOOKALIKES), t = sc.boxes;
  const R = cap(names.ring);
  let head, deck;
  if (!n.ring.length) { head = t.wrongMen.length ? (t.wrongMen.length > 1 ? 'Honest Patrons Thrown Out' : 'Honest Patron Thrown Out') : `Quiet Night at ${cap(names.club)}`; deck = t.wrongMen.length ? `There were no ${members} tonight. ${list(t.wrongMen)} banned anyway.` : `There were no ${members} tonight, and the house detective banned nobody.`; }
  else if (!t.caught.length) { head = t.wrongMen.length ? `Wrong Patron Banned as ${R} Slips Away` : `${R} Slips Away`; deck = `${list(n.ring)} worked the ${M} all night and walked out at dawn.`; }
  else if (!t.wrongMen.length) { head = t.gotAway.length ? `${R} Broken, ${t.gotAway.length} Still at Large` : `${R} Smashed`; deck = `${list(t.caught)} banned from the club.${t.gotAway.length ? ` ${list(t.gotAway)} slipped out the back.` : ''}`; }
  else { head = `${R} Broken, Honest Patron Banned`; deck = `${list(t.caught)} banned. ${list(t.wrongMen)} banned by mistake.${t.gotAway.length ? ` ${list(t.gotAway)} got away.` : ''}`; }
  const photo = (id, st, red) => `<div class="photo"><div class="pic">${FIG}${red ? '<i></i>' : ''}<span class="st">${st}</span></div><b>${N(id)}</b><span>${theme.regulars[IDS.indexOf(id)].role}</span></div>`;
  const photos = [...t.caught.map((id) => photo(id, 'CAUGHT', 1)), ...t.gotAway.map((id) => photo(id, 'AT LARGE', 1)), ...t.wrongMen.map((id) => photo(id, 'WRONG BAN', 0))].join('');
  const [det, inf] = [await other(detective), await other(informant)];
  const pinnedAll = new Set(Object.values(S.pins).flat());
  const missed = n.records.filter((e) => e.ring && !pinnedAll.has(e.id)).slice(0, 6);
  const line = (who, x) => `${who} would ban ${x.bans.length ? list(x.bans) : 'nobody'}: ${x.s.caught} caught, ${x.s.wrongBans} wrong. Score ${x.s.points}.`;
  $('press').innerHTML = `<article class="paper" role="dialog" aria-modal="true" aria-labelledby="hl">
    <div class="mast"><span>Dawn edition</span><b>The Harbor Evening Call</b><span>Case ${S.seed}</span></div>
    <h2 class="headline" id="hl">${head}</h2>
    <p class="deck">${deck}${n.method ? ` Tonight they used ${METHOD_WORDS[n.method]}.` : ''} The cargo: ${theme.cargo}.</p>
    ${photos ? `<div class="photos">${photos}</div>` : ''}
    <div class="cols">
      <div><h4>Your books</h4>
        <table class="cm"><tr><th></th><th>Banned</th><th>Not</th></tr>
        <tr><th>${cap(members)}</th><td><b>${t.caught.length}</b>caught</td><td><b>${t.gotAway.length}</b>away</td></tr>
        <tr><th>Honest</th><td><b>${t.wrongMen.length}</b>wrong</td><td><b>${t.cleared.length}</b>cleared</td></tr></table>
        <p style="margin-top:6px"><b>Score ${sc.points}.</b></p></div>
      <div><h4>How you worked</h4><ul>
        <li>Evidence: ${t.caught.length ? `${sc.goodEvidence} of ${t.caught.length} right bans cite one of the ring's own records` : 'no right bans to judge'}.</li>
        <li>Privacy: ${sc.privacyReads} of ${sc.reads} content reads were on honest regulars.</li>
        <li>Tail: ${S.tail ? `${N(S.tail.regular)}${n.ring.includes(S.tail.regular) ? `, a ${names.member}` : ', honest'}` : 'not used'}.</li></ul></div>
      <div><h4>The other detectives, same night</h4><ul>
        <li>${line('The scripted detective', det)}</li>
        <li>${line('The Informant, who knew tonight\'s method,', inf)}</li></ul></div>
    </div>
    ${missed.length ? `<div class="missed"><h4>What you missed</h4>${missed.map((e) => `<p>${clock(e.half)}. ${lineOf(e)}${e.text ? `: ${e.text}` : ''}${e.kind === 'out' ? `, to ${e.dest}` : ''}</p>`).join('')}</div>` : ''}
    <div class="pressbtns"><button type="button" id="save-press">Save my night</button><button type="button" id="close-press">Back to the desk</button><button type="button" id="next-press">Next case</button></div>
  </article>`;
  $('press').hidden = false; $('close-press').focus();
  $('close-press').onclick = () => { $('press').hidden = true; };
  $('next-press').onclick = () => openCase(CASES[(CASES.indexOf(S.case) + 1) % CASES.length]);
  $('save-press').onclick = () => saveNight(sc);
}

// The person's night as a file: the case, every play, the answer and the score. Nothing is sent.
function saveNight(sc) {
  const { boxes, ...score } = sc;
  const data = { game: 'find-the-ring', case: S.case.key, seed: S.seed, people: Boolean(S.case.people), mode: S.mode, answer: S.desk.answer(), log: S.desk.log, score };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `find-the-ring-${S.seed}.json`;
  a.click();
}

function openCase(c) {
  const seed = c.seed ?? `night-${Math.floor(Math.random() * 100000)}`;
  const night = buildNight(seed, c.night);
  const desk = openDesk(night, { names, ...c.desk });
  Object.assign(S, { case: c, seed, night, desk, records: desk.records(), texts: {}, tail: null, pins: {}, bans: {}, scores: Object.fromEntries(IDS.map((id) => [id, 0])), half: 0, frac: 0, playing: false, ended: false, handed: false, filter: S.filter ?? 'all', speed: S.speed ?? 1 });
  $('caseno').textContent = c.label; $('casepick').value = c.key;
  $('press').hidden = true; $('start').hidden = false;
  renderAll();
}

function fillTheme() {
  $('eyebrow').textContent = `${cap(names.club)} · 1948`;
  $('pitch').textContent = `Someone is using the club's ${M} to move ${theme.cargo.split(',')[0]} onto the night boats, and the house wants them gone. Ban the ${members} from the club's own records. Every honest regular you ban costs you twice what a catch earns.`;
  $('rule1').textContent = `You are the house detective. Some regulars may be ${members}: they call themselves ${names.ring}, and there are two or three of them. Some nights there are none.`;
  $('rule3').textContent = `Ban the ${members}, and say why. Each ${names.member} you ban scores +1. Each honest regular you ban scores −2.`;
  $('houserules').innerHTML = `<b>House rules.</b> ${theme.houseRules.map((r) => `${r.id}: ${r.text}`).join(' ')}`;
  $('starttext').textContent = `The house manager slides a folder across the desk. Twelve regulars, two sailings tonight. The ${M}'s tape starts at 8 PM.`;
  $('casepick').innerHTML = CASES.map((c) => `<option value="${c.key}">${c.label}</option>`).join('');
}

export function start() {
  fillTheme();
  $('tabs').innerHTML = TABS.map(([k, v]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === 'all'}">${v}</button>`).join('');
  $('tabs').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; S.filter = b.dataset.k; [...$('tabs').children].forEach((x) => x.setAttribute('aria-selected', String(x === b))); renderTape(); });
  $('tape').addEventListener('click', onTape);
  $('cards').addEventListener('click', onCards);
  $('cards').addEventListener('input', onSlider);
  $('play').onclick = () => { S.playing = !S.playing; renderBar(); };
  [1, 3].forEach((n) => ($(`sp${n}`).onclick = () => { S.speed = n; [1, 3].forEach((m) => $(`sp${m}`).setAttribute('aria-pressed', String(m === n))); }));
  $('file').onclick = endNight;
  $('hand').onclick = async () => { if (!S.ended) endNight(); S.desk.handIn(S.scores); S.handed = true; renderAll(); await showPaper(); };
  $('next').onclick = () => openCase(CASES[(CASES.indexOf(S.case) + 1) % CASES.length]);
  $('casepick').onchange = () => openCase(CASES.find((c) => c.key === $('casepick').value));
  $('go-live').onclick = () => { S.mode = 'live'; $('start').hidden = true; S.playing = true; renderBar(); };
  $('go-file').onclick = () => { S.mode = 'file'; $('start').hidden = true; endNight(); };
  $('press').addEventListener('click', (e) => { if (e.target.id === 'press') $('press').hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('press').hidden = true; });
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.playing && !S.ended) {
      S.frac += (dt * S.speed) / TICK;
      if (S.frac >= 1) { S.frac = 0; if (S.half >= HALF_HOURS - 1) endNight(); else { S.half++; renderAll(); } }
    }
    requestAnimationFrame(frame);
  };
  openCase(CASES[0]);
  requestAnimationFrame(frame);
  return S;
}
