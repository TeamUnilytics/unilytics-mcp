---
title: Install the Unilytics plugin for Claude
description: Add Unilytics to Claude as a plugin, by uploading one file or adding our marketplace, then sign in with your Unilytics account. No API key.
status: live
updated: 2026-11-19
---

# Install the Unilytics plugin for Claude

## What does the plugin add?

- **The Unilytics connector.** Claude can use your saved skills, each client's Brand Context, Context records and Knowledge Base, and the SEO, content and AEO research tools.
- **The "Use Unilytics" skill.** It starts each task from your own skills: Claude finds the client, picks the best matching skill, reads the client's context, then follows the skill's steps.

You sign in with your Unilytics account. No API key is stored in the plugin.

## When should I use the plugin instead of a connector?

Use it when your company's Claude doesn't let you add a custom connector, but lets you add plugins (Customize → Plugins). If you can add a custom connector, [Connect Claude to Unilytics](https://unilytics.ai/docs/connect/) works the same.

## How do I install it in Claude (web or desktop app)?

Either upload the file:

1. Download **[unilytics-plugin.zip](https://github.com/TeamUnilytics/unilytics-mcp/releases/download/plugin-v1.0.0/unilytics-plugin.zip)**.
2. In Claude, open **Customize → Plugins**, click **Add**, then **Upload plugin**, and choose the file.

Or add our marketplace:

1. In Claude, open **Customize → Plugins**, click **Add**, then add a marketplace.
2. Paste `https://github.com/TeamUnilytics/unilytics-mcp` and install **Unilytics**.

Then sign in:

1. Open the Unilytics plugin and go to its **Connectors** tab.
2. Click **Connect** next to Unilytics and sign in with your Unilytics account.
3. Start a new chat and ask: *"List my Unilytics projects."*

## How do I install it in Claude Code?

```
/plugin marketplace add TeamUnilytics/unilytics-mcp
/plugin install unilytics@unilytics
```

Then run `/mcp`, choose `unilytics` and sign in.

## What if I don't see the Plugins option or the Connect button?

Your company's Claude owner controls both. If **Add** doesn't appear under Customize → Plugins, plugins you add yourself are switched off for your organization. If the plugin installs but Unilytics stays "Not added" on its Connectors tab, ask your Claude owner to add the connector `https://mcp.unilytics.ai/mcp` under Organization settings → Connectors.

## What does it cost?

The plugin is free. Tools that use credits work the same as through any other connection, and the skill tells you before a run that calls many of them.
