# audio-forge

Portfolio demo app — production patterns for senior platform/full-stack engineering interviews.

## What's in here

| Area | Pattern | File |
|------|---------|------|
| System Design | Async Bull/Redis job queue | `apps/api/src/queue/audioQueue.ts` |
| System Design | Typed circuit breaker | `apps/api/src/queue/circuitBreaker.ts` |
| Node.js/API | Layered architecture (router → controller → service → repository) | `apps/api/src/routes/`, `controllers/`, `services/`, `repositories/` |
| Node.js/API | JWT middleware + plan-aware rate limiting | `apps/api/src/middleware/auth.ts`, `rateLimit.ts` |
| React | `useAsyncData` hook with AbortController | `apps/web/src/hooks/useAsyncData.ts` |
| React | Context splitting + reducer | `apps/web/src/context/AudioContext.tsx` |
| React | `memo` with custom comparator | `apps/web/src/components/Waveform.tsx` |
| AWS | Terraform: SQS → Lambda → S3 pipeline | `infra/` |
| AWS | pino structured logging + CloudWatch EMF metrics | `apps/api/src/logging/logger.ts` |
| Behavioral | Nexus → Cloudsmith migration script | `scripts/migrate-registry.ts` |
| Behavioral | Tech debt annotation patterns | `scripts/tech-debt-patterns.ts` |

## Local dev

**Prerequisites:** Node 20+, Docker

```bash
# Start Redis + Postgres
docker compose up -d redis postgres

# Install deps
npm install

# Start API + web concurrently
npm run dev
```

API runs on `http://localhost:3001`, web on `http://localhost:5173`.

## Key talking points (interview reference)

**On the queue design:**
`bisect_batch_on_function_error` on the SQS event source mapping — if a batch of 10 messages fails, Lambda splits it in half and retries each side, isolating the bad message without losing the whole batch.

**On the circuit breaker:**
Three states (CLOSED → OPEN → HALF_OPEN) with configurable failure threshold and probe timeout. Wraps S3 uploads so one bad availability zone doesn't cascade into failed jobs.

**On context splitting:**
`AudioStateContext` and `AudioDispatchContext` are separate. `<GenerateButton>` reads only dispatch — zero re-renders from polling. `<JobList>` reads state — updates on every poll. Without splitting, everything re-renders every 3 s.

**On the registry migration:**
`DRY_RUN=true` by default (safe). Batched 50 packages at a time with 5-concurrency semaphore to stay under Cloudsmith's rate limit. Nexus kept serving as read-only mirror for two weeks post-cutover.

## Infrastructure

```bash
cd infra
terraform init
terraform plan -var="environment=dev"
terraform apply
```

Outputs: `audio_bucket_name`, `sqs_queue_url`, `lambda_function_name`.
