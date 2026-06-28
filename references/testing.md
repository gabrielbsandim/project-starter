# Testing

## Philosophy

- **Colocation**: `create-task.ts` and `create-task.test.ts` in the same directory.
- **95% gate** on lines, functions, branches, statements (the `packages/config/vitest/base.ts` factory enforces it). CI fails below threshold.
- **Tests are documentation.** Combined with strict types and Zod, they replace code comments.
- Layer-specific strategy:
  - **domain**: pure tests, no mocks. Exercise every branch of `create`/mutators/guards.
  - **application**: use cases tested with **in-memory fakes** (`InMemoryTaskRepository`, `FixedClock`, `SequentialIdGenerator`, `FakeUnitOfWork`). No DB, no HTTP, no real crypto.
  - **infrastructure**: integration tests against a real Postgres, behind `test:integration` (run only in CI's integration job, not in the coverage gate).
  - **apps/web**: React Query hooks + components via Testing Library (`jsdom`); route logic via the use cases it calls; full flows via Playwright e2e.

## Coverage exclusions (already in the factory)

`*.test.ts(x)`, `index.ts` barrels, `*.types.ts`, `*.d.ts`. Additionally exclude in `apps/web`: `container.ts` (wiring, covered via routes), `*.openapi.ts`, static i18n providers, and raw IO adapters that are covered by integration tests.

## Domain test

```ts
import { describe, expect, it } from 'vitest'
import { Task } from '@/entities/task'
import { asEntityId } from '@/shared/id'
import { ValidationError } from '@/shared/domain-error'

const ID = asEntityId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
const LIST = asEntityId('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
const NOW = new Date('2026-06-21T10:00:00.000Z')

describe('Task', () => {
  it('creates a pending task with a trimmed title', () => {
    const task = Task.create({ id: ID, listId: LIST, title: '  Buy rings  ', createdAt: NOW })
    expect(task.status).toBe('pending')
    expect(task.toJSON().title).toBe('Buy rings')
  })

  it('rejects an empty title', () => {
    expect(() => Task.create({ id: ID, listId: LIST, title: '   ', createdAt: NOW })).toThrow(ValidationError)
  })

  it('completes only once', () => {
    const task = Task.create({ id: ID, listId: LIST, title: 'x', createdAt: NOW })
    task.complete(NOW)
    const first = task.toJSON().completedAt
    task.complete(new Date('2026-06-22T00:00:00.000Z'))
    expect(task.toJSON().completedAt).toBe(first)
  })
})
```

## Application (use case) test

```ts
import { describe, expect, it } from 'vitest'
import { makeCreateTask } from '@/use-cases/create-task'
import { ForbiddenError } from '@/errors/use-case-error'
import { InMemoryTaskRepository } from '@/testing/in-memory-task-repository'
import { InMemoryListRepository } from '@/testing/in-memory-list-repository'
import { FixedClock, SequentialIdGenerator, ID } from '@/testing/fakes'
import { asEntityId, List } from '@<slug>/domain'

const NOW = new Date('2026-06-21T10:00:00.000Z')
const LIST = asEntityId('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
const NEW_TASK = asEntityId('cccccccc-cccc-4ccc-8ccc-cccccccccccc')

async function setup() {
  const lists = new InMemoryListRepository()
  const tasks = new InMemoryTaskRepository()
  await lists.save(List.create({ id: LIST, ownerId: ID.user, title: 'Inbox', createdAt: NOW }))
  return {
    tasks,
    createTask: makeCreateTask({
      lists, tasks,
      ids: new SequentialIdGenerator([NEW_TASK]),
      clock: new FixedClock(NOW),
    }),
  }
}

describe('createTask', () => {
  it('creates a task in a list the requester owns', async () => {
    const ctx = await setup()
    const view = await ctx.createTask(ID.user as string, { listId: LIST as string, title: 'Buy rings' })
    expect(view).toMatchObject({ id: NEW_TASK, title: 'Buy rings', status: 'pending' })
    expect(await ctx.tasks.findById(NEW_TASK)).not.toBeNull()
  })

  it('rejects creating a task in a list the requester does not own', async () => {
    const ctx = await setup()
    await expect(
      ctx.createTask('00000000-0000-4000-8000-000000000000', { listId: LIST as string, title: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})
```

## Infrastructure (integration) test

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaTaskRepository } from '@/database/prisma-task-repository'
import { Task, asEntityId } from '@<slug>/domain'

const prisma = new PrismaClient()
const tasks = new PrismaTaskRepository(prisma)
const LIST = asEntityId('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
const TASK = asEntityId('cccccccc-cccc-4ccc-8ccc-cccccccccccc')

beforeAll(async () => { /* seed user + list */ })
afterAll(async () => { await prisma.task.deleteMany({ where: { id: TASK } }); await prisma.$disconnect() })

describe('PrismaTaskRepository (integration)', () => {
  it('round-trips a task through save and findById', async () => {
    await tasks.save(Task.create({ id: TASK, listId: LIST, title: 'Round trip', createdAt: new Date() }))
    const found = await tasks.findById(TASK)
    expect(found?.toJSON().title).toBe('Round trip')
  })
})
```

## React Query hook test

```ts
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCreateTask } from '@/lib/api/use-tasks'
import { createWrapper } from '@/lib/api/test-utils'

describe('useCreateTask', () => {
  it('posts the task and returns the created view', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ data: { id: 't1', title: 'Buy rings', status: 'pending' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCreateTask(), { wrapper: Wrapper })
    result.current.mutate({ listId: 'l1', title: 'Buy rings' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ id: 't1' })
  })
})
```

## e2e (Playwright)

`apps/web/e2e/*.spec.ts`. Drive real flows through the UI with `getByTestId`. Run in CI against a built app + Postgres service.

## `apps/web/vitest.setup.ts`

```ts
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
```

## CI — `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm format:check
      - run: pnpm test:coverage
      - run: pnpm build
      - run: pnpm audit --prod --audit-level high
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app_test }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://app:app@localhost:5432/app_test
      DATABASE_URL_UNPOOLED: postgresql://app:app@localhost:5432/app_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @<slug>/infrastructure run db:push
      - run: pnpm --filter @<slug>/infrastructure run test:integration
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app_e2e }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://app:app@localhost:5432/app_e2e
      DATABASE_URL_UNPOOLED: postgresql://app:app@localhost:5432/app_e2e
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @<slug>/infrastructure run db:push
      - run: pnpm build
      - run: pnpm --filter @<slug>/web exec playwright install --with-deps chromium
      - run: pnpm --filter @<slug>/web run test:e2e
```
