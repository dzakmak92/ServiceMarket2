"""Which calculators (Gewerke) a pro may use.

The admin switches them per pro, according to the trade licence
(Gewerbeschein). Stored on `pro_profiles.enabled_trades`:

* NULL  — never set by an admin: the seven catalogue trades, no Folierung.
          That is what every pro had before the switch existed.
* array — exactly these, in any order; an empty array means none.

Folierung is not a catalogue trade (it has its own calculator in the
frontend), so it only ever appears here.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from db import pg
from services import estimator

FOLIERUNG = "folierung"
ALL_TRADES: tuple[str, ...] = (*estimator.OFFERED_TRADES, FOLIERUNG)
DEFAULT_TRADES: tuple[str, ...] = tuple(estimator.OFFERED_TRADES)
LABELS = {**estimator.TRADE_LABELS, FOLIERUNG: "Folierung"}

_JOB_TRADE: dict[str, str] = {}


def effective(stored: Optional[list[str]]) -> list[str]:
    """The enabled trades in display order, from the stored column value."""
    chosen = DEFAULT_TRADES if stored is None else stored
    return [t for t in ALL_TRADES if t in chosen]


def clean(requested: list[str]) -> list[str]:
    """Known keys only, in display order; refuses anything unknown."""
    unknown = sorted(set(requested) - set(ALL_TRADES))
    if unknown:
        raise HTTPException(422, f"Unknown trade(s): {', '.join(unknown)}")
    return [t for t in ALL_TRADES if t in requested]


async def enabled_for(pro_id: str) -> list[str]:
    stored = await pg.fetchval("select enabled_trades from pro_profiles where id = $1", pro_id)
    return effective(stored)


def trade_of(job_key: str) -> Optional[str]:
    """The catalogue trade a job belongs to (key prefixes are not reliable)."""
    if not _JOB_TRADE:
        _JOB_TRADE.update({j["key"]: j["trade"] for j in estimator.jobs(include_hidden=True)})
    return _JOB_TRADE.get(job_key)


async def require_job(pro_id: str, job_key: str) -> None:
    """403 when the job's trade is switched off for this pro."""
    trade = trade_of(job_key)
    # Only the switchable trades are gated; a job filed under a trade that is
    # not on offer at all is the catalogue's business, not this switch's.
    if trade in ALL_TRADES and trade not in await enabled_for(pro_id):
        raise HTTPException(403, "Diese Kalkulation ist für dein Konto nicht freigeschaltet.")
