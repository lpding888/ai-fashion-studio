# Gemini 3 模型能力与 API 调用格式（项目约定）

> 目的：把本项目当前使用的两个模型 `gemini-3-pro-preview`（大脑/规划）与 `gemini-3-pro-image-preview`（生图）在能力边界、输入输出模态、以及 API 调用格式上一次性说清楚，避免“写代码前没对齐模型能力/接口格式”的沟通成本。

## 1. 模型：`gemini-3-pro-preview`（Gemini 3 Pro Preview）

### 1.1 能力与边界（来自官方 Gemini API 文档）

- **模型定位**：Gemini 3 系列的 Pro 预览版本（偏推理/规划/工具调用）。
- **输入/输出模态**：
  - Inputs：Text, Image, Video, Audio, PDF
  - Output：Text
- **上下文与输出**：
  - Input token limit：1,048,576
  - Output token limit：65,536
- **能力开关（Capabilities）**：
  - Thinking：Supported（Gemini 3 系列默认动态思考；可用 `thinking_level` 控制“最大思考深度”）
  - Structured outputs：Supported
  - Function calling：Supported
  - Search grounding：Supported
  - File search：Supported
  - URL context：Supported
  - Image generation：Not supported
- **版本**：Preview：`gemini-3-pro-preview`
- **Knowledge cutoff**：January 2025
- **补充（Gemini 3 开发者指南）**：
  - “no free tier for `gemini-3-pro-preview`”（仅 Flash Preview 有 free tier）
  - OpenAI compatibility：`reasoning_effort` 映射到 Gemini 的 `thinking_level`

参考：
- Gemini 3 Developer Guide：`https://ai.google.dev/gemini-api/docs/gemini-3`
- Gemini models（包含 `gemini-3-pro-preview` 明细表）：`https://ai.google.dev/gemini-api/docs/models`
- OpenAI compatibility：`https://ai.google.dev/gemini-api/docs/openai`

### 1.2 Gemini 3 的 Thinking Level（关键参数）

官方给出的结论（Gemini 3 Developer Guide）：

- `thinking_level` 用于控制模型“最大内部推理深度”（影响延迟与成本）。
- **默认**：不传时为 `high`。
- **Gemini 3 Pro** 支持：`low`、`high`（不支持 `minimal`/`medium`）。
- **Gemini 3 Flash** 额外支持：`minimal`、`medium`。

参考：`https://ai.google.dev/gemini-api/docs/gemini-3#thinking_level`

### 1.3 推荐用途（本项目语境）

- 分镜导演规划（动作/机位/遮挡禁区/连续性约束）
- 生成“手账摘要/变化量 delta/prompt_exec”等可解释产物
- 不负责直接出图（禁止把它当 Painter）

## 2. 模型：`gemini-3-pro-image-preview`（Gemini 3 Pro Image Preview）

### 2.1 能力与边界（来自官方 Gemini API 文档）

- **模型定位**：面向“专业资产生产 + 复杂指令”的生图模型（官方在 Nano Banana 文档里称 “Nano Banana Pro Preview”）。
- **输入/输出模态**：
  - Inputs：Image and Text
  - Output：Image and Text
- **上下文与输出**：
  - Input token limit：65,536
  - Output token limit：32,768
- **能力开关（Capabilities）**：
  - Image generation：Supported
  - Thinking：Supported（默认会有“构图/方案”式的思考过程）
  - Search grounding：Supported
  - Structured outputs：Supported
  - Caching：Not supported
  - Function calling：Not supported
- **版本**：Preview：`gemini-3-pro-image-preview`
- **Latest update**：November 2025
- **Knowledge cutoff**：January 2025

参考：
- Gemini models（`gemini-3-pro-image-preview` 明细表）：`https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3-pro-image-preview`
- Nano Banana image generation（讲明“Pro Image Preview 的定位与 4K 输出”）：`https://ai.google.dev/gemini-api/docs/image-generation`

### 2.2 推荐用途（本项目语境）

- Hero 母版（Round 0）
- 多轮迭代出分镜关键帧（Round 1..N）
- 每轮可要求返回 `TEXT+IMAGE`：同时输出“图 + 手账（全量 Shoot Log）”

## 3. Gemini API（REST）调用格式：`generateContent`

### 3.1 基本 Endpoint

官方示例使用：

- `POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`
- 认证：`x-goog-api-key: $GEMINI_API_KEY`

本项目由于使用中转网关（如 VectorEngine/OneAPI），会把 `baseURL` 替换为后台配置的网关地址，并在部分实现里使用 `?key=` 方式传入 key。

### 3.2 `gemini-3-pro-preview`（文本输出）最小请求体

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "..." }]
    }
  ],
  "generationConfig": {
    "maxOutputTokens": 8192,
    "temperature": 0.2,
    "thinkingConfig": {
      "thinkingLevel": "low"
    }
  }
}
```

> 备注：`thinkingLevel` 可选 `low`/`high`，不传默认 `high`（见 Gemini 3 Developer Guide）。

### 3.3 传入图片（Vision）示例：`fileData`（推荐：URL 引用）

Gemini API 的 `parts` 支持用 URL 引用图片（示意）：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Describe this image" },
        { "fileData": { "fileUri": "https://<cos-domain>/<key>.jpg", "mimeType": "image/jpeg" } }
      ]
    }
  ]
}
```

> 本项目约束（已落地到 `BrainService` / `PainterService`）：发送给模型的图片 **禁止 inline_data/base64**，必须使用 **COS URL**（或可公开访问的 URL）通过 `fileData.fileUri` 传入。

### 3.4 `gemini-3-pro-image-preview`（生图）请求体关键字段

要拿到图片输出，必须在 `generationConfig` 里声明 `responseModalities`，并可选设置 `imageConfig`：

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Generate a fashion e-commerce hero image..." },
        { "fileData": { "fileUri": "https://<cos-domain>/<key>.jpg", "mimeType": "image/jpeg" } }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "3:4",
      "imageSize": "2K"
    }
  }
}
```

> 备注：官方 Nano Banana 文档示例使用 `responseModalities: ["TEXT","IMAGE"]`（要图也要文字）或只用 `["IMAGE"]`（只要图不要文）。

### 3.5 解析输出里的图片（仍是 base64）

官方示例展示了输出的图片在 `parts[].inline_data` / `parts[].inlineData` 中（不同 SDK/语言字段名略有差异），需要把 `data` base64 解码为图片文件。

参考（Nano Banana 文档示例包含多语言读取 `inline_data/inlineData`）：
- `https://ai.google.dev/gemini-api/docs/image-generation`

## 4. OpenAI Compatibility（`chat.completions`）调用格式

### 4.1 Endpoint 与示例

官方 OpenAI compatibility 文档展示了：
- `client.chat.completions.create(...)`
- `messages` 中可用 `type: "image_url"` 传图片（data URL / base64）
- OpenAI 兼容入口：`https://generativelanguage.googleapis.com/v1beta/openai/`

参考：
- `https://ai.google.dev/gemini-api/docs/openai`

### 4.2 `reasoning_effort` 与 `thinking_level`

Gemini 3 在 OpenAI 兼容层里支持把 `reasoning_effort` 映射到 `thinking_level`（并且 Gemini 3 的 reasoning 不能关闭）。

参考：
- `https://ai.google.dev/gemini-api/docs/openai`
- `https://ai.google.dev/gemini-api/docs/gemini-3`

### 4.3 OpenAI 兼容层的“列出模型”（便于网关联调）

官方示例：

- `GET https://generativelanguage.googleapis.com/v1beta/openai/models`
- Header：`Authorization: Bearer $GEMINI_API_KEY`

参考：`https://ai.google.dev/gemini-api/docs/openai#list_models`

## 5. 本项目当前实现的映射（重要）

### 5.1 运行时配置来源

- Profile 存储与激活：`server/src/model-profile/model-profile.service.ts`
- 解析运行时（把 key 注入到 snapshot）：`server/src/model-profile/model-config-resolver.service.ts`
- 配置字段定义：`server/src/common/model-config.ts`

### 5.2 Brain / Painter 的调用路径（当前代码）

- Brain：
  - 当 `brainModel` 包含 `gemini-3` 时，会走 OpenAI 兼容的 `chat.completions`（见 `server/src/brain/brain.service.ts` 的 `callBrainOpenAI`）
  - 否则走原生 `generateContent`（v1beta）
- Painter：
  - 走原生 `generateContent`（见 `server/src/painter/painter.service.ts`），并在 `generationConfig` 中请求 IMAGE 输出

## 6. 与新“多轮分镜闭环”设计的关系

如果要做你们讨论的闭环：

- `gemini-3-pro-image-preview`：每轮出 `IMAGE+TEXT`（图 + 全量手账）
- 系统：把全量手账压缩成摘要（Continuity Contract + Detail Anchors + Delta）
- `gemini-3-pro-preview`：吃“Hero + 摘要 + 锚点图 + 本轮目标”，输出下一轮 `prompt_exec` + 新手账（给审计/可视化）

这样符合：
- 母本锚点（Hero）强一致性
- 手账摘要控制漂移
- 变化量（delta）控制采样范围
