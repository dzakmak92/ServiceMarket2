# Scan brief for one hunting ground (Hunter Phase 1, h:scan, deep mode)

Goal: collect real, dated pain signals for ONE ground so we can find a niche with high pain, missing or failing solutions, medium-high prices and high willingness to pay (WTP). Regions: USA, Europe (UK/DACH/EU), Australia.

## Tools and budget (hard rules)
- Use the treg MCP tools. Load them with ToolSearch: `select:mcp__Treg__call,mcp__Treg__catalog_get,mcp__Treg__balance` (if those names fail, try `mcp__treg__call` etc.). catalog_get and balance are free.
- HARD CAP: $0.065 total for your ground. Sum `cost_usd` from each response. Stop at $0.055 and write up what you have. Never exceed the cap.
- Endpoints and prices (USD/call):
  - Reddit search `tikhub.x.reddit-app-fetch-dynamic-search` 0.001. Query params: query, search_type=post, sort=RELEVANCE, time_range=year, safe_search=unset, allow_nsfw=0, need_format=true. Do NOT use sort=NEW.
  - Reddit comments `tikhub.x.reddit-app-fetch-post-comments` 0.001 (check params with catalog_get first; it takes the post id / fullname like t3_xxxx).
  - App Store search `litescrape.app_store.search.apps` 0.00015 (catalog_get for params). App Store reviews `litescrape.app_store.reviews` 0.00015: product_id, country (us/gb/au/de), sort=mosthelpful, page.
  - Google Play reviews `litescrape.google_play.reviews` 0.00015 (catalog_get for params).
  - Trustpilot `crawl4ai.trustpilot.business.reviews` 0.00135 (catalog_get for params).
  - TikTok search `tikhub.tiktok.search.videos` 0.001 (catalog_get for params); YouTube comments `crawl4ai.youtube.video.comments` 0.0009.
  - Google SERP `treg.google.serp.organic` (routed): body {"q": "...", "country": "us"|"gb"|"au"}, ALWAYS headers {"X-Treg-Route-Max-Cost": "0.004"}. Use it for G2/Capterra review snippets, forum threads, "I'd pay for" phrases, and price anchors.
  - Page read `treg.web.extract` (routed): ALWAYS headers {"X-Treg-Route-Max-Cost": "0.006"}. At most 3 page reads (pricing pages, key threads).
- Suggested plan (≈ $0.05): 10–14 Reddit searches mixing pain, switching and payment phrases ("I hate", "so frustrating", "is there an app/software that", "alternative to X", "X price increase", "cancelled", "I'd pay for", "hired a VA", "spreadsheet"), include region subs/terms (UK, Australia/tradie, EU/Germany); 3–4 comment pulls on the strongest posts; App Store search + 4–6 review pages (mosthelpful, mix us/gb/au) for 2–3 leading paid tools; 2 Play review pages; 1–2 Trustpilot pulls; 4–6 SERP queries; 1 TikTok search; ≤ 3 page reads for current pricing.
- Responses are large. Do not echo raw JSON in your final answer.

## Evidence rules
- Every signal needs a link and a date (post/review date). Prefer the last 12 months; flag older ones.
- Quotes verbatim, ≤ 25 words. Never invent quotes, numbers or engagement.
- PRIVACY: never store usernames, author ids or profile data. Only link, date, short quote, engagement (score, comments, stars, views).
- Flag bias: posts that are founders "researching" or promoting a tool (common!) must be tagged `vendor/research` — they are weak evidence of pain. Note aggregators and vendor blogs.

## Output: write `docs/blueprint/scan/<GROUND>.md` (path relative to repo root /home/user/ServiceMarket2) with:
1. Header: ground, calls made, total cost USD (summed), endpoints used.
2. Signal table (target 12–25 signals):
   | X-ID | Source (link) | Platform | Region | Date | Quote (≤25 words) | Engagement | Pay signal? (none/says-would-pay/pays-workaround/pays-competitor/business-budget) | Tag (pain/switching/payment/vendor-research) |
   Use X-IDs like X-G1-01.
3. Candidate pain topics (2–5): a specific pain in this audience in users' own words; X-IDs; # independent sources; platforms; current workaround; WTP ladder level 1–5 with best evidence (1 complaints, 2 says would pay, 3 pays workaround, 4 pays competitor and complains/switches, 5 business budget with measurable cost); emotion; whether founders are already flooding the space.
4. Incumbents: 3–6 tools with current price (link, date checked), rating, strongest feature, most common complaint (from reviews you pulled), and the gap.
5. Price anchors with links.
6. Your verdict: which topic in this ground best fits "high pain + failing solutions + medium-high price + high WTP", and why, in ≤ 5 lines.

Final message back to the orchestrator: ≤ 250 words — cost spent, number of signals, top topic with WTP level and best price anchor, and any notable gap. No raw data.
