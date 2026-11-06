import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.husky/**',
      'eslint.config.mjs',
      'lint-staged.config.mjs',
      'commitlint.config.cjs',
      'vitest.config.ts',
      'tsup.config.ts',
      'demo/**',
      'packages/**',
    ],
  },

  // ── Base configs ─────────────────────────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── Type-aware parser (project-wide) ─────────────────────────────────────
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── Source + test rules ──────────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // ── Core JS ──────────────────────────────────────────────────────────
      'curly': ['error', 'all'],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug'] }],
      // Disabled: the core rule does not understand TypeScript's `import type`
      // and flags intentional type/value split imports from the same module.
      // `@typescript-eslint/consistent-type-imports` already enforces correct usage.
      'no-duplicate-imports': 'off',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-template': 'error',

      // ── Import order ──────────────────────────────────────────────────────
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // ── TypeScript: type-safe guarantees ──────────────────────────────────
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/only-throw-error': 'error',
      // '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/require-await': 'off',
      // ── TypeScript: code quality ──────────────────────────────────────────
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // ── TypeScript: naming conventions ────────────────────────────────────
      '@typescript-eslint/naming-convention': [
        'error',
        // Type constructs → PascalCase
        { selector: 'typeLike', format: ['PascalCase'] },
        // Enum members → UPPER_CASE (PascalCase tolerated for legacy)
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        // Default catch-all → camelCase (leading _ allowed for intentionally unused)
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
        // Variables: also allow UPPER_CASE for module-level constants, PascalCase for imported classes
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Imports: PascalCase (classes/namespaces) and camelCase (functions/values)
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        // Object literal properties: no restriction (external API / DB column mapping)
        { selector: 'objectLiteralProperty', format: null },
        // Destructured variables: no restriction (external sources)
        { selector: 'variable', modifiers: ['destructured'], format: null },
      ],

      // ── Disabled / adjusted ───────────────────────────────────────────────
      'dot-notation': 'off',
      '@typescript-eslint/dot-notation': 'off',
    },
  },

  // ── Test files: relax rules that conflict with test patterns ────────────
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // ── Layered architecture boundaries (DDD / Clean Architecture) ─────────
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/domain',
                '@/domain/**',
                '@/application',
                '@/application/**',
                '@/infrastructure',
                '@/infrastructure/**',
                '@/presentation',
                '@/presentation/**',
              ],
              message: 'shared can only import from shared and external libraries.',
            },
            {
              group: [
                '../**/domain',
                '../**/domain/**',
                '../**/application',
                '../**/application/**',
                '../**/infrastructure',
                '../**/infrastructure/**',
                '../**/presentation',
                '../**/presentation/**',
              ],
              message: 'shared can only import from shared and external libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/application',
                '@/application/**',
                '@/infrastructure',
                '@/infrastructure/**',
                '@/presentation',
                '@/presentation/**',
              ],
              message: 'domain can only import from domain, shared, and external libraries.',
            },
            {
              group: [
                '../**/application',
                '../**/application/**',
                '../**/infrastructure',
                '../**/infrastructure/**',
                '../**/presentation',
                '../**/presentation/**',
              ],
              message: 'domain can only import from domain, shared, and external libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/infrastructure',
                '@/infrastructure/**',
                '@/presentation',
                '@/presentation/**',
              ],
              message:
                'application can only import from application, domain, shared, and external libraries.',
            },
            {
              group: [
                '../**/infrastructure',
                '../**/infrastructure/**',
                '../**/presentation',
                '../**/presentation/**',
              ],
              message:
                'application can only import from application, domain, shared, and external libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/presentation', '@/presentation/**'],
              message:
                'infrastructure can only import from infrastructure, domain, application, shared, and external libraries.',
            },
            {
              group: ['../**/presentation', '../**/presentation/**'],
              message:
                'infrastructure can only import from infrastructure, domain, application, shared, and external libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure', '@/infrastructure/**'],
              message:
                'presentation can only import from presentation, domain, application, shared, and external libraries.',
            },
            {
              group: ['../**/infrastructure', '../**/infrastructure/**'],
              message:
                'presentation can only import from presentation, domain, application, shared, and external libraries.',
            },
          ],
        },
      ],
    },
  },

  // ── Prettier (must be last) ───────────────────────────────────────────────
  eslintConfigPrettier,
)
