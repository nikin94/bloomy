import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `functions/` is a SEPARATE Node package (Cloud Functions) with its own
  // tsconfig, deps and (Node, not browser) globals — it builds on its own
  // (functions/ `npm run build`, strict tsconfig), so the root toolchain skips it.
  globalIgnores(['dist', 'functions']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Always use strict equality (=== / !==), never == / !=.
      eqeqeq: ['error', 'always'],
      // Allow dropping a key via a rest spread (`const { id, ...rest } = obj`)
      // without the pulled-out key counting as an unused variable.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
])
