# audio-forge

Portfolio demo app — production patterns for senior platform/full-stack engineering interviews.

## What's in here

| Area | Pattern | File |
|------|---------|------|
| System Design | Async BullMQ/Redis job queue with SQS bridge for Lambda in prod | `apps/api/src/queue/audioQueue.ts` |
| System Design | Typed circuit breaker (CLOSED → OPEN → HALF_OPEN) | `apps/api/src/queue/circuitBreaker.ts` |
| Node.js/API | Layered architecture (router → controller → service → repository) | `apps/api/src/routes/`, `controllers/`, `services/`, `repositories/` |
| Node.js/API | JWT middleware + plan-aware RBAC + rate limiting | `apps/api/src/middleware/auth.ts`, `rateLimit.ts` |
| Node.js/API | CORS, structured pino logging, CloudWatch EMF metrics | `apps/api/src/index.ts`, `logging/logger.ts` |
| React | `useAsyncData` hook with AbortController cancellation | `apps/web/src/hooks/useAsyncData.ts` |
| React | Split context + reducer (state vs dispatch) | `apps/web/src/context/AudioContext.tsx` |
| React | `memo` with custom comparator for waveform | `apps/web/src/components/Waveform.tsx` |
| AWS | Terraform: SQS + DLQ → Lambda → S3 pipeline | `infra/` |
| AWS | Lambda SQS consumer with `ReportBatchItemFailures` | `apps/lambda/src/index.ts` |
| Behavioral | Nexus → Cloudsmith migration script | `scripts/migrate-registry.ts` |
| Behavioral | Tech debt annotation patterns | `scripts/tech-debt-patterns.ts` |

## Local dev

**Prerequisites:** Node 20+, Docker Desktop (with WSL integration enabled on Windows)

```bash
# Copy env template and fill in your values
cp .env.example .env

# Start all services (Postgres, Redis, API, Web) — rebuilds images on change
npm run docker:up

# View logs
docker compose logs -f api
```

API: `http://localhost:3001` — Web: `http://localhost:5173`

### Quick API smoke test

```bash
# Health check
curl http://localhost:3001/health

# Get a demo token (plan: free | pro | enterprise)
curl -s -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","plan":"pro"}' | tee token.json

# Generate audio (pro/enterprise only)
TOKEN=$(jq -r .token token.json)
curl -s -X POST http://localhost:3001/audio/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"calm lo-fi beats","durationSec":30}'

# Poll job status
curl -s http://localhost:3001/audio/jobs \
  -H "Authorization: Bearer $TOKEN"
```

## Infrastructure

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Outputs: `audio_bucket_name`, `sqs_queue_url`, `lambda_function_name`.

Copy `sqs_queue_url` and `audio_bucket_name` into your `.env` after apply.

## Architecture

```text
Web (React)  →  API (Express/BullMQ)  →  Redis (local queue)
                        │
                    SQS_QUEUE_URL set?
                        │ yes
                        ↓
                  SQS Queue  →  Lambda  →  S3
```

In dev, the BullMQ worker embedded in the API process handles jobs. When `SQS_QUEUE_URL` is set, `enqueue()` also fires a message to SQS so the Lambda consumer picks it up in production. SQS failures are non-fatal — logged as warnings, BullMQ handles locally.

## Key talking points (interview reference)

**On the queue design:**
Dual-path enqueue — BullMQ for local dev (no AWS needed), SQS bridge for Lambda in prod. The SQS send is fire-and-forget so a cloud outage never 500s the HTTP response. Jobs persist in the in-memory repository immediately, so clients can poll status before the worker even starts.

**On the circuit breaker:**
Three states (CLOSED → OPEN → HALF_OPEN) with configurable failure threshold and probe timeout. Wraps S3 uploads so a degraded availability zone doesn't cascade into failed jobs and exhaust BullMQ retry budget.

**On the Lambda consumer:**
Uses `ReportBatchItemFailures` — failed records return their `messageId` so SQS only retries the bad messages, not the whole batch. After `maxReceiveCount` (3), messages move to the DLQ with 14-day retention for inspection.

**On context splitting:**
`AudioStateContext` and `AudioDispatchContext` are separate. `<GenerateForm>` reads only dispatch — zero re-renders from polling. `<JobList>` reads state — re-renders on every 3 s poll. Without splitting, every component re-renders on every poll tick.

**On the registry migration:**
`DRY_RUN=true` by default (safe). Batched 50 packages at a time with 5-concurrency semaphore to stay under Cloudsmith's rate limit. Nexus kept as read-only mirror for two weeks post-cutover to catch stragglers.
