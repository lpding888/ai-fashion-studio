# ExecPlan：将 server 从 gitlink/submodule 改为单仓库目录（Monorepo）

## 1) Goal（plain language）
- 把 `ai-fashion-studio/server` 从当前“gitlink/嵌套仓库”形态转换为主仓库直接追踪的普通目录，确保 `git clone` 后无需 submodule 即可构建与部署；并将当前功能分支合并到 `master` 后推送到远端。

## 2) Scope
- In-scope：
  - 移除主仓库中的 `ai-fashion-studio/server` gitlink 记录。
  - 将 `ai-fashion-studio/server` 的工作区文件以普通文件形式纳入主仓库版本控制（保留 `.gitignore`，确保 `data/`、`uploads/`、`.env*` 等不入库）。
  - 合并 `feature/hero-storyboard-workflow` → `master`。
  - 推送 `master`（以及可选推送 feature 分支）到 `origin`。
- Out-of-scope：
  - 保留 server 子仓库的提交历史（本次只保证“当前工作区内容”进入主仓库；如需保留历史，后续再做 `git subtree`/history rewrite）。
  - 引入 CI/CD 与发布流程规范化。

## 3) Files to change（最小集合）
- `ai-fashion-studio/server/**`: 从“指针”变成“真实文件”（会新增大量文件到主仓库追踪）
- `.gitignore`: 允许提交 `.env*.example`（已有）；确保不误入库 secrets/data
- `docs/plans/20260111-monorepo-convert-server.md`: 本计划文件

## 4) Contract changes（如涉及 API/字段）
- 无（纯仓库结构变更）

## 5) Data changes（如涉及 Prisma/DB）
- 无（不做迁移；仅确保 `ai-fashion-studio/server/data` 仍由 `.gitignore` 忽略并在部署侧做 volume 持久化）

## 6) Implementation steps（小步快跑）
1) 确认 server 工作区干净、且敏感数据已从 Git 移除（已完成）
2) 在主仓库执行 `git rm --cached ai-fashion-studio/server` 移除 gitlink
3) 移除 `ai-fashion-studio/server/.git`（把 server 变成普通目录）
4) `git add ai-fashion-studio/server` 并提交一次 “monorepo conversion” commit
5) `git checkout master`，合并 feature（优先 fast-forward，必要时 merge commit）
6) `git push origin master`（可选同时 push feature 分支以保持远端一致）

## 7) Test plan
- smoke：
  - `git clone` 新目录后，确认 `ai-fashion-studio/server/src` 等文件存在（不再是空目录）
  - 本地执行（可选）：
    - `pnpm -C "ai-fashion-studio/server" test`
    - `pnpm -C "ai-fashion-studio/server" build`
    - `pnpm -C "ai-fashion-studio/client" build`

## 8) Risks & mitigations
- Risk：删除 `ai-fashion-studio/server/.git` 会丢失子仓库历史
  - Mitigation：转换前记录子仓库 HEAD（commit hash）并可选导出 bundle；本次按“用户要求单仓库”最小实现。
- Risk：误把 `data/` / `.env*` / `node_modules` 入库
  - Mitigation：严格依赖 `.gitignore`；提交前检查 `git status` 与 `git diff --cached --stat`
- Risk：推送到远端后默认分支可能仍是旧分支
  - Mitigation：推送 `master` 后在 Gitee 控制台把默认分支切到 `master`

## 9) Open questions（do not guess）
- 远端默认分支是否要切到 `master`？（建议：是）

