-- YemekPASS feature foundation, apply only to isolated yp schema after review.
BEGIN;
CREATE TABLE IF NOT EXISTS yp.portal_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 role text NOT NULL CHECK (role IN ('company','restaurant','employee')),
 company_id uuid REFERENCES yp.companies(id),
 restaurant_id uuid REFERENCES yp.restaurants(id),
 employee_id uuid REFERENCES yp.employees(id),
 token_hash text NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((role='company' AND company_id IS NOT NULL AND restaurant_id IS NULL AND employee_id IS NULL)
 OR (role='restaurant' AND restaurant_id IS NOT NULL AND company_id IS NULL AND employee_id IS NULL)
 OR (role='employee' AND employee_id IS NOT NULL AND company_id IS NULL AND restaurant_id IS NULL))
);
CREATE TABLE IF NOT EXISTS yp.meal_policies (
 agreement_id uuid PRIMARY KEY REFERENCES yp.agreements(id),
 daily_limit integer NOT NULL DEFAULT 1 CHECK(daily_limit BETWEEN 1 AND 10),
 start_time time NOT NULL DEFAULT '00:00',
 end_time time NOT NULL DEFAULT '23:59:59',
 weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],
 CHECK (start_time < end_time),
 CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::integer[])
);
CREATE TABLE IF NOT EXISTS yp.reversal_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 redemption_id uuid NOT NULL UNIQUE REFERENCES yp.redemptions(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 reversed_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_accounts_company_idx ON yp.portal_accounts(company_id);
CREATE INDEX IF NOT EXISTS portal_accounts_restaurant_idx ON yp.portal_accounts(restaurant_id);
CREATE INDEX IF NOT EXISTS portal_accounts_employee_idx ON yp.portal_accounts(employee_id);
COMMIT;
