# Agent / Process Event Platform

Production-style NestJS monorepo for a take-home assignment: **Agent** services generate sensor-like events and publish them asynchronously; a **Process** service persists events, evaluates rules, stores historical matches, and exposes reporting APIs.

## 1. Project overview

| Component | Role |
|-----------|------|
| `apps/agent` | Stateless event producer (~5 events/sec). No database. |
| `apps/process` | Ingests events, rule CRUD, matching, Redis rankings, reports. |
| `libs/shared` | Shared message contract, operators, pure rule evaluator. |

## 2. Architecture

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

## 3. Service responsibilities

### Agent
- Configurable `AGENT_ID`
- Generates typed numeric events with `@faker-js/faker`
- Publishes durable AMQP messages (~5/sec)
- Graceful shutdown stops the timer and closes the broker connection

### Process
- Consumes RabbitMQ with prefetch backpressure
- Persists every event in MongoDB
- Evaluates active rules; stores immutable rule snapshots on matches
- Maintains Redis sorted-set rankings for Report #2
- REST API for rules + reports; Swagger at `/docs`

## 4. Technology choices

- **NestJS** — modular DI, lifecycle hooks, validation, Swagger
- **MongoDB + Mongoose** — durable events / rules / matches
- **Redis (ioredis)** — derived agent rankings per rule
- **RabbitMQ** — async Agent → Process pipeline
- **Jest + Testcontainers** — unit + isolated integration tests
- **Docker Compose** — reproducible local stack

## 5. Why RabbitMQ?

The assignment prefers a non-HTTP/WebSocket broker and suggests RabbitMQ unless there is a strong alternative.

| Option | Why not / why yes |
|--------|-------------------|
| HTTP / WebSocket | Explicitly disallowed for the event pipeline |
| Kafka | Excellent at scale, heavier ops for a take-home |
| Redis Streams | Blurs cache vs broker responsibilities |
| **RabbitMQ** | Durable queues, ack/nack, DLX/DLQ, Nest-friendly, right complexity |

## 6. MongoDB schema

### `events`
| Field | Notes |
|-------|-------|
| `eventId` | UUID from Agent; unique |
| `agentId`, `name`, `value` | Event payload |
| `occurredAt` | Agent timestamp |
| `receivedAt` | Server receive time |
| `processingCompleted` | Idempotency / resume flag |

### `rules`
| Field | Notes |
|-------|-------|
| `eventName` | Compared to `event.name` |
| `operator` | `< > = <= >=` |
| `threshold` | Numeric |

### `rule_matches`
| Field | Notes |
|-------|-------|
| `eventId`, `agentId`, `ruleId` | Links |
| `eventName`, `eventValue`, `occurredAt` | Event facts at match time |
| `matchedAt` | Processing time |
| `ruleSnapshot` | `{ eventName, operator, threshold }` frozen at match |

Historical matches remain explainable after rule edit/delete.

## 7. Important indexes

| Collection | Index | Reason |
|------------|-------|--------|
| `events` | `{ eventId: 1 }` unique | Duplicate delivery |
| `rules` | `{ eventName: 1 }` | Load rules for an event type |
| `rule_matches` | `{ eventId: 1, ruleId: 1 }` unique | Idempotent matches / Redis gate |
| `rule_matches` | `{ ruleId: 1, occurredAt: 1, agentId: 1 }` | Report #1 |
| `rule_matches` | `{ ruleId: 1, agentId: 1 }` | Report #2 rebuild |

## 8. Redis design

| Key | Structure | Purpose |
|-----|-----------|---------|
| `rule:{ruleId}:agent-counts` | Sorted set | `score=count`, `member=agentId` |

- Updated with `ZINCRBY` only after a **new** match insert
- Deleted when a rule is deleted (matches remain in MongoDB)
- No TTL — rebuildable derived state
- On cache miss / Redis flush: aggregate MongoDB and rebuild

MongoDB remains the durable source of truth.

## 9. Rule matching flow

1. Validate `EventMessageV1`
2. Upsert event by `eventId`
3. If `processingCompleted` → ack (true duplicate)
4. Load active rules (short in-memory cache)
5. Evaluate with pure `evaluateRule` / `findMatchingRules`
6. Insert matches with snapshots; unique `(eventId, ruleId)`
7. `ZINCRBY` only when match insert created a new doc
8. Mark `processingCompleted = true`
9. Ack

New/edited rules are **not** applied to past events.

## 10. Idempotency strategy

| Layer | Mechanism |
|-------|-----------|
| Transport | At-least-once AMQP; ack after success |
| Event | Unique `eventId` + `processingCompleted` |
| Match | Unique `(eventId, ruleId)` |
| Redis | Increment only on new match insert |

This covers: full duplicate delivery, crash after event insert (resume matching), and crash after match insert before Redis (Report #2 rebuild from Mongo).

## 11. Consistency considerations

- **MongoDB**: strong consistency for events/matches
- **Redis rankings**: eventually consistent derived view
- Report #2 prefers Redis, falls back to MongoDB aggregation + rebuild
- Rule CRUD vs matching race: snapshot freezes the rule as evaluated; no global serializable clock across services (documented trade-off)

## 12. API documentation

Swagger UI: `http://localhost:3000/docs`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rules` | Create rule |
| GET | `/rules?page&limit` | Paginated list |
| GET | `/rules/:id` | Get rule |
| PATCH | `/rules/:id` | Update rule |
| DELETE | `/rules/:id` | Delete rule |
| GET | `/reports/rules/:ruleId/occurrences?from&to` | Report #1 (max 1 day) |
| GET | `/reports/rules/:ruleId/agent-rankings` | Report #2 |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Mongo + Redis + Rabbit readiness |

Reports work for deleted rules if historical matches exist.

## 13. Environment variables

See [`.env.example`](.env.example).

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

Configuration is validated with Joi at startup (fail fast). Do not commit `.env`.

## 14. Local development

```bash
# Infrastructure only
docker compose up -d mongo redis rabbitmq

# Terminal 1 — Process
cp .env.example .env   # adjust hosts to 127.0.0.1
npm install
npm run start:process:dev

# Terminal 2 — Agent
set AGENT_ID=agent-1
set RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
npm run start:agent:dev
```

## 15. Docker instructions

```bash
docker compose up --build
```

- Process API: http://localhost:3000  
- Swagger: http://localhost:3000/docs  
- RabbitMQ UI: http://localhost:15672 (`guest` / `guest`)

Scale agents:

```bash
docker compose up --build --scale agent=3
```

(Give each replica a distinct `AGENT_ID` via override if needed.)

Images use multi-stage builds and run as non-root.

## 16. Running tests

```bash
npm test            # unit tests
npm run test:cov    # coverage
npm run lint
npm run build process
npm run build agent
```

## 17. Integration test instructions

E2E tests use **Testcontainers** for MongoDB and Redis. Docker must be running. RabbitMQ is stubbed in the Nest test module; the consumer business path is exercised via `EventProcessorService.processEvent` (identical logic to the AMQP handler) so tests stay deterministic without requiring broker image pulls.

```bash
npm run test:e2e
```

Covered scenarios include rule CRUD/pagination, multi-match events, no-match, non-retroactive rules, snapshot after edit, reports after delete, duplicate delivery, Redis rebuild, and 1-day range validation. Full broker wiring is exercised in Docker Compose.

## 18. Performance considerations

- Prefetch limits in-flight work (backpressure)
- Compound index for Report #1 keeps day-bounded queries efficient
- Report #2 is O(agents with matches) via Redis ZSET
- Rule evaluation is O(rules for event name); short in-memory cache
- Horizontal Process scaling is safe due to unique indexes
- Event retention/TTL left as a future improvement for very long-lived deployments

## 19. Known trade-offs

1. Redis rankings can briefly undercount if a crash happens between match insert and `ZINCRBY` — corrected on read via Mongo rebuild.
2. Hard-deleted rules leave matches intact; Redis key is removed.
3. No multi-document Mongo transaction across event + matches — uniqueness provides practical idempotency.
4. In-memory rule cache may be stale for a few seconds after CRUD.
5. Numeric `=` uses exact equality (documented assumption).

## 20. Possible future improvements

- Event TTL / cold storage archival
- Explicit rule version collection (if audit needs more than snapshots)
- Metrics (Prometheus) and tracing (OpenTelemetry)
- Outbox pattern if Process must publish downstream events
- Authentication if APIs leave a trusted network

## Assumptions

- Event `value` is numeric
- All rules in the `rules` collection are active
- No authentication (not required by the assignment)
- Agent-generated UUIDs are trusted for identity; Process still validates payload shape and uniqueness

## Project structure

```text
apps/agent/          # producer
apps/process/        # consumer + API
libs/shared/         # contracts + pure domain helpers
Dockerfile.agent
Dockerfile.process
docker-compose.yml
.env.example
```

## Scripts

| Script | Purpose |
|--------|---------|
| `start:process:dev` / `start:agent:dev` | Watch mode |
| `build` / `build:process` / `build:agent` | Compile |
| `lint` / `format` | Quality |
| `test` / `test:e2e` / `test:cov` | Tests |
