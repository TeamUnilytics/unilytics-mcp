---
name: use-unilytics
description: Start any SEO, AEO, content or client task from the user's saved Unilytics skills and their client's context. Use when the user mentions Unilytics, a client or project, their skills, Brand Context, the Knowledge Base, or asks for keyword research, a site audit, a content brief, AI visibility or competitor work.
---

# Use Unilytics

The Unilytics connector holds the user's own skills (their step-by-step methods), each client's context, and the research tools those skills call. Work from them instead of from general knowledge.

## Before the first tool call

If no Unilytics tools are available, the connector isn't connected yet. Tell the user:
"Open the Unilytics plugin, go to its Connectors tab and click Connect, then sign in with your Unilytics account." In Claude Code, the command is `/mcp`, then choose `unilytics` and sign in. Stop until it's connected.

## Steps

1. **Find the client.** Call `list_projects`. If the user named a client, pick the matching project. If they didn't and there is more than one project, ask which one, listing the project names. Keep its `project_id` for every call below.
2. **Find the skill.** Call `find_skill` with the user's task in their words and the `project_id`. Take the best match. If none fits well, say so and ask whether to go ahead without a skill.
3. **Read the skill.** Call `get_skill` with its `skill_id`. Read any file it points to with `read_skill_file`. Follow the skill's steps in order: they are the user's method, so don't swap in your own.
4. **Load the client's context.** Call `get_project_context` for the Brand Context (voice, audience, writing rules) and the published Context records. Use them in everything you write. Search the client's documents with `kb_search` when the skill or the task needs them.
5. **Do the work** with the tools the skill names. Some tools use credits: say which ones before a run that calls many of them, and check `get_credit_balance` when unsure.
6. **Save what you learned only as drafts.** New facts about the client go in through `propose_context_record` or `propose_brand_kit`, with their sources. The user publishes them in the Unilytics app.

## When the user just says "list my projects" or "what can you do"

Call `list_projects` and show the names. Then offer three things to try, based on `list_skills`: one skill by name, a client's Brand Context, and a search in the Knowledge Base.

## Limits

- Unilytics doesn't serve Google Search Console or GA4 data. Use the user's own connector for those.
- Built-in and Unilytics skills are read-only. To change one, make a copy with `create_skill` first.
