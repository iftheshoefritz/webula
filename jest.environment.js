// jsdom test environment with a smaller default stylesheet.
//
// jsdom runs its whole default (user agent) stylesheet on every getComputedStyle call: it matches
// about 120 rules against the element and parses every declaration, colors and fonts too. The
// DeckBuilderClient tests spent about half of their time there, because Testing Library calls
// getComputedStyle for each element that a role query checks. React changes the DOM on every
// render, and a DOM change clears jsdom's style cache, so the cost repeats after each click.
//
// The tests load no CSS, and they only use the display, visibility, and pointer-events styles
// (for example through getByRole and toBeVisible). So this environment keeps only those
// declarations of the default stylesheet. jsdom reads the stylesheet from a module, so the
// environment puts the smaller stylesheet in the require cache before jsdom loads.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const KEPT_PROPERTIES = new Set(['display', 'visibility', 'pointer-events']);

const environmentDir = path.dirname(require.resolve('jest-environment-jsdom'));
const jsdomDir = path.dirname(
  require.resolve('jsdom/package.json', { paths: [environmentDir] })
);
const stylesheetPath = path.join(jsdomDir, 'lib/jsdom/browser/default-stylesheet.js');

function smallerStylesheet(css) {
  const rules = [];
  // The @namespace statement stays: jsdom parses it together with the first rule (html), and that
  // rule must match (or not match) exactly as it does with the full stylesheet.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = body
      .split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => KEPT_PROPERTIES.has(declaration.split(':')[0].trim().toLowerCase()));
    if (declarations.length > 0) {
      rules.push(`${selector.trim()} { ${declarations.join('; ')} }`);
    }
  }
  return rules.join('\n');
}

// If a jsdom upgrade moves or changes the stylesheet module, use jsdom as it is. The tests are then
// slower but still correct, and src/tests/jestEnvironment.test.ts shows the problem.
if (fs.existsSync(stylesheetPath) && !require.cache[stylesheetPath]) {
  const fullStylesheet = require(stylesheetPath);
  const stylesheet = typeof fullStylesheet === 'string' ? smallerStylesheet(fullStylesheet) : '';
  if (stylesheet.includes('[hidden] { display: none }')) {
    const stylesheetModule = new Module(stylesheetPath, module);
    stylesheetModule.filename = stylesheetPath;
    stylesheetModule.loaded = true;
    stylesheetModule.exports = stylesheet;
    // require() above cached the full stylesheet. Replace it with the smaller one.
    require.cache[stylesheetPath] = stylesheetModule;
  }
}

module.exports = require('jest-environment-jsdom');
