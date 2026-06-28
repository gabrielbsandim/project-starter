# project-starter

A Claude Code skill (`/new-project`) that scaffolds a new full-stack project following a single, opinionated standard — clean architecture, strict TypeScript, 95% test coverage, English-only code and docs, i18n and PWA from day one.

The standard is distilled from three production projects: **Obra Nova**, **Life Deck**, and **WPP Wizard**.

## What it generates

By default, a **pnpm + Turborepo monorepo** with clean architecture:

```
<project>/
├── apps/web/              Next.js 16 (App Router): routes, UI, DI container, PWA
└── packages/
    ├── domain/            Entities, value objects, errors (zero dependencies)
    ├── application/       Use cases (makeXxx), ports, Zod DTOs, in-memory fakes
    ├── infrastructure/    Prisma repositories, Resend email, adapters
    ├── i18n/              Typed message catalogs (≥2 locales) + detection
    ├── ui/                Design system (React + Tailwind)
    └── config/            Shared tsconfig / eslint / vitest presets
```

Dependency rule: `domain ← application ← infrastructure ← apps/web`.

### Stack

- Next.js 16 + React 19, TypeScript strict
- Prisma 7 + Neon (`@prisma/adapter-neon`)
- Zod validation, Resend email, Tailwind 4
- Vitest + `@vitest/coverage-v8` (95% gate), Testing Library, Playwright
- ESLint 9 (flat config) + Prettier

### Always on

- **English** for all code, identifiers, file names, docs and commits
- **i18n** — multi-locale message catalogs (default `en` + `pt-BR`); no hardcoded user-facing strings
- **PWA** — `@serwist/next` service worker + web manifest

A lighter single-Next.js-app variant (Obra Nova style) is documented for small / MVP scopes.

## Layout

- `SKILL.md` — the skill entry point: workflow, non-negotiables, defaults
- `references/architecture-and-conventions.md` — layers, naming, imports, error handling, single-app variant
- `references/stack-and-configs.md` — dependencies and every config file
- `references/code-templates.md` — copy-pasteable patterns for every layer (incl. i18n + PWA)
- `references/testing.md` — testing philosophy, examples per layer, CI workflow

## Install

Clone (or symlink) this repository into your Claude Code skills directory so it is discovered as `/new-project`:

```sh
git clone git@github.com:gabrielbsandim/project-starter.git ~/.claude/skills/new-project
```

Then, in Claude Code, run `/new-project` and describe your idea.
