---
name: sun-world-git-push
description: Commit and push changes in the Sun World repository using macOS Apple Git. Use when the user asks to commit, push, sync, or publish Sun World changes to GitHub.
---

# Sun World Git 提交与推送

在 Sun World 仓库中提交或推送时，显式使用 macOS 原生 Git
`/usr/bin/git`，不要依赖 `PATH` 解析 Git，也不要使用 `gh` 代替 Git 提交
或推送。

当前工作区的 GitHub remote 是 `github`；`origin` 指向 Lighthouse 工作区，
不能用于推送 GitHub。执行前仍应使用 `/usr/bin/git remote -v` 核对 URL，
目标必须是 `github.com:ZhangNoName/sun-world.git` 或对应 HTTPS 地址。

## 提交

1. 用以下命令检查分支、修改范围和暂存内容：

   ```sh
   /usr/bin/git status --short --branch
   /usr/bin/git diff
   /usr/bin/git diff --cached
   ```

2. 确认没有意外的密钥、环境变量、证书或无关文件。
3. 使用 `/usr/bin/git add <明确的文件路径>` 暂存目标文件，不使用宽泛路径
   顺带提交无关修改。
4. 除非用户指定其他语言或提交信息，使用中文 commit message：

   ```sh
   /usr/bin/git commit -m '<中文提交信息>'
   ```

用户只要求提交时，到此停止，不自动推送。

## 推送到 GitHub

只有用户明确要求推送、同步或发布后才执行推送。先运行：

```sh
/usr/bin/git fetch --prune github
/usr/bin/git status --short --branch
```

确认当前分支没有与目标远端分叉。推送当前同名分支：

```sh
/usr/bin/git push --no-verify -u github HEAD
```

只有用户明确要求更新 GitHub `main`，且已确认可以 fast-forward 时，使用：

```sh
/usr/bin/git push --no-verify github HEAD:main
```

- `--no-verify` 只跳过本次推送的本机全局 `pre-push` 钩子，不修改钩子
  配置。
- 如果 GitHub remote 使用 HTTPS，并出现 Apple Git 经代理访问 GitHub 的
  TLS 连接错误，可仅对本次命令增加 `-c http.version=HTTP/1.1`。当前 SSH
  remote 不需要这个选项。
- 不使用 `git reset --hard`、`git push --force` 或 `git push --force-with-lease`。
- 如果远端拒绝推送、分支发生分叉或命令仍失败，停止并汇报；不自动
  merge、rebase、reset 或强推。

## 核验

推送完成后运行：

```sh
/usr/bin/git status --short --branch
/usr/bin/git rev-parse HEAD
/usr/bin/git ls-remote --heads github 'refs/heads/<目标分支>'
```

将 `<目标分支>` 替换为实际分支名，确认远端 SHA 与本地 `HEAD` 一致，并
汇报 GitHub remote、目标分支和提交哈希。
