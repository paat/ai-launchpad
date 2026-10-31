# AI Launchpad

Back office for Estonian small businesses, inside Claude.

## Use it

Ask Claude about your deadlines, your annual report or your books, or say "help me connect my accounting" or "link my e-mail". Claude checks the public business register and your own files first, asks only what nobody else knows, and walks you through linking your accounting software, e-mail or LHV bank in plain words. You do every login yourself.

Nothing is sent, paid or filed until you approve the exact content on your phone.

## Install

In claude.ai, open Customize → Plugins → Add → Add marketplace and enter `paat/ai-launchpad`, then add AI Launchpad. Open the plugin's Connectors tab and connect AI Launchpad.

In Claude Code:

```
/plugin install ai-launchpad --marketplace paat/ai-launchpad
```

## Data

The plugin connects Claude to the AI Launchpad server at huppelaud.arikratt.ee. Launchpad stores your company's registry code, derived deadlines and the exact text of each approval request; it stores no conversations. Company facts come from the public Estonian business register through Ärikratt.
