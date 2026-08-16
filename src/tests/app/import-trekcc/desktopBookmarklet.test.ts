import BOOKMARKLET_SOURCE from '../../../app/import-trekcc/desktopBookmarklet';

describe('desktop bookmarklet script', () => {
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
