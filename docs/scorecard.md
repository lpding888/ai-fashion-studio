## Golden Path Scorecard（本项目）

> 用于快速判断“是否走在铺好的路上”。建议每次重大版本/季度复盘打一次分。

### 1) Constraints / Guardrails
- [ ] 有 `constraints.yaml`
- [ ] 偏离护栏的变更都有 ADR（`docs/adr/`）

### 2) Contract-first
- [ ] `docs/Contracts.md` 与实现保持一致（字段/状态/输出结构）
- [ ] API 边界做了 Zod 校验（尤其是 Brain 输出 JSON）

### 3) Quality Gates
- [ ] CI 有 lint/test/build（或等价）
- [ ] 门禁失败会阻断合并（不允许“先合再修”）

### 4) Release & Ops
- [ ] 有发布/回滚 runbook（`docs/runbooks/release.md`）
- [ ] 有备份与恢复步骤（`docs/runbooks/backup_restore.md`）
- [ ] 有事故处理/复盘模板（`docs/runbooks/incident.md` + `docs/runbooks/postmortem_template.md`）

### 5) Observability
- [ ] 关键日志字段满足 request_id/latency/route/method/status_code
- [ ] 失败可定位（错误码/外部 API 响应摘要/调用阶段）

