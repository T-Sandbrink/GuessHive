# PLAN.md — GuessHive roadmap

Dit is het werkplan. Agents werken het **van boven naar beneden** af (zie `AGENTS.md` §5).
Vink een taak af met `[x]` zodra hij aan de *definition of done* voldoet, inclusief de review gate met subagents (AGENTS.md §6).
Aan het eind van elke fase draait de *phase gate* (security- en code-review over de hele fase). Noteer de uitkomst onder de fase.
Elke fase eindigt met **acceptatiecriteria**: pas door naar de volgende fase als die allemaal kloppen.

Legenda: `[ ]` open · `[x]` klaar · `[~]` bezig · `[-]` geschrapt (met reden)

---

## Laatste stand (handoff)

Wordt bijgewerkt bij elke pauze (gebruikslimiet, einde sessie). Bij hervatten eerst dit lezen (zie AGENTS.md §5).

- **Status:** ⏸ **Bouwen staat UIT op verzoek van de eigenaar** tot het plan helemaal af is. De geplande taken `guesshive-resume` en `guesshive-watchdog` zijn uitgeschakeld en `.agent-state.json` staat op `blocked`. Pas starten als de eigenaar expliciet zegt dat er gebouwd mag worden.
- **Huidige taak:** — (nog niet begonnen, start bij 0.1)
- **Klaar:** —
- **Nog te doen in deze taak:** —
- **Review gate nog nodig:** —
- **Niet-gecommitte bestanden:** —
- **Open punten:** —
- **Hervat op:** —

---

## Vastgelegde beslissingen

| Onderwerp | Beslissing |
|---|---|
| Naam / domeinen | GuessHive: `guesshive.com` (hoofd), `.net`, `.eu` en `.nl` als redirects (`.nl` → `/nl`) |
| Frontend | SvelteKit + Svelte 5, Tailwind v4, shadcn-svelte |
| Backend | NestJS + Prisma + PostgreSQL + Redis/BullMQ |
| Monorepo | pnpm workspaces + Turborepo, gedeelde zod-schema's |
| Login | Google, Apple, e-mail magic link, e-mail + wachtwoord |
| Talen | NL + EN bij lancering, meertalig opgezet |
| Platform | Web eerst, als PWA. Native apps later |
| Geld | Nooit echt geld. Punten, XP en reputatie |
| Privacy | EU-hosting, stemmen standaard privé, geen uitsplitsing bij < 10 stemmers |
| Vragen maken | Admins (startcontent) + gebruikers vanaf dag 1 via moderatie. Vertrouwde gebruikers later direct. Fase 9 blijft vóór lancering |
| Git | Branch per fase + per taak (AGENTS.md §5). Agent commit, merget en pusht zelf. `main` alleen na een afgeronde fase |

### UX-beslissingen

| Onderwerp | Beslissing |
|---|---|
| Account | **Eerst stemmen, dan account.** Gasten zien alle vragen en kunnen tikken. Een tik op een optie of op "overslaan" opent een aanmeldsheet (Google/Apple bovenaan). De keuze wordt bewaard en na aanmelden automatisch ingediend, daarna verschijnt de uitslag |
| Feed | **Kaartenlijst** op home (tabs Trending / Lokaal / Nieuw, stemmen direct in de kaart) + aparte **"⚡ Snel stemmen"**-modus: één vraag per scherm, swipen |
| Uitslag | Pas zichtbaar **na stemmen of "overslaan"**. Wie overslaat ziet de uitslag, maar kan daarna niet meer stemmen (server registreert de skip). Uitzondering: deelkaarten (OG-plaatjes) tonen de uitslag, omdat delen de groeimotor is |
| Voorspellen | **Ja/Nee + zekerheid**: tik Ja of Nee, kies dan "Beetje zeker" (60%), "Vrij zeker" (75%) of "Heel zeker" (90%). Precieze slider (1–99%) onder "⚙ Precies instellen". Meerkeuze: optie kiezen + zelfde zekerheidskeuze |
| Stem wijzigen | **Ja, zolang de vraag open is**, voor polls én voorspellingen (voorspellingen tellen tijdgewogen). Geen XP voor wijzigen |
| Stijl | **Speels & warm**: honinggeel als hoofdkleur, ronde vormen, zachte schaduwen, emoji, kleine animaties bij stemmen. Light + dark mode (standaard: systeem) |
| Mascotte | **Een bij**: juicht bij een goede voorspelling, troost bij een foute, verschijnt in lege schermen, onboarding en meldingen |
| Onboarding | **Kort**: alleen username + land (+ interesses). Geboortejaar, geslacht en regio worden **later op een slim moment** gevraagd, bijv. na 5 stemmen: "Wil je zien hoe jouw leeftijdsgroep stemt?" |
| Profiel | **Publiek, stemmen privé**: username, avatar, level, badges en voorspelscore zichtbaar. Een stem is alleen zichtbaar als de gebruiker hem zelf openbaar maakt |
| Reacties | Pas zichtbaar **na stemmen of overslaan** |
| Pushmeldingen | **Actief**: vraag van de dag, trending vragen, vrienden die stemmen, wekelijkse recap, voorspelling opgelost, reacties, streak in gevaar. Alles per type uit te zetten. Harde limiet: max 3 per dag, geen pushes tussen 22:00 en 08:00 lokale tijd |
| Voorspellen vanuit de feed | **In de kaart, 2 tikken**: tik Ja of Nee, dan verschijnen de drie zekerheidsknoppen. Een tik op een zekerheid plaatst de voorspelling meteen. Geen vooraf ingevulde zekerheid. Aanpassen kan daarna. De detailpagina werkt hetzelfde, plus de precieze slider met "Voorspelling plaatsen" |
| Overslaan bij voorspellingen | Ook voorspellingen kun je overslaan: je ziet wat de zwerm denkt, maar kunt daarna niet meer voorspellen. De gevolgen staan onder de knop |
| Wisselende banner | **Carrousel "Uitgelicht" bovenaan de home** (mobiel en desktop): eerste dia is de **vraag van de dag**, daarna de **nieuwste vragen** (mix lokaal en globaal, vragen waarop je al stemde worden overgeslagen). **Stemmen kan direct in de dia met één tik**, daarna kort de uitslag. Wisselt **automatisch elke 6 seconden** en pauzeert bij aanraken, hover, focus, na je stem, en bij "minder beweging". Zichtbare pauzeknop en puntjes (44px tikvlak) |
| Snel stemmen | Een compacte honingknop **"Snel stemmen" rechtsboven de carrousel**, op desktop een knop naast de feed-tabs. In de modus heet de knop **"Volgende vraag"**: die gaat door zonder uitslag en registreert géén skip (de vraag blijft stembaar). "Overslaan" betekent in de hele app hetzelfde |
| Woord voor alle stemmers | **"De zwerm"** (NL) / **"the hive"** (EN), overal hetzelfde: "Jij en 46% van de zwerm kozen Messi" |
| Honingraat-regel | **Zeshoek = iets van jou**: jouw avatar, het "jouw keuze"-vinkje, jouw voortgang en streak, het "of"-rondje in Snel stemmen. Niet voor andermans avatars, badges van anderen of decoratieve iconen |
| Aanmeldsheet | Sluitknop (X) + "Niet nu". Google en Apple even zwaar bovenaan (volgens hun huisstijlregels), e-mail als rustige derde optie: "Doorgaan met e-mail". Regel over voorwaarden, privacybeleid en 16+. Aparte tekst voor wie op "overslaan" tikte |
| Lettertypen | Fredoka (koppen en cijfers) + Nunito (tekst), **zelf gehost** (bijv. @fontsource). Nooit laden via fonts.googleapis.com: dat stuurt IP-adressen naar Google (AVG) |
| Designbron | Het design-canvas is de referentie voor de UI van fase 3–8: https://claude.ai/artifact/27Jt9oFZeytMGGnwuu8XpU |

### Lancering & landen

| Onderwerp | Beslissing |
|---|---|
| Startlanden | **Wereld open, lokaal eerst NL + BE (Vlaanderen).** Iedereen kan meedoen met globale vragen (NL/EN-interface). De "Lokaal"-tab, landpagina's en lokale vragen starten met Nederland en België. Andere landen zien "Lokaal komt eraan: word ambassadeur!" |
| Uitbreiden | **Op basis van data**: een land krijgt lokale content zodra het ≥ 500 maandelijks actieve gebruikers heeft (drempel instelbaar) **en** minstens 1 actieve ambassadeur. Het admin-dashboard toont welke landen bijna klaar zijn. De eigenaar geeft het laatste akkoord (`localEnabled` aanzetten) |
| Lokale vragen | **Ambassadeurs + gebruikers via moderatie**, later aangevuld met **AI-suggesties uit het nieuws** (na lancering) |
| Ambassadeurs | **Aanmelden + goedkeuring door eigenaar/admin.** Voorwaarde: minimaal level 5 en een goede trust score (instelbaar). Eerst 30 dagen proeftijd (vragen voorstellen die direct bovenaan de moderatiewachtrij komen, meldingen afhandelen). Daarna volledig: lokale vragen direct publiceren (behalve politiek) en de lokale wachtrij modereren. Rechten gelden per land/regio, alles in de audit log, intrekken altijd mogelijk |
| AI-nieuwssuggesties | **Na lancering**, met de Claude API (Haiku). Alleen koppen en links uit openbare RSS-feeds (bijv. NOS, VRT), nooit artikeltekst overnemen. AI stelt vragen voor, een ambassadeur/admin keurt goed. Vereist een Anthropic API-account (eigenaar) |
| Categorieën | Sport ⚽ · Eten & drinken 🍽 · Entertainment (film/muziek/tv/games) 🎬 · Actualiteit 📰 · **Politiek & maatschappij 🏛** · Lifestyle & relaties 💛 · Tech 💻 · Weer & natuur 🌦 · Lokaal & je buurt 🏘 · Dit of dat 🎲 |
| Politiek | **Toegestaan, met regels**: (1) altijd via moderatie, ook voor vertrouwde gebruikers en ambassadeurs; (2) label "Geen representatieve peiling" op vraag, uitslag en deelkaart; (3) neutrale formulering verplicht (checklist voor moderatoren); (4) **verkiezingsstilte** per land: uitslagen van politieke vragen over dat land worden verborgen tijdens de periode die de lokale regels voorschrijven (admin-beheerde kalender); (5) stemmen van accounts jonger dan 7 dagen tellen niet mee in politieke uitslagen (ze mogen wel stemmen, en hun stem telt na 7 dagen alsnog mee); (6) geen vragen die privépersonen noemen |
| Startcontent | **De agent schrijft concepten, de eigenaar keurt.** ±100 vragen (±50 lokaal NL/BE, ±50 globaal) + 10 voorspellingen, NL + EN, als seed-bestand. De eigenaar loopt ze door vóór de lancering |

## Open vragen

Beslissingen die nog genomen moeten worden. De eigenaar beslist; de agent zet ze hier neer.

- [ ] **Productie-hosting**: (a) Hetzner VPS + Coolify/Docker (goedkoop, EU, meer zelf beheren), (b) Railway/Render EU-regio (simpel, duurder), of (c) web op Vercel + api/db elders. Beslissen vóór fase 12. Tot die tijd blijft alles Docker-portable.
- [ ] **Puntensysteem voorspellingen**: de agent schrijft in fase 5 een voorstel (tijdgewogen Brier-score t.o.v. de massa) en bouwt dat alvast. De eigenaar keurt het goed of stuurt bij.
- [ ] **Designrichting goedkeuren** (taak 3.0): stijl, kleuren en mascotte-concept. Tot de goedkeuring kan de agent doorwerken aan backend-taken.
- [ ] **Mascotte**: naam voor de bij? Later eventueel een illustrator voor de definitieve versie (de agent maakt een eerste SVG-versie).
- [ ] **Merknaam-check**: GuessHive in het EUIPO-register controleren vóór lancering (eigenaar).
- [ ] **Domeinen registreren**: `.com`, `.net`, `.eu` en `.nl` (eigenaar).
- [ ] **Externe accounts** (eigenaar, nodig vanaf de genoemde fase, tot die tijd placeholders): Google Cloud OAuth (fase 2), Apple Developer Program, ±€99 per jaar en nodig voor Sign in with Apple (fase 2), Resend (fase 2/12), Cloudflare Turnstile (fase 2), Sentry (fase 11), Anthropic API voor AI-nieuwssuggesties (na lancering).

---

## Productoverzicht (wat de MVP moet kunnen)

**Vraagtypes**
1. **Poll (één keuze)**: "Wat is het lekkerste avondeten?"
2. **Poll (meerdere keuzes)**: "Welke 3 snacks zijn het best?" (max N)
3. **Dit of dat**: snel duel A vs B, swipebaar. Leuk, en levert veel stemmen op.
4. **Voorspelling ja/nee**: "Wint Ajax de Eredivisie?" Ja/Nee + zekerheid (60/75/90%), of precies via een slider (1–99%).
5. **Voorspelling meerkeuze**: "Wie wint het WK?" Optie kiezen + zekerheid (volledige kansverdeling: backlog).

**Bereik (scope)** van een vraag: `GLOBAL` (hele wereld), `COUNTRY` (één land) of `REGION` (provincie/staat).

**Resultaten**: pas zichtbaar na je stem of na "overslaan". Totaal plus uitsplitsing per land (wereldkaart), regio, leeftijdsgroep en "jouw vrienden", altijd met de drempel van 10 stemmers.

**Sociaal**: profielen, volgen, overeenkomst-% met anderen, reacties, emoji-reacties, deelkaarten met de uitslag als plaatje, meldingen.

**Gamification**: XP voor meedoen, voorspelpunten voor nauwkeurigheid (los van XP), levels, streaks, badges, vraag van de dag, ranglijsten (per land, vrienden, wereld, categorie).

---

## Fase 0 — Fundament (monorepo & tooling)

- [ ] 0.1 `.gitignore` aanvullen, `.gitattributes` (`* text=auto eol=lf`, tegen CRLF-gedoe op Windows), `.editorconfig`, `.nvmrc` (Node 24 LTS) en `packageManager`-veld (pnpm) toevoegen
- [ ] 0.2 pnpm workspace (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`) met de taken `dev`, `build`, `lint`, `typecheck`, `test`
- [ ] 0.3 `packages/config`: gedeelde `tsconfig.base.json` (strict), ESLint flat config en Prettier config
- [ ] 0.4 `apps/web` aanmaken met `npx sv create` (SvelteKit, TypeScript, Tailwind v4, ESLint, Prettier, Vitest, Playwright)
- [ ] 0.5 `apps/api` aanmaken met de Nest CLI (strict TS, Jest), aangesloten op de gedeelde config
- [ ] 0.6 `packages/shared` aanmaken (zod, build via tsup of TS project references) en vanuit web en api importeren als smoke test
- [ ] 0.7 `docker-compose.yml`: postgres, postgres-test, redis, mailpit en minio, met healthchecks en named volumes
- [ ] 0.8 `.env.example` in de root en per app. Env-validatie met zod in api en web
- [ ] 0.9 husky + lint-staged (prettier + eslint op staged files)
- [ ] 0.10 GitHub Actions CI: install (met cache) → lint → typecheck → test → build, op elke push/PR
- [ ] 0.10b Security in CI vanaf dag 1: secret-scanning (gitleaks), CodeQL (JS/TS), `pnpm audit --prod` (faalt bij high/critical), Dependabot of Renovate
- [ ] 0.10c Subagents in `.claude/agents/` controleren tegen de echte scripts en paden. De review gate (AGENTS.md §6) geldt vanaf fase 1
- [ ] 0.11 `README.md`: korte projectbeschrijving + "lokaal draaien in 5 stappen"
- [ ] 0.12 ADR `docs/decisions/0001-stack.md`: waarom SvelteKit + NestJS + Prisma (samenvatting van de keuzes hierboven)
- [ ] 0.13 `AGENTS.md` §4 (commands) controleren en bijwerken naar de echte scripts

**Acceptatie:** `pnpm install && docker compose up -d && pnpm dev` start web (localhost:5173) en api (localhost:3000). `pnpm lint typecheck test build` is groen, lokaal en in CI.

---

## Fase 1 — Database & API-skelet

- [ ] 1.1 Prisma in `apps/api` opzetten, met een `PrismaService` als Nest-module en graceful shutdown
- [ ] 1.2 ID-strategie kiezen (cuid2 of UUIDv7) en vastleggen in een ADR
- [ ] 1.3 Kernschema modelleren (zie *Datamodel* onderaan) en de eerste migratie maken
- [ ] 1.4 Seed-script: alle landen (ISO), met `localEnabled` aan voor NL en BE en regio's voor NL en BE; de 10 categorieën uit "Lancering & landen" (NL+EN, Politiek met `sensitive = true`); 1 admin-gebruiker; ~20 voorbeeldvragen van alle types (development-data, niet de startcontent)
- [ ] 1.5 Globale Nest-setup: config-module (zod), `ZodValidationPipe`, exception filter met `{ code, message }`, request-logging (pino) zonder PII
- [ ] 1.6 `@nestjs/swagger` + `nestjs-zod`: OpenAPI op `/docs` (alleen in dev)
- [ ] 1.7 `health`-module: `/health` controleert db en redis
- [ ] 1.8 Redis-module + BullMQ-basis (queue-registratie, eerste dummy-job)
- [ ] 1.9 Rate-limiting (`@nestjs/throttler` met Redis-storage), standaardlimiet + per-route overrides
- [ ] 1.10 Testopzet: Jest-integratietests tegen de `postgres-test`-container (reset per testbestand)

**Acceptatie:** migraties draaien schoon op een lege db, de seed vult data, `/health` geeft 200, `/docs` toont de API en een integratietest leest seed-data uit.

---

## Fase 2 — Accounts & login

- [ ] 2.1 Better Auth integreren in NestJS. **Eerst de huidige docs en de NestJS-integratie controleren.** Werkt dat niet goed: fallback naar Passport-strategieën, vastgelegd in een ADR
- [ ] 2.2 E-mail + wachtwoord: registreren, inloggen, e-mailverificatie, wachtwoord vergeten/resetten
- [ ] 2.3 Magic link via e-mail (Mailpit lokaal, Resend in prod)
- [ ] 2.4 Google OAuth
- [ ] 2.5 Apple Sign In
- [ ] 2.6 Accounts koppelen: zelfde geverifieerd e-mailadres = zelfde gebruiker
- [ ] 2.7 Sessies: httpOnly cookie, `SameSite=Lax`, rotatie, uitloggen (ook "overal uitloggen")
- [ ] 2.8 Globale `AuthGuard` (default deny) + `@Public()` + `RolesGuard` met rollen `USER`, `MODERATOR` en `ADMIN`
- [ ] 2.9 Cloudflare Turnstile op registratie en magic-link-aanvraag (server-side verificatie)
- [ ] 2.10 Rate limits op login, registratie en magic link
- [ ] 2.11 Onboarding-gegevens (kort): unieke `username`, `displayName`, `countryCode` (voorstel via IP-geolocatie, gebruiker bevestigt), interesses, plus akkoord voorwaarden + 16+-bevestiging. Regio, geboortejaar en geslacht zijn optioneel en worden later via `PATCH /me` aangevuld (zie 6.9)
- [ ] 2.14 Gast-stem afronden: een "pending vote/skip" (vraag-id, optie(s), zekerheid) die vóór aanmelden is gekozen, wordt na aanmelden/onboarding één keer server-side ingediend (gevalideerd alsof de gebruiker het nu doet, de vraag moet nog open zijn)
- [ ] 2.12 `GET/PATCH /me`, avatar-upload naar S3/MinIO (resize, max-grootte, alleen afbeeldingen)
- [ ] 2.13 Tests: registratie → verificatie → login, magic link, guard-gedrag en rate limits

**Acceptatie:** een nieuwe gebruiker kan zich op alle 4 manieren aanmelden, onboarding afronden en `/me` ophalen. Niet-ingelogd krijgt 401 op beschermde routes.

---

## Fase 3 — Web-shell (SvelteKit)

- [~] 3.0 **Designrichting ter goedkeuring** (eigenaar). Eerste versie: https://claude.ai/artifact/27Jt9oFZeytMGGnwuu8XpU (wacht op feedback/akkoord). Inhoud: stijltegel + klikbare mockup als HTML-pagina met kleuren (honinggeel, warm), typografie, ronde vormen, eerste SVG-versie van de bij-mascotte, en de schermen home-feed, vraagkaart (voor/na stemmen), aanmeldsheet voor gasten, voorspelkaart (Ja/Nee + zekerheid) en Snel stemmen. Light + dark, mobiel + desktop. **Pas na akkoord UI-taken van fase 3 bouwen.** Tot die tijd mag de agent doorwerken aan andere niet-UI-taken
- [ ] 3.1 Tailwind v4-thema volgens de goedgekeurde designrichting: kleuren (design tokens, de volledige kleurentabel van de stijltegel in licht en donker), zelf gehoste lettertypen (Fredoka + Nunito), typografie, radius, schaduwen, dark mode (systeem + toggle), animatie-tokens (respecteert `prefers-reduced-motion`)
- [ ] 3.2 shadcn-svelte initialiseren: basiscomponenten (button, card, input, dialog, sheet, tabs, toast, avatar, dropdown)
- [ ] 3.3 Paraglide: locales `nl` en `en`, routes `/[locale]/...`, taaldetectie (cookie → Accept-Language → `en`), taalwisselaar
- [ ] 3.4 `hooks.server.ts`: `/api/*` proxyen naar NestJS (cookies doorgeven, origin-check), sessie ophalen naar `event.locals.user`
- [ ] 3.5 Typed API-client: types genereren uit OpenAPI (`openapi-typescript` + `openapi-fetch`), plus een gedeelde helper voor server- en client-calls
- [ ] 3.6 App-layout mobile-first: bovenbalk (logo, zoeken, profiel), onderste tabbalk op mobiel (Home, Ontdek, Voorspel, Meldingen, Profiel), zijbalk op desktop
- [ ] 3.7 Auth-pagina's: inloggen, registreren, magic link verstuurd, wachtwoord vergeten/reset, e-mail geverifieerd
- [ ] 3.8 Onboarding-flow (kort, met de bij als gids): username → land → interesses (categorieën). Daarna direct terug naar de vraag waar de gast op tikte (pending vote indienen, uitslag tonen)
- [ ] 3.8b Aanmeldsheet voor gasten: bottom sheet "Laat je stem tellen!" met Google, Apple en e-mail. Gekozen optie blijft zichtbaar geselecteerd. Pending vote bewaren in sessionStorage + cookie, zodat hij een OAuth-redirect overleeft
- [ ] 3.9 Routebescherming: ingelogd-only pagina's redirecten naar login met `redirectTo`
- [ ] 3.10 Foutpagina's (404/500) vertaald, en API-foutcodes gemapt naar vertaalde meldingen
- [ ] 3.11 SEO-basis: `<SeoHead>`-component (title, description, canonical, hreflang, OG/Twitter), `robots.txt`
- [ ] 3.12 Playwright e2e: registreren → onboarding → op home landen

**Acceptatie:** volledige aanmeld- en onboardingflow werkt in de browser in NL en EN, op mobiel en desktop, in light en dark.

---

## Fase 4 — Polls (kern-MVP)

### API
- [ ] 4.1 `questions`-module: vraag aanmaken/bewerken (admin) met vertalingen, opties (+ optionele afbeelding), categorie, scope, open- en sluitdatum
- [ ] 4.2 Vraagstatussen + overgangen: `DRAFT → OPEN → CLOSED` (en `ARCHIVED`). Een scheduled job opent en sluit op tijd
- [ ] 4.3 Vraag ophalen via slug/id met vertaling in de gevraagde taal (fallback `defaultLocale`)
- [ ] 4.4 `votes`-module: stem uitbrengen (single/multi met `maxChoices`), DB-unique constraint, transactie, en stem wijzigen zolang de vraag open is (standaard aan, per vraag uit te zetten). Aggregaten worden bij wijzigen correct bijgewerkt (oude optie −1, nieuwe +1)
- [ ] 4.4b "Overslaan": `QuestionSkip` registreren. Wie overslaat krijgt de uitslag, maar stemmen daarna geeft `VOTE_AFTER_SKIP_NOT_ALLOWED`
- [ ] 4.5 Demografische snapshot bij de stem opslaan (land, regio, leeftijdsgroep, geslacht), zodat resultaten kloppen als iemand later verhuist
- [ ] 4.6 `results`-module: tellingen per optie, aggregaten bijwerken in dezelfde transactie (of via queue) met tabel `ResultAggregate`
- [ ] 4.7 Uitsplitsingen: per land, regio, leeftijdsgroep en geslacht, met **k-anonimiteit (≥ 10)** afgedwongen in de service + unit tests
- [ ] 4.8 Resultaten (en reacties) pas teruggeven als de gebruiker gestemd of overgeslagen heeft, of als de vraag gesloten is. Gasten krijgen geen resultaten via de API
- [ ] 4.9 Feed-endpoints (cursor-paginatie): `trending` (stemmen laatste 24 u, tijdsverval), `nieuw`, `lokaal` (scope = jouw land/regio), `per categorie`. Standaard verbergen waar je al op stemde (optioneel tonen)
- [ ] 4.10 Zoeken op vraagtitel (Postgres full-text, per taal)

### Web
- [ ] 4.11 Vraagkaart-component: titel, opties, stemmen in één tap, "overslaan"-link, en na stemmen een speelse animatie naar resultaatbalken met percentages. Voor gasten opent een tik de aanmeldsheet (3.8b)
- [ ] 4.12 Home-feed met tabs Trending / Lokaal / Nieuw, infinite scroll, en een knop "⚡ Snel stemmen"
- [ ] 4.12b **Snel stemmen**-modus: één vraag per scherm, swipen of tikken naar de volgende, uitslag kort tonen na elke stem. Knop "Volgende vraag" registreert geen skip. Werkt met toetsenbord en zonder swipe (toegankelijk)
- [ ] 4.12c **Carrousel "Uitgelicht"** bovenaan de home: vraag van de dag + nieuwste vragen (API: endpoint `featured` met de vraag van de dag + de nieuwste open vragen voor jouw land en globaal, zonder vragen waarop je al stemde). Stemmen in de dia, automatisch wisselen (6 s) met pauzeknop, pauzeren bij hover/focus/aanraken/na stemmen/"minder beweging", volgens het WAI-ARIA carrousel-patroon
- [ ] 4.13 Vraagpagina `/[locale]/q/[slug]`: SSR, volledige resultaten, uitsplitsing-tabs, "wat stemde jouw land vs de wereld"
- [ ] 4.14 Categoriepagina's + Ontdek-pagina (categorieën, zoeken)
- [ ] 4.15 Admin (minimaal): vragenlijst, vraag aanmaken/bewerken met vertalingen NL+EN, opties sorteren, statusbeheer
- [ ] 4.16 SEO: vraagpagina's indexeerbaar, `sitemap.xml` (per taal, met hreflang), gestructureerde data waar zinvol
- [ ] 4.17 Tests: unit (aggregatie, k-anonimiteit, trending-score), integratie (stem → resultaten), e2e (stemmen → resultaat zien)

**Acceptatie:** een gebruiker opent de home-feed, stemt met één tap, ziet direct de uitslag met uitsplitsing per land, en kan niet twee keer stemmen. Een admin maakt een tweetalige vraag aan die op tijd opent en sluit.

---

## Fase 5 — Voorspellingen & scoring

- [ ] 5.1 `forecasts`-module: forecast plaatsen/aanpassen zolang de vraag open is. Opslag altijd als kans 1–99% (de zekerheidsknoppen zijn 60/75/90% op Ja of Nee, dus Nee + "Heel zeker" = 10% kans op Ja). Meerkeuze: optie + zekerheid. Elke wijziging in `ForecastHistory`
- [ ] 5.2 Crowd-forecast: gemiddelde/mediaan kans van de massa, als tijdreeks opgeslagen (uurlijkse snapshot-job) voor de grafiek
- [ ] 5.3 Resolutie door een admin: uitkomst kiezen of `ANNULLED` (bij onduidelijkheid), met verplichte bron-URL en notitie. Status `RESOLVED`
- [ ] 5.4 **Scoringvoorstel uitwerken** in een ADR, ter goedkeuring van de eigenaar: tijdgewogen Brier-score (je forecast telt voor elke dag dat de vraag open was, zodat last-minute instappen niet loont), punten t.o.v. de crowd (`punten = schaal × (crowdBrier − jouwBrier)`), en een kleine meedoe-bonus
- [ ] 5.5 `scoring`-module: scores berekenen in een BullMQ-job na resolutie, idempotent (opnieuw draaien geeft hetzelfde resultaat), met heldere unit tests op randgevallen
- [ ] 5.6 Ranglijsten via Redis sorted sets + periodieke persist: wereld, per land, per categorie, vrienden, deze maand en all-time
- [ ] 5.7 Kalibratie-statistiek per gebruiker ("als je 70% zegt, klopt het 68% van de keren")
- [ ] 5.8 Web: voorspelkaart met Ja/Nee → zekerheid ("Beetje" 60%, "Vrij zeker" 75%, "Heel zeker" 90%), "⚙ Precies instellen" klapt een slider (1–99%) uit, crowd-grafiek over tijd (na je eigen forecast), countdown tot sluiting. De bij reageert bij resolutie (juichen of troosten)
- [ ] 5.9 Web: "Voorspel"-tab met open voorspellingen, binnenkort sluitend, en jouw lopende voorspellingen
- [ ] 5.10 Web: resolutiescherm ("Je zat goed! +42 punten") + ranglijstpagina's
- [ ] 5.11 Admin: resolutie-wachtrij (vragen voorbij `resolvesAt`), resolutieformulier
- [ ] 5.12 Tests: Brier-berekening, tijdweging, idempotentie, e2e forecast → resolutie → punten

**Acceptatie:** gebruikers voorspellen met een kans, zien de crowd-voorspelling, en krijgen na resolutie correcte punten die op de ranglijsten verschijnen.

---

## Fase 6 — Lokale laag (elk land lokaal)

- [ ] 6.1 Landen- en regiodata compleet (ISO 3166-1/2) met namen in NL en EN, in `packages/shared`
- [ ] 6.9 Progressieve profielvragen: op slimme momenten (bijv. na 5 stemmen, of bij het openen van de uitsplitsing) een kaartje "Wil je zien hoe jouw leeftijdsgroep/provincie stemt?", met geboortejaar, geslacht of regio invullen in één tik. Wegklikbaar, maximaal 1× per week tonen
- [ ] 6.2 Feed-personalisatie: mix van lokaal (jouw land/regio, alleen als `localEnabled`), globaal en categorieën uit je interesses
- [ ] 6.2b Landen zonder lokale content: de "Lokaal"-tab toont de bij met "Lokaal komt eraan in <land>", hoeveel gebruikers er nog nodig zijn, en een knop "Word ambassadeur"
- [ ] 6.3 Landpagina `/[locale]/land/[cc]`: "Wat denkt Nederland?" met top-vragen, recente uitslagen, lokale ranglijst. Alleen voor landen met `localEnabled`
- [ ] 6.10 Uitbreidingsdashboard (admin): per land maandelijks actieve gebruikers, aantal (kandidaat-)ambassadeurs, ingediende lokale vragen, en een "klaar voor lokaal"-indicator op basis van de drempels. De knop `localEnabled` aanzetten is alleen voor de eigenaar/admin
- [ ] 6.4 Wereldkaart-component (d3-geo + world-atlas TopoJSON): kleur per land = meest gekozen optie of % voor optie X, met tooltip. Landen onder de drempel grijs
- [ ] 6.5 Landvergelijking op een vraagpagina: "Nederland vs België vs Duitsland"
- [ ] 6.6 Regio-uitsplitsing per land (provincies), zelfde drempel
- [ ] 6.7 Vragen per land in de lokale taal. Wordt een vraag getoond aan iemand met een andere UI-taal: tonen met taallabel (vertalen kan later met AI, zie backlog)
- [ ] 6.8 Land-detectie: mismatch tussen opgegeven land en IP over langere tijd markeren voor de trust score (niet blokkeren)

**Acceptatie:** een Nederlandse gebruiker ziet vooral Nederlandse en globale vragen, kan per vraag de wereldkaart bekijken, en een landpagina laat zien wat dat land denkt.

---

## Fase 7 — Sociaal

- [ ] 7.1 Publieke profielpagina `/[locale]/u/[username]`: avatar, level, badges, voorspel-ranking, kalibratie, publiek gemaakte stemmen
- [ ] 7.2 Privacy-instellingen: profiel publiek/privé, stemmen standaard privé, per stem "openbaar maken"
- [ ] 7.3 Volgen/ontvolgen, volgers/volgend-lijsten, "vrienden" = wederzijds volgen
- [ ] 7.4 Overeenkomst-%: per gebruikerspaar berekenen over gedeelde vragen (job + cache), tonen op het profiel ("Je bent het 72% eens met Sam")
- [ ] 7.5 Resultaten-uitsplitsing "jouw vrienden" (zelfde k-drempel, of alleen als vrienden hun stem openbaar maakten)
- [ ] 7.6 Reacties onder vragen: threads (1 niveau diep), bewerken/verwijderen, sorteren op populair/nieuw, rate-limited. Pas zichtbaar na je stem (tegen beïnvloeding)
- [ ] 7.7 Emoji-reacties op vragen en reacties
- [ ] 7.8 Deelkaarten: dynamische OG-afbeelding per vraag met de actuele uitslag (satori + resvg in een SvelteKit-endpoint, gecachet) + native share-knop
- [ ] 7.9 In-app meldingen: iemand volgt je, reactie op jouw reactie, voorspelling opgelost, vraag van vrienden. Meldingenpagina + badge-teller
- [ ] 7.10 Vrienden uitnodigen: persoonlijke invite-link (meten wie wie aanbrengt, badge als beloning)

**Acceptatie:** gebruikers kunnen elkaar volgen, zien hun overeenkomst-%, reageren onder vragen, en een gedeelde link toont een preview-plaatje met de uitslag.

---

## Fase 8 — Gamification

- [ ] 8.1 XP-regels (stemmen, voorspellen, dagelijkse login, reacties met likes) + levels (curve in `packages/shared`). XP staat los van voorspelpunten
- [ ] 8.2 Streaks: dagen op rij actief (in de tijdzone van de gebruiker), met een "streak freeze" (1× per week)
- [ ] 8.3 Badges: definities + automatische toekenning via events (eerste stem, 7-daagse streak, 10 goede voorspellingen, top 10 in je land, …)
- [ ] 8.4 Vraag van de dag: per land en globaal, gekozen door een admin of automatisch (trending), uitgelicht bovenaan
- [ ] 8.5 "Dit of dat"-duels in de Snel stemmen-modus (4.12b): A vs B, swipe links/rechts, met reeksen ("10 snelle duels over eten")
- [ ] 8.9 De bij-mascotte overal inzetten: lege staten, onboarding, streak-mijlpalen, badges, resolutie (juichen of troosten), foutpagina's
- [ ] 8.6 Wekelijkse recap: "Deze week stemde je 34×, je zat 5× goed, je bent #120 in Nederland"
- [ ] 8.7 Anti-farming: XP-plafond per dag, geen XP voor stem wijzigen, alleen gelikete reacties tellen

**Acceptatie:** actief zijn levert zichtbaar XP, levels, streaks en badges op, er is elke dag een uitgelichte vraag, en de swipe-modus werkt soepel op mobiel.

---

## Fase 9 — Vragen van gebruikers & moderatie

- [ ] 9.1 Gebruikers kunnen een vraag indienen (vanaf level X of na Y dagen): formulier met preview, typekeuze, scope, categorie, opties
- [ ] 9.2 Duplicaatdetectie bij indienen: vergelijkbare bestaande vragen tonen (full-text/trigram)
- [ ] 9.3 Moderatiewachtrij: goedkeuren / afwijzen (met reden) / aanpassen. Gebruikers met hoge trust publiceren direct
- [ ] 9.4 Melden: vragen, reacties en gebruikers, met reden. Na N meldingen automatisch verbergen tot een moderator kijkt
- [ ] 9.5 Woordfilter (NL+EN scheldwoorden/spam) op vragen, reacties en usernames
- [ ] 9.6 Trust score per gebruiker (accountleeftijd, geverifieerd, meldingen, gedrag), gebruikt voor publicatierechten en rate limits
- [ ] 9.7 Moderatoracties: verbergen, verwijderen, gebruiker waarschuwen/schorsen/bannen. Alles in een `AuditLog`
- [ ] 9.8 Admin-dashboard: statistieken (nieuwe gebruikers, stemmen/dag, actieve vragen), wachtrijen, gebruikersbeheer
- [ ] 9.9 Verdachte stempatronen detecteren (veel nieuwe accounts die op één vraag stemmen, zelfde IP/device) → markeren, niet automatisch verwijderen

### Ambassadeurs
- [ ] 9.10 Ambassadeur-aanmelding: formulier (land/regio, motivatie), voorwaarden zichtbaar (level, trust), status in je profiel
- [ ] 9.11 Goedkeuren/afwijzen door eigenaar/admin. Status `APPLIED → PROBATION (30 dagen) → ACTIVE`, en `REVOKED` op elk moment. Rechten zijn gebonden aan land/regio via een guard (`@AmbassadorOf(countryCode)`)
- [ ] 9.12 Rechten per fase: proeftijd (voorstellen met voorrang in de wachtrij, meldingen afhandelen), actief (lokale niet-politieke vragen direct publiceren, lokale wachtrij modereren). Alles in de `AuditLog`
- [ ] 9.13 Ambassadeur-dashboard: lokale wachtrij, meldingen uit hun land, statistieken van hun vragen. Badge en rang "Ambassadeur 🇳🇱" op het profiel

### Politieke vragen
- [ ] 9.14 Categorieën met `sensitive = true` (Politiek): altijd via de moderatiewachtrij, ongeacht trust of rol (behalve admin). Moderatie-checklist "neutrale formulering, geen privépersonen"
- [ ] 9.15 Label "Geen representatieve peiling" op vraagkaart, uitslag en deelkaart van gevoelige vragen (NL+EN)
- [ ] 9.16 Nieuwe-accountregel: stemmen van accounts jonger dan 7 dagen worden opgeslagen, maar pas na 7 dagen meegeteld in de uitslag van gevoelige vragen. Aggregatie houdt hier rekening mee + tests
- [ ] 9.17 Verkiezingsstilte: tabel `ElectionBlackout` (land, start, eind, notitie), beheerd door een admin. Tijdens de periode zijn de uitslagen van politieke vragen over dat land verborgen (API én deelkaarten). Stemmen blijft mogelijk
- [ ] 9.18 Uitzoeken welke regels NL en BE hebben voor het publiceren van peilingen rond verkiezingen, met bronnen in `docs/legal/election-rules.md`. **De eigenaar laat dit juridisch bevestigen.** Geen aannames als feit opschrijven

**Acceptatie:** gebruikers dienen vragen in, moderatoren handelen ze af in een wachtrij, meldingen werken, en alle moderatoracties zijn terug te vinden in de audit log.

---

## Fase 10 — PWA & pushmeldingen

- [ ] 10.1 Web app manifest (naam, iconen in alle maten, themakleur, `display: standalone`)
- [ ] 10.2 Service worker (SvelteKit `service-worker.ts` of `@vite-pwa/sveltekit`): app-shell cachen, offline-pagina
- [ ] 10.3 Installatie-prompt op een slim moment (na 3 stemmen), met iOS-instructie ("Zet op beginscherm")
- [ ] 10.4 Web Push (VAPID): opt-in na een waardevol moment, abonnementen opslaan, versturen via BullMQ
- [ ] 10.5 Pushtypes (standaard **actief**) + instellingen per type: vraag van de dag, trending vragen, vrienden die stemmen, wekelijkse recap, voorspelling opgelost, iemand reageert, streak in gevaar
- [ ] 10.5b Push-limieten: max 3 per dag per gebruiker (prioriteit: opgelost > reactie > streak > vraag van de dag > vrienden > trending), stille uren 22:00–08:00 in de tijdzone van de gebruiker, bundelen ("3 vrienden stemden op …")
- [ ] 10.6 Lighthouse-check: PWA installable, performance ≥ 90 op mobiel

**Acceptatie:** de site is installeerbaar op Android en iOS, opent standalone, en gebruikers krijgen pushmeldingen die ze per type kunnen uitzetten.

---

## Fase 11 — Privacy, juridisch & security-hardening

- [ ] 11.1 Data-export (`/me/export` → JSON-download met al je gegevens)
- [ ] 11.2 Account verwijderen: persoonsgegevens hard verwijderen, stemmen geanonimiseerd bewaren voor aggregaten, 14 dagen bedenktijd
- [ ] 11.3 Privacyverklaring, gebruiksvoorwaarden en community-richtlijnen (NL+EN). **Eigenaar laat juridisch checken**
- [ ] 11.4 Cookieloze analytics (Umami/Plausible) + overzicht van welke cookies er zijn (alleen functioneel, geen cookiebanner nodig)
- [ ] 11.5 Security headers + CSP afstemmen (ook voor OG-afbeeldingen en analytics)
- [ ] 11.6 Audit van alle endpoints: authZ, rate limits en input-validatie (checklist in `docs/security.md`), uitgevoerd door `security-reviewer` over de hele codebase
- [ ] 11.7 AuthZ-testmatrix: geautomatiseerde test die voor **elk** endpoint 401 (niet ingelogd), 403 (verkeerde rol/eigenaar) en 400 (ongeldige input) controleert, zodat een vergeten guard de CI laat falen
- [ ] 11.7b OWASP ZAP baseline-scan (passief) tegen de **eigen staging-omgeving** in CI, resultaten beoordelen en oplossen
- [ ] 11.7c Threat model (STRIDE, 1 pagina) in `docs/security.md`: stemfraude, nepaccounts, scraping, privacy-lekken via uitsplitsingen
- [ ] 11.8 Back-ups: dagelijkse Postgres-dump naar aparte opslag, restore-procedure getest en beschreven
- [ ] 11.9 Sentry in web en api (zonder PII), uptime-monitoring op `/health`

**Acceptatie:** een gebruiker kan zijn data exporteren en zijn account verwijderen, juridische pagina's staan online, de security-checklist is volledig afgevinkt en een restore is aantoonbaar getest.

---

## Fase 12 — Lancering

- [ ] 12.1 Hosting-keuze maken (zie Open vragen) en uitwerken: Dockerfiles (multi-stage) voor web en api, productie-compose of platformconfig
- [ ] 12.2 Staging-omgeving (zelfde setup, aparte db) + deploy-pipeline: `main` → staging automatisch, productie via handmatige promote/tag
- [ ] 12.3 Domeinen: `guesshive.com` live (HTTPS), `.net`, `.eu` en `.nl` als 301-redirects (`.nl` → `/nl`)
- [ ] 12.4 Productie-mail: Resend met SPF/DKIM/DMARC op het eigen domein
- [ ] 12.5 OAuth-apps in productie: Google Cloud Console en Apple Developer (eigenaar regelt de accounts)
- [ ] 12.6 Startcontent (concept door de agent, mag al eerder klaargezet worden): ±100 vragen (±50 lokaal NL/BE, ±50 globaal, over alle 10 categorieën, NL+EN), 10 lopende voorspellingen, vraag van de dag voor 2 weken vooruit, als `seed/launch-content.json` + import-script
- [ ] 12.6b **Eigenaar keurt de startcontent** (goedkeuren / aanpassen / schrappen) vóór de import in productie
- [ ] 12.7 Loadtest (k6): 500 gelijktijdige stemmers, p95 < 300 ms op stemmen en feed
- [ ] 12.8 Deploy-checklist + rollback-procedure in `docs/deploy.md`
- [ ] 12.9 Soft launch: vrienden en familie, feedbackformulier in de app, bugs oplossen
- [ ] 12.10 Publieke lancering NL

**Acceptatie:** GuessHive draait in productie op `guesshive.com`, met monitoring, back-ups, een geteste rollback en startcontent.

---

## Backlog (na lancering, niet beginnen zonder akkoord)

- Realtime live-uitslagen (SSE of WebSocket) bij populaire vragen
- **AI-nieuwssuggesties** (besloten, eerste item na lancering): dagelijkse job per land met `localEnabled` leest koppen en links uit openbare RSS-feeds (bijv. NOS, VRT), Claude Haiku stelt 5–10 neutrale vragen voor (NL+EN), en die komen in de wachtrij voor ambassadeurs/admins. Nooit artikeltekst overnemen. Vereist een Anthropic API-account (eigenaar) en een kostenlimiet
- AI-vertaling van vragen (zodat lokale vragen ook voor anderen leesbaar zijn) en AI-moderatie
- Meer talen: DE, FR, ES (alleen vertalen dankzij de i18n-opzet)
- Privé-groepen ("vriendengroep", "klas", "kantoor") met eigen vragen en ranglijsten
- Toernooien/seizoenen voor voorspellingen (bijv. "EK-voorspelcompetitie")
- Embeds: poll insluiten op andere websites of in nieuwsartikelen
- Publieke data-API / datasets voor journalisten (geaggregeerd)
- Native apps (Capacitor-wrapper rond de PWA, of native)
- Meerkeuze-voorspellingen met volledige kansverdeling over de opties
- Optie-suggesties door gebruikers ("Staat jouw antwoord er niet bij?")

---

## Datamodel (startpunt voor fase 1)

Richtlijn, geen keurslijf: aanpassen mag, maar dan ook hier bijwerken.

```
User            id, email, emailVerified, username (uniek), displayName, avatarUrl,
                countryCode, regionCode?, birthYear?, gender?, locale, timezone,
                role (USER|MODERATOR|ADMIN), trustScore, xp, level,
                currentStreak, longestStreak, lastActiveDate,
                profileVisibility (PUBLIC|PRIVATE), createdAt, deletedAt?
Account/Session/Verification   (tabellen van Better Auth)

Country         code (PK), names (json nl/en), localEnabled, localEnabledAt?
Region          code (PK), countryCode, names (json)
Category        id, slug, names (json), icon, sortOrder, sensitive (bool)
Ambassador      id, userId, countryCode, regionCode?, status (APPLIED|PROBATION|ACTIVE|REJECTED|REVOKED),
                motivation, appliedAt, decidedById?, decidedAt?, probationEndsAt?
ElectionBlackout id, countryCode, startsAt, endsAt, note, createdById

Question        id, shortId, slug, type (POLL_SINGLE|POLL_MULTI|THIS_OR_THAT|
                PREDICTION_BINARY|PREDICTION_CHOICE), status (DRAFT|PENDING_REVIEW|
                OPEN|CLOSED|RESOLVED|ANNULLED|REJECTED|ARCHIVED),
                scope (GLOBAL|COUNTRY|REGION), countryCode?, regionCode?,
                defaultLocale, authorId, categoryId, maxChoices, allowVoteChange,
                imageUrl?, opensAt, closesAt, resolvesAt?, resolvedOptionId?,
                resolutionSource?, resolutionNote?, resolvedAt?, resolvedById?,
                voteCount (denormalized), createdAt
QuestionTranslation  questionId + locale (PK), title, description?
Option          id, questionId, position, imageUrl?
OptionTranslation    optionId + locale (PK), label

Vote            id, questionId, optionId, userId, createdAt,
                snapCountry, snapRegion?, snapAgeBucket?, snapGender?
                UNIQUE(questionId, userId, optionId)
QuestionSkip    questionId + userId (PK), createdAt
Forecast        id, questionId, userId, optionId?, probability (1-99), updatedAt
                UNIQUE(questionId, userId)
ForecastHistory id, forecastId, optionId?, probability, createdAt
CrowdSnapshot   questionId, optionId?, probability, forecasterCount, takenAt
PredictionScore questionId + userId (PK), brier, crowdBrier, points, computedAt

ResultAggregate questionId, optionId, dimension (ALL|COUNTRY|REGION|AGE|GENDER),
                dimensionValue, count       PK(questionId, optionId, dimension, dimensionValue)

Follow          followerId + followeeId (PK), createdAt
Agreement       userAId + userBId (PK), sharedCount, agreeCount, updatedAt
Comment         id, questionId, userId, parentId?, body, status, createdAt, editedAt?, deletedAt?
Reaction        id, userId, targetType (QUESTION|COMMENT), targetId, emoji
Notification    id, userId, type, payload (json), readAt?, createdAt
PushSubscription id, userId, endpoint, keys (json), createdAt

Badge           id, slug, names (json), descriptions (json), icon
UserBadge       userId + badgeId (PK), awardedAt
XpEvent         id, userId, type, amount, refId?, createdAt
Invite          id, inviterId, code, usedById?, usedAt?

Report          id, reporterId, targetType, targetId, reason, status, handledById?, createdAt
AuditLog        id, actorId, action, targetType, targetId, meta (json), createdAt
```

Belangrijke indexen: `Question(status, scope, countryCode, opensAt)`, `Question(categoryId, status)`, `Vote(questionId)`, `Vote(userId)`, `Forecast(questionId)`, `Comment(questionId, createdAt)`, `Notification(userId, readAt)`, plus full-text index op `QuestionTranslation(title)` per taal.
