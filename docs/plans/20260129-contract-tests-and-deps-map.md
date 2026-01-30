# ExecPlan: Contract Tests + 依赖关系梳理（最小可用版）

## 1) Goal（plain language）
- 为高风险接口补上契约验证与最小测试护栏，梳理服务依赖关系，降低“改了这里坏了那里”的概率。

## 2) Scope
- In-scope：
  - 补齐缺失的 Zod 校验（API 入参边界）。
  - 新增契约级单测（验证 Zod schema 与返回形态）。
  - 增补 TaskService 关键分支测试。
  - 生成服务依赖关系文档。
  - 在 `docs/Contracts.md` 标明契约源与测试位置。
- Out-of-scope：
  - 全量覆盖率目标与强门禁阈值。
  - 大规模服务解耦/重构。
  - 前端自动生成 API Client（需新依赖/脚手架）。

## 3) Files to change（最小集合）
- `ai-fashion-studio/server/src/app.controller.ts`: 增加 Zod 校验。
- `ai-fashion-studio/server/src/brain-prompt/brain-prompt.controller.ts`: 增加 Zod 校验。
- `ai-fashion-studio/server/src/cos/cos.controller.ts`: 增加 Zod 校验。
- `ai-fashion-studio/server/src/mcp/mcp.controller.ts`: 增加 Zod 校验。
- `ai-fashion-studio/server/src/task/fix.controller.ts`: 用 Zod 校验替换手写校验。
- `ai-fashion-studio/server/src/workflow-prompt/workflow-prompt.controller.ts`: 增加 Zod 校验。
- `ai-fashion-studio/server/src/task/task.service.spec.ts`: 新增关键分支单测。
- `ai-fashion-studio/server/src/**/contract*.spec.ts`: 新增契约测试（schema 级）。
- `docs/Contracts.md`: 补充契约来源与测试说明。
- `docs/architecture/service-deps.md`: 服务依赖关系快照。

## 4) Contract changes（如涉及 API/字段）
- Zod schemas to add/modify：
  - App/TestConnection、BrainPrompt、WorkflowPrompt、Cos、Mcp、Fix。
- `docs/Contracts.md` 是否需要更新：需要，新增“API 契约源与测试入口”说明。

## 5) Data changes（如涉及 Prisma/DB）
- Prisma schema changes：无
- Migrations：无
- Backfill：无
- Rollback：无

## 6) Implementation steps（小步快跑）
1) 为 6 个缺失校验的 controller 增加 Zod schema + ZodValidationPipe。
2) 补齐 TaskService 关键分支测试（direct/legacy 分流）。
3) 新增契约测试文件（schema 级验证）。
4) 生成服务依赖关系文档并更新 Contracts 文档说明。

## 7) Test plan
- unit：`pnpm -C "ai-fashion-studio/server" test`
- integration：本次不新增
- e2e：本次不新增
- smoke：无（服务未启动）

## 8) Risks & mitigations
- Risk：Zod 校验过严导致历史客户端请求失败。
  - Mitigation：schema 使用 optional + passthrough，保持兼容。
- Risk：新增测试依赖外部服务。
  - Mitigation：所有新增测试使用 mock，不触发外部调用。

## 9) Open questions（do not guess）
- Q1：是否允许引入 `openapi-typescript` 或同类工具，把 Swagger 输出生成前端类型？（涉及新增依赖）
