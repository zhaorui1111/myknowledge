# React Native 架构原理详解

---

## 一、RN 架构总览

React Native 的架构经历了从「旧架构（Bridge）」到「新架构（JSI + Fabric + TurboModules）」的重大演进。理解这一演进是掌握 RN 性能优化和调试的基础。

### 1.1 旧架构（Bridge 模式）

旧架构采用三线程模型，通过异步 Bridge 进行通信：

```
┌──────────────┐     Bridge（JSON 序列化）    ┌──────────────┐
│   JS Thread   │ ←─────────────────────────→ │ Native Thread │
│  (JS 执行)    │     异步、批量、序列化        │ (原生 UI 操作) │
├──────────────┤                              ├──────────────┤
│ • React Reconciler │                         │ • UIView     │
│ • 业务逻辑     │                              │ • Android View│
│ • Virtual DOM │                              │ • Native Modules│
└──────────────┘                              └──────────────┘
                      ┌──────────────┐
                      │ Shadow Thread │
                      │  (布局计算)    │
                      │ • Yoga 布局   │
                      │ • Shadow Tree │
                      └──────────────┘
```

**三个线程的职责**：

| 线程 | 职责 | 技术 |
|------|------|------|
| JS Thread | 执行 JS 业务代码、React Reconciliation | Hermes / JSC / V8 |
| Shadow Thread | 计算 Flexbox 布局、维护 Shadow Tree | Yoga（C++ 跨平台布局引擎） |
| Native Thread | 创建/更新原生 View、处理原生事件 | UIKit / Android View System |

**Bridge 通信的问题**：

1. **异步通信**：JS 和 Native 之间无法同步调用。例如 JS 需要获取设备屏幕宽度，必须异步等待 Native 返回。
2. **序列化开销**：每次通信都需要将数据序列化为 JSON 再反序列化，大数据量时性能差。
3. **批量传输**：Bridge 会批量积攒消息后在下一帧 flush，导致一帧延迟。
4. **线程切换**：每次通信涉及 3 个线程切换，上下文切换开销大。

### 1.2 新架构（JSI + Fabric + TurboModules）

RN 0.68+ 引入的新架构从根本上解决了 Bridge 的瓶颈：

```
┌─────────────────────────────────────────────────────────┐
│                    JS Thread (Hermes)                     │
│  • React Reconciler (Fabric)                             │
│  • 业务逻辑                                               │
├─────────────────────────────────────────────────────────┤
│                    C++ / JSI Layer                        │
│  • JavaScript Interface (同步直接调用)                     │
│  • 无序列化，直接内存引用                                   │
├──────────────┬──────────────┬───────────────────────────┤
│  Fabric      │ TurboModules │  CodeGen                  │
│  (新渲染系统)  │ (懒加载模块)  │ (类型安全代码生成)          │
├──────────────┼──────────────┼───────────────────────────┤
│  Native UI   │ Native APIs  │  Native Components         │
└──────────────┴──────────────┴───────────────────────────┘
```

---

## 二、JSI（JavaScript Interface）

### 2.1 JSI 是什么

JSI 是一个用 C++ 编写的轻量级 API 层，允许 JavaScript 代码直接持有 C++ 对象的引用，并同步调用其方法。它是新架构的基石。

**核心特点**：
- JS 引擎不再与 React Native 强绑定，可以替换为任何支持 JSI 的引擎
- JS 可以直接调用 C++ 函数，无需序列化
- 支持同步调用（旧 Bridge 只支持异步）

### 2.2 JSI 工作原理

```cpp
// C++ 侧：定义一个 JSI HostObject
class DeviceInfo : public jsi::HostObject {
public:
  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    auto propName = name.utf8(rt);
    
    if (propName == "getScreenWidth") {
      // 返回一个 JS 函数，调用时同步获取屏幕宽度
      return jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "getScreenWidth"),
        0,  // 参数个数
        [](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
          // 直接调用原生 API，同步返回
          CGFloat width = [UIScreen mainScreen].bounds.size.width;
          return jsi::Value(width);
        }
      );
    }
    return jsi::Value::undefined();
  }
};

// 将 HostObject 注入 JS 全局对象
runtime.global().setProperty(
  runtime,
  "DeviceInfo",
  jsi::Object::createFromHostObject(runtime, std::make_shared<DeviceInfo>())
);
```

```javascript
// JS 侧：直接同步调用
const width = DeviceInfo.getScreenWidth();  // 同步返回，无序列化
console.log(width);  // 375
```

### 2.3 JSI vs Bridge 对比

| 维度 | Bridge（旧） | JSI（新） |
|------|-------------|-----------|
| 通信方式 | 异步消息队列 | 同步直接调用 |
| 数据传输 | JSON 序列化/反序列化 | 直接内存引用 |
| 线程切换 | 3 线程切换 | 可在调用方线程执行 |
| 延迟 | 1 帧以上 | 微秒级 |
| 引擎耦合 | 强绑定 JSC | 解耦，支持 Hermes/V8/JSC |

---

## 三、Hermes 引擎

### 3.1 Hermes 概述

Hermes 是 Meta 专为 React Native 开发的 JavaScript 引擎，从 0.70 开始成为 Android 默认引擎，0.73 开始成为 iOS 默认引擎。

### 3.2 Hermes vs JSC vs V8

| 特性 | Hermes | JavaScriptCore (JSC) | V8 |
|------|--------|---------------------|-----|
| 开发商 | Meta | Apple | Google |
| 字节码 | ✅ 预编译 AOT | ❌ 仅 JIT | ✅ JIT + 字节码 |
| 启动速度 | 最快（预编译字节码） | 中等 | 较慢（JIT 预热） |
| 内存占用 | 最低 | 中等 | 最高 |
| iOS 支持 | ✅（0.73+ 默认） | ✅（系统内置） | ❌（体积大） |
| 调试 | Chrome DevTools | Safari Web Inspector | Chrome DevTools |
| GC | GenGC（分代 GC） | Mark-Sweep | Orinoco（并发标记） |

### 3.3 Hermes 字节码预编译

```
开发阶段:
  JS 源码 → Hermes Compiler → Hermes Bytecode (.hbc)

运行阶段:
  .hbc 文件 → Hermes 运行时 → 直接执行（跳过解析/编译）

优势:
  • 启动时无需解析 JS 源码，直接加载字节码
  • 字节码体积比源码更小
  • 字节码格式与平台无关，一套字节码跑多端
```

### 3.4 Hermes GC 机制

Hermes 使用分代垃圾回收器（Generational GC）：

```
堆内存分区:
┌─────────────────────────────────┐
│         Young Generation         │  ← 新生代（短生命周期对象）
│  • 分配快（bump allocation）      │
│  • GC 频繁但速度快               │
│  • 存活对象晋升到老生代            │
├─────────────────────────────────┤
│         Old Generation           │  ← 老生代（长生命周期对象）
│  • GC 不频繁但耗时                │
│  • 标记-压缩算法                  │
└─────────────────────────────────┘

GC 触发时机:
  • 新生代空间不足时触发 Minor GC
  • 老生代空间不足时触发 Major GC
  • Major GC 会暂停 JS 执行（Stop-The-World）
```

---

## 四、Fabric 渲染系统

### 4.1 旧渲染系统的问题

旧架构中，渲染流程跨越三个线程，通信通过异步 Bridge：

```
JS Thread                    Shadow Thread              Native Thread
    │                             │                          │
    │  React.setState()           │                          │
    │  → Virtual DOM Diff         │                          │
    │  → 通过 Bridge 发送更新指令  │                          │
    │ ─────────────────────────→  │                          │
    │  (异步，可能延迟 1 帧)       │  Yoga 布局计算            │
    │                             │  → Shadow Tree 更新       │
    │                             │ ───────────────────────→ │
    │                             │  (异步，再延迟 1 帧)       │  创建/更新 UIView
    │                             │                          │  渲染到屏幕
```

问题：从 JS 状态变更到屏幕渲染，至少延迟 2 帧（~33ms@60fps），导致列表滚动、手势交互等场景卡顿。

### 4.2 Fabric 新渲染系统

Fabric 将渲染流程改为同步，在 C++ 层直接协调：

```
JS Thread / C++ Layer                    Native Thread
    │                                         │
    │  React.setState()                       │
    │  → Fabric Reconciler (C++)              │
    │  → Shadow Tree 更新（同步）              │
    │  → Yoga 布局计算（同步）                 │
    │  → Commit Phase（同步提交）              │
    │ ──────────────────────────────────────→ │
    │  (同帧内完成)                             │  Diff → 创建/更新 UIView
    │                                         │  渲染到屏幕
```

**关键改进**：
- 布局计算从 Shadow Thread 移到 C++ 层，与 JS 在同一线程同步执行
- 提交阶段（Commit Phase）同步完成，不再异步等待
- 从状态变更到屏幕渲染可以在同一帧内完成

### 4.3 Fabric 架构组件

```
┌─────────────────────────────────────────┐
│           React (JS Layer)               │
│  • React Reconciler                      │
│  • Component Registry (JS)               │
├─────────────────────────────────────────┤
│         Fabric (C++ Layer)               │
│  • Shadow Tree (C++)                     │
│  • Yoga Layout Engine                    │
│  • Component Descriptor                  │
│  • Event Beat (事件同步)                  │
│  • State Update Pipeline                 │
├─────────────────────────────────────────┤
│         Native (Platform Layer)          │
│  • iOS: RCTViewComponentView             │
│  • Android: ReactViewGroup               │
│  • Mount Phase (挂载阶段)                 │
└─────────────────────────────────────────┘
```

### 4.4 Fabric 渲染阶段

1. **Render Phase（渲染阶段）**：JS 层 React Reconciler 执行 Virtual DOM Diff，生成新的 React Tree，通过 JSI 同步提交给 C++ 层。

2. **Commit Phase（提交阶段）**：C++ 层根据 React Tree 更新 Shadow Tree，执行 Yoga 布局计算，生成 Layout Tree。此阶段在 JS 线程同步完成。

3. **Mount Phase（挂载阶段）**：将 Layout Tree 的变更应用到原生视图层级。此阶段在 Native 线程执行，通过 `MountItem` 队列传递变更指令。

---

## 五、TurboModules

### 5.1 旧 Native Modules 的问题

旧架构中，所有 Native Modules 在启动时全部初始化，即使大部分模块在当前会话中不会被使用：

```javascript
// 旧架构：所有 Native Modules 在启动时注册
// NativeModules 结构在启动时确定，无法懒加载
const { CameraModule } = NativeModules;  // 即使不用相机，也已被初始化
```

### 5.2 TurboModules 架构

TurboModules 通过 JSI 实现懒加载和同步调用：

```typescript
// 1. 定义 TypeScript 接口（Spec）
// CameraModule.ts
import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  takePhoto(options: { quality: number; flash: 'on' | 'off' | 'auto' }): Promise<string>;
  getFlashMode(): 'on' | 'off' | 'auto';  // 同步方法
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('CameraModule');
```

```cpp
// 2. CodeGen 自动生成 C++ 接口
// 此文件由 react-native-codegen 根据上述 TS Spec 自动生成
struct CameraModuleSpec : TurboModule {
  virtual jsi::Value takePhoto(jsi::Runtime &rt, jsi::Object options) = 0;
  virtual jsi::Value getFlashMode(jsi::Runtime &rt) = 0;
  // ...
};
```

```objc
// 3. iOS 原生实现
// RCTCameraModule.h
#import <React/RCTBridgeModule.h>
#import "CameraModuleSpec.h"

@interface RCTCameraModule : NSObject <NativeCameraModuleSpec>
@end

// RCTCameraModule.m
@implementation RCTCameraModule

RCT_EXPORT_MODULE(CameraModule)

- (NSString *)getFlashMode {
  return self.camera.flashMode;  // 同步返回！
}

- (void)takePhoto:(NSDictionary *)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
  [self.camera takePhotoWithCompletion:^(NSString *path, NSError *error) {
    if (error) {
      reject(@"camera_error", error.localizedDescription, error);
    } else {
      resolve(path);
    }
  }];
}

// CodeGen 生成的协议方法绑定
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeCameraModuleSpecJSI>(params);
}

@end
```

### 5.3 TurboModules 优势

| 特性 | 旧 Native Modules | TurboModules |
|------|------------------|--------------|
| 初始化时机 | 启动时全部初始化 | 按需懒加载 |
| 调用方式 | 异步 Bridge | 同步 JSI 直调 |
| 类型安全 | 无（运行时检查） | 有（TS Spec + CodeGen） |
| 跨平台一致性 | 各平台手动实现 | Spec 统一接口定义 |

---

## 六、CodeGen 代码生成

### 6.1 CodeGen 流程

```
开发者编写 TS Spec 文件
        │
        ▼
  react-native-codegen 工具
        │
        ├──→ C++ 接口头文件（TurboModule 规范）
        ├──→ Java/Kotlin 接口（Android）
        ├──→ Objective-C 协议（iOS）
        └──→ TypeScript 类型定义（JS 侧类型检查）
```

### 6.2 Spec 文件规范

```typescript
// MyModuleSpec.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// 所有方法必须声明返回类型
export interface Spec extends TurboModule {
  // 同步方法
  getValue(): string;
  
  // 异步方法（Promise）
  setValue(value: string): Promise<void>;
  
  // 带回调的方法
  getValueWithCallback(callback: (value: string) => void): void;
  
  // 事件相关（必须实现）
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  
  // 常量
  readonly getConstants: () => {
    DEFAULT_VALUE: string;
    MAX_RETRY: number;
  };
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

---

## 七、事件系统

### 7.1 旧架构事件传播

旧架构中，原生事件（如点击、滚动）通过 Bridge 异步传播到 JS：

```
Native Thread                 Bridge                  JS Thread
    │                           │                         │
    │  用户点击按钮               │                         │
    │  → 生成事件对象              │                         │
    │  → 序列化为 JSON            │                         │
    │ ────────────────────────→ │                         │
    │                           │  (异步，延迟 1+ 帧)       │
    │                           │ ──────────────────────→ │
    │                           │                         │  JS 处理事件
    │                           │                         │  → 可能触发 setState
    │                           │                         │  → 通过 Bridge 更新 UI
    │                           │                         │  (再延迟 1+ 帧)
```

### 7.2 Fabric 事件系统

新架构中，事件通过 EventBeat 机制同步传播：

```
Native Thread                    C++ / JS Thread
    │                                │
    │  用户点击按钮                    │
    │  → 生成 Eventpayload            │
    │  → 通过 EventBeat 派发           │
    │ ──────────────────────────────→│
    │  (可在同帧内到达 JS)              │  JS 处理事件
    │                                │  → Fabric Reconciler
    │                                │  → 同步更新 Shadow Tree
    │                                │  → 同帧 Mount
    │ ←──────────────────────────────│
    │  (同帧内完成 UI 更新)             │
```

**EventBeat 类型**：
- **UI EventBeat**：绑定到 UI 线程的 vsync 信号，在每帧渲染前触发
- **JS EventBeat**：绑定到 JS 线程的消息循环
- **MainRCTEventBeat**：兼容旧架构的事件触发

---

## 八、RN 启动流程

### 8.1 冷启动阶段

```
App 启动
  │
  ├── 1. Native Init（原生初始化）
  │   • AppDelegate / Application onCreate
  │   • 加载 Hermes 引擎
  │   • 创建 RCTHost / RCTRootView
  │
  ├── 2. JS Bundle 加载
  │   • 从磁盘读取 JS Bundle（.hbc 字节码）
  │   • Hermes 解析字节码
  │   • 执行 JS 入口代码
  │
  ├── 3. JS Module 初始化
  │   • 注册组件（AppRegistry.registerComponent）
  │   • React Reconciler 首次渲染
  │   • 生成 Virtual DOM Tree
  │
  ├── 4. Fabric Commit Phase
  │   • Virtual DOM → Shadow Tree
  │   • Yoga 布局计算
  │   • 生成 Mount Items
  │
  ├── 5. Mount Phase
  │   • 创建原生 UIView / Android View
  │   • 设置布局属性
  │   • 挂载到视图层级
  │
  └── 6. 首屏渲染
      • 核心动画提交
      • 首帧显示到屏幕
```

### 8.2 启动优化要点

```javascript
// 1. 内联 require：延迟非首屏模块的加载
// 旧代码（启动时加载所有依赖）
const ExpensiveModule = require('./ExpensiveModule');
const AnotherModule = require('./AnotherModule');

function App() {
  return <View />;
}

// 优化后（按需加载）
function App() {
  const [showFeature, setShowFeature] = useState(false);
  
  const handlePress = () => {
    // 点击时才加载
    const ExpensiveModule = require('./ExpensiveModule');
    setShowFeature(true);
  };
  
  return <Button onPress={handlePress} title="Load" />;
}

// 2. Hermes 字节码预编译
// metro.config.js
module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,  // 启用内联 require
      },
    }),
  },
};
```

---

## 九、RN 与原生通信总结

### 9.1 通信方式对比

| 方式 | 方向 | 同步/异步 | 适用场景 |
|------|------|---------|---------|
| TurboModule 方法调用 | JS → Native | 同步或异步 | 调用原生 API |
| EventEmitter | Native → JS | 异步 | 原生事件通知 JS |
| Ref 方法调用 | JS → Native | 同步 | 直接操作原生组件 |
| Props | JS → Native | 同步 | 传递数据到原生组件 |
| Callback | Native → JS | 异步 | 回调通知 |
| Promise | Native → JS | 异步 | 异步操作结果 |

### 9.2 通信最佳实践

```javascript
// ❌ 避免：高频 Bridge 调用
// 旧架构下每次调用都有序列化开销
ScrollView.scrollTo({ x: 0, y: offset });  // 滚动时每帧调用

// ✅ 推荐：批量操作 + JSI 同步调用
// 新架构下 TurboModule 直接同步调用
const offset = scrollModule.getCurrentOffset();  // 同步获取
scrollModule.setOffset(offset + delta);  // 同步设置

// ❌ 避免：在列表滚动中频繁 setState
<FlatList
  onScroll={(e) => {
    setScrollY(e.nativeEvent.contentOffset.y);  // 每帧触发 re-render
  }}
/>

// ✅ 推荐：使用 Animated 或 useSharedValue
const scrollY = useRef(new Animated.Value(0)).current;
<Animated.ScrollView
  onScroll={Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }  // 在原生线程驱动动画
  )}
/>
```

---

## 十、小结

React Native 的新架构（JSI + Fabric + TurboModules）从根本上解决了旧 Bridge 架构的性能瓶颈：

- **JSI** 实现了 JS 与原生的同步直接调用，消除了序列化开销
- **Fabric** 将渲染管线从异步三线程改为同步管线，实现同帧渲染
- **TurboModules** 实现了原生模块的懒加载和类型安全
- **Hermes** 引擎通过字节码预编译和分代 GC 优化了启动速度和内存管理

理解这些架构原理是进行 RN 性能优化、原生模块开发、问题调试的基础。后续章节将深入 RN 的组件体系、状态管理、原生通信和性能优化实践。
