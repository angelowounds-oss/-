// ESLint config (EV-94), run through build/lint.mjs on the files a branch changed. Kept small on purpose: the rules that caught or would have
// caught real defects here (code swallowed by a comment, unused or undefined names, stray console.log in the game).
import globals from 'globals';
import noCodeInComment from './lint/no-code-in-comment.mjs';

const local = { rules: { 'no-code-in-comment': noCodeInComment } };
const base = {
  'local/no-code-in-comment': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-self-assign': 'error',
};
export default [
  { ignores: ['build/baked/**', 'build/node_modules/**', 'build/.osm-cache/**', 'dist/**', '**/vendor/**', 'launcher/node_modules/**'] },
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } }, plugins: { local }, rules: { ...base, 'no-console': ['error', { allow: ['warn', 'error', 'info'] }] } },
  { files: ['build/**/*.mjs', 'tests/**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, plugins: { local }, rules: base },
  { files: ['tests/**/*.cjs', 'tests/lib/*.js', 'launcher/**/*.cjs', 'launcher/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }, plugins: { local }, rules: base },
];
