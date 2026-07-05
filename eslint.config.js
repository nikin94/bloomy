import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importX from 'eslint-plugin-import-x'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `functions/` is a SEPARATE Node package (Cloud Functions) with its own
  // tsconfig, deps and (Node, not browser) globals — it builds on its own
  // (functions/ `npm run build`, strict tsconfig), so the root toolchain skips it.
  //
  // `.claude/worktrees/` holds throwaway git worktrees the agent tooling creates
  // INSIDE the repo root. Linting those checkout copies makes typescript-eslint
  // discover two tsconfig roots (this repo + the nested worktree) and fail with
  // "multiple candidate TSConfigRootDirs" on every file, so exclude them — they're
  // untracked and CI's clean checkout never sees them.
  globalIgnores(['dist', 'functions', '.claude/worktrees']),
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
    plugins: {
      'import-x': importX,
    },
    settings: {
      // Teach import-x's graph analysis how to resolve `@/*` (and .ts/.tsx) via
      // the tsconfig, so no-cycle can follow aliased imports across the tree.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.app.json', './tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      // Always use strict equality (=== / !==), never == / !=.
      eqeqeq: ['error', 'always'],
      // Allow dropping a key via a rest spread (`const { id, ...rest } = obj`)
      // without the pulled-out key counting as an unused variable.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Guard the alias convention:
      //  • no circular imports — the failure mode barrel files invite; we avoid
      //    barrels precisely so this stays clean.
      //  • no parent-relative (`../…`) specifiers — cross-directory imports go
      //    through the `@/…` alias; only same-directory siblings stay relative
      //    (`./File`). Matched on the literal specifier text (a `^\.\./` regex), so
      //    it forbids `../` at any depth while leaving `@/…` and `./` untouched —
      //    unlike import-x/no-relative-parent-imports, which resolves the alias
      //    back to a physical path and would wrongly flag `@/…` too.
      'import-x/no-cycle': 'error',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./',
              message:
                'Use the `@/…` alias for cross-directory imports instead of parent-relative (`../`) paths.',
            },
          ],
        },
      ],
    },
  },
  {
    // The two Firestore/Storage security-rules tests import the rule files from the
    // repo root (outside src), which the `@/…` alias can't express — allow their
    // parent-relative import.
    files: ['src/test/*.rules.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
])
