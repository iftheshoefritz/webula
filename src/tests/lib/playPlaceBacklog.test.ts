import { cardTitleOf } from '../../lib/cardTitle';
import { isPlaceCard, placeCoverage, placeCoverageOf } from '../../lib/playPlaces/coverage';
import { backlogOf, cardRows, shippedDecks } from './backlogData';

// The coverage of the play-place model (#1855): each personnel, ship and mission whose text has "you may
// play", and whether the model reads it. `PLACE_BACKLOG=1 yarn test playPlaceBacklog` prints the unread
// titles, by the number of shipped decks whose `Deck:` section plays them; the test is silent otherwise.

describe('the play-place coverage', () => {
  const cards = cardRows();
  const coverage = placeCoverage(cards);

  it.each([
    ['Tomek Displaced Alien'],
    ["Telek R'Mor Astrophysical Researcher"],
    ['Jadzia Dax Communications Staffer'],
    ['Kamok'],
    ['Hikaru Sulu Loyal Captain'],
    ['Clark Terrell Reliant Captain'],
    ['U.S.S. Reliant Searching for Lifeless Planets'],
    ['U.S.S. Oberth'],
    ["I.K.S. Negh'Var Infiltrated Flagship"],
    ['Shuttlepod One Reliable Transport'],
    ['Drake Voyager Shuttle'],
    ['Delta Flyer Innovative Vessel'],
    ['U.S.S. Relativity Federation Timeship'],
    ['U.S.S. Voyager Home Away From Home'],
    ['Tykk'],
    ['Curnab Sector Prevent Historical Disruption'],
    ['Vanden Prime Coordinate Resistance Operations'],
  ])('parses %s', (title) => {
    expect(coverage.parsed).toContain(title);
  });

  it('reads the headquarters texts, the costs and the plays from elsewhere as what they are', () => {
    expect(coverage.headquarters).toContain('Kira Nerys Starfleet Emissary');
    expect(coverage.costOnly).toContain('Tristan Adams Deranged Psychiatrist');
    expect(coverage.costOnly).toContain('Montgomery Scott Chief Engineer');
    expect(coverage.notAPlace).toContain('Bashir Founder Imperturbable Infiltrator');
    expect(coverage.registry).toContain("Cousteau Captain's Yacht");
    expect(coverage.unread).toContain("I.K.S. Voq'leng Ship of Prophecy");
  });

  it('lists the unread backlog, most played first', () => {
    const backlog = backlogOf(
      cards.filter(isPlaceCard).map((c) => cardTitleOf(c.name)),
      shippedDecks(),
      (t) => !coverage.unread.includes(t)
    );
    expect(backlog.map((b) => b.title).sort()).toEqual(coverage.unread);
    for (const c of cards.filter(isPlaceCard)) expect(placeCoverageOf(c)).toBeDefined();
    if (process.env.PLACE_BACKLOG) {
      console.log(
        `"You may play" titles whose place the play-place model does not read, by the decks that play them (${backlog.length}):\n` +
          backlog.map((b) => `${String(b.decks).padStart(3)}  ${b.title}`).join('\n')
      );
    }
  });
});
