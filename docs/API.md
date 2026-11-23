# API Contract — Clinic Expense Manager

Base URL: `/api`. JSON unless stated. Money values are **strings with 2 decimals** (e.g. `"1210.00"`).
Dates are `YYYY-MM-DD`.

## Authentication
Session = JWT in the `httpOnly` cookie `ce_session` (7 h, `SameSite=Strict`). Every route except
`/health`, `/auth/login`, `/auth/logout` returns `401` without a valid session.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ user, expiresInHours }` + cookie. Rate-limited 10 / 15 min |
| POST | `/auth/logout` | – | `{ ok: true }`, clears cookie |
| GET | `/auth/me` | – | `{ user: { id, email, full_name } }` |
| GET | `/meta` | – | `{ billTypes:[{code,label}], ivaRates:[0,4,5,10,21], maxUploadMb, allowedExtensions }` |

## Clinics (user scope)
| Method | Path | Body |
|---|---|---|
| GET | `/clinics` | → `[{ id, name, tax_id_cif, address, color, currency, document_count }]` |
| POST | `/clinics` | `{ name, tax_id_cif?, address?, color? }` → creates clinic + default folders |
| PATCH | `/clinics/:id` | partial of the above |

## Clinic scope — header `X-Clinic-Id: <uuid>` REQUIRED
A clinic not owned by the user → `404`. Resources of other clinics → `404`.

### Folders
| Method | Path | Notes |
|---|---|---|
| GET | `/folders` | `[{ id, name, color, default_bill_type, is_system_payroll, document_count, total_amount, last_document_date }]` |
| POST | `/folders` | `{ name, color?, default_bill_type? }` |
| GET/PATCH/DELETE | `/folders/:id` | DELETE only when empty and not the system *Nóminas* folder (`409` / `400`) |

### Documents (receipts / invoices / accounts)
| Method | Path | Notes |
|---|---|---|
| GET | `/documents` | Query: `q, from, to, month (YYYY-MM), type (CSV of codes), folderId, sort (date_desc\|date_asc\|total_desc\|total_asc\|name_asc), page, limit≤500` → `{ items, totals:{base_amount,tax_iva_amount,total_amount}, pagination:{page,limit,total,pages}, appliedFilters }` |
| POST | `/documents` | `multipart/form-data`: `file` (pdf/jpg/png/webp/heic ≤ MAX_UPLOAD_MB) + `folder_id, name, vendor_name?, invoice_number?, bill_type, document_date, tax_iva_rate, base_amount?, tax_iva_amount?, total_amount?, notes?` |
| GET | `/documents/:id` | document (no storage path) |
| PATCH | `/documents/:id` | multipart or JSON; any field; optional `file` replaces the attachment. `NOMINA` docs → `400` (edit in Nóminas) |
| DELETE | `/documents/:id` | removes row + file (`204`) |
| GET | `/documents/:id/file` | streams file; `?download=1` for attachment |

Accounting validation: `base + iva = total` (exact), `iva ≈ base × rate` (±0.01), rate ∈ {0,4,5,10,21}.
Send any two amounts and the server computes the third.

### Workers & Nóminas
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/workers` | `{ full_name, dni_nie?, role_title?, is_active? }` |
| PATCH/DELETE | `/workers/:id` | DELETE refused when the worker has nóminas (deactivate instead) |
| GET | `/nominas?year=&workerId=` | `{ items, totals }` |
| POST | `/nominas` | multipart: `file, worker_id, period_year, period_month, gross_salary, irpf_withholding?, social_security_worker?, social_security_company?, net_salary?, notes?` — creates a `NOMINA` document (IVA 0, total = gross + SS company) in the *Nóminas* folder |
| PATCH/DELETE | `/nominas/:id` | keeps document in sync; DELETE removes document + file |

Rules: `net = gross − IRPF − SS worker`; `company cost = gross + SS company`; one nómina per worker/month.

### Dashboard & Reports
| Method | Path | Response |
|---|---|---|
| GET | `/dashboard?year=` or `?from=&to=` | `{ period, kpis:{document_count,base_amount,tax_iva_amount,total_amount,nominas_amount,operating_amount}, monthly:[{month,count,base_amount,tax_iva_amount,total_amount}], byType:[…], byFolder:[…], recent:[…] }` |
| GET | `/reports/iva?year=` | `{ quarters:[1..4], byQuarterAndRate:[…], total }` (nóminas excluded) |
| GET | `/reports/spend?year=` | `{ byMonth[12], byType, byFolder, matrix:[{month,bill_type,total_amount}], payroll, total, previousYearTotal }` |

### Errors
`{ error: "message", details?: [{ field, message }] }` with status 400/401/404/409/413/415/429/500.
