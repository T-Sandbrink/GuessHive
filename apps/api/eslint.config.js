import base from '@guesshive/config/eslint';

export default [
  ...base,
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
