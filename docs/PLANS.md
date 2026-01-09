# ExecPlan（计划先行）模板与落地约定

> 目的：让变更“可预期、可回滚、可验证”，避免一口气大改导致返工。

## 何时必须写 ExecPlan
满足任一条件必须写：
- 预计 > 2 小时
- 涉及 DB migration / 鉴权改动 / 影响接口契约
- 重构 > 5 个文件或跨 client/server 联动
- 引入/升级关键依赖、基础设施（DB/队列/缓存/可观测）

## 放哪里
- 新建：`docs/plans/YYYYMMDD-<slug>.md`
- 已有较大计划：可复用 `docs/ExecPlan_LocalMVP.md`（但建议后续统一到 `docs/plans/`）

## 模板

### 1) Goal（plain language）
- 我们要做什么？谁受益？

### 2) Scope
- In-scope：
- Out-of-scope：

### 3) Files to change（最小集合）
- `path/to/file`: change summary

### 4) Contract changes（如涉及 API/字段）
- Zod schemas to add/modify：
- `docs/Contracts.md` 是否需要更新：

### 5) Data changes（如涉及 Prisma/DB）
- Prisma schema changes：
- Migrations：
- Backfill：
- Rollback：

### 6) Implementation steps（小步快跑）
1) contract + skeleton
2) implementation
3) tests
4) observability + docs

### 7) Test plan
- unit：
- integration：
- e2e：
- smoke：

### 8) Risks & mitigations
- Risk：
- Mitigation：

### 9) Open questions（do not guess）
- Q1：
- Q2：

