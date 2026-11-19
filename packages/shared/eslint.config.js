import base from '@guesshive/config/eslint';

export default [
  ...base,
  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
];
