import globals from 'globals';

// Correctness checks only: keep formatting and broad refactors off the gameplay path.
export default [
  {ignores:['node_modules/**','dist/**','reports/**','**/bin/**','**/obj/**']},
  {
    files:['**/*.mjs','**/*.js'],
    languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:globals.node},
    rules:{
      'no-undef':'error',
      'no-unreachable':'error',
      'no-dupe-args':'error',
      'no-dupe-keys':'error',
      'no-duplicate-case':'error',
      'no-func-assign':'error',
      'no-import-assign':'error',
      'no-const-assign':'error',
      'valid-typeof':'error',
      'no-unsafe-finally':'warn',
      'no-async-promise-executor':'error',
      'constructor-super':'error',
      'no-this-before-super':'error',
    },
  },
];
