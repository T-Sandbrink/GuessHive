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
      // Queues are registered through registerQueue() in src/queue/logged-bullmq.ts, which sets
      // the queue and worker classes that log connection errors from construction on (task 1.8).
      'no-restricted-properties': [
        'error',
        ...['registerQueue', 'registerQueueAsync'].map((property) => ({
          object: 'BullModule',
          property,
          message: 'Use registerQueue() from src/queue/logged-bullmq.ts.',
        })),
      ],
    },
  },
  {
    files: ['src/queue/logged-bullmq.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
];
