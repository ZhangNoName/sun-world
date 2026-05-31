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

- Read this file, CLAUDE.md, README.md, docs/current-state.md, and docs/engineering-conventions.md before making changes.
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

The desktop footer is rendered in `packages/blog/src/layout/deskLayout.vue` via `ZFooter`.
The mobile filing link is rendered in `packages/blog/src/layout/mobLayout.vue`.
