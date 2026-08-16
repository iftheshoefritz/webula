import iosListDecksSource from '../../../app/import-trekcc/iosListDecksScript';

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
