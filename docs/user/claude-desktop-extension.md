---
title: Install the Unilytics extension for Claude Desktop
description: Connect the Claude desktop app to Unilytics by double-clicking one file and pasting your API key. No Node, no config file.
status: live
updated: 2026-11-07
---

# Install the Unilytics extension for Claude Desktop

## What do I need?

- The Claude desktop app on a Mac or Windows computer.
- A Unilytics API key. Create one in the Unilytics app under **Settings → API Keys**. It starts with `ulk_live_`.

You don't need to install Node.js, use a terminal or edit a settings file.

## How do I install it?

1. Download **[unilytics.mcpb](https://github.com/TeamUnilytics/unilytics-mcp/releases/latest/download/unilytics.mcpb)**.
2. Double-click the file. Claude opens and shows the Unilytics install screen. You can also drag the file into the Claude window, or go to **Settings → Extensions → Advanced settings → Install Extension**.
3. Click **Install**.
4. Paste your API key when Claude asks for it, then save.
5. Make sure Unilytics is switched on under **Settings → Extensions**.
6. In the chat box, click the settings icon, then **Tool access**, then **Load tools when needed**. Unilytics has many tools, and with "Tools already loaded" Claude leaves them out of the chat.
7. Start a new chat and ask: "List my projects on Unilytics."

The first time Claude uses a Unilytics tool, it asks for your permission. The Connect your AI page in the Unilytics app shows the key as connected after your first call.

## Where is my key stored?

Claude Desktop saves it, encrypted using your computer's secure storage (Keychain on a Mac, the Windows credential protection on Windows). It isn't written into a settings file you edit. If your computer's secure storage isn't available, Claude Desktop can't encrypt it and saves it without encryption, so keep your computer's login protected.

The extension sends your key only to Unilytics, over an encrypted connection.

## Does it cost anything?

The extension is free. Some Unilytics tools use credits from your account, the same as from any other AI you connect.

## Claude says "Invalid or revoked API key." What do I do?

Claude can connect and list the Unilytics tools before it checks your key, so you first see this message when it runs a tool. The key was mistyped, or it has been deleted.

1. Create a new key in the Unilytics app under **Settings → API Keys**.
2. In Claude, open **Settings → Extensions → Unilytics → Configure**.
3. Paste the new key and save.
4. Start a new chat.

## Unilytics won't connect, or Claude says the key is missing or incomplete. What do I do?

The key was probably pasted with a space or a line break in it, or left blank. Follow the same steps as above: create a new key, paste it under **Settings → Extensions → Unilytics → Configure**, save, and start a new chat.

## Claude says Unilytics refused the request or is receiving too many requests. What do I do?

The request did not run, so it didn't use credits. If Claude says there are too many requests, wait a minute and try again. If Claude says the request was refused and it keeps happening, a network proxy or company firewall may be blocking Unilytics. Try another network, or create a new key.

## Claude says the connection to Unilytics failed. Should I run it again?

Check your internet connection first. If the message was about a tool call, the tool may have finished before the connection dropped, and it may have used credits. Check for the result in Unilytics before you run it again.

## How do I update it?

Unilytics tools update by themselves, on our servers, so you rarely need to do anything. Claude Desktop doesn't update extensions installed from a file. If we ask you to update the extension itself, download the file again and double-click it. It replaces the old version.

## My company's Claude won't let me install it

Your organization may allow only approved or signed extensions. This file isn't signed. Ask your Claude admin, or use the [one-link connector](https://unilytics.ai/docs/connect/) instead.

## How do I remove it?

Open **Settings → Extensions → Unilytics** and uninstall it. To stop the key working everywhere, delete it in the Unilytics app under **Settings → API Keys**.

## Is there a way without an API key?

Yes. The [one-link connector](https://unilytics.ai/docs/connect/) signs you in with your Google account. It works in claude.ai and in the desktop app, and there's nothing to install.
