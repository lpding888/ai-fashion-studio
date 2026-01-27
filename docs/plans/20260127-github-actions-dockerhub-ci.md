# ExecPlan - GitHub Actions + GHCR CI/CD

## 1) Goal（plain language）
- 用 GitHub Actions 在 x86 Runner 上构建镜像并推送到 GHCR，让生产服务器只负责拉取镜像与重启服务。

## 2) Scope
- In-scope：
  - 新增 GitHub Actions workflow（构建/推送 client/server/migrator 镜像到 GHCR）
  - 新增部署脚本（服务器侧拉取镜像 + 迁移 + compose up）
  - 文档说明（Secrets 配置与部署流程）
- Out-of-scope：
  - 业务代码改动
  - 数据库结构调整
  - 生产域名/反代规则修改

## 3) Files to change（最小集合）
- `.github/workflows/ci-ghcr.yml`: CI 构建/推送镜像
- `ai-fashion-studio/deploy/`: 复用现有 compose/env/caddy
- `docs/runbooks/`: 增加 CI/CD 与部署步骤说明

## 4) Contract changes（如涉及 API/字段）
- Zod schemas to add/modify：无
- `docs/Contracts.md` 是否需要更新：否

## 5) Data changes（如涉及 Prisma/DB）
- Prisma schema changes：无
- Migrations：无
- Backfill：无
- Rollback：只回滚镜像标签/服务重启

## 6) Implementation steps（小步快跑）
1) 新增 GitHub Actions workflow，使用 buildx 构建 linux/amd64 镜像并推送 GHCR。
2) 增加部署脚本（服务器拉取镜像、运行 migrate、compose up -d）。
3) 更新文档：GHCR 权限/登录、部署流程、回滚指引。

## 7) Test plan
- unit：不新增
- integration：不新增
- e2e：不新增
- smoke：部署后访问首页与 /api/health

## 8) Risks & mitigations
- Risk：镜像构建或推送失败
  - Mitigation：CI 日志 + 手动重试
- Risk：迁移失败导致服务不可用
  - Mitigation：先备份镜像 tag，失败后回滚
- Risk：Secrets 配置错误
  - Mitigation：在文档中给出最小检查清单

## 9) Open questions（do not guess）
- Q1：GitHub 仓库 owner 是否为 lpding888？
- Q2：镜像命名是否固定为 ai-fashion-client/server/migrator？
- Q3：部署时使用 root 还是 ubuntu 用户？
