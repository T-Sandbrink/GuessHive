/** Shared Prettier options. Apps add their own plugins (e.g. Svelte, Tailwind) on top. */
/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',
};

export default config;
