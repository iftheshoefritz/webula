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
1\tTrack Survivors
1\tEvaluate Soliton Wave
1\tMetron Arena Resolve Standing Conflict
1\tPrevent Historical Disruption (MAH)`;

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
