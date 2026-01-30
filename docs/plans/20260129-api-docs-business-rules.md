# ExecPlan: Core API docs + business rules

## 1) Goal (plain language)
- Provide usable Swagger docs and written business rules to reduce code reading for FE/BE.

## 2) Scope
- In-scope:
  - Enable Swagger (dev/local only)
  - Phase 1: Task / Credit / Auth controller annotations
  - Phase 2: add tags + operations for common controllers (presets, prompts, model config, assets, admin)
  - Business rules docs (task / billing / model-config)
  - De-duplicate FE constraints (no value changes)
- Out-of-scope:
  - Zod -> OpenAPI generation
  - Other controllers
  - Runtime logic changes

## 3) Files to change (minimal set)
- `ai-fashion-studio/server/package.json`: add Swagger deps
- `ai-fashion-studio/server/src/main.ts`: Swagger bootstrap + toggle
- `ai-fashion-studio/server/src/task/task.controller.ts`: annotations + constants
- `ai-fashion-studio/server/src/task/fix.controller.ts`: annotations
- `ai-fashion-studio/server/src/task/export.controller.ts`: annotations
- `ai-fashion-studio/server/src/task/hero-storyboard.controller.ts`: annotations
- `ai-fashion-studio/server/src/auth/auth.controller.ts`: annotations
- `ai-fashion-studio/server/src/credit/credit.controller.ts`: annotations
- `ai-fashion-studio/server/src/admin-log/admin-log.controller.ts`: annotations
- `ai-fashion-studio/server/src/admin-analytics/admin-analytics.controller.ts`: annotations
- `ai-fashion-studio/server/src/brain-routing/brain-routing.controller.ts`: annotations
- `ai-fashion-studio/server/src/brain-prompt/brain-prompt.controller.ts`: annotations
- `ai-fashion-studio/server/src/model-profile/model-profile.controller.ts`: annotations
- `ai-fashion-studio/server/src/direct-prompt/direct-prompt.controller.ts`: annotations
- `ai-fashion-studio/server/src/learn-prompt/learn-prompt.controller.ts`: annotations
- `ai-fashion-studio/server/src/workflow-prompt/workflow-prompt.controller.ts`: annotations
- `ai-fashion-studio/server/src/mcp/mcp.controller.ts`: annotations
- `ai-fashion-studio/server/src/face-preset/face-preset.controller.ts`: annotations
- `ai-fashion-studio/server/src/pose-preset/pose-preset.controller.ts`: annotations
- `ai-fashion-studio/server/src/style-preset/style-preset.controller.ts`: annotations
- `ai-fashion-studio/server/src/preset-meta/preset-meta.controller.ts`: annotations
- `ai-fashion-studio/server/src/preset-collection/preset-collection.controller.ts`: annotations
- `ai-fashion-studio/server/src/prompt-snippet/prompt-snippet.controller.ts`: annotations
- `ai-fashion-studio/server/src/prompt-optimizer/prompt-optimizer.controller.ts`: annotations
- `ai-fashion-studio/server/src/prompt-optimizer/prompt-optimizer.admin.controller.ts`: annotations
- `ai-fashion-studio/server/src/user-asset/user-asset.controller.ts`: annotations
- `ai-fashion-studio/server/src/cos/cos.controller.ts`: annotations
- `ai-fashion-studio/client/src/config/task-constraints.ts`: new FE constants
- `ai-fashion-studio/client/src/components/requirement-form.tsx`: reuse constants
- `ai-fashion-studio/client/src/app/(user)/batch/_components/types.ts`: reuse constants
- `docs/business-rules/task.md`: new
- `docs/business-rules/billing.md`: new
- `docs/business-rules/model-config.md`: new
- `ai-fashion-studio/README.md`: docs entry

## 4) Contract changes (API/fields)
- Zod schemas to add/modify: none (Swagger only)
- Update `docs/Contracts.md`: no

## 5) Data changes (Prisma/DB)
- Prisma schema changes: none
- Migrations: none
- Backfill: none
- Rollback: none

## 6) Implementation steps
1) Add Swagger deps and main.ts toggle
2) Annotate controllers (Phase 1 + Phase 2)
3) Unify FE constants usage
4) Add business rules docs and README entry

## 7) Test plan
- server: `pnpm -C "ai-fashion-studio/server" build`
- client: `pnpm -C "ai-fashion-studio/client" lint`
- smoke: start server with `ENABLE_SWAGGER=true`, open `/api-docs`

## 8) Risks & mitigations
- Risk: Swagger annotations drift from actual body
  - Mitigation: doc notes "Zod validation is source of truth"
- Risk: FE constants drift from BE
  - Mitigation: centralized constants + PR review + docs

## 9) Open questions (do not guess)
- Phase 2 order: Billing or ModelProfile first?
