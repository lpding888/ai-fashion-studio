# Runbook：GitHub Actions + GHCR 部署（x86 构建）

> 目标：使用 GitHub Actions 构建 linux/amd64 镜像并推送到 GHCR，生产服务器手动拉取并滚动更新。

## 1) 前置条件
- GitHub 仓库：`lpding888/ai-fashion-studio`
- 生产服务器可访问 `ghcr.io`
- 生产服务器已安装 Docker + Docker Compose plugin

## 2) GitHub Actions 权限设置
在 GitHub 仓库设置：
- Settings → Actions → General → Workflow permissions
  - 选择 **Read and write permissions**

## 3) GHCR 权限（服务器拉取）
如果镜像保持私有，需要在服务器执行一次登录：
```
docker login ghcr.io -u <你的GitHub用户名> -p <PAT>
```
- PAT 权限：`read:packages`
- 如果你把 GHCR 镜像设为 public，可跳过登录

## 4) CI 触发
- 推送到 `main` 分支会触发构建
- 也可以在 GitHub Actions 里手动触发 workflow

镜像会推送到：
- `ghcr.io/lpding888/ai-fashion-client:latest`
- `ghcr.io/lpding888/ai-fashion-server:latest`
- `ghcr.io/lpding888/ai-fashion-server-migrator:latest`

## 5) 服务器部署（手动）
在服务器执行：
```
cd /opt/ai-fashion-studio/deploy
./deploy-ghcr.sh
```
可选参数（环境变量）：
- `IMAGE_PREFIX`：默认 `ghcr.io/lpding888`
- `DO_MIGRATE=0`：跳过数据库迁移
- `RESTART_TARGETS`：默认 `server client caddy`

## 6) 回滚
`/opt/ai-fashion-studio/rollback/` 下会生成回滚记录，按其中命令执行即可。
