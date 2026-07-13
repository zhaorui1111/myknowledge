# iOS 性能优化体系详解

## 概述

性能优化是高级 iOS 开发者的核心能力。IoT Companion App 由于涉及实时设备通信、数据可视化、后台保活等复杂场景，性能问题更加突出。本文从启动优化、主线程性能、内存管理、卡顿分析四个维度，系统讲解 iOS 性能优化体系。

## 启动优化

### 启动阶段分析

iOS App 启动分为 pre-main 阶段和 post-main 阶段：

```
Pre-main 阶段（dyld 主导）:
  1. 加载动态库 (Load Dylibs)
  2. Rebase/Bind（地址修正和符号绑定）
  3. ObjC Runtime Setup（类注册、分类注册、selector 唯一化）
  4. Initializers（C++ 静态初始化、+load 方法、__attribute__((constructor))）

Post-main 阶段（App 代码）:
  5. main() 函数
  6. UIApplicationMain()
  7. AppDelegate didFinishLaunchingWithOptions
  8. 首屏 ViewController 加载和渲染
  9. 首帧渲染完成（用户可见）
```

### Pre-main 优化

**减少动态库数量**：每个动态库加载都有 IO 和符号绑定开销。合并小动态库，目标控制在 6 个以内（含系统库）。

**减少 +load 方法**：+load 在 main 之前执行，会拖慢启动。用 +initialize 替代（懒加载，首次使用时触发）：

```swift
// ❌ 避免在 +load 中执行耗时操作
@objc class BLEManager: NSObject {
    override class func load() {
        // 启动时立即执行，拖慢启动
        setupBLE()
    }
}

// ✅ 使用 +initialize（懒加载）
@objc class BLEManager: NSObject {
    private static var instance: BLEManager?

    override class func initialize() {
        // 首次使用时才执行
        if instance == nil {
            instance = BLEManager()
            instance?.setupBLE()
        }
    }
}
```

**二进制重排**：通过 Order File 调整代码在二进制中的排列顺序，减少启动时的 Page Fault：

```python
# 使用 Instruments → System Trace 分析启动过程中的 Page Fault
# 使用 Clang 的 -fsanitize-coverage 生成 Order File
# 将启动阶段调用的函数集中排列

# Order File 示例 (app.order)
_main
-[AppDelegate application:didFinishLaunchingWithOptions:]
-[BLEManager setup]
-[DeviceManager initialize]
```

### Post-main 优化

**延迟非关键初始化**：只在首屏渲染需要时执行必要初始化，其余延迟到首帧后：

```swift
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: ...) -> Bool {

        // 第一阶段：仅初始化首屏必需组件
        setupCoreComponents()

        // 第二阶段：首帧渲染后异步初始化
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.setupBLEService()
            self.setupNetworkService()
            self.setupAnalytics()
        }

        return true
    }

    private func setupCoreComponents() {
        // 仅初始化 UI 框架和首屏数据
        setupWindow()
        setupRootViewController()
    }
}
```

**启动耗时监控**：

```swift
class LaunchTimer {

    static func measure() {
        // Pre-main 耗时：通过环境变量 DYLD_PRINT_STATISTICS 获取
        // Post-main 耗时：代码埋点

        let processStart = ProcessInfo.processInfo.systemUptime

        // 在 didFinishLaunchingWithOptions 中记录
        let launchStart = Date()

        // 在首屏 viewDidLoad 中记录
        // 在首屏 viewDidAppear 中记录（首帧渲染完成）

        let totalTime = Date().timeIntervalSince(launchStart)
        print("App 启动总耗时: \(totalTime * 1000)ms")
    }

    // 使用 os_signpost 精确测量
    static func signpostBegin(_ name: StaticString) {
        os_signpost(.begin, log: OSLog.launchLog, name: name)
    }

    static func signpostEnd(_ name: StaticString) {
        os_signpost(.end, log: OSLog.launchLog, name: name)
    }
}

extension OSLog {
    static let launchLog = OSLog(subsystem: "com.iot.app", category: "Launch")
}
```

启动优化目标：冷启动（pre-main + post-main）< 400ms，热启动 < 100ms。

## 主线程性能

### RunLoop 机制

RunLoop 是 iOS 线程模型的核心，理解它对性能优化至关重要：

```swift
// RunLoop 监控：检测主线程卡顿
class RunLoopMonitor {

    private var observer: CFRunLoopObserver?
    private var activity: CFRunLoopActivity?
    private let semaphore = DispatchSemaphore(value: 0)

    func startMonitoring() {
        let observer = CFRunLoopObserverCreateWithHandler(
            kCFAllocatorDefault,
            CFRunLoopActivity.allActivities.rawValue,
            true,
            0
        ) { _, activity in
            self.activity = activity

            switch activity {
            case .entry:
                break
            case .beforeTimers:
                break
            case .beforeSources:
                // 在处理 Source 之前发信号
                self.semaphore.signal()
            case .beforeWaiting:
                break
            case .afterWaiting:
                break
            case .exit:
                break
            @unknown default:
                break
            }
        }

        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)

        // 子线程检测卡顿
        DispatchQueue.global().async {
            while true {
                // 等待 50ms（约 3 帧）
                self.semaphore.wait(timeout: .now() + 0.05)

                if self.activity == .beforeSources || self.activity == .afterWaiting {
                    // 主线程在处理 Source 或刚唤醒，检查是否卡顿
                    // 如果连续多次超时，判定为卡顿
                    self.reportHang()
                }
            }
        }
    }

    private func reportHang() {
        // 获取主线程调用栈
        let callStack = Thread.callStackSymbols
        print("⚠️ 检测到主线程卡顿")
        print("调用栈: \(callStack)")
    }
}
```

### 卡顿监测

```swift
class FPSMonitor {

    private var displayLink: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0
    private var frameCount: Int = 0
    private var fps: Double = 0

    var onFPSUpdate: ((Double) -> Void)?

    func start() {
        displayLink = CADisplayLink(target: self, selector: #selector(onDisplayLink))
        displayLink?.add(to: .main, forMode: .common)
    }

    func stop() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func onDisplayLink(_ link: CADisplayLink) {
        if lastTimestamp == 0 {
            lastTimestamp = link.timestamp
            return
        }

        frameCount += 1
        let elapsed = link.timestamp - lastTimestamp

        if elapsed >= 1.0 {
            fps = Double(frameCount) / elapsed
            frameCount = 0
            lastTimestamp = link.timestamp

            DispatchQueue.main.async {
                self.onFPSUpdate?(self.fps)
            }

            if fps < 50 {
                print("⚠️ FPS 低于 50: \(fps)")
                // 记录调用栈用于分析
            }
        }
    }
}
```

### 主线程优化实践

**耗时操作移到后台**：

```swift
// ❌ 主线程解析大量 BLE 数据
func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    guard let data = characteristic.value else { return }
    let parsed = parseSensorData(data)  // 耗时操作
    updateUI(parsed)
}

// ✅ 后台解析，主线程更新 UI
func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    guard let data = characteristic.value else { return }

    DispatchQueue.global(qos: .userInitiated).async {
        let parsed = self.parseSensorData(data)

        DispatchQueue.main.async {
            self.updateUI(parsed)
        }
    }
}
```

**对象复用**：

```swift
// 数据缓冲池：复用对象减少内存分配
class DataBufferPool<T> {
    private var pool: [T] = []
    private let factory: () -> T
    private let lock = NSLock()

    init(factory: @escaping () -> T) {
        self.factory = factory
    }

    func acquire() -> T {
        lock.lock()
        defer { lock.unlock() }

        if let item = pool.popLast() {
            return item
        }
        return factory()
    }

    func release(_ item: T) {
        lock.lock()
        defer { lock.unlock() }
        pool.append(item)
    }
}
```

## 内存管理

### ARC 与循环引用

```swift
// ❌ 循环引用导致内存泄漏
class DeviceManager {
    var onStateChanged: ((DeviceState) -> Void)?

    func setup() {
        onStateChanged = { [self] state in  // self 强引用闭包，闭包强引用 self
            self.handleStateChange(state)
        }
    }
}

// ✅ 使用 weak self 打破循环
class DeviceManager {
    var onStateChanged: ((DeviceState) -> Void)?

    func setup() {
        onStateChanged = { [weak self] state in
            self?.handleStateChange(state)
        }
    }
}
```

### OOM 崩溃分析

iOS 在内存不足时会先发出内存警告，然后杀掉 App（OOM）。需要监控和优化内存使用：

```swift
class MemoryMonitor {

    static func currentMemoryUsage() -> UInt64 {
        var taskInfo = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)

        let result = withUnsafeMutablePointer(to: &taskInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }

        return result == KERN_SUCCESS ? taskInfo.phys_footprint : 0
    }

    static func setupMemoryWarningHandler() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            let usage = currentMemoryUsage()
            let usageMB = Double(usage) / 1024 / 1024
            print("⚠️ 内存警告! 当前使用: \(usageMB)MB")

            // 清理缓存
            ImageCache.shared.clearMemory()
            DataBuffer.shared.flush()
        }
    }
}
```

### 内存泄漏检测

```swift
// DEBUG 模式下自动检测内存泄漏
class LeakDetector {

    static func setup() {
        #if DEBUG
        // 方法一：使用 NSObject 的 deallocated 检测
        // 方法二：使用 Debug Memory Graph

        // 定期检查大型对象是否被正确释放
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            self.checkCommonLeaks()
        }
        #endif
    }

    static func checkCommonLeaks() {
        // 检查 ViewModel 是否在页面销毁后仍存在
        // 检查 BLE 连接是否在断开后仍持有引用
        // 检查定时器是否在页面销毁后仍在运行
    }
}

// 使用 MallocStackLogging 追踪内存分配
// Instruments → Allocations → Mark Generation 对比前后差异
// Instruments → Leaks 自动检测泄漏
```

## Instruments 工具链

### Time Profiler

用于分析 CPU 耗时，找出热点函数：

```
使用方法:
1. Instruments → Time Profiler
2. 录制操作过程
3. 查看 Call Tree（调用树）
4. 关注:
   - 耗时最长的函数（按 Running Time 排序）
   - 主线程上的耗时操作
   - 重复调用的函数
5. 设置:
   - Separate by Thread（按线程分离）
   - Invert Call Tree（反向调用树）
   - Hide System Libraries（隐藏系统库）
```

### Allocations

用于分析内存分配：

```
使用方法:
1. Instruments → Allocations
2. 录制操作过程
3. Mark Generation（标记世代）
   - 操作前标记 Generation A
   - 执行操作（如进入/退出页面）
   - 操作后标记 Generation B
4. 分析 Generation B 中的残留对象
   - 这些对象在操作后仍存在，可能是泄漏
```

### System Trace

用于分析系统级性能问题：

```
使用方法:
1. Instruments → System Trace
2. 录制启动过程
3. 关注:
   - Main Thread 的 Thread State（运行/阻塞/等待）
   - Page Fault 数量（启动优化关键指标）
   - System Calls 耗时
   - 锁竞争（Mutex Contention）
```

### 自定义 Instruments

```swift
// 使用 os_signpost 在 Instruments 中标记自定义区间
import os.signpost

let log = OSLog(subsystem: "com.iot.app", category: "BLE")

func performBLEOperation() {
    os_signpost(.begin, log: log, name: "BLE-Write", "device:%{public}@", deviceID)

    // BLE 写入操作
    peripheral.writeValue(data, for: characteristic, type: .withResponse)

    os_signpost(.end, log: log, name: "BLE-Write")
}

// 在 Instruments → Points of Interest 中查看自定义标记
// 可以直观看到每个 BLE 操作的耗时
```

## BLE 特化性能优化

### 高频数据更新优化

```swift
class SensorDataOptimizer {

    // 数据节流：高频传感器数据降频
    private var lastUpdateTime: Date = .distantPast
    private let minUpdateInterval: TimeInterval = 0.1  // 最低 100ms 一次更新

    // 数据聚合：多次小数据合并
    private var pendingData: [SensorReading] = []

    func onSensorData(_ reading: SensorReading) {
        pendingData.append(reading)

        let now = Date()
        guard now.timeIntervalSince(lastUpdateTime) >= minUpdateInterval else {
            return  // 还没到更新时间，继续缓存
        }

        lastUpdateTime = now

        // 聚合数据
        let aggregated = aggregate(pendingData)
        pendingData.removeAll()

        // 更新 UI
        DispatchQueue.main.async {
            self.updateChart(aggregated)
        }
    }

    private func aggregate(_ readings: [SensorReading]) -> SensorReading {
        // 取平均值或最新值
        let avgTemp = readings.map { $0.temperature }.average()
        let avgHumidity = readings.map { $0.humidity }.average()
        return SensorReading(temperature: avgTemp, humidity: avgHumidity, timestamp: Date())
    }
}
```

### 设备列表性能优化

```swift
// 使用 diffable data source 优化列表更新
class DeviceListViewController: UIViewController {

    private var dataSource: UITableViewDiffableDataSource<Section, DeviceModel>!

    func updateDevices(_ devices: [DeviceModel]) {
        var snapshot = NSDiffableDataSourceSnapshot<Section, DeviceModel>()
        snapshot.appendSections([.main])
        snapshot.appendItems(devices, toSection: .main)

        // 只动画化变化的部分，避免全量刷新
        dataSource.apply(snapshot, animatingDifferences: true)
    }
}
```

## 性能优化流程

建立系统化的性能优化流程：

**基线测量**：使用 Instruments 记录当前性能基线（启动时间、FPS、内存占用、CPU 使用率）。

**瓶颈定位**：通过 Time Profiler / System Trace 找出最大的性能瓶颈，优先优化 Top 1。

**优化实施**：针对瓶颈实施优化，每次只改一个变量。

**效果验证**：重新测量性能指标，确认改善效果。

**回归测试**：确保优化没有引入功能问题。

**持续监控**：在 Release 版本中集成性能监控，持续跟踪。

## 总结

iOS 性能优化是一个系统工程，需要从启动优化（减少 pre-main 开销、延迟初始化）、主线程性能（RunLoop 监控、FPS 检测、耗时操作后台化）、内存管理（循环引用检测、OOM 预防、缓存策略）三个维度系统推进。Instruments 工具链（Time Profiler、Allocations、System Trace）是性能分析的利器，配合 os_signpost 可以精确测量自定义代码段的性能。在 IoT App 中还需要特别关注 BLE 高频数据更新的 UI 性能优化。建立"测量→定位→优化→验证→监控"的闭环流程，才能持续保持 App 的流畅体验。
