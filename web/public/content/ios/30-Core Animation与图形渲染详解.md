# Core Animation 与图形渲染详解

## 一、Core Animation 在渲染管线中的位置

iOS 的渲染管线从上到下分为四层：UIKit（UIView）→ Core Animation（CALayer）→ Render Server（BackBoard）→ GPU。UIView 本身不负责绘制，它只是 CALayer 的代理和事件处理者。真正的渲染发生在 Core Animation 层。

每一帧的渲染流程：App 处理事件和布局 → Core Animation 收集 layer 树变化并打包提交 → Render Server（独立进程 BackBoard）接收并执行 Core Animation 命令 → GPU 渲染合成 → 显示到屏幕。

整个过程在 16.67ms（60Hz）或 8.33ms（120Hz ProMotion）内完成，否则掉帧。

## 二、CALayer 基础

### 2.1 Layer 与 View 的关系

```swift
let view = UIView()
view.backgroundColor = .red
// view.layer.backgroundColor = UIColor.red.cgColor  // UIView 的 backgroundColor 实际设置的是 layer
view.layer.cornerRadius = 10
view.layer.borderWidth = 1
view.layer.borderColor = UIColor.black.cgColor
view.layer.shadowColor = UIColor.black.cgColor
view.layer.shadowOpacity = 0.3
view.layer.shadowOffset = CGSize(width: 0, height: 2)
view.layer.shadowRadius = 4
```

UIView 是 CALayer 的 delegate。UIView 的 `drawRect:` 实际是给 layer 的 backing store（位图缓存）绘制内容。

### 2.2 Layer 树

Core Animation 维护三棵 layer 树：

- **Model Layer Tree**：开发者操作的 layer 对象，设置的目标值
- **Presentation Layer Tree**：动画过程中当前实际显示的值（近似值）
- **Render Layer Tree**：Render Server 中实际用于渲染的树

```swift
// 获取动画过程中的当前位置
if let presentationLayer = view.layer.presentation() {
    let currentFrame = presentationLayer.frame
}
```

### 2.3 Layer 类型

```swift
// CALayer：基础图层
let layer = CALayer()

// CAShapeLayer：矢量路径绘制，不依赖位图
let shapeLayer = CAShapeLayer()
shapeLayer.path = path
shapeLayer.fillColor = UIColor.red.cgColor
shapeLayer.strokeColor = UIColor.blue.cgColor

// CATextLayer：文本渲染
let textLayer = CATextLayer()
textLayer.string = "Hello"
textLayer.fontSize = 14
textLayer.foregroundColor = UIColor.black.cgColor

// CAGradientLayer：渐变
let gradientLayer = CAGradientLayer()
gradientLayer.colors = [UIColor.red.cgColor, UIColor.blue.cgColor]
gradientLayer.startPoint = CGPoint(x: 0, y: 0)
gradientLayer.endPoint = CGPoint(x: 1, y: 1)

// CAReplicatorLayer：复制图层
// CAEmitterLayer：粒子效果
// AVPlayerLayer：视频播放
// CAMetalLayer：Metal 渲染
```

## 三、隐式动画与显式动画

### 3.1 隐式动画

直接修改非根 layer 的可动画属性会触发隐式动画（默认 0.25 秒）：

```swift
// 非 view.layer 的子 layer 才有隐式动画
let sublayer = CALayer()
view.layer.addSublayer(sublayer)

sublayer.position = CGPoint(x: 200, y: 200)  // 自动触发 0.25s 动画

// 关闭隐式动画
CATransaction.begin()
CATransaction.setDisableActions(true)
sublayer.position = CGPoint(x: 100, y: 100)
CATransaction.commit()
```

UIView 的 `view.layer` 是根 layer，修改其属性不会触发隐式动画。UIView 的动画块 `UIView.animate` 内部通过 CATransaction 实现显式动画。

### 3.2 CABasicAnimation

```swift
let animation = CABasicAnimation(keyPath: "position")
animation.fromValue = CGPoint(x: 0, y: 0)
animation.toValue = CGPoint(x: 200, y: 200)
animation.duration = 1.0
animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
animation.fillMode = .forwards
animation.isRemovedOnCompletion = false

layer.add(animation, forKey: "positionAnimation")
```

注意：CABasicAnimation 只改变 presentation layer（视觉效果），不改变 model layer（数据模型）。动画结束后 layer 会"跳回"原始位置。要保持动画结束状态需要设置 `fillMode = .forwards` + `isRemovedOnCompletion = false`，或同时修改 model layer 的值。

### 3.3 CAKeyframeAnimation

```swift
let keyframeAnimation = CAKeyframeAnimation(keyPath: "position")
keyframeAnimation.path = path  // 沿路径动画
keyframeAnimation.duration = 2.0
keyframeAnimation.calculationMode = .cubicPaced  // 匀速
layer.add(keyframeAnimation, forKey: "pathAnimation")
```

### 3.4 CAAnimationGroup

```swift
let group = CAAnimationGroup()
group.animations = [positionAnimation, opacityAnimation, scaleAnimation]
group.duration = 1.5
group.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
layer.add(group, forKey: "groupAnimation")
```

### 3.5 CASpringAnimation

```swift
let spring = CASpringAnimation(keyPath: "position")
spring.damping = 15
spring.stiffness = 200
spring.mass = 1
spring.initialVelocity = 0
spring.duration = spring.settlingDuration
layer.add(spring, forKey: "springAnimation")
```

### 3.6 CATransition

```swift
let transition = CATransition()
transition.type = .push
transition.subtype = .fromRight
transition.duration = 0.3
view.layer.add(transition, forKey: "transition")
// 同时更新 view 的内容
```

## 四、绘制循环与 Display Link

### 4.1 CADisplayLink

`CADisplayLink` 是一个与屏幕刷新率同步的定时器：

```swift
class AnimationView: UIView {
    private var displayLink: CADisplayLink?
    private var startTime: CFTimeInterval = 0

    func startAnimation() {
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.add(to: .main, forMode: .common)
        startTime = CACurrentMediaTime()
    }

    @objc private tick() {
        let elapsed = CACurrentMediaTime() - startTime
        if elapsed > 2.0 {
            displayLink?.invalidate()
            return
        }
        // 更新动画状态
        setNeedsDisplay()
    }
}
```

### 4.2 绘制流程

```
CADisplayLink 回调 → layoutSubviews() → draw(_ rect:) → Core Animation 提交 → GPU 渲染
```

`layoutSubviews` 负责布局计算。`draw(_ rect:)` 负责内容绘制（生成 backing store 位图）。两者都应尽量高效，避免在每帧中执行复杂计算。

### 4.3 后台绘制

将绘制操作放到后台线程：

```swift
// 在后台线程生成位图，然后设置到 layer
DispatchQueue.global().async {
    UIGraphicsBeginImageContextWithOptions(size, false, 0)
    // 绘制...
    let image = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    DispatchQueue.main.async {
        layer.contents = image?.cgImage
    }
}
```

这种方式避免阻塞主线程的 `draw(rect:)`，适合复杂图形的异步绘制。实际项目中常用于富文本渲染、复杂路径绘制等场景。

## 五、离屏渲染

### 5.1 什么是离屏渲染

GPU 在当前屏幕缓冲区之外开辟新的缓冲区进行渲染，称为离屏渲染。由于需要额外分配内存、切换上下文，离屏渲染会影响性能。

### 5.2 触发离屏渲染的场景

```swift
// 1. 圆角 + 裁剪（同时设置 cornerRadius 和 masksToBounds）
view.layer.cornerRadius = 20
view.layer.masksToBounds = true  // 离屏渲染！

// 2. 阴影 + 裁剪
view.layer.shadowOpacity = 0.5
view.layer.masksToBounds = true  // 阴影被裁掉 + 离屏渲染

// 3. group opacity
layer.allowsGroupOpacity = true  // 默认 true，iOS 会优化但某些场景仍触发

// 4. shouldRasterize
layer.shouldRasterize = true  // 主动触发离屏渲染（缓存结果）

// 5. 复杂混合（多个半透明图层叠加）
```

### 5.3 优化圆角

```swift
// 方案一：只设 cornerRadius，不设 masksToBounds
// 适用于 backgroundColor + 纯色背景
view.layer.cornerRadius = 20
// 不设 masksToBounds，但内容（如图片）不会跟随圆角

// 方案二：用 CAShapeLayer 裁剪
let maskLayer = CAShapeLayer()
maskLayer.path = UIBezierPath(roundedRect: view.bounds, cornerRadius: 20).cgPath
view.layer.mask = maskLayer
// CAShapeLayer 不触发离屏渲染

// 方案三：用 UIBezierPath + draw 绘制圆角图片
func roundedImage(_ image: UIImage, radius: CGFloat) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: image.size)
    return renderer.image { ctx in
        let rect = CGRect(origin: .zero, size: image.size)
        UIBezierPath(roundedRect: rect, cornerRadius: radius).addClip()
        image.draw(in: rect)
    }
}

// 方案四：优化阴影路径（避免同时裁剪和阴影）
view.layer.cornerRadius = 20
view.layer.shadowPath = UIBezierPath(roundedRect: view.bounds, cornerRadius: 20).cgPath
view.layer.shadowOpacity = 0.3
// 不设 masksToBounds，用 shadowPath 代替
```

### 5.4 shouldRasterize 的正确使用

```swift
layer.shouldRasterize = true
layer.rasterizationScale = UIScreen.main.scale  // 必须设置，否则模糊
```

`shouldRasterize` 将 layer 树预渲染为位图缓存。如果 layer 内容不频繁变化（如带阴影的静态卡片），可以显著提升性能。但如果内容频繁变化，每次都要重新光栅化反而更慢。

规则：内容不变用 `shouldRasterize` 缓存，内容变化关掉它。

## 六、GPU 管线与渲染优化

### 6.1 GPU 渲染管线

```
顶点处理 → 图元装配 → 光栅化 → 片元着色 → 深度测试 → 混合 → 帧缓冲
```

iOS 中 Core Animation 的渲染主要涉及光栅化和混合阶段。

### 6.2 混合（Blending）

多个半透明图层叠加时，GPU 需要逐像素计算混合颜色。叠加层数越多，计算量越大。

优化手段：设置 `layer.opaque = true` 告诉 GPU 该图层不透明，跳过混合计算。确保 backgroundColor 不透明时设置此属性。

### 6.3 背景色与透明

```swift
// 不透明（高效）
view.backgroundColor = .white
view.layer.isOpaque = true

// 半透明（需要混合）
view.backgroundColor = UIColor(white: 1, alpha: 0.8)
// GPU 需要计算与下层内容的混合
```

## 七、Instruments 性能分析

### 7.1 Core Animation Instrument

在 Instruments 中选择 Core Animation 模板，可以看到以下调试选项：

- **Color Blended Layers**：绿色表示不透明（高效），红色表示半透明混合（低效）
- **Color Offscreen-Rendered**：黄色表示触发了离屏渲染
- **Color Misaligned Images**：黄色表示图片尺寸与显示尺寸不匹配（需要缩放）
- **Color Copied Images**：蓝色表示图片被拷贝（格式不支持硬件加速）

### 7.2 常见性能问题

滑动卡顿：检查是否有离屏渲染（圆角+masksToBounds）、图片解码是否在主线程、layer 层级是否过深。

图片闪烁/延迟：检查图片尺寸是否匹配显示尺寸、是否需要预解码（`UIImage(data:scale:)` vs 手动 `CGImageSource` 解码）。

内存峰值：检查是否有大量未释放的 backing store（`draw(rect:)` 的画布尺寸过大）。

## 八、实战技巧

### 8.1 异步绘制

对于复杂自定义视图，可以将绘制操作放到后台：

```swift
class AsyncDrawView: UIView {
    override func layoutSubviews() {
        super.layoutSubviews()
        DispatchQueue.global().async {
            let renderer = UIGraphicsImageRenderer(size: self.bounds.size)
            let image = renderer.image { ctx in
                // 复杂绘制逻辑
                UIColor.red.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
            }
            DispatchQueue.main.async {
                self.layer.contents = image.cgImage
            }
        }
    }
}
```

### 8.2 复用 backing store

避免在每次 `draw(rect:)` 中重新创建画布。利用 `setNeedsDisplayInRect(_:)` 只重绘脏区域，而非整个视图。

### 8.3 3D 变换

```swift
// 透视效果
var transform = CATransform3DIdentity
transform.m34 = -1.0 / 500  // 透视距离
transform = CATransform3DRotate(transform, .pi / 4, 1, 0, 0)  // 绕 X 轴旋转
layer.transform = transform
```

`m34` 控制透视效果。值越小（绝对值越大），透视效果越强。0 表示正交投影（无透视）。

### 8.4 自定义动画属性

```swift
class ProgressLayer: CALayer {
    @NSManaged var progress: CGFloat  // 自定义可动画属性

    override class func needsDisplay(forKey key: String) -> Bool {
        if key == "progress" {
            return true
        }
        return super.needsDisplay(forKey: key)
    }

    override func action(forKey event: String) -> CAAction? {
        if event == "progress" {
            let animation = CABasicAnimation(keyPath: "progress")
            animation.fromValue = presentation()?.progress
            animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            animation.duration = 0.5
            return animation
        }
        return super.action(forKey: event)
    }

    override func draw(in ctx: CGContext) {
        // 根据 progress 绘制进度条
    }
}
```

这种方法可以创建自定义的可动画属性，配合 CADisplayLink 或 CABasicAnimation 使用。
