import base from '@guesshive/config/eslint';

export default [
  ...base,
  { ignores: ['src/generated/**'] },
  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
  {
    languageOptions: {
      parserOptions: {
        // Lets consistent-type-imports keep value imports that Nest needs for DI metadata.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      // Nest modules are empty classes carrying a @Module() decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
];
