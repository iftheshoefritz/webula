import BOOKMARKLET_SOURCE, {
  iosListDecksSource,
  iosImportDeckSource,
} from '../../../app/import-trekcc/bookmarklet';

describe('bookmarklet script', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.alert = jest.fn();
  });

  afterEach(() => {
    delete (global as any).completion;
  });

  it('calls the injected completion() when run as an iOS Shortcut', () => {
    const completion = jest.fn();
    (global as any).completion = completion;

    // eslint-disable-next-line no-new-func
    new Function(BOOKMARKLET_SOURCE)();

    expect(completion).toHaveBeenCalled();
  });

  it('does not throw when run as a plain bookmarklet (no completion global)', () => {
    expect((global as any).completion).toBeUndefined();

    // eslint-disable-next-line no-new-func
    expect(() => new Function(BOOKMARKLET_SOURCE)()).not.toThrow();
  });
});

describe('iosListDecksSource', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    delete (global as any).completion;
  });

  it('calls completion() synchronously with a name -> href dictionary, without fetch/alert/DOM', () => {
    document.body.innerHTML = `
      <p><a href="/decklists/?mode=viewdeck&id=1"><b>Deck One</b></a>
         <a href="https://www.trekcc.org/x?mode=lackeyexport2020&id=1">Download to Lackey</a></p>
    `;
    const completion = jest.fn();
    (global as any).completion = completion;
    window.alert = jest.fn();
    (global as any).fetch = jest.fn();

    // eslint-disable-next-line no-new-func
    new Function(iosListDecksSource)();

    // Called before any microtask/timer flush, i.e. synchronously.
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion).toHaveBeenCalledWith({
      'Deck One': 'https://www.trekcc.org/x?mode=lackeyexport2020&id=1',
    });
    expect(window.alert).not.toHaveBeenCalled();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe('iosImportDeckSource', () => {
  afterEach(() => {
    delete (global as any).completion;
    delete (global as any).fetch;
  });

  // Flushes enough microtask turns for the script's multi-hop fetch -> fetch -> json
  // promise chain to settle, without relying on fake timers.
  const flushPromises = async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  it('does not call completion() until the fetch/POST chain resolves, then reports the share URL', async () => {
    const completion = jest.fn();
    (global as any).completion = completion;
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({ text: () => Promise.resolve('deck content') })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ id: 'abc123' }) });

    // eslint-disable-next-line no-new-func
    new Function(iosImportDeckSource)();

    expect(completion).not.toHaveBeenCalled();

    await flushPromises();

    expect(completion).toHaveBeenCalledWith(expect.stringContaining('/decks?share=abc123'));
  });

  it('calls completion() with an error: prefixed message when the fetch chain rejects', async () => {
    const completion = jest.fn();
    (global as any).completion = completion;
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));

    // eslint-disable-next-line no-new-func
    new Function(iosImportDeckSource)();

    expect(completion).not.toHaveBeenCalled();

    await flushPromises();

    expect(completion).toHaveBeenCalledWith('error:network down');
  });
});
