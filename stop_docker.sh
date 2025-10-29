#!/bin/bash
# 停止docker并删除，注意stop后面的name，不是images的名称，在运行的时候可以设置name，也可以使用sudo docker images ps 查看
sudo docker stop blog-front

sudo docker rm blog-front