 #!/bin/bash
 # 部署docker并运行
 sudo docker build --no-cache -t blog-front .
 
 sudo docker run -d -p 80:80 -p 443:443 --name  blog-front blog-front 