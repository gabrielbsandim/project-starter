# Architecture & Conventions

## The dependency rule

```
domain  ←  application  ←  infrastructure  ←  apps/web
(pure)     (use cases)     (adapters/IO)       (delivery)
```

Each arrow means "depends on". Inner layers NEVER import outer layers. The domain knows nothing about Prisma, Next.js, Resend, or HTTP. This is enforced by package boundaries in the monorepo and by review in the single-app variant.

### Layer responsibilities

**`packages/domain`** — Pure business model. Zero runtime dependencies.
- Entities as classes with a private constructor + static `create()` (validates) + static `restore()` (rehydrates from persistence, no validation) + getters + intent-named mutators + `toJSON()`.
- Value objects (e.g. `Email`, `TaskStatus`, `Plan`) and typed enums/unions.
- A `DomainError` base class; specific errors carry a stable `code`.
- `shared/`: `guard.ts` (notEmpty, maxLength, etc.), `domain-error.ts`, `id.ts` (`EntityId` branded type + `asEntityId`).

**`packages/application`** — Use cases and the contracts to the outside world.
- Use cases as factories: `makeXxx(deps) => async (input) => output`. The returned function is verb-named (`createTask`, `registerNumber`).
- **Ports**: interfaces named by capability, not tech (`TaskRepository`, `EmailSender`, `Clock`, `IdGenerator`, `TokenVault`, `MetaCloudApiPort`). The implementation lives in infrastructure.
- **DTOs**: Zod schemas for input; `z.infer` for the types. Output "view" types are plain interfaces.
- **Mappers**: domain entity → DTO/view (`toTaskView`).
- **Errors**: use-case errors (`NotFoundError`, `ForbiddenError`, `QuotaExceededError`) with a `code`.
- **`testing/`**: in-memory fakes for every port (`InMemoryTaskRepository`, `FixedClock`, `SequentialIdGenerator`, `FakeUnitOfWork`). These let use-case tests run with zero IO.

**`packages/infrastructure`** — Concrete adapters implementing ports.
- Prisma repositories (`PrismaTaskRepository implements TaskRepository`), each scoped by tenant id.
- Record mappers (`toDomainTask` / `toTaskRecord`): never let a Prisma row leak past this layer.
- `PrismaUnitOfWork` for transactions (AsyncLocalStorage-based transparent transactions — see code-templates).
- `ResendEmailSender` (+ `ConsoleEmailSender` fallback), crypto (Argon2/bcrypt hasher, AES token vault), `UuidGenerator`, `SystemClock`, and chosen integrations (OAuth, billing, AI, storage, rate limiter).

**`apps/web`** — Delivery (Next.js App Router).
- `src/server/container.ts`: the composition root — the ONLY place that `new`s concrete adapters and wires use cases. Conditionally selects real vs fallback adapters based on env (e.g. Resend if `RESEND_KEY` set, else console).
- `src/server/api/`: `respond.ts` (ok/fail envelopes), `errors.ts` (domain/app error → HTTP), `authenticate.ts` (API key + session, scopes), `rate-limit.ts`.
- `src/app/api/v1/*`: thin route handlers. Pattern: authenticate/authorize → validate with Zod → call `getContainer().useCase(...)` → map result/errors to a response.
- `src/lib/api/`: React Query hooks (`use-tasks.ts`) + a `client.ts` fetch wrapper.
- `src/env.ts`: Zod-parsed env, fail-fast on startup, separate server/client schemas (secrets never reach the browser).

**`packages/ui`** — Design system (React + Tailwind 4). Peer-deps React. Exported as TS source.
**`packages/i18n`** — Typed message catalogs (`en`, `pt-BR`, ...) + Accept-Language detection + `getMessages(locale)`.
**`packages/config`** — Shared `tsconfig/*`, `eslint/*`, `vitest/*` presets.

## Monorepo import rules

- **Shared packages ship TypeScript source** (no build step for `domain`/`application`/`infrastructure`/`ui`/`i18n`). Next.js transpiles them via `transpilePackages`. Consequence: **shared source must NOT use the `@/` alias** (it breaks consumers) — use relative imports (`../ports/...`) inside shared packages.
- `@/` alias is for `apps/web` source and test files only.
- Cross-package imports use the scope: `@<slug>/application`, `@<slug>/domain`.
- Workspace linking via `"@<slug>/x": "workspace:*"`.
- Import order: node builtins → external packages → `@<slug>/*` packages → relative.
- `verbatimModuleSyntax` is on, so use `import type { ... }` for type-only imports.

(Life Deck builds shared packages with tsup to `dist` and imports built output across packages; WPP Wizard ships raw source via `transpilePackages`. Default to **shipping source via `transpilePackages`** — fewer moving parts, direct source maps, no cache invalidation. Use tsup only if a package must be published to npm, like an SDK.)

## Naming conventions

| Context | Convention | Example |
|---|---|---|
| Files (code) | `kebab-case.ts` | `create-task.ts`, `prisma-task-repository.ts` |
| Files (React components) | `kebab-case.tsx`, export PascalCase | `task-card.tsx` → `TaskCard` |
| Classes & types | PascalCase | `Task`, `Email`, `TaskRepository` |
| Functions & vars | camelCase | `createTask`, `handleError` |
| Use-case factories | `makeXxx` → verb fn | `makeCreateTask` → `createTask` |
| Booleans | predicates | `isRegistered`, `hasOpenWindow`, `canSendMarketing` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_TIME_ZONE`, `MAX_TITLE_LENGTH` |
| Prisma models | PascalCase singular | `Task`, `User` |
| Prisma tables | `snake_case` plural via `@@map` | `@@map("tasks")` |
| Prisma fields | `camelCase` → `@map("snake_case")` | `listId String @map("list_id")` |
| Test files | colocated `*.test.ts(x)` | `create-task.test.ts` |

Obra Nova (single-app) additionally uses interface prefix `I` (`IWork`) and type prefix `T` (`TWorkStatus`). In the **monorepo standard, prefer unprefixed names** (`Task`, `WorkStatus`) — match whichever variant the project uses, consistently.

## Exports

- Named exports only. No default exports for entities, use cases, utilities.
- Default export only where a framework requires it (Next.js `page.tsx`, `layout.tsx`, route handlers export named `GET`/`POST`).
- Barrel `index.ts` files only for a package's public surface (`packages/application/src/index.ts`). Barrels are excluded from coverage.

## No comments

Code is self-documenting through names, types, and tests. Do not write "what" comments. A comment is only acceptable for a genuinely non-obvious "why" (e.g. "We ack the webhook immediately and process async to avoid Meta's 20s timeout."). If a comment explains what the code does, rename the thing instead.

## Multi-tenancy

Every tenant-scoped model carries `organizationId` (or `companyId`). The repository layer ALWAYS filters by it — never a bare `findMany`. Use-case access checks (`list.isOwnedBy(owner)`) belong in the domain/application layers. Cascade delete on tenant removal.

## Error handling

1. `domain` defines `DomainError` (abstract, `code`) and subclasses like `ValidationError`.
2. `application` defines use-case errors (`NotFoundError`, `ForbiddenError`, `QuotaExceededError`) with stable `code`s.
3. `apps/web` maps them to HTTP in one place (`server/api/errors.ts`): `ZodError`→422, `ValidationError`→422, `NotFoundError`→404, `ForbiddenError`→403, `ConflictError`→409, `RateLimitedError`/`QuotaExceededError`→429, auth→401, unknown→500 (captured to Sentry/logger). Response shape: `{ error: { code, message, details? } }`; success: `{ data, meta? }`.

For the single-app variant with Prisma errors surfaced directly, also map `PrismaClientKnownRequestError` codes: `P2002`→409, `P2003`→400, `P2025`→404.

## API conventions

- Versioned: `app/api/v1/...`.
- Thin handlers: auth → Zod validate → use case → respond. No business logic in routes.
- Support `Idempotency-Key` for create/send endpoints that have side effects (replays return the first result).
- Cursor pagination: `{ data: items, meta: { pagination: { nextCursor } } }`.
- Cron endpoints guard on `Authorization: Bearer ${CRON_SECRET}` and set `export const maxDuration`.

## Single-app variant (Obra Nova style)

For clearly small / MVP scopes, skip the monorepo. One Next.js app:

```
src/
├── app/            # App Router: pages + api routes
├── domain/         # entities (interfaces/types or light classes)
├── application/    # usecases/ + dtos/
├── infra/          # database/ (prisma client), email/, providers (adapter + factory)
├── features/       # UI per domain: Screen.tsx + screen.rules.ts (hooks) + screen.types.ts
├── components/     # shared UI primitives
├── lib/            # cross-cutting: auth, permissions, validations, utils, api/ helpers
└── tests/          # vitest setup + mirrored test tree
prisma/schema.prisma
```

Differences from the monorepo: npm instead of pnpm/turbo; a single `tsconfig` with `@/* → ./src/*`; providers use a `factory.ts` that returns a real-or-mock implementation based on env; coverage thresholds set per-path in `vitest.config.ts` (90% general, 95% on critical infra). Everything else (no comments, `@/` imports, named exports, Zod/Yup validation, Prisma+Neon, Resend, thin handlers, multi-tenancy) is identical. The frontend "Screen split" (`*.tsx` view / `*.rules.ts` hooks / `*.types.ts` contracts) is the Obra Nova UI convention.
