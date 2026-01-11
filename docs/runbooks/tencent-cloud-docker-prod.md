# Runbook：腾讯云（CVM/轻量）Docker 公网部署（80/443）

> 目标：把 `aizhao.icu / www.aizhao.icu / admin.aizhao.icu / api.aizhao.icu` 以 Docker 方式部署到同一台腾讯云主机，仅暴露 80/443。

## 0) 前置条件
- 域名已备案、A 记录已指向服务器公网 IP：
  - `aizhao.icu`
  - `www.aizhao.icu`
  - `admin.aizhao.icu`
  - `api.aizhao.icu`
- 安全组（入站）仅放行：
  - `22`（SSH）
  - `80`（HTTP，证书签发与跳转）
  - `443`（HTTPS）
- 服务器已安装 Docker + Docker Compose plugin
  - 推荐：腾讯云控制台直接选 “Docker CE” 应用模板（省事）

## 1) 拉取代码
```bash
cd ~
git clone <your_repo_url> project
cd project/ai-fashion-studio
```

## 2) 配置生产环境变量（不要提交到 Git）
```bash
cp "deploy/.env.production.example" "deploy/.env.production"
```

编辑 `deploy/.env.production`，至少完成：
- `JWT_SECRET`：强随机（>= 32 位）
- `SETTINGS_ENCRYPTION_KEY`：用于加密“模型配置”等敏感设置（32 bytes base64）
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`：首次启动用来创建管理员（密码建议 >= 16 位）
- `CORS_ORIGINS`：保持为
  - `https://aizhao.icu,https://www.aizhao.icu,https://admin.aizhao.icu`
- （可选）COS：`TENCENT_SECRET_ID / TENCENT_SECRET_KEY / COS_BUCKET / COS_REGION`

生成 JWT_SECRET 示例：
```bash
openssl rand -base64 48
```

生成 SETTINGS_ENCRYPTION_KEY 示例：
```bash
openssl rand -base64 32
```

## 3) 启动（构建 + 后台运行）
```bash
docker compose -f "deploy/docker-compose.prod.yml" --env-file "deploy/.env.production" up -d --build
```

## 4) 验证
- 站点：
  - `https://aizhao.icu`
  - `https://admin.aizhao.icu`
- API 健康检查：
```bash
curl -sS "https://api.aizhao.icu/api/health"
```

## 5) 初始化流程（邀请码注册）
1) 用 `BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD` 登录 `https://admin.aizhao.icu/admin/login`
2) 进入 `模型配置` 页面：创建 `BRAIN` / `PAINTER` 两个 Profile，并分别设为 Active（否则任务无法开始生成）
3) 进入 `邀请码` 页面生成邀请码（明文只返回一次，复制保存）
4) 用户在 `https://aizhao.icu/register` 使用邀请码注册并登录
5) 未登录用户创建任务会保存草稿；登录后在任务页点击 “开始生成”

## 6) 关闭邀请码（开放注册）
编辑 `deploy/.env.production`：
- `INVITE_CODE_REQUIRED=false`

然后重启服务：
```bash
docker compose -f "deploy/docker-compose.prod.yml" --env-file "deploy/.env.production" up -d
```

## 7) 日常更新（发布）
```bash
cd ~/project/ai-fashion-studio
git pull
docker compose -f "deploy/docker-compose.prod.yml" --env-file "deploy/.env.production" up -d --build
```

## 8) 查看日志
```bash
docker compose -f "deploy/docker-compose.prod.yml" logs -f --tail 200
```

## 9) 回滚（最小）
```bash
docker compose -f "deploy/docker-compose.prod.yml" down
```
> 如需“版本级回滚”，建议在后续引入镜像 tag + 保留上一版本镜像（见 `docs/runbooks/release.md`）。

## 10) 数据持久化与备份（必须）
当前系统关键数据在：
- `ai-fashion-studio/server/data/`（用户、邀请码、任务元数据）
- `ai-fashion-studio/server/uploads/`（上传与生成图片）
- Docker volume：`caddy_data`（证书与 ACME 状态）

最小备份（示例）：
```bash
tar -czf backup_$(date +%F).tgz "server/data" "server/uploads"
```
