import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Architecture DAG: inner layers must not depend on outer ones.
            { sourceTag: 'type:core', onlyDependOnLibsWithTags: [] },
            { sourceTag: 'type:contracts', onlyDependOnLibsWithTags: ['type:core'] },
            { sourceTag: 'type:transport', onlyDependOnLibsWithTags: ['type:core', 'type:contracts'] },
            { sourceTag: 'type:infra', onlyDependOnLibsWithTags: ['type:core', 'type:infra'] },
            { sourceTag: 'type:saga', onlyDependOnLibsWithTags: ['type:core', 'type:infra'] },
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['*'] },
            // Catch-all so untagged projects (gateway/e2e) stay permitted.
            { sourceTag: '*', onlyDependOnLibsWithTags: ['*'] },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
