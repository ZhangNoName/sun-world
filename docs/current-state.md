# Current State

Last updated: 2026-05-31

## Server

- Host: Tencent Cloud Lighthouse
- SSH user: lighthouse
- Public IP: 81.70.43.189
- Project path: /home/lighthouse/blog/sun-world
- Primary branch: main

## Services

- Frontend container: my-frontend
- Frontend image: blog-front:latest
- Frontend host port: 8081
- Backend service: uvicorn on port 8000
- Nginx handles HTTPS and proxying.

## Domains

- https://sunworld.site -> frontend container on 127.0.0.1:8081
- https://www.sunworld.site -> frontend container on 127.0.0.1:8081
- https://api.sunworld.site -> backend on 127.0.0.1:8000
- https://shop.sunworld.site -> LingDian web dev server on 127.0.0.1:5173

## Automation

sun-world-auto-deploy.timer checks and deploys main daily at 03:30 CST.

Useful commands:

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## Compliance

The homepage must display the ICP filing number:

```text
豫ICP备2024081960号
```

It must link to:

```text
https://beian.miit.gov.cn/
```

The desktop footer is rendered in packages/blog/src/layout/deskLayout.vue via ZFooter.
The mobile filing link is rendered in packages/blog/src/layout/mobLayout.vue.

## Known Issues

- The production build currently prints TypeScript errors from packages/editor, but Vite still exits successfully. Treat this as technical debt; do not assume type-checking is clean.
- Use docker build --no-cache when you need to be certain static assets have been regenerated.
