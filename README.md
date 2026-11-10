# gato-tools

The Gato tools service gives agents retail tools through MCP. [`SPECS.md`](SPECS.md) gives the required behavior. [`AGENTS.md`](AGENTS.md) gives the contributor rules.

The repository has no source code or tests yet.

## Setup

1. Install Bun `1.4.4-canary.1`. `package.json` sets this version in `packageManager`.
2. Install the dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

## Checks

Run `bun check` before you report work done and before each commit. It runs these steps in order, and stops at the first failure:

1. `bun fmt --check` checks the format.
2. `bun lint` checks the lint rules in `bunfig.toml` and the types. Warnings also fail the check.
3. `bun test` runs the tests.

The lint and test steps pass when there are no files to check. Real format errors, lint errors, type errors, and failing tests still fail the check.

Run `bun fmt` to format the files. The Zed settings in `.zed/settings.json` format with `bun fmt`.

## Tests

- Unit tests are next to the code as `*.test.ts`.
- End-to-end tests are in the top-level `e2e/` folder. They start the application as it runs in production, with isolated configuration and storage, and use only its external interfaces.
- Fakes that the test controls replace the external services. Each fake records the calls it receives.
