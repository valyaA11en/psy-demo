/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: [
    "**/*.ts",
    "!main.ts",
    "!**/*.module.ts",
    "!**/interfaces/**",
  ],
  coverageDirectory: "../coverage",
  coverageReporters: ["text", "lcov", "html"],
  testEnvironment: "node",
};
