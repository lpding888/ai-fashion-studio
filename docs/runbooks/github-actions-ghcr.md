# Runbook：GitHub Actions 直连服务器部署（SCP）

> 目标：使用 GitHub Actions 在 x86 Runner 构建镜像，打包为 tar 并 SCP 到服务器，自动加载并滚动更新。

## 1) 前置条件
- GitHub 仓库：`lpding888/ai-fashion-studio`
- 生产服务器可被 GitHub Actions 通过 SSH 访问
- 生产服务器已安装 Docker + Docker Compose plugin

## 2) GitHub Actions Secrets（必须）
在 GitHub 仓库设置：
- Settings → Secrets and variables → Actions → New repository secret
  - `SSH_HOST`：服务器 IP（如 `43.139.187.166`）
  - `SSH_USER`：`root`
  - `SSH_PORT`：`22`
  - `SSH_PRIVATE_KEY`：服务器登录私钥（完整内容）
  - `SERVER_PATH`：`/opt/ai-fashion-studio`

## 3) CI 触发
- 推送到 `master` 分支会触发构建+部署
- 也可以在 GitHub Actions 里手动触发 workflow

## 4) 部署流程
1) GitHub Actions 构建 `linux/amd64` 镜像（server/client/migrator）
2) `docker save` 打包为 `ai-fashion-images.tar`
3) SCP 上传到服务器 `SERVER_PATH`
4) 服务器 `docker load` → 迁移 → `compose up -d`

## 5) 回滚
`/opt/ai-fashion-studio/rollback/` 下会生成回滚记录，按其中命令执行即可。
