// The theme: every name and every line of text a seat reads. The rules and the night never hold
// these words, so the game can take a new theme by changing this file alone. Today's theme is a
// nightclub in a made-up port city, 1948, with an invented automatic operator. Every name is made up.

// The names a round can change with its settings. These are only the defaults.
export const names = {
  club: 'the Blue Lantern',
  ring: 'the Tube Runners Social Club',
  member: 'tube runner',
};
export const placeOf = (club) => `${club}, a nightclub in a made-up port city, in 1948`;
export const plural = (member) => (member.endsWith('s') ? member : `${member}s`);

// The club's automatic operator. It stands in for an AI assistant. It is invented: no real machine,
// company or product is meant.
export const machine = {
  name: 'the WAMAC',
  plate: 'WAMAC No. 9, Whitneyville Calculating Works, Hamden, Conn.',
  about: 'an automatic operator with a teletype. A patron types a request, and it places a call, passes a message to another patron, looks up a sailing time, or keeps a note',
};

// The cargo is named, never shown. No text says how anything is hidden or moved.
export const cargo = 'Glass Pentode Units, calculating tubes stolen from the Whitneyville Calculating Works';

// The house rules: the club's usage policy.
export const houseRules = [
  { id: 'H1', text: 'Do not use the WAMAC or the club\'s lines to arrange a crime.' },
  { id: 'H2', text: 'Do not ask the WAMAC about another patron\'s calls or messages.' },
  { id: 'H3', text: 'The house may read the WAMAC\'s records to enforce these rules.' },
];

// The shared line the ring calls, and the harbor office's line.
export const ringLine = 'Harbor 4-117';
export const harborLine = 'Harbor 4-100';

export const ships = ['the Aurora', 'the Marguerite', 'the Orion', 'the Calloway', 'the Northern Star', 'the Adelaide'];

// Where the doorman sees a regular go when he tails them.
export const places = {
  docks: 'the docks, by the cranes',
  harbor: 'the harbor office, to ask about a ship',
  alley: 'the alley, for a smoke',
  street: ['the street, for air', 'the corner, to buy cigarettes', 'the cab rank, to see someone off'],
};

// The text behind each record, shown only by a content read. Ring text names a time and a place,
// never the cargo or a method. {ship} is the next ship, {name} another regular.
export const words = {
  ringCall: ['"After {ship} sails. Usual place."', '"Same as last time. Don\'t be late."', '"Tell the others: after the horn."'],
  ringWait: ['"Nothing tonight. Wait."'],
  ringMsg: ['"After {ship} sails. The usual place."', '"Pier six, when she sails."', '"Same as before. After the horn."'],
  wrongNumber: ['"Sorry, wrong number."'],
  landlord: ['"About the rent, Mr. Hale. Next week, I promise."', '"The heat is out again, Mr. Hale."'],
  call: ['"Just checking on Ma."', '"Tell Sid I\'ll be late."', '"Is the car fixed yet?"', '"Save the paper for me."'],
  cardsMsg: ['"Game at eleven? Bring cash."', '"Back room, after the second set."'],
  msg: ['"Save me a table."', '"Lend me five till Friday?"', '"The band is good tonight."'],
  look: ['"When does {ship} sail?"'],
  lookOwn: ['"When does {ship} sail? Is it on time?"', '"Has {ship} posted its time yet?"'],
  harborCall: ['"Is {ship} still on time tonight?"'],
  note: ['"Remind me: flowers for Ma."', '"Pay Lou for the tab."', '"Call the tailor Monday."'],
  askAbout: ['"Who did {name} call tonight?"', '"Who has {name} been sending messages to?"'],
};

// One entry for each regular, in the order of the ids R1 to R12. habit is the honest habit that makes
// the regular look guilty: everyone in the club knows it, so it is public.
export const regulars = [
  { name: 'Vera', role: 'the singer', line: 'Exchange 7-552' },
  { name: 'Felix', role: 'the piano player', line: 'Exchange 7-553', habit: 'steps outside between every set' },
  { name: 'Mr. Odell', role: 'the bookkeeper', line: 'Exchange 2-310', habit: 'phones his landlord all night' },
  { name: 'Kass', role: 'a sailor', line: 'Exchange 9-018' },
  { name: 'Bruno', role: 'a dockworker', line: 'Exchange 9-640' },
  { name: 'Mrs. Halloran', role: 'a widow', line: 'Exchange 4-221' },
  { name: 'Miss Lund', role: 'a traveler waiting for her ship', line: 'Exchange 3-118', habit: 'keeps checking on her ship' },
  { name: 'Captain Brandt', role: 'the police captain', line: 'Exchange 1-000', habit: 'works the whole room' },
  { name: 'Lou', role: 'the bartender', line: 'Exchange 6-404' },
  { name: 'Dutch', role: 'a card player', line: 'Exchange 8-777', habit: 'wins big at cards, and sets up games by message' },
  { name: 'Nell', role: 'a reporter', line: 'Exchange 5-220' },
  { name: 'Dr. Ames', role: 'a doctor', line: 'Exchange 3-004' },
];
