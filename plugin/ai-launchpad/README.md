# AI Launchpad

Back office for Estonian small businesses, inside Claude.

## Use it

Ask Claude about your deadlines, your annual report or your books, or say "help me connect my accounting" or "link my e-mail". Claude checks public data and your own files first, asks only what nobody else knows, and walks you through linking your accounting software, e-mail, LHV bank or customer list in plain words. You do every login yourself.

Your assistant does the jobs you ask for and records every action. It asks first when you asked it to or when something needs your yes. You make payments and official filings yourself.

## A separate review

Before each send, book posting or handover of payment or filing figures, the `action-reviewer` agent checks the action in a fresh context. It sees only your exact request, the proposed action and the facts used from your books or customer list. It does not see source e-mails, files or web pages. If it flags a concern, your assistant explains why, shows the exact content and asks once. This is your assistant's own check. If your assistant cannot run the agent, the usual act-and-record flow and ask-first rules still apply.

## Install

In claude.ai, open Customize → Plugins → Add → Add marketplace and enter `paat/ai-launchpad`, then add AI Launchpad. Open the plugin's Connectors tab and connect AI Launchpad. AI Launchpad is in a closed pilot: Connect works only for invited accounts for now.

In Claude Code:

```
/plugin install ai-launchpad --marketplace paat/ai-launchpad
```

## Data

The plugin connects Claude to the AI Launchpad server at huppelaud.arikratt.ee. Launchpad stores your company's registry code, derived deadlines, exact actions and their recorded outcomes, including any approval requests; it stores no conversations. When the public-register lookup is configured, company facts come from the Estonian business register through Ärikratt; otherwise they come from what you tell your assistant, labelled as such.
