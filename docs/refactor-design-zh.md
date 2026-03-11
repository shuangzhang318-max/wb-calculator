# WB Calculator 改造设计文档

## 1. 文档目的

本文档用于把当前 `wb-calculator` 从“可运行的单页原型”升级为“可长期维护、结果更可信、便于继续迭代的科研小工具”。

这份文档不直接改代码，而是给出：

- 当前架构和风险判断
- 各类问题的根因分析
- 可选改造模块与取舍建议
- 推荐的分阶段实施顺序
- 每一阶段的验收标准

目标是让你可以先决定 **改哪些、先改哪批、哪些暂缓**，再进入实施。

---

## 2. 当前项目概况

### 2.1 技术栈

- 前端框架：React 19
- 构建工具：Vite 7
- UI：Tailwind CSS 4 + 少量内联样式
- TIFF 解析：UTIF
- 主要实现位置：`src/App.jsx`

### 2.2 当前产品链路

目前主流程已经成型：

1. 上传图像（普通图片 / TIFF）
2. 在画布上框选区域
3. 指定背景 ROI
4. 指定参考样品 ROI
5. 输入当前上样量
6. 计算净强度与建议上样量
7. 导出 CSV

### 2.3 当前优势

当前版本已经具备几个很好的基础：

- 主流程简洁，学习成本低
- ROI 可视化反馈清楚
- 支持 TIFF 导入，方向正确
- 支持固定框尺寸，符合 WB 使用习惯
- UI 风格统一，做 Demo 演示已经够用了

### 2.4 当前核心风险

当前最主要的问题不是“功能缺少几个按钮”，而是以下三类：

1. **定量可信度风险**
   - TIFF 定量仍走 8-bit 显示链路
   - 未显式处理信号极性（暗带 / 亮带）
   - 背景模型过于简化

2. **交互一致性风险**
   - 画布外释放鼠标可能残留交互状态
   - 删除 ROI 后关联状态可能悬空
   - 框选区域和真实计算区域可能出现偏差

3. **工程可维护性风险**
   - 绝大多数逻辑集中在单个组件内
   - 计算逻辑、绘制逻辑、表单逻辑强耦合
   - 缺少可验证的纯函数与测试

---

## 3. 改造目标

### 3.1 业务目标

将工具从“快速辅助估算”提升到“实验中可重复使用的定量助手”。

### 3.2 技术目标

- 保证定量逻辑尽量基于原始数据而不是显示数据
- 保证所有 ROI 操作结果可预测、可恢复、可导出
- 将算法与 UI 解耦，便于后续继续演化
- 为后续加入自动识别、批量处理、项目保存打基础

### 3.3 非目标

以下内容不建议放在第一阶段：

- 自动识别所有条带并全自动定量
- 云端数据库 / 用户系统
- 多人协作
- 复杂图像处理流水线（如去噪、去背景拟合、泳道识别）

这些可以作为未来方向，但不应阻碍第一轮重构。

---

## 4. 问题清单与根因分析

## 4.1 P1：16-bit TIFF 被压成 8-bit 后再定量

### 现状

当前 TIFF 流程大致是：

1. `UTIF.decode()` 解析 TIFF
2. `UTIF.toRGBA8()` 生成 8-bit RGBA
3. 绘制到 canvas
4. 通过 `getImageData()` 计算灰度积分

### 风险

这会把很多 WB 图像常见的 16-bit 动态范围压缩成 8-bit：

- 高动态范围信息丢失
- 弱信号区分能力下降
- 定量与原始仪器输出不再一致
- 用户会误以为“支持 TIFF = 支持高精度定量”

### 根因

当前实现中，“显示数据”和“计算数据”使用的是同一份 8-bit canvas 数据。

### 设计目标

拆分两条数据链路：

- **显示链路**：用于浏览、缩放、框选，可继续使用 8-bit 映射
- **计算链路**：用于 ROI 积分，优先使用 TIFF 原始像素数据

### 改造方案

引入统一的图像数据模型：

```ts
ImageDocument = {
  src: string,
  width: number,
  height: number,
  display: {
    kind: 'rgba8',
    imageSource: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  },
  quant: {
    kind: 'grayscale' | 'rgb' | 'tiff-samples',
    bitDepth: 8 | 16 | 32,
    channels: 1 | 3,
    data: TypedArray,
    photometric?: 'min-is-black' | 'min-is-white' | 'rgb',
  },
}
```

针对 TIFF：

- 导入时保留原始 sample buffer
- 若原图本身是单通道，直接基于单通道数组做积分
- 若是 RGB，则使用明确的灰度变换公式得到计算灰度
- 显示层单独生成预览图

### 对现有代码的影响

- `calculateIntDen()` 不能再依赖 canvas `getImageData()` 作为唯一来源
- 需要新增 `quantizeRoi(imageDoc, rect, options)` 纯函数
- `imgRef.current` 只负责显示，不再承担全部定量职责

### 验收标准

- 同一张 16-bit TIFF 图，导入后能保留原始位深信息
- 定量结果不依赖浏览器显示缩放和显示映射
- 定量报告中可以标出位深与来源类型

---

## 4.2 P1：净强度使用绝对值，掩盖了信号极性问题

### 现状

当前净强度计算：

- `net = Math.abs(band.grayscale - band.area * backgroundMean)`

### 风险

`Math.abs()` 会把下面几种情况混成一种：

- 暗带 / 亮背景
- 亮带 / 暗背景
- 背景框选错
- 图像需要反相但用户没注意

这样“数值看起来始终为正”，但含义可能已经变了。

### 根因

当前没有明确的图像极性模型，试图用绝对值掩盖方向性。

### 设计目标

显式支持信号方向：

- `dark-on-light`
- `light-on-dark`

### 改造方案

新增极性设置：

```ts
signalPolarity: 'dark-on-light' | 'light-on-dark'
```

净强度统一写成：

```ts
if (signalPolarity === 'dark-on-light') {
  net = backgroundSignal - bandSignal
} else {
  net = bandSignal - backgroundSignal
}
```

并加上两个防错机制：

1. 当净强度小于等于 0 时，给出 UI 提示，而不是用绝对值硬转正
2. 导入图像后做一次自动建议：
   - 统计整体亮度分布
   - 默认推荐可能的极性
   - 允许用户手动切换

### UI 设计建议

在右侧控制区增加一个很明确的切换项：

- 信号模式：暗带 / 亮带
- 切换后立即更新所有 ROI 数值

### 验收标准

- 用户能明确知道当前按哪种极性计算
- 切换极性后导出报告会记录当前模式
- 对“极性不匹配”的情况有明显提示

---

## 4.3 P1：背景扣除模型过于简化

### 现状

当前背景模型是：

- 选一个背景 ROI
- 用该 ROI 的平均灰度当作全局背景均值
- 所有 band 都用同一个背景均值做扣除

### 风险

真实 WB 常见情况：

- 不同泳道局部背景不同
- 背景存在梯度变化
- 某些区域有杂散信号或不均匀底噪

单一全局背景在不少图上会给出偏差较大的结果。

### 设计目标

支持两种背景模式：

1. 全局背景模式
2. 局部背景模式

### 改造方案

#### 方案 A：保留全局背景

适合作为默认简单模式，门槛低。

#### 方案 B：局部背景

为每个 band 自动或手动定义局部背景区域：

- 上下扩展环带
- 左右邻域窗口
- 自定义第二个背景框

建议第一版先做：

- 模式 1：全局背景
- 模式 2：每个 band 指定一个本地背景 ROI

数据结构：

```ts
BandRoi = {
  id: string,
  rect: Rect,
  role: 'sample' | 'background' | 'reference',
  localBackgroundId?: string,
}
```

计算优先级：

- 若 band 有 `localBackgroundId`，则优先使用局部背景
- 否则回退到全局背景

### UI 设计建议

右侧 band 卡片增加：

- `使用全局背景`
- `绑定局部背景`

### 验收标准

- 用户可选择背景模式
- 结果导出时可追踪每个 band 的背景来源
- 切换背景模式后数值变化是即时可见的

---

## 4.4 P2：交互只绑在鼠标事件上

### 现状

当前拖拽使用：

- `onMouseDown`
- `onMouseMove`
- `onMouseUp`

都绑定在 canvas 上。

### 风险

如果用户：

- 按下后拖出画布
- 在画布外释放鼠标
- 使用触控板或触屏设备

就可能出现交互状态残留。

### 设计目标

把 ROI 交互从 mouse event 升级到 pointer event，并在拖拽期间持有 pointer capture。

### 改造方案

使用：

- `onPointerDown`
- `onPointerMove`
- `onPointerUp`
- `onPointerCancel`

在 `pointerdown` 时：

- 记录活跃 pointer id
- 调用 `setPointerCapture(pointerId)`

在 `pointerup` / `pointercancel` 时：

- 统一结束交互
- 释放 capture

同时加一层兜底：

- 在 `window` 级别注册一次 `pointerup` 清理

### 额外收益

- 更适合未来支持触控
- 行为更稳定
- 状态机更清晰

### 验收标准

- 拖出画布释放不会卡住
- 快速拖拽不会丢失最终状态
- 触控板和触屏行为一致

---

## 4.5 P2：删除 ROI 后关联状态不同步

### 现状

删除 band 时，只删了 `bands`，没有同步处理：

- `selectedBandId`
- `bgBandId`
- `refBandId`

### 风险

会出现：

- UI 还显示某个角色存在，但对象已经删除
- 背景均值回退到默认值，用户不容易察觉
- 参考 band 丢失后建议上样量失真

### 设计目标

引入统一的 ROI 删除入口，删除后做状态收敛。

### 改造方案

增加纯逻辑函数：

```ts
removeBand(state, bandId) => nextState
```

规则建议：

- 如果删的是当前选中项，清空 `selectedBandId`
- 如果删的是背景，清空 `bgBandId`
- 如果删的是参考，清空 `refBandId`
- 可选增强：若删掉参考且仍有其他 sample，提示是否自动指定新的参考

### 验收标准

- 删除任何 ROI 后状态一致
- 不存在悬空 id
- 删除关键角色后 UI 有清晰反馈

---

## 4.6 P2：ROI 越界后显示与计算可能不一致

### 现状

当前 ROI 可以被拖到图像边界外，而计算时会再做裁切。

### 风险

用户看到的矩形和真正参与计算的区域不是完全一致的，容易造成误解。

### 设计目标

在交互阶段就约束 ROI 始终位于图像内。

### 改造方案

新增矩形归一化函数：

```ts
clampRectToBounds(rect, width, height)
normalizeRect(rect)
```

在以下场景统一调用：

- 新建 ROI
- 移动 ROI
- 缩放 ROI
- 同步面积

### 验收标准

- 任何 ROI 都不会超出图像范围
- 显示区域与计算区域一致

---

## 4.7 P2：自动把首个 ROI 设为参考，不符合实验认知

### 现状

第一个新建 band 会自动成为参考 band。

### 风险

用户经常先画背景，再画样品；自动设参考会混淆角色。

### 设计目标

参考样品由用户显式指定，而不是隐式推断。

### 改造方案

- 去掉“首个 ROI 自动成为参考”的逻辑
- 当用户切到“参考模式”但未指定参考 ROI 时，右侧显示明确提示

### 验收标准

- 参考样品只能由用户主动设置
- 未设置参考时有明确空状态提示

---

## 4.8 P2：背景与参考角色应强约束互斥

### 现状

同一 ROI 理论上可能先被设为参考，再被设为背景。

### 风险

角色语义冲突，计算结果不可靠。

### 设计目标

背景与参考互斥；样品、背景、参考的角色边界清晰。

### 改造方案

统一角色模型：

```ts
role: 'sample' | 'background' | 'reference'
```

而不是分别维护多个 id。若仍保留 `bgBandId/refBandId`，则必须在 setter 中做互斥逻辑。

### 更推荐的数据结构

```ts
BandRoi = {
  id: string,
  name: string,
  rect: Rect,
  role: 'sample' | 'background' | 'reference',
  currentLoading?: number,
}
```

### 验收标准

- 同一 ROI 不可能同时是背景和参考
- UI 中角色展示与内部状态完全一致

---

## 5. 推荐的目标架构

## 5.1 组件拆分建议

当前核心文件过大，建议至少拆为以下模块：

### 组件层

- `src/components/ImageCanvas.jsx`
  - 图像显示
  - ROI 交互
  - 缩放与画布绘制
  - 放大镜

- `src/components/TopToolbar.jsx`
  - 上传、重置、缩放、亮度、对比度

- `src/components/QuantPanel.jsx`
  - 计算模式
  - 极性模式
  - 固定框设置
  - 报告导出

- `src/components/BandList.jsx`
  - ROI 列表
  - 设置角色
  - 修改上样量
  - 删除 ROI

- `src/components/BandCard.jsx`
  - 单个 ROI 展示卡片

### 逻辑层

- `src/lib/image-io.js`
  - 普通图片导入
  - TIFF 导入
  - 统一输出 `ImageDocument`

- `src/lib/quant.js`
  - ROI 灰度积分
  - 背景扣除
  - 净强度计算
  - 建议上样量计算

- `src/lib/rect.js`
  - 矩形归一化
  - 边界裁切
  - 点命中测试
  - 控制柄命中测试

- `src/lib/export.js`
  - CSV 导出
  - JSON 工程导出

### Hook 层

- `src/hooks/useImageDocument.js`
- `src/hooks/useBands.js`
- `src/hooks/useCanvasInteraction.js`

---

## 5.2 推荐状态模型

建议把状态从“多个零散 useState”调整为“文档 + ROI + 视图状态”三层。

```ts
AppState = {
  document: ImageDocument | null,
  bands: BandRoi[],
  ui: {
    selectedBandId: string | null,
    zoom: number,
    baseScale: number,
    brightness: number,
    contrast: number,
    interaction: InteractionState,
  },
  quant: {
    signalPolarity: 'dark-on-light' | 'light-on-dark',
    backgroundMode: 'global' | 'local',
    referenceBandId: string | null,
    globalBackgroundBandId: string | null,
    calculationMode: 'reference' | 'custom',
    customTargetNetIntensity: number,
  },
  settings: {
    fixedSizeEnabled: boolean,
    fixedWidth: number,
    fixedHeight: number,
  },
}
```

### 为什么这样拆

- `document` 负责图像及原始像素
- `bands` 负责 ROI 本体
- `quant` 负责与定量相关的业务语义
- `ui` 负责临时显示状态

这样做后，数据职责会更清楚，测试也更容易写。

---

## 6. 核心算法设计

## 6.1 ROI 灰度积分函数

建议设计成纯函数：

```ts
integrateRect(imageDoc, rect, options) => {
  sum: number,
  area: number,
  mean: number,
  min: number,
  max: number,
  saturatedPixels: number,
}
```

### 输入

- `imageDoc`：统一图像文档模型
- `rect`：已归一化 ROI
- `options`：
  - 灰度模式
  - 通道选择
  - 是否统计饱和像素

### 输出意义

- `sum`：积分灰度
- `area`：有效面积
- `mean`：平均灰度
- `saturatedPixels`：可用于提示图像是否饱和

---

## 6.2 背景扣除函数

```ts
calculateNetIntensity({
  bandStats,
  backgroundStats,
  polarity,
}) => number
```

### 规则

- 根据极性决定减法方向
- 若结果小于等于 0，不自动取绝对值
- 返回值可同时附带 `warning`

返回结构建议：

```ts
{
  net: number,
  valid: boolean,
  warning?: 'non-positive-net-signal' | 'missing-background'
}
```

---

## 6.3 建议上样量函数

```ts
suggestLoading({
  currentLoading,
  currentNet,
  targetNet,
}) => {
  suggestedLoading: number | null,
  valid: boolean,
  warning?: string,
}
```

### 规则建议

- 若 `currentNet <= 0`，返回不可计算
- 若目标值缺失，返回不可计算
- 统一由调用层负责格式化为字符串，而不是算法层直接返回文案

这样能避免逻辑和 UI 文案耦合。

---

## 7. UI/UX 改造方案

## 7.1 工具栏

建议补充：

- 图像反相按钮
- 极性模式切换
- 背景模式切换
- 一键适配窗口大小
- 重置显示参数（亮度/对比度/缩放）

## 7.2 ROI 列表

建议每个 ROI 卡片显示：

- 名称
- 角色
- 坐标与尺寸
- 原始积分
- 背景来源
- 净强度
- 当前上样量
- 建议上样量
- 警告标记（弱信号 / 极性异常 / 饱和）

## 7.3 空状态与错误提示

建议增加以下空状态提示：

- 未上传图像
- 已上传但尚未画 ROI
- 已画样品但尚未设置背景
- 参考模式下尚未指定参考 band

错误提示尽量不要只用 `alert()`，可考虑改成：

- 顶部 toast
- 面板内状态提示
- ROI 卡片内局部警告

## 7.4 导出体验

建议支持两种导出：

1. `CSV` 分析结果
2. `JSON` 工程文件

`JSON` 工程可保存：

- 原图元信息
- 所有 ROI
- 背景/参考配置
- 计算模式
- 极性模式
- 上样量输入

---

## 8. 文件与目录改造建议

建议的目标目录结构如下：

```text
src/
  components/
    BandCard.jsx
    BandList.jsx
    ImageCanvas.jsx
    QuantPanel.jsx
    TopToolbar.jsx
  hooks/
    useBands.js
    useCanvasInteraction.js
    useImageDocument.js
  lib/
    export.js
    image-io.js
    quant.js
    rect.js
  App.jsx
  main.jsx
docs/
  refactor-design-zh.md
```

---

## 9. 测试策略

## 9.1 为什么现在就要补测试

这个项目最敏感的不是界面长什么样，而是“数算得对不对”。

如果不把定量逻辑抽成纯函数并加测试，后续每改一次 UI 都可能无意中改坏计算结果。

## 9.2 建议优先测试的内容

### `rect.js`

- 矩形归一化
- 边界裁切
- 固定尺寸框定位
- 控制柄缩放

### `quant.js`

- 8-bit 灰度积分
- 16-bit 灰度积分
- 极性切换
- 背景扣除
- 建议上样量计算
- 饱和像素统计

### `image-io.js`

- 普通图片导入
- TIFF 导入后的元数据正确性
- TIFF 位深识别

## 9.3 建议工具

- `Vitest`
- 如需 DOM 行为验证，可后续再加 `@testing-library/react`

第一阶段其实只需要把纯函数测试补上。

---

## 10. 文档与说明改造建议

## 10.1 README 应补充的内容

当前 README 仍是 Vite 模板，建议重写为真实项目文档，至少包含：

- 项目简介
- 适用场景
- 支持格式
- 定量原理简介
- 已知限制
- 本地开发命令
- 部署方式
- 数据隐私说明（本地浏览器处理，不上传）

## 10.2 建议补一页方法说明

单独写一份简短说明，解释：

- IntDen 是怎么计算的
- 背景扣除怎么做
- 为什么 TIFF 位深会影响结果
- 工具适合做“相对比较”，不等于替代仪器原生分析软件

这会明显提升工具专业感和用户信任。

---

## 11. 分阶段实施方案

## Phase 1：结果可信度优先

### 目标

先把“算得对”这件事打牢。

### 范围

- 保留 TIFF 原始数据用于定量
- 增加极性模式
- 重写净强度计算
- 增加饱和提示
- 修背景/参考互斥与删除收敛

### 预期收益

- 科学可信度明显提升
- 最危险的误算问题先被控制住

### 风险

- TIFF 解析实现会稍微复杂一点
- 需要先梳理现有数据模型

### 验收标准

- 16-bit TIFF 定量不再依赖 RGBA8
- 净强度逻辑不再使用绝对值
- 删除背景/参考 ROI 后状态一致
- 导出结果可记录极性与背景模式

---

## Phase 2：交互稳定性与结构重构

### 目标

把“容易卡住、难维护”的部分拆开。

### 范围

- Pointer Events 改造
- ROI 交互逻辑拆到 hook
- 组件拆分
- 纯函数抽离到 `lib/`

### 预期收益

- 交互更稳定
- 代码可读性提升
- 后续更容易继续改功能

### 验收标准

- 拖出画布不会卡状态
- `App.jsx` 体积显著下降
- 核心算法不再写在 UI 组件内部

---

## Phase 3：产品化增强

### 目标

把工具从一次性页面提升到可重复使用的应用。

### 范围

- JSON 工程保存 / 恢复
- 更完整的报告导出
- ROI 命名
- 撤销 / 重做
- 更多错误提示与空状态

### 预期收益

- 更适合真实实验工作流
- 方便记录与复现

### 验收标准

- 可保存并恢复一次分析会话
- 导出报告包含足够上下文信息
- 用户可撤销误操作

---

## 12. 每项改造的投入与价值判断

| 模块 | 价值 | 实施复杂度 | 建议优先级 |
|---|---|---:|---:|
| 16-bit 原始数据定量 | 很高 | 高 | P1 |
| 极性模式 | 很高 | 中 | P1 |
| 背景模式升级 | 很高 | 中 | P1 |
| 删除状态收敛 | 高 | 低 | P1 |
| 角色互斥 | 高 | 低 | P1 |
| Pointer Events | 高 | 中 | P2 |
| ROI 边界约束 | 高 | 低 | P2 |
| 组件拆分 | 中高 | 中 | P2 |
| 纯函数 + 测试 | 很高 | 中 | P2 |
| JSON 工程保存 | 中高 | 中 | P3 |
| 撤销重做 | 中高 | 中高 | P3 |
| 自动识别条带 | 中 | 高 | 暂缓 |

---

## 13. 推荐决策方案

如果你希望尽快拿到一版“靠谱很多”的版本，我建议按下面三档选。

### 方案 A：最小高价值改造

适合：想尽快把最危险问题修掉。

包含：

- 角色互斥
- 删除状态收敛
- ROI 边界约束
- 极性模式
- 去掉 `Math.abs`

特点：

- 实施快
- 回报高
- 不会大动结构

### 方案 B：科研可信度优先改造

适合：你更在意结果专业性。

包含：

- 方案 A 全部内容
- TIFF 原始位深定量
- 饱和提示
- 背景模式升级

特点：

- 对结果质量提升最大
- 是最值得做的一档

### 方案 C：完整重构版

适合：你准备把这个项目继续长期做下去。

包含：

- 方案 B 全部内容
- Pointer Events
- 组件拆分
- 纯函数抽离
- Vitest 测试
- JSON 工程保存

特点：

- 一次性把架构打好
- 初始投入更高
- 但后续开发成本最低

---

## 14. 我建议你下一步怎么选

如果你只想先改一批，我建议优先选下面这 5 项：

1. TIFF 原始数据定量
2. 极性模式
3. 删除状态收敛
4. 角色互斥
5. Pointer Events 或最少加全局兜底清理

这 5 项能同时提高：

- 结果可信度
- 用户操作稳定性
- 后续重构基础

---

## 15. 实施前的补充建议

正式开始重构前，建议顺手先补这几件小事：

- 修复 `eslint` 报错
- 重写 `README.md`
- 清理未使用状态和图标 import
- 统一 `setState(prev => ...)` 写法
- 明确 Node 版本与构建环境

这些属于“低成本但能减少噪音”的准备工作。

---

## 16. 最终结论

这个项目已经具备不错的原型基础，但如果要真正变成一个可靠的 WB 定量工具，最值得投入的不是再继续堆页面效果，而是：

- 把定量数据链路从显示链路里拆出来
- 把极性、背景、角色这些科学语义显式建模
- 把交互和状态管理从单组件杂糅状态中拆出来

只要这三件事做对，后面的导出、保存、批处理、自动识别，都会变得顺很多。

