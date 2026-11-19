import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Paths no package should lint. */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.svelte-kit/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
  ],
};

/**
 * Base flat config for every GuessHive package (AGENTS.md §7): type-aware strict rules
 * (no `any`, no floating promises, no non-null assertions) and no stray console logs.
 * Packages spread this array, then add `tsconfigRootDir: import.meta.dirname` and
 * any framework-specific configs after it. Plain JS config files are linted without types.
 */
const base = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  },
  prettier,
];

export default base;
