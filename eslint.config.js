import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'server-dist',
    '**/.next/**',
    'test-results',
    'apps/web/public/sw.js',
    'apps/web/public/workbox-*.js',
    'apps/web/public/fallback-*.js',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Temporary: React Compiler lint noise / setState-in-effect until refactors land.
      'react-hooks/set-state-in-effect': 'off',
      // Date.now()/Math.random() dans handlers async encore signalés comme « render ».
      'react-hooks/purity': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
