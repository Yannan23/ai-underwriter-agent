import cspellPlugin from '@cspell/eslint-plugin'
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import vitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import promise from 'eslint-plugin-promise'
import { config as defineConfig, configs as tseslint } from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['**/node_modules/', '**/dist/', 'coverage/', 'apps/web/'],
  },
  js.configs.recommended,
  ...tseslint.recommendedTypeChecked,
  ...tseslint.stylisticTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  promise.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      '@cspell': cspellPlugin,
    },
    rules: {
      'no-console': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import/no-duplicates': ['error', { 'prefer-inline': true }],
      'import/prefer-default-export': 'off',
      'promise/prefer-await-to-then': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
      ],
      // Ban duplicate path segments in imports (e.g. Button/Button)
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(?:^|/)([^/.][^/]*)/\\1(?:/|$)',
              message:
                'Import path repeats a segment (e.g. Button/Button) — import the directory instead.',
            },
          ],
        },
      ],
      '@cspell/spellchecker': ['error', { autoFix: false }],
    },
  },
  {
    files: ['**/*.test.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/consistent-test-it': ['error', { fn: 'test' }],
      'vitest/consistent-test-filename': [
        'error',
        { pattern: '.*\\.test\\.ts$' },
      ],
      // vitest's expect() supports an optional failure-message second argument
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
  {
    // Mock stages implement the async Stage.run interface without awaiting yet;
    // drop this override once real LLM calls land in the stages.
    files: ['packages/pipeline/src/stages/**'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.disableTypeChecked,
  },
  prettier
)
