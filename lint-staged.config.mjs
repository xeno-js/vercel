export default {
  'src/**/*.ts': ['eslint --config eslint.config.mjs --fix --max-warnings=0', 'prettier --write'],
  '*.{json,md,yml,yaml,css,scss,html}': ['prettier --write'],
  '*.{js,mjs,cjs}': ['prettier --write'],
}
