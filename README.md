# NestJS Event Processing Platform

A NestJS monorepo that ingests sensor-like events over RabbitMQ, evaluates threshold rules, stores historical matches, and exposes reporting APIs.

**Agent** services generate and publish events asynchronously. The **Process** service persists events, matches rules, maintains Redis rankings, and serves HTTP APIs with Swagger.

## Features

- Asynchronous event pipeline via RabbitMQ (durable queues, ack/nack, DLQ)
- Rule CRUD with duplicate-active-rule protection (`409`)
- Immutable rule snapshots on every match (explainable history after edit/delete)
- Two reports: time-bounded occurrences and agent rankings
- Idempotent processing for at-least-once delivery
- Health and readiness probes
- Docker Compose stack for local and demo deployments
- Unit tests and Testcontainers-based e2e coverage

## Architecture

```text
┌─────────────┐     EventMessageV1      ┌──────────────┐
│ Agent (N)   │ ───────────────────────►│   RabbitMQ   │
│ faker       │   exchange agent.events │  + DLQ       │
└─────────────┘                         └──────┬───────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Process    │
                                        │  NestJS API  │
                                        └──────┬───────┘
                         ┌─────────────────────┼─────────────────────┐
                         ▼                     ▼                     ▼
                    ┌─────────┐          ┌─────────┐           ┌─────────┐
                    │ MongoDB │          │  Redis  │           │ Swagger │
                    │ source  │          │ rankings│           │  /docs  │
                    │ of truth│          │ (derived)│          └─────────┘
                    └─────────┘          └─────────┘
```

| Component | Role |
|-----------|------|
| `apps/agent` | Stateless event producer (~5 events/sec). No database. |
| `apps/process` | Ingests events, rule CRUD, matching, Redis rankings, reports. |
| `libs/shared` | Shared message contract, operators, pure rule evaluator. |

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | NestJS, TypeScript |
| Broker | RabbitMQ |
| Persistence | MongoDB (Mongoose) |
| Cache / rankings | Redis (ioredis) |
| Validation | class-validator, Joi (config) |
| Docs | Swagger UI at `/docs` |
| Tests | Jest, Testcontainers |
| Ops | Docker Compose, multi-stage non-root images |

### Why RabbitMQ

| Option | Notes |
|--------|-------|
| HTTP / WebSocket | Synchronous coupling; poor fit for durable event fan-in |
| Kafka | Strong at large scale; heavier operational footprint here |
| Redis Streams | Mixes cache and broker concerns |
| **RabbitMQ** | Durable queues, ack/nack, DLX/DLQ, Nest-friendly |

## Quick start

### Prerequisites

- Node.js 20+
- Docker / Docker Compose

### Full stack (recommended)

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---------|-----|
| Process API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |
| RabbitMQ UI | http://localhost:15672 (`guest` / `guest`) |

Scale agents:

```bash
docker compose up --build --scale agent=3
```

Give each replica a distinct `AGENT_ID` via compose override if needed.

### Local services (infra in Docker)

```bash
docker compose up -d mongo redis rabbitmq

cp .env.example .env   # point hosts to 127.0.0.1

npm install
npm run start:process:dev

# separate terminal
set AGENT_ID=agent-1
set RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
npm run start:agent:dev
```

On Unix shells, use `export` instead of `set`.

## Configuration

See [`.env.example`](.env.example). Config is validated with Joi at startup. Do not commit `.env`.

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `AGENT_ID` | Agent | yes | Unique agent identity |
| `EVENT_RATE_PER_SEC` | Agent | no (5) | Generation rate |
| `RABBITMQ_URL` | both | yes | `amqp(s)://...` |
| `PORT` | Process | no (3000) | HTTP port |
| `MONGODB_URI` | Process | yes | Mongo connection |
| `REDIS_URL` | Process | yes | Redis connection |
| `RABBITMQ_PREFETCH` | Process | no (10) | Consumer prefetch |
| `LOG_LEVEL` | both | no (`log`) | Nest log level |

## API

Swagger UI: http://localhost:3000/docs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rules` | Create rule (`409` on duplicate active rule) |
| `GET` | `/rules?page&limit` | Paginated list |
| `GET` | `/rules/:id` | Get rule |
| `PATCH` | `/rules/:id` | Update rule (`409` on duplicate) |
| `DELETE` | `/rules/:id` | Hard delete (historical matches remain) |
| `GET` | `/reports/rules/:ruleId/occurrences?from&to` | Occurrences in a range (max 1 day) |
| `GET` | `/reports/rules/:ruleId/agent-rankings` | Agent rankings for a rule |
| `GET` | `/health` | Liveness |
| `GET` | `/health/ready` | Mongo + Redis + Rabbit readiness |

Reports remain available for deleted rules when historical matches exist.

## Data model

### Collections

**`events`** — `eventId` (unique UUID), `agentId`, `name`, `value`, `occurredAt`, `receivedAt`, `processingCompleted`

**`rules`** — `eventName`, `operator` (`< > = <= >=`), `threshold`

**`rule_matches`** — links (`eventId`, `agentId`, `ruleId`), event facts, `matchedAt`, and `ruleSnapshot` `{ eventName, operator, threshold }` frozen at match time

### Indexes

| Collection | Index | Purpose |
|------------|-------|---------|
| `events` | `{ eventId: 1 }` unique | Deduplicate delivery |
| `rules` | `{ eventName: 1 }` | Load rules by event type |
| `rules` | `{ eventName: 1, operator: 1, threshold: 1 }` unique | Prevent duplicate active rules |
| `rule_matches` | `{ eventId: 1, ruleId: 1 }` unique | Idempotent matches |
| `rule_matches` | `{ ruleId: 1, occurredAt: 1, agentId: 1 }` | Occurrences report |
| `rule_matches` | `{ ruleId: 1, agentId: 1 }` | Rankings rebuild |

### Redis

| Key | Structure | Purpose |
|-----|-----------|---------|
| `rule:{ruleId}:agent-counts` | Sorted set | `score=count`, `member=agentId` |

Updated with `ZINCRBY` only after a new match insert. Deleted when a rule is deleted (Mongo matches remain). Rebuildable from MongoDB on cache miss.

## Processing pipeline

1. Validate `EventMessageV1`
2. Upsert event by `eventId`
3. If `processingCompleted` → ack (duplicate)
4. Load active rules (short in-memory cache)
5. Evaluate with pure `evaluateRule` / `findMatchingRules`
6. Insert matches with snapshots; unique `(eventId, ruleId)`
7. `ZINCRBY` only when a new match document is created
8. Mark `processingCompleted = true`
9. Ack

New or edited rules are not applied to past events.

### Idempotency

| Layer | Mechanism |
|-------|-----------|
| Transport | At-least-once AMQP; ack after success |
| Event | Unique `eventId` + `processingCompleted` |
| Match | Unique `(eventId, ruleId)` |
| Redis | Increment only on new match insert |

MongoDB is the durable source of truth. Redis rankings are an eventually consistent derived view; Report rankings prefer Redis and fall back to Mongo aggregation + rebuild.

## Development

```bash
npm install
npm run start:process:dev
npm run start:agent:dev

npm run build process
npm run build agent
npm run lint
npm test
npm run test:cov
npm run test:e2e
```

E2E tests use Testcontainers for MongoDB and Redis (Docker required). RabbitMQ is stubbed in the Nest test module; the consumer path runs through `EventProcessorService.processEvent` for deterministic coverage. Full broker wiring is exercised via Docker Compose.

### Scripts

| Script | Purpose |
|--------|---------|
| `start:process:dev` / `start:agent:dev` | Watch mode |
| `build` / `build:process` / `build:agent` | Compile |
| `lint` / `format` | Quality |
| `test` / `test:e2e` / `test:cov` | Tests |

## Project structure

```text
apps/agent/          # event producer
apps/process/        # consumer + HTTP API
libs/shared/         # contracts + pure domain helpers
Dockerfile.agent
Dockerfile.process
docker-compose.yml
.env.example
```

## Design notes

- Prefetch limits in-flight work (backpressure)
- Horizontal Process scaling is safe thanks to unique indexes
- Redis rankings can briefly undercount if a crash occurs between match insert and `ZINCRBY`; corrected on read via Mongo rebuild
- In-memory rule cache may lag CRUD by a few seconds
- Numeric `=` uses exact equality
- Event `value` is numeric; agent-generated UUIDs are validated for shape and uniqueness

### Possible extensions

- Event TTL / cold storage archival
- Explicit rule versioning beyond match snapshots
- Prometheus metrics and OpenTelemetry tracing
- Outbox pattern for downstream publishing
- Authentication for untrusted networks
