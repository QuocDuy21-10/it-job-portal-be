# 🚀 DevLink Backend

<div align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Google_Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" alt="Swagger" />
</div>

<br />

Single NestJS backend for DevLink (a Vietnam IT job portal), covering authentication, company and job management, resumes, online CV profiles, AI-assisted CV parsing and matching, career chat, notifications, file uploads, and statistics.

---

## 🎯 What This Project Solves

**DevLink** centralizes all backend workflows needed by a modern job marketplace:

- **Candidates:** Register, manage profiles, upload/build CVs, apply to jobs, save jobs, follow companies, and receive recommendations.
- **Recruiters & Admins:** Manage companies, publish and approve jobs, review applications, and track platform statistics.
- **AI Integration:** Parse CV files, convert them into structured data, calculate deterministic job-match scores, and support career chat with AI while keeping business rules in backend services.

---

## ✨ Features

- **🔐 Authentication and Sessions:**
  - Email registration, login, JWT access & refresh tokens.
  - Google OAuth login, password reset.
  - Multi-device sessions, logout-all, account deletion & deletion cancellation.
- **👤 Users, Roles, and Authorization:**
  - User CRUD, role-aware access.
  - CASL/RBAC policies, account lock/unlock.
  - Saved jobs and followed companies.
- **🏢 Companies and Jobs:**
  - Company profiles, automatic logo cleanup.
  - Job CRUD, job approval flow, top-hiring companies showcase.
  - Keyword search support, soft-delete patterns for data safety.
- **📄 Resumes and CV Profiles:**
  - Resume application, uploaded CV file store.
  - Online structured CV profiles.
  - Application analysis, reparse/reanalyze flows, and queue status tracking.
- **🤖 AI and Matching:**
  - Text extraction (PDF, DOC, DOCX, TXT).
  - Google Gemini CV parsing into JSON structured data.
  - Deterministic job-match score calculation.
  - Groq/Gemini career chatbot, AI usage tracking, and safe fallback behavior.
- **🔔 Notifications and Subscribers:**
  - In-app real-time notifications with unread counts.
  - Email subscribers, skill-based subscriptions.
  - Follower notifications and job recommendation emails.
- **⚙️ Infrastructure and Operations:**
  - Redis cache & BullMQ background job queues.
  - SMTP mail templates (using Handlebars).
  - Swagger/OpenAPI interactive docs.
  - Health checks, statistics dashboards, validation pipes, response envelopes, CORS, and Helmet security.

---

## 🛠️ Tech Stack

| Component | Technologies |
| :--- | :--- |
| **Runtime & Language** | Node.js 20, npm, TypeScript 5 |
| **Backend Framework** | NestJS 10 (Fastify or Express compatible, using Express here) |
| **Databases** | MongoDB 7, Mongoose (`soft-delete-plugin-mongoose`) |
| **Cache & Queues** | Redis 7, BullMQ, ioredis |
| **Security & Auth** | Passport, JWT, Google OAuth, CASL, bcryptjs, Helmet, Throttler |
| **AI Processing** | Google Gemini (Gemini 3.1 Flash Lite), Groq |
| **APIs & Documentation** | Swagger/OpenAPI via `@nestjs/swagger` |
| **Files & Email** | Multer, `pdf-parse`, `mammoth`, Nodemailer, Handlebars |
| **Testing & Tooling** | Docker, Jest, ESLint, Prettier |

---

## 🚀 Quick Start

### 📋 Prerequisites

- **Node.js** 20+
- **npm**
- **Docker & Docker Compose** (highly recommended for running local MongoDB and Redis)

---

### 📦 Installation

```bash
npm install
```

---

### ⚙️ Environment Configuration

Create a `.env` file in the project root. This file is ignored by Git, so keep secrets local and never commit them.

<details>
<summary><b>🔑 View Minimum Local Environment Variables</b></summary>

Here are the required variables to spin up local development:

| Variable | Purpose | Example Value |
| :--- | :--- | :--- |
| `PORT` | HTTP port used by NestJS | `8081` |
| `NODE_ENV` | Runtime environment | `development` |
| `MONGO_URL` | MongoDB connection URI | `mongodb://root:123456@localhost:27017/devlink?authSource=admin` |
| `MONGO_INITDB_ROOT_USERNAME` | Docker MongoDB root user | `root` |
| `MONGO_INITDB_ROOT_PASSWORD` | Docker MongoDB root password | `123456` |
| `MONGO_INITDB_DATABASE` | Docker MongoDB database name | `devlink` |
| `FE_URL` | Frontend URL used by auth/mail flows | `http://localhost:3000` |
| `JWT_ACCESS_TOKEN_SECRET` | Access-token signing secret | `replace-with-local-secret` |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime | `7d` |
| `JWT_REFRESH_TOKEN_SECRET` | Refresh-token signing secret | `replace-with-local-secret` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime | `7d` |
| `EMAIL_ADMIN` | Seed/admin email | `admin@example.com` |
| `INIT_PASSWORD` | Seed/admin password | `change-me` |
| `SMTP_HOST` | SMTP host for email delivery | `smtp.gmail.com` |
| `SMTP_EMAIL` | SMTP sender account | `your-email@example.com` |
| `SMTP_PASSWORD` | SMTP password or app password | `replace-with-local-secret` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `replace-with-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `replace-with-google-client-secret` |
| `GEMINI_API_KEY` | Gemini API key | `replace-with-gemini-key` |
| `GEMINI_API_KEY_FALLBACK` | Optional fallback Gemini key | `replace-with-fallback-key` |
| `GROQ_API_KEY` | Groq API key | `replace-with-groq-key` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password, if used | *Leave empty for local Docker* |
| `REDIS_QUEUE_DB` | Redis DB index for BullMQ | `0` |
| `REDIS_CACHE_DB` | Redis DB index for cache | `1` |
| `REDIS_TTL` | Cache TTL in milliseconds | `3600000` |
| `OTP_SECRET` | OTP signing/encryption secret | `replace-with-local-secret` |

</details>

<details>
<summary><b>🤖 View AI Chat Tuning Variables</b></summary>

| Variable | Purpose |
| :--- | :--- |
| `AI_GROQ_HISTORY_LIMIT` | Number of prior chat messages included in context |
| `AI_GROQ_MAX_INPUT_TOKENS` | Input token budget for Groq requests |
| `AI_GROQ_MAX_MATCHING_JOBS` | Maximum matching jobs included in chat context |
| `AI_GROQ_MAX_SEARCH_RESULTS` | Maximum search results used by chat tools |
| `AI_GROQ_MAX_COMPANY_ITEMS` | Maximum company items included in chat context |
| `AI_GROQ_MAX_TOP_SKILLS` | Maximum top skills included in chat analytics |
| `AI_GROQ_MAX_TOP_COMPANIES` | Maximum top companies included in chat analytics |
| `AI_GROQ_MAX_SUMMARY_CHARS` | Maximum generated summary length |

</details>

---

### 🐳 Infrastructure Services

Start the MongoDB and Redis containers using Docker Compose:

```bash
npm run docker:dev
```

This boots up the necessary database and caching engines pre-configured for development.

---

### 🚀 Running the App

Start the NestJS backend in development mode:

```bash
npm run dev
```

Once running, the following endpoints are available:

*   **Swagger API Docs:** `http://localhost:8081/api`
*   **Versioned API Entry:** `http://localhost:8081/api/v1`
*   **System Health Check:** `http://localhost:8081/api/v1/health`

#### 🐋 Running the Full Stack in Docker

To spin up MongoDB, Redis, and the NestJS backend completely within Docker containers, run:

```bash
npm run docker:full
```

---

## 🛠️ CLI & Scripts Reference

Below is a cheat sheet of frequently used workspace commands:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start NestJS in watch mode |
| `npm run start` | Start NestJS once |
| `npm run start:prod` | Run the built app from `dist/` |
| `npm run build` | Compile the NestJS project |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Format files via Prettier |
| `npm test` | Run Jest unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Run tests with code coverage |
| `npm run docker:dev` | Spin up local MongoDB and Redis containers |
| `npm run docker:full` | Spin up MongoDB, Redis, and backend in containers |
| `npm run docker:down` | Stop and tear down all Docker containers |
| `npm run docker:logs` | Follow Docker container logs |
| `npm run seed` | Seed initial database collections (roles, permissions, admin) |

---

## 📂 Project Organization

```text
.
├── src/
│   ├── main.ts                   # App entrypoint (guards, validation, Swagger)
│   ├── app.module.ts             # Global wiring (databases, queues, throttling)
│   │
│   ├── auth/                     # Authentication (JWT, login, Google OAuth)
│   ├── users/                    # User accounts, CRUD operations
│   ├── roles/                    # Role and permission matrices
│   ├── sessions/                 # User session tracking (logout all, locks)
│   ├── casl/                     # CASL authorization logic (RBAC/ABAC policies)
│   ├── decorator/                # Custom NestJS decorators (@Public, @Roles)
│   │
│   ├── companies/                # Company profile management
│   ├── jobs/                     # Job listings and filtering
│   ├── resumes/                  # Job applications and CV files
│   ├── cv-profiles/              # Online candidate profiles
│   │
│   ├── cv-parser/                # Text extraction and AI parser pipeline
│   ├── matching/                 # Core resume-job matching algorithms
│   ├── gemini/                   # Google Gemini API connector
│   ├── groq/                     # Groq API connector
│   ├── chat/                     # AI Career chatbot engine
│   ├── queues/                   # BullMQ queues for background processing
│   │
│   ├── files/                    # Local storage & file upload management
│   ├── mail/                     # SMTP integration and Handlebars mailers
│   ├── notifications/            # In-app notifications
│   ├── subscribers/              # User skill subscriptions
│   ├── statistics/               # Analytics & dashboard reporting
│   │
│   ├── databases/                # DB setup & mongoose soft-delete plugin
│   ├── redis/                    # Redis adapter setup
│   ├── health/                   # Terminus health-check endpoints
│   ├── ai/                       # Generic AI helpers and prompts
│   ├── skills/                   # Static skills taxonomies
│   └── utils/                    # Shared helper utilities
│
├── Dockerfile                    # Multi-stage production container build
├── docker-compose.yml            # MongoDB, Redis, and backend docker orchestration
└── package.json                  # Main workspace manifest
```

---

## 🔌 API Conventions & Usage

- **Response Envelope:** All responses follow the unified format:
  ```json
  {
    "statusCode": 200,
    "message": "Action completed successfully",
    "data": { ... }
  }
  ```
- **Authentication & Authorization:** By default, endpoints require JWT access tokens. Protect or expose them using:
  - `@Public()` - Make the endpoint accessible without tokens.
  - `@OptionalAuth()` - Extract user session if present, but do not block.
  - `@Roles(...)` & `@CheckPolicies(...)` - Enforce specific roles or CASL authorization rules.
- **Versioned Endpoints:** All API routes are versioned and prefixed. Example: `/api/v1/auth/login`, `/api/v1/jobs`, `/api/v1/resumes`, and `/api/v1/chat/message`.
- **Data Validation:** Global validation pipeline validates payloads using class-validator and automatically strips unwhitelisted properties.
- **Upload Assets:** Uploaded files (like resumes or company logos) are placed in `public/images/` and served statically.
- **Interactive Docs (Swagger):** Start the server and head to `http://localhost:8081/api` to interact with the API endpoints. You can authenticate using a Bearer JWT token directly in the Swagger UI.

---

## 🔒 License

This project is currently marked as `UNLICENSED` and is private.
