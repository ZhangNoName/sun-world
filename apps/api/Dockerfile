FROM python:3.12-slim

WORKDIR /src



# 复制 requirements.txt 文件到工作目录
COPY requirements.txt /src/
RUN pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple
RUN pip install --no-cache-dir -r requirements.txt

COPY . /src

EXPOSE 8000

CMD ["./start.sh"]

