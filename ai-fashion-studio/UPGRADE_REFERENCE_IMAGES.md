# 增强参考图指令升级总结

## ✅ 已完成的升级

### 1. Brain 服务升级
**文件**: `server/src/brain/brain.service.ts`
- ✅ 新增 `ImageMetadataSchema` 用于结构化分析每张图片
- ✅ 更新 `BrainPlanSchema` 新增 `image_analysis` 字段
- ✅ Brain 现在会输出：
  ```json
  {
    "image_analysis": [
      {
        "index": 0,
        "view_type": "front",
        "description": "正面视图显示胸部图案",
        "focus_area": "图案细节"
      }
    ]
  }
  ```

### 2. Brain System Prompt 升级
**文件**: `server/docs/System_Prompt_Brain_v2.0.md`
- ✅ 新增 "CRITICAL: Uploaded Image Analysis (First Step)" 部分
- ✅ 要求 Brain 对每张上传图片进行分析：
  - `index`: 图片编号
  - `view_type`: 视角类型 (front/back/side/detail/texture等)
  - `description`: 图片描述
  - `focus_area`: 重点区域（可选）
- ✅ 强调多张图片是**同一件服装**的不同角度

### 3. TaskService 升级  
**文件**: `server/src/task/task.service.ts`

#### 新增方法 `buildReferenceImageInstruction()`
这个方法会：
1. **智能模式**：如果 Brain 提供了 `image_analysis`，会生成详细的图片标注
   ```
   📸 Reference Images Breakdown:
     - Image 1 [正面视图]: 白色卫衣正面显示胸部图案
     - Image 2 [背面视图]: 背部印刷图案
     - Image 3 [细节特写]: 刷毛内衬材质 (Focus: 面料纹理)
   
   ⚠️ CRITICAL: All these images show THE SAME GARMENT
   ```

2. **兜底模式**：如果 Brain 未提供分析，使用通用描述
   ```
   📸 Reference Images:
     - Images 1-3: Multiple views of THE SAME garment
       * Study ALL angles to understand complete design
   ```

3. **保留并增强原有一致性指令**：
   ```
   ABSOLUTE REQUIREMENTS:
   1. Maintain 100% consistency based on reference images
   2. Exact wardrobe: materials, colors, textures must be IDENTICAL
   3. Model features must remain IDENTICAL (if face ref provided)
   4. Do NOT add or remove anything
   5. Do NOT invent new design elements
   ```

#### 更新两个渲染模式
- ✅ Grid Mode: 使用增强指令替换原静态文本
- ✅ Individual Mode: 使用增强指令替换原静态文本
- ✅ **重要**：原有的一致性要求全部保留，只是升级强化

## 🎯 优势

### 升级前（静态指令）
```
Based on the uploaded reference image, silently analyze...
```
- 通用描述
- 未明确多图关系
- 模型可能忽略或误解

### 升级后（智能标注）
```
⚠️ CRITICAL: EXACTLY MATCH THE UPLOADED GARMENT

📸 Reference Images Breakdown:
  - Image 1 [正面视图]: 具体描述
  - Image 2 [背面视图]: 具体描述
  - Image 3 [细节特写]: 具体描述 (Focus: 重点)

⚠️ CRITICAL: All these images show THE SAME GARMENT

ABSOLUTE REQUIREMENTS:
1. Based on reference images, maintain 100% consistency
2. Exact wardrobe must be IDENTICAL
...
```

## 📊 测试方式

**测试场景**：
1. 上传 1 张服装图片 - 验证基础功能
2. 上传 3 张服装图片（正/背/细节）- 验证智能标注
3. 检查生成的图片是否严格匹配参考图

**预期结果**：
- Brain 在返回结果中包含 `image_analysis` 
- Painter 收到的 prompt 包含详细的图片标注
- 生成的图片严格还原上传的服装（而非凭空想象）

## ⚠️ 注意事项

1. **兼容性**：即使 Brain 不返回 `image_analysis`，系统也能正常工作（使用兜底模式）
2. **图片顺序**：假设前N张是服装图，后续是人脸参考图
3. **中文标签**：面向中国团队，使用中文标签更清晰
