# DejaView

DejaView is a local-first support knowledge capture and federated search application.

## Requirements

- Node.js 22
- npm 11

## Getting started

```sh
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>.

## Quality checks

```sh
npm run test
npm run boundary:check
npm run typecheck
npm run format:check
npm run lint
npm run build
npm run test:e2e
```

## Dependency audit

`npm audit` currently reports four moderate, development-only findings beneath `drizzle-kit`: its legacy `@esbuild-kit/esm-loader` chain includes the esbuild development-server advisory [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The affected tooling is not shipped in the production application. `npm audit --omit=dev` reports zero vulnerabilities.

The automated remediation proposes `npm audit fix --force`, which would force a breaking downgrade from `drizzle-kit` 0.31 to 0.18. Do not apply that unsafe downgrade. Keep the development advisory under review and upgrade normally when the maintained dependency chain resolves it.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the approved Phase 1 baseline. Production database changes use the checksum migration runner; do not use `drizzle-kit push`.
