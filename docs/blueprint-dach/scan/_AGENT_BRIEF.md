# Scan brief: one DACH B2B ground (Hunter Phase 1, h:scan, deep mode)

Goal: collect real, dated pain signals for ONE ground in Germany, Austria and Switzerland to find B2B digital products with high demand, high pain, low saturation, high potential, higher pricing and willingness to pay (WTP) both ONE-TIME (setup, audit, templates, migration, Vorlagenpaket) and RECURRING (subscription, monitoring, yearly renewals).

## Tools and budget (hard rules)
- Use the treg MCP tools; load them with ToolSearch `select:mcp__treg__call,mcp__treg__catalog_get` (if that fails, try `mcp__Treg__call`). catalog_get is free.
- HARD CAP: $0.070 for your ground. Sum `cost_usd` from each response. At $0.060 stop and write up. Never exceed the cap.
- If a tool call is refused or denied, do not retry the same call more than once; continue with other sources and note it.
- Endpoints (USD/call):
  - Reddit search `tikhub.x.reddit-app-fetch-dynamic-search` 0.001. query params: query, search_type=post, sort=RELEVANCE, time_range=year, safe_search=unset, allow_nsfw=0, need_format=true. Query in GERMAN (e.g. "E-Rechnung Pflicht Handwerk", "Abmahnung Onlineshop", "Software zu teuer") and also English with "Germany"/"Austria". German subs: r/de, r/Selbststaendig, r/Handwerker, r/steuern, r/Austria, r/Schweiz, r/de_EDV, r/Finanzen, r/germany, r/arbeitsleben, r/Mietrecht, r/FragReddit, r/Unternehmer.
  - Reddit comments `tikhub.x.reddit-app-fetch-post-comments` 0.001 (check params with catalog_get).
  - Google SERP `treg.google.serp.organic` (routed): body {"q": "...", "country": "de"|"at"|"ch", "language": "de"}, ALWAYS headers {"X-Treg-Route-Max-Cost": "0.004"}. This is your MAIN source in DACH: German forums (e.g. "forum", "erfahrungen", "frage", site:gutefrage.net, site:handwerker.de forums, site:steuerberater-forum, site:unternehmer.de, site:omr.com/de/reviews, site:capterra.com.de, site:trustpilot.com), price searches ("Preise", "Kosten pro Monat"), and payment phrases ("würde dafür zahlen", "gibt es eine Software für", "Alternative zu", "zu teuer", "Preiserhöhung", "gekündigt").
  - Page read `treg.web.extract` (routed): headers {"X-Treg-Route-Max-Cost": "0.006"}. At most 4 page reads (key forum threads, pricing pages).
  - App Store search `litescrape.app_store.search.apps` 0.00015 (country=de; check params); reviews `litescrape.app_store.reviews` 0.00015: product_id, country de/at/ch, sort=mosthelpful, page.
  - Google Play reviews `litescrape.google_play.reviews` 0.00015 (catalog_get for params; language de).
  - Trustpilot `crawl4ai.trustpilot.business.reviews` 0.00135 (catalog_get for params; DE businesses).
- Suggested deep plan (≈ $0.06): 10–12 Reddit searches (German + English), 3 comment pulls, 10–12 SERP queries (German forums, review sites, pricing, regulation deadlines), 1 App Store search + 4 review pages for 2 leading tools, 2 Play pages, 1–2 Trustpilot, ≤ 4 page reads.
- Responses are large. Never echo raw JSON in your final message.

## Save as you go (IMPORTANT: a previous run lost everything)
After every 4–5 calls, append the signals you have so far to `docs/blueprint-dach/scan/raw/<GROUND>-notes.md` (Write the file first, then Edit/append). Keep link, date, short verbatim quote, engagement. Then continue.

## Evidence rules
- Every signal needs a link and a date. Prefer the last 12 months (today is 2026-11-15); flag older.
- Quotes verbatim (German is fine), ≤ 25 words. Add a short English gloss in brackets. Never invent quotes, numbers or engagement.
- PRIVACY: no usernames, author ids or profile data.
- Bias: tag founders "researching"/promoting tools as `vendor/research` (weak evidence). Vendor blogs, law-firm marketing and SEO listicles are context only, not pain signals; they are useful for price anchors and deadlines.
- Regulation facts (deadlines, thresholds, fines) need an official or reputable source link (Bundesgesetzblatt, BMF, IHK, WKO, admin.ch, EU sites) or are tagged [A].

## Output: write `docs/blueprint-dach/scan/<GROUND>.md` (repo root /home/user/ServiceMarket2) with:
1. Header: ground, calls made, total cost USD (summed), endpoints used, any refused calls.
2. Signal table (target 15–25):
   | X-ID | Source (link) | Platform | Country | Date | Quote (≤25 words) [gloss] | Engagement | Pay signal (none/says-would-pay/pays-workaround/pays-competitor/business-budget) | Pay type (one-time/recurring/both/unknown) | Tag (pain/switching/payment/regulation/vendor-research) |
   X-IDs like X-D1-01.
3. Candidate pain topics (2–4): users' words; X-IDs; # independent sources; current workaround; WTP ladder 1–5 with best evidence (1 complaints, 2 says would pay, 3 pays workaround, 4 pays competitor and complains/switches, 5 business budget with measurable cost); one-time vs recurring payment fit; emotion 1–5; volume 1–5; demand driver (regulation deadline? date); builder/vendor saturation (low/med/high) with names of existing DACH tools.
4. Incumbents (DACH): 3–6 tools with current price (link), rating, top complaint, gap.
5. Price anchors with links (one-time and recurring separately).
6. Verdict (≤ 6 lines): the single best topic for "high demand + high pain + low saturation + higher price + WTP once and repeatedly", and why.

Final message: ≤ 250 words — cost spent, signals count, top topic with WTP level, one-time and recurring price anchors, saturation, demand driver/deadline.
