# ExecPlan：公网部署（Docker）+ 邀请码注册 + 任务草稿鉴权

## 1) Goal（plain language）
- 在腾讯云公网环境以 Docker 方式部署 AI Fashion Studio，并补齐最小安全门禁：强 JWT_SECRET、邀请码注册（一次性）、API 鉴权、CORS 白名单、生产可回滚。

## 2) Scope
- In-scope：
  - 邀请码注册：管理员生成一次性邀请码；注册时校验邀请码；可通过环境变量关闭“必须邀请码”的要求。
  - 鉴权与权限：
    - 默认保护所有 API（JWT Guard），仅对白名单接口开放。
    - 任务：允许匿名“创建草稿”，但禁止匿名“开始生成/查询/重试/编辑/删除”；登录后可“认领草稿并开始生成”。
  - 生产化配置：
    - CORS 白名单（`aizhao.icu`/`www.aizhao.icu`/`admin.aizhao.icu`）。
    - 环境变量校验（Zod）。
    - Docker 生产编排：只暴露 80/443（反代 + 自动 HTTPS）。
    - Runbook：部署/更新/回滚/备份的操作步骤。
- Out-of-scope（后续再做）：
  - 全量 Prisma/Postgres 数据迁移（目前以现有 JSON 存储为准，确保数据卷持久化）。
  - CI/CD 自动部署、覆盖率门禁、全站限流策略精细化、日志落库。

## 3) Files to change（最小集合）
- `ai-fashion-studio/server/src/auth/*`：注册逻辑接入邀请码；JWT Secret 强校验；补全 Guard/装饰器。
- `ai-fashion-studio/server/src/db/user-db.service.ts`：新增邀请码存储与一次性消费逻辑。
- `ai-fashion-studio/server/src/task/*`：任务草稿/认领/开始生成；读写权限校验（owner/admin）。
- `ai-fashion-studio/server/src/main.ts`：CORS 白名单与反代场景（trust proxy）。
- `ai-fashion-studio/server/src/app.module.ts`：Env 校验（Zod）。
- `ai-fashion-studio/client/src/app/register/page.tsx`：新增邀请码输入与文案。
- `ai-fashion-studio/client/src/app/login/page.tsx`：登录后自动认领待处理草稿任务（如存在）。
- `ai-fashion-studio/client/src/components/requirement-form.tsx`：匿名创建草稿后的引导（注册/登录后再生成）。
- `ai-fashion-studio/client/src/lib/api.ts`：请求自动携带 JWT（若存在）。
- `ai-fashion-studio/client/src/app/admin/*` + `ai-fashion-studio/client/src/components/layout/admin-sidebar.tsx`：管理员生成邀请码页面入口。
- `ai-fashion-studio/deploy/*`：生产 docker-compose / 反代配置 / env 模板。
- `docs/runbooks/*`：腾讯云部署 Runbook。

## 4) Contract changes（API/字段）
- `POST /api/auth/register`
  - 新增入参：`inviteCode?: string`
  - 行为变更：默认注册成功即 `ACTIVE`（不再走 PENDING 审核）
- 新增（管理员）：
  - `POST /api/auth/admin/invite-codes`：生成一次性邀请码（仅返回一次明文）
  - `GET /api/auth/admin/invite-codes`：查看邀请码列表（不返回明文）
  - `DELETE /api/auth/admin/invite-codes/:id`：撤销邀请码
- 任务（草稿/认领/开始生成）：
  - `POST /api/tasks`：未登录时只创建草稿，返回 `taskId` + `claimToken`
  - `POST /api/tasks/:id/claim`：登录后认领草稿（提交 `claimToken`）
  - `POST /api/tasks/:id/start`：登录后开始生成（触发 Brain/Painter 流程）
  - `GET /api/tasks`、`GET /api/tasks/:id` 等：需要登录；普通用户仅能访问自己任务，管理员可访问全部
- API 边界全部新增/调整为 Zod 校验（最小覆盖上述变更端点）。

## 5) Data changes（JSON/DB）
- 仍使用现有 JSON（数据卷持久化）：
  - `ai-fashion-studio/server/data/users.json`：新增 `inviteCodes` 数组字段（向后兼容，启动时补齐）。
  - `ai-fashion-studio/server/data/db.json`：任务新增 `claimTokenHash?`、`isDraft?` 或等价字段（向后兼容）。
- 回滚：新字段不影响旧逻辑；回滚代码后旧字段会被忽略。

## 6) Implementation steps（小步快跑）
1) 先落合同：Zod schema + DTO/响应结构 + Env schema
2) 后端实现：邀请码存储/消费 + JWT Guard（public 白名单）+ 任务草稿/认领/开始
3) 前端实现：注册邀请码输入 + 草稿引导/登录后认领 + 管理后台生成邀请码
4) 生产编排：Dockerfile + `docker-compose.prod.yml` + 反代 TLS + `.env.production.example`
5) Runbook：部署/更新/回滚/备份/故障排查

## 7) Test plan
- Server unit：
  - 邀请码：生成 → 使用一次 → 二次使用失败 → 撤销失败
  - Guard：public 端点匿名可访问；受保护端点匿名 401
  - 任务：匿名创建草稿不触发生成；认领后才能 start；越权访问 403/404
- Smoke（部署后）：
  - `aizhao.icu` 首页可访问
  - 注册（邀请码）→ 登录 → 创建任务 → 开始生成 → 查看结果
  - 管理员生成邀请码接口可用

## 8) Risks & mitigations
- 风险：邀请码明文泄露
  - 缓解：只在创建时返回一次明文；存储仅保存 hash；后台列表不展示明文
- 风险：匿名上传/草稿被滥用导致资源消耗
  - 缓解：匿名仅草稿不生成；后续可加限流（P1）
- 风险：配置错误导致线上不可用
  - 缓解：Env 校验启动即失败；Runbook 提供回滚与日志定位

## 9) Open questions（do not guess）
- 生产环境是否需要单独的 `admin.aizhao.icu` 登录态（与 `aizhao.icu` 隔离）：默认隔离（不同子域 localStorage/cookie 不共享）。

