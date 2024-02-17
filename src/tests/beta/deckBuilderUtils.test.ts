import { aboveMinimumCount, belowMaximumCount, cardPileFor, decrementedRow, findExisting, findExistingOrUseRow, incrementedRow, numericCount, parsedDeck } from '../../app/beta/deckBuilderUtils';
import { CardDef } from '../../types';

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
    const deck = {'1R000': {row: {collectorsInfo: '1R000'}}}
    const row = {collectorsInfo: '1R000'}
    expect(findExisting(deck, row)).toEqual(deck['1R000'].row)
  })

  it('returns undefined if the existing row does not exist', () => {
    expect(findExisting({}, {collectorsInfo: '1R000'})).toBeUndefined()
  })
})

describe('findExistingOrUseRow', () => {
  it('returns the existing row if it exists', () => {
    const deck = {'1R000': {row: {collectorsInfo: '1R000'}}}
    const row = {collectorsInfo: '1R000'}
    expect(findExistingOrUseRow(deck, row)).toEqual(deck['1R000'].row)
  })

  it('returns the input row if the existing row does not exist', () => {
    const row = {collectorsInfo: '1R000'}
    expect(findExistingOrUseRow({}, row)).toEqual(row)
  })
})

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
