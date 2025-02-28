import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: ['dist', 'src/@types', '*.{js,ts}'],
  },
  {
    name: 'default',
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      camelcase: 'off',
      semi: ['warn', 'always'],
      eqeqeq: ['error', 'smart'],
      'array-callback-return': 'error',
      'arrow-body-style': 'error',
      'comma-dangle': 'off',
      'default-case': 'error',
      'jsx-quotes': ['error', 'prefer-single'],
      'linebreak-style': ['error', 'unix'],
      'no-console': 'off',
      'no-mixed-spaces-and-tabs': 'warn',
      'no-self-compare': 'error',
      'no-underscore-dangle': 'off',
      'no-use-before-define': 'off',
      'no-useless-concat': 'error',
      'no-var': 'error',
      'no-script-url': 'error',
      'no-continue': 'off',
      'object-shorthand': 'warn',
      'prefer-const': 'warn',
      'require-await': 'error',
      'sort-imports': [
        'error',
        {
          allowSeparatedGroups: true,
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
      'sort-keys': 'off',
      'valid-typeof': 'error',
      'max-classes-per-file': 'off',
      'no-unused-expressions': 'off',
      'import/prefer-default-export': 'off',
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true, // TODO: set to false once React is in the dependencies (not devDependencies)
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: false, caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // TODO: remove this rule once all files are .mjs (and require is not used)
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
