---
trigger: always_on
---

# General Code Style & Formatting

- Use English for all code and documentation.
- Always use best practices and style guidelines
- Always declare the type of each variable and function (parameters and return value).
- Avoid using any.
- always match indentation
- Create necessary types.
- Use JSDoc to document public classes and methods.
- One export per file.
- Always use ES modules (import/export), never use CommonJS (require).

# Naming Conventions

- Use PascalCase for classes.
- Use camelCase for variables, functions, and methods.
- Use kebab-case for file and directory names.
- Use UPPERCASE for environment variables.
- Avoid magic numbers and define constants.

# Functions & Logic

- Keep functions short and single-purpose (<20 lines).
- Avoid deeply nested blocks by:
  - Using early returns.
  - Extracting logic into utility functions.
  - Use higher-order functions (map, filter, reduce) to simplify logic.
- Use arrow functions.
- Use default parameter values instead of null/undefined checks.

# Data Handling

- Avoid excessive use of primitive types; encapsulate data in composite types.
- Avoid placing validation inside functions—use classes with internal validation instead.
- Prefer immutability for data:
- Use as const for literals that never change.

# Tests

- Write thorough tests for all major functionality
- Each unit test should only test a single function. All other functions should be mocked.
- Each unit test should test all paths for the function it's testing (happy path, errors, etc.)
- All tests should be in the tests folder, in a structure that matches the file that it's testing.
- End-to-end tests can test multiple functions, but we should have very limeted end-to-end tests.
- All tests should always pass before a task is done. If they don't, make sure you notify me.

# General instructions

- Focus only on code areas relevant to the assigned task
- Prefer iterating on existing code rather than creating new solutions
- Keep solutions simple and avoid introducing unnecessary complexity
- If you run into the same persistent error, write logs and console messages to help track down the issue, and remember to check the logs after you make changes to see if the issue is resolved.
- Keep files under 300 lines of code; refactor when approaching this limit
- Maintain a clean, organized codebase
- Avoid code duplication by checking for similar existing functionality
- Consider different environments (dev, staging, prod) when writing code
- Unless explicitly instructed, instead of trying to gracefully handle an error or failure, make sure to fix the underlying issue.
- When being asked to refactor, make sure to look for duplicate code, duplicate files, and similar existing functionality. Also do not copy files and rename them so that we have two files, instead just edit the file that already exists.
- Make only requested changes or changes you're confident are well understood
- Consider what other code areas might be affected by your changes
- Don't drastically change existing patterns without explicit instruction
- Don't create new branches unless explicitly requested
- Never overwrite .env files without first asking and confirming
- Avoid writing one-time scripts in permanent files
- Don't mock data except for tests (never for dev or prod environments)
- Exhaust all options using existing implementations before introducing new patterns
- If introducing a new pattern to replace an old one, remove the old implementation
- Never name files "improved-something" or "refactored-something"
- Always clean up code after failed attempts.
- When trying comand line errors, try to solve the root cause of the error instead of trying new commands.
