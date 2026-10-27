# A — Tax, government filings and statutory reporting

**Position as of 25 October 2026.** “None found” means no documented, externally usable filing interface was identified; it does not prove that an internal government interface is absent. Public register APIs and Ärikratt’s existing read tools do not confer filing rights. Interfaces below are documentation-backed, not production-tested.

## Changes that affect the product design

- **2026 taxes:** personal income tax remains **22%**, distributed-profit tax **22/78**, social tax **33%**, and standard VAT **24%**. The general personal allowance is **€700/month**; the minimum monthly social-tax base is **€886**, producing **€292.38** social tax. Employee/employer unemployment contributions remain **1.6%/0.8%**; funded-pension contributions depend on the employee’s election. [EMTA rates][rates]
- **TSD changed on 1 October 2026:** payroll information formerly in annexes 1–2 uses the new data-based reporting solution. Legacy XML is replaced by XBRL GL; transitional CSV remains supported through 2027. Annexes 3–7 migrate subsequently. **KMD changes from the April 2027 reporting period**, including combined KMD/VD data submission. [EMTA transition programme][transition]
- **Statistics:** machine reporting already covers payroll and accommodation; economic-transaction reporting covering several business surveys is announced for **2027**. [Statistics Estonia][statsapi]
- **E-invoicing:** since **1 July 2025**, registered recipients can require e-invoices, including private businesses. An official blanket Estonian B2B mandate commencing in 2027 was **not verified**. [Finance Ministry][invoice]
- **Packaging:** the PPWR producer definition changed on **12 August 2026**; responsibility must be reassessed rather than copied from an old packaging contract. [Environmental Board][packnew]

## Authentication and delegation

| Connection | What the gateway needs |
|---|---|
| **EMTA / e-MTA** | An identified representative and explicit permissions for the relevant service. Separate human filing permissions from software-provider machine permissions; support expiry and revocation. X-tee requires an onboarded subsystem, security-server access and EMTA service activation. These are not ordinary OAuth connections. [Permissions][rights], [X-tee][mx] |
| **RIK / e-Business Register** | ID-card, e-resident card, Smart-ID or Mobile-ID where supported; statutory representation or portal-specific authorisation. Some applications require several signatories or a notary. [RIK applications][regchange], [liquidation signing][liquidationsign] |
| **RIK Andmesild** | Software-provider agreement and company activation. REST transfers reporting data; the annual report still needs review, completion, approval and submission. [Andmesild][bridge] |
| **e-arveldaja** | Company-generated API key, signed requests and optionally restricted IP addresses. This accounting API is separate from register filing authority. [Developer documentation][earv] |
| **Statistics Estonia** | Reporting rights in its self-service; machine-service access separately opened with Statistics Estonia. The public statistical-database API is a **read interface**, not the survey submission interface. [Reporting interface][statsapi], [public API][statpublic] |
| **Other portals** | Agency-specific representation: eesti.ee/SKA, Tervisekassa, TEIS, e-Töötukassa, KOTKAS, MTR and municipal portals. Do not assume an MTA authorisation carries across. |

For every **act-with-approval**, show the exact recipient, reporting period, payload and financial consequence before transmission. Human identity checks, PIN entry, qualified signatures and notarial acts remain **never-automate** steps.

## Tax administration, payroll and company income tax

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A01 | “Give my accountant access, then revoke it when they leave” | All | Appointment, scope change, termination | EMTA | e-MTA; signed application | None found for permission administration | act-with-approval | High: tax-data access | [EMTA permissions][rights] |
| A02 | “File this month’s wages and board-member fees” | Employer; OÜ; FIE; e-resident OÜ | TSD and payment by following month’s **10th**; distinguish residents, non-residents and payment types | EMTA | X-tee; e-MTA; file upload | [EMTA TSD/X-tee][mx]; new [payroll interface][transition] | act-with-approval | High: payroll tax, insurance | [TSD][tsd], [rates][rates] |
| A03 | “Declare the company car and other employee benefits” | Employer | Fringe benefits: TSD annex 4, following month’s **10th** | EMTA | X-tee; e-MTA | [EMTA TSD][mx] | act-with-approval | High: income/social tax | [TSD][tsd], [tax treatment][incometax] |
| A04 | “Declare gifts, entertainment and non-business spending” | OÜ; relevant employers | TSD annexes 5–6; following month’s **10th** | EMTA | X-tee; e-MTA | [EMTA TSD][mx] | act-with-approval | High: misclassified expenses | [TSD][tsd], [tax treatment][incometax] |
| A05 | “Declare the dividend I paid” | OÜ; e-resident OÜ | Annex 7 plus INF 1; following month’s **10th**; standard tax **22/78** | EMTA | X-tee; e-MTA | [EMTA TSD][mx] | act-with-approval | High: double taxation, wrong recipient | [Dividend instructions][dividend] |
| A06 | “Record capital contributions and capital repayments correctly” | OÜ | Relevant equity events; annex 7 and, for distributions, INF 1 | EMTA | X-tee; e-MTA | [EMTA TSD][mx] | act-with-approval | High: future tax basis lost | [Equity/INF 1][inf1] |
| A07 | “Submit the annual car, training and health-benefit information” | Employer | INF 14 parts I–III by **1 February** | EMTA | e-MTA; XML upload | File schema; no submission API verified | act-with-approval | Med: incomplete employee information | [INF forms][inf] |
| A08 | “Report the group loans covered by INF 14” | Relevant OÜ | Part IV by **20th after quarter** | EMTA | e-MTA; XML upload | File schema; no submission API verified | act-with-approval | High: hidden-distribution exposure | [INF forms][inf] |
| A09 | “Correct an earlier tax return and confirm acceptance” | All filers | Error, refund, credit note or rejected submission | EMTA | Original filing channel | [TSD/KMD status and feedback services][mx] | act-with-approval | High: duplicate or ineffective correction | [Technical documentation][technical] |
| A10 | “Reconcile my tax account and pay what is actually due” | All | Monthly; before each payment | EMTA; bank | X-tee; e-MTA; banking | [Prepayment/claims accounting services][mx]; payment adapter separate | act-with-approval | High: wrong amount/reference | [EMTA X-tee][mx] |
| A11 | “Put my tax debt on a payment schedule” | OÜ; FIE; individuals | Cash shortfall; schedules **2–24 months**; outstanding declarations must be filed | EMTA | e-MTA; application | None found | act-with-approval | High: enforcement, default | [Instalments][debt] |
| A12 | “Get a residence, VAT or no-tax-debt certificate” | All; particularly exporters/e-residents | Tender, bank or foreign customer request | EMTA | e-MTA; application | None found for complete certificate workflow | read | Med: disclosure or wrong certificate | [Certificates][cert] |
| A13 | “Answer this tax notice or challenge the decision” | All | Authority notice; deadline stated in decision/procedure | EMTA; court | e-MTA; signed correspondence | None found | draft | High: lost appeal rights | [Challenges][appeal] |

## VAT and cross-border sales

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A14 | “Tell me when I must register for VAT, and apply” | OÜ; FIE | Counted Estonian turnover exceeds **€40,000/calendar year**; voluntary registration also possible | EMTA | e-MTA; signed application | None found for registration | act-with-approval | High: retrospective VAT | [Registration rules][vatreg] |
| A15 | “Does buying foreign software or EU goods make me VAT-liable?” | Non-VAT OÜ/FIE; business individuals | Relevant foreign services can trigger limited registration immediately; EU acquisitions threshold **€10,000** | EMTA | e-MTA | None found for registration | act-with-approval | High: overlooked reverse charge | [Limited liability][limited], [VAT Act][vatlaw] |
| A16 | “File and pay this month’s VAT” | VAT registrant | KMD by following month’s **20th**, including applicable nil returns | EMTA | X-tee; e-MTA; upload | [KMD upload/download][mx] | act-with-approval | High: tax and refund errors | [VAT reporting][vatfiling] |
| A17 | “Prepare the invoice-level KMD INF annex” | VAT registrant | Monthly; qualifying invoices total **€1,000 excluding VAT per counterparty**, purchases/sales separately | EMTA | With KMD | [KMD interface][mx] | act-with-approval | High: counterparty mismatches | [KMD INF rules][kmdinf] |
| A18 | “Report sales to EU VAT-registered customers” | EU B2B supplier | VD by following month’s **20th** when reportable supply exists; VDP corrections | EMTA | e-MTA; XML/CSV | File import; combined interface announced for April 2027 | act-with-approval | High: cross-border VAT treatment | [VAT reporting][vatfiling], [transition][transition] |
| A19 | “Adjust input VAT for mixed use, assets or changed use” | Relevant VAT registrant | Annual and event-driven adjustments | EMTA | KMD; accounting records | [KMD interface][mx] | act-with-approval | High: excessive deductions | [VAT calculation][vatrefund] |
| A20 | “Recover VAT paid on business purchases elsewhere in the EU” | Eligible VAT registrant | Application by **30 September following refund year** | EMTA; foreign tax authority | e-MTA refund portal | None found | act-with-approval | Med: refund expires | [EU VAT refunds][euvatrefund] |
| A21 | “Use the EU small-business VAT exemption and report turnover” | Eligible OÜ/FIE | EX registration; EU turnover ceiling **€100,000**, plus national limits; quarterly report by following month-end | EMTA; other member states | e-MTA | None found | act-with-approval | High: exemption lost | [SME scheme][sme], [reports][smereport] |
| A22 | “Register for OSS and file cross-border consumer sales” | Relevant sellers | Registration/event changes; returns and payment quarterly by **30 Apr/31 Jul/31 Oct/31 Jan** | EMTA | e-MTA; X-tee returns | [OssDeclaration/status][mx]; registration portal | act-with-approval | High: country/rate allocation | [OSS][oss] |
| A23 | “File IOSS for my qualifying imported consumer orders” | Relevant import-distance sellers | Monthly return/payment by following month-end | EMTA; intermediary | e-MTA; X-tee returns | [OSS/IOSS services][mx] | act-with-approval | High: import VAT collected twice | [IOSS][ioss] |
| A24 | “Cancel VAT registration and settle the final adjustments” | Closing/small OÜ or FIE | Eligibility or cessation; final stock/assets review | EMTA | e-MTA; final KMD | Registration API none found; [KMD][mx] | act-with-approval | High: residual VAT liability | [Registration/deletion][vatreg] |

**OSS/IOSS deadlines do not move for weekends or public holidays.** [European Commission][ossdates]

## FIE, entrepreneur accounts and e-residents

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A25 | “File my personal return and business form E” | FIE | Forms A/E by **30 April**, including no-income years; balance payable **1 October** | EMTA | e-MTA; paper | None found | act-with-approval | High: personal tax and deductions | [Business income][fieincome], [calendar][fiecalendar] |
| A26 | “Calculate my quarterly social-tax advance and exemptions” | FIE | 2026: **16 Mar, 15 Jun, 15 Sep, 15 Dec**; standard quarter **€877.14**, subject to exceptions | EMTA | e-MTA; bank | [Claims read API][mx]; payment separate | act-with-approval | High: insurance or overpayment | [FIE advances][fiesocial] |
| A27 | “Calculate income-tax advances and final settlement” | Relevant FIE | Advances **15 September/15 December**; assess exemptions using prior return | EMTA | e-MTA; bank | [Claims read API][mx] | act-with-approval | High: underpayment | [FIE calendar][fiecalendar] |
| A28 | “Register my participating spouse and file their social tax” | FIE with qualifying spouse/partner | Registration/change; ESD and payment by following month’s **10th** | EMTA | e-MTA; paper | None found | act-with-approval | High: insurance gaps | [Spouse/ESD][spouse] |
| A29 | “Start, suspend, resume or close my FIE” | FIE | Business lifecycle; assess assets and remaining tax returns | RIK; EMTA | Register portal; e-MTA | None found for lifecycle writes | act-with-approval | High: continuing liabilities | [FIE registration/deletion][fiereg] |
| A30 | “Check my entrepreneur-account taxes and when I must change business form” | Ettevõtluskonto | Each receipt; **20%**, or **22/24/26%** with pension; transition above **€40,000/year** | LHV; EMTA | Bank automates tax transfer | Bank mechanism exists; third-party management API UNVERIFIED | read | High: turnover/insurance surprises | [Account rules][entre], [2026 changes][tax2026] |
| A31 | “Declare the extra tax when my company buys an entrepreneur-account service” | OÜ customer | Service payment: **22/78**, TSD annex 6; following month’s **10th** | EMTA | TSD | [EMTA TSD][mx] | act-with-approval | High: payer’s tax overlooked | [Entrepreneur-account payments][entreest] |
| A32 | “Check where my remotely managed OÜ must pay tax” | E-resident OÜ | Management, workplace or foreign permanent-establishment changes | EMTA; foreign authorities | e-MTA; foreign portals | No universal interface found | draft | High: dual-country liabilities | [E-resident taxation][eresident] |

## Customs, excise and specialist tax reporting

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A33 | “Get an EORI number before importing or exporting” | Goods traders | Before customs operations | EMTA | e-MTA | None found for registration | act-with-approval | Med: shipment blocked | [EORI][eori] |
| A34 | “Declare this import, export or transit and track release” | Importer/exporter | Per consignment; amendments, guarantees and special procedures | EMTA; customs agent | Impulss/AES/NCTS/NES; X-tee | [Customs interfaces][customs] | act-with-approval | High: duty, classification, seizure | [Customs systems][customs] |
| A35 | “Get the excise permissions and submit tax/stock declarations” | Alcohol, tobacco, fuel/energy operators | Before relevant activity; periodic returns **20th following month**; one-off returns generally **fifth day** | EMTA | e-MTA | [Technical schemas][technical]; endpoint coverage requires checking | act-with-approval | High: excise and licence breach | [Excise declarations][excise] |
| A36 | “Create and close an excise-goods movement document” | Relevant excise operators | Each regulated movement | EMTA; EU counterpart | SADHES/EMCS; X-tee | [EMTA excise interfaces][mx] | act-with-approval | High: unaccounted goods | [Technical services][technical] |
| A37 | “Submit Intrastat for goods dispatched to the EU” | Relevant goods traders | 2026 dispatch threshold **€325,000**; monthly by **14th**; arrivals no longer collected | Statistics Estonia | Self-service; XML/file import | Instat.XML documented; submission API none found | act-with-approval | Med: statistical noncompliance | [Intrastat][intrastat] |
| A38 | “Check CBAM scope, obtain authorisation and report imports” | Covered importers | Definitive regime from 2026; mass threshold **over 50 tonnes**, excluding electricity/hydrogen exception; first annual report **30 Sep 2027** | Environmental Board; EU | CBAM registry | General gateway filing API none found | act-with-approval | High: import/carbon liability | [CBAM scope][cbam], [first deadline][cbamdeadline] |
| A39 | “Submit seller-income information for my platform” | Reporting platform operator | DAC7 annually by **31 January**; qualifying exception notification instead where applicable | EMTA | e-MTA; structured file; exception email | [Technical documentation][technical]; endpoint UNVERIFIED | act-with-approval | High: third-party tax data | [DAC7][dac7] |
| A40 | “Report a cross-border tax arrangement when DAC6 applies” | Relevant adviser/taxpayer | Generally **30 calendar days** from statutory trigger | EMTA | e-MTA; structured reporting | None found for gateway-ready submission | draft | High: legal classification | [DAC6][dac6] |
| A41 | “Report my timber and cutting-right transactions” | Forestry buyers/sellers | Prior-year notice by **10 January**; timber-volume exception applies | EMTA | e-MTA; file/paper | File import; API none found | act-with-approval | Med: missing tax information | [Forest transactions][forest] |

## Business Register and mandatory statistics

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A42 | “Prepare, approve and file my annual report, even if dormant” | OÜ; e-resident OÜ | Within **six months of year-end**; calendar-year deadline **30 June** | RIK; shareholders | Reporting portal; XBRL; Andmesild | [Andmesild REST][bridge]; [e-arveldaja][earv] preparation | act-with-approval | High: public accounts, deletion | [Deadline][annual], [categories][micro] |
| A43 | “Check whether I need an auditor or review” | Asset/revenue-heavy micro employer | Before annual-report approval; exact applicable thresholds **UNVERIFIED here** | Auditor; RIK | Professional engagement; reporting portal | None found | draft | High: invalid reporting package | [Finance Ministry][audit] |
| A44 | “Update or confirm my beneficial owners” | OÜ | Changes promptly; confirm unchanged data with annual report | RIK | e-Business Register | None found for write | act-with-approval | High: ownership misstatement | [UBO instructions][ubo] |
| A45 | “Change the business address, email, name or contact person” | OÜ; FIE as applicable; e-resident | Relevant change or contact-person renewal | RIK | Portal; sometimes notary | Read APIs exist; write API none found | act-with-approval | High: notices missed | [Register changes][regchange], [address][address] |
| A46 | “Register a new board member or representation rule” | OÜ | Appointment, resignation, removal or expiry | RIK | Portal; signed resolutions/notary | None found for write | act-with-approval | High: authority to bind company | [Board changes][board] |
| A47 | “Register paid-in capital or a capital change” | OÜ | Contribution, increase/reduction; remove unpaid-capital notation where applicable | RIK; EMTA | Portal; supporting documents | None found for register write | act-with-approval | High: capital and creditor rights | [Capital contribution][capital] |
| A48 | “Update shareholders and articles after an ownership change” | OÜ | Transfer/reorganisation; transaction-specific formalities | RIK; notary | Portal/notarial process | None found for write | act-with-approval | High: title and governance | [RIK applications][regchange] |
| A49 | “Liquidate and delete the company properly” | OÜ | Resolution; creditor notices, liquidation accounts, distribution, deletion | RIK; creditors; EMTA | Register portal; official notices | None found for complete workflow | act-with-approval | High: creditor claims, finality | [Liquidation workflow][liquidation] |
| A50 | “Deal with the register’s warning, fine or deletion order” | OÜ | Received order; its specific deadline | Registrar | Portal; signed response | [RIK open rulings][rikdata] for monitoring; no response API found | draft | High: fines/deletion | [Enforcement][regfine] |
| A51 | “Escalate negative equity or lasting insolvency” | OÜ | Financial deterioration; urgent board decision | Board; court; RIK | Resolutions; court filing | None found | draft | High: personal board liability | [Micro reporting][micro], [Commercial Code amendment][insolvency] |
| A52 | “Show every Statistics Estonia questionnaire assigned to me” | Selected OÜ/FIE | Onboarding and new survey assignment | Statistics Estonia | eSTAT/new self-service | Assignment-list API none found | read | Med: unnoticed obligation | [Mandatory surveys][statmandatory] |
| A53 | “Fill the assigned payroll, business or sector survey” | Selected respondent | Questionnaire-specific monthly/quarterly/annual deadline | Statistics Estonia | Self-service; file; machine service | [Data-based reporting][statsapi]; [Andmesild integration][bridgechanges] | act-with-approval | Med: inaccurate official statistics | [Reporting duties][statmandatory], [interface][statsapi] |

**Micro reporting is a separate classification from “0–9 employees”.** Under RIK’s current guidance, at least two figures must not exceed **€450,000 assets, €900,000 annual income and 10 average employees**. The report includes the applicable balance sheet, income statement and required disclosures. A management report is required where net assets fail the legal requirements. [RIK categories][micro]

Register **fines (trahv)** should not be treated as interchangeable with every administrative **non-compliance levy (sunniraha)**; the gateway must preserve the actual order type and remedy. [Register enforcement][regfine]

## Employer filings and social-insurance administration

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A54 | “Register this worker before they start” | Employer, including FIE | TÖR entry **before work starts**; special advance rule for ages 7–12 | EMTA | e-MTA; CSV; X-tee | [TOOTREG/TORRGNO][torapi] | act-with-approval | High: undeclared employment | [Employment registration][torstart] |
| A55 | “Update, suspend or end employment registration” | Employer | Suspension/termination generally within **10 calendar days**; correct job/workplace data | EMTA | e-MTA; X-tee | [TÖR services][torapi]; historical corrections may need portal | act-with-approval | High: insurance/benefit entitlement | [Suspension][torsuspend], [termination][torend] |
| A56 | “Complete the employer section of this sick/care-leave certificate” | Employer | Within **7 calendar days** of learning closure; late-entry cutoff **90 days** | Tervisekassa | eesti.ee; X-tee; exceptional documents | [kirst.tvl services][tvlapi]; access onboarding needed | act-with-approval | High: employee loses benefit | [E-TVL rules][tvl] |
| A57 | “Handle the parental-leave notice and update TÖR” | Employer | SKA notice; relevant leave changes | SKA; EMTA | SKA/eesti.ee; e-MTA | [TÖR][torapi]; SKA workflow API none found | act-with-approval | High: leave/benefit mismatch | [Parental leave and TÖR][torsuspend] |
| A58 | “Claim reimbursable holiday pay or breastfeeding-break wages” | Eligible employer | Application within **three months from leave month** | SKA | eesti.ee; signed email | None found | act-with-approval | Med: reimbursement lost | [Employer reimbursements][skareimburse] |
| A59 | “Apply for A1 before cross-border work and report changes” | Employer; FIE; mobile e-resident | Posting/multi-state work; changed circumstances | SKA | eesti.ee | None found | act-with-approval | High: social tax in wrong country | [A1][a1] |
| A60 | “Apply for my redundant employee’s insurance benefit” | Eligible employer | Generally within **5 calendar days after termination**; qualifying tenure | Töötukassa | e-Töötukassa; application | None found | act-with-approval | High: employee benefit delayed | [Redundancy benefit][redundancy] |
| A61 | “Claim social-tax relief for a reduced-work-ability employee” | Eligible employer | Apply when eligible; cannot assume retroactive relief | Töötukassa; EMTA | e-Töötukassa; TSD | Application API none found; [TSD][mx] | act-with-approval | Med: relief lost/overclaimed | [Relief rules][workability] |
| A62 | “Submit and update my workplace risk assessment” | Employer | Initial assessment; changed work, hazards or incidents | Labour Inspectorate | TEIS | None found | act-with-approval | High: unsafe work, enforcement | [Risk assessment][riskassessment] |
| A63 | “Notify and report an occupational accident” | Employer | Serious/fatal notification immediately; investigation **10 working days**, report within **3 working days** afterwards | Labour Inspectorate; police where required | TEIS; phone/email | None found | act-with-approval | High: injury evidence and liability | [Accidents][accident] |
| A64 | “Investigate and report an occupational disease” | Employer | Investigation within **20 working days** of notice; report within **3 working days** afterwards | Labour Inspectorate | TEIS; prescribed report | None found | act-with-approval | High: health evidence and liability | [Occupational disease][disease] |
| A65 | “Arrange the foreign worker’s employment registration/permission” | Employer of third-country worker | Before work; route depends on immigration status | PPA; sometimes Töötukassa | Authority portals/applications | None found | act-with-approval | High: unlawful employment | [Foreign workers][foreignworker] |
| A66 | “Register workers posted into Estonia” | Foreign employer; relevant host | **Before work starts**; update changes before taking effect | Labour Inspectorate | TEIS | None found | act-with-approval | High: posting noncompliance | [Posting notices][posting] |
| A67 | “Add my subcontractors and workers to the construction-site system” | Construction microbusiness | Participation at a qualifying site; ongoing access/time data | EMTA; main contractor | TTKI; connected attendance systems | [EMTA technical services][technical]; provider-specific adapter | act-with-approval | High: missing worker/time records | [TTKI obligations][ttki] |

## Licences, privacy, accessibility and e-invoicing

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A68 | “Check the regulated activity and submit its notice or licence application” | Relevant construction, travel, transport, care, trade/service businesses | Before regulated activity; exact sector conditions | MTR; competent regulator | MTR; sector portal/notary | Existing public reads; write API none found | act-with-approval | High: unauthorised operation | [Permit landscape][mtranalysis] |
| A69 | “Update, renew or close my activity registration” | Notice/licence holder | Changes, expiry or cessation; confirm applicable obligations with annual report/FIE return | MTR; regulator | MTR; reporting portal | None found for write | act-with-approval | High: licence invalidity | [General economic-activity rules][msus] |
| A70 | “Decide whether I need a DPO and notify the appointment” | GDPR-covered business | Article 37 criteria; appointment/change | AKI; RIK | Business Register portal | None found for write | act-with-approval | High: privacy oversight failure | [DPO notification][dpo] |
| A71 | “Notify AKI about this personal-data breach” | Data controller | Without undue delay, normally within **72 hours**; risk-based exception | AKI | AKI e-environment | None found | act-with-approval | High: affected people and penalties | [Breach reporting][breach] |
| A72 | “Check my accessibility exemption or compliance duties” | E-commerce/service provider; covered product trader | Since **28 June 2025**; reassess growth/product changes | TTJA | Assessment; documentation; regulator correspondence | None found | draft | High: wrongly claimed exemption | [Services][accessibility], [products][accessproducts] |
| A73 | “Send the structured invoice this public/private buyer requires” | B2G supplier; supplier to registered recipient | Each relevant invoice; recipient’s registered requirement | Customer; e-invoice operator | Accounting/operator networks | [e-arveldaja REST][earv]; operator adapter | act-with-approval | Med: rejection/payment delay | [E-invoice rules][invoice] |

The accessibility service exemption requires **fewer than 10 employees** and annual turnover **or** balance-sheet total no more than **€2 million**, applying the relevant enterprise rules. It does **not** give every small manufacturer, importer or distributor a blanket exemption for covered products. [TTJA][accessibility], [product duties][accessproducts]

## Packaging and environmental obligations

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A74 | “Register packaging responsibility and report packaging weights” | Importer, packer, online seller; relevant producer | First placing on market; regular records; annual register data by **31 March**, directly or through recovery organisation | Environmental authorities; recovery organisation | Packaging register; organisation portal | None found for common write workflow | act-with-approval | High: recovery/excise liability | [Packaging reporting][packreport], [2026 scope][packnew] |
| A75 | “Register and report batteries, electronics or other problem products” | Relevant producer/importer | Before market placement; annual PROTO report by **31 January** | Environmental authorities; producer organisation | PROTO; organisation portal | None found | act-with-approval | High: unfunded waste responsibility | [Producer responsibility][producer], [deadlines][envreports] |
| A76 | “Get or amend the environmental permit my operation needs” | Workshop, waste handler, water user, emitter | Before permit-requiring activity; operational changes | Environmental Board | KOTKAS | General filing API none found | act-with-approval | High: unlawful pollution/activity | [Environmental permissions][envfees] |
| A77 | “Submit waste and other permit reports” | Relevant permit/registration holder | Waste annual report **31 January**; other monitoring/report dates per permit | Environmental Board/Agency | KOTKAS | General submission API none found | act-with-approval | High: permit breach | [Reporting instructions][envreports], [KOTKAS guide][wasteguide] |
| A78 | “Declare and pay environmental charges” | Liable environmental user | Quarterly by following month’s **17th**, including required nil declarations | Environmental Board; EMTA | KOTKAS; e-MTA payment | Filing API none found; [EMTA balance reads][mx] | act-with-approval | High: tax and pollution charges | [Environmental charges][envfees] |
| A79 | “Declare packaging excise when recovery obligations are unmet” | Liable packaging business | Applicable quarterly liability; return by following month’s **15th** | EMTA | e-MTA | Technical files; submission API UNVERIFIED | act-with-approval | High: excise liability | [Packaging excise][packexcise] |

For batteries, specified producer categories must join a registered producer organisation from **1 January 2026**. [Climate Ministry][batteries]

## Municipal, property, vehicle and food-business filings

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A80 | “Declare the tax on my outdoor advertisement” | Advertiser where locally taxed | Municipality-specific; Tallinn: first working day of selected tax period | Municipality; EMTA in Tallinn | Municipal portal/e-MTA | Tallinn file schema; API none found | act-with-approval | Med: local tax/penalty | [Tallinn advertising tax][advertax] |
| A81 | “Get permission for my street stall or mobile sales” | Street/market trader | Before covered trading; location-specific | Municipality/market operator | Municipal portal; Tallinn AKIS | None found | act-with-approval | Med: trading stopped | [Tallinn permit example][street] |
| A82 | “Get the public-event and street-closure permissions” | Event organiser | Before event; lead time depends on locality, traffic and risk | Municipality; coordinating authorities | Municipal portal; Tallinn AKIS | None found | act-with-approval | High: unsafe/unlicensed event | [Tallinn event rules][events] |
| A83 | “Check and pay land tax on business property” | Liable owner/user | 2026 deadlines **31 March/1 October**, instalment rules depend on amount | EMTA; municipality sets rates | e-MTA; bank | [EMTA claims reads][mx] | act-with-approval | Med: property/tax mismatch | [Land tax][land] |
| A84 | “Check and pay company vehicle tax” | Liable vehicle owner/user | Existing vehicle: **15 June/15 December**; new registrations have separate dates | EMTA; Transport Administration | e-MTA; motor register | [EMTA claims reads][mx]; registration-write API none found | act-with-approval | Med: wrong liable vehicle/person | [Vehicle tax][vehicle] |
| A85 | “Pay heavy-goods vehicle tax” | Relevant haulier | Quarterly by first month’s **15th**; registration events separately | EMTA; Transport Administration | e-MTA; bank; motor register | [EMTA claims reads][mx] | act-with-approval | Med: underpayment | [Heavy vehicle tax][heavy] |
| A86 | “Notify my food business, obtain approval and report unsafe food” | Catering, home-food, retail, food production | Before operation; changes/closure; unsafe-food notification immediately | Agriculture and Food Board | Ministry client portal; urgent contact | None found for common filing workflow | act-with-approval | High: public health, closure | [Food registration][food], [unsafe food][foodsafety] |

## AML, sanctions and regulated financial activities

| ID | Use case — owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| A87 | “Check whether my business is AML-obliged and maintain its evidence” | Accountants, tax advisers, estate agents, relevant traders | Activity/onboarding changes; ongoing due diligence | FIU/RAB; relevant supervisor | Internal records; supervision correspondence | No complete compliance MCP verified | draft | High: missed suspicious activity | [Obliged entities][aml] |
| A88 | “Submit the required suspicious-activity or cash report” | AML-obliged entity | Suspicion immediately; separate cash-report trigger **over €32,000** | FIU/RAB | Reporting portal; agreed XML/X-tee | [FIU X-tee reporting route][fiuapi] | act-with-approval | High: secrecy, accusations, legal breach | [Reporting][fiureport], [cash threshold][amlfaq] |
| A89 | “Apply for the licence my regulated financial/company service needs” | Relevant financial, trust/company-service operator | Before licensed activity; changes/renewals | FIU; Finantsinspektsioon where applicable | MTR; regulator applications | None found for complete write workflow | act-with-approval | High: unlawful regulated service | [FIU licensing][fiulicence] |
| A90 | “Report a financial-sanctions match or restricted transaction” | Relevant business/obliged entity | Match, suspected breach or specific reporting trigger | FIU/RAB | FIU reporting portal | [FIU reporting route][fiuapi] | act-with-approval | High: prohibited payment/disclosure | [Report types][fiureport], [sanctions guidance][sanctions] |

AML scope includes traders paying or receiving linked cash payments of at least **€10,000**, and property-rental intermediaries where the agreed monthly rent is at least **€10,000**. These are scope/due-diligence thresholds, distinct from the **over €32,000** cash-report threshold. [FIU scope][aml], [FIU FAQ][amlfaq]

## Gaps

1. **Portal write adapters:** VAT/EORI registration, FIE returns, register amendments, UBO updates, municipal permits and many benefit applications still need browser workflows or agency agreements.
2. **State authorisation broker:** the product needs separate permission inventories for each authority, expiry monitoring and revocation. A single marketplace OAuth grant cannot replace these.
3. **Versioned tax adapters:** maintain legacy-period corrections alongside October 2026 payroll and April 2027 VAT formats.
4. **Annual-report completion:** Andmesild supplies data; narrative disclosures, resolutions, signatures and final registry acceptance require additional steps.
5. **Survey coverage:** build an assigned-obligation inbox. Statistics Estonia’s machine interface covers selected datasets, not every questionnaire.
6. **Sector discovery:** derive obligations from actual activities, goods, premises, jurisdictions and permits. Employee count alone cannot determine environmental, AML or accessibility scope.
7. **Submission evidence:** retain payload hash, approval, receipt, processing status, rejection details and payment reconciliation. A successful upload is insufficient evidence of completed filing.
8. **Private-data boundary:** employee, beneficial-owner and AML evidence belongs in authorised tenant storage. Marketplace friction reports must remove identifying and confidential information.

## Top 10 by value for a micro-entrepreneur

1. **A02 — Payroll/TSD:** frequent, consequential and supported by machine interfaces.
2. **A16–A17 — KMD/KMD INF:** removes monthly reconciliation and re-entry.
3. **A42 — Annual report:** combines accounting preparation with the most visible annual deadline.
4. **A10 — Tax-account reconciliation:** prevents paying an estimate instead of the actual claim.
5. **A14–A15 — VAT-trigger detection:** catches foreign-service obligations before the turnover threshold.
6. **A54–A55 — Employment registration:** protects insurance and benefit records.
7. **A25–A27 — FIE tax calendar:** consolidates annual returns, advances and settlement.
8. **A56 — Sick-leave completion:** prevents avoidable employee benefit delays.
9. **A52–A53 — Statistics inbox and filing:** exposes obligations owners otherwise overlook.
10. **A01 — Delegation management:** enables the other workflows while limiting access.

## Open questions

- Will EMTA, RIK, Tervisekassa and FIU permit the gateway’s proposed multi-tenant delegation model, and under which contractual scopes?
- Which 2026 Andmesild TSD/statistics capabilities are production-enabled for new providers?
- Can each portal expose authoritative submission status and receipts without browser inspection?
- What machine routes exist for remaining eSTAT questionnaires, KOTKAS, PROTO and municipal applications?
- Confirm current audit/review thresholds and add specialised modules for DAC8/CARF, regulated finance, forestry permits, F-gases, agriculture, road-user charges and premises/building/fire approvals before claiming universal sector coverage.
- Authenticated workflows remain untested: BrowserOS session creation was blocked by the environment’s approval policy.

## Month-by-month compliance calendar — typical one-person OÜ, one employee, VAT registered

Assumptions: calendar financial year; wages paid monthly; ordinary domestic business. Dates below are **2026 submission/payment dates for the preceding reporting period**. TSD/KMD dates apply the next-working-day rule, including **20 August** being a public holiday. [EMTA calendar rule][calendarrule], [public holidays][holidays]

Conditional entries apply only when the corresponding activity exists; survey deadlines come from the company’s assignments.

| Month | TSD and payroll taxes | KMD/KMD INF and VAT | Annual work and conditional additions |
|---|---:|---:|---|
| January | **12 Jan** | **20 Jan** | Close prior-year accounts. OSS Q4: **31 Jan**; relevant environmental/producer annual reports. |
| February | **10 Feb** | **20 Feb** | INF 14 annual parts: **2 Feb 2026** after weekend adjustment. Review vehicle-tax notice. |
| March | **10 Mar** | **20 Mar** | Reconcile annual accounts. Packaging report and first land-tax payment: **31 Mar**, if applicable. |
| April | **10 Apr** | **20 Apr** | Prepare annual report and owner decisions. OSS Q1: **30 Apr**. |
| May | **11 May** | **20 May** | Resolve annual-report discrepancies; arrange any required auditor/review. |
| June | **10 Jun** | **22 Jun** | Annual report: **30 Jun**. Vehicle-tax first instalment: **15 Jun**, if applicable. |
| July | **10 Jul** | **20 Jul** | Confirm annual report accepted and UBO/activity confirmations completed. OSS Q2: **31 Jul**. |
| August | **10 Aug** | **21 Aug** | Check upcoming pension-withholding changes; reassess packaging responsibility under PPWR. |
| September | **10 Sep** | **21 Sep** | Prior-year EU VAT refund application: **30 Sep**, if applicable. |
| October | **12 Oct** | **20 Oct** | Use the October 2026 TSD reporting solution. Land-tax balance: **1 Oct**; OSS Q3: **31 Oct**, if applicable. |
| November | **10 Nov** | **20 Nov** | Prepare April 2027 KMD adapter migration; check assigned year-end surveys. |
| December | **10 Dec** | **21 Dec** | Reconcile benefits, assets and year-end VAT adjustments. Vehicle-tax balance: **15 Dec**. December-period TSD/KMD fall in January 2027. |

[mx]: https://emta.ee/en/business-client/e-services-training-courses/how-use-e-services/x-tee-services
[rights]: https://www.emta.ee/en/private-client/e-services-tax-literacy/how-use-e-services/access-permissions
[rates]: https://www.emta.ee/en/private-client/taxes-and-payment/declaration-income/tax-rates
[transition]: https://www.emta.ee/ariklient/amet-uudised-ja-kontakt/arendustegevus/andmepohine-aruandlus
[tsd]: https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine/dividendi-maksustamine
[incometax]: https://emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes
[dividend]: https://emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine/dividendi-maksustamine
[inf1]: https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/deklaratsiooni-tsd-esitamine/vormi-inf-1-taitmise-juhised
[inf]: https://www.emta.ee/en/business-client/taxes-and-payment/tax-returns-exchange-information/forms-inf
[technical]: https://emta.ee/ariklient/e-teenused-koolitused/e-teenuste-kasutamine/teenuste-tehniline-info
[debt]: https://www.emta.ee/en/business-client/taxes-and-payment/payment-arrears/payment-tax-liabilities-instalments
[cert]: https://www.emta.ee/en/business-client/registration-business/inquiries-and-certificates/applying-certificates
[appeal]: https://www.emta.ee/ariklient/maksud-ja-tasumine/tasumine-volad/haldusakti-voi-toimingu-vaidlustamine
[vatreg]: https://www.emta.ee/en/node/333/handbook/4/pdf
[limited]: https://www.emta.ee/en/admin/content/handbook_article/21
[vatlaw]: https://www.riigiteataja.ee/en/akt/512062025002
[vatfiling]: https://www.emta.ee/node/337/chapter/727
[kmdinf]: https://www.emta.ee/node/337/chapter/740
[vatrefund]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/calculation-and-refund-vat/vat-paid-another-member-state
[euvatrefund]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/calculation-and-refund-vat/taxable-persons-another-member-state
[sme]: https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax/special-vat-provisions/special-scheme-small-businesses
[smereport]: https://emta.ee/en/business-client/taxes-and-payment/value-added-tax/special-vat-provisions/obligations-user-special-scheme
[oss]: https://emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/e-kaubanduse-ja-teenuste-erikorrad/oss-deklaratsiooni-esitamine
[ioss]: https://www.emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/e-kaubanduse-ja-teenuste-erikorrad/ioss-deklaratsiooni-esitamine
[ossdates]: https://vat-one-stop-shop.ec.europa.eu/national-vat-rules/estonia-vat-rules_en
[fieincome]: https://www.emta.ee/eraklient/maksud-ja-tasumine/maksustatavad-tulud/ettevotlustulu
[fiecalendar]: https://www.emta.ee/en/business-client/registration-business/businesses/self-employed-persons/self-employed-persons-tax-calendar
[fiesocial]: https://www.emta.ee/ariklient/registreerimine-ettevotlus/ettevotjale/fuusilisest-isikust-ettevotjale-fie/sotsiaalmaksu-avansilised-maksed
[spouse]: https://www.emta.ee/en/admin/content/handbook_article/139
[fiereg]: https://www.emta.ee/en/business-client/registration-business/businesses/sole-proprietors/registration-and-deletion
[entre]: https://emta.ee/en/private-client/taxes-and-payment/taxable-income/entrepreneur-account
[entreest]: https://www.emta.ee/eraklient/maksud-ja-tasumine/maksustatavad-tulud/ettevotluskonto
[tax2026]: https://emta.ee/uudised/maksumuudatused-2026
[eresident]: https://www.emta.ee/en/business-client/registration-business/non-residents-e-residents/tax-liabilities-companies
[eori]: https://emta.ee/en/business-client/customs-trade-goods/customs-clearance/economic-operator-registration-eori
[customs]: https://www.emta.ee/en/business-client/customs-trade-goods/customs-information-systems/users-customs-information-systems
[excise]: https://www.emta.ee/en/node/369
[intrastat]: https://www.stat.ee/et/intrastat
[cbam]: https://www.keskkonnaamet.ee/susiniku-piirimeede-spimcbam
[cbamdeadline]: https://keskkonnaamet.ee/en/carbon-border-adjustment-mechanism-cbamspim
[dac7]: https://www.emta.ee/en/node/382/main_chapter/44171/pdf
[dac6]: https://emta.ee/en/business-client/taxes-and-payment/tax-returns-exchange-information/tax-information-exchange/obligations-information-provider
[forest]: https://www.emta.ee/eraklient/maksud-ja-tasumine/muud-maksud/metsatehingud
[bridge]: https://www.rik.ee/en/node/281
[bridgechanges]: https://rikpublic.atlassian.net/wiki/spaces/zeroavalik/pages/212860932/Versioonimuudatused
[earv]: https://abiinfo.rik.ee/e-arveldaja/e-arveldaja-api/tehniline-dokumentatsioon-e-arveldaja-api-arendajale
[annual]: https://learn.e-resident.gov.ee/hc/en-gb/articles/360002569617-Accounting
[micro]: https://abiinfo.rik.ee/majandusaasta-aruannete-esitamine/aruande-kategooria
[audit]: https://www.fin.ee/audiitortegevus-0
[ubo]: https://abiinfo.rik.ee/index.php/en/applications-and-dashboard/changing-data-legal-person/modification-and-approval-beneficial-owners
[regchange]: https://abiinfo.rik.ee/en/applications-and-dashboard/changing-data-legal-person
[address]: https://abiinfo.rik.ee/en/applications-and-dashboard/changing-data-legal-person/changing-address-and-contact-details
[board]: https://abiinfo.rik.ee/en/applications-and-dashboard/changing-data-legal-person/changing-data-member-management-board
[capital]: https://abiinfo.rik.ee/en/applications-and-dashboard/making-share-capital-contribution-ou
[liquidation]: https://abiinfo.rik.ee/en/node/251/
[liquidationsign]: https://abiinfo.rik.ee/en/applications-and-dashboard/application-dissolution-and-deletion/preparing-liquidation-application
[rikdata]: https://avaandmed.ariregister.rik.ee/et/avaandmete-allalaadimine
[regfine]: https://www.justdigi.ee/kohtud-ja-oigusteenused/registrid/ariregister
[insolvency]: https://www.riigiteataja.ee/akt/120062022001.pdf
[statmandatory]: https://stat.ee/et/korduma-kippuvad-kusimused
[statsapi]: https://www.stat.ee/et/aruandlus-30
[statpublic]: https://andmed.stat.ee/abi/API-manual.pdf
[torapi]: https://www.emta.ee/en/business-client/registration-business/employment-register/employment-registration-opportunities
[torstart]: https://www.emta.ee/en/business-client/registration-business/employment-register/employment-registration
[torsuspend]: https://www.emta.ee/en/business-client/registration-business/employment-register/suspension-employment
[torend]: https://www.emta.ee/en/business-client/registration-business/employment-register/termination-employment
[tvl]: https://tervisekassa.ee/en/employers/benefit-temporary-incapacity-work/transmission-data-certificates-incapacity-work
[tvlapi]: https://tervisekassa.ee/sites/default/files/IT_juhised/xtee_kirst.tvl_loetelu_ta_taiendamine_2024_0.pdf
[skareimburse]: https://www.eesti.ee/ettevotja/en/artikkel/doing-business/occupational-environment-and-personnel/vacation-pay-and-average-wages-compensation-for-employers
[a1]: https://www.sotsiaalkindlustusamet.ee/perehuvitised-ja-muud-toetused/sotsiaalkindlustus-valismaal-ja-valismaalt-tulijatele
[redundancy]: https://www.eesti.ee/ettevotja/en/artikkel/employment-and-volunteering/unemployment-or-seeking-employment/unemployment-insurance-benefit
[workability]: https://www.emta.ee/ariklient/maksud-ja-tasumine/tulumaks-ja-sotsiaalmaks/sotsiaalmaks
[riskassessment]: https://sm.ee/tookeskkonna-riskianaluus
[accident]: https://www.ti.ee/en/state-and-administrative-supervision/occupational-accident
[disease]: https://www.ti.ee/jarelevalve/tooga-seotud-haigestumine
[foreignworker]: https://www.ti.ee/en/foreign-worker/coming-abroad-work-estonia
[posting]: https://www.ti.ee/en/foreign-worker/posted-workers-and-rental-work/registration-and-provision-data
[ttki]: https://www.emta.ee/en/node/2633/chapter/1513
[mtranalysis]: https://mkm.ee/sites/default/files/documents/2023-08/Ettev%C3%B5tte%20tegevuslubade%20ja%20majandustegevusteadete%20anal%C3%BC%C3%BCsi%20l%C3%B5pparuanne.pdf
[msus]: https://www.riigiteataja.ee/akt/115032014008
[dpo]: https://www.aki.ee/andmekaitsespetsialisti-maaramine
[breach]: https://www.aki.ee/meist/vota-uhendust/rikkumisteade
[accessibility]: https://ttja.ee/ariklient/ettevotlus/ligipaasetavus/teenuste-digiligipaasetavus
[accessproducts]: https://www.ttja.ee/eraklient/tarbija-oigused/ligipaasetavus/toodete-ligipaasetavus
[invoice]: https://fin.ee/finantspoliitika-valissuhted/arvestusvaldkond/raamatupidamise-algdokumendid-arved-e-arved
[packnew]: https://keskkonnaamet.ee/keskkonnakasutus-kiirgus/jaatmed/pakendid
[packreport]: https://kliimaministeerium.ee/pakendiettevotjale
[producer]: https://www.kliimaministeerium.ee/elukeskkond-ringmajandus/poliitika-ja-seadusandlus/tootjavastutus-ja-probleemtooted
[envreports]: https://www.keskkonnaagentuur.ee/teenused-ja-aruandlus/esita-aruanne/jaatmed
[wasteguide]: https://keskkonnaamet.ee/sites/default/files/documents/2025-12/J%C3%A4%C3%A4tmearuande%20esitamine%20infos%C3%BCsteemis%20KOTKAS%20%283%29_0.pdf
[envfees]: https://www.keskkonnaamet.ee/jarelevalve-keskkonnatasu/keskkonnatasu/keskkonnatasu
[packexcise]: https://www.emta.ee/en/node/125/main_chapter/27194/pdf
[batteries]: https://kliimaministeerium.ee/patareid-ja-akud
[advertax]: https://www.emta.ee/eraklient/maksud-ja-tasumine/muud-maksud/tallinna-reklaamimaks
[street]: https://www.tallinn.ee/et/tanavakaubanduse-muugiluba
[events]: https://www.tallinn.ee/et/teenused/avaliku-urituse-korraldamise-luba
[land]: https://emta.ee/en/private-client/taxes-and-payment/other-taxes/land-tax
[vehicle]: https://www.emta.ee/en/business-client/taxes-and-payment/other-taxes-and-claims/motor-vehicle-tax/payment-dates-2026
[heavy]: https://www.emta.ee/en/node/348
[food]: https://pta.agri.ee/ettevotjale-tootjale-ja-turustajale/toidu-tootmine/tegevusload-ja-teavitamine
[foodsafety]: https://www.agri.ee/toiduohutus-taime-ja-loomatervis/toiduohutus/pohimotted-toidukaitlejale
[aml]: https://www.fiu.ee/rahapesu-ja-terrorismi-rahastamine/rahapesu
[amlfaq]: https://www.fiu.ee/rahapesu-ja-terrorismi-rahastamine/kkk
[fiureport]: https://fiu.ee/saada-teade
[fiuapi]: https://fiu.ee/media/384/download
[fiulicence]: https://www.fiu.ee/tegevusluba-ja-jarelevalve/taotlemine
[sanctions]: https://www.fiu.ee/sites/default/files/documents/2025-05/Rahapesu%20Andmeb%C3%BCroo%20juhend%20finantssanktsioonide%20kohaldamiseks_Kinnitatud%2030.05.2025.pdf
[calendarrule]: https://www.emta.ee/ariklient/maksud-ja-tasumine/kaibemaks/kaibedeklaratsiooni-ja-aruannete-esitamine/kassapohise-kaibemaksukohustuslase-meelespea
[holidays]: https://www.riigiteataja.ee/et/akt/74670