import base from '@guesshive/config/prettier';
import * as sveltePlugin from 'prettier-plugin-svelte';
import * as tailwindPlugin from 'prettier-plugin-tailwindcss';

// Plugins are imported as modules (not by name) so Prettier also finds them
// when it runs from the repo root, e.g. via lint-staged.
/** @type {import('prettier').Config} */
const config = {
  ...base,
  plugins: [sveltePlugin, tailwindPlugin],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
  tailwindStylesheet: './src/routes/layout.css',
};

export default config;
