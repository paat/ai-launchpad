# Design directions — AI-hüppelaud, 30 Oct 2026

Three distinct directions, each answering the critique (`docs/design/direction-a/critique.md`). Contrast ratios computed with the WCAG 2.1 formula; AA = 4.5:1 for text, 3:1 for large text and UI.

---

## A. „Selge leht” — one clear page (recommended)

**Idea:** a white page with real whitespace, one big headline per screen, and exactly one highlighted object: the thing that needs you. Everything else is calm text under a heading. The approval card is a ticket with the decision pinned to the bottom of the phone.

### Palette

| Token | Hex | Use | Contrast |
|---|---|---|---|
| canvas | `#FFFFFF` | page | — |
| surface-2 | `#F4F6F2` | quiet sections, letter block | — |
| ink | `#14201A` | text, headings | 16.8:1 on white, 15.4:1 on surface-2 |
| muted | `#4F5B53` | secondary text | 7.1:1 on white, 6.5:1 on surface-2 |
| primary | `#1B5E3B` | buttons, links, active nav | white on it 7.8:1; as text on white 7.8:1 |
| deep | `#0F3D25` | trust band, brand mark | white on it 12.3:1; mint `#A3E0B5` on it 8.1:1 |
| attention | `#9A4A00` text · `#FFF4D6` fill · `#F0C36B` line | "needs you" only | 6.3:1 on white; `#6B4E00` on fill 7.1:1 |
| danger | `#B42318` | decline, failed | 6.6:1 on white |
| focus | `#1F5FD6` | focus ring | 5.7:1 on white |
| label-official | `#E1F0E3` / `#14502A` | official source | 8.0:1 |
| label-rule | white / `#1B5E3B` outline | computed by rule | 7.8:1 |
| label-assistant | `#ECEEE9` / `#3D4640` | assistant-supplied | 8.4:1 |
| label-owner | `#14201A` / white | the owner decided | 16.8:1 |
| label-sample | transparent / `#4F5B53`, dashed | sample data | 7.1:1 |

Sample moves from amber to a neutral dashed outline so amber means one thing: you.

### Type (system stack, no webfont)

`font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No self-hosted font: the gain for a 5-day demo is not worth 40–90 KB and a FOUT on a 3G phone; the hierarchy comes from size and weight.

| Step | Size | Weight / lh / ls | Where |
|---|---|---|---|
| display | `clamp(2.125rem, 6.5vw, 3.5rem)` | 800 / 1.05 / −.03em | landing h1 |
| h1 | `clamp(1.75rem, 5.5vw, 2.5rem)` | 800 / 1.1 / −.025em | Täna headline, approval title, receipt |
| amount | `2.75rem` | 800 / 1 / −.02em, tabular | approval amount |
| h2 | `1.25rem` | 750 / 1.25 / −.01em | section headings |
| lg | `1.125rem` | 500 / 1.5 | ledes, approval facts |
| md | `1rem` (17 px on ≤480 px via `html{font-size:106.25%}`) | 400 / 1.55 | body |
| sm | `.9375rem` | — | meta |
| xs | `.8125rem` | 650 | chips |

### Spacing and radius

4-px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Section gap 32 px phone / 48 px desktop. Radius: chips 6, inputs and buttons 12, cards 16, ticket 20, pills 999. Content column 640 px for owner pages, 1 080 px for landing. Täna becomes two columns at ≥ 960 px (needs you + done | coming up).

### Component language

- **Section, not card.** `h2` + 16 px gap + content; a 1 px divider between sections. Cards only for things you can act on.
- **Ask card.** White card, 4 px attention bar on the left, chip row on *top right* (max 2 chips), title, one meta line, chevron. Whole card is the tap target.
- **Ticket (approval).** State strip at the top (amber "Ootab sinu kinnitust" / green "Kinnitatud"), kind in small caps, h1 title, amount as the hero figure, recipient and period as two-line facts, the letter in a quiet block with `details` for full text, "Sina / Assistent" as one sentence. Decision bar `position: sticky; bottom: 0` on phone: primary 56 px "Kinnita täpselt see" + text button "Keeldu" (44 px). Receipt = the same ticket with a diagonal-free stamp-style check and the stepper.
- **Standing approval offer.** One sentence card: "Luba edaspidi sarnased automaatselt: ainult Demo Klient OÜ, kuni 500 €" with a single primary button; "Muuda piire" opens the scope radios and cap input inside `details`. Same server fields, no new endpoint.
- **Chips.** Keep the five kinds with the same class names; smaller (12.5 px), lowercase, max two per row, never above an h1. Sample is one page banner under the header.
- **Buttons.** Primary filled green 56 px; secondary outlined; text button for low-stakes (Keeldu, Tagasi). Never two filled primaries on one screen.
- **Nav.** Three text tabs with an underline indicator, not a segmented control; brand with a small rounded square mark and the name at 1.125 rem.
- **Deadline row.** Date tile (keep), title, one reason line, chips row; the "who does what" and the prompt move into a `details` ("Mida assistent teeb") so a row is ~140 px, not ~480 px.

### Motion

- 160 ms `ease-out` for hover/active and state chips; sticky bar slides in 200 ms on load.
- Approved: the check mark draws once (300 ms stroke) and the state strip cross-fades. Nothing loops except the landing teaser (kept as is, with its pause control).
- `prefers-reduced-motion: reduce` → all animations and transitions off; teaser shows its final frame (existing behaviour).

### Why it fits

Non-technical owners on a phone need one obvious target per screen (critique #1, #2, #9). The white canvas and bigger type make the demo readable in a 1080p video on both devices (#4, #7). Reserving amber for "needs you" turns colour into a signal (#6). Dissolving cards into sections removes the "six boxes" look without touching the data model (#1, #5). The ticket shape makes the approval moment feel like signing something exact, which is the product's trust claim (#2, #8). It is the cheapest to build: token and layout changes in `src/views.ts`, no new markup for most components.

---

## B. „Kviitung” — the paper trail

**Idea:** a warm cream page that looks like a ledger: ruled rows, tabular figures, stamps for states ("KINNITATUD", "SAADETUD"), a tear-off line on the approval ticket. Trust through the metaphor of a receipt you could file.

- **Palette:** cream `#FBF7EE`, ink `#1C1A17` (16.2:1), muted `#5A554C` (6.9:1), green `#2E6B3F` (white on it 6.4:1; as text 6.0:1), stamp red `#B3261E` (6.1:1), rule lines `#D9D2C2`, amber attention `#8A5A00` on `#FFF0C2` (7.9:1).
- **Type:** system sans for UI, `ui-monospace, SF Mono, Menlo, Consolas` for every figure, date and registry code; h1 2 rem/800, body 1 rem, mono .9375 rem. No webfont.
- **Spacing/radius:** 8-px grid, radius 4 everywhere (paper), 0 on the ticket; 1 px ruled dividers instead of card borders.
- **Components:** rows as ledger lines (date | item | amount); the approval ticket with a perforated top edge (CSS dashed border), amount right-aligned, "KINNITA TÄPSELT SEE" as a wide flat button; receipts get a rotated 6° red or green stamp with the time; chips become small caps text with a leading dot, same five kinds.
- **Motion:** stamp thumps in once (scale 1.2 → 1, 180 ms); otherwise none.
- **Why it fits:** owners already trust paper receipts; the audit trail ("Sinu kinnitusi selles töös: 1") becomes literal. Honest labels read naturally in a ledger. **Why not first:** on a phone at 390 px, mono figures and ruled rows become dense fast; the cream canvas reads duller in a video; stamps risk looking playful on a tax deadline. It is the better look for Tehtud and receipts and can be layered onto A later.

---

## C. „Assistendi ekraan” — chat-native

**Idea:** the companion looks like the chat it extends. Deep green canvas, light cards as chat bubbles, Täna as a timeline of messages from the assistant, the approval as the card the assistant "sent". The landing teaser and the real app become the same thing.

- **Palette:** deep `#0F2A1C` canvas, card `#16382A`, text `#ECF3EE` (13.6:1 on deep, 11.4:1 on card), muted `#A9BBB0` (7.6:1 / 6.4:1), mint action `#7FD4A0` with deep text (8.6:1), amber `#F2C14E` on deep (9.2:1) for "needs you", white ticket for the approval so the decision pops.
- **Type:** system sans; display 2.5 rem/800; body 1.0625 rem (bubbles read bigger); chips .8125 rem on translucent fills.
- **Spacing/radius:** bubble radius 20 with one 6-px corner; 12 px gaps; max width 480 px for the stream, two columns on desktop (stream | deadlines).
- **Components:** "assistant said" bubbles with the assistant chip built into the avatar line; owner actions as right-aligned bubbles; the approval ticket is the only white object; deadlines as date tiles inside a bubble; sample banner in the bar at the top of the stream.
- **Motion:** bubbles fade/slide 200 ms on load (staggered 60 ms); typing dots only in the landing teaser.
- **Why it fits:** maximum wow in the video; the "your assistant did this" framing is literal, which matches principle 1 (the assistant is the interface). **Why not first:** it competes visually with ChatGPT/Claude, which the product explicitly must not do; a dark UI reads "tech" to a non-technical owner and makes the five label kinds harder to distinguish; and Täna is not a conversation (it is a status page), so bubbles would fake a dialogue that did not happen, which breaks the honesty rule.

---

## Recommendation: A, with two borrowings

Build **A „Selge leht”**. Borrow from B the tabular figures and the one-time stamp-style check on receipts; borrow from C the staggered 200 ms entrance of the three Täna sections (desktop video only, off under reduced motion).

Reasons, in order: it fixes the three highest-impact defects (one target per screen, visible approval button, flat type) with CSS tokens and a sticky bar rather than new pages; it keeps every existing class and label kind so `e2e/` changes are small; it is the only direction that improves the desktop video without a redesign of the data; it is buildable by one founder in two days before 4 Nov. Prototypes for landing, approval and Täna: prototype kept outside the repo. Plan: `docs/design/direction-a/plan.md`.
