# Analysis brief (Hunter Phase 1: h:scan write-up + h:cluster + h:money per ground)

The paid data collection is DONE. Raw data is in `docs/blueprint/scan/raw/<G>.jsonl` (one JSON object per line):
- `reddit_post`: q (search query), url, date, sub, title, score (upvotes), comments, text (first 400 chars)
- `reddit_comments`: post (which post), top (top comments: score, date, text)
- `app_review`: app id, country, rating (1–5), date, title, text
- `app_search`, `other`: misc

Goal of the hunt: find niches with HIGH pain, MISSING or FAILING solutions, MEDIUM-HIGH prices and HIGH willingness to pay (WTP). Regions US, Europe, Australia.

## Rules
- Make NO paid API calls (no treg / mcp__treg__* / mcp__Treg__* tools). Use Read (in chunks, e.g. 200 lines at a time) and Write only. You MAY use WebSearch for current pricing of 3–6 incumbents if it is available; if a tool is denied, do not retry, tag the price `[A]` (from your knowledge, with "as of" note) and move on.
- Never invent quotes or numbers. Quotes must be verbatim from the raw data, ≤ 25 words.
- PRIVACY: no usernames (the raw files have none; keep it that way).
- Flag bias: posts by founders "researching"/"validating" or promoting a tool are tagged `vendor/research` and count as weak evidence. Many exist — be strict. Also ignore off-topic posts the search returned.
- Prefer last 12 months (today is 2026-11-14); flag older.

## Output: write `docs/blueprint/scan/<G>.md` with
1. Header: ground, counts (posts read, on-topic signals kept, vendor/research posts excluded).
2. Signal table, 12–25 best signals:
   | X-ID | Source (link) | Platform | Date | Quote (≤25 words) | Engagement | Pay signal (none/says-would-pay/pays-workaround/pays-competitor/business-budget) | Tag (pain/switching/payment/vendor-research) |
   X-IDs like X-G1-01.
3. Candidate pain topics (2–4), each: phrased in users' words; X-IDs; # independent sources (distinct threads/subreddits/apps); current workaround; WTP ladder 1–5 with best evidence (1 complaints, 2 says would pay, 3 pays for a workaround, 4 pays a competitor and complains/switches, 5 business budget with measurable cost); emotion 1–5; volume 1–5 (sum of engagement); "builder saturation" (how many vendor/research posts target it: low/med/high).
4. Incumbents named in the data (+ pricing via WebSearch or [A]): price, top complaint, gap.
5. Verdict for the ground (≤ 5 lines): the single best topic for "high pain + failing solutions + medium-high price + high WTP", and why.

Final message: ≤ 200 words per ground: signals kept, top topic + WTP level + volume, best price anchor, saturation.
