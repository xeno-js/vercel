module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allowed commit types (Conventional Commits standard)
    'type-enum': [
      2,
      'always',
      [
        'feat', // new feature
        'fix', // bug fix
        'chore', // maintenance, dependencies
        'docs', // documentation only
        'style', // formatting, no logic change
        'refactor', // code change without feat/fix
        'perf', // performance improvement
        'test', // add or fix tests
        'build', // build system or external deps
        'ci', // CI/CD configuration
        'revert', // revert a previous commit
      ],
    ],

    // type and scope must be lower-case
    'type-case': [2, 'always', 'lower-case'],
    'scope-case': [2, 'always', 'lower-case'],

    // subject: lower-case, non-empty, no trailing period
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // header: max 72 chars (git standard — fits in most UIs without truncation)
    'header-max-length': [2, 'always', 72],

    // body/footer: blank line required before content
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
}
