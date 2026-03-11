# WB Calculator 拆分计划

## 1. 目标

当前 `src/App.jsx` 承担了几乎所有职责：

- 图像导入
- TIFF 解析
- ROI 交互
- 画布绘制
- 放大镜
- 定量计算
- 背景扣除
- 饱和检测
- 导出逻辑
- 右侧表单 UI

这会导致几个问题：

- 改一个小功能容易影响其他逻辑
- 定量算法难以单独测试
- 交互问题排查成本高
- 文档和代码语义难以稳定演进

本拆分计划的目标是：

- 把 UI、交互、算法、导出分层
- 保持现有功能不倒退
- 为后续背景模式升级、测试和继续迭代打基础

---

## 2. 拆分原则

### 2.1 先拆职责，不先追求大重写

不要一次性推翻当前实现，而是按职责边界拆：

- 先抽纯函数
- 再拆展示组件
- 最后再抽交互 hook

### 2.2 保持现有行为一致

拆分后应保持以下行为不变：

- ROI 框选与移动
- 固定选框尺寸
- 放大镜显示
- 方向键微调
- TIFF 原始像素优先定量
- 饱和比例与风险等级显示
- CSV 导出

### 2.3 纯计算优先抽离

最先抽走的应该是：

- 不依赖 React 生命周期
- 不依赖 DOM
- 可被单测直接验证

---

## 3. 推荐目标结构

```text
src/
  components/
    BandCard.jsx
    BandList.jsx
    ImageCanvas.jsx
    QuantPanel.jsx
    TopToolbar.jsx
  hooks/
    useCanvasInteraction.js
    useImageDocument.js
    useQuantState.js
  lib/
    export.js
    image-io.js
    quant.js
    rect.js
    saturation.js
  App.jsx
  main.jsx
```

---

## 4. 分模块职责

## 4.1 `src/components/TopToolbar.jsx`

负责：

- 上传按钮
- 重置按钮
- 缩放控制
- 亮度 / 对比度控制
- 顶部“仅影响显示”提示
- 当前图像状态摘要

输入建议：

- `isProcessing`
- `zoom`
- `brightness`
- `contrast`
- `onUpload`
- `onReset`
- `onZoomChange`
- `onBrightnessChange`
- `onContrastChange`

---

## 4.2 `src/components/ImageCanvas.jsx`

负责：

- 主图像 canvas 渲染
- ROI 描边
- Pointer 事件交互
- 放大镜 canvas
- 当前选区的视觉反馈

不负责：

- 定量公式
- 导出逻辑
- 参考 / 背景业务规则

输入建议：

- `image`
- `bands`
- `selectedBandId`
- `bgBandId`
- `refBandId`
- `currentRect`
- `zoom`
- `baseScale`
- `brightness`
- `contrast`
- `interaction`
- `handlers`

---

## 4.3 `src/components/QuantPanel.jsx`

负责：

- 计算模式切换
- 极性模式切换
- 固定尺寸开关
- 自定义目标值滑杆
- TIFF 原始定量提示
- 全局状态提醒（未设背景 / 未设参考）

---

## 4.4 `src/components/BandList.jsx`

负责：

- ROI 列表容器
- 循环渲染所有 `BandCard`
- 空状态提示
- 同步选区面积按钮
- 导出按钮

---

## 4.5 `src/components/BandCard.jsx`

负责单个 ROI 的展示：

- 名称
- 角色
- 净强度
- 饱和像素 / 饱和比例 / 风险等级
- 上样量
- 建议上样量
- 设为基准
- 删除

这会是最适合单独维护和微调的 UI 单元。

---

## 4.6 `src/lib/image-io.js`

负责：

- 普通图片导入
- TIFF 导入
- `UTIF` 解码
- 预览图生成
- 原始 quant 数据构建
- raw 与 preview 方向自动对齐

建议导出：

- `loadImageFile(file)`
- `decodeTiff(buffer)`
- `buildQuantData(ifd, rgba, buffer)`
- `inferPreviewAlignedInvert(...)`

---

## 4.7 `src/lib/quant.js`

负责：

- ROI 积分计算
- 背景扣除
- 净强度计算
- 建议上样量计算

建议导出：

- `calculateIntDen(rect, imageDoc, options)`
- `getNetIntensity(band, backgroundMean, polarity)`
- `getSuggestedLoading(...)`

---

## 4.8 `src/lib/saturation.js`

负责：

- 饱和像素统计
- 饱和比例
- 风险等级判定
- 警告文案

建议导出：

- `getSaturationMetrics(band)`
- `getSaturationRisk(metrics)`
- `getSaturationWarning(...)`

---

## 4.9 `src/lib/rect.js`

负责：

- 坐标归一化
- 边界约束
- 点命中判断
- 控制柄命中判断

建议导出：

- `clampRectToBounds(...)`
- `normalizeRect(...)`
- `hitTestRect(...)`
- `hitTestHandle(...)`

---

## 4.10 `src/lib/export.js`

负责：

- CSV 构建
- 文件名生成
- 未来可扩展 JSON 工程导出

建议导出：

- `buildCsvRows(...)`
- `buildCsvContent(...)`
- `getReportFileName(...)`
- `downloadTextFile(...)`

---

## 4.11 `src/hooks/useCanvasInteraction.js`

负责：

- Pointer down / move / up / cancel
- Pointer capture
- 拖拽状态
- 新建 / 移动 / 缩放交互流
- 键盘微调与删除快捷键

这样能把“复杂交互状态机”从 `App.jsx` 中拿出去。

---

## 4.12 `src/hooks/useImageDocument.js`

负责：

- 当前图像文档状态
- 预览图与 quant 数据状态
- 图像加载后 baseScale 初始化
- 图像切换时的重置逻辑

---

## 5. 推荐拆分顺序

## Phase 1：先抽纯函数

先做这些，不动 UI 外观：

- `lib/rect.js`
- `lib/saturation.js`
- `lib/export.js`
- `lib/quant.js`

目标：

- `App.jsx` 先减掉计算逻辑和工具函数
- 后面更容易写测试

## Phase 2：再拆右侧面板

先拆简单展示组件：

- `BandCard.jsx`
- `BandList.jsx`
- `QuantPanel.jsx`

目标：

- 让 `App.jsx` 变成状态组装层

## Phase 3：最后拆交互和图像层

再拆：

- `ImageCanvas.jsx`
- `useCanvasInteraction.js`
- `useImageDocument.js`

目标：

- 把最复杂的交互逻辑模块化

---

## 6. 推荐实施清单

### 第一批提交

- 新建 `src/lib/saturation.js`
- 新建 `src/lib/export.js`
- 新建 `src/lib/rect.js`
- 把相关逻辑从 `App.jsx` 替换为导入调用

### 第二批提交

- 新建 `src/components/BandCard.jsx`
- 新建 `src/components/BandList.jsx`
- 新建 `src/components/QuantPanel.jsx`
- `App.jsx` 只负责拼接 props

### 第三批提交

- 新建 `src/components/ImageCanvas.jsx`
- 新建 `src/hooks/useCanvasInteraction.js`
- 新建 `src/hooks/useImageDocument.js`

---

## 7. 验收标准

拆分完成后，至少应满足：

- `App.jsx` 不再承担大部分纯算法逻辑
- 定量与导出函数可以脱离 React 单独测试
- 交互逻辑不再散落在主组件里
- README 与使用说明能够稳定指向清晰的模块边界

---

## 8. 不建议现在做的事

在拆分过程中，不建议同时掺杂：

- 局部背景模式大改
- 自动识别条带
- 多曝光融合
- 工程保存

原因很简单：

- 拆分本身已经是一次结构性工作
- 叠加大功能改动，会让回归风险明显增大

