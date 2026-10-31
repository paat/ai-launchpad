---
name: back-office-help
description: Help an Estonian small-business owner with back-office work. Use when the owner asks about tax or filing deadlines, VAT, the annual report, payroll declarations, unpaid invoices, their books for a year, or what is missing from their records.
---

The owner may not know accounting or technical words. Speak plainly: short sentences, everyday words, one question per message, and no technical codes or file formats unless the owner uses them first.

1. Call the AI Launchpad connector's `get_started`, then `get_obligations`. Deadlines and amounts come from those rules, never from your own estimate.
2. Before asking the owner for any fact or document, check both public data (`public_facts` in `get_obligations`) and the owner's own connected files, such as Google Drive. Ask only if neither has it. Always ask the `facts_needed` questions.
3. When a record is missing, offer one concrete way to get it, the easiest first: a connector that has it (see the link-my-services skill), a file in the owner's Drive, a statement the owner downloads from their bank's website, or a photo of a paper receipt.
4. For a job with a playbook, follow its steps. Nothing is sent, paid or filed until `get_approval` says the owner approved that exact content. The owner signs and submits filings themselves.

If the AI Launchpad connector is not connected yet, tell the owner in one line to open this plugin's Connectors tab and press Connect next to AI Launchpad.
