// The theme: every name a seat reads. The rules and the night never use these words, so the game can
// take a new theme by changing this file alone. Today's theme is a nightclub in a made-up port city,
// 1948. Every name is made up.

export const title = 'The Blue Lantern';
export const place = 'the Blue Lantern, a nightclub in a made-up port city, in 1948';
export const groupWord = 'smuggling ring';

// The shared line the ring uses, and the harbor master's line that one honest regular calls.
export const ringLine = 'Harbor 4-117';
export const harborLine = 'Harbor 4-100';

export const ships = ['SS Marguerite', 'The Orion', 'SS Calloway', 'The Northern Star', 'SS Adelaide'];

// One entry for each regular, in the order of the ids R1 to R12. habit is the honest habit that makes
// the regular look guilty: everyone in the club knows it, so it is public.
export const regulars = [
  { name: 'Vera', role: 'the singer', line: 'Exchange 7-552' },
  { name: 'Felix', role: 'the piano player', line: 'Exchange 7-553', habit: 'steps outside between every set' },
  { name: 'Mr. Odell', role: 'the bookkeeper', line: 'Exchange 2-310', habit: 'phones his landlord all night' },
  { name: 'Kass', role: 'a sailor', line: 'Exchange 9-018' },
  { name: 'Bruno', role: 'a dockworker', line: 'Exchange 9-640' },
  { name: 'Mrs. Halloran', role: 'a widow', line: 'Exchange 4-221' },
  { name: 'Miss Lund', role: 'a traveler waiting for her ship', line: harborLine, habit: 'keeps checking on her ship' },
  { name: 'Captain Brandt', role: 'the police captain', line: 'Exchange 1-000', habit: 'works the whole room' },
  { name: 'Lou', role: 'the bartender', line: 'Exchange 6-404' },
  { name: 'Dutch', role: 'a card player', line: 'Exchange 8-777', habit: 'wins big at cards' },
  { name: 'Nell', role: 'a reporter', line: 'Exchange 5-220' },
  { name: 'Dr. Ames', role: 'a doctor', line: 'Exchange 3-004' },
];
