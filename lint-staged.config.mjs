export default {
  '*.{ts,tsx}': [
    'eslint --fix --max-warnings 0',
    'prettier --write',
    // tsc cannot reliably validate an isolated subset of project files.
    () => 'pnpm typecheck',
  ],
  '*.{js,jsx,mjs,cjs}': ['eslint --fix --max-warnings 0', 'prettier --write'],
  '*.{json,jsonc,yaml,yml,md,mdx,css,scss,html}': ['prettier --write'],
}
