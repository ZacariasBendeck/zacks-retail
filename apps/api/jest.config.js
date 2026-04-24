const path = require('node:path');

process.loadEnvFile?.(path.join(__dirname, '.env'));

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
  },
  // Serialize test files. The repository integration tests hit the live RICS
  // Access MDB files via PowerShell + OLE DB, which Windows treats as
  // single-writer: two Jest workers opening RIGROUP.MDB in parallel routinely
  // deadlock or stomp on each other's fixture data. Running one worker keeps
  // the suite deterministic; individual tests within a file still serialize.
  maxWorkers: 1,
};
