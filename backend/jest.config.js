/** @type {import('ts-jest').JestConfigWithTsJest} */

// ---------------------------------------------------------------------------
// JEST CONFIGURATION                                                       
// TypeScript test runner with node environment                            
// ---------------------------------------------------------------------------

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Path alias resolution (none currently in backend)
  moduleNameMapper: {},

  // TypeScript transformation with Jest globals
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true, types: ['node', 'jest'] } }],
  },
};
