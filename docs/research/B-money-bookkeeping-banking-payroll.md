# B — Money: bookkeeping, invoicing, banking, payroll and finance

**Research date: 25 October 2026.** “OÜ” includes e-resident-owned companies; foreign payroll and tax exposure still require separate assessment. “All businesses” includes OÜ, FIE and ettevõtluskonto where applicable. Assistant modes are proposed product controls. **“None found” means no suitable public interface was identified, not proof that none exists.** Published APIs and MCP implementations below were researched, but authenticated operations were not tested.

## Bookkeeping, documents and expenses

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B01 | “Set up the right bookkeeping for my business.” | OÜ / FIE | Start-up; changed circumstances. Assess accrual versus permitted FIE cash accounting and reporting category. | Accountant; RIK; EMTA | Software / portal | [e-arveldaja API][rikapi] | draft | High: wrong accounting basis | [Accounting Act][rps] |
| B02 | “Can I keep the books myself, and give my accountant limited access?” | OÜ / FIE / e-resident | Start-up; accountant appointment or departure. Owner bookkeeping is possible; outsourcing does not eliminate management responsibilities. | Accountant; software provider | Portal / contract | [RIK API][rikapi]; access administration may require UI | act-with-approval | High: access or accountability errors | [Official e-Financials description][selfbooks]; [Accounting Act][rps] |
| B03 | “Build my chart of accounts and move my opening balances.” | OÜ / FIE | Initial setup; software migration; acquisition | Accountant; ledger provider | API / CSV / portal | [Merit API][merit]; [RIK API][rikapi] | act-with-approval | High: corrupted balances | [Accounting Act §§8–11][rps]; [Merit][merit] |
| B04 | “Keep every source document and find what is missing.” | OÜ / FIE | Every transaction; periodic archive checks. Generally seven years after financial-year end; long-term rights/obligations have a different starting point. | Accountant; EMTA; auditor | API / cloud archive / paper | [e-arveldaja MCP][rikmcp] | act-with-approval | High: lost audit evidence | [Accounting Act §12][rps]; [VAT invoice retention][vatinvoices] |
| B05 | “Book these purchase invoices and photographed receipts.” | OÜ / FIE | Daily/weekly; extract supplier, date, amounts, VAT, dimensions and attachment | Suppliers; accountant | API / app / email / portal | [Envoice integration][envoice]; [RIK API][rikapi] | draft | High: OCR or VAT errors | [Source-document requirements][rps]; [Envoice][envoice] |
| B06 | “Check this bill against the order and approve it once.” | OÜ / FIE; trade/construction | Invoice arrival; compare deliveries, duplicates, changed bank details and approval limits | Supplier; internal approver | API / portal / email | [Telema eFlow/EDI][telema]; [Directo][directoapi] | act-with-approval | High: fraudulent/duplicate payment | [Telema workflows][telema] |
| B07 | “Repay business expenses I paid personally.” | Owner / employee / board member | Expense claim; home-office costs, equipment and mixed-use allocation | Company; claimant | App / API / portal | [Envoice][envoice]; [Merit API][merit] | act-with-approval | High: private expense misclassification | [EMTA fringe benefits][fringe] |
| B08 | “Prepare my trip order and reimburse this business trip.” | Employer / board member | Each trip. Foreign daily allowance: tax-exempt up to €75 for first 15 days, maximum 15/calendar month; €40 thereafter. | Traveller; EMTA | App / ledger / bank | [Merit API][merit]; [Envoice][envoice] | act-with-approval | High: taxable excess or ineligible trip | [EMTA business trips][trips] |
| B09 | “Reimburse business kilometres in my own car.” | Employer / board member | Driving log and reimbursement; up to €0.50/km and €550/month per employer; INF 14 by following 1 February | Claimant; EMTA | Ledger / e-MTA / bank | [Merit API][merit]; INF filing adapter none found | act-with-approval | High: missing log or exceeded exemption | [EMTA car compensation][car] |
| B10 | “Calculate the tax on company-car and other personal benefits.” | Employer / OÜ owner | Monthly; private vehicle use, accommodation, meals, gifts to staff, preferential loans | Employee; EMTA | Payroll / ledger / e-MTA | [Merit Palk API][palk]; [EMTA interfaces][emtaapi] | draft | High: omitted fringe-benefit taxes | [EMTA fringe benefits][fringe] |
| B11 | “Track our tax-free health and sports allowance.” | Employer | Per claim and annually; qualifying expenditure up to €400/person/year, subject to conditions | Employee; EMTA | App / ledger / e-MTA | [Envoice][envoice]; [Merit API][merit] | draft | Med: excess or ineligible expense | [EMTA health-expense rules][fringe] |
| B12 | “Separate business costs, entertaining clients, donations and personal spending.” | OÜ / FIE | Each expense; month-end tax review | Accountant; EMTA | Ledger / e-MTA | [Merit API][merit] | draft | High: incorrect deductibility/tax | [EMTA income and social taxes][taxoverview] |
| B13 | “Maintain equipment, depreciation, leases and asset disposals.” | OÜ / FIE | Acquisition; monthly depreciation; sale, impairment or disposal | Accountant; lessor | API / software | [Merit API][merit]; [Joosep assets][joosep] | draft | Med: misstated assets/profit | [Accounting framework][accounting]; [Joosep][joosep] |
| B14 | “Reconcile stock, production costs and inventory losses.” | Retail / manufacturing / food / agriculture | Stock movements; counts; close; spoilage and own consumption | Warehouse; accountant | POS / ERP / API | [ERPLY Books API][erply]; [Directo][directoapi] | draft | High: incorrect stock, margin or VAT | [ERPLY API][erply]; [Accounting Act][rps] |
| B15 | “Close the month and fix posting errors with an audit trail.” | OÜ / FIE | Monthly/year-end; accruals, prepayments, provisions, clearing accounts, reversals and period locks | Accountant | API / software | [RIK API][rikapi]; [Merit API][merit] | act-with-approval | High: altered historical accounts | [Accounting Act §10][rps]; [RIK API][rikapi] |

## Sales, invoicing, receivables and cash

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B16 | “Turn my quote, hours or recurring contract into an invoice.” | All businesses | Milestone, delivery or billing cycle; deposits and staged billing | Customer | API / portal / email | [Merit API][merit]; [X7 MCP][x7] | act-with-approval | Med: wrong price or recipient | [Merit][merit]; [X7][x7] |
| B17 | “Issue a legally complete sales invoice.” | OÜ / FIE / ettevõtluskonto | Each sale; identify parties, transaction date/content, amounts and invoice identifier where required | Customer; EMTA | API / email / paper | [RIK API][rikapi]; [Merit API][merit] | act-with-approval | High: inadequate source document | [Accounting Act §7][rps] |
| B18 | “Make this a correct VAT invoice.” | VAT payer | Generally within seven calendar days of supply/payment; specified intra-EU supplies by next month’s 15th | Customer; EMTA | API / e-invoice / email | [Merit API][merit] | act-with-approval | High: invalid VAT evidence | [Issuance deadlines][invoiceissue]; [Required fields][invoicefields] |
| B19 | “Invoice my foreign customer correctly.” | Exporter / online seller / e-resident OÜ | Each foreign sale; VAT-ID validation, place of supply, reverse-charge/zero-rate wording, currency and evidence | Customer; EMTA | API / portal | Ledger API; [EU VIES][vies] | draft | High: wrong jurisdiction or VAT | [VAT invoice rules][vatinvoices]; [EMTA VAT reporting][vatreturns] |
| B20 | “Correct an invoice, refund it, or accept a customer’s self-billed invoice.” | OÜ / FIE | Returns, discounts, cancellation, agreed self-billing; link correction to original | Customer | API / portal / email | [Merit API][merit]; [Stripe API][stripeapi] | act-with-approval | High: duplicate refund or tax correction | [EMTA credit notes/self-billing][invoiceissue] |
| B21 | “Send and receive proper machine-readable e-invoices.” | OÜ / FIE; public-sector suppliers | Each relevant invoice. Since 1 July 2025, registered recipients may require e-invoices; EN 16931 is default unless otherwise agreed. | Customer; operator; RIK | Operator API / portal | [Finbite][finbite]; [Telema][telema]; [RIK API][rikapi] | act-with-approval | Med: rejected invoice, delayed payment | [European Commission: Estonia][einvoice] |
| B22 | “Close today’s till and reconcile cash, cards and vouchers.” | Retail / hospitality / personal services | Daily; floats, cash counts, refunds, deposits and shortages | Cashier; bank; accountant | POS / API / cash book | [ERPLY API][erply] | act-with-approval | High: missing sales/cash | [Accounting Act][rps]; [ERPLY][erply] |
| B23 | “Give customers the right receipt and round cash payments correctly.” | Consumer-facing businesses | Receipt required at €20 or more; below €20 on request. Cash basket totals round to nearest €0.05 since 2025; cards do not. | Consumer; TTJA | POS / paper / electronic receipt | POS adapter; [ERPLY][erply] | act-with-approval | Med: consumer/cash discrepancies | [Receipt rules][receipt]; [Eesti Pank rounding][rounding] |
| B24 | “Chase overdue invoices without chasing someone who already paid.” | OÜ / FIE | Due-date breach; reconcile payments and disputes before sending | Customer | API / email / portal | [SmartAccounts API][smartapi]; [Finbite][finbite] | act-with-approval | Med: reputational damage | [SmartAccounts][smartapi]; [Finbite reminders](https://finbite.eu/en/) |
| B25 | “Calculate late interest and prepare a debt-collection handoff.” | OÜ / FIE | Overdue debt; contract or statutory basis. Statutory rate: §94 reference rate plus eight percentage points annually. | Debtor; collector; lawyer; court | Email / portal / documents | Ledger API; collection-filing MCP none found | act-with-approval | High: unlawful demand/disclosure | [EU e-Justice: Estonian interest][interest] |
| B26 | “Write off an unpaid invoice and assess the VAT adjustment.” | OÜ / FIE / VAT payer | Evidence of irrecoverability; settlement; insolvency | Accountant; EMTA | Ledger / e-MTA | [Merit API][merit]; specialist rules adapter needed | draft | High: premature tax relief | [EMTA VAT accounting][vatinvoices] |

**VAT-invoice validation for B18:** number/date; seller name, address and VAT number; buyer name/address and VAT number where required; goods/services and quantity; supply/advance date when different; net prices/discounts; taxable amounts by rate; VAT amount in euros; applicable special wording. [EMTA invoice specification][invoicefields]

## Banking, payments and settlement

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B27 | “Connect business accounts and control who can see or pay.” | All businesses | Onboarding; consent renewal; accountant departure | Bank; payment institution | Portal / business API / PSD2 | [LHV MCP][lhvmcp]; [LHV Connect][lhv]; [Enable Banking][enable] | act-with-approval | High: excessive access | [LHV][lhv]; [Coop PSD2 prerequisites][coop] |
| B28 | “Match bank transactions to invoices and explain every unmatched line.” | OÜ / FIE | Daily/monthly; partial payments, transfers, netting, fees and duplicates | Bank; accountant | API / CAMT.053 / CSV | [LHV MCP][lhvmcp]; [e-arveldaja MCP][rikmcp] | act-with-approval | High: double-booking/missing money | [LHV Connect][lhv]; [MCP implementation][rikmcp] |
| B29 | “Prepare supplier payments and let me approve the exact batch.” | OÜ / FIE | Payment run; verify beneficiary, IBAN, amount, due date and cash availability | Bank; supplier | Business API / payment file / portal | [LHV Connect][lhv]; [SEB Gateway][seb]; [Revolut API][revolut] | act-with-approval | High: irreversible transfer | [LHV payment/verification services][lhv]; [Revolut scopes][revolut] |
| B30 | “Pay taxes and reconcile the EMTA prepayment account.” | OÜ / FIE / employer | Tax due dates; refund, offset or reconciliation | EMTA; bank | e-MTA / bank API | [EMTA interfaces][emtaapi]; bank API | act-with-approval | High: tax remains unpaid | [EMTA tax calendar][taxcalendar]; [e-arveldaja MCP limitations][rikmcp] |
| B31 | “Control employee cards, recurring debits and subscriptions.” | Employer / OÜ / FIE | Card issuance; spending changes; monthly review; cancellation | Bank; subscription supplier | API / portal | [Revolut Business API][revolut] | act-with-approval | High: unauthorised expenditure | [Revolut API][revolut] |
| B32 | “Collect or pay in another currency and book the exchange difference.” | Exporter / e-resident / importer | Invoice, settlement and period-end revaluation | Bank; foreign customer/supplier | API / portal | [Wise API][wise]; [LHV Connect][lhv]; ledger API | act-with-approval | High: wrong currency/rate | [Wise API][wise]; [Accounting framework][accounting] |
| B33 | “Add payment links, bank payments, cards or recurring billing.” | Online seller / services | Checkout setup; invoice collection; renewal | Payment provider; customer | API / plugin / portal | [Montonio][montonio]; [MakeCommerce][makecommerce]; [EveryPay][everypay]; [Stripe][stripeapi] | act-with-approval | High: unintended charge | Provider developer documentation |
| B34 | “Reconcile Stripe, PayPal, marketplace or platform payouts.” | E-commerce / platform workers / SaaS | Each payout; split gross sales, VAT, commissions, reserves, refunds and FX | PSP; marketplace; accountant | API / CSV / portal | [Stripe API][stripeapi]; [PayPal MCP][paypal]; ledger API | draft | High: net payout mistaken for revenue | [Stripe API][stripeapi]; [PayPal][paypal] |
| B35 | “Handle refunds, chargebacks and withheld payouts.” | Card/marketplace merchants | Dispute or refund; provider-specific response deadline | PSP; customer | API / portal / email | [Stripe API][stripeapi]; [MakeCommerce][makecommerce]; [PayPal][paypal] | act-with-approval | High: lost dispute/double refund | Provider developer documentation |
| B36 | “Book crypto receipts, exchange trades and wallet fees.” | OÜ / FIE using crypto | Each transaction; reconciliation and valuation | Exchange; accountant | Exchange API / wallet export / ledger | Exchange-specific adapter; [RIK API][rikapi] | draft | High: ownership/valuation mistakes | [Official accounting guidance][accounting]; [Accounting Standards Board interpretation][crypto] |
| B37 | “Answer the bank’s source-of-funds request.” | OÜ / FIE / e-resident | Account opening or compliance review | Bank; payment institution | Portal / email | None found for complete KYC workflow | draft | High: sensitive disclosure/account restriction | [Wise business verification][wisekyc] |

## Payroll, remuneration and owner money

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B38 | “Calculate gross-to-net salary and total employer cost.” | Employer | Each payroll. 2026: income tax 22%; social tax 33%; unemployment 1.6% employee/0.8% employer; II pillar 2%, 4% or 6% when applicable. | Employee; EMTA | Payroll API / software | [Merit Palk API][palk] | draft | High: underpayment/tax errors | [EMTA 2026 rates][rates] |
| B39 | “Apply the employee’s tax-free allowance and pension status.” | Employer | Hiring; application/status changes; payroll. From 2026 ordinary exemption €700/month without taper; pensionable-age exemption €776/month. | Employee; Pensionikeskus; EMTA | Payroll / authorised query / portal | [Merit Palk][palk]; [EMTA query guidance][rates] | draft | High: excessive exemption | [EMTA exemption rules][exemption]; [Rates][rates] |
| B40 | “Check minimum wage and minimum social tax exceptions.” | Employer | Payroll; part-time work, absences, multiple employers and protected categories. Social-tax base €886/month → €292.38; minimum wage since April 2026 €946/month or €5.67/hour. | Employee; EMTA | Payroll / portal | [Merit Palk API][palk] | draft | High: statutory underpayment | [EMTA rates][rates] |
| B41 | “Turn timesheets, overtime and bonuses into payroll.” | Employer; shift/project sectors | Each pay period; attendance approval | Employee; manager | Time system / API / CSV | [Merit Palk salary/absence endpoints][palk] | draft | High: incorrect remuneration | [Merit payroll specification][palk] |
| B42 | “Calculate holiday pay and sickness compensation.” | Employer | Leave/sickness. Holiday pay normally penultimate working day before leave; agreement may defer within legal limits. Ordinary employer sick-pay period: days 4–8. | Employee; Tervisekassa | Payroll / portal / X-Road | [Merit Palk][palk]; Tervisekassa adapter needs confirmation | draft | High: employee entitlement errors | [Holiday pay][holiday]; [Sickness benefits][sickness] |
| B43 | “Prepare final settlement, deductions and unused-leave compensation.” | Employer | Termination; final settlement on employment’s last day; enforcement deductions require case-specific rules | Employee; enforcement agent | Payroll / bank / correspondence | [Merit Palk][palk]; specialised deduction adapter needed | draft | High: unlawful withholding | [Tööelu termination][termination]; [Holiday compensation][holidays] |
| B44 | “Pay a board-member fee or someone working abroad.” | OÜ / e-resident / employer | Each remuneration decision/payment; distinguish director duties from employment, residence and A1 coverage | Director; EMTA; foreign authority | Payroll / e-MTA / foreign portal | [Merit Palk][palk]; foreign adapters vary | draft | High: cross-border misclassification | [EMTA non-resident remuneration][board]; [Unemployment exclusions][unemployment] |
| B45 | “Send payslips and pay the approved payroll.” | Employer | Agreed payday; verify recipients and batch totals | Employees; bank | Payroll / email / bank API | [Merit Palk][palk]; [LHV Connect][lhv] | act-with-approval | High: payroll leakage/wrong payment | [Merit API][palk]; [LHV][lhv] |
| B46 | “File payroll taxes and check the filing actually succeeded.” | Employer / remuneration payer | TSD and payment by following month’s 10th. From 1 October 2026 payroll data uses XBRL GL, replacing annexes 1–2 XML; CSV transition through 2027. | EMTA | X-Road / e-MTA / file | [EMTA technical interfaces][emtaapi]; payroll adapter | act-with-approval | High: rejected/duplicate declaration | [Tax calendar][taxcalendar]; [2026 transition][tsdchange] |
| B47 | “Pay a freelancer or ettevõtluskonto supplier correctly.” | OÜ / employer / FIE | Each contract/payment; distinguish invoice, individual service fee and entrepreneur-account service purchase | Contractor; EMTA | Ledger / payroll / bank | [Merit][merit]; [Merit Palk][palk] | draft | High: concealed employment/omitted tax | [Entrepreneur account: corporate service buyer’s 22/78 tax][entrepreneur] |
| B48 | “Can I distribute this profit, and what tax will it cost?” | OÜ shareholder | Approved distribution; check retained earnings, capital restrictions, decision and liquidity. Generally 22/78 on net distribution. | Shareholders; EMTA | Ledger / resolution / e-MTA / bank | [Merit API][merit]; [e-arveldaja MCP][rikmcp] | act-with-approval | High: unlawful dividend or disguised salary | [EMTA distribution tax][taxoverview]; [Official remuneration guidance][ownpay] |
| B49 | “Record money I lend the company and repay it correctly.” | OÜ owner | Loan, interest accrual and repayment; document direction, terms and principal separately | Owner; company; EMTA | Contract / ledger / bank | [RIK API][rikapi] | act-with-approval | High: repayment confused with income | [Official corporate-loan guidance][loans] |
| B50 | “Check whether the company may lend to me or a related party.” | OÜ / group company | Before commitment; assess loan prohibitions, repayment substance, market terms and reporting | Related party; accountant/legal adviser | Documents / ledger / e-MTA | Ledger API; legal decision adapter none found | draft | High: prohibited loan/hidden distribution | [Official corporate-loan guidance][loans] |
| B51 | “Track capital contributions, shareholder balances and equity payouts.” | OÜ | Capital change, loss coverage or capital return; reconcile tax contribution history | Shareholders; RIK; EMTA | Ledger / registry / e-MTA | [RIK API][rikapi]; submission adapters vary | draft | High: incorrect capital/tax history | [EMTA equity-payment taxation][taxoverview] |

## Tax preparation, reporting and business-form differences

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B52 | “Warn me before VAT registration becomes compulsory.” | OÜ / FIE | Continuous monitoring; relevant Estonia-place-of-supply turnover exceeding €40,000/calendar year; voluntary registration/deregistration assessment | EMTA | Ledger / e-MTA | Ledger API; registration API none found | draft | High: missed liability date | [EMTA registration][vatregister] |
| B53 | “Does buying foreign software or EU goods trigger limited VAT registration?” | Non-VAT OÜ / FIE | Specified foreign services can trigger immediately; intra-EU goods threshold €10,000/year | EMTA | Ledger / e-MTA | [Merit API][merit]; filing via portal | draft | High: missed reverse-charge tax | [EMTA limited liability][limitedvat] |
| B54 | “Check VAT codes and deductible input VAT.” | VAT payer; mixed/exempt sectors | Each posting; annual adjustment; cars, property, imports, own use, bad debts and margin schemes | Accountant; EMTA | Ledger / API | [Merit API][merit] | draft | High: overstated deduction | [EMTA VAT accounting][vatinvoices]; [Rates][rates] |
| B55 | “Prepare and submit KMD and KMD INF from the ledger.” | VAT payer | Monthly, following month’s 20th; KMD INF generally when qualifying invoices total at least €1,000 excluding VAT per partner | EMTA | X-Road / portal / XML/CSV | [EMTA KMD interfaces][emtaapi]; [supported accounting packages][kmdsoftware] | act-with-approval | High: tax mismatch/late filing | [EMTA VAT returns][vatreturns] |
| B56 | “Prepare EU-sales, OSS/IOSS or SME-scheme reports.” | Cross-border seller | VD normally following month’s 20th when relevant supplies occur; other schemes follow their own calendars | EMTA; EU authorities | e-MTA / ledger exports | Ledger API; scheme-specific submission adapters not verified | draft | High: wrong country/scheme | [VD rules][vatreturns]; [SME scheme][sme] |
| B57 | “Prepare VAT refunds and correct an earlier declaration.” | VAT payer / foreign traveller | Overpayment, foreign VAT expenditure or discovered error | EMTA; foreign tax authority | Portal / X-Road / documents | [EMTA interfaces][emtaapi]; foreign-refund adapter none found | act-with-approval | High: invalid claim/wrong period | [EMTA VAT returns][vatreturns]; [VAT guidance][vatguide] |
| B58 | “Prepare my annual report, including a dormant company.” | OÜ / e-resident | Within six months of year-end. Micro classification: at least two of assets ≤€450,000, revenue ≤€900,000, average employees ≤10. | RIK; accountant; shareholders | e-Business Register / XBRL | e-arveldaja report generation; public submission MCP none found | draft | High: incorrect/public financial statements | [Official accounting guidance][accounting]; [RIK deadline][annual] |
| B59 | “Check audit/review requirements and prepare the accountant’s evidence pack.” | OÜ; regulated sectors | Year-end, financing, category or sector change; thresholds/exemptions require current statutory assessment | Auditor; accountant; lender | Export / secure sharing / portal | [RIK API][rikapi]; [Merit][merit] | draft | High: missed assurance requirement | [Accounting framework and sector caveats][accounting] |
| B60 | “Prepare my FIE income-and-expense tax return.” | FIE | Forms A/E by 30 April; business/private allocation, assets, special-account movements and losses | EMTA | e-MTA / ledger export | Ledger API; Form E filing adapter none found | act-with-approval | High: wrong taxable business income | [EMTA FIE guidance][fie] |
| B61 | “Reserve and pay my FIE advance taxes.” | FIE | Social tax: 15 March/June/September/December, subject to exceptions; income-tax advances: 15 September/December where applicable | EMTA; bank | e-MTA / bank | Bank API; liability read adapter needs validation | act-with-approval | High: unexpected arrears | [FIE calendar][fiecalendar]; [2026 income-tax examples][fieincome] |
| B62 | “Explain my ettevõtluskonto receipts and automatic tax.” | Ettevõtluskonto | Each receipt; tax 20%, or 22/24/26% with II pillar; no expense deduction; monitor €40,000 business-form transition threshold | LHV; EMTA | Bank / e-MTA | [LHV MCP][lhvmcp], subject to account coverage; specialised tax adapter none found | read | High: misunderstanding net income | [EMTA entrepreneur account][entrepreneur] |
| B63 | “Close the business and preserve the financial records.” | OÜ / FIE | Cessation/liquidation; final accounts, unsettled claims, tax corrections, assets and archive handover | RIK; EMTA; accountant | Portals / ledger / documents | Ledger exports; complete closure adapter none found | draft | High: unpaid liabilities/lost records | [Accounting Act][rps]; [VAT deregistration guidance][vatguide] |

## Planning, financing and insurance

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| B64 | “Will I have enough cash for wages, taxes and suppliers?” | All businesses | Daily/weekly forecast; scenarios for delayed receipts, seasonality and owner withdrawals | Owner; accountant | Ledger / bank / spreadsheet | [LHV MCP][lhvmcp]; [Merit][merit]; [Directo MCP][directomcp] | read | High: liquidity decisions | Provider API documentation |
| B65 | “Compare budget with actuals and check my prices and margins.” | OÜ / FIE; projects/retail/services | Monthly; new quote/product; include labour, fees, VAT, returns and overhead | Owner; accountant | ERP / spreadsheet / API | [ERPLY reports][erply]; [Directo MCP][directomcp] | read | Med: loss-making pricing | [ERPLY API][erply]; [Directo][directomcp] |
| B66 | “Prepare a bank loan, overdraft, leasing or factoring application.” | OÜ / FIE | Investment or working-capital need; compare total cost, collateral, recourse and covenants | Bank; lessor; factor | Portal / email / documents | Ledger/bank APIs for evidence; application API none found | draft | High: unsuitable debt/guarantees | [EIS financing routes][eisguarantee] |
| B67 | “Can EIS/KredEx guarantee my financing or support exports?” | Eligible OÜ / sectors | Financing application; current programme eligibility | Bank/lessor; EIS; credit insurer | Bank application / documents | None found | draft | High: reliance on unavailable support | [EIS guarantee][eisguarantee]; [export loan][exportloan]; [old start-up loan closed][closedloan] |
| B68 | “Compare crowdfunding or revenue-based financing.” | OÜ; property/e-commerce/SaaS | Capital need; check lender authorisation and incorporation eligibility | Platform; investors; lender | Portal / documents | None found for suitable Estonian application workflow | draft | High: unsuitable/unavailable finance | [FI crowdfunding register][crowdfunding]; [Wayflyer eligibility][wayflyer] |
| B69 | “Buy or renew business insurance and prepare a claim.” | OÜ / FIE; sector-specific | Start-up, asset/staff changes, renewal or loss; property, liability, interruption, transit, vehicle and health cover | Insurer; broker | Portal / email / documents | None found for general Estonian commercial-insurance API | act-with-approval | High: uninsured exposure/false claim | [If Estonia business insurance][insurance] |
| B70 | “Track grant spending and produce the financial evidence.” | Grant recipient | Project expenditure and contractual reporting dates; separate eligible costs and own financing | EIS / municipality / funder | Ledger / grant portal / documents | [Merit dimensions][merit]; [Directo][directoapi] | draft | High: grant recovery | [EIS funding programmes][eisfunding] |
| B71 | “Prepare an arrears plan before I run out of money.” | OÜ / FIE | Cash shortfall; overdue tax/debt; insolvency warning | EMTA; creditors; adviser | Portal / email / documents | Bank/ledger APIs; restructuring adapter none found | draft | High: worsening insolvency | [EMTA tax-payment instalments](https://www.emta.ee/en/business-client/taxes-and-payment/payment-arrears/payment-tax-liabilities-instalments) |
| B72 | “Use my identity to sign or confirm this payment/report.” | Owner / authorised signatory | Each legally significant signature or bank authentication | Bank; RIK; EMTA | ID-card / Mobile-ID / Smart-ID / portal | Underlying signing flow; human completes authentication | never-automate | High: impersonation/unauthorised signature | [LHV signing arrangements][lhv]; [RIK terms](https://www.rik.ee/sites/default/files/2024-05/e-arveldaja_kasutustingimused_0.pdf) |

## Concrete API and MCP landscape

MCP discovery covered vendor documentation and indexed GitHub, official MCP Registry, Smithery, Glama and mcp.so results. Direct official-registry retrieval was unavailable, so catalogue completeness is **UNVERIFIED**. “Community” below includes independent commercial wrappers. A documented accounting “payment” operation may merely record settlement; it does not necessarily move bank funds.

### Accounting, payroll and invoice exchange

| Provider | Existing integration and access conditions | MCP finding |
|---|---|---|
| **RIK e-arveldaja** | [Developer guide][rikapi], [OpenAPI](https://rmp-api.rik.ee/openapi.yaml), [HTML reference](https://rmp-api.rik.ee/api.html); company credentials and demo environment. **Not permanently free generally:** first year free; later usage fees, with a public-sector-invoicing exception. [Pricing](https://www.rik.ee/et/e-arveldaja/teenustasu) | Community [iseppo/e-arveldaja-mcp][rikmcp] and [e-financials-mcp](https://github.com/werkstatt-jasper/e-financials-mcp); hosted [Werkzeug](https://werkzeug.ee/docs/). No RIK-official MCP found. |
| **Merit Aktiva** | [Official API][merit]; signed JSON requests; general third-party API access requires Pro/Premium. [Access conditions](https://support.merit.ee/et/articles/12673122-api-seadistus) | Community [werkstatt-jasper](https://github.com/werkstatt-jasper/merit-aktiva-mcp), [roosa-dev](https://glama.ai/mcp/servers/roosa-dev/merit-aktiva-mcp), and Werkzeug. |
| **SmartAccounts** | [REST/JSON specification][smartapi]; [API included in paid monthly subscription](https://www.smartaccounts.eu/en/2025/12/how-to-use-api/). | Independent [usefulapi MCP](https://usefulapi.io/smartaccounts/), including reads and writes. Some writes post immediately rather than creating drafts. |
| **Directo** | [XML Direct][directoapi]; separately enabled components and scoped API keys. | Official [Ask Directo][directomcp], local/read-only; requires API Direct access. |
| **Standard Books / Excellent Books** | [REST and workflow API documentation](https://api-docs.excellent.ee/); register operations, attachments and workflow functions; deployment/authentication configuration required. | No dedicated MCP found. |
| **Envoice Estonia** | [Partner integration documentation][envoice] identifies `api.envoice.eu/partner/v1/`; invoice/receipt/expense workflows. Full public developer specification **UNVERIFIED**. | None found for **envoice.eu**. Malaysian `envoice.my` MCP is a different product. |
| **Joosep** | [Vendor modules][joosep]; EMTA lists Joosep as supporting [KMD X-Road submission][kmdsoftware]. General public API specification: none found. | None found. |
| **SimplBooks** | [Developer reference](https://app.simplbooks.com/api-documentation/); custom API requires Premium; native bank/e-invoice/KMD connections are separate. [Conditions](https://support.simplbooks.ee/en/kasutusjuhendid/what-is-api-and-how-it-works/) | None found. |
| **ERPLY Books** | [REST API and Swagger][erply]; organisation/user tokens, invoices, accounts, payments, reports and attachments. | Independent [Werkzeug MCP](https://werkzeug.ee/docs/). |
| **Merit Palk** | [Payroll API][palk]; employees, pay, absences, exemptions and reports. Pro access; documented restrictions on modifying/deleting data. | [Elnora](https://github.com/Elnora-AI/elnora-merit-aktiva) provides community CLI/skills; standalone payroll MCP coverage **UNVERIFIED**. |
| **Other local tools** | [X7][x7] supports invoicing, expenses and connections/exports to local ledgers. “Taxify” as an Estonian bookkeeping product: **UNVERIFIED**. | X7 advertises its own official `https://x7.ee/mcp`. |
| **Xero** | [Accounting API](https://developer.xero.com/documentation/api/accounting/overview); requires Estonian reporting mappings/adapters—native KMD/TSD filing was not verified. | Official [remote MCP](https://developer.xero.com/documentation/guides/remote-mcp/overview); commercial-plan conditions. Its tools do not themselves require user confirmation. |
| **QuickBooks Online** | [Accounting API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice). Estonia-specific payroll/filing support **UNVERIFIED**. | Official [Intuit MCP pilot](https://github.com/IntuitDeveloper/intuit-3p-ai-pilot), invitation-only; not a universally available connector. |
| **Omniva / Finbite** | Use the invoice business’s [Finbite Peppol API][finbite], with send/receive/validation and participant lookup. Omniva parcel APIs are unrelated. | None found. |
| **Telema** | [Technical guides][telema], [EDI REST specification](https://media.voog.com/0000/0011/5816/files/Telema%20EDI%20REST%20API.pdf); channel provisioning, invoice exchange and eFlow approvals. | None found. |
| **Fitek / FitekIN** | [FitekIN API documentation](https://fitekgroup.atlassian.net/wiki/spaces/FAD/pages/2315943941); document import/update, contracted environment. | Dedicated MCP none found. |
| **Unifiedpost / Banqup** | [Developer documentation](https://docs.btx.banqup.com/); document and payment APIs; product/Estonian tenant coverage needs confirmation. | Independent [Apideck Banqup MCP](https://www.apideck.dev/mcp-server/banqup); advertised invoice/customer coverage, not proven complete operator access. |
| **e-arveldaja inbox** | Same RIK accounting/API environment; verify whether each operator registration, delivery receipt and inbox action is exposed. | Existing community RIK MCPs; complete e-invoice transport coverage **UNVERIFIED**. |

### Banks, open banking and payment providers

| Provider | Developer interface and practical distinction | MCP finding |
|---|---|---|
| **LHV** | [Connect business API][lhv]: statements, payments, notifications, FX and payee verification; agreement/certificates. Legacy payment-initiation v3 support ends **15 November 2026**. | Official [LHV.ai MCP][lhvmcp], public beta, **read-only**; separate from payment-capable Connect. |
| **Swedbank** | [Gateway onboarding/developer access](https://www.swedbank.com/openbanking/swedbank-gateway-go-live.html): Baltic business integration; [PSD2 APIs](https://www.swedbank.com/openbanking/) require appropriate regulated access. | No suitable Estonia-account transactional MCP verified. |
| **SEB** | [Baltic Gateway developer portal][seb]: business account/payment integration, agreements and authentication; distinct from PSD2. | None found. |
| **Coop Pank** | [Gateway](https://www.cooppank.ee/en/info/faq/gateway-interface) supports ERP statements/payment upload; unsigned payments can await bank approval. Public [PSD2 documentation][coop] is a separate interface. | None found; public Gateway endpoint specification remains **UNVERIFIED**. |
| **Luminor** | [Open Banking portal](https://developer.luminoropenbanking.com/); [corporate Web Service specification](https://www.luminor.lt/sites/default/files/dokumentai/bendri/luminor-web-service-specification.pdf). Estonia-specific corporate onboarding must be confirmed. | None found. |
| **Wise Business** | [API][wise]. Crucially, [personal business tokens](https://docs.wise.com/guides/developer/auth-and-security/personal-api-token) cannot fund transfers or retrieve balance statements for Estonian/EEA accounts; partner access differs. | Community [Wise MCP](https://github.com/mcp-dir/wise-mcp); official documentation MCP exists, but documentation access is not banking access. |
| **Revolut Business** | [Business API][revolut]: separate READ, WRITE and PAY scopes; payment drafts, FX, cards and expenses. Plan restrictions apply. | Community [fingentic/revolut-mcp](https://github.com/fingentic/revolut-mcp). Official Revolut X MCP concerns crypto trading, not Business banking. |
| **Salt Edge** | [API v6](https://docs.saltedge.com/): aggregated AIS/PIS with consent and contracted access. | Community/demo [7BlockLabs MCP](https://github.com/7BlockLabs/mcp-salt-edge-demo); not official. |
| **Enable Banking** | [AIS/PIS documentation][enable]; account, country and bank coverage must be checked during onboarding. | Community [BankMCP](https://github.com/noskillish/bankmcp), read-only. |
| **GoCardless / Nordigen** | [Bank Account Data API](https://docs.gocardless.com/docs/bank-account-data), **AIS**, not payment initiation; commercial eligibility/access must be confirmed. | Independent [Pipedream MCP](https://mcp.pipedream.com/app/nordigen). |
| **Montonio** | [Current developer docs][montonio]: merchant collection, bank/card methods and refunds. This does not establish a general supplier-payment or AIS API. | No runnable MCP verified; API-derived “candidate” listings are insufficient. |
| **MakeCommerce / Maksekeskus** | [Developer portal][makecommerce]: payment links, recurring payments, refunds and seller payouts. | None found. |
| **EveryPay Estonia** | [Current integration guide][everypay]; payment callbacks and merchant credentials. Avoid Greek EveryPay documentation and deprecated v3 material. | None found. |
| **Stripe** | [API][stripeapi]: billing, payment links, refunds, balances and payout reconciliation. | Official [Stripe MCP](https://docs.stripe.com/mcp), OAuth or scoped agent credentials. |
| **PayPal** | [Developer API documentation](https://developer.paypal.com/api/rest/); invoicing, payments and transaction workflows. | Official [local/remote MCP][paypal]. |
| **Paysera** | [Checkout developer portal](https://developers.paysera.com/), including modern OAuth/webhook integration available in Estonia. | Official [Marketplace MCP](https://marketplace.paysera.com/lt/developers/mcp) is documented as staging; it does **not** establish production Checkout/bank-account MCP access. |

## Gaps

- **A common approval layer:** existing connectors differ on drafts, immediate posting, sending and payment execution. Bind approval to company, recipient, amount, currency, documents and payload; check final status before retrying.
- **October 2026 TSD migration:** implement the new payroll-data contract and historical corrections. Annexes 3–7 transition separately during 2027–2028; do not apply the payroll change indiscriminately. [EMTA transition][tsdchange]
- **Annual-report completion:** ledger extraction is available, but notes, category selection, shareholder approval, signing and registry submission need a dedicated adapter/browser workflow.
- **Foreign and specialised tax workflows:** Form E, INF 14, OSS/IOSS, SME reporting, foreign VAT refunds and cross-border payroll need validated mappings and submission paths.
- **Restricted vendor surfaces:** Joosep, Envoice’s complete partner specification, Coop Gateway details, operator inbox administration and some payroll corrections require vendor onboarding or UI automation.
- **Bank coverage:** business-account consents, joint signatories, certificate onboarding, Wise EEA restrictions and payment-status reconciliation must be tested bank by bank.
- **Financing and insurance:** applications, underwriting questions, collateral, guarantees, policy acceptance and claims remain largely document/portal workflows. EIS’s former start-up loan closed in 2023; Wayflyer’s published incorporation list excludes Estonia. [EIS][closedloan], [Wayflyer][wayflyer]
- **Safe friction publishing:** publish the missing capability and reproducible error, with owner approval and redaction; never publish receipts, payroll, bank details or credentials as feature-request evidence.

## Top 10 by value for a micro-entrepreneur

1. **B05 — Receipt/invoice capture:** removes repetitive entry and missing-document chasing.
2. **B28 — Bank reconciliation:** establishes whether the books reflect actual money.
3. **B55 — KMD/KMD INF preparation:** converts monthly compliance into a reviewable package.
4. **B16–B21 — Complete invoicing:** gets valid invoices to the right channel promptly.
5. **B24 — Payment reminders:** improves collection while avoiding embarrassing mistakes.
6. **B38–B46 — Payroll through TSD:** combines calculation, payment and filing evidence.
7. **B29 — Approved supplier batches:** saves time while retaining control over money.
8. **B58 — Annual-report preparation:** addresses a universal recurring OÜ obligation.
9. **B64 — Cash forecast:** shows upcoming shortfalls before wages or taxes are due.
10. **B07–B10/B48 — Owner expenses and remuneration:** reduces common mixing of personal and company money.

## Open questions

- Does LHV’s public MCP expose every required business account and delegated-access arrangement?
- Which vendors’ production APIs already support the October 2026 TSD format and corrections?
- Can RIK/operator APIs expose delivery acknowledgements, inbox registration and complete annual-report submission?
- Which community MCPs meet tenant-isolation, credential-storage, idempotency and audit-log requirements?
- Can aggregator contracts support this multi-tenant gateway without the gateway itself becoming a regulated payment-service provider?
- What native Estonian tax/export support can Xero and QuickBooks contractually guarantee?
- Which current lenders offer revenue-based finance specifically to Estonian micro-OÜs?
- Sector-specific fiscal-register requirements, audit thresholds and 2027 parameter changes need dedicated rule-level validation before implementation.

**Verification limitation:** BrowserOS session creation was blocked because it required approval while this session’s approval policy was “never.” Research therefore used live web search and source retrieval; authenticated portal/API behaviour and direct MCP Registry completeness remain unverified.

[rps]: https://www.riigiteataja.ee/en/akt/522012025001
[accounting]: https://learn.e-resident.gov.ee/hc/en-gb/articles/360002569617-Accounting
[selfbooks]: https://marketplace.e-resident.gov.ee/service-providers/e-financials/
[rikapi]: https://abiinfo.rik.ee/node/304/
[rikmcp]: https://github.com/iseppo/e-arveldaja-mcp
[merit]: https://api.merit.ee/
[smartapi]: https://www.smartaccounts.eu/uuskodu2015/wp-content/uploads/2017/11/SmartAccounts-API.pdf
[directoapi]: https://wiki.directo.ee/en/xml_direct
[directomcp]: https://directo.ee/ask-directo
[envoice]: https://support.envoice.eu/hc/en-us/articles/360022393393-Getting-started-with-Microsoft-Dynamics-365-Business-Central
[joosep]: https://joosep.info/moodulid/pohivara
[erply]: https://www.erplybooks.com/api/
[palk]: https://api.merit.ee/merit-palk-api/palk-reference-manual/
[x7]: https://x7.ee/ee
[finbite]: https://finbite.eu/en/peppol-api/
[telema]: https://telema.com/technical-guidelines-for-implementing/
[emtaapi]: https://emta.ee/ariklient/e-teenused-koolitused/e-teenuste-kasutamine/teenuste-tehniline-info
[vatinvoices]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/vat-accounting-and-invoices
[invoiceissue]: https://www.emta.ee/en/admin/content/handbook_article/7
[invoicefields]: https://www.emta.ee/en/node/334/main_chapter/32244/pdf
[einvoice]: https://ec.europa.eu/digital-building-blocks/sites/pages/viewpage.action?pageId=915931193
[vies]: https://ec.europa.eu/taxation_customs/vies/
[fringe]: https://www.emta.ee/en/node/168/handbook/11/pdf
[trips]: https://www.emta.ee/en/node/168/main_chapter/59782/pdf
[car]: https://www.emta.ee/en/node/168/main_chapter/59863/pdf
[taxoverview]: https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes
[receipt]: https://www.juristaitab.ee/et/mis-ostu-toendav-dokument-ning-millised-nouded-selle-suhtes-kehtivad
[rounding]: https://www.eestipank.ee/en/press/rounding-rule-will-start-apply-payments-cash-new-year-27122024
[interest]: https://e-justice.europa.eu/topics/taking-legal-action/where-and-how/interest-rates/ee_en
[lhv]: https://partners.lhv.ee/connect/
[lhvmcp]: https://lhv.ai/et-EE/
[seb]: https://developer.baltics.sebgroup.com/bgw/documentation/general-information
[coop]: https://openbanking.cooppank.ee/documentation
[enable]: https://enablebanking.com/docs/
[revolut]: https://developer.revolut.com/docs/api/business
[wise]: https://docs.wise.com/api-reference
[wisekyc]: https://wise.com/uk/help/articles/ixgxNfPDKgxCHQU2XfuyY/getting-your-business-verified-in-the-uk-and-eea
[montonio]: https://docs.montonio.com/introduction
[makecommerce]: https://developer.makecommerce.net/
[everypay]: https://support.every-pay.com/en/articles/13399400-api-integration-guide
[stripeapi]: https://docs.stripe.com/api
[paypal]: https://developer.paypal.com/ai-tools/mcp-server
[crypto]: https://www.fin.ee/sites/default/files/documents/2020-10/plokiahela_tehnoloogial_pohinevate_instrumentide_kajastamine_rpt_tolgendus.pdf
[rates]: https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/tax-rates
[exemption]: https://www.emta.ee/en/private-client/taxes-and-payment/tax-incentives/calculation-basic-exemption
[holiday]: https://www.tooelu.ee/en/28/holiday-pay
[holidays]: https://www.tooelu.ee/en/26/types-holidays
[sickness]: https://tervisekassa.ee/en/people/benefits-provided-health-insurance-fund/sickness-benefit
[termination]: https://www.tooelu.ee/et/29/toolepingu-loppemine
[board]: https://www.emta.ee/en/private-client/foreigner-non-resident/non-residents/income-employment
[unemployment]: https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/unemployment-insurance-premiums
[tsdchange]: https://www.emta.ee/ariklient/amet-uudised-ja-kontakt/arendustegevus/andmepohine-aruandlus
[taxcalendar]: https://www.emta.ee/en/admin/content/handbook_article/19
[ownpay]: https://learn.e-resident.gov.ee/hc/en-gb/articles/360001761658-Dividends-salary-and-directors-fee
[loans]: https://www.e-resident.gov.ee/et/blog/posts/using-corporate-loans-to-grow-your-e-resident-company/
[vatregister]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/registration-vat-payer/registration-person-liable-vat-limited-liability
[limitedvat]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/registration-vat-payer/registration-person-liable-vat-limited-liability
[vatreturns]: https://www.emta.ee/en/node/337/chapter/57
[kmdsoftware]: https://emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/kaibedeklaratsiooni-ja-aruannete-esitamine/x-tee-kaudu-raamatupidamistarkvarast
[sme]: https://www.emta.ee/en/node/342/main_chapter/76063/pdf
[vatguide]: https://www.e-resident.gov.ee/blog/posts/voluntary-registration-estonia-vat/
[annual]: https://ariregister.rik.ee/eng/statistics/annual_reports_2025
[fie]: https://www.emta.ee/en/node/125/handbook/7/pdf
[fiecalendar]: https://emta.static.live.vportal.ee/en/business-client/registration-business/businesses/sole-proprietors/sole-proprietors-tax-calendar
[fieincome]: https://emta.ee/ariklient/registreerimine-ettevotlus/ettevotjale/fuusilisest-isikust-ettevotjale-fie/tulumaks
[entrepreneur]: https://emta.ee/en/private-client/taxes-and-payment/taxable-income/entrepreneur-account
[eisguarantee]: https://eis.ee/en/services/laenukaendus/
[exportloan]: https://eis.ee/en/services/exportloan/
[closedloan]: https://eis.ee/teenused/stardilaen-2/
[crowdfunding]: https://www.fi.ee/et/investeerimine/uhisrahastusteenuse-osutajad/uhisrahastusteenuse-osutajad
[wayflyer]: https://help-center.wayflyer.com/en/articles/633716-what-are-the-requirements-to-get-funding-from-wayflyer
[insurance]: https://www.if.ee/en/ariklient/kindlustused
[eisfunding]: https://eis.ee/en/expand-to-new-markets/securing-funding/