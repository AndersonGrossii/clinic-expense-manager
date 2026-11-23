# ClínicaFin — Multi-Clinic Expense, Receipt & Payroll Manager

Web application for managing receipts, invoices, accounts, and worker payrolls (**nóminas**) across multiple independent clinics. Every document, folder, worker, chart, and physical file is strictly isolated per clinic (`X-Clinic-Id` + PostgreSQL composite foreign keys).

---

## Key Features

1. **Multi-Clinic Switching & Strict Isolation**
   - Switch between clinics from the header dropdown at any time.
   - Clinics created by a user are isolated at both API middleware (`requireClinic`) and PostgreSQL schema level (`composite FKs` + `clinic_id`), and files live in separate directories (`storage/clinic_<uuid>/...`).
   - Creating a new clinic automatically seeds 4 default folders: **Facturas Agua**, **Facturas Compras**, **Nóminas**, and **Gastos Generales**.
2. **Document Upload (Photos & PDF) + Financial Metadata**
   - Drag-and-drop upload for `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif` with magic-byte content verification.
   - Captures name/concept, supplier, invoice number, bill type, document date, base amount, IVA rate (`0%`, `4%`, `5%`, `10%`, `21%`), IVA amount, and total paid with exact integer-cent validation.
3. **Edit & Safe Delete**
   - Edit metadata, move documents between folders, replace attached files, or safely delete records (removes both database row and disk file).
4. **Custom Folder Organization**
   - Create, edit, and organize custom folders (with custom colors and default bill types), view contents in **Table** or **Gallery** mode, and preview images/PDFs inline.
5. **Interactive Drill-Down Dashboard**
   - KPI cards (*Total pagado*, *Base imponible*, *IVA pagado*, *Coste en nóminas*), stacked monthly *Base vs. IVA* SVG chart, *Gastos por tipo* donut chart, and *Gastos por carpeta* bars.
   - Clicking any KPI, month bar, type slice, or folder bar navigates directly to the filtered documents or report.
6. **Advanced Search & Filtering**
   - Filter by document name / supplier / invoice number, date range (with quick month/quarter/year presets), bill type, and folder, with live SQL totals and CSV export.
7. **Workers & Payroll (`Nóminas`) Module**
   - Manage clinic workers and upload monthly payroll files (`Bruto`, `IRPF`, `SS Trabajador`, `SS Empresa`, auto-computed `Neto` and `Coste total clínica`).
   - Automatically archives a `0% IVA` document into the clinic's **Nóminas** folder so total spend stays accurate without distorting deductible IVA.
8. **Financial & Tax Reports**
   - Annual and quarterly **IVA Soportado** breakdown (by quarter and tax rate), 12-month spend matrix, category/folder breakdown, payroll summary, UTF-8 CSV export, and printable PDF layout.

---

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6 Modules), Semantic HTML5, Modern CSS3, Interactive SVG Charts (zero CDN / strict CSP `default-src 'self'`).
- **Backend:** Node.js 22 (ESM), Express.js, `zod` validation, `multer` + magic-byte inspection.
- **Auth & Security:** `bcrypt` password hashing, `jsonwebtoken` HS256 in `httpOnly` + `SameSite=Strict` cookies (7 hours), `helmet`, rate limiting.
- **Database:** PostgreSQL 16 (`NUMERIC(12,2)` money precision, `pg_trgm` full-text search).
- **Containerization:** Docker + `docker-compose.yml` (ready for local stack and Railway deployments).

---

## Quick Start with Docker Compose (Recommended)

1. **Create your local `.env` from `.env.example`:**
   ```bash
   cp .env.example .env
   ```
2. **Edit `.env`** with strong random values for `POSTGRES_PASSWORD` and `JWT_SECRET` (at least 32 chars), and set `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `SEED_USER_NAME`, and `SEED_CLINIC_NAME` for the initial clinic owner account.
3. **Start PostgreSQL + App (auto-migrates DB and creates the initial user on startup):**
   ```bash
   docker compose up -d --build
   ```
4. Open `http://localhost:3000` (port controlled by `APP_PORT` in `.env`) and sign in with the credentials configured in your `.env`.

> **Note for local plain-HTTP Docker:** `docker-compose.yml` defaults `COOKIE_SECURE=false` so the 7-hour `httpOnly` session cookie works over `http://localhost:3000`. Behind HTTPS (such as Railway or a reverse proxy), set `COOKIE_SECURE=true`.

---

## Local Development (Without App Container)

Start only the PostgreSQL container (or point `DATABASE_URL` in `.env` to your Postgres instance):

```bash
docker compose up -d db
npm install          # Windows PowerShell with Git Bash missing sed: npm install --script-shell=cmd.exe
npm run bootstrap    # Runs SQL migrations and creates the initial user from .env
npm run dev          # Starts Express server with --watch on http://localhost:3000
```

### Running Tests

```bash
npm test
```
- `test/unit.test.js` validates integer-cent accounting math, IVA/payroll reconciliation, schema validators, magic-byte file verification, and clinic storage path isolation (no DB required).
- `test/integration.test.js` runs full end-to-end HTTP tests against PostgreSQL (automatically skips with instructions if PostgreSQL is not reachable).

---

## Deploying to Railway

This project works out of the box on Railway using the included `Dockerfile`:

1. Create a new Railway project and attach a **PostgreSQL** service (Railway automatically injects `DATABASE_URL`).
2. Add the Node service from this repository and configure **Variables**:
   - `NODE_ENV=production`
   - `JWT_SECRET=<random-64-hex-string>`
   - `SESSION_HOURS=7`
   - `PGSSL=true` (if using Railway's SSL-enabled Postgres URL)
   - `COOKIE_SECURE=true`
   - `STORAGE_DIR=/app/storage`
   - `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `SEED_USER_NAME`, `SEED_CLINIC_NAME`
3. Attach a **Railway Persistent Volume** mounted at `/app/storage` so uploaded receipts/PDFs survive deployments and restarts.
4. Deploy — the container runs `npm run start:prod` (`migrate` -> `create-user` -> `server/index.js`).

> **Multi-environment tip:** Because secrets and initial credentials live strictly in environment variables (never hardcoded), you can duplicate your Railway environment (e.g., staging vs. production) by setting separate variables and volumes per environment.

---

## Security & Secrets Hygiene

- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `AGENTS.md`, `storage/`, `uploads/`, keys/certificates, and DB dumps.
- **Zero hardcoded credentials** in source code, Dockerfiles, or frontend assets.
- Uploaded files are stored outside `public/` and streamed exclusively through `GET /api/documents/:id/file` after verifying session cookie + clinic ownership.

See [docs/API.md](docs/API.md) for the complete REST API contract and [PROJECT_MAP.md](PROJECT_MAP.md) for the phase-by-phase build map.
