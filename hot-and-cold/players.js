// Scripted players for Hot and cold. Tests use them, so a full round runs with no sessions.
//
// The halving player keeps the range the number can still be in. Each new guess is the mirror of the
// last one across the middle of that range, so warmer or colder cuts the range about in half.
// The counting player guesses 1, 2, 3 and so on: a weak player, to show the score tells them apart.

const TOP = (brief) => Number((brief.match(/from 1 to (\d+)/) || [])[1]) || 100;
const done = (text) => /^Found it|no guesses left|last guess|already found/.test(text) || / That was your last guess\./.test(text);

export function halvingPlayer() {
  return async (brief, play) => {
    const top = TOP(brief);
    let lo = 1, hi = top, g = 1;
    let text = await play('guess', { n: g });
    while (!done(text)) {
      let b = Math.min(top, Math.max(1, lo + hi - g));
      if (b === g) b = g < top ? g + 1 : g - 1;
      text = await play('guess', { n: b });
      if (done(text)) return;
      const mid = (g + b) / 2;
      const nearB = /^Warmer/.test(text), nearG = /^Colder/.test(text);
      if (/^The same/.test(text)) { lo = hi = mid; }
      else if ((nearB && b > g) || (nearG && b < g)) lo = Math.max(lo, Math.floor(mid) + 1);
      else if (nearB || nearG) hi = Math.min(hi, Math.ceil(mid) - 1);
      g = b;
      if (lo === hi && g !== lo) { text = await play('guess', { n: lo }); return; }
    }
  };
}

export function countingPlayer() {
  return async (brief, play) => {
    for (let n = 1; ; n++) if (done(await play('guess', { n }))) return;
  };
}

export const players = (seat, i) => (i % 2 === 0 ? halvingPlayer() : countingPlayer());
