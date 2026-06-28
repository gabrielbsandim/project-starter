# Stack & Configs

Replace `<slug>` with the project's package scope (e.g. `lifedeck`). Install the **latest stable** of each at scaffold time; the versions below are the known-good baseline from the reference projects.

## Dependencies

### Root (dev, repo-wide tooling)
```
turbo@^2  prettier@^3  prettier-plugin-tailwindcss  simple-git-hooks  lint-staged
@commitlint/cli  @commitlint/config-conventional  typescript@^5.7  eslint@^9
```

### `packages/config` (presets, consumed by every package)
```
typescript-eslint  @eslint/js  globals  vitest@^4  @vitest/coverage-v8@^4
```

### `packages/domain`
Runtime: none. Dev: `@<slug>/config (workspace:*)`, `vitest`, `@vitest/coverage-v8`, `typescript`.

### `packages/application`
Runtime: `@<slug>/domain (workspace:*)`, `zod@^3.25`. Dev: config + vitest + typescript.

### `packages/infrastructure`
Runtime: `@<slug>/application`, `@<slug>/domain`, `@prisma/client@^7`, `@prisma/adapter-neon@^7`, `@neondatabase/serverless`, `resend`. Plus per integration: `@node-rs/argon2` or `bcryptjs` (password hash), `jose` (JWT), `arctic` + `google-auth-library` (Google OAuth), `@upstash/ratelimit` + `@upstash/redis` (rate limit), `@vercel/blob` (storage), `ai` + provider (AI), `stripe` (billing). Dev: `prisma@^7`, `tsx`, config, vitest.

### `apps/web`
Runtime: all `@<slug>/*` workspace packages (including `@<slug>/i18n`), `next@^16`, `react@^19`, `react-dom@^19`, `zod`, `@tanstack/react-query@^5`, and **always** `@serwist/next` + `serwist` (PWA). Optional: `@sentry/nextjs`, `@asteasolutions/zod-to-openapi` + `@scalar/api-reference` (OpenAPI docs), `sonner` (toasts), `@dnd-kit/*`, `recharts`, `framer-motion`.
Dev: `@playwright/test`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `vitest`, `@vitest/coverage-v8`, `tailwindcss@^4`, `@tailwindcss/postcss`, `eslint-config-next`, `vite-tsconfig-paths`, config.

## `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## Root `package.json`
```json
{
  "name": "<slug>",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "check": "pnpm run lint && pnpm run typecheck && pnpm run format:check && pnpm run test:coverage",
    "prepare": "simple-git-hooks"
  },
  "simple-git-hooks": {
    "pre-commit": "pnpm exec lint-staged",
    "commit-msg": "pnpm exec commitlint --edit \"$1\"",
    "pre-push": "pnpm run typecheck && pnpm run test:coverage"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  },
  "commitlint": { "extends": ["@commitlint/config-conventional"] }
}
```

## `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": [".env", "tsconfig.base.json"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "test:coverage": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

## `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`packages/config/tsconfig/base.json` extends this. `react-library.json` adds `"lib": ["ES2022","DOM","DOM.Iterable"]`, `"jsx": "react-jsx"`. `nextjs.json` adds Next plugin + `"jsx": "preserve"`, `"noEmit": true`, and the `@/*` path. Each package's `tsconfig.json` extends the matching preset; `apps/web` adds `"paths": { "@/*": ["./src/*"] }`.

## ESLint flat config — `packages/config/eslint/index.js`
```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
```
A `react.js` preset adds React/jsx-a11y rules + browser globals. Root `eslint.config.mjs`:
```js
import { baseConfig } from '@<slug>/config/eslint'
export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'] },
  ...baseConfig,
]
```

## Prettier — `.prettierrc.json`
```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```
(Life Deck uses `printWidth: 80` + `arrowParens: "avoid"`. Either is fine — be consistent. Default to 100.)

## Vitest 95% factory — `packages/config/vitest/base.ts`
```ts
import type { ViteUserConfig } from 'vitest/config'

export interface CoverageThreshold { lines: number; functions: number; branches: number; statements: number }
export const DEFAULT_THRESHOLD: CoverageThreshold = { lines: 95, functions: 95, branches: 95, statements: 95 }

export interface CreateVitestConfigOptions {
  environment?: 'node' | 'jsdom'
  setupFiles?: string[]
  coverageInclude?: string[]
  coverageExclude?: string[]
  threshold?: Partial<CoverageThreshold>
}

export function createVitestConfig(options: CreateVitestConfigOptions = {}): ViteUserConfig {
  const {
    environment = 'node',
    setupFiles = [],
    coverageInclude = ['src/**/*.{ts,tsx}'],
    coverageExclude = ['src/**/*.test.{ts,tsx}', 'src/**/index.ts', 'src/**/*.types.ts', 'src/**/*.d.ts'],
    threshold = {},
  } = options
  return {
    test: {
      globals: true,
      environment,
      setupFiles,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: coverageInclude,
        exclude: coverageExclude,
        thresholds: { ...DEFAULT_THRESHOLD, ...threshold },
      },
    },
  }
}
```
Per-package `vitest.config.ts`:
```ts
import { createVitestConfig } from '@<slug>/config/vitest/base'
export default createVitestConfig()                       // node packages
// apps/web: createVitestConfig({ environment: 'jsdom', setupFiles: ['./vitest.setup.ts'],
//   coverageInclude: ['src/lib/**', 'src/server/**'],
//   coverageExclude: [...defaults, 'src/server/container.ts', 'src/**/openapi.ts'] })
```
Integration tests (real Postgres) live behind a separate `test:integration` script and config, run only in CI's integration job.

## `apps/web/next.config.mjs`
```js
const nextConfig = {
  transpilePackages: [
    '@<slug>/ui', '@<slug>/i18n', '@<slug>/domain', '@<slug>/application', '@<slug>/infrastructure',
  ],
  typedRoutes: true,
  serverExternalPackages: ['@prisma/client', 'prisma'],
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }]
  },
}
export default nextConfig
```
Add a CSP header for production. If native modules are used (`@node-rs/argon2`), add them to `serverExternalPackages`. PWA via `@serwist/next` wraps the export.

## `apps/web/postcss.config.mjs`
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

## Prisma setup — `packages/infrastructure`
`prisma/schema.prisma` header:
```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```
Scripts in `packages/infrastructure/package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate --schema prisma/schema.prisma",
    "db:generate": "prisma generate --schema prisma/schema.prisma",
    "db:migrate": "prisma migrate dev --schema prisma/schema.prisma",
    "db:deploy": "prisma migrate deploy --schema prisma/schema.prisma",
    "db:push": "prisma db push --schema prisma/schema.prisma",
    "db:seed": "tsx prisma/seed.ts",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```
`DATABASE_URL` = pooled (runtime), `DATABASE_URL_UNPOOLED` = direct (migrations). The Prisma client uses `@prisma/adapter-neon` (see code-templates → prisma client).

## `.env.example`
List every variable the chosen integrations need, e.g.:
```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
SESSION_SECRET=
ENCRYPTION_KEY=
APP_URL=http://localhost:3000
CRON_SECRET=
RESEND_KEY=
EMAIL_FROM=noreply@<domain>
# Optional
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
AI_GATEWAY_API_KEY=
SENTRY_DSN=
```

## Single-app variant configs
Use npm; one `tsconfig.json` (`target ES2017`, `moduleResolution bundler`, `paths: { "@/*": ["./src/*"] }`); `eslint.config.mjs` extending `eslint-config-next`; one `vitest.config.ts` with per-path thresholds:
```ts
coverage: {
  provider: 'v8',
  thresholds: {
    'src/lib/**/*.ts': { lines: 90, functions: 90, branches: 90 },
    'src/application/usecases/**/*.ts': { lines: 90, functions: 90, branches: 90 },
    'src/infra/**/*.ts': { lines: 95, functions: 95, branches: 95 },
  },
}
```
Build script: `"build": "prisma generate && prisma migrate deploy && next build"`.
