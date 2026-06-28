---
name: new-project
description: Scaffold a new full-stack project from an idea, following Gabriel's standard architecture and code patterns (the ones used in Obra Nova, Life Deck and WPP Wizard). Use whenever the user describes a new app/SaaS/product idea and wants it set up, bootstrapped, scaffolded, or "started the way we always do". Default is a pnpm + Turborepo clean-architecture monorepo (Next.js 16, React 19, TypeScript strict, Prisma + Neon, Zod, Resend, Vitest with 95% coverage). Everything in English, i18n (multi-locale) and PWA always included. Covers folder structure, layers, DI container, ports + fakes, API conventions, testing, configs and tooling.
---

# New Project

Bootstrap a new project the way Gabriel builds them. This skill encodes the architecture and conventions distilled from his three most recent projects: **Life Deck** and **WPP Wizard** (the refined standard) and **Obra Nova** (the pragmatic single-app variant).

**Non-negotiables** (apply to every project, every layer):
- **Everything in English.** All code, identifiers, file names, docs, READMEs, commit messages, and any user-facing default strings are written in English. Localized copy lives in the i18n catalogs, never hardcoded.
- **i18n is always included.** Every project ships the `i18n` package with typed message catalogs and locale detection from day one (default locales `en` + `pt-BR`; never fewer than two). No user-facing string is hardcoded — it goes through `getMessages(locale)`.
- **PWA is always included.** Every web app is a PWA: service worker (`@serwist/next`), web manifest, installability, and offline shell.
- Clean architecture with a strict dependency rule: `domain ← application ← infrastructure ← apps/web`. Inner layers never import outer layers.
- TypeScript strict everywhere. No `any` without a justified reason.
- **No comments in code.** Names, types, and tests document intent. Reserve a rare comment only for non-obvious "why", never "what".
- All imports use path aliases: `@/` inside a package/app, `@scope/<pkg>` across packages. Never `../../..`.
- Named exports only (default export only for Next.js pages/route segments).
- Validation at every boundary with **Zod**. Types are inferred from schemas.
- Multi-tenancy by column (`organizationId`/`companyId`) enforced in the repository layer.
- Tests colocated with source. **95% coverage gate** (lines, functions, branches, statements). Use cases tested with in-memory fakes, not mocks of the DB.
- Resend for email (with a console fallback for local dev).
- Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless` for the database (Neon Postgres).

## Workflow

When invoked, do NOT scaffold blindly. Follow these steps.

### 1. Understand the idea
Read what the user described. If essential facts are missing, ask a SHORT batch of questions (use AskUserQuestion). Only ask what changes the scaffold:
- **Project name / slug** (used for package scope `@<slug>/*` and the repo folder).
- **One-line description** of what it does and who uses it.
- **Core domain entities** (best guess from the idea is fine; confirm 3-6 main ones).
- **Locales**: confirm the locale set (always ≥2; default `en` + `pt-BR`). i18n and PWA are always on — do not ask whether to include them, only their specifics (locale list, app name/manifest details).
- **Integrations needed** beyond the defaults: auth (email+password / Google OAuth / both), billing (Stripe / Asaas / none), AI (Vercel AI Gateway / none), WhatsApp, Google Calendar, file storage (Vercel Blob), rate limiting (Upstash).
- **Architecture shape** if the idea looks small: default is the monorepo clean arch; offer the single Next.js app variant only for clearly small/MVP scopes (see `references/architecture-and-conventions.md` → "Single-app variant").

Do not re-ask anything the user already stated.

### 2. Present a short plan and confirm
Before writing files, show a concise plan (not an essay):
- Final stack + notable integrations chosen.
- Package/folder layout that will be created.
- The main domain entities and the first 1-3 use cases / API endpoints to scaffold as a vertical slice.

Get a quick confirmation (or use ExitPlanMode if in plan mode). Adjust if the user pushes back.

### 3. Scaffold
Read the reference files as needed (they hold the exact, copy-pasteable patterns) and build:

1. **Repo skeleton**: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `tsconfig.base.json`, root `eslint.config.mjs`, `prettier` config, `.gitignore`, `.env.example`, `README.md`. → `references/stack-and-configs.md`
2. **`packages/config`**: shared `tsconfig/*`, `eslint/*`, `vitest/*` presets (the 95% Vitest factory lives here). → `references/stack-and-configs.md`
3. **`packages/domain`**: `shared/` (guard, domain-error, id), then the entities + value objects for the confirmed domain. → `references/code-templates.md`
4. **`packages/application`**: `ports/`, `errors/`, `dtos/` (Zod), `mappers/`, `use-cases/` (factory `makeXxx`), and `testing/` fakes (in-memory repos, FixedClock, SequentialIdGenerator). → `references/code-templates.md`
5. **`packages/infrastructure`**: `prisma/schema.prisma`, Prisma repositories + record mappers, `prisma-unit-of-work.ts`, Resend email sender (+ console fallback), id/clock/crypto adapters, and any chosen integration adapters. → `references/code-templates.md`
6. **`apps/web`**: Next.js App Router, `src/server/container.ts` (composition root), `src/server/api/` (respond, errors, authenticate, rate-limit), versioned routes under `app/api/v1/`, React Query hooks in `src/lib/api/`, env parsing in `src/env.ts`. → `references/code-templates.md`
7. **`packages/i18n`** (always) — typed catalogs for every locale (≥2) + Accept-Language detection + `getMessages(locale)`; wire the app's locale provider. **`packages/ui`** if the project needs a shared design system. **PWA** (always) — `@serwist/next` service worker, `manifest.webmanifest`, icons, offline fallback.
8. **Tooling**: `simple-git-hooks` (pre-push: `pnpm check`), `lint-staged`, `commitlint`, and `.github/workflows/ci.yml` (lint, typecheck, format, coverage, build, audit; integration + e2e jobs with a Postgres service). → `references/testing.md`

Build at least ONE complete vertical slice (entity → use case → port → Prisma repo → API route → React Query hook → tests at every layer) so the project is provably working and sets the pattern for everything else.

### 4. Verify
- `pnpm install`
- `pnpm check` (lint + typecheck + format:check + test:coverage) must pass, with coverage ≥ 95% on the scaffolded code.
- Report exactly what was created and what the next steps are (e.g. provision Neon DB, set `.env`, run `pnpm db:migrate`).

## Reference files

Read these on demand — they contain the exact patterns and code. Do not duplicate their content from memory; open them.

- **`references/architecture-and-conventions.md`** — the dependency rule, each layer's responsibility, naming, imports, exports, no-comments rule, multi-tenancy, error hierarchy, and the single-app (Obra Nova style) variant.
- **`references/stack-and-configs.md`** — exact dependency list with known-good versions, plus every config file (`tsconfig.base.json`, `turbo.json`, `pnpm-workspace.yaml`, ESLint flat config, Prettier, `next.config`, the Vitest 95% factory, Prisma setup, scripts, git hooks).
- **`references/code-templates.md`** — copy-pasteable templates: domain entity (factory + restore + mutators + toJSON), value objects, guard, use-case factory, port interfaces, Prisma repository + record mapper, unit of work, DTO + mapper, API route handler, `respond.ts`/`errors.ts`/`authenticate.ts`, composition-root container, Zod env parsing, Resend email sender.
- **`references/testing.md`** — testing philosophy, the colocated layout, fakes vs integration vs e2e, the 95% gate, coverage exclusions, example tests per layer, and the CI workflow.

## Defaults at a glance

- **Package manager**: pnpm (Node ≥ 24). Monorepo via Turborepo.
- **Framework**: Next.js 16 (App Router) + React 19.
- **Language**: TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`).
- **DB**: Prisma 7 + Neon adapter. Models PascalCase singular, tables `snake_case` plural via `@@map`, fields `camelCase` via `@map`.
- **Validation**: Zod 3.25+. **Email**: Resend. **Styling**: Tailwind 4.
- **Tests**: Vitest 4 + `@vitest/coverage-v8` (95%) + Testing Library + Playwright (e2e).
- **Lint/format**: ESLint 9 flat config + Prettier (`singleQuote`, no semicolons, `trailingComma: all`, `printWidth: 100`).
- **Always on**: English-only source/docs; **i18n** (`packages/i18n`, ≥2 locales, default `en`+`pt-BR`); **PWA** (`@serwist/next` + web manifest).
- **Optional integrations** wired conditionally in the container: Google OAuth (`arctic`/`google-auth-library`), billing (Stripe/Asaas), AI (Vercel AI Gateway), WhatsApp (Meta Cloud API), Upstash rate limiting, Vercel Blob storage, Sentry.

Always install the latest stable versions at scaffold time (verify via Context7/npm); the versions in the reference files are the known-good baseline, not a ceiling.
