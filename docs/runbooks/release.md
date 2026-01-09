## 发布 Runbook（本地 MVP）

### Preflight（发布前）
- [ ] PR Checklist 打勾：`docs/pr_checklist.md`
- [ ] 质量门禁通过（lint/test/build）
- [ ] 如涉及 DB：写清迁移顺序、验证点、回滚步骤

### Deploy（发布）
1) 更新依赖并锁定：`pnpm -C "ai-fashion-studio/server" install --frozen-lockfile`、`pnpm -C "ai-fashion-studio/client" install --frozen-lockfile`
2) 构建：
   - `pnpm -C "ai-fashion-studio/server" build`
   - `pnpm -C "ai-fashion-studio/client" build`
3) 启动（按项目脚本/文档执行）

### Post-deploy validation（发布后 15 分钟）
- [ ] P0 冒烟：创建任务 → 生成计划 → 出图一张 → 质检 → 导出
- [ ] 检查错误日志：关键错误可定位（request_id + 错误摘要）

### Rollback（回滚）
1) 回滚到上一个可用版本（代码/构建产物）
2) 如执行了迁移：按迁移回滚方案处理（优先“可向前修复”，必要时回滚）

