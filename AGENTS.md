# AGENTS.md（代理家规 / Working Agreements）

> 目标：把“少翻车的工程底线”固化在仓库里，方便多人/多代理长期协作。

## 0) 语言与输出
- 默认使用：**简体中文**
- 设计与代码原则：SOLID / KISS / DRY / YAGNI（不做未来特性预留）

## 1) Golden Path（必须遵循）
- 目录边界固定：
  - `ai-fashion-studio/client/`：Next.js（UI）
  - `ai-fashion-studio/server/`：NestJS（API + AI 编排 + Prisma）
  - `docs/`：需求/UX/契约/计划/治理文档
- “类型即法律”：对外 API（HTTP）入参/出参必须做 **Zod 校验**（参考 `docs/Dev_Rules.md`）
- 约束护栏：见 `constraints.yaml`；偏离 `forbidden_by_default` 必须写 ADR（`docs/adr/`）

## 2) Plan-first（计划先行）
- 满足任一条件必须先写 ExecPlan（模板见 `docs/PLANS.md`）：
  - 预计 > 2 小时
  - 涉及 DB migration / 鉴权改动 / 影响接口契约
  - 重构 > 5 个文件或跨 client/server 联动
  - 引入/升级关键依赖、基础设施（DB/队列/缓存/可观测）

## 3) ⚠️ 危险操作确认机制（必须）
执行以下操作前必须获得**明确确认**（需要用户回复“是/确认/继续”）：
- 文件系统：删除文件/目录、批量修改、移动系统文件
- Git：`git commit`、`git push`、`git reset --hard`
- 系统配置：环境变量/权限变更
- 数据操作：数据库删除、结构变更、批量更新
- 网络请求：发送敏感数据、调用生产环境 API
- 包管理：全局安装/卸载、更新核心依赖

确认格式：
```
⚠️ 危险操作检测！
操作类型：[具体操作]
影响范围：[详细说明]
风险评估：[潜在后果]

请确认是否继续？[需要明确的"是"、"确认"、"继续"]
```

## 4) 命令执行标准
- 路径：始终用双引号包裹；尽量使用 `/` 作为分隔符
- 搜索：优先 `rg`（ripgrep）

## 5) PR 前必须通过的命令（本地/CI 一致）
- Server：
  - `pnpm -C "ai-fashion-studio/server" test`
  - `pnpm -C "ai-fashion-studio/server" build`
- Client：
  - `pnpm -C "ai-fashion-studio/client" lint`
  - `pnpm -C "ai-fashion-studio/client" build`

> 说明：Server 的 `lint:check` 当前并非全量绿（遗留项较多），建议先用 `pnpm -C "ai-fashion-studio/server" lint` 做自动修复；待清理完成后再把 `lint:check` 纳入强门禁。
