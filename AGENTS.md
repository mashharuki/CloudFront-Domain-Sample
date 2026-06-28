# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace for a CloudFront custom-domain sample. The React/Vite application lives in `pkgs/frontend`; its entry points are `src/main.tsx` and `src/App.tsx`, with styles in `src/*.css` and static UI assets in `src/assets/`. AWS infrastructure code lives in `pkgs/cdk`, with the CDK app entry in `bin/cdk.ts`, stack definitions in `lib/`, and Jest tests in `test/`. General notes belong in `docs/`.

## Build, Test, and Development Commands

Install dependencies with `pnpm install`.

- `pnpm frontend dev`: start the Vite dev server for local UI work.
- `pnpm frontend build`: type-check and build the frontend.
- `pnpm frontend lint`: run oxlint on frontend code.
- `pnpm frontend preview`: serve the built frontend locally.
- `pnpm cdk build`: compile the CDK TypeScript project.
- `pnpm cdk test`: run CDK Jest tests.
- `pnpm cdk synth`: synthesize the CloudFormation template.
- `pnpm cdk diff`: compare local infrastructure changes with the target AWS environment.
- `pnpm biome:format`: format files with Biome.
- `pnpm biome:format:check`: check formatting without writing changes.
- `pnpm biome:check`: run Biome checks and apply safe fixes.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the local file patterns: React components use PascalCase file and function names, CDK constructs use PascalCase classes, and CSS files stay beside the components they style. Biome is configured for space indentation, organized imports, and double quotes; run formatting before submitting changes. Keep CDK resource IDs descriptive and stable because renaming them can replace cloud resources.

## Testing Guidelines

CDK tests use Jest with `ts-jest`; place infrastructure tests under `pkgs/cdk/test` and name them `*.test.ts`. Prefer assertion-based template tests for generated CloudFormation. The frontend currently has no test runner configured, so validate UI changes with `pnpm frontend build`, `pnpm frontend lint`, and manual checks in the Vite dev server.

## Commit & Pull Request Guidelines

The current history uses short, direct commit subjects such as `update` and `初期セットアップ`. Keep new subjects concise and imperative, for example `Add CloudFront distribution outputs`. Pull requests should include a brief summary, validation commands run, linked issues when applicable, screenshots for UI changes, and `cdk diff` output or notes for infrastructure changes.

## Security & Configuration Tips

Do not commit AWS credentials, account-specific secrets, or generated `cdk.out` output. Review `pnpm cdk diff` before deployment, and document any required hosted zone, certificate, or domain assumptions in the PR.
