import BOOKMARKLET_SOURCE from '../../../app/import-trekcc/bookmarklet';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function oneDeckHtml() {
  return `
    <p>
      <a href="https://www.trekcc.org/decklists/index.php?deckID=54535&mode=viewdeck"><b>Deck One</b></a>
      <a href="https://www.trekcc.org/decklists/?deckID=54535&mode=lackeyexport2020">Download Deck to Lackey</a>
    </p>
  `;
}

function twoDeckHtml() {
  return `
    <p>
      <a href="https://www.trekcc.org/decklists/index.php?deckID=54535&mode=viewdeck"><b>Deck One</b></a>
      <a href="https://www.trekcc.org/decklists/?deckID=54535&mode=lackeyexport2020">Download Deck to Lackey</a>
    </p>
    <p>
      <a href="https://www.trekcc.org/decklists/index.php?deckID=54537&mode=viewdeck"><b>Deck Two</b></a>
      <a href="https://www.trekcc.org/decklists/?deckID=54537&mode=lackeyexport2020">Download Deck to Lackey</a>
    </p>
  `;
}

function importSelectedButton(): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Import selected');
  if (!btn) throw new Error('Import selected button not found');
  return btn as HTMLButtonElement;
}

describe('bookmarklet script', () => {
  let mockWin: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.alert = jest.fn();
    mockWin = { document: { write: jest.fn(), body: { textContent: '' } }, location: { href: '' } };
    jest.spyOn(window, 'open').mockReturnValue(mockWin);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('auto-imports directly (no overlay) when there is exactly one deck', async () => {
    document.body.innerHTML = oneDeckHtml();
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('deckID=54535')) return { text: async () => 'deck one content' };
      if (url.includes('/api/share')) return { json: async () => ({ id: 'SHARE1' }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();
    await flushPromises();
    await flushPromises();

    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(mockWin.location.href).toContain('/decks?share=SHARE1');
  });

  it('shows a multi-select overlay with a checkbox per deck plus "select all" when there are multiple decks', () => {
    document.body.innerHTML = twoDeckHtml();

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // 1 "select all" checkbox + 1 per deck
    expect(checkboxes.length).toBe(3);
    expect(document.body.textContent).toContain('Deck One');
    expect(document.body.textContent).toContain('Deck Two');
    expect(importSelectedButton()).toBeTruthy();
  });

  it('"select all" checks and unchecks every per-deck checkbox', () => {
    document.body.innerHTML = twoDeckHtml();

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const [selectAll, deckOne, deckTwo] = checkboxes;

    selectAll.click();
    expect(deckOne.checked).toBe(true);
    expect(deckTwo.checked).toBe(true);

    selectAll.click();
    expect(deckOne.checked).toBe(false);
    expect(deckTwo.checked).toBe(false);
  });

  it('alerts and does not import when clicking Import selected with nothing checked', () => {
    document.body.innerHTML = twoDeckHtml();

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    importSelectedButton().click();

    expect(window.alert).toHaveBeenCalledWith('Select at least one deck to import.');
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(3);
  });

  it('imports several selected decks as one batch, including each trekCC deck id, and opens the bulk import tab', async () => {
    document.body.innerHTML = twoDeckHtml();
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('deckID=54535')) return { text: async () => 'deck one content' };
      if (url.includes('deckID=54537')) return { text: async () => 'deck two content' };
      if (url.includes('/api/share')) return { json: async () => ({ id: 'BATCH123' }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    checkboxes[1].click(); // Deck One
    checkboxes[2].click(); // Deck Two
    importSelectedButton().click();

    await flushPromises();
    await flushPromises();
    await flushPromises();

    const shareCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/share'));
    expect(shareCall).toBeTruthy();
    const body = JSON.parse((shareCall as any)[1].body);
    const decks = JSON.parse(body.content);
    expect(decks).toEqual([
      { trekccDeckId: '54535', title: 'Deck One', content: 'deck one content' },
      { trekccDeckId: '54537', title: 'Deck Two', content: 'deck two content' },
    ]);
    expect(body.title).toBe('Bulk import (2 decks)');
    expect(mockWin.location.href).toContain('/import-trekcc/bulk?share=BATCH123');
  });

  it('falls back to the single-deck flow when only one deck is checked in the overlay', async () => {
    document.body.innerHTML = twoDeckHtml();
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('deckID=54535')) return { text: async () => 'deck one content' };
      if (url.includes('/api/share')) return { json: async () => ({ id: 'SHARE1' }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    checkboxes[1].click(); // Deck One only
    importSelectedButton().click();

    await flushPromises();
    await flushPromises();

    const shareCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/share'));
    const body = JSON.parse((shareCall as any)[1].body);
    expect(body.content).toBe('deck one content');
    expect(mockWin.location.href).toContain('/decks?share=SHARE1');
  });
});
