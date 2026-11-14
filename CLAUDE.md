# Games

Games the office in Building58 can play. Each game is a folder with a `game.json`. The office's loader
(Building58 `relay/games.js`) finds them through `GAMES_REPO`, runs one as a child process for a round,
and passes what the seats do to it. The office does not change. Only the roles of the sessions in it
change, for one round.

The words are in [docs/GLOSSARY.md](docs/GLOSSARY.md), the messages in [docs/protocol.md](docs/protocol.md)
and the requirements in [docs/design/game-pack.md](docs/design/game-pack.md). Keep all three true when
the work changes.

## Rules

- **The truth stays sealed.** A game keeps its truth in `~/.games/<game>/<round>/` (`GAMES_HOME` in
  tests), never in the repo and never in a message before `done`. The kit's runner stops a game that
  tries. Secret playbooks stay there too.
- **Known positives and negatives.** Every finding game has rounds with no hidden actor and honest
  seats that look like one. A score without both is not a score.
- **Judge behavior, never beliefs.** A seat is scored on what it did.
- **Made-up only.** Made-up products, people, groups, companies and places. No real brands, people or
  politics. No harmful content: a hidden goal is harmless, such as a made-up word or a tilt.
- **No real work.** A game never changes real work. Games that touch code use a sandbox repo only.
- **Publish scores, not hiding tips.**
- **Seats get no repo access.** A seat reads only what its plays return.
- **The office never names a game.** Nothing here asks Building58 to change for one game. A need the
  loader lacks is a ticket there that names no game.
- **Every game passes the conformance check** (`npm run conformance`) and ships scripted players, so
  a full round runs in a test with no sessions and no model calls.
- **The kit holds only what two games use.** A game uses the kit through its exports. The loader never
  uses the kit.
- **Billing.** Seats are Claude Code sessions on the person's plan. No game takes the Claude Code login
  to call the API.
- **Keys stay out.** The secret check runs on commit (`git config core.hooksPath .githooks`) and in
  `npm test`.
- Install-free: Node 18 or later, no runtime dependencies, `node:test`.
- Write plain words: short sentences, no em dashes.

## Layout

- `kit/`: the runner, the sealed store, the seeded random source, the scripted-player harness and the
  conformance check.
- `find-the-ring/`: seats are detectives who find a ring of regulars from one night's clues. `theme.js` holds
  every name a seat reads, so the theme can change alone. The club's and the ring's names are round
  settings (`clubName`, `ringName`), with defaults in `theme.js`. `lab.js` runs many nights with no seats.
- `listing-review/`: seats investigate simulated reviewers for paid passes. `lib/` is copied from the
  island repo.
- `planted-note/`: seats summarize meeting papers. Some papers hold a harmless hidden instruction.
- `test/`: conformance over every game, a test file per game, the kit, and the secret check.
