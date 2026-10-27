# D — People, operations, legal, risk and sector duties

**Research date: 25 October 2026.** Statistics Estonia’s latest sector breakdown found was for **2025**, updated January 2026. Among enterprises with fewer than ten employees, the largest groups include professional/scientific/technical activities **23,994**, trade/vehicle repair **22,428**, construction **16,446**, information/communication **14,426**, real estate **10,781**, agriculture/forestry/fishing **10,013**, other services **8,783**, transport/storage **8,646**, manufacturing **8,259**, and administrative/support services **8,003**. Accommodation/food accounts for **4,226**, education **3,162**, and health/social work **2,381**. These are sector groups, not individual occupations. [Statistics Estonia, ER025][mix]

**Reading the catalogue:** “All” means OÜ, FIE and ettevõtluskonto users where relevant; e-resident-owned OÜs are included. “Employer” applies when employing people, not automatically to a sole shareholder. Modes are proposed product controls. **Act-with-approval** requires approval before filing, paying, signing or sending. **Never-automate** reserves the actual decision or professional act for a human. “None found” means no documented integration for that operation was found; it does not prove that an institution has no internal API. Listed APIs are integration candidates, not tested Harness connections.

## Hiring and employment

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D01 | “Publish my vacancy on Töötukassa, CV Keskus and CV-Online.” | Employer | Each vacancy | Töötukassa; recruitment platforms | Web portal | None found for publishing | act-with-approval | med — advertising spend, misleading terms | [Töötukassa][jobs]; [CV Keskus][cvk] |
| D02 | “Arrange interviews and send candidates the pay range.” | Employer | Before interview; new rules from **13 July 2026** prohibit salary-history questions | Candidates | E-mail; calendar; portal | [Microsoft Graph Calendar][graph] | act-with-approval | high — unlawful recruitment | [MKM pay transparency][paytrans] |
| D03 | “Check this finalist’s references lawfully.” | Employer | Finalists only; role-specific necessity | Candidate; referees; authorised registers | E-mail; portal | None found; preserve natural-person lookup exclusion | draft | high — unlawful background checks | [AKI employment guidance][employmentprivacy] |
| D04 | “Help me compare candidates and choose whom to hire.” | Employer | Each selection | Candidates | Recruitment portal; documents | None found for lawful decision-making | never-automate | high — discrimination, consequential profiling | [AKI automated decisions][automated] |
| D05 | “Should this person have an employment or services contract?” | Employer; contractor | Before engagement; working arrangements change | Worker; Labour Inspectorate; EMTA | Documents; consultation | [Ärikratt MCP][kratt], legal research | draft | high — misclassification, back-pay and taxes | [Contract classification][classification] |
| D06 | “Prepare the employment contract and later amendments.” | Employer | Hire; role/pay changes; probation review | Employee | Documents; signing portal | [Dokobit API][sign] for signing workflow | draft | high — invalid clauses or fixed term | [Employment legislation][labourlaws]; [Probation][probation] |
| D07 | “Register, suspend or end this employment.” | Employer | Register by work commencement; termination entry within **10 days** | EMTA, employment register (töötamise register, TÖR) | X-Road; e-MTA; CSV | [TOOTREG/TORRGNO][emtatech] | act-with-approval | high — insurance and tax errors | [Registration][tor]; [Termination entry][torend] |
| D08 | “Can I employ this school-age worker?” | Employer | Before hiring; age/task changes; ages **7–12** registered **10 working days** ahead | Labour Inspectorate; EMTA; guardian | Portal; documents | [TOOTREG][emtatech] | draft | high — prohibited work, child safety | [EMTA registration][tor] |
| D09 | “Check a foreign worker’s right to start.” | Employer | Before work; permission expiry | Police and Border Guard Board (PPA) | Web portal; documents | None found for applications | draft | high — unlawful employment | [Aliens Act, §106][foreignwork] |
| D10 | “Onboard the employee and issue equipment and access.” | Employer | Hire; role change; departure | Employee; IT providers | Portal; documents | [Bitwarden organisation API][bitwarden] | act-with-approval | med — excessive access, missing handover | [Bitwarden documentation][bitwarden] |
| D11 | “Prepare shifts and check actual working hours.” | Employer | Each roster; daily records | Employees; Labour Inspectorate | Timesheets; web portal | None found for Estonian compliance checking | draft | high — fatigue and wage claims | [Rest-time rules][rest] |
| D12 | “Check wages, overtime and holiday work before payroll.” | Employer | Each payroll; minimum from **1 April 2026: €946/month or €5.67/hour** | Employee; EMTA | Payroll software; documents | None found for complete calculation | draft | high — underpayment | [Minimum wage][minimum]; [Employment legislation][labourlaws] |
| D13 | “Use a flexible-hours agreement correctly.” | Employer | Available from **13 February 2026**; minimum **0.25 workload**, hourly pay at least **1.2× minimum** | Employee | Written agreement; timesheets | None found | draft | high — invalid agreement, unpaid guaranteed hours | [Flexible hours][flex]; [Commencement][flexdate] |
| D14 | “Make the holiday calendar and track balances.” | Employer | Schedule by **31 March**; normally **28 calendar days** annually | Employees | Calendar; HR portal | [Graph Calendar][graph] | draft | med — conflicting leave, expired balances | [Schedule][holidayschedule]; [Entitlements][leave] |
| D15 | “Calculate and arrange holiday pay.” | Employer | Normally penultimate working day before leave; later payment requires agreement within statutory limit | Employee | Payroll software; bank portal | None found for complete calculation | act-with-approval | high — wage claim | [Holiday pay][holidaypay] |
| D16 | “Process an employee’s sick leave.” | Employer | Ordinary illness: days **1–3 unpaid**, employer **4–8**, Tervisekassa from **9**; normally **70%** | Tervisekassa | X-Road; state portal | [Employer TVL interface][tvlapi] | act-with-approval | high — incorrect benefits or health-data exposure | [Sickness benefit][sick] |
| D17 | “Process care leave without charging employer sick pay.” | Employer | Qualifying care: Tervisekassa pays from **day 1 at 80%**; duration depends on reason | Tervisekassa | X-Road; state portal | [Employer TVL interface][tvlapi] | act-with-approval | high — wrong payer or duration | [Benefit comparison][sick] |
| D18 | “Arrange maternity, paternity, parental and child leave.” | Employer; eligible owner | Birth/adoption; employee request; return to work | Social Insurance Board (SKA); EMTA | SKA portal; e-MTA | [TOOTREG][emtatech] for employment status only | act-with-approval | high — lost entitlement, protected-worker dismissal | [Leave types][leave]; [Parental leave][parental] |
| D19 | “Handle study leave and special leave entitlements.” | Employer | Qualifying request; study leave generally **30 calendar days**, including **20 paid** | Employee; education provider; SKA | Documents; portal | None found | draft | med — incorrect leave/pay | [Leave types][leave] |
| D20 | “Agree remote working arrangements and expenses.” | Employer; remote OÜ | Starting/changing remote work | Employee; occupational-health provider | Documents; e-mail | None found for compliance assessment | draft | high — unsafe conditions, unclear responsibilities | [Remote-work safety][remote] |
| D21 | “End employment and calculate the final settlement.” | Employer | Event-driven; employer notice normally **15/30/60/90 days**, depending on tenure | Employee; EMTA; Töötukassa | Documents; e-MTA | [TOOTREG][emtatech]; [Dokobit][sign] | draft | high — unlawful dismissal, compensation | [Termination rules][termination]; [Unused leave][leave] |
| D22 | “Respond to a grievance or labour dispute.” | Employer | Complaint; dismissal challenge; procedural deadline | Labour dispute committee (töövaidluskomisjon) | E-mail; signed documents; hearing | None found | draft | high — missed defence or evidence | [Claims and deadlines][labourclaims] |
| D23 | “Submit labour statistics when my business is selected.” | Employer | Assigned questionnaire deadline | Statistics Estonia | Reporting portal; machine interface | [Data-based reporting, APA][apa] | act-with-approval | med — inaccurate compulsory statistics | [Supported labour datasets][apa] |

## Workplace health and safety

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D24 | “Create and update our workplace risk assessment.” | Employer | First employee; changed hazards; accidents | Labour Inspectorate, TEIS | Web portal; documents | None found for TEIS submission | draft | high — injury; applies also to small/remote workplaces | [Risk assessment][riskassessment] |
| D25 | “Record our safety specialist and arrange representation.” | Employer | Set-up; personnel changes; representative required from **10 employees** | Labour Inspectorate; employees | TEIS portal | None found | act-with-approval | high — missing safety responsibilities | [TEIS roles][teisroles] |
| D26 | “Book occupational-health checks and follow restrictions.” | Employer | Risk-based; initial check generally within **4 months**, earlier for specified hazards | Occupational-health doctor | Booking portal; documents | None found | act-with-approval | high — unsuitable work, sensitive data | [Occupational health][healthchecks] |
| D27 | “Appoint and train our first-aider.” | Employer | Training within **one month** of appointment; refresher every **three years**, subject to exceptions | Training provider; Labour Inspectorate | TEIS; booking; documents | None found | act-with-approval | high — inadequate emergency response | [First-aid rules][firstaidlaw] |
| D28 | “Document induction, protective equipment and safe procedures.” | Employer; shared worksites | Before relevant work; changes; retraining | Workers; contractors | Documents; training records | None found | draft | high — injury, unsupported compliance claim | [Safety organisation][safetyorganisation] |
| D29 | “Record and investigate an accident at work.” | Employer | Investigate within **10 working days**; report within **3 working days** after investigation | Labour Inspectorate; injured worker | TEIS; emergency contact | None found | act-with-approval | high — injury evidence, reporting breach | [Accident procedure][accident] |

## GDPR and information governance

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D30 | “Write privacy notices matching what we actually collect.” | All | New website, customers, staff or purposes | Data subjects; Data Protection Inspectorate (AKI) | Website; documents | None found for legal assessment | draft | high — misleading disclosure, unlawful processing | [Transparency guidance][privacy] |
| D31 | “Map personal data, lawful bases and retention periods.” | All | Set-up; new systems; regular review | AKI; internal owner | Documents; software inventory | None found | draft | high — over-retention, unrecorded processing | [Processing records][ropa] |
| D32 | “Check our accountant, cloud and AI processor agreements.” | All | Before access; vendor/subprocessor changes | Processors; AKI | Contract; vendor portal | None found for legal review | draft | high — uncontrolled disclosure and transfers | [Controller/processor duties][processors] |
| D33 | “Answer an access, correction or deletion request.” | All | Normally within **one month**; justified extension up to **two additional months** | Data subject | E-mail; relevant systems | None found end-to-end | act-with-approval | high — wrong-person disclosure, unlawful deletion | [Data-subject requests][dsar] |
| D34 | “Handle a personal-data breach and prepare notifications.” | All | Notify AKI within **72 hours** of awareness unless unlikely to risk rights; assess individual notification | AKI; affected people | AKI portal; e-mail | None found for notification | act-with-approval | high — missed notification, continuing harm | [AKI breach procedure][breach] |
| D35 | “Fix cookie consent and marketing permissions.” | Website/shop operators | Before nonessential tracking; campaign changes | Visitors; subscribers; AKI | Website; consent platform | None found for legal compliance | draft | high — unlawful tracking/contact | [Cookies][cookies]; [Transparency][privacy] |
| D36 | “Check whether our CCTV or vehicle GPS is justified.” | Employers; premises operators | Before installation; purpose/coverage changes | Employees; visitors; AKI | Camera portal; documents | None found | draft | high — disproportionate surveillance | [AKI workplace monitoring][employmentprivacy] |
| D37 | “Assess a new AI/data workflow before connecting it.” | All | New processing, profiling or sensitive-data use | AKI; vendors | Documents; security settings | None found for DPIA judgment | draft | high — excessive scopes, public leakage | [DPIA guidance][dpia]; [Automated decisions][automated] |

## Contracts, intellectual property and legal monitoring

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D38 | “Tell me which law changed and what applies today.” | All | New activity; legal amendment; disputed transaction | Riigi Teataja; municipality | Public web | [Ärikratt MCP][kratt] | read | high — obsolete wording or commencement date | [Riigi Teataja][rt]; [Employment-law index][labourlaws] |
| D39 | “Review this customer or supplier contract and standard terms.” | All | Before agreement; renewal; dispute | Contracting party | Documents; e-mail | None found for authoritative review | draft | high — liability, unfair or excluded terms | [Law of Obligations Act][vos] |
| D40 | “Prepare an NDA and protect our business information.” | All | Sharing commercial information; hiring contractors | Recipient; worker | Documents; signing portal | [Dokobit API][sign] | draft | med — ineffective confidentiality terms | [Contract law][vos]; [Signing API][sign] |
| D41 | “Make sure we can use commissioned code, designs and photographs.” | All; creative/IT | Before commissioning; reuse; sale | Author; contractor; license provider | Contract; asset records | None found | draft | high — missing economic rights; moral rights differ | [Copyright Act, §§11–13][copyright] |
| D42 | “Check and register our trademark.” | OÜ; FIE; e-resident owners | Before branding; filing; renewal | Patent Office (Patendiamet); EUIPO | Search and filing portals | None found for Estonian filing | act-with-approval | high — infringement, wrong classes/applicant | [Patent Office guidance][trademark] |
| D43 | “Send this approved document for signature and preserve evidence.” | All | Each signature; retention review | Signatories; trust-service provider | Signing portal; API | [Dokobit API][sign] | act-with-approval | high — wrong version, identity or authority | [API documentation][sign] |

## Counterparties, collections and disputes

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D44 | “Check this company and its signing authority.” | All | Before contract/payment; material changes | Business Register; EMTA; MTR | API; public portals | [Ärikratt][kratt]; [RIK XML services][rikapi] | read | high — wrong entity or unauthorised signatory | [RIK documentation][rikapi] |
| D45 | “Assess customer credit and monitor deterioration.” | Credit-selling businesses | Before credit; portfolio monitoring | Creditinfo/Krediidiinfo; Inforegister | Commercial API; portal | [Creditinfo Data Market][creditinfo]; [Inforegister API][inforegister] | read | high — bad debt, misleading scores | [Creditinfo][creditinfo]; [Inforegister][inforegister] |
| D46 | “Screen this transaction for sanctions.” | All | Before dealing/payment; ownership/list changes | Foreign Ministry; Financial Intelligence Unit (RAB) | Lists; portal; commercial API | [Creditinfo screening API][creditinfo] | draft | high — prohibited direct/indirect dealing | [Official sanctions guidance][sanctions] |
| D47 | “Report or correct a company’s payment default.” | Creditors | Verified overdue debt; settlement; dispute | Creditinfo; debtor | Commercial portal/API | [Creditinfo Payment Defaults][creditinfo]; write access unverified | act-with-approval | high — inaccurate publication, damages | [Creditinfo documentation][creditinfo] |
| D48 | “Prepare a payment reminder or settlement plan.” | All | Invoice overdue; debtor response | Customer; collection agency | E-mail; documents | None found end-to-end | act-with-approval | med — wrong amount, waived rights | [Contract remedies][vos] |
| D49 | “Apply for an expedited payment order.” | OÜ; FIE; creditors | Due eligible claim up to **€8,000**, including ancillary claims | Pärnu County Court; e-File (e-toimik) | Web portal only | None found for public filing | act-with-approval | high — wrong claim or procedural route | [Court instructions][paymentorder] |
| D50 | “Prepare or defend a civil claim.” | All | Disputed debt/contract; court-set deadlines | County court; EU counterpart | e-toimik; documents | None found for filing | draft | high — adverse judgment, costs | [Court procedure][paymentorder]; [EU small claims ≤€5,000][smallclaims] |
| D51 | “Send an enforceable claim to a bailiff.” | Judgment creditor | Enforceable instrument; unpaid judgment | Bailiff (kohtutäitur) | Signed application; e-mail/portal | None found | act-with-approval | high — fees, incorrect enforcement | [Bailiffs’ Chamber][bailiff] |
| D52 | “Answer a consumer complaint and committee case.” | B2C sellers | Complaint response within **15 days**; then case-specific deadlines | Consumer disputes committee (tarbijavaidluste komisjon), TTJA | E-mail; dispute portal | None found | act-with-approval | high — consumer remedies, adverse decision | [Complaint deadline][consumer]; [Trader procedure][committee] |

## Insurance, IT, vehicles, premises and purchasing

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D53 | “Compare liability, property, interruption and vehicle insurance.” | All | Start-up; renewal; changed activity/assets | Insurer; broker | Web portal; e-mail | None found for binding comprehensive cover | draft | high — exclusions, underinsurance | [Property/interruption terms][insurance]; [Motor insurance][motorinsurance] |
| D54 | “Report a loss and assemble the insurance claim.” | Insured business | Incident; policy-specific notification deadline | Insurer; assessor | Portal; e-mail | None found | act-with-approval | high — unsupported facts, lost cover | [Policy terms][insurance] |
| D55 | “Secure accounts and remove former staff access.” | All | Onboarding/offboarding; compromised credential | SaaS/identity providers | Admin portal; API | [Bitwarden organisation API][bitwarden] | act-with-approval | high — account takeover, business lockout | [Bitwarden][bitwarden]; [RIA guidance][cyberguide] |
| D56 | “Check backups and prove we can restore.” | All | Scheduled checks; changes; incident | Backup/cloud provider | Admin portal; restore tools | None found across providers | act-with-approval | high — permanent data loss | [RIA business cybersecurity guide][cyberguide] |
| D57 | “Secure our domain and business e-mail.” | All | Domain purchase/renewal; DNS/mail changes | Registrar; DNS/mail provider | Portal; API | [Cloudflare DNS/DNSSEC API][dns] | act-with-approval | high — outage, spoofing | [Cloudflare documentation][dns] |
| D58 | “Investigate this suspicious invoice or phishing message.” | All | Suspicious message/payment change | Supplier; bank; CERT-EE | E-mail; incident channel | None found end-to-end | draft | high — fraud, compromised devices | [RIA guidance][cyberguide] |
| D59 | “Register or transfer the business vehicle and track inspections.” | Vehicle users | Acquisition; transfer; vehicle-specific inspection date; initial registration generally **5 working days** | Transport Administration (Transpordiamet) | Portal; physical inspection | None found for owner filing | act-with-approval | high — illegal use, wrong ownership | [Vehicle registration][vehicle] |
| D60 | “Check company-car private use and vehicle taxes.” | OÜ/employer; vehicle users | Monthly use review; tax notice | EMTA; Transpordiamet | e-MTA; vehicle portal; API | [EMTA annual vehicle-tax calculator API][emtatech] | draft | high — fringe-benefit/VAT errors | [Company-car rules][companycar]; [API][emtatech] |
| D61 | “Review this premises lease and permitted use.” | Premises users | Before lease; alterations; renewal | Landlord; municipality | Contract; EHR portal | [EHR APIs][ehr], access-dependent | draft | high — unusable premises, repair liabilities | [Contract law][vos]; [EHR][ehr] |
| D62 | “Check utility bills and compare supply contracts.” | Premises users | Monthly billing; tariff renewal | Energy/water/telecom supplier | Portal; e-mail; API | [Estfeed Datahub][estfeed], contractual access | read | med — excess cost, interrupted supply | [Elering documentation][estfeed] |
| D63 | “Track fire-safety checks and submit any required report.” | Premises operators | Maintenance schedule; covered buildings report by **31 March** | Rescue Board (Päästeamet) | Ohutusportaal; inspection records | None found for filing | act-with-approval | high — life safety; reporting not universal | [Fire self-inspection][fire] |
| D64 | “Compare supplier quotations and negotiate an order.” | All | Purchase; supplier replacement | Suppliers | E-mail; supplier portals | None found across suppliers | draft | med — unsuitable specification or terms | [Contract law][vos] |
| D65 | “Place the approved order and check what arrived.” | Goods-buying businesses | Each purchase/delivery | Supplier; warehouse | ERP; e-mail; API | [Erply Inventory API][erply] | act-with-approval | med — duplicate order, quantity discrepancy | [Erply documentation][erply] |
| D66 | “Prepare stocktaking and reconcile differences.” | Stockholding businesses | Count schedule; financial close; suspected loss | Owner; accountant | ERP; physical count | [Erply inventory APIs][erply] | draft | high — misstated assets; physical count required | [Inventory documentation][erply] |
| D67 | “Track replenishment, reservations and obsolete stock.” | Retail; manufacturing; food | Stock movement; reorder point; expiry | Suppliers; warehouse | ERP; API | [Erply stock API][erply] | draft | med — stockouts, unsaleable goods | [Stock/reorder documentation][erply] |

## Continuity, succession, sale and closure

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D68 | “Keep the business running if I am unavailable.” | All; especially solo owners | Periodic review; dependency changes | Substitute; suppliers; IT providers | Documents; delegated accounts | None found end-to-end | draft | high — inaccessible funds/data, missed obligations | [RIA recovery guidance][cyberguide] |
| D69 | “Arrange succession and emergency representation.” | Owner; FIE; e-resident | Incapacity/death planning; ownership changes | Notary; heirs; representatives | E-notar; meeting | None found | draft | high — invalid authority, inheritance dispute | [Notarial services][notary] |
| D70 | “Prepare a company sale or transfer.” | OÜ owner | Proposed sale | Buyer; notary; Business Register | Data room; e-notar; portal | [RIK API][rikapi] for diligence only | draft | high — undisclosed liabilities, invalid transfer | [Share-transfer rules][shares] |
| D71 | “Close the business and finish every outstanding obligation.” | OÜ; FIE; EK | Cessation; liquidation/deletion sequence | RIK; EMTA; creditors; bank; permit issuers | Portals; notices; documents | None found end-to-end | act-with-approval | high — debts, premature distributions, lost records | [RIK closure instructions][closure] |
| D72 | “Check whether financial distress needs insolvency action.” | OÜ board; FIE | Inability to pay; persistent distress | Court; insolvency adviser | Documents; e-toimik | [Ärikratt][kratt] for public indicators only | draft | high — personal liability, creditor loss | [Bankruptcy Act][bankruptcy] |

## Sector-specific operations and duties

Sector rows supplement the common catalogue. An activity’s tax treatment, including use of an ettevõtluskonto, does not itself establish permission to perform a regulated service.

| ID | Use case | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| D73 | “Notify PTA or obtain approval before selling food.” | Food/catering; home producer | Before regulated activity; changes/closure; exemptions depend on activity | Agriculture and Food Board (PTA) | Agriculture client portal; e-mail/paper | None found for filing | act-with-approval | high — unlawful operation, food harm | [Food notifications/approvals][food] |
| D74 | “Build our HACCP-based self-control plan and daily logs.” | Food/catering | Before operation; process changes; daily controls | PTA; laboratories | Documents; operational software | None found end-to-end | draft | high — unsafe food; factual checks needed | [PTA self-control requirements][food] |
| D75 | “Check allergens, trace a batch and organise a food recall.” | Food producers/sellers | Product/menu change; incident | PTA; suppliers; customers | Labels; records; portal/e-mail | [Erply][erply] for stock only | act-with-approval | high — allergic reaction, unsafe sale | [Food operations][foodsales] |
| D76 | “Check what is needed to open this accommodation.” | Accommodation; short lets | Opening; premises/service changes | Municipality; MKM; PTA where food offered | Web guidance; relevant portals | None found end-to-end | draft | high — unsafe premises; wrong registration assumption | [MKM: general MTR registration abolished][accommodation] |
| D77 | “Register guests and retain only required details.” | Accommodation | Before accommodation begins; retention schedule | Guest; authorised authorities | Booking system; registration form | None found for statutory workflow | act-with-approval | high — excessive identity collection, missing records | [Tourism Act, §24][guests] |
| D78 | “Submit this month’s accommodation statistics.” | Assigned accommodation respondents | **10th of following month** in 2026 | Statistics Estonia | Reporting portal; machine interface | [APA accommodation reporting][apa]; Bidrento supported | act-with-approval | med — inaccurate statistics | [2026 deadlines][accommodationstats]; [APA][apa] |
| D79 | “Register construction activity and the qualified responsible person.” | Construction/design/supervision | Before covered activity; qualification/relationship changes | TTJA; MTR; qualification register | MTR portal | [Ärikratt][kratt] for lookup; filing none found | act-with-approval | high — unauthorised or incompetent work | [Construction activity rules][construction] |
| D80 | “Prepare building notices, permits and completion documents.” | Construction; property operators | Project stage; change of use | Municipality; building register (ehitisregister, EHR) | EHR portal; documented services | [EHR OpenAPI catalogue][ehr]; external write access unverified | act-with-approval | high — unlawful building/use | [EHR documentation][ehr] |
| D81 | “Register our subcontracting chain and site attendance.” | Construction, including micro subcontractors | Covered sites; chain changes; attendance records | EMTA, TTKI | e-MTA; X-Road; site systems | [TTKI X-Road services][emtatech] | act-with-approval | high — missing workers/contractors | [Site applicability][ttki] |
| D82 | “Register electrical work and document qualified supervision.” | Electrical contractors | Before activity; responsible-person change; completed work | TTJA; MTR | MTR; technical records | [Ärikratt][kratt] for lookup; filing none found | act-with-approval | high — electrocution, invalid certification | [Electrical-work rules][electrical] |
| D83 | “Check salon hygiene, competence and health certificates.” | Hair/beauty/tattoo/nail services | Opening; treatment changes; competence rules from **1 March 2026** | Health Board (Terviseamet) | Documents; inspections | None found | draft | high — infection/injury; no general salon opening licence | [2026 beauty requirements][beauty] |
| D84 | “Make our online checkout, returns and terms compliant.” | Retail/e-commerce; digital sellers | Launch; offer changes; returns; generally **14-day** consumer withdrawal, with exceptions | TTJA; consumers | Store platform; e-mail | None found for legal assessment | draft | high — refunds, unenforceable terms | [Distance selling][ecommerce]; [Consumer rights][consumer] |
| D85 | “Check shelf prices and sale-price claims.” | Retail/e-commerce | Price change; promotion; generally previous **30-day lowest price** for goods | TTJA | POS/store platform | [Erply][erply] for product data | draft | med — misleading discount or price | [Price-reduction rules][prices] |
| D86 | “Track packaging and fulfil producer-responsibility reporting.” | Importers; packaged-goods sellers | Market placement; reporting cycle; PPWR generally applies from **12 August 2026**, with phased provisions | Environmental Board; PAKIS; recovery organisation | Portal; contractor reports | None found for complete submission | act-with-approval | high — environmental obligations, reporting errors | [Packaging duties][packaging]; [PPWR][ppwr] |
| D87 | “Check product safety, traceability and recalls.” | Manufacturers/importers/retailers | Before sale; new product; safety incident | TTJA; suppliers; customers | Technical file; portal; notices | [Erply][erply] for inventory only | draft | high — injury, prohibited sale | [Product-safety duties][productsafety] |
| D88 | “Get the transport licence and vehicle copies we need.” | Freight/passenger operators | Before covered transport; fleet/licence changes | ERAA; MTR; competent authorities | Portal; signed forms | None found for filing | act-with-approval | high — unlicensed carriage | [Community-licence copies][freight]; [Forms][freightforms] |
| D89 | “Check tachograph and driver-hours compliance.” | International van/truck operators | Every journey; from **1 July 2026**, covered international hire/reward vehicles over **2.5t** enter scope | Transport enforcement; tachograph provider | Device; transport software | None found across providers | draft | high — fatigue, fines, stopped journeys | [EU 2026 scope][tachograph] |
| D90 | “Obtain the taxi documents for my operating model.” | Taxi/app drivers; FIE/OÜ/EK | Before service; vehicle/driver changes | Municipality/delegated authority; MTR | MTR; e-mail | [Ärikratt][kratt] for lookup; filing none found | act-with-approval | high — wrong permit combination | [Taxi versus app-taxi requirements][taxi] |
| D91 | “Check platform statements and challenge a platform decision.” | Couriers; app drivers | Settlement; deactivation; contract change | Platform; labour dispute body | Platform portal; e-mail | None found for complete workflow | draft | high — lost income, misclassification | [Platform-work bill: pending][platformbill] |
| D92 | “Apply for the relevant PRIA agricultural support.” | Farmers; eligible land users | Scheme window; 2026 area/animal round **15 May–15 June** | PRIA | e-PRIA | None found for application submission | act-with-approval | high — lost grant, repayment | [2026 PRIA round][priasupport] |
| D93 | “Maintain animal, field and agricultural activity records.” | Agriculture/livestock | Animal/land events; field operations; scheme-specific duties | PRIA; PTA | e-PRIA; fieldbook; records | None found for complete adapter | act-with-approval | high — traceability and support failures | [e-PRIA services][epria] |
| D94 | “Check forest restrictions and submit the forest notice.” | Forest owners/operators | Planned covered felling; significant forest damage | Environmental Board; forest register (metsaregister) | Portal; XML upload; signed e-mail/paper | [Published XML schema route][forest]; no filing API found | act-with-approval | high — unlawful felling, irreversible damage | [Forest notice procedure][forest] |
| D95 | “Check VAT before buying or selling cross-border services.” | IT/consulting; OÜ/FIE; e-residents | First foreign SaaS/service purchase; each new supply model | EMTA; foreign tax authority | e-MTA; accounting software | [EMTA tax interfaces][emtatech] | draft | high — reverse-charge/registration errors below general turnover threshold | [Limited VAT liability][limitedvat] |
| D96 | “Will working abroad create a permanent establishment?” | Remote OÜ; e-residents; freelancers | Relocation; overseas office/staff/agent | Relevant foreign tax authority; EMTA | Documents; local filings | None found for legal determination | draft | high — foreign corporate/payroll taxes | [Official e-residency guidance][pe] |
| D97 | “Check whether my therapy service needs healthcare licensing.” | Healthcare; therapeutic wellness | Before service; premises/service change | Health Board; MEDRE | Licensing portal; insurance | None found for licence filing | draft | high — unlicensed healthcare; required patient insurance | [Licensed activities][healthlicence]; [Insurance][patientinsurance] |
| D98 | “Prepare clinical administration and exchange required records.” | Licensed healthcare provider | Patient encounter; reporting event | TEHIK; Tervisekassa | Clinical software; health information system | [TEHIK contracted integration][tehik] | draft | high — patient safety, sensitive records; clinician validates | [Integration requirements][tehik] |
| D99 | “Start or change alcohol sales correctly.” | Retail/catering/accommodation | Before sales; activity changes | MTR; PTA; municipality; EMTA where relevant | MTR; agriculture portal | [Ärikratt][kratt] lookup; filing none found | act-with-approval | high — unlawful sale; retail requires notifications, not a separate licence | [Alcohol requirements][alcohol] |
| D100 | “Register tobacco sales and check permitted products.” | Tobacco/related-product retailers | Before sales; product/activity changes | MTR; TTJA; Health Board; EMTA | MTR; product lists | [Ärikratt][kratt] lookup; filing none found | act-with-approval | high — prohibited product or sales practice | [Tobacco requirements][tobacco] |
| D101 | “Check waste registration or permits for our work.” | Manufacturing; repairs; construction; waste services | Before regulated collection/transport/treatment | Environmental Board; KOTKAS | KOTKAS portal | None found for filing | draft | high — unlawful waste handling | [Waste permits and registration][waste] |
| D102 | “Meet AML duties for my professional service.” | Accountants; tax advisers; estate agents; company-service providers | Client onboarding; monitoring; suspicion | RAB; relevant supervisor | Due-diligence records; reporting portal | [Creditinfo screening][creditinfo], partial only | draft | high — missed suspicious activity, improper disclosure | [Obliged sectors][aml] |
| D103 | “Register training activity or obtain a required training licence.” | Tutors/training providers | Offering covered training; publicly funded courses | Education Ministry; EHIS | EHIS portal | None found for filing | act-with-approval | high — ineligible funding or unlicensed specialist training | [Training-provider requirements][training] |
| D104 | “Obtain permission to play music in our business.” | Shops; salons; hospitality; events | Before public use; licence renewal | EAÜ; other relevant rights holders | E-mail; licence agreement | None found | act-with-approval | med — copyright claims | [EAÜ business premises][music] |
| D105 | “Prepare and submit a public-procurement bid.” | All eligible suppliers | Tender deadline; clarification; contract award | Contracting authority; RHR | Procurement portal | [Ärikratt][kratt] discovery; submission API none found | act-with-approval | high — excluded bid, binding commitments | [RHR supplier functions][procurement] |
| D106 | “Check cybersecurity-law obligations for our IT service.” | IT/communications/regulated providers | Service launch; statutory-scope changes | RIA | Legal assessment; authority channel | None found end-to-end | draft | high — missed security/reporting duties; exact **25 October scope UNVERIFIED** | [Cybersecurity Act version requiring recheck][cyberlaw] |

## Gaps

- **Employment adapter:** combine TÖR, employer sickness certificates, leave and payroll evidence. X-Road services exist, but intermediary access, delegation and customer isolation need confirmation. EMTA publishes replacement data-based TÖR documentation for **1 April 2027**. [Technical documentation][emtatech]
- **TEIS adapter/browser workflows:** risk-assessment submission, responsible-person records and accident reports. The assistant can assemble evidence; workplace inspections and medical decisions remain human work.
- **Permit workflows:** PTA, MTR, MEDRE, EHIS, PRIA and KOTKAS need operation-specific adapters or browser workflows. Public register searches do not establish filing access.
- **Court and collection workflows:** e-toimik, bailiff applications and consumer-dispute responses need evidence packaging, deadline tracking, approval and submission receipts.
- **Recruitment publishing:** no documented general-purpose publishing API was established for the named recruitment portals. Calendar integration covers only scheduling.
- **Sector operational software:** food temperature/allergen records, guest registration, salon hygiene, clinical administration and transport compliance require specialised connectors.
- **Document and consent evidence:** versioned contracts, signing authority, retention, lawful processing and scope changes need a shared evidence store.
- **Friction marketplace:** redact names, contracts, payroll, health data, tokens and business secrets before turning failures into public feature requests; owner approval must cover publication.
- **Verification limit:** authenticated portal workflows were not exercised because BrowserOS calls were blocked by the session’s approval policy. Interface availability above comes from published documentation.

## Top 10 by value for a micro-entrepreneur

1. **D07 — Employment registration:** prevents missed start/stop entries and benefit problems.
2. **D12–D19 — Pay and leave preparation:** recurring calculations with expensive exceptions.
3. **D44–D46 — Counterparty, credit and sanctions checks:** avoids preventable losses before commitment.
4. **D48–D51 — Collections:** converts overdue invoices into an evidence-backed recovery workflow.
5. **D05–D06 — Engagement contracts:** addresses misclassification before it becomes a dispute.
6. **D24–D29 — Workplace safety:** makes first-employee obligations visible and maintainable.
7. **D39–D43 — Contracts and signing:** catches consequential clauses and preserves the approved version.
8. **D73–D104 — Activity-specific duty checklist:** tells owners which permissions and records their actual work needs.
9. **D55–D58 — Access, backup and fraud protection:** protects businesses with no dedicated IT staff.
10. **D68–D72 — Continuity and exit:** reduces dependence on one owner and unfinished closure obligations.

## Open questions

- **2027 employment changes:** minor employees’ annual leave changes from **35 to 28 calendar days on 1 January 2027**. Confirm transition/accrual handling; do not assume a 2027 minimum wage before verifying its enacted amount. [Leave guidance][leave]
- **2026 sickness changes:** Tervisekassa’s daily cap is **€126.87** for new covered cases from **1 January 2026**; the employer-paid benefit has no corresponding cap. Implement case-start and exception handling. [Tervisekassa][sick]
- **Platform work:** bill **1003 SE** was still in parliamentary proceedings in the sources inspected. Recheck enactment before activating future rights or duties. [Riigikogu][platformbill]
- **Short-term accommodation:** confirm any national registration implementation following EU short-term-rental rules; do not invent a general MTR registration requirement. [MKM accommodation guidance][accommodation]
- **Delegated filing access:** which agencies allow a commercial gateway to act through customer mandates, and which require institution-specific contracts or qualified users?
- **EHR services:** which documented write endpoints are supported external integrations rather than internal application services?
- **Regulatory changes:** recheck the cybersecurity law’s post-15-October consolidation and procurement changes advertised for **1 November 2026** before implementing those rules. [Cybersecurity version][cyberlaw]; [RHR notice][rhr]
- **Commercial connectors:** confirm subscription costs, permitted reuse, monitoring rights and corporate-only projections for credit providers. Creditinfo/Krediidiinfo and Inforegister are separate integration choices.

[mix]: https://www.stat.ee/en/find-statistics/statistics-theme/economy/economic-units
[kratt]: https://arikratt.ee/mcp
[jobs]: https://tervisekassa.ee/sites/default/files/perearstid/perearstikonkruss/perearsti_kasiraamat_terviktekst_09-10-2022_uuendatud_20.12.2023.pdf
[cvk]: https://www.cvkeskus.ee/toopakkumise-avaldamine
[graph]: https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview
[paytrans]: https://www.mkm.ee/too-ja-vordsed-voimalused/toosuhted-ja-keskkond/palkade-labipaistvus
[employmentprivacy]: https://www.aki.ee/isikuandmed/juhendid-ja-abimaterjalid/isikuandmete-tootlemine-toosuhetes
[automated]: https://www.aki.ee/isikuandmed/inimese-oigused/automatiseeritud-otsused-ja-profiilianaluus
[classification]: https://www.tooelu.ee/en/1443/authorisation-agreement
[sign]: https://dokobit.support.signicat.com/hc/en-us/articles/20067624820636-General-API-Services-Information
[labourlaws]: https://www.tooelu.ee/et/60/toooiguse-seadused-ja-maarused
[probation]: https://www.tooelu.ee/et/13/katseaeg
[emtatech]: https://www.emta.ee/ariklient/e-teenused-koolitused/e-teenuste-kasutamine/teenuste-tehniline-info
[tor]: https://www.emta.ee/en/business-client/registration-business/employment-register/employment-registration
[torend]: https://www.emta.ee/eraklient/e-teenused-maksutarkus/registrid-paringud/tootamise-registreerimine
[foreignwork]: https://www.riigiteataja.ee/public-api/api/v1/en/akt/501092026001/blob-html
[bitwarden]: https://bitwarden.com/help/public-api/
[rest]: https://www.tooelu.ee/en/25/rest-time
[minimum]: https://www.emta.ee/eraklient/maksud-ja-tasumine/tulu-deklareerimine/maksumaarad
[flex]: https://www.tooelu.ee/et/1642/paindliku-tooaja-kokkulepe
[flexdate]: https://www.riigiteataja.ee/et/seadus/seaduse_kokkuvote/2516
[holidayschedule]: https://www.tooelu.ee/et/27/puhkuse-ajakava
[leave]: https://www.tooelu.ee/en/26/types-holidays
[holidaypay]: https://www.tooelu.ee/et/28/puhkusetasu
[tvlapi]: https://tervisekassa.ee/partnerile/it-juhendid
[sick]: https://tervisekassa.ee/en/people/benefits-provided-health-insurance-fund/sickness-benefit
[parental]: https://www.sotsiaalkindlustusamet.ee/perehuvitised-ja-muud-toetused/perehuvitiste-ulevaade/jagatav-vanemahuvitis-ja-vanemapuhkus
[remote]: https://www.tooelu.ee/et/1446/tootervishoid-ja-tooohutus-kaugtool
[termination]: https://www.tooelu.ee/en/31/unilateral-termination-employment-contract
[labourclaims]: https://www.ti.ee/toovaidluste-lahendamine/kuidas-poorduda/naidisnouded-ja-tahtajad
[apa]: https://www.stat.ee/et/aruandlus-30
[riskassessment]: https://www.tooelu.ee/en/79/risk-assessment
[teisroles]: https://www.ti.ee/sites/default/files/documents/2022-07/ti_iseteeninduse_kasutusjuhend_en.pdf
[healthchecks]: https://www.tooelu.ee/et/81/tootervishoiuteenus
[firstaidlaw]: https://www.riigiteataja.ee/akt/130012025010?leiaKehtiv=
[safetyorganisation]: https://www.tooelu.ee/en/3/organisation-occupational-health-and-safety-enterprise
[accident]: https://www.tooelu.ee/et/116/kui-tool-juhtus-onnetus
[privacy]: https://www.aki.ee/1-andmetootlus-ja-labipaistvus
[ropa]: https://www.aki.ee/4-peatukk-isikuandmete-tootlemisulevaade
[processors]: https://www.aki.ee/isikuandmed/andmetootlejale/andmetootleja-vastutus-ja-kohustused
[dsar]: https://www.aki.ee/sites/default/files/documents/2024-04/Isikuandmete%20t%C3%B6%C3%B6tleja%20%C3%BCldjuhend.pdf
[breach]: https://www.aki.ee/meist/vota-uhendust/rikkumisteade
[cookies]: https://www.aki.ee/isikuandmed/kkk/interneti-ja-veebitegevused
[dpia]: https://www.aki.ee/sites/default/files/documents/2025-07/AKI_M%C3%B5juhinnang_A4_WEB-links-form.pdf
[rt]: https://www.riigiteataja.ee/
[vos]: https://www.riigiteataja.ee/akt/13113422?leiaKehtiv=
[copyright]: https://www.riigiteataja.ee/ert/act.jsp?id=12791124
[trademark]: https://www.epa.ee/kaubamargid/vaja-teada-enne-taotluse-esitamist/kkk
[rikapi]: https://avaandmed.ariregister.rik.ee/en/node/2
[creditinfo]: https://doc.creditinfo.ee/
[inforegister]: https://apidocs.inforegister.ee/en
[sanctions]: https://www.vm.ee/rahvusvahelised-sanktsioonid
[paymentorder]: https://www.kohus.ee/kohtusse-poordujale/tsiviilkohtumenetlus/maksekasu-kiirmenetlus
[smallclaims]: https://europa.eu/youreurope/citizens/consumers/consumers-dispute-resolution/legal-action-consumers/index_en.htm
[bailiff]: https://kpkoda.ee/kkk
[consumer]: https://www.ttja.ee/tarbijaharidus
[committee]: https://ttja.ee/kauplejale-komisjoni-toost
[insurance]: https://tingimused.if.ee/ViewPDF.aspx?ID=c7db9087-8981-4c0d-ac30-4a66921e7ea0
[motorinsurance]: https://www.lkf.ee/et/kindlustamise-tavad/kohustuslik-liikluskindlustus
[cyberguide]: https://ria.ee/sites/default/files/documents/2025-05/Ettevotte-kuberturvalisuse-luhijuhend-2025.pdf
[dns]: https://developers.cloudflare.com/api/resources/dns/
[vehicle]: https://transpordiamet.ee/soiduki-registreerimine
[companycar]: https://www.emta.ee/en/node/168/main_chapter/59737/pdf
[ehr]: https://swaggerui.ehr.ee/
[estfeed]: https://www.elering.ee/elektri-andmevahetus
[fire]: https://www.rescue.ee/et/tuleohutuse-enesekontroll
[erply]: https://learn-api.erply.com/requests/inventory
[notary]: https://www.notar.ee/ametitoimingud/kaugtoestamine/
[shares]: https://www.eesti.ee/ettevotja/et/artikkel/ettevotlus/ettevotte-lopetamine/osade-ja-aktsiate-voorandamine
[closure]: https://abiinfo.rik.ee/avalduste-esitamine/juriidilise-isiku-likvideerimine-ja-kustutamine
[bankruptcy]: https://www.riigiteataja.ee/et/akt/PankrS
[food]: https://pta.agri.ee/ettevotjale-tootjale-ja-turustajale/toidu-tootmine/tegevusload-ja-teavitamine
[foodsales]: https://pta.agri.ee/toidu-muuk
[accommodation]: https://www.mkm.ee/ettevotlus-ja-innovatsioon/turism/majutusteenused
[guests]: https://www.riigiteataja.ee/akt/104122020003
[accommodationstats]: https://www.stat.ee/et/kusimustikud/majutustegevus-2026-kuu
[construction]: https://www.ttja.ee/ariklient/ehitised-ehitamine/ehitusalane-ettevotlus
[ttki]: https://www.emta.ee/ariklient/registreerimine-ettevotlus/registreerimine-ehituses/toovotuahela-loomine
[electrical]: https://ttja.ee/ariklient/ohutus/paigaldised-ja-masinad/elektripaigaldised
[beauty]: https://terviseamet.ee/keskkonnatervis/ettevotjale-ja-kohalikule-omavalitsusele/ilu-ja-isikuteenused
[ecommerce]: https://www.ttja.ee/e-kaubandus
[prices]: https://www.ttja.ee/uued-reeglid-hindade-ja-arvustuste-kuvamisel
[packaging]: https://www.keskkonnaamet.ee/keskkonnakasutus-kiirgus/jaatmed/pakendid
[ppwr]: https://environment.ec.europa.eu/news/new-eu-rules-packaging-enter-application-2026-08-11_en
[productsafety]: https://www.ttja.ee/ariklient/ettevotlus/ohutus
[freight]: https://www.eraa.ee/uhenduse-tegevusloa-kinnitatud-arakirjade-taotlemine/
[freightforms]: https://new.eraa.ee/vormid
[tachograph]: https://www.ela.europa.eu/sites/default/files/2025-11/driving-light-commercial-vehicles-2026_web.pdf
[taxi]: https://voru.ee/taksoveo-teenus
[platformbill]: https://www.riigikogu.ee/en/eelnoud/0c85c27e-1bcd-4edc-a4fb-32a66893b1f3/platvormitoo-seadus/
[priasupport]: https://www.pria.ee/toetused/strateegiakava-2023-2027-otsetoetused-ja-maaelu-arengu-pindala-ja-loomapohised-toetused
[epria]: https://epria.pria.ee/
[forest]: https://www.keskkonnaamet.ee/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister
[limitedvat]: https://www.emta.ee/en/node/333/handbook/4/pdf
[pe]: https://learn.e-resident.gov.ee/hc/en-gb/articles/360002542297-Permanent-Establishment-Dual-Residence
[healthlicence]: https://www.terviseamet.ee/tervishoiukorraldus/tervishoiutootajale/tegevusload
[patientinsurance]: https://www.terviseamet.ee/tervishoiukorraldus/patsiendikindlustus
[tehik]: https://www.tehik.ee/info-tervishoiutootajale
[alcohol]: https://ttja.ee/ariklient/ettevotlus/tarbijakaitsenouded-tegevusalale/alkohol
[tobacco]: https://www.ttja.ee/ariklient/ettevotlus/tarbijakaitsenouded-tegevusalale/tubakatooted-ja-nendega-seonduvad-tooted
[waste]: https://www.keskkonnaamet.ee/taotlused-aruanded/keskkonnakasutus/jaatmete-taotlused
[aml]: https://www.fiu.ee/jarelevalvetegevus-ja-majandustegevuse-luba/jarelevalvetegevus
[training]: https://www.hm.ee/kutse-ja-taiskasvanuharidus/taiskasvanuharidus/koolitajale
[music]: https://eau.org/teose-kasutajale/lepinguliigid/kaubandus-ja-teenindusettevotted/
[procurement]: https://rtk.ee/riigihangete-register
[rhr]: https://riigihanked.riik.ee/
[cyberlaw]: https://www.riigiteataja.ee/et/akt/130062026131