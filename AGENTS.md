# AGENTS.md

This repository is the source of truth for the Sun World site.

## Project

- Production site: https://sunworld.site
- WWW site: https://www.sunworld.site
- API site: https://api.sunworld.site
- Repository: git@github.com:ZhangNoName/sun-world.git
- Primary branch: main
- Server path: /home/lighthouse/blog/sun-world

## Read First

- Read this file, CLAUDE.md, .ai/README.md, README.md, docs/current-state.md, docs/engineering-conventions.md, and docs/agent-handoff.md before making changes.
- Project-local instructions override the server-level /home/lighthouse/AGENTS.md contract.
- Keep operational decisions, deploy notes, and gotchas in docs/current-state.md or focused docs under docs/.

## Collaboration Contract

- Treat repository files as the long-term context. Do not rely on chat history as the only memory.
- Use main as the deploy branch. Short-lived feature branches are optional for risky work.
- Prefer small, reviewable changes that match the existing code style.
- Do not run destructive Git commands such as git reset --hard or git push --force unless the user explicitly asks for that exact operation.
- If local and remote branches diverge, stop and report instead of merging, rebasing, resetting, or force-pushing automatically.
- Do not commit secrets, API keys, .env values, certificates, private keys, or passwords.
- Before deployment, check git status and verify the build or the narrowest useful command.

## Context Handoff

- Chat context is not the source of truth. Persist context in repository docs.
- Use `.ai/README.md` as the AI workspace entrypoint for plans, sync protocol,
  and server resource policy.
- Use `.ai/protocols/agent-pipeline.md` for subagent, Codex, and Claude Code
  communication and handoff rules.
- Use docs/current-state.md for stable environment, domain, service, and deploy state.
- Use docs/agent-handoff.md as the short active handoff entrypoint. Put branch-specific task state in docs/handoff/branches/ and older completed checkpoints in docs/handoff/archive/.
- Keep `docs/` as the durable project documentation root. If agent task context
  is migrated later, use lowercase `.task/` for task state/plans/protocol relay
  and update all read-order references before moving files.
- Update the relevant handoff file before switching between Codex, Claude Code, local manual work, or a long pause. For feature branches, prefer docs/handoff/branches/<branch-slug>.md and keep docs/agent-handoff.md to links and the latest stable checkpoint.
- When any protocol or agent rule changes, update repository docs first, then
  broadcast the delta to active subagents and include it in the next Claude Code
  / `claude-ds` prompt.
- A handoff update should include: current goal, status, important files touched, commands run, verification result, blockers, and next suggested step.
- Never put secrets, tokens, passwords, private keys, or full env values in any handoff file.

## Build And Deploy

Frontend production is served by Docker container my-frontend on host port 8081.
Nginx proxies sunworld.site and www.sunworld.site to the frontend container.

Manual frontend deploy:

```bash
cd /home/lighthouse/blog/sun-world
docker build --no-cache -t blog-front:latest .
docker rm -f my-frontend || true
docker run -d --restart unless-stopped --name my-frontend -p 8081:80 blog-front:latest
```

Automatic deploy runs daily from systemd and pulls origin/main.

Useful commands:

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## Verification

After frontend changes:

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```

For ICP filing compliance, the homepage footer must show `豫ICP备2024081960号` and link to `https://beian.miit.gov.cn/`.

The desktop footer is rendered in `apps/web/src/layout/deskLayout.vue` via `ZFooter`.
The mobile filing link is rendered in `apps/web/src/layout/mobLayout.vue`.
