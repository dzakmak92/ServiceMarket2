"""Trade template library — Leistungsverzeichnis skeletons per trade.

The plan calls this the moat: competitors ship a generic quote builder, this
ships trade-shaped ones. A Maler template already knows that walls are priced
per m², that Abdecken and Grundierung are separate positions customers expect
to see itemised, and that skipping the primer is a real option rather than a
free-text note.

Templates are read-only skeletons. Applying one copies its lines into a quote
where they become ordinary editable rows — nothing stays linked, because a
template that keeps editing a sent quote would be a liability.

Rates come from pro_rates where the pro has one, so the second quote for the
same work reuses what they charged on the first. `rate_key` is the join.
"""
from __future__ import annotations

from typing import Any, Optional

from db import pg


async def list_for_pro(pro_id: str, *, trade: Optional[str] = None) -> dict:
    """Built-in templates plus the pro's own. Built-ins are shared by all."""
    where = ["(t.is_builtin or t.pro_id = $1)"]
    args: list[Any] = [pro_id]
    if trade:
        args.append(trade)
        where.append(f"t.trade = ${len(args)}")
    rows = await pg.fetch(
        f"""
        select t.*, (select count(*) from quote_template_lines l
                      where l.template_id = t.id) as line_count
          from quote_templates t
         where {' and '.join(where)}
         order by t.is_builtin desc, t.trade, t.sort_order, t.name
        """, *args)
    return {"templates": rows, "total": len(rows)}


async def get(pro_id: str, template_id: str) -> Optional[dict]:
    tpl = await pg.fetchrow(
        "select * from quote_templates where id = $1 and (is_builtin or pro_id = $2)",
        template_id, pro_id)
    if not tpl:
        return None
    lines = await pg.fetch(
        "select * from quote_template_lines where template_id = $1 order by position, id",
        template_id)
    return {**dict(tpl), "lines": lines}


async def resolve_lines(pro_id: str, template_id: str, *,
                        tier: str = "standard") -> list[dict]:
    """Template lines as quote lines, priced from the pro's learned rates.

    Tier filtering uses tier_min: a line marked premium does not appear in a
    basic quote. That is what makes one template produce three genuinely
    different offers rather than the same list at three prices.
    """
    order = {"basic": 0, "standard": 1, "premium": 2}
    want = order.get(tier, 1)

    rows = await pg.fetch(
        """
        select l.*, r.amount as learned_amount
          from quote_template_lines l
          left join pro_rates r on r.pro_id = $2 and r.key = l.rate_key
         where l.template_id = $1
         order by l.position, l.id
        """, template_id, pro_id)

    out: list[dict] = []
    for i, r in enumerate(rows, start=1):
        if order.get(r["tier_min"] or "basic", 0) > want:
            continue
        # The pro's own rate wins over the template's default. The default is
        # a starting point for someone who has never quoted this before, not
        # a price anyone should be held to.
        price = r["learned_amount"] if r["learned_amount"] is not None else r["default_price"]
        out.append({
            "position": i,
            "kind": r["kind"],
            "description": r["description"],
            "qty": float(r["default_qty"] or 1),
            "unit": r["unit"] or "pcs",
            "unit_price": float(price or 0),
            "waste_factor": float(r["waste_factor"] or 0),
            "is_optional": bool(r["is_optional"]),
            "is_selected": not bool(r["is_optional"]),
        })
    return out
