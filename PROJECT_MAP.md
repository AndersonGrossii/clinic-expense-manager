# PROJECT_MAP.md — Multi-Clinic Expense Manager Roadmap

Status legend:
- **Ready** — Defined and ready to execute.
- **Working on it** — Actively being implemented/verified.
- **Complete** — Implemented and verified against acceptance gates.

---

## Phase 0 — Architecture, Governance & Security Hygiene
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| System architecture & multi-clinic isolation spec | 1 - Orchestrator | [docs/API.md](docs/API.md), `AGENTS.md` (git-ignored) | **Complete** |
| Git & Docker ignore rules for `.env`, `AGENTS.md`, secrets, `storage/` | 1 - Orchestrator | [.gitignore](.gitignore), [.dockerignore](.dockerignore) | **Complete** |
| Environment configuration template (zero hardcoded secrets) | 4 - Server & Middlewares | [.env.example](.env.example), [server/config/env.js](server/config/env.js) | **Complete** |

## Phase 1 — Database & Container Infrastructure
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| PostgreSQL 16 schema (`users`, `clinics`, `folders`, `documents`, `workers`, `nominas`) | 5 - Database Architect | [database/migrations/001_init.sql](database/migrations/001_init.sql) | **Complete** |
| Composite FK tenant isolation & `NUMERIC(12,2)` CHECK constraints | 5 - Database Architect | [database/migrations/001_init.sql](database/migrations/001_init.sql) | **Complete** |
| Full-text trigram search (`pg_trgm`) & clinic/date/type indexes | 5 - Database Architect | [database/migrations/001_init.sql](database/migrations/001_init.sql) | **Complete** |
| Connection pool & transaction helper (`DATE` as `YYYY-MM-DD`, `NUMERIC` preserved) | 5 - Database Architect | [database/db.js](database/db.js) | **Complete** |
| Idempotent migration runner & env-driven user bootstrap (`7h` auth ready) | 5 - Database Architect | [scripts/migrate.js](scripts/migrate.js), [scripts/create-user.js](scripts/create-user.js) | **Complete** |
| Multi-environment Dockerfile & Docker Compose (`db` + `app` + volumes) | 5 - Database Architect | [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml) | **Complete** |

## Phase 2 — Server, Auth, Middlewares & Validators
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| Express app with strict Helmet CSP, JSON limit, cookie parser | 4 - Server & Middlewares | [server/app.js](server/app.js), [server/index.js](server/index.js) | **Complete** |
| Auth controller & middleware (`bcrypt`, HS256 JWT, 7h `httpOnly` cookie, rate limiter) | 4 - Server & Middlewares | [server/controllers/auth.controller.js](server/controllers/auth.controller.js), [server/middlewares/auth.middleware.js](server/middlewares/auth.middleware.js) | **Complete** |
| Strict `X-Clinic-Id` ownership guard & UUID param validation | 4 - Server & Middlewares | [server/middlewares/clinic.middleware.js](server/middlewares/clinic.middleware.js) | **Complete** |
| Partitioned clinic file storage + path-traversal guard | 4 - Server & Middlewares | [server/config/storage.js](server/config/storage.js) | **Complete** |
| Multer upload middleware + real magic-byte MIME verification (PDF/JPG/PNG/WEBP/HEIC) | 4 - Server & Middlewares | [server/middlewares/upload.middleware.js](server/middlewares/upload.middleware.js) | **Complete** |
| Zod schemas & edge-case query/patch normalization | 4 - Server & Middlewares | [server/validators/index.js](server/validators/index.js) | **Complete** |

## Phase 3 — Backend Business Logic & Accountant Engine
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| Integer-cent money math, IVA reconciliation (`±0.01`), Payroll math | 7 - Accountant | [server/utils/money.js](server/utils/money.js), [server/utils/constants.js](server/utils/constants.js) | **Complete** |
| Clinic service + automatic default folders seeding (`Facturas Agua`, `Facturas Compras`, `Nóminas`, `Gastos Generales`) | 3 - Backend Builder | [server/services/clinic.service.js](server/services/clinic.service.js) | **Complete** |
| Custom Folder CRUD service (protects system payroll folder) | 3 - Backend Builder | [server/services/folder.service.js](server/services/folder.service.js) | **Complete** |
| Document upload, search, edit, file replacement & safe disk delete | 3 - Backend Builder | [server/services/document.service.js](server/services/document.service.js) | **Complete** |
| Workers & Nóminas atomic transaction (0% IVA document sync in `Nóminas`) | 3 - Backend Builder | [server/services/payroll.service.js](server/services/payroll.service.js) | **Complete** |
| Dashboard KPI/chart aggregations & IVA/Spend report queries | 3 - Backend Builder & 7 - Accountant | [server/services/report.service.js](server/services/report.service.js) | **Complete** |
| REST API router & controller + authenticated file streaming endpoint | 3 - Backend Builder | [server/controllers/api.controller.js](server/controllers/api.controller.js), [server/routes/api.routes.js](server/routes/api.routes.js) | **Complete** |

## Phase 4 — Vanilla JavaScript / HTML5 / CSS3 Frontend
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| Design tokens, responsive grid layout & print stylesheet | 2 - Frontend Builder | [public/css/variables.css](public/css/variables.css), [public/css/layout.css](public/css/layout.css), [public/css/components.css](public/css/components.css) | **Complete** |
| Authentication login screen (no hardcoded credentials) | 2 - Frontend Builder | [public/login.html](public/login.html), [public/js/login.js](public/js/login.js) | **Complete** |
| App shell, clinic switcher, state store & authenticated Blob API client | 2 - Frontend Builder | [public/index.html](public/index.html), [public/js/app.js](public/js/app.js), [public/js/state.js](public/js/state.js), [public/js/api.js](public/js/api.js), [public/js/ui.js](public/js/ui.js) | **Complete** |
| Interactive clickable SVG charts (Monthly Base/IVA, Type Donut, Folder Bars) | 2 - Frontend Builder | [public/js/charts.js](public/js/charts.js) | **Complete** |
| Modals: Clinic create/edit, Document upload/edit with live IVA calc, Inline file viewer | 2 - Frontend Builder | [public/js/modals/clinicModal.js](public/js/modals/clinicModal.js), [public/js/modals/documentModal.js](public/js/modals/documentModal.js), [public/js/modals/fileViewerModal.js](public/js/modals/fileViewerModal.js) | **Complete** |
| Dashboard view with period presets & click-to-drill-down navigation | 2 - Frontend Builder | [public/js/views/dashboardView.js](public/js/views/dashboardView.js) | **Complete** |
| Custom Folders grid + Folder detail (Table & Gallery with authenticated thumbnails) | 2 - Frontend Builder | [public/js/views/foldersView.js](public/js/views/foldersView.js) | **Complete** |
| Advanced Search view (name, date range, presets, type, folder, CSV export) | 2 - Frontend Builder | [public/js/views/searchView.js](public/js/views/searchView.js) | **Complete** |
| Workers & Nóminas upload/edit/delete module | 2 - Frontend Builder | [public/js/views/nominasView.js](public/js/views/nominasView.js) | **Complete** |
| Financial & Quarterly IVA Reports view (UTF-8 CSV exports & Print PDF) | 2 - Frontend Builder | [public/js/views/reportsView.js](public/js/views/reportsView.js) | **Complete** |

## Phase 5 — QA & Accountant Verification
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| Accountant unit tests (cent precision, IVA rules, payroll math) | 6 - QA & 7 - Accountant | [test/unit.test.js](test/unit.test.js) | **Complete** |
| Validator, magic-byte upload & storage path isolation unit tests | 6 - QA - Tester | [test/unit.test.js](test/unit.test.js) | **Complete** |
| End-to-end DB integration suite (Auth, Clinic A/B isolation, CRUD, Reconciliation) | 6 - QA & 7 - Accountant | [test/integration.test.js](test/integration.test.js) | **Complete** *(auto-runs when Postgres is running)* |
| Live `docker compose up -d --build` + live PostgreSQL E2E run | 6 - QA & 1 - Orchestrator | Local Docker Desktop / Railway | **Ready** *(start Docker Desktop engine & run `docker compose up -d --build`)* |

## Phase 6 — Documentation & Handover
| Task | Owner | Deliverable / Path | Status |
|---|---|---|---|
| Setup, Docker Compose, Railway deployment & security documentation | 1 - Orchestrator | [README.md](README.md) | **Complete** |
| Complete phase & ownership tracker (`Ready` / `Working on it` / `Complete`) | 1 - Orchestrator | [PROJECT_MAP.md](PROJECT_MAP.md) | **Complete** |
