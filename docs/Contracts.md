# 字段契约（UI/后端/模型输出对齐）
> 目标：让 UI 画表格、研发落库、模型输出结构一致。
> **双模架构**：
> - **Brain (Planner)**: 默认 `gemini-2.0-flash-exp` (Logic)
> - **Painter (Render)**: 指定 `gemini-3-pro-image-preview` (Visual)

## 1) 状态枚举（P0）

### TaskStatus
- `DRAFT`：已创建但未生成计划
- `PLANNING`：生成计划中
- `PLAN_READY`：计划已生成（可编辑）
- `RENDERING`：出图中（至少有 1 张在生成）
- `RENDER_READY`：全部出图完成（进入质检）
- `DONE`：全部 Shot 通过
- `FAILED`：任务级失败（不可恢复或用户取消）

### ShotStatus
- `NOT_RENDERED`：未生成
- `RENDERING`：生成中
- `RENDERED`：生成成功（待质检）
- `APPROVED`：已通过
- `NEEDS_FIX`：标记需要修复（未执行）
- `FIX_PLANNING`：生成修复方案中
- `FIX_READY`：修复方案已生成（待确认）
- `FIXING`：执行修复中
- `FIXED`：修复成功（待再次质检）
- `FAILED`：该 Shot 失败（可重试）

## 2) 任务输入（UI 表单字段）

### Refs
- `garment_images[]`：衣服参考图（按上传顺序自动编号）
  - `id`：`A|B|C...`
  - `mimeType`：`image/png|image/jpeg|...`
  - `filename`：原文件名
- `face_ref?`：可选头像参考
  - `id`：固定 `face_ref`

### Requirements
- `platform`：默认 `小红书`
- `style_keywords[]`：如 `["潮牌","高街"]`
- `big_scene`：如 `街头`
- `shots_count`：默认 `4`
- `pose_preferences[]?`：可选，用户给的动作偏好
- `constraints`：
  - `no_new_logos`（默认 true）
  - `no_readable_text`（默认 true）
  - `no_qr`（默认 true）
  - `clean_background`（默认 true）
  - `keep_styling_consistent`（默认 true）
- `neg`：`ON|OFF`（默认 `OFF`）
- `output`：
  - `aspect_ratio`：默认 `9:16`
  - `image_size`：`1K|2K|4K`（默认 `2K`）
- `config` (新加):
  - `auth`: `api_key` (统一 Key)
  - `brain_config`: 
    - `endpoint`: `https://api.vectorengine.ai/v1/chat/completions` (OpenAI 兼容)
    - `model`: 默认 `gemini-2.0-flash-exp`
  - `painter_config`: 
    - `endpoint`: `https://api.vectorengine.ai/v1beta/models/gemini-3-pro-image-preview:generateContent` (Google Native)
    - `model`: 指定 `gemini-3-pro-image-preview`

## 3) 生成计划输出（Plan JSON）

> UI 的 `计划` Tab 主要渲染：`garment_profile`、`garment_lock[]`、`shots[]`。

### Plan 根对象
- `image_index[]`：参考图编号表
- `garment_profile`：服装识别档案（字段覆盖，不确定写“无法从图片确认”）
- `garment_lock[]`：锁定点（可编辑，数组顺序可调整）
- `easy_errors[]`：易错点（可选）
- `styling_plan`：统一搭配方案
- `scene_flow[]`：场景动线（微区域串联）
- `action_flow[]`：动作递进（起点→终点）
- `shots[]`：Shot List（N 行）
- `self_check.unknowns[]`：无法确认项汇总

### Shot（每行必须包含）
- `shot_id`：`01..N`
- `micro_area`：微区域
- `pose`：动作/姿势
- `selling_point`：动作目的（卖点）
- `avoid_blocking`：避遮挡要点
- `camera`：摄影语言（机位/焦段/构图/景深）
- `light`：灯光色调（统一）
- `output_spec`：输出（如 `9:16, 1080x1920, PNG`）
- `prompt_en`：英文 Prompt（固定骨架，可复制）
- `lock_overrides[]?`：本行覆盖锁定点（建议 1~3 条）

## 4) 质检对比输出（Diff JSON）

> 仅在用户点击【需要修复】后触发，用于生成“修复方案草稿”。

### Diff 根对象
- `summary`：一句话总结（可选）
- `diff_items[]`：逐条差异
  - `lock_item`：对应的锁定点原文（或其 ID）
  - `status`：`MATCH|MISMATCH|UNKNOWN`
  - `ref_observation`：参考图可见事实（简短）
  - `gen_observation`：生成图观察到的差异（简短）
  - `recommend_fix`：建议怎么改（简短）
- `fix_prompt_en`：英文修复指令草稿（强调“其它保持不变，只改衣服”）

## 5) 修复执行输入（Fix Request）
- `base_image_version_id`：当前要修的版本（例如 `shot01:v1`）
- `refs`：同任务 refs（至少包含衣服关键图，可选 face_ref）
- `user_feedback`：用户输入的中文修改意见（例如 "把领口改小"）
- `fix_prompt_en`：Brain 思考后生成的最终英文指令（用户可编辑）

## 6) 约束（产品层）
- 总参考图（衣服图 + face_ref）上限：`14`（与模型输入限制对齐）
- `garment_profile` 里看不见的必须填 `无法从图片确认`，禁止模型猜
- 修复流程默认最多 2 次；超出提示“建议重生本张”
- 每次生成/修复必须落一条记录：`model_id + inputs + prompt + config + output + timestamp`
