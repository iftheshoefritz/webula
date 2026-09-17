// jest.environment.js gives jsdom a smaller default stylesheet, so that getComputedStyle is fast.
// The smaller stylesheet keeps only the display, visibility, and pointer-events declarations. These
// checks fail if a jsdom upgrade stops the smaller stylesheet from loading, or changes these values.

const computed = (html: string, selector: string) => {
  document.body.innerHTML = html;
  const style = window.getComputedStyle(document.querySelector(selector)!);
  return {
    display: style.display,
    visibility: style.visibility,
    pointerEvents: style.getPropertyValue('pointer-events'),
  };
};

describe('jest test environment', () => {
  it('keeps the default display values of the jsdom stylesheet', () => {
    expect(computed('<div></div>', 'div').display).toBe('block');
    expect(computed('<p></p>', 'p').display).toBe('block');
    expect(computed('<li></li>', 'li').display).toBe('list-item');
    expect(computed('<span></span>', 'span').display).toBe('');
    expect(computed('<table><tbody><tr><td>x</td></tr></tbody></table>', 'td').display).toBe('table-cell');
  });

  it('hides elements with the hidden attribute and hidden inputs', () => {
    expect(computed('<div hidden></div>', 'div').display).toBe('none');
    expect(computed('<input type="hidden" />', 'input').display).toBe('none');
  });

  it('applies inline display, visibility, and pointer-events styles', () => {
    expect(
      computed('<div style="display: flex; visibility: hidden; pointer-events: none"></div>', 'div')
    ).toEqual({ display: 'flex', visibility: 'hidden', pointerEvents: 'none' });
  });

  it('inherits visibility and pointer-events from ancestors', () => {
    const html = '<div style="visibility: hidden; pointer-events: none"><span>x</span></div>';
    expect(computed(html, 'span')).toMatchObject({ visibility: 'hidden', pointerEvents: 'none' });
  });

  it('drops the declarations that the tests do not use, such as fonts', () => {
    // The full jsdom stylesheet sets h1 { font-weight: bold }.
    document.body.innerHTML = '<h1>Title</h1>';
    const style = window.getComputedStyle(document.querySelector('h1')!);
    expect(style.getPropertyValue('font-weight')).toBe('');
  });
});
