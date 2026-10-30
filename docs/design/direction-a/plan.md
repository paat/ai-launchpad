# Implementation plan — direction A „Selge leht” onto `src/views.ts`

Written 30 Oct 2026. Inputs: `design/critique.md`, `design/directions.md`, prototypes `design/proto/{landing,approval,tana}.html` (source of truth for CSS: `design/proto/src/base.css`), screenshots `design/shots/`. Landing copy aligned with branch `feat/landing-jobs-first` (card „Maksemeeldetuletus · 1/3”, „Järgmised saadan ise.” and the KMD offer as two bubbles, beat `b-ai3`).

All CSS lives in the single `CSS` template literal in `src/views.ts` (lines 24–334 today). The literal is three layers: a legacy block with hard-coded hex (`body`, `.card`, `nav.main`, `button`, `.notice`, `.quote`, `.note`, `details`, `pre`), the `:root` token block, and the per-feature additions. The plan replaces the legacy hex with tokens instead of adding a fourth layer.

Constraints honoured throughout: no new runtime dependencies (system font stack, CSS only); no `<script>` on the landing (`tests/ui-redesign.test.ts` already asserts this); label kinds unchanged (`label-chip--official | --rule | --assistant | --owner | --sample`, plus the existing `--ai` and `--where`); copy unchanged unless named below; every tap target ≥ 44 px; no horizontal overflow 320–1280 px (`tests/ui-redesign.browser.mjs` asserts this at 320/390/1280); WCAG 2.2 AA (contrast values in `directions.md`, focus ring 3 px `#1F5FD6`, target size 2.5.8, reduced motion).

Prototype deviations **not** to ship: the landing sub-line „Tasuta. Midagi ei saadeta ilma sinu loata.” (pricing is not decided; the trust band already says the second half); the proto's `nav.tabs` / `.ticket` / `.sum` / `.section` class names where an existing class can be restyled instead (see each task). Fewer renamed classes = fewer test edits.

## 1. Tokens that change

Edit the `:root` block. Old → new. Everything not listed stays.

| Token | Today | New | Why |
|---|---|---|---|
| `--c-bg` | `#eceee6` | `#fff` | white canvas (critique #1, #4) |
| `--c-surface-2` | `#f6f7f1` | `#F4F6F2` | quiet blocks |
| `--c-surface-3` | `#eef1e7` | alias of `--c-surface-2` | one quiet grey, not two |
| `--c-text` | `#1a241d` | `#14201A` | 16.8:1 on white |
| `--c-muted` | `#4d5a48` | `#4F5B53` | 7.1:1 on white, 6.5:1 on surface-2 |
| `--c-primary` | `#1a4d2e` | `#1B5E3B` | white on it 7.8:1 |
| `--c-link` | `#155e33` | `var(--c-primary)` | one green |
| `--c-border` | `#d9ded2` | `#DCE2DA` | |
| `--c-divider` | `#e7ebdd` | `#E6EAE3` | |
| `--c-danger` | `#8f1d1d` | `#B42318` | 6.6:1, used by Keeldu text button |
| `--c-deep`, `--c-mint` | — | `#0F3D25`, `#A3E0B5` | brand mark, trust band, receipt check |
| `--c-att`, `--c-att-dark`, `--c-att-bg`, `--c-att-bd` | — | `#9A4A00`, `#6B4E00`, `#FFF4D6`, `#F0C36B` | amber = "needs you" only (critique #6) |
| `--st-waiting-*` | `#fdf3d7 / #6b4e00 / #e3c878` | the `--c-att-*` values | same meaning, same colour |
| `--st-approved-bg` | `#1a4d2e` | `var(--c-primary)` | |
| `--st-rejected-fg`, `--st-void-fg` | `#8f1d1d` | `var(--c-danger)` | |
| `--lbl-sample-*` | `#fdf3d7 / #6b4e00 / #b08a1e` | `transparent / #4F5B53 / #8A948C`, dashed | sample is neutral, not amber |
| `--lbl-owner-bg/bd` | `#1a4d2e` | `#14201A` | owner = ink, distinct from action green |
| `--lbl-rule-fg/bd`, `--lbl-official-bd` | `#1a4d2e`, `#a9d1b2` | `#1B5E3B`, `#B9DCC2` | |
| `--fs-sm` | `.875rem` | `.9375rem` | meta text readable on a phone |
| `--fs-h1`, `--fs-h2`, `--fs-display`, `--fs-amount` | — | `clamp(1.75rem,5.5vw,2.5rem)`, `1.25rem`, `clamp(2.125rem,6.5vw,3.25rem)`, `2.75rem` | three real type steps (critique #4); keep `--fs-xl`/`--fs-2xl` for the deadline tile |
| `--s-12`, `--s-16` | — | `48px`, `64px` | section gaps |
| `--r-md`, `--r-lg`, `--r-xl` | `10 / 12 / 16px` | `12 / 16 / 20px` | buttons 12, cards 16, ticket 20 |
| `--ease`, `--t-fast`, `--t-med` | — | `cubic-bezier(.2,.7,.2,1)`, `160ms`, `200ms` | one motion vocabulary |
| `html{font-size}` | 100 % | `106.25%` at ≤ 480 px | 17 px body on phones |

## 2. Component changes (what each task touches)

- **Shell** (`shell()`): brand becomes `<a class="brand" href="/">` with a 24 px mark and mint check; `nav.main` restyled as three text tabs with an underline indicator (class name kept); the sample marker becomes one `<p class="sample-bar">` under the nav containing the existing `label-chip--sample` chip plus company/„päriselt ei saadeta”; footer becomes a row of ≥ 44 px links with „Logi välja” last (form kept).
- **Buttons**: primary 56 px (`--fs-lg`, radius `--r-md`); `.secondary` outlined; new `.text` (and `.text.danger`) 44 px text button. Never two filled primaries on one screen.
- **Sections** (Täna, approvals list, Ühendus): `section.card` → `section.section` (divider on top, no box); `.card` stays for the public card, service cards, consent.
- **Ask card** (Täna „Ootab sinult”): pending/failed `a.link-row` gains `.ask` (4 px amber bar, shadow, chevron); `.ask-row` items that are not links use `.ask.ask--note` (grey bar). Only these are elevated.
- **Ticket** (approval card): `article.card` → `article.card.ticket`; new `.strip` (`--wait` amber, `--ok` green with `.stamp`), `.kind` line, `h1`, `.why`, `.amount` hero figure, `.facts` as a two-column `dl` grid (markup kept: `dl.facts` + `.fact-row`), `pre.letter` quiet block, `.hand` sentence, **sticky `.decide` bar** (phone only) holding „Kinnita täpselt see” + text „Keeldu”, `.callout` replaces `.notice` on the approved state, `.standing-offer` as one sentence + primary + `<details>` „Muuda piire”.
- **Deadline row**: `.handoff` and `.quote` move inside `<details class="plain"><summary>Kes mida teeb</summary>`; title `--fs-lg`, one reason line; source link `.src`.
- **Täna hero**: `section.card.hero` → `section.hero` (no box); `.today-sum` restyled as three pill anchors (markup kept); `.tana-grid` two columns ≥ 960 px.
- **Landing**: markup kept except the jobs `<section>` moves inside `.landing-hero` as the third grid child (`"text phone" "jobs phone"` ≥ 880 px) so the four jobs sit in the first desktop fold; `.landing-hero h1` uses `--fs-display`; `.phone` 600 px (the six-beat final frame needs ~590 px at 390 px; verify in the fold shot); `.how` and `.jobs` lose the box border on phone and keep a 1 px divider; `.trust` uses `--c-deep`.

## 3. Tasks (ordered by wow per effort)

### T1 — Tokens, type, shell: white page with one sample bar (0.5 day)

Scope: the `:root` edits above; rewrite the legacy hex rules (`body`, `.wrap`, `header.top`, `.mark`, `.brand`, `nav.main`, `a`, `.card`, `.hero`, `.lede`, `button/.btn`, `input`, `details`, `h1/h2/h3`, `pre`, `.quote`, `.notice`, `.note`, `.row`, `.pill`, `footer`) in terms of tokens; `html{font-size:106.25%}` ≤ 480 px; shell changes (brand link, tab underline, `.sample-bar`, footer row); remove the per-card `sampleC` chip from `approvalCardBody` and the header chip (the bar is the one marker; the Tulekul company-source chip stays because it labels the data source, which is a label kind).

Acceptance:
- Visual: all owner pages on a white canvas, no boxed nav, exactly one „Näidis” marker above the content at 390 and 1280 px; compare with `design/shots/tana-390-fold.png` header area.
- A11y: contrast of every token pair ≥ 4.5:1 (table in `directions.md`); `aria-current="page"` tab has a non-colour indicator (underline); brand link, lang toggle, footer links ≥ 44 px (`npm run test:browser` geometry assertion).
- Tests to update: `tests/ui-redesign.test.ts:35` (nav regex: markup unchanged, keep; only if the brand becomes a link does the regex need the `<a class="brand"` prefix removed from the match), `:38` and `:67` (sample chip now inside `.sample-bar`, string still present → no change), `e2e/browser.spec.ts:25` `header .label-chip--sample` → `.sample-bar .label-chip--sample`, `e2e/demo-path.spec.ts:22` `main .label-chip--sample` → `.sample-bar .label-chip--sample`; `tests/catalogue.test.ts:151`, `tests/scopes.test.ts:252` unchanged (`nav.main` kept).

### T2 — Approval ticket with the decision pinned to the thumb (1 day)

Scope: `approvalCardBody` pending/approved/rule-approved/consumed/declined states → ticket structure; `.decide` sticky bar at ≤ 879 px with `padding-bottom:max(12px,env(safe-area-inset-bottom))` and `body{scroll-padding-bottom:88px}` so a focused element is never hidden under it; decline as `button.text.danger`; `standingOffer` sentence form: „Luba edaspidi sarnased automaatselt: ainult {saaja}, kuni {cap} €” + `ruleLimits` + primary „Luba automaatselt”, radios and cap input inside `<details><summary>Muuda piire</summary>` (same field names, same endpoint); approved strip with `.stamp` check (300 ms stroke draw, off under reduced motion); `stateLine` restyled as `.steps` (classes kept).

Acceptance:
- Visual: at 390×844 the „Kinnita täpselt see” button is inside the first viewport on the pending card (`boxInFirstViewport('button[value=approve]')` in `tests/ui-redesign.browser.mjs`, add as an assertion); amount is the largest figure; letter still full text, `tabindex="0"` kept; compare with `design/shots/approval-390-fold.png` and `approval-approved-390-fold.png`.
- A11y: sticky bar buttons ≥ 44 px, 56 px primary; `form` remains the only element with `name="decision"`; focus order unchanged (facts → letter → approve → decline); amber strip text `#6B4E00` on `#FFF4D6` 7.1:1; `role="status"` on the approved line kept; `prefers-reduced-motion` disables the stamp draw.
- Tests to update: `e2e/standing-approvals.spec.ts:39–41` open the disclosure first (`await page.getByText("Muuda piire").click()`) before the radio and cap input; `tests/ui-redesign.test.ts` pending pins (`<h1 id="a-h">…`, „Kiri, täpselt sellisena”, validity sentence) stay; `tests/approvals.test.ts:208` (`.receipt-head` before „Sinu kinnitusi”) stays if the consumed `h1` keeps `class="receipt-head"`; `e2e/approval-card.spec.ts` selectors (`dl.facts`, `pre.letter`, button name) stay; `e2e/demo-path.spec.ts:109–113` stay.

### T3 — Täna as one page with one highlighted object (1 day)

Scope: `tanaBody` hero without card, `.today-sum` pills (amber only when `n > 0`), `section.section` for Ootab/Tegi/Tulekul, `.ask` on pending/failed rows and `.ask--note` on the question/next-step/optional rows, „Kuidas see kokku pandi” and `unmetNeedsBody` as `details.plain`; `deadlineRow` with `details` „Kes mida teeb” wrapping `.handoff` + `.quote`; `.tana-grid` two columns ≥ 960 px (Ootab + Tegi | Tulekul); `approvalsListBody` and `activityBody` get the same section treatment (cheap once the classes exist).

Acceptance:
- Visual: Täna at 390 px shows hero + the first ask card within 844 px (`design/shots/tana-390-fold.png`); a two-deadline Täna is ≤ 1 900 px tall at 390 px (today 2 869 px); desktop two columns, no empty right half (`design/shots/tana-1280.png`).
- A11y: `.today-sum a` ≥ 44 px (already in the browser geometry set; add `.ask` to that selector list); each `details` summary ≥ 44 px; `h2` counts remain text („Ootab sinult (2)” stays in the heading string for the tests, visually styled via `.count`); amber only on „needs you” elements.
- Tests to update: `tests/launchpad.test.ts:197` regex `<section class="card" id="tulekul"` → `<section class="section" id="tulekul"`; `e2e/demo-path.spec.ts:146` `main section.card` → `main section.section`; `e2e/company-label.spec.ts:25,31` (`main .hero`) unchanged; `tests/ui-redesign.test.ts:191,199` (`<a href="#tegi"><b>2</b><span>assistent tegi</span></a>`, `<a class="needs" …`) unchanged; `:202–211` Tulekul substrings still present inside the `details` (verify, no change expected); `e2e/standing-approvals.spec.ts:57–60` (`#tegi`, owner chip) unchanged.

### T4 — Landing first fold on desktop, motion borrowings (0.5 day)

Scope: jobs section inside the hero grid, `--fs-display` headline, phone 600 px, white canvas (from T1), `.trust` on `--c-deep`; borrow from C the staggered 200 ms entrance of the three Täna sections (`.section.enter`, 60 ms stagger, off under reduced motion); keep the teaser animation and its pause control untouched.

Acceptance:
- Visual: at 1280×800 the header, headline, button and all four jobs are in the first viewport, the phone's last bubble is not clipped (`design/shots/landing-1280.png`); at 390 px the fold shows headline + button + the top of the phone (`design/shots/landing-390-fold.png`); at 320 px no overflow.
- A11y: landing has no `<script>` (`tests/ui-redesign.test.ts` asserts); pause control ≥ 44 px and focus ring assertions kept; the transcript `<ol class="vh">` stays first in DOM order; `prefers-reduced-motion` shows the final frame and no section entrance.
- Tests to update: none expected. `tests/ui-redesign.test.ts:253–254` (`<ul class="jobs">` 4 items, `<ol class="how">` 3 items) still match after the move; `e2e/landing-teaser.spec.ts` `.phone`/`.jobs li`/`.how li` selectors unchanged. The `feat/landing-jobs-first` pins for `b-ai3` and the `48rem` card cap must be merged first (T4 branches from it).

## 4. What fits before 4 Nov 2026

| Task | Effort | Before 4 Nov | Note |
|---|---|---|---|
| T1 tokens + shell | 0.5 d | yes | first; everything else reads better after it |
| T2 approval ticket | 1 d | yes | the demo climax; do before T3 if time is short |
| T3 Täna sections | 1 d | yes | needs T1 |
| T4 landing fold + motion | 0.5 d | yes, if T1–T3 land by 2 Nov; otherwise only the hero-grid part (1 h) | branch from `feat/landing-jobs-first` |

Not in the four tasks and **after 4 Nov**: supporting pages (login lead-in, /uhenda step 1 blocker, catalogue paging — critique #10); the B „Kviitung” ledger for Tehtud and receipts; `activityBody` beyond the section restyle in T3; any webfont.

Order of PRs: T1 → T2 → T3 → T4, each branched from the previous one's merge. Each PR runs `npm test`, `npm run test:browser` (geometry at 320/390/1280 and the new first-viewport assertion) and `npm run test:probes`; screenshots from `tests/ui-redesign.browser.mjs` go in the PR body next to the matching `design/shots/*.png`.
