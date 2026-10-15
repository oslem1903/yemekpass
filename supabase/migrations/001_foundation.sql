-- FOUNDATION ONLY. No QR redemption or payment posting until secure transactional RPCs exist.
create extension if not exists pgcrypto;
create table public.restaurants (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.restaurant_members (restaurant_id uuid not null references public.restaurants(id), user_id uuid not null references auth.users(id), role text not null check(role in ('owner','manager','cashier')), primary key(restaurant_id,user_id));
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null);
create table public.agreements (id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id), company_id uuid not null references public.companies(id), payment_model text not null check(payment_model in ('prepaid','postpaid')), active boolean not null default true, unique(restaurant_id,company_id));
create table public.employees (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), display_name text not null, user_id uuid references auth.users(id), active boolean not null default true);
create table public.meal_categories (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id), label text not null, price_kurus bigint not null check(price_kurus>=0));
create table public.meal_entitlements (id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id), category_id uuid not null references public.meal_categories(id), valid_from date not null, valid_until date not null, granted_count integer not null check(granted_count>=0), used_count integer not null default 0 check(used_count>=0 and used_count<=granted_count));
create table public.meal_redemptions (id uuid primary key default gen_random_uuid(), entitlement_id uuid not null references public.meal_entitlements(id), restaurant_id uuid not null references public.restaurants(id), amount_kurus bigint not null check(amount_kurus>=0), occurred_at timestamptz not null default now(), reversed_at timestamptz);
create table public.ledger_entries (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id), redemption_id uuid references public.meal_redemptions(id), kind text not null check(kind in ('consumption','advance_received','advance_applied','payment_received','reversal')), amount_kurus bigint not null check(amount_kurus>0), created_at timestamptz not null default now());
-- Fail closed: authenticated users have no direct table access until per-role policies and RPCs are installed.
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.companies enable row level security;
alter table public.agreements enable row level security;
alter table public.employees enable row level security;
alter table public.meal_categories enable row level security;
alter table public.meal_entitlements enable row level security;
alter table public.meal_redemptions enable row level security;
alter table public.ledger_entries enable row level security;