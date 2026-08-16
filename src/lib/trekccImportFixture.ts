// Hardcoded fixture used by the "Import 3 test decks" verification button on
// /import-trekcc. These are real trekcc.org Worlds 2026 decklists (see issue #414),
// used to manually verify the bulk-import-to-Drive path — including that pressing the
// button a second time updates the same three files instead of duplicating them —
// without needing to visit trekcc.org or run the bookmarklet.
export type TrekccFixtureDeck = { trekccDeckId: string; title: string; content: string };

export const TREKCC_IMPORT_FIXTURE: TrekccFixtureDeck[] = [
  {
    trekccDeckId: '54535',
    title: 'Romulans - Strength v1.2 (Worlds 2026)',
    content: `2\tKeevan (SS)
1\tCode of the Ushaan
2\tSelf-Replicating Roadblock
3\tThese Are The Voyages *VP
3\tAlternate Identity
1\tOld Feelings
1\tB'Etor Romulan Conspirator *VP
1\tB-4 Irresistible Bait
1\tChagrith
1\tData From the City of Rateg *VP
2\tDonatra Honorable Commander
1\tDralvak
1\tDurg
2\tJorvas
1\tKeras Creature of Duty
3\tLeodis
1\tLore The One *VP
1\tLursa Romulan Conspirator
1\tNorman Locus of the Hive Mind
2\tPtol
1\tRuk Old One Servitor
1\tSatan's Robot Dangerous Minion
1\tSelveth Tal Shiar Pilot
1\tSpock Flirting with Danger
1\tTaris Deceitful Subcommander *VP
1\tThe Viceroy Shinzon's Protector
3\tThexor
1\tTomalak Beguiling Adversary
3\tVenoxis
2\tRomulan Scout Vessel
3\tScimitar Reman Warbird
Dilemmas:
1\tEquipment Malfunction
1\tThe Caretaker's "Guests"
3\tVault of Tomorrow
1\tStripped Down
3\tTimescape *VP
1\tHealing Hand
1\tHonorable Pursuit
1\tSecret Identity *VP
1\tInsurrection
1\tSwashbuckler at Heart *VP
1\tAn Issue of Trust *VP
1\tPivotal Destiny
1\tThe Dal'Rok *VP
1\tArtistic License
1\tThe Weak Will Perish
1\tMoral Choice *VP
1\tChula: The Chandra *VP
1\tBecalmed
1\tThe Clown: Go Away (IDR)
1\tPitching In *VP
1\tPolywater Intoxication *VP
1\tDereliction of Duty
1\tExcalbian Drama *VP
1\tInferiority *VP
1\tInterstellar Exigence
1\tOverindulgence
1\tNothing to Lose
1\tOld Differences *VP
1\tGarak Has Some Issues
2\tAdopted Authority *VP
1\tDivisive Patron
2\tMore of Gravy Than of Grave
1\tAccelerated Aging
1\tMorphogenic Virus
3\tSkeleton Crew *VP
1\tOutmatched *VP
1\tIntimidation *VP
1\tIn Development *VP
1\tSuspected Minority
2\tThe Alien's Graveyard
2\tGhosts of Reality
1\tTelepathology
1\tNew Face
Missions:
1\tRomulus Seat of Power
1\tCarraya IV Conceal Unlikely Society
1\tAndorian-Tellarite Border Provoke Interstellar Incident
1\tB'hava'el Prevent Systemic Annihilation
1\tRemus Supervise Dilithium Mine *VP`,
  },
  {
    trekccDeckId: '54537',
    title: 'Astral Plane AVB worlds 2026',
    content: `2\tChristening
2\tField Studies *VP
1\tFinding Our Way *VP
1\tIndebtedness
2\tSecurity Drills *VP
1\tSurprise Party
1\tTacking Into the Wind *VP
2\tThirst for Knowledge
1\tUnexpected Difficulties
3\tHomeward Bound
1\tInfinite Combinations
1\tB'Elanna Torres Straightforward Engineer
2\tCarlson
3\tChakotay Steadfast Commander
1\tHarry Kim Diligent Ensign
1\tIcheb Second Officer
2\tJuliet Jurot
3\tKathryn Janeway Mindful Keeper
1\tKes Experienced Ocampa
1\tMariah Henley
1\tMarie Kaplan Observant Officer
1\tMarquay
2\tMitchell
1\tMitena Haro Planted Observer
1\tMortimer Harren Reclusive Genius
1\tNoah Lessing Driven Officer
1\tPersis Loyal Daughter *AP
3\tRevised Chakotay Imposturous First Officer
1\tSeven of Nine Efficient Analyst *VP
1\tSigmund Freud Father of Psychoanalysis
1\tStadi Focused
1\tTal Celes Imprecise Analyst
1\tThe Doctor Emergency Medical Hologram
1\tThelev "Andorian" Terrorist
2\tThompson
2\tTom Paris Competitive Pilot
1\tTricia Jenkins Relaxed Pilot
1\tTuvix Symbiogenesis
1\tTuvok Chief of Security *VP
2\tWilliam Telfer Misguided Hypochondriac
2\tDelta Flyer Rebuilt "Hot Rod"
3\tU.S.S. Voyager Home Away From Home *VP
Dilemmas:
2\tBlended
3\tChula: Pick One to Save Two
1\tGomtuu Shock Wave
1\tRogue Borg Ambush
1\tChula: The Dice
1\tThe Dal'Rok
1\tPillage and Plunder
1\tThe First Duty
1\tSecret Identity *VP
1\tWhere No One Has Gone Before *VP
1\tAn Issue of Trust *VP
2\tIntimidation
1\tOverburdened
2\tTsiolkovsky Infection *VP
2\tWhisper in the Dark *VP
2\tAdopted Authority
2\tChula: The Game
3\tThe Weak Will Perish *VP
2\tUnconventional Consideration
2\tChula: The Chandra *VP
1\tDereliction of Duty
2\tNothing to Lose
2\tPersonal Duty (R2)
1\tUnbelievable Emergency
2\tIn Development *VP
3\tGhosts of Reality
2\tLocal Trouble
1\tTwo-Dimensional Creatures
Missions:
1\tMarayna's Nebula Inversion Mystery
1\tAlsuran Sector Utilize Abandoned Relay Station
1\tCaretaker's Array Protect Ocampa (MAH)
1\tOcampa System Salvage Debris
1\tOrlitus Cluster Astronomical Survey (FOW)`,
  },
  {
    trekccDeckId: '54538',
    title: 'Spirited away by Shran and McCoy III worlds 2026',
    content: `2\tCoordinated Counterattack
2\tSecurity Drills
2\tDriven
2\tEscape *VP
2\tBenjamin Sisko Command Staffer
1\tChristopher Pike Bold Commander
1\tGav Diplomat
1\tGeorge Stocker Starbase Commodore
2\tHikaru Sulu Experienced Helmsman
1\tIlia Finest Navigator in Starfleet
1\tJadzia Dax Communications Staffer
3\tJames T. Kirk Original Thinker
1\tJohn Harriman Captain of the Enterprise
1\tLaurence T. Stone Portmaster
2\tLeonard H. McCoy Chief Medical Officer
1\tMatt Decker Vengeful Commodore
1\tMontgomery Scott Experienced Engineer
2\tNanu Ari
1\tNilz Baris Agricultural Undersecretary
1\tNumber One Reputable Officer
1\tPavel A. Chekov Young Navigator *VP
1\tRonald Tracey Delusional Captain
1\tSarek Vulcan Delegate
2\tShran In Archer's Debt *VP
1\tSilik Chameleon *VP
1\tSpock Trainee Instructor
1\tUhura Experienced Technician
1\tWeyoun "Defective" Clone
1\tWillard Decker Recommended Replacement
1\tWorf Clandestine Staffer
2\tU.S.S. Constitution
3\tU.S.S. Enterprise Where She Belongs *VP
Dilemmas:
1\tRogue Borg Ambush
2\tPsychokinetic Control
2\tShocking Betrayal
2\tHe Wasn't Nice
1\tPersonal Duty *VP
1\tHealing Hand
3\tInfinite Diversity
1\tHonorable Pursuit
2\tInequitable Exchange
1\tGomtuu Shock Wave *VP
1\tAn Issue of Trust *VP
1\tIntimidation
1\tThe Dal'Rok *VP
3\t"Rapid Progress"
1\tMoral Choice *VP
1\tPolywater Intoxication *VP
2\tArresting Display
1\tWhere No One Has Gone Before *A
2\tTak Tak Negotiations
1\tGhosts of Reality
Missions:
1\tVolan III Investigate Maquis Activity
1\tEarth Lush and Beautiful Home
1\tAlpha 5 Approach Transport Crash Survivor
1\tBa'ku Planet Safeguard Civilization
1\tMetreon Cloud Engage Enemy Ship`,
  },
];
