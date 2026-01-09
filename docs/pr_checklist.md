## PR Checklist（本项目）

### Product（P0）
- [ ] Top task flow 能端到端跑通（上传 → 计划 → 出图 → 质检/修复 → 导出）
- [ ] 至少 1 条失败路径可复现且可恢复（重试/回退/明确错误）
- [ ] empty/loading/error 状态存在且文案可理解

### Contract（契约优先）
- [ ] `docs/Contracts.md` 已更新（如涉及字段/状态/输出结构）
- [ ] API 边界有 Zod 校验（入参/出参/Brain 输出）
- [ ] 没有用“模糊兼容”吞掉校验失败（应显式报错并可定位）

### Engineering
- [ ] 没有引入重复的 UI/状态管理/HTTP 客户端方案（保持一致）
- [ ] 没有提交 secrets（`.env` / key）
- [ ] 如引入“远程访问/多用户/权限”，必须补 RBAC + 审计（并写 ADR）

### Quality gates
- [ ] `pnpm -C "ai-fashion-studio/server" test` 通过
- [ ] `pnpm -C "ai-fashion-studio/server" build` 通过
- [ ] `pnpm -C "ai-fashion-studio/client" lint` 通过
- [ ] `pnpm -C "ai-fashion-studio/client" build` 通过

> 说明：当前 server 侧存在较多 lint 遗留项，建议在独立清理 PR 中逐步修复后，再将 `lint:check` 纳入强制门禁。

### Ops（本地 MVP 最小集）
- [ ] 关键日志字段齐全（至少 request_id/latency/status_code）
- [ ] 如涉及 DB：迁移计划 + 回滚计划写清楚（见 `docs/runbooks/release.md`）
