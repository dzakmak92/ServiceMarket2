-- ═══════════════════════════════════════════════════════════════════════
-- Compliance regression suite for the Postgres schema.
--
-- Run against a scratch database after any migration:
--     psql "$DATABASE_URL" -f backend/db/tests/compliance_checks.sql
--
-- Every check here corresponds to a legal requirement or to a defect the
-- MongoDB build actually shipped. They are not stylistic.
--
-- Destructive: truncates the tables it touches. Never run against prod.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists _test_results (seq serial, check_name text, passed boolean, detail text);
truncate _test_results;

alter table invoices      disable trigger invoices_immutable;
alter table invoice_lines disable trigger invoice_lines_immutable;
delete from invoice_payments; delete from invoice_lines; delete from invoices;
delete from quote_lines; delete from quotes;
alter table invoices      enable trigger invoices_immutable;
alter table invoice_lines enable trigger invoice_lines_immutable;
delete from job_documents; delete from job_time_logs; delete from job_diary;
delete from job_materials; delete from job_tasks; delete from change_orders;
delete from jobs; delete from customers; delete from pro_profiles; delete from users;
delete from number_counters;

insert into users (id, email, password_hash, name, role, country)
values ('11111111-1111-1111-1111-111111111111','maler@test.at','x','Anna Weber','tradesperson','AT');
insert into pro_profiles (id, user_id, business_name, invoice_country, bank_iban)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',
        'Weber Malerei GmbH','AT','AT611904300234573201');
insert into customers (id, pro_id, type, name, city)
values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',
        'private','Herr Gruber','Wien');
insert into jobs (id, pro_id, customer_id, mode, title, source, site_city)
values ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333','simple','Wohnung streichen 60 m2','myhammer','Wien');

do $$
declare
  pro uuid := '22222222-2222-2222-2222-222222222222';
  cust uuid := '33333333-3333-3333-3333-333333333333';
  job uuid := '44444444-4444-4444-4444-444444444444';
  n1 text; n2 text; n3 text; inv uuid; q uuid; qb uuid; qg uuid := gen_random_uuid();
  v_net numeric; v_vat numeric; v_labor numeric; v_material numeric;
  v_state payment_state; v_out numeric; failed boolean;
begin
  -- ── GoBD/RKSV: gap-free numbering ──────────────────────────────────
  insert into invoices (pro_id, job_id, customer_id, status, issue_date, service_date_start, due_date, gross_total)
  values (pro, job, cust, 'issued', current_date, current_date, current_date + 14, 100)
  returning invoice_number into n1;
  insert into _test_results(check_name, passed, detail)
  values ('first invoice numbered', n1 = 'RG-' || extract(year from current_date)::int || '-0001', n1);

  -- Simulate a crash between allocating the number and writing the row.
  begin
    insert into invoices (pro_id, job_id, customer_id, status, issue_date, service_date_start, gross_total)
    values (pro, job, cust, 'issued', current_date, current_date, 999)
    returning invoice_number into n2;
    raise exception 'simulated crash after numbering';
  exception when others then null;
  end;

  insert into invoices (pro_id, job_id, customer_id, status, issue_date, service_date_start, gross_total)
  values (pro, job, cust, 'issued', current_date, current_date, 200)
  returning id, invoice_number into inv, n3;
  insert into _test_results(check_name, passed, detail)
  values ('GAP-FREE: rolled-back number is reused', n3 = n2,
          format('rolled back %s, next issued %s', n2, n3));

  -- ── GoBD/RKSV: immutability ────────────────────────────────────────
  failed := false;
  begin update invoices set gross_total = 1 where id = inv;
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('issued: UPDATE of total rejected', failed, null);

  failed := false;
  begin delete from invoices where id = inv;
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('issued: DELETE rejected', failed, null);

  failed := false;
  begin update invoices set status='delivered', delivered_at=now() where id = inv;
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('issued: delivery state still mutable', not failed, null);

  failed := false;
  begin
    insert into invoices (id, pro_id, job_id, customer_id, status, gross_total)
    values ('55555555-5555-5555-5555-555555555555', pro, job, cust, 'draft', 50);
    update invoices set gross_total = 75 where id='55555555-5555-5555-5555-555555555555';
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('draft remains editable', not failed, null);

  failed := false;
  begin
    insert into invoice_lines (invoice_id, description, qty, unit_price)
    values (inv, 'sneaky extra', 1, 10);
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('cannot add a line to an issued invoice', failed, null);

  -- ── §11/§14 UStG: Leistungszeitpunkt mandatory ─────────────────────
  failed := false;
  begin
    insert into invoices (pro_id, job_id, customer_id, status, issue_date, gross_total)
    values (pro, job, cust, 'issued', current_date, 10);
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('issued without Leistungszeitpunkt rejected', failed, null);

  -- ── Mixed tax treatment + §35a split ───────────────────────────────
  insert into invoices (pro_id, job_id, customer_id, status, gross_total)
  values (pro, job, cust, 'draft', 0) returning id into inv;
  insert into invoice_lines (invoice_id, position, kind, description, qty, unit, unit_price, tax_treatment, vat_rate) values
    (inv, 1, 'labor',    'Malerarbeiten 60 m2',       60, 'm2',  12.00, 'standard', 20),
    (inv, 2, 'material', 'Dispersionsfarbe 20 L',      2, 'pcs', 45.00, 'standard', 20),
    (inv, 3, 'travel',   'Anfahrtspauschale',          1, 'pcs', 35.00, 'standard', 20),
    (inv, 4, 'material', 'Fachbuch Farbmischung',      1, 'pcs', 30.00, 'reduced',  10),
    (inv, 5, 'labor',    'Bauleistung an Bautraeger',  1, 'pcs', 500.00,'reverse_charge_13b', 0);

  select sum(net_amount), sum(vat_amount),
         sum(net_amount) filter (where kind='labor'),
         sum(net_amount) filter (where kind='material')
    into v_net, v_vat, v_labor, v_material from invoice_lines where invoice_id = inv;

  insert into _test_results(check_name, passed, detail)
  values ('per-position net sums correctly', v_net = 1375.00, v_net::text);
  insert into _test_results(check_name, passed, detail)
  values ('per-position VAT: 20% + 10% + reverse-charge 0% coexist', v_vat = 172.00, v_vat::text);
  insert into _test_results(check_name, passed, detail)
  values ('S35a labor/material split available', v_labor = 1220.00 and v_material = 120.00,
          format('labor %s / material %s', v_labor, v_material));

  update invoices set labor_net=v_labor, material_net=v_material,
    net_total=v_net, vat_total=v_vat, gross_total=v_net+v_vat, has_reverse_charge=true,
    status='issued', issue_date=current_date, service_date_start=current_date,
    due_date=current_date+14 where id = inv;

  -- ── Payment rollup, incl. the Austrian cash Beleg ──────────────────
  insert into invoice_payments (invoice_id, amount, method) values (inv, 500.00, 'transfer');
  select payment_state, outstanding into v_state, v_out from invoices where id = inv;
  insert into _test_results(check_name, passed, detail)
  values ('partial payment sets state + outstanding',
          v_state='partial' and v_out = 1047.00, format('%s, outstanding %s', v_state, v_out));

  insert into invoice_payments (invoice_id, amount, method, beleg_ref)
  values (inv, 1047.00, 'cash', 'BELEG-2026-0001');
  select payment_state, outstanding into v_state, v_out from invoices where id = inv;
  insert into _test_results(check_name, passed, detail)
  values ('cash top-up settles invoice, Beleg recorded', v_state='paid' and v_out=0, v_state::text);

  -- ── Quotes: Verschnitt, optional lines, tiers ──────────────────────
  insert into quotes (pro_id, job_id, customer_id, group_id, tier, title)
  values (pro, job, cust, qg, 'standard', 'Wohnung streichen') returning id into q;
  insert into quote_lines (quote_id, position, kind, description, qty, unit, unit_price, waste_factor, vat_rate) values
    (q, 1, 'labor',    'Waende streichen',  60, 'm2', 12.00, 0,    20),
    (q, 2, 'material', 'Fliesen diagonal',  20, 'm2', 30.00, 0.15, 20);
  select net_total, vat_total into v_net, v_vat from quotes where id = q;
  insert into _test_results(check_name, passed, detail)
  values ('quote totals by trigger; diagonal Verschnitt applied',
          v_net = 1410.00 and v_vat = 282.00,
          format('net %s = 720 labour + 690 (20m2 x 1.15 x 30); vat %s', v_net, v_vat));

  insert into quote_lines (quote_id, position, kind, description, qty, unit, unit_price, vat_rate, is_optional, is_selected)
  values (q, 3, 'labor', 'Optional: Decke mitstreichen', 20, 'm2', 10.00, 20, true, false);
  select net_total into v_net from quotes where id = q;
  insert into _test_results(check_name, passed, detail)
  values ('unselected optional line excluded', v_net = 1410.00, v_net::text);

  update quote_lines set is_selected = true where quote_id = q and is_optional;
  select net_total into v_net from quotes where id = q;
  insert into _test_results(check_name, passed, detail)
  values ('selecting the optional line adds it', v_net = 1610.00, v_net::text);

  insert into quotes (pro_id, job_id, customer_id, group_id, tier, title)
  values (pro, job, cust, qg, 'premium', 'Premium') returning id into qb;
  insert into _test_results(check_name, passed, detail)
  values ('tiers are siblings in one group', (select count(*) from quotes where group_id = qg) = 2, null);

  update quotes set status='accepted' where id = q;
  failed := false;
  begin update quotes set status='accepted' where id = qb;
  exception when others then failed := true; end;
  insert into _test_results(check_name, passed, detail)
  values ('a job cannot have two accepted quotes', failed, null);
end $$;

select check_name, case when passed then 'PASS' else '!! FAIL' end as result, detail
from _test_results order by seq;

select count(*) filter (where not passed) as failures, count(*) as total from _test_results;
