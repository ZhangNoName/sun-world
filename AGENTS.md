# AGENTS.md

This repository is the source of truth for the Sun World site.

## Project

- Production site: https://sunworld.site
- WWW site: https://www.sunworld.site
- API site: https://api.sunworld.site
- Repository: ZhangNoName/sun-world
- Primary branch: main
- Server path: /home/lighthouse/blog/sun-world

## Collaboration Contract

- Treat repository files as the long-term context. Do not rely on chat history as the only memory.
- Read this file, CLAUDE.md, and docs/current-state.md before making changes.
- Keep operational decisions and gotchas in docs/current-state.md or a focused doc under docs/.
- Use main as the deploy branch. Short-lived feature branches are optional for risky work.
- Do not run destructive Git commands such as git reset --hard or force push unless the user explicitly asks.
- Do not commit secrets, API keys, .env values, certificates, or private keys.
- Before deployment, check git status --short and verify the build result.

## Build And Deploy

Frontend production is served by Docker container my-frontend on host port 8081.
Nginx proxies sunworld.site and www.sunworld.site to 127.0.0.1:8081.

Manual frontend deploy:

```bash
cd /home/lighthouse/blog/sun-world
sudo docker build --no-cache -t blog-front:latest .
sudo docker rm -f my-frontend || true
sudo docker run -d --restart unless-stopped -p 8081:80 --name my-frontend blog-front:latest
curl -I https://sunworld.site/
```

Automatic deploy runs daily from systemd and pulls main.

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo tail -100 /var/log/sun-world-auto-deploy.log
sudo systemctl start sun-world-auto-deploy.service
```

## Verification

After frontend changes:

```bash
curl -I https://sunworld.site/
curl -I https://www.sunworld.site/
```

For ICP filing compliance, the homepage footer must show 豫ICP备2024081960号 and link to https://beian.miit.gov.cn/.
