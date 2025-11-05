export default {
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.(c|m)?js$": "$1",
  },
  // Use setupFiles to ensure the environment is configured before any other code runs.
  setupFiles: ["<rootDir>/tests/setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js", "<rootDir>/tests/**/*.spec.js"],
  testTimeout: 30000,
  verbose: true,
  transformIgnorePatterns: ["node_modules/(?!(mongodb-memory-server|jose)/)"],
};
