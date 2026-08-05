-- A document-level discount on the invoice.
--
-- `quotes` has carried `discount_pct` since it was written; `invoices` never
-- did. So a quote offered at 10 % off was accepted, the draft invoice
-- inherited every line — including each line's own discount — and then billed
-- the undiscounted total. On a 600.00 offer the customer received an invoice
-- for 720.00 instead of 648.00: the whole discount, silently.
--
-- Worse than the number: `accept()` writes the discounted figure to
-- `jobs.contract_amount`, so the invoice exceeded the contract it came from
-- with nothing anywhere to say so.
alter table invoices
  add column if not exists discount_pct numeric(5,2) not null default 0;

comment on column invoices.discount_pct is
  'Document-level discount, applied to the sum of the line nets at issue(). '
  'Line-level discounts live on invoice_lines.discount_pct and are applied '
  'first; the two compound, exactly as they do on a quote.';
