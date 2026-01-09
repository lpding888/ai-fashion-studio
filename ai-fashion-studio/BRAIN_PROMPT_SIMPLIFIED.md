# Brain Prompt 简化升级完成

## ✅ 已完成的修改

### 1. 核心模板简化
**文件**: `server/docs/System_Prompt_Brain_v2.0.md`

**修改前（Part 1 - Consistency Instruction）**:
```
Based on the uploaded reference image, silently analyze and maintain 100% consistency:
- Exact garment: white heavyweight cotton t-shirt with visible jersey knit texture, 
  distressed collar with small holes, raw unfinished edges...
- Wardrobe pairing: paired with oversized black cargo pants and chunky sneakers...
- Model: Gen Z Asian male, cool attitude, street aesthetic...
- Facial features, hair, and body proportions must remain identical
```

**修改后（新简化版本）**:
```
THE EXACT GARMENT FROM THE UPLOADED REFERENCE IMAGES must be replicated.
THE EXACT MODEL FROM THE REFERENCE IMAGES must remain identical across all shots.
```

### 2. 原因说明
在 Prompt 中添加了明确的警告：
- ❌ 详细的文字描述会导致 Painter **根据文字生成**，而非**参考图片**
- ✅ 视觉参考比文字描述更准确
- ❌ 过度详细的 Prompt 会导致模型"臆造"不存在的细节

### 3. 示例更新
**Example 1 和 Example 2** 都已更新为新格式：
- ✅ 只有 2 行一致性指令
- ✅ 其余全部是拍摄场景、角度、光线描述
- ❌ 没有任何服装材质、颜色、细节的文字描述

### 4. 重要规则更新
新增规则：
- **Rule 7**: 每个 shot 都必须使用简化的一致性指令
- **Rule 8**: **DO NOT describe garment or model details** - 让视觉参考完成这个工作

## 🧪 测试建议

### 测试步骤
1. **重启后端服务**（加载新的 System Prompt）
2. **上传一张或多张服装图片**
3. **查看 Brain 生成的 `prompt_en`**:
   - ✅ 应该只有 2 行一致性指令
   - ✅ 不应该有详细的服装描述
4. **检查生成的图片**:
   - 是否精确匹配上传的服装？
   - 还是根据 Brain 臆造了不同的服装？

### 对比测试
**场景**: 上传一件白色卫衣（有胸部图案）

**旧版 Prompt 结果**:
```
- Exact garment: white heavyweight cotton t-shirt with jersey knit...
→ Painter 生成：可能是普通白T恤，忽略了图案细节
```

**新版 Prompt 结果**:
```
THE EXACT GARMENT FROM THE UPLOADED REFERENCE IMAGES must be replicated.
→ Painter 生成：应该精确复制上传图片中的卫衣和图案
```

## 📝 技术细节

### Face Reference 处理
- 如果提供了 face reference: "THE EXACT MODEL FROM THE FACE REFERENCE IMAGES"
- 如果未提供: "maintain consistent model appearance across all shots"（不描述具体特征）

### Visual Analysis 和 Styling Plan
这两个部分**仍然是中文详细描述**，因为：
- 它们用于前端展示给用户看
- 它们不会被 Painter 读取
- 详细描述帮助用户理解 Brain 的分析

只有 `prompt_en` 被简化了，因为这是直接发给 Painter 的指令。

## ⚠️ 注意事项

1. **Brain 不会自动加载新 Prompt**
   - 需要重启后端服务
   - 或者在代码中有热重载机制

2. **Image Analysis 功能配合**
   - 新的智能图片标注（之前实现的）会与简化 prompt 配合
   - 例如：告诉 Painter "Image 1 is front view, Image 2 is back view"
   - 这比文字描述更直观

3. **兼容性**
   - 如果某些 Painter 模型需要更详细的指导，可以调整
   - 目前的策略是"最小化文字，最大化视觉参考"
