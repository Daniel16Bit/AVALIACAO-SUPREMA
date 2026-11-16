'use strict';
// Lint for real mistakes only: no style or formatting rule is enabled here.
// The older files are heavily compacted and are not reformatted until the readability stage.
const globals = require('globals');

const mistakes = {
  'constructor-super': 'error',
  'for-direction': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-class-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': 'error',
  'no-const-assign': 'error',
  'no-constant-binary-expression': 'error',
  'no-debugger': 'error',
  'no-delete-var': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-else-if': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-ex-assign': 'error',
  'no-func-assign': 'error',
  'no-global-assign': 'error',
  'no-import-assign': 'error',
  'no-invalid-regexp': 'error',
  'no-irregular-whitespace': 'error',
  'no-loss-of-precision': 'error',
  'no-misleading-character-class': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-obj-calls': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-setter-return': 'error',
  'no-shadow-restricted-names': 'error',
  'no-this-before-super': 'error',
  'no-undef': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unused-private-class-members': 'error',
  // Dead code is not a failure by itself: reported as a warning and capped by "npm run lint".
  'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true}],
  'no-useless-backreference': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
};

module.exports = [
  {ignores: ['node_modules/**', 'data/**', 'backups/**', 'archive/**', 'tests/reports/**']},
  {
    files: ['**/*.js'],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules: mistakes
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {sourceType: 'script', globals: globals.browser}
  },
  // The screens below read globals declared by features/avaliacoes/app.js. Each name is listed
  // so that any other undefined name is still an error. None of them replaces a function of the
  // app any more: they register complements in window.SupremaHooks (shared/ui.js).
  {
    files: ['apps/web/public/features/academico/academico.js'],
    languageOptions: {
      globals: {
        api: 'readonly',
        studentAssessments: 'readonly',
        studentCurrent: 'readonly',
        studentResult: 'readonly',
        loadStudentAssessment: 'readonly'
      }
    }
  },
  {
    files: ['apps/web/public/features/indicadores/analytics.js'],
    languageOptions: {
      globals: {
        currentAssessment: 'readonly',
        currentStats: 'readonly'
      }
    }
  },
  {
    files: ['apps/web/public/features/evolucao/analytics.js'],
    languageOptions: {globals: {dirty: 'readonly'}}
  }
];
