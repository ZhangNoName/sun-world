FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml poetry.lock README.md ./
COPY src ./src
COPY __init__.py app_instance.py main.py start.sh ./

RUN pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir . \
    && chmod +x ./start.sh

EXPOSE 8000

CMD ["./start.sh"]
