-- 001_init.sql — Core schema for Clinic Expense Manager
-- Money: NUMERIC(12,2). Isolation: clinic_id + composite FKs.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS clinics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    tax_id_cif    VARCHAR(50),
    address       TEXT,
    color         VARCHAR(7) NOT NULL DEFAULT '#0EA5E9',
    currency      CHAR(3) NOT NULL DEFAULT 'EUR',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_clinics_owner ON clinics (owner_user_id);

CREATE TABLE IF NOT EXISTS folders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name              VARCHAR(120) NOT NULL,
    color             VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    default_bill_type VARCHAR(40),
    is_system_payroll BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, clinic_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_clinic_name ON folders (clinic_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_one_payroll ON folders (clinic_id) WHERE is_system_payroll;

CREATE TABLE IF NOT EXISTS documents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id          UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    folder_id          UUID NOT NULL,
    name               VARCHAR(255) NOT NULL,
    vendor_name        VARCHAR(200),
    invoice_number     VARCHAR(100),
    bill_type          VARCHAR(40) NOT NULL,
    document_date      DATE NOT NULL,
    base_amount        NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
    tax_iva_rate       NUMERIC(5,2)  NOT NULL DEFAULT 21.00 CHECK (tax_iva_rate >= 0 AND tax_iva_rate <= 100),
    tax_iva_amount     NUMERIC(12,2) NOT NULL CHECK (tax_iva_amount >= 0),
    total_amount       NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    file_path          TEXT NOT NULL,
    file_original_name VARCHAR(255) NOT NULL,
    file_mime_type     VARCHAR(100) NOT NULL,
    file_size_bytes    BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    notes              TEXT,
    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, clinic_id),
    CONSTRAINT fk_documents_folder_same_clinic
        FOREIGN KEY (folder_id, clinic_id) REFERENCES folders(id, clinic_id) ON DELETE RESTRICT,
    CONSTRAINT ck_documents_total CHECK (total_amount = base_amount + tax_iva_amount)
);
CREATE INDEX IF NOT EXISTS ix_documents_clinic_date   ON documents (clinic_id, document_date DESC);
CREATE INDEX IF NOT EXISTS ix_documents_clinic_type   ON documents (clinic_id, bill_type);
CREATE INDEX IF NOT EXISTS ix_documents_clinic_folder ON documents (clinic_id, folder_id);
CREATE INDEX IF NOT EXISTS ix_documents_search_trgm
    ON documents USING GIN ((name || ' ' || COALESCE(vendor_name, '') || ' ' || COALESCE(invoice_number, '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS workers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    full_name  VARCHAR(150) NOT NULL,
    dni_nie    VARCHAR(30),
    role_title VARCHAR(100),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, clinic_id)
);
CREATE INDEX IF NOT EXISTS ix_workers_clinic ON workers (clinic_id);

CREATE TABLE IF NOT EXISTS nominas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id               UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    worker_id               UUID NOT NULL,
    document_id             UUID NOT NULL UNIQUE,
    period_year             SMALLINT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    period_month            SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    gross_salary            NUMERIC(12,2) NOT NULL CHECK (gross_salary >= 0),
    irpf_withholding        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (irpf_withholding >= 0),
    social_security_worker  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (social_security_worker >= 0),
    social_security_company NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (social_security_company >= 0),
    net_salary              NUMERIC(12,2) NOT NULL CHECK (net_salary >= 0),
    total_company_cost      NUMERIC(12,2) NOT NULL CHECK (total_company_cost >= 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clinic_id, worker_id, period_year, period_month),
    CONSTRAINT fk_nominas_worker_same_clinic
        FOREIGN KEY (worker_id, clinic_id) REFERENCES workers(id, clinic_id) ON DELETE RESTRICT,
    CONSTRAINT fk_nominas_document_same_clinic
        FOREIGN KEY (document_id, clinic_id) REFERENCES documents(id, clinic_id) ON DELETE CASCADE,
    CONSTRAINT ck_nominas_net CHECK (net_salary = gross_salary - irpf_withholding - social_security_worker),
    CONSTRAINT ck_nominas_cost CHECK (total_company_cost = gross_salary + social_security_company)
);
CREATE INDEX IF NOT EXISTS ix_nominas_clinic_period ON nominas (clinic_id, period_year DESC, period_month DESC);
