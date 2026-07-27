-- ═══════════════════════════════════════════════════════════════════════
-- 006 · Pin search_path on every function
--
-- A mutable search_path lets a caller shadow the objects a function
-- resolves. These functions enforce invoice immutability and gap-free
-- numbering, so this is not cosmetic. Flagged WARN by the Supabase linter.
-- ═══════════════════════════════════════════════════════════════════════
alter function set_updated_at()                     set search_path = public, pg_temp;
alter function next_job_number(uuid)                set search_path = public, pg_temp;
alter function jobs_assign_number()                 set search_path = public, pg_temp;
alter function recalc_quote_totals()                set search_path = public, pg_temp;
alter function next_invoice_number(uuid, int)       set search_path = public, pg_temp;
alter function invoices_assign_number()             set search_path = public, pg_temp;
alter function invoices_enforce_immutability()      set search_path = public, pg_temp;
alter function invoice_lines_enforce_immutability() set search_path = public, pg_temp;
alter function recalc_invoice_payments()            set search_path = public, pg_temp;
