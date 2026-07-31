"""Learning what this business charges, from the quotes its customers accepted.

`pro_rates` is read by the quote template resolver, the estimator and the
settings screen, and its own comment says "Never ask twice". Until now nothing
wrote to it, so the promise was empty and every quote started from a catalogue
average.

Three decisions worth stating, because the obvious implementation is wrong in
each case.

**Only accepted quotes teach.** An offered price is an opinion; an accepted one
is a fact about what this market pays this business. Learning from drafts would
mean learning from prices that were never tested, including the ones that lost.

**Median over samples, not last-write-wins.** A pro who cuts a price once to
win a job would otherwise have that discount become their standard rate, and
the next quote would start from it, and the one after that from the new floor.
A median moves with the business and shrugs off one bad week.

**Zero and negative are dropped, not stored.** A goodwill line at 0 EUR is a
decision about one customer, not a rate. Included, it would drag the median
toward nothing.

And one rule above all three: **a rate the pro typed is never overwritten.**
That is what `pro_rates.is_manual` is for. A figure somebody entered on purpose
is an instruction; letting the next two accepted quotes outvote it would turn
the settings screen into a suggestion box.
"""
from __future__ import annotations

import logging
import statistics
from typing import Optional

from db import pg

logger = logging.getLogger(__name__)

# Enough of a label for the settings screen to show a human something. The
# quote line's own description is the best available: it is what the pro wrote
# or approved for a customer to read.
FALLBACK_LABEL = "Gelernter Satz"


async def learn_from_quote(con, pro_id: str, quote_id: str) -> int:
    """Record every priced position on an accepted quote, then recompute.

    Takes the open connection so it runs inside the acceptance transaction:
    a quote that is accepted but whose rates were not learned is a silent
    half-commit, and the next accept would skip it as already-accepted.
    """
    lines = await con.fetch(
        """
        select rate_key, unit, description, unit_price
          from quote_lines
         where quote_id = $1 and rate_key is not null and is_selected
           and unit_price > 0
        """, quote_id)
    if not lines:
        return 0

    # One row per key even if a quote lists an operation twice — the unique
    # index would reject the second, and the first is as good a witness.
    seen: set[str] = set()
    learned = 0
    for ln in lines:
        key = ln["rate_key"]
        if key in seen:
            continue
        seen.add(key)
        await con.execute(
            """
            insert into pro_rate_samples (pro_id, key, amount, unit, quote_id)
            values ($1, $2, $3, $4, $5)
            on conflict (quote_id, key) do update
                set amount = excluded.amount, observed_at = now()
            """, pro_id, key, float(ln["unit_price"]), ln["unit"], quote_id)
        learned += 1

    for key in seen:
        label = next((ln["description"] for ln in lines if ln["rate_key"] == key), None)
        unit = next((ln["unit"] for ln in lines if ln["rate_key"] == key), None)
        await _recompute(con, pro_id, key, label=label, unit=unit)
    return learned


async def _recompute(con, pro_id: str, key: str, *, label: Optional[str] = None,
                     unit: Optional[str] = None) -> None:
    if await con.fetchval(
            "select is_manual from pro_rates where pro_id = $1 and key = $2",
            pro_id, key):
        # Samples keep accruing — they are still the evidence, and the detail
        # view shows them beside the manual figure — but they do not move it.
        return

    rows = await con.fetch(
        "select amount from pro_rate_samples where pro_id = $1 and key = $2",
        pro_id, key)
    amounts = [float(r["amount"]) for r in rows if float(r["amount"]) > 0]
    if not amounts:
        return
    median = round(statistics.median(amounts), 2)
    trade = key.split(".")[0] if "." in key else None
    await con.execute(
        """
        insert into pro_rates (pro_id, key, label, unit, amount, trade,
                               times_used, last_used_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (pro_id, key) do update set
            amount       = excluded.amount,
            -- The label and unit only fill a gap. Once a pro has edited them
            -- in settings, a later quote must not silently rename their own
            -- rate back to whatever the last position happened to say.
            label        = case when pro_rates.label = $8 then excluded.label
                                else pro_rates.label end,
            unit         = coalesce(nullif(pro_rates.unit, ''), excluded.unit),
            times_used   = excluded.times_used,
            last_used_at = now(),
            updated_at   = now()
        """,
        pro_id, key, (label or FALLBACK_LABEL)[:120], unit or "h", median, trade,
        len(amounts), FALLBACK_LABEL)


async def for_pro(pro_id: str) -> dict[str, float]:
    rows = await pg.fetch("select key, amount from pro_rates where pro_id = $1", pro_id)
    return {r["key"]: float(r["amount"]) for r in rows}


async def detail(pro_id: str) -> list[dict]:
    """Every learned rate with the evidence behind it.

    The spread is returned alongside the median because a rate built from
    prices between 38 and 92 EUR means something different from one built from
    prices between 61 and 64, and a single number cannot say which it is.
    """
    return await pg.fetch(
        """
        select r.key, r.label, r.unit, r.amount, r.trade, r.times_used,
               r.is_manual, r.last_used_at,
               s.n_samples, s.low, s.high
          from pro_rates r
          left join lateral (
                 select count(*) as n_samples, min(amount) as low, max(amount) as high
                   from pro_rate_samples p
                  where p.pro_id = r.pro_id and p.key = r.key
               ) s on true
         where r.pro_id = $1
         order by r.trade nulls last, r.key
        """, pro_id)


async def set_manual(pro_id: str, key: str, amount: float, *,
                     label: Optional[str] = None, unit: Optional[str] = None) -> dict:
    """A rate the pro typed, which outranks anything learned.

    Kept out of pro_rate_samples deliberately: a manual figure is an
    instruction, not an observation, and mixing it into the median would let
    the next two accepted quotes quietly outvote it.
    """
    return await pg.fetchrow(
        """
        insert into pro_rates (pro_id, key, label, unit, amount, trade,
                               is_manual, last_used_at)
        values ($1, $2, $3, $4, $5, $6, true, now())
        on conflict (pro_id, key) do update set
            amount = excluded.amount,
            label  = coalesce(excluded.label, pro_rates.label),
            unit   = coalesce(excluded.unit, pro_rates.unit),
            is_manual = true,
            updated_at = now()
        returning *
        """, pro_id, key, label or FALLBACK_LABEL, unit or "h", round(float(amount), 2),
        key.split(".")[0] if "." in key else None)
