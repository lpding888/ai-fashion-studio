# 执行计划（按 Gemini 调用方式重新对齐）

## 0) 你这次新增的关键约束
- 设置页必须能填：`Base URL`（网关）+ `API Key`
- **模型配置**（新加）：
  - **大脑（Brain）**：默认 `gemini-2.0-flash-exp`（负责看图策划、写 Prompt）
  - **画师（Painter）**：指定 `gemini-3-pro-image-preview`（负责高保真生图）
- 参考图数量：**总计最多 14 张**（衣服图 + face_ref）
- 单张图片不做大小限制（工程上用“磁盘直写上传”避免内存爆）
- 输出清晰度：`1K/2K/4K`

## 1) Gemini 调用方式（工作台对齐）

### 1.1 大脑（Brain）：Planner
- **模型**：`gemini-2.0-flash-exp` (或 `gemini-1.5-pro`)
- **职责**：看衣服图、分析细节、生成结构化 Plan JSON。
- **输入**：`System Prompt` + `User Prompt` (含衣服图)
- **输出**：`JSON` (Plan)

### 1.2 画师（Painter）：Render
- **模型**：`gemini-3-pro-image-preview`
- **职责**：根据 Prompt 和参考图生成最终 Shot。
- **Endpoint**：`{BaseUrl}/v1beta/models/gemini-3-pro-image-preview:generateContent`
- **Body**：
  - `contents`: `[{ role:"user", parts:[ ...images..., {text:"..."} ] }]`
  - `generationConfig`：
    - `responseModalities`: `["IMAGE"]` (显式指定)
    - `imageConfig`:
      - `imageSize`: `"2K"` or `"4K"`
    - `safetySettings`: 建议放宽以便生成多样化人像

### 1.3 鉴权差异（工作台已兼容）
- 如果 Base URL 是 `generativelanguage.googleapis.com`：
  - 走 query `?key=...`
- 其他网关：
  - 默认使用 header `x-goog-api-key: ...`

## 2) 本地工作台执行策略（避免跑偏+可控）

### 2.1 双模协作链路（P0）
1) **计划生成（Planner - Brain）**：
   - 调用 `Gemini 2.0`
   - 看衣服图 → 输出结构化 JSON（image_index/garment_profile/garment_lock/shots[]/prompt_en…）
2) **逐张生图（Render - Painter）**：
   - 调用 `Gemini 3 Pro`
   - 提取 Plan 中的 `prompt_en` + 原始参考图 → 生成高质量图像
   - 每个 Shot 单独调用一次（稳定、可重试）
3) **人工质检 + 自然语言修复（Fix Loop）**：
   - **User**：直接用中文说“把哪改一下”（例如：“领口太大了，改小点”）。
   - **Brain**：接收中文反馈，结合原图上下文，翻译并生成 Gemini 3 Pro 专用的英文指令（`fix_prompt_en`）。
   - **Painter**：执行修复，确保只改指令提到的部分，其他保持原样。

### 2.2 为什么不“一次出 4 张”
- 文档层面：模型不保证严格按你要求的“张数”输出
- 工程层面：逐张更容易定位错误、复跑成本更低

## 3) 交付与验收（你点什么看到什么）
- 设置页能填 Base URL + API Key（不懂代码也能用）
- 新建任务：参考图总数超过 14 会提示并阻止提交
- 出图：逐张生成，每张都有版本
- 质检：通过/需要修复；修复包含“生成修复方案→确认→执行修复”
- 导出 ZIP：包含 `refs/`、`shots/`、`diffs/`、`task.json`、`plan.json`

## 4) 风险与建议（不改变你要求，但要你知情）
- “不做大小限制”在本地可能导致磁盘被占满；建议你后续加一个“磁盘占用提示/一键清理”
- 高保真通常 5 张参考图以内更稳；14 张是上限，不代表质量最好

