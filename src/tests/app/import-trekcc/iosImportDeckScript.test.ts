import iosImportDeckSource from '../../../app/import-trekcc/iosImportDeckScript';

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
