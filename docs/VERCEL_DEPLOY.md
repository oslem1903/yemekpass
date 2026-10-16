# YemekPASS Vercel deployment

This branch is a migration candidate, not yet production-ready. Never put credentials in GitHub or the frontend.

1. Set Production environment variables: `DATABASE_URL` (Supabase transaction pooler PostgreSQL URI, not direct IPv6 host), `YEMEKPASS_ADMIN_PASSWORD` (at least 16 characters), `YEMEKPASS_SESSION_SECRET` and `YEMEKPASS_QR_SECRET` (two distinct stable random strings, each at least 32 characters).
2. Run `local-db/002_vercel_schema.sql` **once** in the intended Supabase project SQL editor after reviewing it. It creates a separate `yp` schema and does not migrate local Docker data.
3. Set Vercel's build command to `npm run build`, output directory `dist`, then redeploy.
4. Check `/api/health` for JSON and `/api/session` for JSON, then test login and QR using non-production sample data.

**Important:** The original local Docker data is not automatically copied to Supabase. Supabase's existing `public` foundation schema has different column names and must not be used for this API. The new `yp` schema is intentionally isolated. This branch does not implement production-grade login rate limiting, account/role separation, or revocable sessions. Do not expose it to real customers before those controls are implemented and tested.
