# Boss Phase 2 check brief (compact manager validation, per idea)

You check TWO ideas from `docs/boss/01-hunt.md`. First read that file's row for each idea and its source hunt files (paths are below each idea in your task). Then, per idea, do the steps below. Write `docs/boss/checks/<I-ID>.md` for the FIRST idea before starting the second, so a stopped run keeps its results.

## Tools and budget (hard rules)
- treg MCP tools: load with ToolSearch `select:mcp__treg__call,mcp__treg__catalog_get` (if absent, try `mcp__Treg__call`). If treg is still connecting, wait briefly and retry ToolSearch.
- HARD CAP: $0.050 for your two ideas together (about $0.025 each). Sum `cost_usd` per response; stop at $0.045.
- If a call is refused or denied, don't retry it more than once; continue with other sources and note it.
- Endpoints (USD):
  - App Store search `litescrape.app_store.search.apps` 0.00015 (check params with catalog_get; country us/de/gb/au as fits)
  - App Store reviews `litescrape.app_store.reviews` 0.00015 (product_id, country, sort=mosthelpful, page)
  - Google Play reviews `litescrape.google_play.reviews` 0.00015
  - Reddit search `tikhub.x.reddit-app-fetch-dynamic-search` 0.001 (sort=RELEVANCE, time_range=year, need_format=true)
  - Google SERP `treg.google.serp.organic` with headers {"X-Treg-Route-Max-Cost": "0.004"}; body {"q","country","language"}
  - Page read `treg.web.extract` with headers {"X-Treg-Route-Max-Cost": "0.006"} (pricing pages; at most 3 per idea)
  - Keyword volume `serpstat.google.keywords.volume` 0.0005/keyword returned: body {"method":"SerpstatKeywordProcedure.getKeywordsInfo","id":"1","params":{"se":"g_de" or "g_us"/"g_uk"/"g_au","keywords":[...]}} (≤ 10 keywords per idea)
- Reuse the hunt's evidence first; only call treg for what is missing (competitor ratings and prices, reviews, channel volumes).

## Steps per idea
1. **Job.** J-01 as "When…, I want to…, so I can…", with pain 1–5, frequency, and 2–3 verbatim hunt quotes with links.
2. **Competitors.** 3–5 apps or services: name, price (link, date), rating/review count, strongest feature, most common complaint.
3. **Reviews.** 2 pages of mosthelpful App Store reviews and 1 Play page for the top 2 competitors where apps exist (otherwise Trustpilot/G2 snippets via SERP). Cluster the complaints into 3 themes and mark which ones the idea could own.
4. **Riskiest assumptions.** Top 3 (desirability, viability, feasibility, reachability), each with importance and evidence 1–5.
5. **Channel.** Where the first 100 users are, concretely: communities with their size, plus search phrases with monthly volume (treg).
6. **Mini kill scorecard** (1–5 each, max 35): pain, frequency, willingness to pay, reachability, differentiation, feasibility in a 6-week MVP by a solo full-stack dev (React/FastAPI, has a marketplace stack: bookings, chat, live ETA, ratings, Stripe), founder fit (DACH trades marketplace founder, German native, GDPR).
   - Hard kills: no job with pain ≥ 3; no nameable channel; a free alternative already does it well; an inaccessible dependency (licence, data, partner the founder can't get); needs legal/medical/financial ADVICE (tools and workflows are fine).
7. **Verdict:** GO (≥ 25), GO with conditions (18–24, name them), or KILL (< 18 or a hard kill, naming the rule).

## Evidence rules
- Tag every claim `[E]` (link/date/number) or `[A]`.
- Quotes verbatim, ≤ 25 words.
- No usernames.
- Never invent numbers.

## Output file format (`docs/boss/checks/<I-ID>.md`)
```
# <I-ID> <concept>
treg: <calls> calls, $<cost>
## Job
## Competitors
| Name | Price | Rating (n) | Strongest feature | Top complaint |
## Review themes
## Riskiest 3
| # | Type | Assumption | Importance | Evidence |
## Channel
## Scorecard
| Pain | Frequency | WTP | Reach | Differentiation | Feasibility | Founder fit | Total /35 |
## Verdict
```
Final message: ≤ 120 words per idea: the score, the verdict with its reason, the cost.
