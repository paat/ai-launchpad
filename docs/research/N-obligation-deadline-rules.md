# Deterministic back-office deadlines for a one-person service OÜ (research memo)

Run: run-1029 · Researched: 2026-10-29 (Europe/Tallinn) · Scope: one-person Estonian *osaühing* selling services, domestic, owner = sole shareholder and board member. Correctness first. This is not legal advice.

## 0. Method, tiers and evidence

- **Tier A, Riigi Teataja.** I fetched every statute quote as consolidated XML from the Riigi Teataja public API (`https://www.riigiteataja.ee/public-api/api/v1/akt/{id}/xml`) on 2026-10-29, then extracted the paragraphs with a local parser. Amendment annotations (`RT I …`) were removed from the quotes. Superscript numbering that the XML flattens is restored in the quotes (for example `§ 191` is written `§ 19¹`).
- **Tier B, official agency pages.** The pages are on emta.ee, rik.ee and abiinfo.rik.ee. I fetched each one with curl and quoted it from the page text. Each quote carries the page's own "Viimati uuendatud" (last updated) date where the page shows one.
- **Tier C, practitioners.** None were used. No rule in this memo depends on a blog.
- **Act versions used.** The table below lists the version in force on 2026-10-29 and every future version already published. The `kehtivId` field returned by `GET /akt/{id}` confirms which version is in force.

| Act | Abbr. | In force 2026-10-29 (RT id, validity) | Published future versions checked |
|---|---|---|---|
| Käibemaksuseadus (VAT Act) | KMS | 130062026129, 2026-10-01 → 2026-12-31 | 130062026130 from 2027-01-01 |
| Tulumaksuseadus (Income Tax Act) | TuMS | 109072026066, 2026-10-01 → 2026-12-31 | 109072026067 from 2027-01-01 |
| Sotsiaalmaksuseadus (Social Tax Act) | SMS | 116102026014, 2026-10-26 → 2026-12-31 | 116102026015 (2027-01-01), 116102026016 (2029-04-01) |
| Maksukorralduse seadus (Taxation Act) | MKS | 116102026010, 2026-10-26 → 2026-10-31 | 116102026011 (2026-11-01), 116102026012 (2027-01-01), 116102026013 (2028-01-01) |
| Töötuskindlustuse seadus | TKindlS | 130062026040, 2026-10-01 → 2026-12-31 | (only § 42 used) |
| Tsiviilseadustiku üldosa seadus (General Part of the Civil Code Act) | TsÜS | 131122024048, from 2025-01-01, no end | none |
| Pühade ja tähtpäevade seadus (Public Holidays Act) | PTS | 120122022005, from 2022-12-30, no end | none |
| Äriseadustik (Commercial Code) | ÄS | 106072023131, from 2024-03-01, no end | none (`kehtivId` = 106072023131) |
| Raamatupidamise seadus (Accounting Act) | RPS | 110072025003, 2025-07-20 → 2026-12-31 | 111072026150 from 2027-01-01 (§§ 13, 14, 25 unchanged) |
| Äriregistri seadus (Commercial Register Act) | ÄRS | 114032025010, from 2025-01-01, no end | none |
| Tsiviilkohtumenetluse seadustik | TsMS | 120062026021 (§ 601 only) | n/a |

Each consolidated text has a human-readable page at `https://www.riigiteataja.ee/akt/<RT id>`.

---

## 1. Common rule: deadlines on weekends and public holidays

**rule id:** `deadline-shift-next-working-day`

- **Rule:** when a statutory due date falls on a Saturday, a Sunday or a public holiday, the due date moves to the next working day. The rule applies to both filing and payment deadlines.
- **Tier A chain.** The Taxation Act sends deadline computation to the Civil Code, and the Civil Code has the shift rule.
  - MKS § 50 lg 1 (https://www.riigiteataja.ee/akt/116102026010):
    > „Tähtaja arvutamisel kohaldatakse tsiviilseadustiku üldosa seaduse vastavaid sätteid."
    > *"When computing a time limit, the relevant provisions of the General Part of the Civil Code Act apply."*
  - TsÜS § 136 lg 8 (https://www.riigiteataja.ee/akt/131122024048):
    > „Kui tahteavalduse tegemiseks või kohustuse täitmiseks ettenähtud tähtpäev satub riigipühale või muule puhkepäevale, loetakse tähtpäev saabunuks puhkepäevale järgneval esimesel tööpäeval."
    > *"If the due date for making a declaration of intent or performing an obligation falls on a public holiday or another rest day, the due date is deemed to arrive on the first working day after the rest day."*
- **Tier B corroboration (EMTA, tax returns).**
  - EMTA TSD handbook, "Deklaratsiooni TSD täitmise põhimõtted", https://www.emta.ee/admin/content/handbook_article/826, last updated 24.05.2024:
    > „Kui kohustuse täitmiseks ettenähtud tähtpäev satub riigipühale või muule puhkepäevale, loetakse tähtpäevaks puhkepäevale järgnev esimene tööpäev."
    > *"If the due date falls on a public holiday or other rest day, the first working day after it is the due date."*
  - The same sentence appears on the EMTA cash-basis VAT page, https://www.emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/kaibedeklaratsiooni-ja-aruannete-esitamine/kassapohise-kaibemaksukohustuslase-meelespea, last updated 19.02.2026.
- **Saturday counts as a rest day in practice (tier B examples).**
  - EMTA TSD page, https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine, last updated 08.10.2026:
    > „Kuna 10. oktoober on laupäev, on deklaratsiooni esitamise tähtaeg 12. oktoobril."
    > *"Since 10 October is a Saturday, the return is due on 12 October."*
  - RIK applies the same shift to annual reports. RIK news of 02.07.2024, https://www.rik.ee/et/asutusest/uudised/majandusaasta-aruanded-esitasid-sel-aastal-tahtajaks-66-kohuslastest:
    > „Kui tavapäraselt on aruannete esitamise tähtaeg 30. juuni, siis sel aastal loeti õigeaegselt esitatuks ka aruandeid, mis laekusid 1. juulil, kuna esitamise tähtaeg langes nädalavahetusele."
    > *"Normally the deadline is 30 June; this year reports received on 1 July also counted as on time, because the deadline fell on a weekend."*
- **2026 change:** none.

### Estonian public holidays, Nov 2026 – Dec 2027

The holiday list comes from PTS §§ 1–2 (tier A, https://www.riigiteataja.ee/akt/120122022005):

> § 1: „Rahvuspüha ja puhkepäev on: 24. veebruar – iseseisvuspäev, Eesti Vabariigi aastapäev."
> *"The national holiday and day off is 24 February, Independence Day."*

> § 2: „Riigipühad ja puhkepäevad on: 1) 1. jaanuar – uusaasta; 2) – suur reede; 3) – ülestõusmispühade 1. püha; 4) 1. mai – kevadpüha; 5) – nelipühade 1. püha; 6) 23. juuni – võidupüha; 7) 24. juuni – jaanipäev; 8) 20. august – taasiseseisvumispäev; 8¹) 24. detsember – jõululaupäev; 9) 25. detsember – esimene jõulupüha; 10) 26. detsember – teine jõulupüha."
> *"Public holidays and days off: New Year's Day (1 Jan); Good Friday; Easter Sunday; Spring Day (1 May); Pentecost; Victory Day (23 Jun); Midsummer Day (24 Jun); Restoration of Independence Day (20 Aug); Christmas Eve (24 Dec); Christmas Day (25 Dec); Boxing Day (26 Dec)."*

- PTS § 4 lg 1 says holidays follow the Gregorian calendar.
- The moveable dates were computed with the Gregorian Easter algorithm: Easter Sunday is 2026-04-05 and 2027-03-28.
- Riigi pühad (*riiklikud tähtpäevad*, PTS § 3, e.g. 16 November) are **not** days off.

| Date | Weekday | Holiday |
|---|---|---|
| 2026-12-24 | Thu | jõululaupäev (Christmas Eve) |
| 2026-12-25 | Fri | esimene jõulupüha (Christmas Day) |
| 2026-12-26 | Sat | teine jõulupüha (Boxing Day) |
| 2027-01-01 | Fri | uusaasta (New Year's Day) |
| 2027-02-24 | Wed | iseseisvuspäev (Independence Day) |
| 2027-03-26 | Fri | suur reede (Good Friday) |
| 2027-03-28 | Sun | ülestõusmispühade 1. püha (Easter Sunday) |
| 2027-05-01 | Sat | kevadpüha (Spring Day) |
| 2027-05-16 | Sun | nelipühade 1. püha (Pentecost) |
| 2027-06-23 | Wed | võidupüha (Victory Day) |
| 2027-06-24 | Thu | jaanipäev (Midsummer Day) |
| 2027-08-20 | Fri | taasiseseisvumispäev (Restoration of Independence Day) |
| 2027-12-24 | Fri | jõululaupäev (Christmas Eve) |
| 2027-12-25 | Sat | esimene jõulupüha (Christmas Day) |
| 2027-12-26 | Sun | teine jõulupüha (Boxing Day) |

There are no public holidays in November 2026.

---

## 2. Obligations

### 2.1 `vat-return-kmd`: VAT return KMD and annex KMD INF

- **Name.** Estonian: *käibedeklaratsioon (vorm KMD) ja selle lisa (vorm KMD INF)*. English: VAT return and its invoice-level annex.
- **Applicability (observable facts).**
  - The company is registered as a VAT payer (*maksukohustuslane*, it has a KMKR number) for any day of the calendar month.
  - The return is due **even for a month with no transactions** (tier B quote below).
  - The first period runs from the registration date to the end of that month. If the first period is shorter than 15 days, it may be combined with the next month (KMS § 27 lg 1).
- **Due date.** The 20th of the month after the period (calendar month), then `deadline-shift-next-working-day`.
- **Payment.** See `vat-payment`.
- **Source.** KMS § 27 lg 1, lg 1², lg 2, https://www.riigiteataja.ee/akt/130062026129.
  > § 27 lg 1: „Maksustamisperiood on kalendrikuu. Käibedeklaratsioon ja selle lisa (edaspidi koos käibedeklaratsioon) esitatakse maksuhaldurile maksustamisperioodile järgneva kuu 20. kuupäevaks."
  > *"The taxable period is a calendar month. The VAT return and its annex (together: the VAT return) are submitted to the tax authority by the 20th day of the month following the taxable period."*

  > § 27 lg 2: „Käibedeklaratsiooni on kohustatud esitama: 1) maksukohustuslane; …"
  > *"The following must file a VAT return: 1) a taxable person (VAT-registered person); …"*

  > § 27 lg 1² (annex threshold): „… kui arve või arvete kogusumma ilma käibemaksuta on maksustamisperioodil ühe tehingupartneri kohta vähemalt 1000 eurot. Tehingupartneripõhist piirmäära arvestatakse ostu- ja müügiarvete puhul eraldi."
  > *"… if the invoice or invoices total at least €1,000 excluding VAT per counterparty in the period. The per-counterparty threshold is counted separately for purchase and sales invoices."*
- **Tier B (EMTA KMD handbook PDF).** https://www.emta.ee/node/337/handbook/6/pdf, section last updated 08.01.2025.
  > „Registreeritud maksukohustuslane on kohustatud vormi KMD esitama ka juhul, kui tal sellel maksustamisperioodil deklareerimisele kuuluvaid tehinguid ja toiminguid teinud ei ole."
  > *"A registered taxable person must file form KMD even if it made no transactions to declare in that period."*

  > „Kui maksukohustuslane ei ole maksustamisperioodil väljastanud või saanud arveid, mida tuleb kajastada vormil KMD INF, tuleb vormi A- ja/või B-osal teha vastav märge deklareeritavate arvete puudumise kohta."
  > *"If no reportable invoices were issued or received, mark 'no invoices to declare' on part A and/or B of KMD INF."*
- **Tier.** A, corroborated by B.
- **2026 change:** none to the due date. KMS § 27 is identical in the versions valid from 2026-01-01 and from 2026-10-01.
- **2027 change (forward-looking).**
  - KMS version 130062026130 (from 2027-01-01) merges the annex into one "käibedeklaratsioon" and moves intra-Community supply data (formerly the VD report) into it via § 27 lg 1⁵.
  - The due date stays the 20th:
    > „Maksustamisperiood on kalendrikuu. Käibedeklaratsioon esitatakse maksuhaldurile maksustamisperioodile järgneva kuu 20. kuupäevaks."
  - EMTA says the data-based KMD starts in April 2027 (same handbook, last updated 14.09.2026):
    > „Alates 2027. aasta aprillist saab käibeandmeid esitada senisest lihtsamalt ja mugavamalt"
    > „Enam ei esitata käibedeklaratsiooni vormi, vaid käibedeklaratsiooni aluseks olevaid tehingute ja toimingute andmeid."
    > *"From April 2027 VAT data can be submitted more simply … The VAT return form is no longer submitted; the underlying transaction data is."*
  - The same handbook names "Andmepõhise KMD tehniline dokumentatsioon alates 2027. aasta II kvartalist" *(technical documentation for the data-based KMD from Q2 2027)*. The first reporting period on the new format is listed under UNKNOWN U1.

### 2.2 `vat-payment`: VAT payment

- **Name.** Estonian: *käibemaksu tasumine*. English: payment of VAT.
- **Applicability.** VAT-registered, with VAT payable for the period.
- **Due date.** By the KMD filing date. Operationally this is the 20th of the following month, shifted to the next working day.
- **Source.** KMS § 38 lg 1, https://www.riigiteataja.ee/akt/130062026129.
  > „Maksukohustuslane või piiratud maksukohustuslane tasub tasumisele kuuluva käibemaksusumma käibedeklaratsiooni esitamise kuupäevaks."
  > *"A taxable person or limited taxable person pays the VAT payable by the date of submission of the VAT return."*
- **Tier.** A. The wording "esitamise kuupäevaks" is literal; see UNKNOWN U2.
- **2026 / 2027 changes:** none. § 38 lg 1 is identical in the 2026 and 2027 texts.

### 2.3 `tsd-monthly-return`: income and social tax return TSD

- **Name.** Estonian: *tulu- ja sotsiaalmaksu, kohustusliku kogumispensioni makse ja töötuskindlustusmakse deklaratsioon (vorm TSD)*. English: return of income tax, social tax, funded-pension and unemployment-insurance contributions.
- **Triggers in calendar month M.** TSD is required if **any** of these happened (cash basis, i.e. by the month of payout):
  1. Salary or wages paid to an employee. Withholding: TuMS § 41 p 1. Social tax: SMS § 2 lg 1 p 1.
  2. Management board member fee (*juhatuse liikme tasu*) paid. Withholding: TuMS § 41 p 1. Social tax: SMS § 2 lg 1 p 4.
  3. Fee paid to a natural person under a services or other law-of-obligations contract (*VÕS-leping*). Withholding: TuMS § 41 p 3.
  4. Fringe benefits (*erisoodustused*) provided: TuMS § 54 lg 1.
  5. Dividends or other profit distributions, equity payouts, gifts, donations, entertainment or non-business expenses: TuMS §§ 49–53 via § 54 lg 2. Annexes 5–7.
  6. Other circumstances affecting the CIT liability under TuMS §§ 50 and 53 arose in the month, e.g. an equity contribution. This comes from the EMTA quote and § 54 lg 2.
  7. An employee under an **employment contract** has a TÖR entry that is not suspended. TSD is then due even without a payout, because of the minimum monthly social tax: TuMS § 40 lg 5, last sentence, and SMS § 2 lg 2.
- **No-payout month, stated explicitly.** A one-person OÜ owes no TSD for month M in this case:
  - the only person is an unpaid board member;
  - nothing in triggers 1–7 happened in M.

  The source is the EMTA TSD handbook, https://www.emta.ee/admin/content/handbook_article/826, last updated 24.05.2024:
  > „Kui maksukohustuslane ei ole kalendrikuus teinud maksustatavaid väljamakseid, töötajate eest ei ole kohustust tasuda sotsiaalmaksu kuumääralt ning samuti ei ole teinud kulusid, millelt on kohustus tasuda maksukohustusi, siis selle perioodi eest ei pea esitama TSD deklaratsiooni (nn 0-deklaratsiooni)."
  > *"If in the calendar month the taxable person made no taxable payouts, has no obligation to pay social tax at the monthly minimum for employees, and incurred no expenses carrying a tax liability, no TSD return (a so-called zero return) has to be filed for that period."*

  The same handbook gives the wider trigger:
  > „Samuti tuleb TSD deklaratsioon esitada maksukohustust mõjutavate asjaolude kohta (TuMS § 50 ja 53), kui need asjaolud tekkisid kalendrikuus."
  > *"TSD must also be filed for circumstances affecting tax liability (TuMS §§ 50 and 53) that arose in the calendar month."*

  Minimum social tax applies to employees and officials, not board members. SMS § 2 lg 2, https://www.riigiteataja.ee/akt/116102026014:
  > „Sotsiaalmaksu makstakse töötajale või ametnikule kuu eest makstud tasult, kuid mitte vähem kui käesoleva seaduse §-s 2¹ nimetatud kuumääralt."
  > *"Social tax is paid on the monthly remuneration of an employee or official, but not less than the monthly rate referred to in § 2¹."*

  The employee-without-payout case. TuMS § 40 lg 5, last sentence:
  > „Tulumaksu kinnipidaja esitab käesoleva lõike esimeses lauses nimetatud maksudeklaratsiooni töölepingu alusel töötavate töötajate või teenistussuhtes olevate ametnike kohta, kelle töötamine ei ole töötamise registri andmetel peatatud."
  > *"The withholding agent files the return for employees under an employment contract or officials whose work is not suspended according to the employment register."*
- **Due date.** The 10th of the month after the payout or expense month, then `deadline-shift-next-working-day`.
- **Tier A sources.**
  - TuMS § 40 lg 4–5, https://www.riigiteataja.ee/akt/109072026066:
    > lg 4: „Tulumaksu kinnipidaja on kohustatud kandma kinnipeetud tulumaksu üle Maksu- ja Tolliameti pangakontole hiljemalt väljamakse tegemise kuule järgneva kuu 10. kuupäevaks."
    > *"The withholding agent must transfer withheld income tax to the ETCB bank account no later than the 10th of the month following the month of payout."*

    > lg 5: „Tulumaksu kinnipidaja on kohustatud esitama lõikes 4 nimetatud tähtpäevaks Maksu- ja Tolliametile maksudeklaratsiooni."
    > *"The withholding agent must file a tax return with the ETCB by the due date in subsection 4."*
  - TuMS § 41 p 1, which names board fees:
    > „Tulumaks peetakse kinni: 1) residendist füüsilisele isikule makstavalt tulumaksuga maksustamisele kuuluvalt palgalt ja muudelt tasudelt (§ 13 lõiked 1, 5 ja 6), juriidilise isiku juhtimis- ja kontrollorgani liikme tasudelt (§ 13 lõige 2), arvestades §-s 42 lubatud mahaarvamist;"
    > *"Income tax is withheld: 1) from taxable salary and other remuneration paid to a resident natural person …, from fees of members of the management or supervisory body of a legal person …, taking into account the deduction allowed in § 42;"*
  - TuMS § 54 lg 1 (fringe benefits):
    > „Paragrahvi 48 alusel maksustamisele kuuluvaid erisoodustusi tegev isik või asutus on kohustatud esitama maksustamisperioodile järgneva kalendrikuu 10. kuupäevaks Maksu- ja Tolliametile maksudeklaratsiooni kalendrikuu jooksul tehtud erisoodustuste kohta."
    > *"A person providing fringe benefits taxable under § 48 must file a return on them with the ETCB by the 10th of the month following the taxable period."*
  - SMS § 9 lg 1 p 4, social tax return due the same day:
    > „… üle kandma tasumisele kuuluva sotsiaalmaksu Maksu- ja Tolliameti pangakontole maksustamisperioodile järgneva kuu kümnendaks kuupäevaks ja esitama samaks kuupäevaks Maksu- ja Tolliametile vastava maksudeklaratsiooni;"
    > *"… transfer the social tax payable to the ETCB account by the tenth day of the month following the taxable period and file the corresponding return by the same date;"*
  - TKindlS § 42 lg 1 p 3, unemployment insurance, https://www.riigiteataja.ee/akt/130062026040: transfer the premiums „hiljemalt väljamakse tegemise kuule järgneva kuu kümnendaks kuupäevaks ja esitama samaks kuupäevaks Maksu- ja Tolliametile vastava deklaratsiooni" *(by the 10th of the month after payout, and file the return by the same date)*.
- **Tier B.**
  - EMTA TSD page (last updated 08.10.2026):
    > „… (vorm TSD) esitatakse iga kuu 10. kuupäevaks."
    > *"TSD is filed by the 10th of each month."*
  - EMTA news "Millal tuleb tööandjal TSD esitada ka siis, kui väljamakseid tehtud ei ole", 04.02.2021, https://www.emta.ee/uudised/millal-tuleb-tooandjal-tsd-esitada-ka-siis-kui-valjamakseid-tehtud-ei-ole, on the employee case:
    > „Kui aga tööandja ei tee kalendrikuus töötajale töötasu väljamakseid, ent samas on töötajal töötamise registris kehtiv töölepinguline kanne, on tööandjal sotsiaalmaksuseadusest lähtuvalt reeglina kohustus deklareerida ja tasuda kuumääralt sotsiaalmaks."
    > *"If the employer pays no wages in the month but the employee has a valid employment-contract entry in TÖR, the employer as a rule must declare and pay social tax at the monthly minimum."*
- **Tier.** A, corroborated by B.
- **2026 change.** From 1 October 2026 payroll data (annexes 1–2) can be sent through the new data-based TSD channel. The due date is unchanged. EMTA TSD page:
  > „Alates 1. oktoobrist 2026 saab TSD palgaväljamaksete andmeid Maksu- ja Tolliametile esitada lihtsamalt ja mugavamalt – otse majandustarkvarast e-teenuste keskkonda e-MTA." … „oktoobrikuu TSD esitamise tähtaeg on 10. november."
  > *"From 1 October 2026 TSD payroll data can be sent directly from accounting software … the October TSD is due 10 November."*
- **Statutory changes.** TuMS §§ 4, 40, 41, 43, 48, 50, 54 are identical between the 2026-10-01 and 2027-01-01 versions.

### 2.4 `tsd-tax-payment`: payment of TSD taxes

- **Taxes covered.** Withheld income tax, social tax, unemployment-insurance premiums and CIT under TuMS §§ 48–53.
- **Due date.** The same as the return: the 10th of the following month, then the shift rule.
- **Sources.**
  - TuMS § 40 lg 4 (quoted in 2.3) and SMS § 9 lg 1 p 4 (quoted in 2.3).
  - TKindlS § 42 lg 1 p 3 (quoted in 2.3).
  - TuMS § 54 lg 4:
    > „Maksumaksja on kohustatud kandma §-de 48–53 alusel maksmisele kuuluva tulumaksu Maksu- ja Tolliameti pangakontole hiljemalt maksustamisperioodile järgneva kalendrikuu 10. kuupäevaks."
    > *"The taxpayer must transfer income tax payable under §§ 48–53 to the ETCB bank account no later than the 10th of the month following the taxable period."*
- **Tier.** A.
- **2026 / 2027 changes:** none.

### 2.5 `cit-distribution`: corporate income tax on dividends and other distributions

- **Name.** Estonian: *tulumaks dividendidelt ja muudelt kasumieraldistelt*. English: CIT on distributed profit.
- **Applicability.** In month M the OÜ paid a dividend or another profit distribution, in cash or in kind. This includes payouts from equity above contributions (TuMS § 50 lg 2).
- **What is declared, and when.**
  - It is declared in the TSD of the payout month M: annex 7, plus form INF 1 listing the recipients.
  - Filing is due on the 10th of M+1, and the tax is paid by the same date. Then the shift rule applies.
- **Tier A sources.**
  - TuMS § 50 lg 1:
    > „Residendist äriühing, sealhulgas täis- ja usaldusühing, maksab tulumaksu dividendide või muude kasumieraldistena jaotatud kasumilt nende väljamaksmisel rahalises või mitterahalises vormis."
    > *"A resident company pays income tax on profit distributed as dividends or other profit distributions when paying them out in monetary or non-monetary form."*
  - TuMS § 54 lg 2:
    > „Residendist juriidiline isik … on kohustatud esitama maksustamisperioodile järgneva kalendrikuu 10. kuupäevaks Maksu- ja Tolliametile maksudeklaratsiooni §-des 49–53 nimetatud kulude, tulude ja väljamaksete ning §-des 50, 50², 52¹ ja 53 sätestatud maksukohustust mõjutavate asjaolude kohta eelmisel kalendrikuul."
    > *"A resident legal person must file, by the 10th of the following month, a return on the expenses, income and payouts in §§ 49–53 and on circumstances affecting liability under §§ 50, 50², 52¹ and 53 in the previous month."*
  - Payment: TuMS § 54 lg 4 (quoted in 2.4).
  - Recipient list, TuMS § 56 lg 3:
    > „Lõigetes 1 ja 1¹ nimetatud deklaratsioon esitatakse väljamakse tegemise kuule järgneva kalendrikuu 10. kuupäevaks."
    > *"The declaration on recipients is filed by the 10th of the month following the payout month."*
- **Tier B.** EMTA "Dividendi maksustamine", https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine/dividendi-maksustamine:
  > „Residendist äriühing maksab kasumi jaotamisel ehk dividendi väljamaksmisel tulumaksu määras 22/78.Väljamakstud dividend deklareeritakse väljamaksmise kuu TSD lisas 7 koodil 7008. Koos lisa 7 täidetakse dividendide saajate kohta vorm INF 1."
  > *"A resident company pays income tax at 22/78 on distributing profit. The dividend paid is declared in annex 7 (code 7008) of the TSD for the payout month; form INF 1 on recipients is completed with annex 7."*

  The missing space after "22/78." is in the source.
- **Tier.** A, corroborated by B.
- **Changes.**
  - The 22% rate and 22/78 gross-up have applied since 2025-01-01.
  - The former reduced 14/86 rate for regular dividends (TuMS § 50¹) was repealed from 2025-01-01 ("Kehtetu – RT I 2023-06-30, 107 … 2025-01-01").
  - Nothing changes in 2026 or 2027 per the consolidated texts.
  - I found no security-tax ("julgeolekumaks") provision in the TuMS 2026 or 2027 texts.

### 2.6 `annual-report`: annual report to the e-Business Register

- **Name.** Estonian: *majandusaasta aruanne*. English: annual report.
- **Applicability.**
  - Every OÜ entered in the Commercial Register, for every financial year (FY), **including inactive years**.
  - The FY is the calendar year unless the articles say otherwise (RPS § 13 lg 3).
- **Due date.**
  - Within 6 months of the FY end. For an FY ending 31 Dec, that is **30 June**, then the shift rule.
  - The report is submitted via the e-Business Register (e-äriregister).
- **Tier A sources.**
  - ÄS § 179 lg 4, https://www.riigiteataja.ee/akt/106072023131:
    > „Juhatus esitab kinnitatud majandusaasta aruande koos kasumi jaotamise või kahjumi katmise ettepanekuga, müügitulu jaotusega ja vandeaudiitori aruandega, kui audiitorkontroll on kohustuslik, äriregistrile kuue kuu jooksul arvates majandusaasta lõppemisest."
    > *"The management board submits the approved annual report, with the profit-distribution or loss-cover proposal, the breakdown of sales revenue and the sworn auditor's report where an audit is mandatory, to the commercial register within six months after the end of the financial year."*
  - RPS § 13 lg 3, https://www.riigiteataja.ee/akt/110072025003:
    > „Majandusaastaks on kalendriaasta, kui raamatupidamiskohustuslase põhikirjas või muus raamatupidamiskohustuslase tegevust reguleerivas dokumendis ei ole sätestatud teisiti."
    > *"The financial year is the calendar year unless the articles of association or another governing document provide otherwise."*
  - RPS § 14 lg 1:
    > „Raamatupidamiskohustuslane on kohustatud lõppenud majandusaasta kohta koostama majandusaasta aruande …"
    > *"An accounting entity must prepare an annual report for the ended financial year …"*
- **How "6 months" becomes a date.** TsÜS § 136 lg 3–4: a month-based term ends on the corresponding day of the last month, or on that month's last day when the day does not exist. So FY end 31 Dec maps to 30 June.
- **Tier B (RIK news, 25.06.2025).** https://www.rik.ee/et/asutusest/uudised/kas-sul-majandusaasta-aruanne-esitatud-aega-juuni-lopuni:
  > „Kõik juriidilised isikud, kellel on majandusaasta aruande esitamise kohustus ja kelle majandusaasta lõppes 31.12.2024, peavad esitama majandusaasta aruande 30. juuniks."
  > *"All legal persons obliged to file whose FY ended 31.12.2024 must file by 30 June."*

  RIK news of 02.07.2024 (URL in § 1):
  > „Majandusaasta aruande esitamine on kohustuslik kõigile Eesti raamatupidamiskohustuslastele ja aruanne tuleb esitada igal tegevusaastal."
  > *"Filing is mandatory for all Estonian accounting entities, every year of activity."*
- **Tier.** A, corroborated by B.
- **2026 / 2027 changes:** none. ÄS has no newer version. RPS §§ 13, 14 and 25 are identical in the 2027-01-01 version.
- **Next instance.** FY 2026, calendar FY: due **Wed 2027-06-30**, with no shift needed.

### 2.7 `annual-report-overdue`: consequences of a late annual report (risk milestones, not filing deadlines)

- **Applicability.** `annual-report` was not filed by its due date.
- **Milestones.**
  1. From the day after the due date, the registrar **may fine** the company, repeatedly and without a prior warning order (ÄRS § 57 lg 1).
  2. The registrar sets a deadline under a **deletion warning**, which may be automated (ÄRS § 61 lg 1).
  3. **Deletion is possible** once the warning deadline has passed **and at least 3 months** have passed since the statutory due date (ÄRS § 61 lg 2). For FY 2026 that is on or after 2027-09-30.
  4. **Compulsory dissolution** may follow. The registrar's deadline must be at least 3 months (ÄRS § 58 lg 1 p 4, lg 2).
- **Tier A sources.** ÄRS, https://www.riigiteataja.ee/akt/114032025010.
  > § 57 lg 1: „Kui juriidiline isik ei ole esitanud registripidajale seaduses ettenähtud tähtaja jooksul majandusaasta aruannet, võib registripidaja määrata talle ilma hoiatusmäärust tegemata tsiviilkohtumenetluse seadustiku §-s 601 nimetatud trahvi korduvalt kuni majandusaasta aruande esitamise kohustuse täitmiseni."
  > *"If a legal person has not filed its annual report within the statutory term, the registrar may, without a warning order, impose the fine in TsMS § 601 repeatedly until the obligation is met."*

  > § 61 lg 1: „Kui juriidiline isik ei ole seaduses ettenähtud tähtaja möödumisel esitanud nõutavat majandusaasta aruannet, määrab registripidaja juriidilisele isikule registrist kustutamise hoiatusega tähtaja majandusaasta aruande esitamiseks. Hoiatuse võib saata tähtaja möödumisel automatiseeritult."
  > *"If the required annual report is not filed by the statutory deadline, the registrar sets a deadline for filing under warning of deletion from the register. The warning may be sent automatically when the deadline passes."*

  > § 61 lg 2: „Juriidilise isiku võib registrist kustutada, kui juriidiline isik ei ole esitanud registripidaja määratud tähtaja jooksul majandusaasta aruannet ja seaduses ettenähtud esitamistähtpäevast on möödunud vähemalt kolm kuud."
  > *"The legal person may be deleted if it has not filed within the registrar's deadline and at least three months have passed since the statutory due date."*

  > § 58 lg 1 p 4 and lg 2: „Registripidaja võib algatada juriidilise isiku sundlõpetamise, kui: … 4) see ei ole esitanud majandusaasta aruannet." / „See tähtaeg ei või lõike 1 punktides 1 ja 2 nimetatud juhul olla lühem kui kuus kuud, punktis 3 nimetatud juhul lühem kui üks kuu ja punktis 4 nimetatud juhul lühem kui kolm kuud."
  > *"The registrar may initiate compulsory dissolution if … 4) it has not filed an annual report" / "That deadline may not be shorter than six months in cases 1–2, one month in case 3, and three months in case 4."*
- **Tier B (RIK news, 02.07.2024).**
  > „Trahvile eelneb üldjuhul hoiatus, kus on antud tähtaeg majandusaasta aruande esitamiseks."
  > *"A fine is usually preceded by a warning with a filing deadline."*

  > „Registrist kustutatakse vaid need aruande esitamata jätnud juriidilised isikud, kellel pole registritest nähtavat vara, pooleli olevaid kohtu-, täite- või kriminaalmenetlusi ega maksuvõlgu."
  > *"Only non-filers with no assets visible in registers, no pending court, enforcement or criminal proceedings and no tax debts are deleted."*
- **Tier.** A, corroborated by B.
- **Notes.**
  - ÄS §§ 59–60, the old deletion rules, were **repealed on 2023-02-01** (RT I 2022-05-05, 1) and moved to ÄRS.
  - The English RIK page https://www.rik.ee/en/e-business-register/annual-report still cites "§ 60 of the Commercial Code" and "§ 71" and a 6-month supervisory trigger. That page is **stale; do not use it**.
  - The fine amount is not set in ÄRS § 57 or TsMS § 601. See UNKNOWN U9.

### 2.8 `vat-registration-threshold`: mandatory VAT registration

- **Name.** Estonian: *käibemaksukohustuslasena registreerimise kohustus*. English: obligation to register for VAT.
- **Applicability.**
  - The company is **not** VAT-registered.
  - Its **calendar-year** turnover with an Estonian place of supply, counted from 1 January, **exceeds €40,000**. "Exceeds" means strictly more than €40,000.
  - Turnover is defined in KMS § 19¹ lg 3:
    - taxable supplies, including zero-rated, but excluding disposal of fixed assets;
    - real-estate supplies, excluding fixed assets and occasional transactions;
    - insurance and financial services, excluding occasional ones.
  - No obligation arises if the whole year's turnover is exempt plus zero-rated, other than intra-Community supply of goods.
  - The count resets every 1 January. It is not a rolling 12 months.
- **Deadline.** Apply within **3 working days** counted from the day the threshold is exceeded. Registration takes effect from that day, retroactively.
- **Amount.** €40,000, unchanged for 2025, 2026 and 2027.
  - The KMS 2024 text (RT 121112023010) also says 40 000 eurot, with a different turnover definition.
  - The versions valid 2026-01-01, 2026-10-01 and 2027-01-01 all say 40 000.
  - What changed on **2025-01-01** was the turnover composition (new § 19¹ lg 3, RT I 2024-12-03, 2), not the amount.
- **Tier A sources.** https://www.riigiteataja.ee/akt/130062026129.
  > § 19 lg 1: „Kui isiku käesoleva seaduse § 19¹ lõikes 3 sätestatud kalendriaasta käive, mille tekkimise koht on Eesti, ületab kalendriaasta algusest alates 40 000 eurot, tekib tal nimetatud suuruses käibe tekkimise päevast kohustus end maksukohustuslasena registreerida (edaspidi registreerimiskohustus). Registreerimiskohustust ei teki, kui isiku kogu kalendriaasta käibe moodustab maksuvaba käive ja nullprotsendise käibemaksumääraga maksustatav käive, välja arvatud kauba ühendusesisene käive."
  > *"If a person's calendar-year turnover as defined in § 19¹(3), with Estonian place of supply, exceeds €40,000 from the start of the calendar year, the obligation to register arises on the day that turnover is reached. No obligation arises if the whole year's turnover is exempt and zero-rated, except intra-Community supply of goods."*

  > § 19¹ lg 3: „Kalendriaasta käive ühenduses või liikmesriigis, sealhulgas Eestis, vastavalt käibe tekkimise kohale moodustub järgmistest käivetest: 1) kaupade ja teenuste maksustatav, sealhulgas nullprotsendise määraga maksustatav käive, välja arvatud põhivara võõrandamine; 2) kinnisasjatehingute (§ 16 lõike 2 punktid 2, 3 ja 6) käive, välja arvatud põhivara võõrandamine ja juhuslikud tehingud; 3) kindlustusteenuste (§ 16 lõike 2 punkt 1) ja finantsteenuste (§ 16 lõige 2¹) käive, välja arvatud juhuslikud teenused."
  > *"Calendar-year turnover consists of: 1) taxable supplies of goods and services incl. zero-rated, excluding disposal of fixed assets; 2) real-estate supplies …, excluding fixed assets and occasional transactions; 3) insurance and financial services …, excluding occasional services."*

  > § 20 lg 1: „Registreerimiskohustuse tekkimise päevast alates kolme tööpäeva jooksul on isik kohustatud esitama maksuhaldurile avalduse enda maksukohustuslasena registreerimiseks."
  > *"Within three working days of the day the obligation arises, the person must apply to the tax authority for registration."*

  > § 20 lg 3: „Maksuhaldur registreerib isiku maksukohustuslasena … registreerimiskohustuse tekkimise kuupäeva seisuga."
  > *"The tax authority registers the person … as of the date the obligation arose."*
- **Tier B (EMTA handbook).** "Käibemaksukohustuslase registreerimine ja kustutamine", https://www.emta.ee/node/333/handbook/4/pdf, article last updated 04.08.2025. It gives a worked example of counting working days:
  > „Kui isik ületas piirmäära 40 000 eurot 2. kuupäeval, reedel, tuleb tal avaldus enda maksukohustuslasena registreerimiseks esitada hiljemalt 7. kuupäeval, kolmapäeval."
  > *"If the threshold was exceeded on Friday the 2nd, the application is due by Wednesday the 7th."*

  It also says "Alates 01.01.2025 loetakse 40 000 euro suuruse … piirmäära sisse: …", which confirms the 2025 change in composition.
- **Computation.** `due = add_working_days(threshold_crossing_date, 3)`. The count starts the day after crossing, with weekends and PTS holidays excluded. This matches the EMTA example.
- **Tier.** A, corroborated by B.

### 2.9 `tor-registration`: employment register (TÖR)

- **Name.** Estonian: *töötamise registreerimine töötamise registris (TÖR)*. English: employment registration.
- **Applicability (observable facts).**
  - **Start of work** must be registered **no later than the moment the person starts work**. This covers:
    - an employee under an employment contract;
    - a natural person under a law-of-obligations (VÕS) contract who is not a sole trader (FIE);
    - an unpaid person working in the company's economic interest;
    - a **management board member who is paid a fee**.
  - Statute: MKS § 25¹ lg 4 p 1–3, lg 5 and § 25² lg 3.
  - **Unpaid board member:** no registration is needed (tier B quote below).
  - **Termination or suspension** must be registered within 10 days (MKS § 25² lg 4).
- **Tier A sources.** https://www.riigiteataja.ee/akt/116102026010.
  > § 25¹ lg 4: „Töötamise registrisse kantakse andmed järgmiste töötamise liikide ja füüsiliste isikute kohta, kelle töötamisel tekib maksukohustus Eestis: 1) töölepingu alusel töötav isik; 2) võlaõigusliku lepingu alusel teenust osutav isik, välja arvatud füüsilisest isikust ettevõtja ja ettevõtlustulu maksu maksja; 3) juriidilise isiku juhtimis- või kontrollorgani liige; …"
  > *"The register holds data on the following kinds of work and persons whose work gives rise to a tax liability in Estonia: 1) employment-contract workers; 2) persons providing services under a law-of-obligations contract, except sole traders and entrepreneur-account taxpayers; 3) members of the management or supervisory body of a legal person; …"*

  > § 25² lg 3: „Töötamise alustamine registreeritakse hiljemalt tööd tegeva isiku tööle asumise hetkeks."
  > *"The start of work is registered no later than the moment the person starts work."*

  > § 25² lg 4: „Töötamise peatumine ja lõpetamine registreeritakse kümne päeva jooksul töötamise peatumise või lõpetamise päevast arvates."
  > *"Suspension and termination are registered within ten days of the day of suspension or termination."*
- **Tier B (EMTA "Töötamise registreerimine").** https://www.emta.ee/ariklient/registreerimine-ettevotlus/tootamise-register/tootamise-registreerimine, last updated 09.02.2026.
  > „Töötamise alustamine tuleb registreerida hiljemalt tööd tegeva isiku tööle asumise hetkeks."

  > „Kui osaühing juhatuse liikmele tasu ei maksa, siis juhatuse liiget töötamise registris registreerima ei pea. Sel juhul on juhatuse liige kantud üksnes äriregistrisse."
  > *"If the OÜ pays its board member no fee, the board member need not be registered in TÖR; the member is then entered only in the Commercial Register."*

  The same FAQ warns that a board member who actively does the company's operational work must receive taxed pay and needs a separate employment or VÕS entry.
- **Tier.** A, corroborated by B.
- **2026 change:** none.
- **2027 change.** From 2027-01-01 the definition of "tööd võimaldav isik" (the employing person) is reworded in § 25¹ lg 3 p 3 (MKS 116102026012). This does not affect an OÜ.
- The exact start moment for a *paid board member* is listed under UNKNOWN U3.

### 2.10 Rates (context only, not deadlines)

| Rate | Value | Since | Source (tier A) |
|---|---|---|---|
| Standard VAT rate | **24 %** | 2025-07-01 (RT I 2025-01-02, 2) | KMS § 15 lg 1: „Käibemaksumäär on 24 protsenti maksustatavast väärtusest, välja arvatud käesoleva paragrahvi lõigetes 1¹–4 sätestatud juhtudel." *(The VAT rate is 24% of the taxable value, except in the cases in subsections 1¹–4.)* Unchanged in the 2027 text. Reduced rates: 13 % accommodation; 9 % books and press etc. |
| CIT on distributions | **22/78** of the net distribution (22 % of the gross) | 2025-01-01 (RT I 2023-06-30, 107) | TuMS § 4 lg 1: „Tulumaksu määr … on 22%." and § 4 lg 1¹: „… jagatakse maksustatav summa enne maksumääraga korrutamist arvuga 0,78 …" *(The taxable amount is divided by 0.78 before applying the rate.)* Unchanged in the 2027 text. |
| Social tax | **33 %** | (long-standing) | SMS § 7 lg 1: „Sotsiaalmaksu määr on 33 protsenti maksustatavalt summalt." *(The social tax rate is 33% of the taxable amount.)* Unchanged in the 2027 text. |

---

## 3. Computed next deadlines, Nov 2026 – Dec 2027

These are computed from the rules above and the holiday table, assuming a calendar FY. A row applies only when its applicability condition holds. Each row covers the reporting period of the previous month.

| Month | TSD + TSD taxes (incl. CIT on distributions), statutory → effective | KMD + VAT payment, statutory → effective |
|---|---|---|
| Nov 2026 (Oct period) | Tue 10 Nov | Fri 20 Nov |
| Dec 2026 (Nov) | Thu 10 Dec | Sun 20 Dec → **Mon 21 Dec** |
| Jan 2027 (Dec) | Sun 10 Jan → **Mon 11 Jan** | Wed 20 Jan |
| Feb 2027 (Jan) | Wed 10 Feb | Sat 20 Feb → **Mon 22 Feb** |
| Mar 2027 (Feb) | Wed 10 Mar | Sat 20 Mar → **Mon 22 Mar** |
| Apr 2027 (Mar) | Sat 10 Apr → **Mon 12 Apr** | Tue 20 Apr |
| May 2027 (Apr) | Mon 10 May | Thu 20 May |
| Jun 2027 (May) | Thu 10 Jun | Sun 20 Jun → **Mon 21 Jun** |
| Jul 2027 (Jun) | Sat 10 Jul → **Mon 12 Jul** | Tue 20 Jul |
| Aug 2027 (Jul) | Tue 10 Aug | Fri 20 Aug (holiday) → **Mon 23 Aug** |
| Sep 2027 (Aug) | Fri 10 Sep | Mon 20 Sep |
| Oct 2027 (Sep) | Sun 10 Oct → **Mon 11 Oct** | Wed 20 Oct |
| Nov 2027 (Oct) | Wed 10 Nov | Sat 20 Nov → **Mon 22 Nov** |
| Dec 2027 (Nov) | Fri 10 Dec | Mon 20 Dec |

Further dates:
- Annual report FY 2026: **Wed 30 Jun 2027**.
- Earliest possible deletion if it is not filed: on or after 30 Sep 2027 (ÄRS § 61 lg 2). This is a risk date only.

Cross-checks against official statements:
- The engine gives 10 Oct 2026 (Saturday) → 12 Oct 2026, the same date EMTA states.
- The engine gives 30 Jun 2024 (Sunday) → 1 Jul 2024, the same date RIK applied.

---

## 4. Mapping applicability facts to public data (Ärikratt MCP)

**Probe.**
- I made three calls, all on the single company with registry code 12417834: `get_company` (sections `activities`, `report_status`, `tax`, then `financials`, `tax_debt_history`), `check_counterparty` and `search_companies`.
- I also called `describe_datasets` (summary and `companies`).
- Snapshot `20261029T054510Z`.
- Only field names are reported here; no company data. The response also contained natural-person board data (`board.members[]`); it is deliberately not used.

| Fact needed by a rule | Ärikratt field path (tool) | Semantics / caveats |
|---|---|---|
| VAT-registered / VAT number (`vat-return-kmd`, `vat-payment`, `vat-registration-threshold`) | `profile.vat_number` (`get_company`); string or null | A non-null value means a KMKR number is on file. Provenance and freshness on deregistration are unverified (UNKNOWN U6). The registration *date* is **not available**. Indirect signal: `tax[].turnover` is non-null only for KMD filers. |
| Labour taxes paid in the last quarter, implying payroll and TSD (`tsd-monthly-return`) | `tax[i].labour_taxes`, `tax[i].labour_taxes_reason`, keyed by `tax[i].year`, `tax[i].quarter` (`get_company`, 8 quarters) | EMTA definition: withheld income tax, social tax, funded pension and unemployment premiums, paid on a **cash basis** during the quarter. A value above 0 means TSD was filed and paid for payouts around the previous month. 0 or null does **not** prove no TSD: CIT on dividends falls under "erijuhtude tulumaks", which counts in `tax[i].taxes_paid` but not in labour taxes. |
| Employee count (`tor-registration`, TSD trigger 7) | `tax[i].employee_count` (EMTA, quarterly); `financials[].employees_avg` (annual report); `search_companies.companies[].employees` | EMTA counts TÖR entries valid on the last day of the quarter, **excluding management and supervisory body members**. So 0 is consistent with a paid board member. Quote: „…välja arvatud juhtimis- või kontrolliorgani liikmed" *(excluding management or supervisory body members)*, EMTA open data page. |
| EMTAK activity | `profile.emtak_code`, `profile.emtak_label`; with `sections:["activities"]`: `activities[].emtak_code`, `activities[].label`, `activities[].is_primary`, `activities_total` | Context only; no rule above depends on EMTAK. |
| Financial year end (`annual-report`) | **Not available via MCP.** `describe_datasets("companies")` lists `companies.statute_fy_end` as a public field, but `get_company` and `search_companies` do not return it. `financials[].year` and `report_status.period` give the year only. | Default: 31 Dec (RPS § 13 lg 3). Confirm with the owner (UNKNOWN U4). |
| Latest filed annual report year and overdue status (`annual-report`, `annual-report-overdue`) | `report_status.latest_year`, `.filed`, `.status`, `.period`, `.next_due`, `.overdue_days`, `.overdue_days_reason` (`get_company` default card); same under `report.*` in `check_counterparty` | Use `overdue_days` as a corroborating signal. Compute the due date from the rule, not from `next_due`; it was null in the probe, so its semantics are unverified. |
| EMTA tax-debt list status | `tax_debt.on_list`, `.snapshot_date`, `.threshold_eur` (100), `.debt_amount`, `.disputed_amount`, `.scheduled_amount`, `.first_seen`, `.oldest_debt_date` (`get_company`, `check_counterparty`); history: `tax_debt_history.*` (`sections:["tax_debt_history"]`) | Ärikratt: `on_list` false means not on the EMTA list of debts ≥ €100 as of `snapshot_date`. EMTA (https://www.emta.ee/en/private-client/e-services-tax-literacy/registers-inquiries/public-data-inquiries, last updated 29.05.2026): "The inquiry does not show calculated interest and arrears below 100 euros." Relevant to `annual-report-overdue`: deletion is skipped for entities with tax debt. |
| Quarterly turnover, last 4 quarters (VAT threshold warning) | `tax[i].turnover`, `tax[i].turnover_reason`, keyed by `tax[i].year` / `tax[i].quarter` | EMTA definition: sum of KMD rows 1–3, including reverse-charge purchases, and **lagged**. EMTA: „…10. aprillil avaldatakse detsembri, jaanuari ja veebruari summa" *(on 10 April the sum of December, January and February is published)*. An empty value means no underlying return. **Consequence:** turnover exists only for companies that already file KMD, i.e. are VAT-registered. It is therefore **not usable for the registration-threshold warning** of a non-registered OÜ, and it differs from the § 19¹ lg 3 definition. Weak fallback: `financials[].revenue` of the latest annual report (annual, prior year). Primary source should be the owner's invoices or bookkeeping (UNKNOWN U5). |

EMTA open-data definitions are from https://www.emta.ee/eraklient/amet-uudised-ja-kontakt/uudised-pressiinfo-statistika/statistika-ja-avaandmed (tier B):
> „Deklareeritud käibena avaldatakse käibedeklaratsioonide ridade 1, 2 ja 3 summa, s.t käibemaksuseaduse § 15 lõigetes 1–4 sätestatud määraga maksustatavate toimingute ja tehingute kogusumma."
> *"Declared turnover is the sum of KMD rows 1, 2 and 3, i.e. operations taxable at the rates in KMS § 15(1)–(4)."*

The published data covers „kõik juriidilised isikud ja FIEd, kes on andmete avaldamise seisuga käibemaksukohustuslased" *(all legal persons and sole traders that are VAT-registered as of publication)*, among other groups.

---

## 5. UNKNOWN (could not verify), with recommended defaults

| # | Unknown | Recommended default | Rationale |
|---|---|---|---|
| U1 | **The first reporting period filed in the data-based KMD format.** KMS (2027-01-01 text) already merges KMD and KMD INF into one "käibedeklaratsioon". EMTA says "Alates 2027. aasta aprillist" and documents the format "alates 2027. aasta II kvartalist". It is unclear whether this means the period March 2027 (filed in April) or April 2027 (filed in May). | Keep the due date at the 20th for all periods, since both texts agree. Treat the format change as informational. Re-check EMTA in Feb 2027 before switching adapters. | Due-date correctness does not depend on this; only the filing channel does. |
| U2 | **VAT payment date when KMD is filed before the 20th.** KMS § 38 lg 1 says "käibedeklaratsiooni esitamise kuupäevaks" (by the date of submitting the return). I found no EMTA sentence stating the payment due date explicitly. | Show the payment due date as the statutory KMD deadline (20th, shifted). When the assistant files early, prompt to pay at filing time. | This is the earliest date known in advance. Paying at filing satisfies both readings. |
| U3 | **TÖR start moment for a *paid* board member.** MKS § 25¹ lg 3 p 4 defines "töötamise alustamine" for employment, unpaid, VÕS and civil-service work, but not for board members. | Register on or before the first day of the period for which a board fee is agreed, and in any case before the first fee payout. | This is the most conservative date compatible with § 25² lg 3. EMTA ties the registration duty to paying a fee. |
| U4 | **Financial year end** is not exposed by the Ärikratt MCP. In the dataset `companies.statute_fy_end` exists but is not returned. A related point: how RIK computes "6 months" for a non-calendar FY (e.g. FY end 30 Jun → 30 Dec under TsÜS § 136 lg 3, or 31 Dec?). | Default to a 31 Dec FY end (RPS § 13 lg 3). Ask the owner once whether the articles set another FY; this is a fact only the owner reliably knows here. For a non-calendar FY use the literal TsÜS § 136 lg 3–4 date (same day number, capped at month end). | The statutory default covers most OÜs. The literal computation never produces a date later than the true one. |
| U5 | **Year-to-date turnover for the €40,000 threshold** is not in public data for a non-registered OÜ (EMTA turnover exists only for KMD filers). Ärikratt quarter labelling versus EMTA's lag (does `quarter=1` mean Dec–Feb?) is also unverified. | Compute YTD turnover from the owner's invoices or accounting data, using the § 19¹ lg 3 composition. Use `financials[].revenue` > €40,000 in the last report only as a "likely to cross this year" warning. Never use EMTA turnover for the legal decision. | Getting the threshold wrong means invoices without VAT and retroactive registration (KMS § 20 lg 10–11). Public data cannot settle the date. |
| U6 | **Is `profile.vat_number` cleared promptly on VAT deregistration?** Its provenance in the dataset is not documented per field. | Treat non-null as VAT-registered. Corroborate with a non-null `tax[].turnover` in the latest quarter, or with the owner, before generating KMD deadlines. A non-null number with empty turnover for 2+ quarters: ask the owner. | Missing a KMD (filed even at zero) is the costlier error, so default to "registered" when a number exists. |
| U7 | **Saturday as "puhkepäev".** TsÜS § 136 lg 8 does not define rest days, and I found no general statutory definition in the acts read. | Treat Saturday and Sunday as non-working days. | EMTA (10 Oct 2026 → 12 Oct) and RIK (30 Jun 2024 → 1 Jul) apply exactly this. |
| U8 | **Easter-dependent holidays for 2027** were computed (Gregorian computus, PTS § 4 lg 1), not read from an official calendar page. | Use Good Friday 2027-03-26 and Easter Sunday 2027-03-28. Pentecost 2027-05-16 is a Sunday, so it has no effect. | The computation is deterministic. Only Good Friday affects working days, and no 10th or 20th deadline falls near it in 2027. |
| U9 | **Fine amounts** for a late annual report: ÄRS § 57 and TsMS § 601 set no amount. | Do not display an amount; say "the registrar may fine repeatedly". | Never guess an amount. |
| U10 | **Monthly social-tax minimum (kuumäär) for 2026/2027.** SMS § 2¹ sets it in the state budget; I did not verify the figure. | Not needed for a no-employee OÜ. If employees exist, read it from the State Budget Act before computing amounts. | Out of scope for due dates. |
| U11 | **The ÄS version currency.** The RT API reports `kehtivId` = 106072023131 (valid from 2024-03-01, no end), and no newer redaktsioon exists in group 161909. | HYPOTHESIS: § 179 lg 4 is current. Cheapest probe: open https://www.riigiteataja.ee/akt/ÄS and confirm the displayed RT id. | API metadata is strong but came from one endpoint. |

---

## 6. Source list

**Tier A (riigiteataja.ee, consolidated texts, fetched 2026-10-29 via `public-api/api/v1/akt/{id}/xml`):**
- KMS: https://www.riigiteataja.ee/akt/130062026129 (2027: …/130062026130; 2024 comparison: …/121112023010)
- TuMS: https://www.riigiteataja.ee/akt/109072026066 (2027: …/109072026067)
- SMS: https://www.riigiteataja.ee/akt/116102026014 (2027: …/116102026015)
- MKS: https://www.riigiteataja.ee/akt/116102026010 (from 2026-11-01: …/116102026011; 2027: …/116102026012)
- TKindlS: https://www.riigiteataja.ee/akt/130062026040
- TsÜS: https://www.riigiteataja.ee/akt/131122024048
- PTS: https://www.riigiteataja.ee/akt/120122022005
- ÄS: https://www.riigiteataja.ee/akt/106072023131
- RPS: https://www.riigiteataja.ee/akt/110072025003 (2027: …/111072026150)
- ÄRS: https://www.riigiteataja.ee/akt/114032025010
- TsMS: https://www.riigiteataja.ee/akt/120062026021

**Tier B (official agency pages, fetched 2026-10-29):**
- EMTA, TSD: https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine
- EMTA, TSD handbook: https://www.emta.ee/admin/content/handbook_article/826
- EMTA, TSD without payouts (news): https://www.emta.ee/uudised/millal-tuleb-tooandjal-tsd-esitada-ka-siis-kui-valjamakseid-tehtud-ei-ole
- EMTA, dividends: https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine/dividendi-maksustamine
- EMTA, KMD page: https://www.emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/kaibedeklaratsiooni-ja-aruannete-esitamine
- EMTA, KMD handbook PDF: https://www.emta.ee/node/337/handbook/6/pdf
- EMTA, VAT registration handbook PDF: https://www.emta.ee/node/333/handbook/4/pdf
- EMTA, cash-basis VAT page (shift rule): https://www.emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/kaibedeklaratsiooni-ja-aruannete-esitamine/kassapohise-kaibemaksukohustuslase-meelespea
- EMTA, employment registration: https://www.emta.ee/ariklient/registreerimine-ettevotlus/tootamise-register/tootamise-registreerimine
- EMTA, open data (turnover and employee definitions): https://www.emta.ee/eraklient/amet-uudised-ja-kontakt/uudised-pressiinfo-statistika/statistika-ja-avaandmed
- EMTA, public data inquiries (tax arrears): https://www.emta.ee/en/private-client/e-services-tax-literacy/registers-inquiries/public-data-inquiries
- RIK, 30 June news (25.06.2025): https://www.rik.ee/et/asutusest/uudised/kas-sul-majandusaasta-aruanne-esitatud-aega-juuni-lopuni
- RIK, 66 % filed / weekend shift / deletion (02.07.2024): https://www.rik.ee/et/asutusest/uudised/majandusaasta-aruanded-esitasid-sel-aastal-tahtajaks-66-kohuslastest
- RIK English annual-report page (**stale**, cites repealed ÄS §§ 60 and 71; do not use): https://www.rik.ee/en/e-business-register/annual-report

**Ärikratt MCP** (field names only): `get_company`, `check_counterparty`, `search_companies` and `describe_datasets`, snapshot `20261029T054510Z`. The data is public open data (Äriregister CC BY 4.0; EMTA CC BY-SA 3.0). Ärikratt states its output is not an official register extract.
