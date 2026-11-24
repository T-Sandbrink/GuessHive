# Processing register (verwerkingsregister, GDPR art. 30)

Started in task 1.13 with the first external processor. Task 11.11 completes this register with
every processing purpose (account, voting, forecasting, demographics, Dark Corner, fraud
signals, moderation, …). Until then, every task that adds a processing of personal data or a
processor adds an entry here. The owner has the register checked (AGENTS.md §9).

| # | Processing | Purpose | Legal basis | Data categories | Data subjects | Retention | Recipients / processors | Transfer outside the EU | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Hosting of the web app (server-side rendering) | Serve the GuessHive website | Agreement (art. 6(1)(b)) for signed-in use; legitimate interest (art. 6(1)(f)) for guests | Request data passing through: IP address, user agent, requested URL, session cookie (forwarded to the api, not stored by the web app) | Visitors and users | Not stored by GuessHive in the web layer; Vercel's own request logs per its DPA | Vercel Inc. (processor), region `fra1` (Frankfurt) | Possible (Vercel is a US company): EU-US Data Privacy Framework or SCCs, **to be verified** | DPA with Vercel **to be signed before production** (owner) |
| 2 | Web analytics (Vercel Web Analytics) | Aggregate page-view statistics to improve the product | Legitimate interest (art. 6(1)(f)); cookieless, no consent needed under the ePrivacy rules | Page path without query string, route, referrer, coarse location (country), browser, OS, device type; a request hash that Vercel discards after 24 hours. **Never** on private pages (Dark Corner, groups, settings, notifications, admin, auth, own account), never question text or ids of private content | Visitors and users of public pages | Per Vercel's retention for Web Analytics; no data kept by GuessHive | Vercel Inc. (processor) | Possible (US company): EU-US Data Privacy Framework or SCCs, **to be verified** | DPA and transfer check **before production** (owner) |
