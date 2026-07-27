"""Billing cycle helpers — monthly invoice on the 25th."""

from datetime import datetime, timezone, timedelta
import calendar


def next_billing_date(now: datetime | None = None) -> datetime:
    """Return the next billing cutoff = 25th of the current or next month at 00:00 UTC.

    Example: if today is the 26th of May, the next billing date is June 25th.
    If today is the 24th of May, the next billing date is May 25th.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    year, month, day = now.year, now.month, now.day
    if day < 25:
        return datetime(year, month, 25, tzinfo=timezone.utc)
    # Roll to next month
    if month == 12:
        return datetime(year + 1, 1, 25, tzinfo=timezone.utc)
    return datetime(year, month + 1, 25, tzinfo=timezone.utc)


def current_cycle_start(now: datetime | None = None) -> datetime:
    """Return the 26th of the previous billing cycle, ie the start of the current cycle."""
    if now is None:
        now = datetime.now(timezone.utc)
    cutoff = next_billing_date(now)
    # Walk back exactly one month to the 26th of the previous month
    if cutoff.month == 1:
        return datetime(cutoff.year - 1, 12, 26, tzinfo=timezone.utc)
    prev_month = cutoff.month - 1
    prev_year = cutoff.year
    last_day_prev_month = calendar.monthrange(prev_year, prev_month)[1]
    day = min(26, last_day_prev_month)
    return datetime(prev_year, prev_month, day, tzinfo=timezone.utc)
