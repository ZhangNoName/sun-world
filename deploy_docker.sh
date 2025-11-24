#!/bin/bash

IMAGE_NAME="blog-front"
CONTAINER_NAME="blog-front"

echo "=== 1. 清理悬挂和无用资源（释放空间） ==="
# 清理所有停止的容器、未使用的网络、悬挂镜像和构建缓存
# 注意：这会删除所有未使用的镜像，如果你有其他不部署的镜像，请谨慎使用
# 如果只想删除构建缓存，请使用 docker builder prune
sudo docker system prune -f 

echo "=== 2. 停止并删除旧容器 ==="
# 使用 || true 确保即使容器不存在也不会报错
sudo docker stop "$CONTAINER_NAME" > /dev/null 2>&1 || true
sudo docker rm "$CONTAINER_NAME" > /dev/null 2>&1 || true

echo "=== 3. 重建镜像 ==="
# 使用 --no-cache 确保使用最新代码
sudo docker build --no-cache -t "$IMAGE_NAME" .

if [ $? -ne 0 ]; then
    echo "❌ 镜像构建失败，请检查 Dockerfile。"
    exit 1
fi

echo "=== 4. 运行新容器 ==="
# 运行容器，将容器的80映射到宿主机8080
sudo docker run -d -p 8081:80 --name "$CONTAINER_NAME" "$IMAGE_NAME"

if [ $? -eq 0 ]; then
    echo "✅ 部署成功! 容器名称: $CONTAINER_NAME"
    echo "请访问 http://你的IP地址:8081"
else
    echo "❌ 容器运行失败。请检查端口是否冲突或 Docker 日志。"
fi