export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['eslint --max-warnings 0'],
  // Full type check whenever any TS file is staged (tsc can't check a subset in isolation)
  '*.{ts,tsx}': [() => 'pnpm typecheck'],
  '*': ['prettier --check --ignore-unknown'],
}
