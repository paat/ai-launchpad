# AI Launchpad for ChatGPT

AI Launchpad is back-office help for an Estonian small business, inside the assistant you already use. This package is the ChatGPT plugin. It shares its skills with the Claude plugin, so the wording lives in one place.

## Install

In ChatGPT, install AI Launchpad from the ChatGPT Plugins directory once it is listed. Until then it is in a closed pilot.

## Packaging

From the repo root, with no trailing slash:

```
python3 -m zipfile -c ai-launchpad-chatgpt.zip plugin/ai-launchpad-chatgpt
```

Python's zipfile follows the skills symlink, so the ZIP holds real files. The skills are shared with the Claude plugin: edit them in `plugin/ai-launchpad/skills/`. The Claude-only `action-reviewer` agent is not part of this plugin, because ChatGPT plugins carry no agents.
