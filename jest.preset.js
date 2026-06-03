const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.base.json');
const nxPreset = require('@nx/jest/preset').default;

// Make the @beta/* TS path aliases resolvable in jest. Every project lives at
// depth 2 (libs/<name> or apps/<name>), so a single '<rootDir>/../../' prefix
// resolves the workspace-root-relative paths for all of them.
module.exports = {
  ...nxPreset,
  moduleNameMapper: {
    ...(nxPreset.moduleNameMapper ?? {}),
    ...pathsToModuleNameMapper(compilerOptions.paths ?? {}, {
      prefix: '<rootDir>/../../',
    }),
  },
};
