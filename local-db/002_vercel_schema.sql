-- Isolated schema for the existing local API data model. Review before applying.
BEGIN;
CREATE SCHEMA IF NOT EXISTS yp;
SET LOCAL search_path TO yp, public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TABLE restaurants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL);
CREATE TABLE agreements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id),company_id uuid NOT NULL REFERENCES companies(id),payment_model text NOT NULL CHECK(payment_model IN ('prepaid','postpaid')),active boolean NOT NULL DEFAULT true,UNIQUE(restaurant_id,company_id));
CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),name text NOT NULL,active boolean NOT NULL DEFAULT true);
CREATE TABLE meal_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agreement_id uuid NOT NULL REFERENCES agreements(id),name text NOT NULL,price_kurus bigint NOT NULL CHECK(price_kurus>=0));
CREATE TABLE entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employees(id),category_id uuid NOT NULL REFERENCES meal_categories(id),valid_from date NOT NULL,valid_until date NOT NULL,granted integer NOT NULL CHECK(granted>=0),used integer NOT NULL DEFAULT 0 CHECK(used>=0 AND used<=granted),CHECK(valid_until>=valid_from));
CREATE TABLE qr_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text NOT NULL UNIQUE,kind text NOT NULL CHECK(kind IN ('employee','restaurant')),employee_id uuid REFERENCES employees(id),restaurant_id uuid REFERENCES restaurants(id),category_id uuid REFERENCES meal_categories(id),expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE redemptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entitlement_id uuid NOT NULL REFERENCES entitlements(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),amount_kurus bigint NOT NULL CHECK(amount_kurus>=0),idempotency_key uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),reversed_at timestamptz);
CREATE TABLE ledger_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agreement_id uuid NOT NULL REFERENCES agreements(id),redemption_id uuid REFERENCES redemptions(id),entry_type text NOT NULL CHECK(entry_type IN ('consumption','advance','allocation','collection','reversal')),amount_kurus bigint NOT NULL CHECK(amount_kurus>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON entitlements(employee_id,category_id);
CREATE INDEX ON redemptions(restaurant_id,created_at);
CREATE INDEX ON ledger_entries(agreement_id,created_at);
COMMIT;
