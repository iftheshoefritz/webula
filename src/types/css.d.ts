// TypeScript 6 checks side-effect imports (noUncheckedSideEffectImports), and the
// Next.js types declare only `*.module.css`, so a plain stylesheet needs this (#386).
declare module '*.css';
