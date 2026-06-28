# Code Templates

Copy-pasteable patterns. Replace `<slug>`, `Task`, etc. with real names. No comments in real code — the prose here is guidance only.

## Domain: shared

`packages/domain/src/shared/id.ts`
```ts
export type EntityId = string & { readonly __brand: 'EntityId' }
export function asEntityId(value: string): EntityId {
  return value as EntityId
}
```

`packages/domain/src/shared/domain-error.ts`
```ts
export abstract class DomainError extends Error {
  abstract readonly code: string
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR'
}
```

`packages/domain/src/shared/guard.ts`
```ts
import { ValidationError } from './domain-error'

export const guard = {
  notEmpty(value: string, field: string): string {
    const trimmed = value.trim()
    if (trimmed.length === 0) throw new ValidationError(`${field} must not be empty.`)
    return trimmed
  },
  maxLength(value: string, max: number, field: string): string {
    if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`)
    return value
  },
}
```

## Domain: entity

`packages/domain/src/entities/task.ts`
```ts
import { guard } from '../shared/guard'
import type { EntityId } from '../shared/id'

export type TaskStatus = 'pending' | 'completed'

export interface TaskProps {
  id: EntityId
  listId: EntityId
  title: string
  status: TaskStatus
  position: number
  createdAt: Date
  completedAt: Date | null
}

export class Task {
  private constructor(private props: TaskProps) {}

  static create(input: { id: EntityId; listId: EntityId; title: string; createdAt: Date }): Task {
    const title = guard.maxLength(guard.notEmpty(input.title, 'Task title'), 280, 'Task title')
    return new Task({
      id: input.id,
      listId: input.listId,
      title,
      status: 'pending',
      position: 0,
      createdAt: input.createdAt,
      completedAt: null,
    })
  }

  static restore(props: TaskProps): Task {
    return new Task({ ...props })
  }

  get id(): EntityId { return this.props.id }
  get listId(): EntityId { return this.props.listId }
  get status(): TaskStatus { return this.props.status }

  complete(completedAt: Date): void {
    if (this.props.status === 'completed') return
    this.props.status = 'completed'
    this.props.completedAt = completedAt
  }

  rename(title: string): void {
    this.props.title = guard.maxLength(guard.notEmpty(title, 'Task title'), 280, 'Task title')
  }

  toJSON(): TaskProps { return { ...this.props } }
}
```

## Application: port

`packages/application/src/ports/repositories.ts`
```ts
import type { EntityId } from '@<slug>/domain'
import type { Task } from '@<slug>/domain'

export interface TaskRepository {
  save(task: Task): Promise<void>
  findById(id: EntityId): Promise<Task | null>
  listByList(listId: EntityId): Promise<Task[]>
  delete(id: EntityId): Promise<void>
}
```

`packages/application/src/ports/clock.ts` / `id-generator.ts` / `unit-of-work.ts`
```ts
export interface Clock { now(): Date }
export interface IdGenerator { generate(): import('@<slug>/domain').EntityId }
export interface UnitOfWork { run<T>(work: () => Promise<T>): Promise<T> }
```

## Application: errors

`packages/application/src/errors/use-case-error.ts`
```ts
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  constructor(resource: string) {
    super(`${resource} was not found.`)
    this.name = 'NotFoundError'
  }
}
export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN'
  constructor(resource: string) {
    super(`You are not allowed to access this ${resource}.`)
    this.name = 'ForbiddenError'
  }
}
```

## Application: DTO + view + mapper

`packages/application/src/dtos/task-dto.ts`
```ts
import { z } from 'zod'

export const createTaskSchema = z.object({
  listId: z.string().uuid(),
  title: z.string().trim().min(1).max(280),
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export interface TaskView {
  id: string
  listId: string
  title: string
  status: 'pending' | 'completed'
  createdAt: string
  completedAt: string | null
}
```

`packages/application/src/mappers/task-mapper.ts`
```ts
import type { Task } from '@<slug>/domain'
import type { TaskView } from '../dtos/task-dto'

export function toTaskView(task: Task): TaskView {
  const p = task.toJSON()
  return {
    id: p.id,
    listId: p.listId,
    title: p.title,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  }
}
```

## Application: use case

`packages/application/src/use-cases/create-task.ts`
```ts
import { Task } from '@<slug>/domain'
import { asEntityId } from '@<slug>/domain'
import { ForbiddenError } from '../errors/use-case-error'
import { toTaskView } from '../mappers/task-mapper'
import type { CreateTaskInput, TaskView } from '../dtos/task-dto'
import type { ListRepository, TaskRepository } from '../ports/repositories'
import type { Clock } from '../ports/clock'
import type { IdGenerator } from '../ports/id-generator'

export interface CreateTaskDeps {
  lists: ListRepository
  tasks: TaskRepository
  ids: IdGenerator
  clock: Clock
}

export function makeCreateTask({ lists, tasks, ids, clock }: CreateTaskDeps) {
  return async function createTask(requesterId: string, input: CreateTaskInput): Promise<TaskView> {
    const owner = asEntityId(requesterId)
    const list = await lists.findById(asEntityId(input.listId))
    if (!list || !list.isOwnedBy(owner)) throw new ForbiddenError('list')

    const task = Task.create({
      id: ids.generate(),
      listId: list.id,
      title: input.title,
      createdAt: clock.now(),
    })
    await tasks.save(task)
    return toTaskView(task)
  }
}
```

## Application: testing fakes

`packages/application/src/testing/fakes.ts`
```ts
import { asEntityId } from '@<slug>/domain'
import type { EntityId } from '@<slug>/domain'
import type { Clock } from '../ports/clock'
import type { IdGenerator } from '../ports/id-generator'
import type { UnitOfWork } from '../ports/unit-of-work'

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date { return this.value }
}
export class FakeUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> { return work() }
}
export class SequentialIdGenerator implements IdGenerator {
  private index = 0
  constructor(private readonly ids: EntityId[]) {}
  generate(): EntityId {
    const id = this.ids[this.index]
    if (!id) throw new Error('SequentialIdGenerator ran out of identifiers.')
    this.index += 1
    return id
  }
}
export const ID = { user: asEntityId('a1c8f2e4-5b6d-4c7e-8f90-1a2b3c4d5e6f') }
```

`packages/application/src/testing/in-memory-task-repository.ts`
```ts
import type { EntityId, Task } from '@<slug>/domain'
import type { TaskRepository } from '../ports/repositories'

export class InMemoryTaskRepository implements TaskRepository {
  private tasks = new Map<EntityId, Task>()
  async save(task: Task): Promise<void> { this.tasks.set(task.id, task) }
  async findById(id: EntityId): Promise<Task | null> { return this.tasks.get(id) ?? null }
  async listByList(listId: EntityId): Promise<Task[]> {
    return [...this.tasks.values()].filter((t) => t.listId === listId)
  }
  async delete(id: EntityId): Promise<void> { this.tasks.delete(id) }
}
```

## Application: public surface

`packages/application/src/index.ts`
```ts
export * from './use-cases/create-task'
export * from './dtos/task-dto'
export * from './errors/use-case-error'
export type { TaskRepository, ListRepository } from './ports/repositories'
export type { Clock } from './ports/clock'
export type { IdGenerator } from './ports/id-generator'
export type { UnitOfWork } from './ports/unit-of-work'
```

## Infrastructure: Prisma client + adapter

`packages/infrastructure/src/database/prisma-client.ts`
```ts
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrismaClient(connectionString: string): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma
  const adapter = new PrismaNeon({ connectionString })
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}
```

## Infrastructure: record mapper + repository

`packages/infrastructure/src/database/task-record.ts`
```ts
import { Task, asEntityId } from '@<slug>/domain'

export interface TaskRow {
  id: string; listId: string; title: string
  status: string; position: number; createdAt: Date; completedAt: Date | null
}

export function toDomainTask(row: TaskRow): Task {
  return Task.restore({
    id: asEntityId(row.id),
    listId: asEntityId(row.listId),
    title: row.title,
    status: row.status === 'completed' ? 'completed' : 'pending',
    position: row.position,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  })
}

export function toTaskRecord(task: Task): TaskRow {
  const p = task.toJSON()
  return { id: p.id, listId: p.listId, title: p.title, status: p.status, position: p.position, createdAt: p.createdAt, completedAt: p.completedAt }
}
```

`packages/infrastructure/src/database/prisma-task-repository.ts`
```ts
import type { EntityId, Task } from '@<slug>/domain'
import type { TaskRepository } from '@<slug>/application'
import type { PrismaClient } from '@prisma/client'
import { toDomainTask, toTaskRecord } from './task-record'

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(task: Task): Promise<void> {
    const r = toTaskRecord(task)
    await this.prisma.task.upsert({
      where: { id: r.id },
      create: r,
      update: { listId: r.listId, title: r.title, status: r.status, position: r.position, completedAt: r.completedAt },
    })
  }
  async findById(id: EntityId): Promise<Task | null> {
    const row = await this.prisma.task.findUnique({ where: { id } })
    return row ? toDomainTask(row) : null
  }
  async listByList(listId: EntityId): Promise<Task[]> {
    const rows = await this.prisma.task.findMany({ where: { listId }, orderBy: { position: 'asc' } })
    return rows.map(toDomainTask)
  }
  async delete(id: EntityId): Promise<void> {
    await this.prisma.task.deleteMany({ where: { id } })
  }
}
```

## Infrastructure: unit of work (transparent transactions)

`packages/infrastructure/src/database/prisma-unit-of-work.ts`
```ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PrismaClient } from '@prisma/client'
import type { UnitOfWork } from '@<slug>/application'

const storage = new AsyncLocalStorage<PrismaClient>()

export function createTransactionalClient(root: PrismaClient): PrismaClient {
  return new Proxy(root, {
    get(target, property, receiver) {
      const active = storage.getStore() ?? target
      return Reflect.get(active, property, active === target ? receiver : active)
    },
  })
}

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly root: PrismaClient) {}
  run<T>(work: () => Promise<T>): Promise<T> {
    if (storage.getStore()) return work()
    return this.root.$transaction((tx) => storage.run(tx as PrismaClient, work))
  }
}
```
Repos receive `createTransactionalClient(root)` so any `unitOfWork.run(...)` wraps their writes in a transaction transparently.

## Infrastructure: Resend email

`packages/infrastructure/src/email/resend-email-sender.ts`
```ts
import { Resend } from 'resend'
import type { EmailSender } from '@<slug>/application'
import { renderEmail } from './render-email'

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend
  constructor(apiKey: string, private readonly from: string, private readonly appName = '<App>') {
    this.client = new Resend(apiKey)
  }
  private async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, to, subject, html })
    if (error) throw new Error(`Resend failed to send email: ${error.message}`)
  }
  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { subject, html } = renderEmail({ type: 'verification-code', data: { code, appName: this.appName } })
    await this.send(to, subject, html)
  }
}

export class ConsoleEmailSender implements EmailSender {
  async sendVerificationCode(to: string, code: string): Promise<void> {
    console.warn(`[EMAIL] Verification code for ${to}: ${code}`)
  }
}
```
`render-email.ts` is a discriminated union of template types → `{ subject, html }`, HTML built as strings (portable, no JSX). i18n via a `locale` arg.

## apps/web: env (Zod, fail-fast)

`apps/web/src/env.ts`
```ts
import { z } from 'zod'

const emptyAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().min(16),
  RESEND_KEY: emptyAsUndefined(z.string().min(1)),
  EMAIL_FROM: z.string().default('noreply@example.com'),
  UPSTASH_REDIS_REST_URL: emptyAsUndefined(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: emptyAsUndefined(z.string().min(1)),
})
export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined
export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env)
  return cached
}
```

## apps/web: API helpers

`apps/web/src/server/api/respond.ts`
```ts
export interface SuccessEnvelope<T> { data: T; meta?: Record<string, unknown> }
export interface ErrorEnvelope { error: { code: string; message: string; details?: unknown } }

export function ok<T>(data: T, init: { status?: number; meta?: Record<string, unknown> } = {}): Response {
  const body: SuccessEnvelope<T> = { data }
  if (init.meta) body.meta = init.meta
  return Response.json(body, { status: init.status ?? 200 })
}
export function fail(code: string, message: string, status: number, details?: unknown): Response {
  const error: ErrorEnvelope['error'] = { code, message }
  if (details !== undefined) error.details = details
  return Response.json({ error }, { status })
}
```

`apps/web/src/server/api/errors.ts`
```ts
import { ZodError } from 'zod'
import { ValidationError } from '@<slug>/domain'
import { ForbiddenError, NotFoundError } from '@<slug>/application'
import { fail } from './respond'

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) return fail('VALIDATION_ERROR', 'Invalid request.', 422, error.issues)
  if (error instanceof ValidationError) return fail(error.code, error.message, 422)
  if (error instanceof NotFoundError) return fail(error.code, error.message, 404)
  if (error instanceof ForbiddenError) return fail(error.code, error.message, 403)
  console.error('[api-error]', error instanceof Error ? error.message : String(error))
  return fail('INTERNAL_ERROR', 'Something went wrong.', 500)
}
```

`apps/web/src/server/api/authenticate.ts` — `authenticateRequest(request)` resolves a `Principal` from a session cookie or API key; `requireScope(request, scope)` returns `{ userId }` or a `fail(...)` Response, and applies rate limiting.

## apps/web: route handler

`apps/web/src/app/api/v1/tasks/route.ts`
```ts
import { createTaskSchema } from '@<slug>/application'
import { getContainer } from '@/server/container'
import { requireScope } from '@/server/api/authenticate'
import { ok } from '@/server/api/respond'
import { toErrorResponse } from '@/server/api/errors'

export async function POST(request: Request): Promise<Response> {
  const auth = await requireScope(request, 'tasks:write')
  if (auth instanceof Response) return auth
  try {
    const body = createTaskSchema.parse(await request.json())
    const task = await getContainer().createTask(auth.userId, body)
    return ok(task, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
```

## apps/web: composition root

`apps/web/src/server/container.ts`
```ts
import { makeCreateTask } from '@<slug>/application'
import { getServerEnv } from '@/env'
import { getPrismaClient } from '@<slug>/infrastructure'
import { PrismaTaskRepository, PrismaListRepository, PrismaUnitOfWork, createTransactionalClient } from '@<slug>/infrastructure'
import { ResendEmailSender, ConsoleEmailSender } from '@<slug>/infrastructure'
import { UuidGenerator, SystemClock } from '@<slug>/infrastructure'

function build() {
  const env = getServerEnv()
  const root = getPrismaClient(env.DATABASE_URL)
  const prisma = createTransactionalClient(root)

  const tasks = new PrismaTaskRepository(prisma)
  const lists = new PrismaListRepository(prisma)
  const ids = new UuidGenerator()
  const clock = new SystemClock()
  const unitOfWork = new PrismaUnitOfWork(root)
  const emails = env.RESEND_KEY ? new ResendEmailSender(env.RESEND_KEY, env.EMAIL_FROM) : new ConsoleEmailSender()

  return {
    env,
    emails,
    createTask: makeCreateTask({ tasks, lists, ids, clock }),
  }
}

export type Container = ReturnType<typeof build>
let cached: Container | undefined
export function getContainer(): Container {
  cached ??= build()
  return cached
}
```

## apps/web: React Query hook

`apps/web/src/lib/api/use-tasks.ts`
```ts
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { CreateTaskInput, TaskView } from '@<slug>/application'

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiClient.post<TaskView>('/api/v1/tasks', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
```
`client.ts` is a thin `fetch` wrapper that throws on non-2xx with the parsed `{ error }` body.

## i18n (always included)

`packages/i18n/src/locales.ts`
```ts
export const SUPPORTED_LOCALES = ['en', 'pt-BR'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
```

`packages/i18n/src/messages/types.ts` — the typed shape every catalog must satisfy.
```ts
export interface Messages {
  common: { appName: string; save: string; cancel: string }
  auth: { signIn: string; signOut: string }
  errors: { unauthorized: string; forbidden: string; notFound: string; internal: string }
}
```

`packages/i18n/src/messages/en.ts` and `pt-BR.ts` implement `Messages` (English is the source of truth; every other locale mirrors its keys). Keys are always present in all locales — `en` is the fallback.

`packages/i18n/src/index.ts`
```ts
import { en } from './messages/en'
import { ptBR } from './messages/pt-BR'
import type { Messages } from './messages/types'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales'

const messages: Record<Locale, Messages> = { en, 'pt-BR': ptBR }
export function getMessages(locale: Locale): Messages { return messages[locale] }
export function parseAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim()
    if (tag && isLocale(tag)) return tag
  }
  return DEFAULT_LOCALE
}
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from './locales'
export type { Messages } from './messages/types'
```

Server usage (route/handler): `const messages = getMessages(parseAcceptLanguage(request.headers.get('accept-language')))`. API error responses pull copy from `messages.errors.*`. Client usage: a `MessagesProvider` puts the resolved catalog in context; a `useMessages()` hook reads it. **No user-facing string is hardcoded** — it always comes from a catalog.

## PWA (always included)

`apps/web/src/app/sw.ts` (Serwist service worker)
```ts
import { defaultCache } from '@serwist/next/worker'
import { Serwist } from 'serwist'

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})
serwist.addEventListeners()
```

`apps/web/next.config.mjs` wraps the export with Serwist:
```ts
import withSerwistInit from '@serwist/next'
const withSerwist = withSerwistInit({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })
export default withSerwist(nextConfig)
```

`apps/web/src/app/manifest.ts` (typed web manifest)
```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '<App>',
    short_name: '<App>',
    description: '<one-line description>',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

Add `manifest`, `themeColor`, and `appleWebApp` to the root `layout.tsx` `metadata`/`viewport` exports, and generate the icon set under `public/icons/`.
