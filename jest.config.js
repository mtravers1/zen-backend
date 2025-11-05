export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: [
    'js',
    'json',
    'jsx',
    'ts',
    'tsx',
    'node'
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  testTimeout: 30000,
  verbose: true,
  setupFiles: ['<rootDir>/tests/jest.setup.js']
};