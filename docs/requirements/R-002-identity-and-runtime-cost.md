# R-002 — identity-only sign-in and bounded runtime model use

Tracking: [issue #3](https://github.com/paat/ai-launchpad/issues/3).
Status: accepted need, 27 October 2026. The owner requested protection against model API-credit abuse and explicitly excluded Gmail and Calendar access from Launchpad.

Launchpad uses Google only to establish an identity. It requests no mailbox or calendar permission, stores no provider mailbox credentials, and does not treat a Google account as proof of authority to represent a business. The owner's assistant may connect directly to those services independently.

Catalogue lookup, assessment reporting and progress reporting do not require Launchpad-paid model inference. Any Launchpad-hosted model jobs must have a fixed purpose, bounded inputs and outputs, authenticated access, rate and concurrency limits, and independently enforced owner and global spending limits. A retry or replay cannot obtain another unmetered inference. A timeout does not prove that the provider charged nothing. Service nominations must not automatically trigger unbounded model work.

Until a provider's billable units, conservative reservations and hard limits are implemented and verified, public-runtime live inference must remain unavailable. Tests may use deterministic or subscription-model-authored synthetic fixtures with clear mock labels. No generic proxy to a model API is exposed.

For the current development run the public runtime API budget is exactly $0: tests/CI use deterministic mocks and subscription-based coding-model fixtures with clear mock labels remain valid for development only. Passing mock tests does not establish actual Meta model quality or live integration. Separately, a bounded operator-authorized live quality harness outside the public runtime ([model-quality doc](../model-quality.md)) completed two genuine synthetic setup calls on 2026-10-28 (EN `en-connector-help`, ET `et-connector-help`; usage-based estimate $0.005588 total, not reconciled billing; $2 allocated per attempt, $10 pilot cap with at most 5 distinct attempts, allocations never refunded). Public runtime activation stays a separate, later decision.

Acceptance evidence must cover identity isolation, browser-bound sign-in, revocation, repeat requests, concurrency, zero budget, provider failure and truthful user-facing status. Failed cost controls must not disable deterministic catalogue or reporting functionality.
