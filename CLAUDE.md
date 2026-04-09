# CLAUDE.md — My Job Portal Backend

## Project Overview

A job portal backend for the Vietnam IT market. Users search/apply for jobs, companies post listings and review applicants, and an AI system parses CVs, scores matches, and provides career advice via chatbot.

**Stack:** NestJS 10 · TypeScript 5 · MongoDB 7 (Mongoose) · Redis 7 (caching + BullMQ) · Google Gemini AI

## Source Structure

```
src/
├── main.ts                  # Bootstrap: guards, pipes, interceptors, CORS, Swagger
├── app.module.ts            # Root module (20 feature modules)
├── core/                    # Global exception filter + response interceptor
├── decorator/               # @Public, @User, @ResponseMessage, @OptionalAuth
├── casl/                    # CASL ability factory, RolesGuard, PoliciesGuard, @Roles, @CheckPolicies
│
├── auth/                    # JWT auth, Passport strategies, guards, Google OAuth
├── users/                   # User accounts and profiles
├── roles/                   # Role definitions (SUPER ADMIN, HR, NORMAL USER)
├── sessions/                # Multi-device session management
│
├── companies/               # Company profiles and management
├── jobs/                    # Job listings CRUD
├── resumes/                 # Resume submissions and status tracking
├── cv-profiles/             # User CV profiles (upsert pattern)
├── cv-parser/               # PDF/DOCX/TXT text extraction
├── matching/                # Deterministic scoring engine (skills/experience/education)
│
├── gemini/                  # Google Gemini AI service wrapper
├── chat/                    # AI career advisor chatbot with structured output
├── queues/                  # BullMQ processors (resume parsing, notifications, recommendations)
│
├── files/                   # Multer file upload (5MB, images + documents)
├── mail/                    # SMTP email with Handlebars templates
├── subscribers/             # Job notification subscribers
├── statistics/              # Dashboard analytics
├── databases/               # Seed data (roles, permissions, admin user)
├── redis/                   # Redis connection + cache manager
└── health/                  # Health check endpoint
```

## Development

```bash
npm run docker:dev           # Start MongoDB + Redis containers
npm run dev                  # Start NestJS in watch mode (port 8081)
npm run build                # Compile to dist/
npm run lint                 # ESLint with auto-fix
npm run format               # Prettier formatting
npm test                     # Jest (tests not yet implemented)
```

Swagger docs: `http://localhost:8081/api`

## Verifying Changes

1. **Type check:** `npx tsc --noEmit` — catches type errors without compiling
2. **Lint:** `npm run lint` — ESLint + Prettier compliance
3. **Build:** `npm run build` — full compilation to `dist/`
4. **Run:** `npm run dev` — start and manually verify endpoints via Swagger

## Key Patterns

- **Response format:** All responses wrapped as `{ statusCode, message, data }` via `TransformInterceptor`
- **Auth decorators:** Use `@Public()` for unauthenticated routes, `@Roles()` + `@CheckPolicies()` for CASL-guarded routes, `@OptionalAuth()` for optional-auth routes
- **DTO validation:** Every endpoint uses `class-validator` DTOs with `whitelist: true`
- **Module layout:** Each feature has `controller.ts`, `service.ts`, `module.ts`, `dto/`, `schemas/`
- **Soft delete:** All models support soft delete (never hard-delete records)
- **Hybrid AI:** Gemini extracts CV data, backend `MatchingService` does deterministic scoring

## Rule
Before writing code, YOU MUST read:

- agent_docs/SENIOR_BACKEND_PRACTICES.md
- After you've finished coding, create documentation describing the process and workflow.
## Agent Documentation

Read these files before starting work on related areas. Pick only what's relevant to the current task.

| File | Read when... |
|------|-------------|
| `agent_docs/SENIOR_BACKEND_PRACTICES.md` | Writing any new code, refactoring, or reviewing quality standards |
| `agent_docs/building_and_running.md` | Setting up the project, running Docker, understanding env vars, or deploying |
| `agent_docs/code_conventions.md` | Writing new endpoints, controllers, services, or understanding the guard chain |
| `agent_docs/service_architecture.md` | Understanding module dependencies, request lifecycle, or async processing flows |
| `agent_docs/database_schema.md` | Working with Mongoose schemas, adding fields, or understanding collection relationships |
| `agent_docs/authentication_and_authorization.md` | Modifying auth flow, adding permissions, or working with JWT/OAuth |
| `agent_docs/ai_and_matching.md` | Working on CV parsing, matching scores, chatbot, or BullMQ queues |
| `NAMING_CONVENTIONS.md` | Creating enums, interfaces, DTOs, or any new TypeScript files |

