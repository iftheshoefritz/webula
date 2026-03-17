import { aboveMinimumCount, belowMaximumCount, cardPileFor, deckFromTsv, decrementedRow, expandDeck, findExisting, findExistingOrUseRow, incrementedRow, mergeDeckPiles, numericCount, parsedDeck, shuffleArray } from '../../app/decks/deckBuilderUtils';
import { CardDef } from '../../types';

describe('constructing a deck object based on TSV text and a list of all card data', () => {
  it('creates a deck from TSV with correct piles and counts', () => {
    const tsv = '1\tCard 1\n2\tCard 2\n1\tUnknown card'
    const data = [
      {collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission'},
      {collectorsinfo: '2C001', originalName: 'Card 2', type: 'event'},
    ]
    const deck = deckFromTsv(tsv, data)
    expect(deck['1R000'].row.pile).toEqual('mission')
    expect(deck['2C001'].row.pile).toEqual('draw')
    expect(deck['1R000'].row.count).toEqual(1)
    expect(deck['1R000'].count).toEqual(1)
    expect(deck['2C001'].row.count).toEqual(2)
    expect(deck['2C001'].count).toEqual(2)
    expect(Object.keys(deck).length).toEqual(2)
  })
})

describe('constructing a deck object based on TSV lines and a list of all card data', () => {

  it('returns a deck object with keys for known card names', () => {
    const lines = ['1\tCard 1']
    const data = [
      {collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission'},
    ]
    const deck = parsedDeck(lines, data)
    expect(deck['1R000']).toBeDefined()
  })

  it('returns a deck object with no keys for unknown card names', () => {
    const lines = ['2\tCard 2']
    const data = []
    const deck = parsedDeck(lines, data)
    expect(deck['2C001']).toBeUndefined()
  })

  it('has the right count for each card', () => {
    const lines = ['3\tCard 1', '2\tCard 2']
    const data = [
      {collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission'},
      {collectorsinfo: '2C001', originalName: 'Card 2', type: 'dilemma'},
    ]
    const deck = parsedDeck(lines, data)
    expect(deck['1R000'].count).toEqual(3)
    expect(deck['1R000'].row.count).toEqual(3)
    expect(deck['2C001'].count).toEqual(2)
    expect(deck['2C001'].row.count).toEqual(2)
  })

  it('has the right pile for each card', () => {
    const lines = ['3\tCard 1', '2\tCard 2']
    const data = [
      {collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission'},
      {collectorsinfo: '2C001', originalName: 'Card 2', type: 'dilemma'},
    ]
    const deck = parsedDeck(lines, data)
    expect(deck['1R000'].row.pile).toEqual('mission')
    expect(deck['2C001'].row.pile).toEqual('dilemma')
  })

  it('returns the right number of rows', () => {
    const lines = ['1\tCard 1', '2\tCard 2']
    const data = [
      {collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission'},
      {collectorsinfo: '2C001', originalName: 'Card 2', type: 'dilemma'},
    ]
    const deck = parsedDeck(lines, data)
    expect(Object.keys(deck).length).toEqual(2)
  })

  it('does not mutate the original data objects', () => {
    const original = { collectorsinfo: '1R000', originalName: 'Card 1', type: 'mission' }
    const data = [{ ...original }]
    parsedDeck(['2\tCard 1'], data)
    expect((data[0] as any).count).toBeUndefined()
    expect((data[0] as any).pile).toBeUndefined()
  })
})

describe('incrementedRow', () => {
  it('returns a new row with a count one higher than the input row', () => {
    const row = {count: 2}
    const incremented = incrementedRow(row)
    expect(incremented.count).toEqual(3)
  })

  it('includes a pile property based on the input row', () => {
    const row = {count: 2, type: 'event'}
    const incremented = incrementedRow(row)
    expect(incremented.pile).toEqual('draw')
  })

  it('returns a row with 1 if the input row has no count', () => {
    const row = {}
    const incremented = incrementedRow(row)
    expect(incremented.count).toEqual(1)
  })

  it('maintains the other properties of the input row', () => {
    const row = {count: 2, type: 'event'}
    const incremented = incrementedRow(row)
    expect(incremented.type).toEqual('event')
  })
})

describe('decrementedRow', () => {
  it('returns a new row with a count one lower than the input row', () => {
    const row = {count: 2}
    const decremented = decrementedRow(row)
    expect(decremented.count).toEqual(1)
  })

  it('maintains the other properties of the input row', () => {
    const row = {count: 2, type: 'event'}
    const decremented = decrementedRow(row)
    expect(decremented.type).toEqual('event')
  })
})

describe('cardPileFor', () => {
  it('returns "mission" for a mission card', () => {
    const card = cardFixture({type: 'mission'})
    expect(cardPileFor(card)).toEqual('mission')
  })

  it('returns "dilemma" for a dilemma card', () => {
    const card = cardFixture({type: 'dilemma'})
    expect(cardPileFor(card)).toEqual('dilemma')
  })

  it('returns "draw" for any other card type', () => {
    const card = cardFixture({type: 'event'})
    expect(cardPileFor(card)).toEqual('draw')
  })
})

describe('numericCount', () => {
  it('returns the count property of an object', () => {
    const card = {count: 2}
    expect(numericCount(card)).toEqual(2)
  })

  it('returns 0 if the object has no count property', () => {
    expect(numericCount({})).toEqual(0)
  })

  it('returns 0 if the object is undefined', () => {
    expect(numericCount(undefined)).toEqual(0)
  })
})

describe('belowMaximumCount', () => {
  it('returns true if the count is less than the maximum', () => {
    const card = {count: 2}
    expect(belowMaximumCount(card, 3)).toEqual(true)
  })

  it('returns false if the count is equal to the maximum', () => {
    const card = {count: 3}
    expect(belowMaximumCount(card, 3)).toEqual(false)
  })

  it('returns false if the count is greater than the maximum', () => {
    const card = {count: 4}
    expect(belowMaximumCount(card, 3)).toEqual(false)
  })

  it('returns true if the count is undefined', () => {
    expect(belowMaximumCount({}, 3)).toEqual(true)
  })

  it('returns true if the count is 0', () => {
    const card = {count: 0}
    expect(belowMaximumCount(card, 3)).toEqual(true)
  })
})

describe('aboveMinimumCount', () => {
  it('returns true if the count is greater than the minimum', () => {
    const card = {count: 2}
    expect(aboveMinimumCount(card, 1)).toEqual(true)
  })

  it('returns false if the count is equal to the minimum', () => {
    const card = {count: 1}
    expect(aboveMinimumCount(card, 1)).toEqual(false)
  })

  it('returns false if the count is less than the minimum', () => {
    const card = {count: 0}
    expect(aboveMinimumCount(card, 1)).toEqual(false)
  })
})

describe('findExisting', () => {
  it('returns the existing row if it exists', () => {
    const deck = {'1R000': {row: {collectorsinfo: '1R000'}}}
    const row = {collectorsinfo: '1R000'}
    expect(findExisting(deck, row)).toEqual(deck['1R000'].row)
  })

  it('returns undefined if the existing row does not exist', () => {
    expect(findExisting({}, {collectorsinfo: '1R000'})).toBeUndefined()
  })
})

describe('findExistingOrUseRow', () => {
  it('returns the existing row if it exists', () => {
    const deck = {'1R000': {row: {collectorsinfo: '1R000'}}}
    const row = {collectorsinfo: '1R000'}
    expect(findExistingOrUseRow(deck, row)).toEqual(deck['1R000'].row)
  })

  it('returns the input row if the existing row does not exist', () => {
    const row = {collectorsinfo: '1R000'}
    expect(findExistingOrUseRow({}, row)).toEqual(row)
  })
})

describe('expandDeck', () => {
  it('expands draw cards by their count', () => {
    const deck = {
      '2C001': { row: { collectorsinfo: '2C001', type: 'event', pile: 'draw' }, count: 2 },
    }
    expect(expandDeck(deck).length).toEqual(2)
  })

  it('excludes mission cards', () => {
    const deck = {
      '1R000': { row: { collectorsinfo: '1R000', type: 'mission', pile: 'mission' }, count: 1 },
    }
    expect(expandDeck(deck).length).toEqual(0)
  })

  it('excludes dilemma cards', () => {
    const deck = {
      '3R001': { row: { collectorsinfo: '3R001', type: 'dilemma', pile: 'dilemma' }, count: 3 },
    }
    expect(expandDeck(deck).length).toEqual(0)
  })

  it('expands multiple draw cards', () => {
    const deck = {
      '2C001': { row: { collectorsinfo: '2C001', type: 'event' }, count: 2 },
      '2C002': { row: { collectorsinfo: '2C002', type: 'personnel' }, count: 3 },
    }
    expect(expandDeck(deck).length).toEqual(5)
  })

  it('returns each copy as an independent object with the same data', () => {
    const row = { collectorsinfo: '2C001', type: 'event', name: 'My Card' }
    const deck = { '2C001': { row, count: 2 } }
    const result = expandDeck(deck)
    expect(result[0]).toEqual(row)
    expect(result[1]).toEqual(row)
    expect(result[0]).not.toBe(row)
    expect(result[1]).not.toBe(row)
    expect(result[0]).not.toBe(result[1])
  })

  it('returns an empty array for an empty deck', () => {
    expect(expandDeck({})).toEqual([])
  })
})

describe('shuffleArray', () => {
  it('returns an array of the same length', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffleArray(arr).length).toEqual(5)
  })

  it('contains the same elements as the input', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffleArray(arr).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3, 4, 5]
    shuffleArray(arr)
    expect(arr).toEqual([1, 2, 3, 4, 5])
  })

  it('returns an empty array when given an empty array', () => {
    expect(shuffleArray([])).toEqual([])
  })
})

describe('mergeDeckPiles', () => {
  const missionCard = { collectorsinfo: 'M1', type: 'mission', originalName: 'Mission 1', pile: 'mission', count: 1, name: 'Mission 1', dilemmatype: '', imagefile: '', unique: 'n', mission: 'S' };
  const dilemmaCard = { collectorsinfo: 'D1', type: 'dilemma', originalName: 'Dilemma 1', pile: 'dilemma', count: 2, name: 'Dilemma 1', dilemmatype: 'planet', imagefile: '', unique: 'n', mission: '' };
  const drawCard = { collectorsinfo: 'P1', type: 'personnel', originalName: 'Personnel 1', pile: 'draw', count: 3, name: 'Personnel 1', dilemmatype: '', imagefile: '', unique: 'n', mission: '' };

  const currentDeck = {
    M1: { count: 1, row: missionCard },
    D1: { count: 2, row: dilemmaCard },
    P1: { count: 3, row: drawCard },
  };

  const newMission = { ...missionCard, collectorsinfo: 'M2', originalName: 'Mission 2', name: 'Mission 2' };
  const newDilemma = { ...dilemmaCard, collectorsinfo: 'D2', originalName: 'Dilemma 2', name: 'Dilemma 2' };
  const newDraw = { ...drawCard, collectorsinfo: 'P2', originalName: 'Personnel 2', name: 'Personnel 2' };

  const incomingDeck = {
    M2: { count: 1, row: newMission },
    D2: { count: 1, row: newDilemma },
    P2: { count: 2, row: newDraw },
  };

  it('loading only dilemmas replaces dilemmas and keeps missions + draw', () => {
    const result = mergeDeckPiles(currentDeck, incomingDeck, ['dilemma']);
    expect(result['M1']).toBeDefined();
    expect(result['P1']).toBeDefined();
    expect(result['D2']).toBeDefined();
    expect(result['D1']).toBeUndefined();
    expect(result['M2']).toBeUndefined();
    expect(result['P2']).toBeUndefined();
  });

  it('loading only draw replaces draw and keeps missions + dilemmas', () => {
    const result = mergeDeckPiles(currentDeck, incomingDeck, ['draw']);
    expect(result['M1']).toBeDefined();
    expect(result['D1']).toBeDefined();
    expect(result['P2']).toBeDefined();
    expect(result['P1']).toBeUndefined();
    expect(result['M2']).toBeUndefined();
    expect(result['D2']).toBeUndefined();
  });

  it('loading only missions replaces missions and keeps dilemmas + draw', () => {
    const result = mergeDeckPiles(currentDeck, incomingDeck, ['mission']);
    expect(result['D1']).toBeDefined();
    expect(result['P1']).toBeDefined();
    expect(result['M2']).toBeDefined();
    expect(result['M1']).toBeUndefined();
    expect(result['D2']).toBeUndefined();
    expect(result['P2']).toBeUndefined();
  });

  it('loading multiple piles replaces those piles and keeps the rest', () => {
    const result = mergeDeckPiles(currentDeck, incomingDeck, ['mission', 'dilemma']);
    expect(result['P1']).toBeDefined();
    expect(result['M2']).toBeDefined();
    expect(result['D2']).toBeDefined();
    expect(result['M1']).toBeUndefined();
    expect(result['D1']).toBeUndefined();
    expect(result['P2']).toBeUndefined();
  });
});

const cardFixture = (overrides = {}): CardDef => ({
  collectorsinfo: '1R000',
  dilemmatype: 'planet',
  imagefile: '1r000.jpg',
  name: 'Card 1',
  type: 'mission',
  count: 1,
  originalName: 'Card 1',
  mission: 'S',
  unique: 'n',
  ...overrides,
})
