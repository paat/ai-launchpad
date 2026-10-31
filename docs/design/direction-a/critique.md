# UI critique — AI-hüppelaud, 30 Oct 2026

Ranked by impact on first impression, trust and "will I take the first step". Screens: the screenshots named below (prototype kept outside the repo). Audience: busy, non-technical Estonian micro-business owners, mostly on a phone. North star: the owner's own assistant takes a job off them end to end.

| # | Problem | Evidence | Impact |
|---|---|---|---|
| 1 | **Everything is the same white card on a grey-green field, so nothing is "the one thing to do".** The Täna hero, "Ootab sinult", "Assistent tegi", "Tulekul", "Kuidas see kokku pandi" and "Abi ja lisad" are six identical 16 px-radius boxes with the same border and shadow. The one item that needs the owner has no more weight than the help accordion. | `tana-390.png`, `tana-desktop.png` (2 531 px tall, one column, six equal boxes) | First impression: an admin tool, not an assistant. The owner cannot see in one glance what to tap. |
| 2 | **The approval moment is buried.** On the pending card the "Kinnita täpselt see" button is the 12th element, below three chips, a timestamp, title, "Miks", three facts, the full letter and a grey "Sina / Assistent" box. At 390×844 it is ~1 100 px down, below the fold. | `approval-pending-390.png` (button at y≈1140) | This is the product's signature interaction and the demo's climax; it is reached by scrolling, not seen. |
| 3 | **Chip soup before content.** Pending approval opens with "● Ootab sinu kinnitust · Sõnum · NÄIDIS", then a muted timestamp; the receipt opens with "Saadetud: demo · Assistent teatas · NÄIDIS"; "NÄIDIS" appears twice on the same screen (header and card), three times on Täna. Chips are the first thing read, and they are metadata. | `approval-pending-390.png`, `approval-receipt-390.png`, `tana-390.png` | Reads as labels for a database row. Repeated NÄIDIS dilutes the honest-label semantics it is meant to carry. |
| 4 | **Type scale is flat.** h1 1.5 rem, h2 1.125 rem, body 1 rem, chips .8125 rem. "Sinult on täna vaja üht asja" (the day's headline) is the same size as "✓ Kinnitatud 20:12" and barely bigger than a deadline title. On desktop the 680 px column leaves 600 px of empty canvas while text stays phone-sized. | `tana-desktop.png`, `approval-approved-390.png` | No hierarchy means no pace; the page feels dense and official rather than calm and clear. |
| 5 | **Five kinds of grey/yellow boxes compete inside one screen.** `.quote` ("Palu assistendilt"), `.handoff` (Sina/Assistent), `.note`, `.notice` (amber), `.ai-block`, plus `details` and `pre.letter`. A single Tulekul row nests: date tile → title → chip → source link → handoff box → quote box. Two deadlines = 2 869 px on a phone. | `tana-390.png`, `tana-pending-390.png` | Visual noise; the owner's eye has nowhere to rest. Component inconsistency reads as unfinished. |
| 6 | **One green does every job.** Brand mark, active tab, primary button, counts, links, check marks, rule chip, owner chip, done steps, hero highlight are all #1a4d2e. Amber marks both "waiting for you" and "sample", so urgency and fakeness share a colour. | `landing-1280-final.png`, `tana-390.png`, `approval-approved-390.png` | Colour cannot guide attention. "Ootab sinult" (amber tile) and "NÄIDIS" (amber chip) look like the same category. |
| 7 | **Landing desktop above the fold is empty on the left and shows no proof.** The headline block is vertically centred in a 1 280×800 viewport with ~130 px dead space above and below; the four jobs and the three steps (the actual value) are below the fold. The header is not visible at all in the capture. The phone teaser is 640 px tall and dominates. | `landing-1280-final.png` | A judge watching the desktop video sees a slogan and a phone, not the four jobs. The first scroll is wasted. |
| 8 | **The approved screen turns into a form.** After "✓ Kinnitatud", the standing-approval offer presents two radios, a labelled text input, a limits line and a second primary button. Two primary buttons ("Luba automaatselt", earlier "Kinnita täpselt see") exist within one flow; the stepper and "Tagasi: Täna" follow. The payoff ("next ones go automatically") is a chore, which contradicts "no forms". | `approval-approved-390.png`, `standing-offer-390.png` | The wow moment of standing approval (the landing's payoff beat) looks like settings. |
| 9 | **Phone ergonomics: primary action not reachable, weak footer.** No sticky action bar on the approval card; "Vaata, mida sinult vaja on" on Täna is a 52 px primary button that only scrolls 200 px to the next card; "Logi välja" is a half-width secondary button hanging bottom-left under an "Abi ja lisad" accordion. Nav tabs are 44 px but the brand mark is a 14 px square with no identity. | `tana-390.png`, `approval-pending-390.png` footer, all owner screens | The thumb has no fixed target at the moment of decision; the footer and header feel like scaffolding. |
| 10 | **Supporting pages open with a blocker or a wall.** Login leads with "Google'i sisselogimine pole … seadistatud" before the demo buttons; /uhenda step 1 is an amber "HTTPS-aadress pole … seadistatud" notice while the copy above recommends Claude but the ChatGPT tab is selected; the catalogue is one 68 702 px page starting with a four-item legend. | `login-390.png`, `uhenda-390.png`, `kataloog-390.png`, `kataloog-1280.png` | The first step (connect) starts with an obstacle; the catalogue cannot be browsed on a phone. |

## What already works (keep)

- The chat teaser is the right proof: money first, approval card, standing approval as the payoff, deadline as one offer (`landing-390-full.png`).
- Amount in the approval card is big and tabular; recipient and address are explicit (`approval-pending-390.png`).
- Honest labels exist and are consistent in meaning (rule / official / assistant / owner / sample); the problem is their volume and placement, not their presence.
- The stepper ("Koostatud → Kinnitatud → Saadetud → Makstud") is a good receipt idea (`approval-receipt-390.png`).
- Date-first deadline rows with a Riigi Teataja source (`tana-390.png`).
- 44 px tap targets and focus rings are already respected.

## Concrete defects to fix in any direction

1. One sample marker per page (a banner under the header), not a chip per element.
2. The approval button visible without scrolling at 390×844; letter collapsible, facts first.
3. Only "needs you" items are cards; the rest are sections with headings and whitespace.
4. Three type sizes with a real step (display ≥ 2 rem on phone, 2.5 rem+ on desktop).
5. Amber reserved for "needs you"; sample gets a neutral dashed outline; one green for actions.
6. Standing-approval offer as one tappable sentence with the two limits pre-filled and the controls behind a disclosure.
7. Desktop: hero height capped so the jobs row is in the first fold; Täna in two columns.
