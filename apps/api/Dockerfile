FROM python:3.12-slim AS requirements

WORKDIR /app

COPY pyproject.toml poetry.lock ./

RUN pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir poetry==2.2.1 poetry-plugin-export \
    && poetry export --only main --format requirements.txt --without-hashes --output requirements.txt

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=requirements /app/requirements.txt ./requirements.txt

RUN sed -i \
        -e 's|http://deb.debian.org/debian|https://mirrors.cloud.tencent.com/debian|g' \
        -e 's|http://deb.debian.org/debian-security|https://mirrors.cloud.tencent.com/debian-security|g' \
        /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY README.md ./
COPY src ./src
COPY __init__.py app_instance.py main.py start.sh ./

RUN chmod +x ./start.sh

EXPOSE 8000

CMD ["./start.sh"]
