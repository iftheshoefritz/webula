// Hardcoded practice fixture deck used when ?fixture=1 is set in the URL.
// Format mirrors the deck export format: "<qty>\t<originalName>" per line.
export const PRACTICE_DECK_TSV = `1\tTricorder
3\tChristening *VP
2\tEnergize *VP
2\tSurprise Party
2\tTacking Into the Wind *VP
1\tAnthony Braxton Forward-thinking Recruiter
1\tBeverly Crusher Captain Picard *VP
1\tChakotay The Galaxy's Most Wanted
1\tDaniels Timeless Guardian
1\tData Lucasian Chair *VP
1\tGeordi La Forge Temporal Enforcer
1\tHarry Kim Remorseful Survivor
1\tIcheb Second Officer
1\tJean-Luc Picard Vintner
1\tJessel Housekeeper
1\tJuel Ducane Above Reproach
1\tJulian Bashir Nostalgic Doctor
1\tKathryn Janeway Regretful Leader
3\tMarris
1\tMiral Paris Daughter of B'Elanna
1\tNaomi Wildman Astrometrics Officer
1\tNog Defiant Captain (SS)
1\tRevised Doctor Mass Murderer *VP
1\tRevised Janeway Cold-Blooded Killer *VP
1\tSeven of Nine Undercover Operative
3\tSimmons
1\tTessa Omond Temporal Conspirator
1\tWilliam T. Riker Wistful Admiral
3\tU.S.S. Relativity Federation Timeship (BP)
1\tOutclassed
1\tTemporal Conduit
3\tVault of Tomorrow
1\tStripped Down *AP
1\tBreaking the Ice
1\tTime for Action
1\tCausal Recursion
1\tPersonal Duty *VP
3\tTimescape *VP
1\tHealing Hand
1\tHonorable Pursuit
1\tSecret Identity *VP
1\tOne Step Ahead
1\tGomtuu Shock Wave *VP
1\tIntimidation
1\tIngenious Jury-rig
1\tPivotal Destiny
1\tAdopted Authority
1\tThe Dal'Rok *VP
1\tRapid Progress
1\tCounterinsurgency Program *VP
2\tPest Control
1\tChula: The Chandra *VP
2\tDead Ringer
1\tBecalmed
1\tPitching In *VP
1\tPolywater Intoxication *VP
1\tExcalbian Drama *VP
1\tInferiority *VP
1\tDivergent Goals
1\tOverindulgence
2\tNothing to Lose
1\tAdopted Authority *VP
2\tMore of Gravy Than of Grave
1\tSuspicion
1\tAdopted Authority (SS)
1\tNesting Symbiote
1\tOutmatched *VP
3\tIn Development *VP
2\tThe Alien's Graveyard
1\tMoab IV Avert Danger
1\tAngel I Track Survivors
1\tBilana System Evaluate Soliton Wave
1\tMetron Arena Resolve Standing Conflict
1\tCurnab Sector Prevent Historical Disruption (MAH)`;

// Second hardcoded practice fixture deck, used alongside PRACTICE_DECK_TSV to populate the
// reports fixture (?fixture=1 on /decks/reports) with two decks. Partially overlaps
// PRACTICE_DECK_TSV so the "Cards in common" table has rows, but differs enough that the
// comparison views aren't trivial.
export const PRACTICE_DECK_TSV_2 = `2\tCommon Cause (SS)
3\tCommon Purpose *VP
1\tHolding Cell *VP
2\tU.S.S. Enterprise-J *VP
3\tReprimand
1\tBareil Antos Selfless Scapegoat
1\tBenjamin Sisko Bold Captain
1\tElim Garak Cold-Blooded Mastermind
1\tElizabeth Lense Valedictorian
1\tGrathon Tolar Hologram Forger
1\tJabara
1\tJean-Luc Picard Compassionate Advocate
1\tJulian Bashir Medical Staffer
1\tKaga Melodious Epicure
1\tKira Nerys Ambitious Ally
1\tL.M.H. Mark I Scintillating Personality
1\tLojal Investigative Ambassador
1\tLwaxana Troi Extraordinary Ambassador
1\tMelora Pazlar Independent Personality
1\tMiles O'Brien Vastly Outnumbered
1\tNel Apgar Temperamental Researcher
1\tNog Drill Instructor
1\tOdo Stalwart Ally
1\tPaxton Reese Stellar Cartographer
1\tPersis Loyal Daughter *AP
1\tQuark Vastly Outnumbered
1\tRegana Tosh
1\tSarish Rez Ministerial Adjutant
1\tT'Rul Guarded Attache
1\tTallera Covert Isolationist
1\tTimicin Irresolute Scientist
1\tTolian Soran Renegade Scientist *VP
1\tWixiban Old Friend
1\tU.S.S. Centaur Patrolling Ship
1\tU.S.S. Enterprise-A Chariot of "God" *VP
1\tXhosa Sponsored Transport
3\tVault of Tomorrow
1\tStripped Down *AP
1\tBreaking the Ice
1\tCausal Recursion
2\tSlightly Overbooked
2\tThe Caretaker's "Guests" *VP
3\tTimescape *VP
1\tHealing Hand
1\tInfinite Diversity
2\tGomtuu Shock Wave *VP
1\tWhere No One Has Gone Before *VP
1\tIntimidation
1\tIngenious Jury-rig
1\tPivotal Destiny
1\tThe Dal'Rok *VP
1\t"Rapid Progress"
1\tThe Weak Will Perish *VP
1\tArtistic License
1\tMoral Choice *VP
2\tDead Ringer
1\tBecalmed
1\tThe Clown: Go Away (IDR)
1\tPitching In *VP
1\tPolywater Intoxication *VP
1\tExcalbian Drama *VP
1\tInferiority *VP
1\tDivergent Goals
1\tOverindulgence
2\tNothing to Lose
2\tAdopted Authority *VP
1\tDivisive Patron
3\tMore of Gravy Than of Grave
1\tSuspicion
1\tOutmatched *VP
1\tRacial Tension (FOW)
2\tIn Development *VP
1\tThe Alien's Graveyard
1\tGhosts of Reality
1\tAndorian-Tellarite Border Provoke Interstellar Incident
1\tAlpha 5 Approach Transport Crash Survivor (IDR)
1\tMouth of the Wormhole Deep Space 9 *VP
1\tVarria III Locate Missing Crewman
1\tVarria Corona Defeat Rogue Borg Vessel *VP`;

// The cards `?fixture=costs` (#1654) adds to the fixture deck: the hand gets every card but the last,
// after the hand of `?fixture=piles`, and the crewed ship's crew gets the last, a Borg personnel, so
// the player commands a Borg. Surprise Party and the Tricorder are in the hand of the piles deal already.
// Rollins, and Tacking Into the Wind of the piles hand (`card-9`, `card-10`), show a counted choice (#1695).
// Common Purpose shows a choice of personnel (#1712). Delivery Boy goes into the core, where it offers
// its use for the play of Machinations, a Temporal event of the hand (#1713).
export const PRACTICE_COSTS_TSV = `1\tBorg Nanoprobes
1\tGoran
1\tTricia Jenkins Relaxed Pilot
1\tSarish Rez Ministerial Adjutant
1\tJadzia Dax Problem Solver
1\tRollins Trusted Subordinate
1\tCommon Purpose
1\tMachinations
1\tAnnexation Drone
1\tDelivery Boy
1\tThese Are The Voyages
1\tAt What Cost?
1\tFerengi Tradition
1\tAlliance Galor
1\tType III Galor
1\tDays of Atonement
1\tSecond Edition
1\tVidiian Organ Bank
1\tBridon
1\tDanara Pel Loving Life
1\tPeak Performance`;

// The name of the card of `PRACTICE_COSTS_TSV` that goes into the crew.
export const PRACTICE_COSTS_CREW = 'Annexation Drone';

// The name of the card of `PRACTICE_COSTS_TSV` that goes into the core (#1713).
export const PRACTICE_COSTS_CORE = 'Delivery Boy';

// The names of the cards of `PRACTICE_COSTS_TSV` that join the end of the hand after the others (#1727),
// two events that resolve when played. Their ids come after every other card's, so the cards of the
// fixture before #1727 keep theirs. Ferengi Tradition (#1730), an event that removes itself from the game,
// comes after them, so the two before it keep theirs too. Alliance Galor and Type III Galor (#1744), two
// ships that discard the top of the draw deck, come next, and Days of Atonement (#1745), an event that
// discards a card from hand to draw two, then Second Edition (#1746), which downloads a copy of a commanded
// personnel (Marris and Simmons have copies in the draw deck), then Vidiian Organ Bank and two [Vid] personnel,
// Bridon and Danara Pel (#1765), then Peak Performance (#1796), a core event with a "When you play this event"
// clause, last, so every card before each keeps its id.
export const PRACTICE_COSTS_LATE_HAND = [
  'These Are The Voyages',
  'At What Cost?',
  'Ferengi Tradition',
  'Alliance Galor',
  'Type III Galor',
  'Days of Atonement',
  'Second Edition',
  'Vidiian Organ Bank',
  'Bridon',
  'Danara Pel Loving Life',
  'Peak Performance',
];
// The event `?fixture=resolving` (#1728) deals already resolving, played from that hand.
export const RESOLVING_FIXTURE_EVENT = PRACTICE_COSTS_LATE_HAND[0];

// The card `?fixture=bot-costs` (#1738) adds to the end of the hand of the `?fixture=bot` table: Ptol,
// whose play in a bot game reveals the top four cards of the bot's dilemma pile.
export const PRACTICE_BOT_COSTS_TSV = `1\tPtol`;

// The card `?fixture=bot-roadblock` (#1789) adds to the end of the hand of the `?fixture=bot` table:
// Self-Replicating Roadblock, an event that names a dilemma when it is placed on a mission card.
export const PRACTICE_BOT_ROADBLOCK_TSV = `1\tSelf-Replicating Roadblock`;

// The cards `?fixture=bot-select-again` (#1847) adds to the `?fixture=bot` table: Let's Try That Again,
// Shall We? at the end of the core, and Dessert Disaster at the end of the hand, the two player cards that
// change the kept roll of a planet dilemma that selects at random.
export const PRACTICE_BOT_SELECT_AGAIN_TSV = `1\tLet's Try That Again, Shall We?
1\tDessert Disaster`;

// The cards `?fixture=attributes` (#1666) adds to the fixture deck: a [TN] personnel joins the crewed
// ship's crew, and Dark Dissension, which makes each [TN] personnel Integrity -1 and Cunning +1, the
// core, for the arrows of the attribute bands. Soliton Wave (#1827), which makes each ship in play
// Range +1, follows it at the end of the core, so every other card keeps its id.
export const PRACTICE_ATTRIBUTES_TSV = `1\tKira Nerys Reformed Collaborator
1\tDark Dissension
1\tSoliton Wave`;

// The names of the cards of `PRACTICE_ATTRIBUTES_TSV` that go into the core, in core order; the rest
// go into the crew.
export const PRACTICE_ATTRIBUTES_CORE = ['Dark Dissension', 'Soliton Wave'];

// The deck of `?fixture=completion` (#1757): the practice deck with the five missions whose completion
// acts on the player's cards in place of its own, in slot order Aldea (the planet of the away team),
// Starbase 718, Bassen Rift (the space mission of the crewed ship), Saturn and Gateway, and Population 9
// Billion - All Borg in the draw deck, for Saturn's download.
export const PRACTICE_COMPLETION_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tPopulation 9 Billion - All Borg
1\tAldea Aid Legendary Civilization
1\tStarbase 718 Investigate Cryosatellite
1\tBassen Rift Interdict Genocidal Praetor
1\tSaturn Continue Invasion
1\tGateway Flee in Terror`;

// The deck of `?fixture=set67` (#1828): the practice deck with the three missions of set 67 (60S), Cheron Aid
// Planetary Recovery in slot 0 (the planet of the away team of 20, of more than four species), Caldos IV
// Upgrade Colony in slot 1 and Crescent Nebula Take Out the Trash in slot 2 (the space mission of the crewed
// ship), so every other non-[Fed] mission requires Intelligence.
export const PRACTICE_SET67_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tCheron Aid Planetary Recovery
1\tCaldos IV Upgrade Colony
1\tCrescent Nebula Take Out the Trash
1\tMetron Arena Resolve Standing Conflict
1\tCurnab Sector Prevent Historical Disruption (MAH)`;

// The deck of `?fixture=missions` (#1754): the practice deck with Earth, Lush and Beautiful Home in slot
// 0 (the headquarters of the away team) and Nimbus III, Staff Backwater Embassy in slot 1, the missions
// whose text lets the player spend counters, and Korrd and Caithlin Dar for Nimbus III's download.
// Robert Tomlinson, a [TOS] personnel of cost 1, joins the end of the hand (`PRACTICE_MISSIONS_HAND`), for
// Earth's draw.
// The cards `?fixture=dissident` (#1763) adds to the `?fixture=piles` table: The New Resistance at the end of
// the core, Leeta Rebel Supporter, a Dissident personnel, at the end of the hand, and Damar Cardassian
// Liberator, a Dissident personnel of cost 4, on top of the draw deck.
export const PRACTICE_DISSIDENT_TSV = `1\tThe New Resistance
1\tLeeta Rebel Supporter
1\tDamar Cardassian Liberator`;
// The cards `?fixture=recall` (#1764) deals into the discard pile of the `?fixture=costs` table: Miracle
// Working, an event with Recall: 1, and a second Vidiian Organ Bank, whose Recall needs two completed missions.
export const PRACTICE_RECALL_TSV = `1\tMiracle Working
1\tVidiian Organ Bank`;
// The cards `?fixture=unique` (#1821) adds to the `?fixture=piles` table, two of each: Yarka Harbinger of the
// Prophets, a unique personnel, one in the crew of the ship at Bilana System and one at the end of the hand;
// Vina Orion Slave Girl, a unique personnel, one in the discard pile and one at the end of the hand; and
// Self-Replicating Roadblock "(limit one per mission)" and Inspiring Leader "(limit one per ship)", both copies
// at the end of the hand.
export const PRACTICE_UNIQUE_TSV = `2\tYarka Harbinger of the Prophets
2\tVina Orion Slave Girl
2\tSelf-Replicating Roadblock
2\tInspiring Leader`;
export const PRACTICE_UNIQUE_IN_PLAY = 'Yarka Harbinger of the Prophets';
export const PRACTICE_UNIQUE_DISCARDED = 'Vina Orion Slave Girl';
export const PRACTICE_UNIQUE_HAND = [
  'Yarka Harbinger of the Prophets',
  'Vina Orion Slave Girl',
  'Self-Replicating Roadblock',
  'Inspiring Leader',
];
// The cards `?fixture=orders` (#1866) adds to the `?fixture=piles` table: three events with an order at the end of
// the core, Damar Ambitious Glinn and Quark Resistance Informant, a [Fer] personnel, at the end of the crew of the
// ship at Bilana System, and Galor, a [Car] ship for Damar's order, at the end of the hand.
export const PRACTICE_ORDERS_TSV = `1\tIndebtedness
1\tOptimism
1\tRule of Acquisition #6
1\tDamar Ambitious Glinn
1\tQuark Resistance Informant
1\tGalor`;
export const PRACTICE_ORDERS_CORE = ['Indebtedness', 'Optimism', 'Rule of Acquisition #6'];
export const PRACTICE_ORDERS_CREW = ['Damar Ambitious Glinn', 'Quark Resistance Informant'];
export const PRACTICE_ORDERS_HAND = ['Galor'];
// The cards `?fixture=permissions` (#1916) adds to the `?fixture=piles` table: Particle 010, whose play needs three
// [Bor] personnel, at the end of the hand, and Rule of Acquisition #6, which forbids a spend of counters to draw, at
// the end of the core.
export const PRACTICE_PERMISSIONS_TSV = `1\tParticle 010
1\tRule of Acquisition #6`;
export const PRACTICE_PERMISSIONS_CORE = ['Rule of Acquisition #6'];
export const PRACTICE_PERMISSIONS_HAND = ['Particle 010'];
export const PRACTICE_DISSIDENT_CORE = 'The New Resistance';
export const PRACTICE_DISSIDENT_HAND = 'Leeta Rebel Supporter';
export const PRACTICE_DISSIDENT_DRAW_TOP = 'Damar Cardassian Liberator';

// The deck of `?fixture=kmtar` (#1762): the practice deck with five missions in place of its own, each
// non-headquarters one requiring Diplomacy, in slot order Tarod IX (the planet of the away team), Korma,
// Tirapet Expanse (the space mission of the crewed ship), Volan III and Qo'noS, a headquarters, K'mtar at the
// end of the hand, so his play offers the download of up to two events, and three events in the draw deck.
export const PRACTICE_KMTAR_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tThese Are The Voyages
1\tAt What Cost?
1\tFerengi Tradition
1\tAlexander Rozhenko K'mtar
1\tTarod IX Investigate Massacre
1\tKorma Security Briefing
1\tTirapet Expanse Peaceful Contact
1\tVolan III Investigate Maquis Activity
1\tQo'noS Heart of the Empire`;

// The card of `PRACTICE_KMTAR_TSV` that joins the end of the hand.
export const PRACTICE_KMTAR_HAND = "Alexander Rozhenko K'mtar";

// The deck of `?fixture=tain` (#1800): the practice deck with five missions in place of its own, each
// non-headquarters one requiring Intelligence, in slot order Celtris III (the planet of the away team), Farius
// Prime, Argus Array (the space mission of the crewed ship), Sector 21396 and Cardassia Prime, a headquarters,
// and Enabran Tain "Retired" Spymaster at the end of the hand, so his play opens his "when you play" effect.
// After him Requisitions Drone, Lenara Kahn Wormhole Theorist and Keiko O'Brien Botanist (#1809), whose plays
// examine the top four cards of the draw deck. Then Annexation Drone and DaiMon Solok Cargo Runner (#1812), whose
// plays score 5 points: every non-headquarters mission is an [AQ] mission, so Annexation Drone's condition holds.
export const PRACTICE_TAIN_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tEnabran Tain "Retired" Spymaster
1\tRequisitions Drone
1\tLenara Kahn Wormhole Theorist
1\tKeiko O'Brien Botanist
1\tAnnexation Drone
1\tDaiMon Solok Cargo Runner
1\tCeltris III Construct Elaborate Trap
1\tFarius Prime Approach Criminal Organization
1\tArgus Array Redirect Subspace Telescope
1\tSector 21396 Commandeer Prototype
1\tCardassia Prime Hardscrabble World`;

// The cards of `PRACTICE_TAIN_TSV` that join the end of the hand, in this order.
export const PRACTICE_TAIN_HAND = [
  'Enabran Tain "Retired" Spymaster',
  'Requisitions Drone',
  'Lenara Kahn Wormhole Theorist',
  "Keiko O'Brien Botanist",
  'Annexation Drone',
  'DaiMon Solok Cargo Runner',
];

// The cards `?fixture=downloads` (#1810) adds to the `?fixture=piles` table: Opaka Kai of Bajor and Jean-Luc
// Picard Vintner *VP (the piles deck holds his other version) at the end of the hand, whose plays download into
// hand, and two [Baj] personnel, Furel and Lupaza, on top of the draw deck, for Opaka's download. After them
// (#1811) Gelnon Aloof Tactician, U.S.S. Enterprise Where She Belongs and Reconnaissance Drone, whose plays download
// to a place, and Jem'Hadar Attack Ship, a [Dom] ship for Gelnon, end the hand; James T. Kirk Original Thinker, a
// [TOS] personnel of cost 5, and Ixtana'Rax, a Jem'Hadar, follow them on top of the draw deck.
export const PRACTICE_DOWNLOADS_TSV = `1\tOpaka Kai of Bajor
1\tJean-Luc Picard Vintner *VP
1\tFurel Resistance Fighter
1\tLupaza Resistance Fighter
1\tGelnon Aloof Tactician
1\tU.S.S. Enterprise Where She Belongs
1\tReconnaissance Drone
1\tJem'Hadar Attack Ship
1\tJames T. Kirk Original Thinker
1\tIxtana'Rax Honored Elder`;
export const PRACTICE_DOWNLOADS_HAND = [
  'Opaka Kai of Bajor',
  'Jean-Luc Picard Vintner *VP',
  'Gelnon Aloof Tactician',
  'U.S.S. Enterprise Where She Belongs',
  'Reconnaissance Drone',
  "Jem'Hadar Attack Ship",
];
export const PRACTICE_DOWNLOADS_DRAW_TOP = [
  'Furel Resistance Fighter',
  'Lupaza Resistance Fighter',
  'James T. Kirk Original Thinker',
  "Ixtana'Rax Honored Elder",
];

// The cards `?fixture=60s` (#1826) adds to the `?fixture=piles` table, of the set 60S: Blue Skies to the end of the
// core, which caps the counters at 7; Tavana Reinvigorated Soldier, Qartum Delegation Transport, The Crossing and
// Saavik Seeking Possibilities, a Federation personnel for The Crossing's replace at Moab IV, to the end of the
// hand; and The Warrior's Anthem and Latinum Storage, for the downloads of Tavana and Qartum, on top of the draw
// deck.
export const PRACTICE_60S_TSV = `1\tBlue Skies
1\tTavana Reinvigorated Soldier
1\tQartum Delegation Transport
1\tThe Crossing
1\tSaavik Seeking Possibilities
1\tThe Warrior's Anthem
1\tLatinum Storage`;
export const PRACTICE_60S_CORE = ['Blue Skies'];
export const PRACTICE_60S_HAND = ['Tavana Reinvigorated Soldier', 'Qartum Delegation Transport', 'The Crossing', 'Saavik Seeking Possibilities'];
export const PRACTICE_60S_DRAW_TOP = ["The Warrior's Anthem", 'Latinum Storage'];

export const PRACTICE_MISSIONS_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tKorrd Obsolete Consul
1\tCaithlin Dar Innocent Consul
1\tRobert Tomlinson
1\tEarth Lush and Beautiful Home
1\tNimbus III Staff Backwater Embassy
1\tBilana System Evaluate Soliton Wave
1\tMetron Arena Resolve Standing Conflict
1\tCurnab Sector Prevent Historical Disruption (MAH)`;

// The card of `PRACTICE_MISSIONS_TSV` that joins the end of the hand.
export const PRACTICE_MISSIONS_HAND = 'Robert Tomlinson';

// `?fixture=playable` (#1856): the `?fixture=piles` deck with Earth Cradle of the Federation, a headquarters,
// in slot 2 (`FIXTURE_SHIP_SLOT`), so the crewed U.S.S. Relativity stands on its ship row. Robert Tomlinson,
// a [TOS] personnel, joins that crew (`PRACTICE_PLAYABLE_CREW`), so U.S.S. Reliant's "While you command a
// [TOS] personnel" holds; Haakona, a [Rom] ship, stands on the ship row of slot 3 (`PRACTICE_PLAYABLE_SHIP`);
// and Deanna Troi Ship's Counselor, a [Fed][TNG] personnel Earth takes, Tomek Displaced Alien, who plays
// aboard a [Rom] ship, U.S.S. Reliant Searching for Lifeless Planets and Shuttlepod One Reliable Transport,
// which plays with an Enterprise and so has no place here, join the end of the hand (`PRACTICE_PLAYABLE_HAND`).
export const PRACTICE_PLAYABLE_TSV = `${PRACTICE_DECK_TSV.split('\n')
  .slice(0, -5)
  .join('\n')}
1\tRobert Tomlinson
1\tHaakona
1\tDeanna Troi Ship's Counselor
1\tTomek Displaced Alien
1\tU.S.S. Reliant Searching for Lifeless Planets
1\tShuttlepod One Reliable Transport
1\tMoab IV Avert Danger
1\tAngel I Track Survivors
1\tEarth Cradle of the Federation
1\tMetron Arena Resolve Standing Conflict
1\tCurnab Sector Prevent Historical Disruption (MAH)`;
export const PRACTICE_PLAYABLE_CREW = ['Robert Tomlinson'];
export const PRACTICE_PLAYABLE_SHIP = 'Haakona';
export const PRACTICE_PLAYABLE_SHIP_SLOT = 3;
export const PRACTICE_PLAYABLE_HAND = [
  "Deanna Troi Ship's Counselor",
  'Tomek Displaced Alien',
  'U.S.S. Reliant Searching for Lifeless Planets',
  'Shuttlepod One Reliable Transport',
];
