# iOS 组件化与模块化架构实践

## 概述

随着 IoT Companion App 功能不断增长，单体架构会面临编译速度慢、冲突频繁、职责混乱等问题。组件化（模块化）是将 App 拆分为多个独立可编译的模块，每个模块负责一个功能域，通过明确定义的接口通信。本文详细讲解 iOS 组件化的设计方案、通信机制和工程实践。

## 为什么需要组件化

单体架构的主要痛点：

**编译速度**：全量编译 30+ 分钟，改动一行代码需要重新编译整个工程。

**代码冲突**：多团队在同一代码仓库工作，频繁的 merge 冲突。

**职责混乱**：设备控制代码出现在用户界面层，网络请求散落在各处，模块边界模糊。

**复用困难**：想复用某个功能模块，但它的依赖纠缠在其他模块中，无法独立提取。

**测试困难**：单元测试需要启动整个 App 环境，难以隔离测试单个功能。

组件化的目标是将 App 拆分为高内聚、低耦合的模块，每个模块可以独立编译、独立测试、独立开发。

## 模块划分策略

### 按业务域划分

IoT Companion App 典型的模块划分：

```
App (主工程，组装各模块)
  ├── Module: DeviceManager（设备管理）
  │     ├── 设备扫描、连接、列表管理
  │     └── 依赖: BleService, Core
  ├── Module: DeviceControl（设备控制）
  │     ├── 设备控制面板、状态展示
  │     └── 依赖: DeviceManager, Core
  ├── Module: OTAUpgrade（固件升级）
  │     ├── OTA 流程管理、进度展示
  │     └── 依赖: DeviceManager, BleService, Core
  ├── Module: UserProfile（用户中心）
  │     ├── 登录、注册、个人设置
  │     └── 依赖: NetworkService, Core
  ├── Module: DataVisualization（数据可视化）
  │     ├── 传感器数据图表、历史数据
  │     └── 依赖: DeviceManager, Core
  ├── Service: BleService（蓝牙服务）
  │     ├── CoreBluetooth 封装、BLE 协议
  │     └── 依赖: Core
  ├── Service: NetworkService（网络服务）
  │     ├── HTTP 请求、API 封装
  │     └── 依赖: Core
  └── Core（基础模块）
        ├── 通用工具、扩展、基础模型
        └── 无依赖（零依赖模块）
```

### 模块层级

```
Layer 1: Core（基础层）
  - 通用工具类、UI 扩展、基础模型
  - 无任何业务依赖

Layer 2: Services（服务层）
  - BleService、NetworkService、StorageService
  - 依赖 Core

Layer 3: Features（业务层）
  - DeviceManager、DeviceControl、OTAUpgrade 等
  - 依赖 Services 和 Core

Layer 4: App（应用层）
  - TabBar、导航、模块组装
  - 依赖所有 Feature 模块
```

依赖规则：上层可以依赖下层，同层之间不能互相依赖。Feature 模块之间通过通信机制交互，不直接引用。

## 模块间通信机制

### 方案一：Protocol-Mediator（协议中介者）

通过协议定义模块对外暴露的接口，由 Mediator 负责路由和实例化：

```swift
// Core 模块中定义 Mediator
public protocol ModuleMediator {
    func register<T>(_ type: T.Type, factory: @escaping () -> T)
    func resolve<T>(_ type: T.Type) -> T?
}

public class AppMediator: ModuleMediator {
    private var factories: [String: () -> Any] = [:]

    public init() {}

    public func register<T>(_ type: T.Type, factory: @escaping () -> T) {
        let key = String(describing: type)
        factories[key] = factory
    }

    public func resolve<T>(_ type: T.Type) -> T? {
        let key = String(describing: type)
        return factories[key]?() as? T
    }
}

// 全局访问点
public let mediator: ModuleMediator = AppMediator()
```

```swift
// DeviceManager 模块定义对外接口
public protocol DeviceModuleInterface {
    func getDeviceList() -> [Device]
    func getConnectedDevices() -> [Device]
    func presentDeviceList(from vc: UIViewController)
}

// DeviceManager 模块实现
public class DeviceModule: DeviceModuleInterface {
    public func getDeviceList() -> [Device] {
        // 返回设备列表
    }

    public func getConnectedDevices() -> [Device] {
        // 返回已连接设备
    }

    public func presentDeviceList(from vc: UIViewController) {
        let listVC = DeviceListViewController()
        vc.navigationController?.pushViewController(listVC, animated: true)
    }
}

// 在 App 启动时注册
func setupModules() {
    mediator.register(DeviceModuleInterface.self) {
        DeviceModule()
    }
}
```

```swift
// DeviceControl 模块通过 Mediator 调用 DeviceManager
class DeviceControlViewModel {
    func loadDevices() {
        if let deviceModule = mediator.resolve(DeviceModuleInterface.self) {
            let devices = deviceModule.getConnectedDevices()
            // 使用设备数据
        }
    }
}
```

### 方案二：URL Router

通过 URL Scheme 实现页面跳转和服务调用：

```swift
// Core 模块定义 Router
public protocol URLRoutable {
    static var scheme: String { get }
    static func handle(url: URL, params: [String: Any], completion: ((Any?) -> Void)?)
}

public class AppRouter {
    private var handlers: [String: URLRoutable.Type] = [:]

    public init() {}

    public func register(_ handler: URLRoutable.Type) {
        handlers[handler.scheme] = handler
    }

    public func open(_ urlString: String,
                     params: [String: Any] = [:],
                     completion: ((Any?) -> Void)? = nil) {
        guard let url = URL(string: urlString),
              let scheme = url.scheme,
              let handler = handlers[scheme] else {
            completion?(nil)
            return
        }
        handler.handle(url: url, params: params, completion: completion)
    }
}

public let router = AppRouter()
```

```swift
// OTAUpgrade 模块注册路由
public class OTAModuleRouter: URLRoutable {
    public static var scheme: String = "ota"

    public static func handle(url: URL, params: [String: Any], completion: ((Any?) -> Void)?) {
        guard let host = url.host else { return }

        switch host {
        case "start":
            guard let deviceId = params["deviceId"] as? UUID,
                  let firmwareData = params["firmware"] as? Data else {
                completion?(nil)
                return
            }
            let otaVC = OTAViewController(deviceId: deviceId, firmware: firmwareData)
            // 获取顶层 VC 并 push
            if let topVC = UIApplication.shared.topViewController() {
                topVC.navigationController?.pushViewController(otaVC, animated: true)
            }
            completion?(true)

        case "history":
            let historyVC = OTAHistoryViewController()
            if let topVC = UIApplication.shared.topViewController() {
                topVC.navigationController?.pushViewController(historyVC, animated: true)
            }
            completion?(true)

        default:
            completion?(nil)
        }
    }
}

// 注册
router.register(OTAModuleRouter.self)

// 其他模块调用
router.open("ota://start", params: ["deviceId": device.id, "firmware": firmwareData])
```

### 方案三：Notification + EventBus

适用于松耦合的事件通知场景：

```swift
// Core 模块定义全局事件
extension Notification.Name {
    static let deviceConnected = Notification.Name("DeviceConnected")
    static let deviceDisconnected = Notification.Name("DeviceDisconnected")
    static let deviceDataReceived = Notification.Name("DeviceDataReceived")
    static let otaProgressUpdated = Notification.Name("OTAProgressUpdated")
}

// DeviceManager 模块发送事件
class DeviceManager {
    func onDeviceConnected(_ device: Device) {
        NotificationCenter.default.post(
            name: .deviceConnected,
            object: nil,
            userInfo: ["deviceId": device.id, "deviceName": device.name]
        )
    }
}

// DataVisualization 模块监听事件
class DataChartViewModel {
    init() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(onDeviceDataReceived),
            name: .deviceDataReceived, object: nil
        )
    }

    @objc func onDeviceDataReceived(_ notification: Notification) {
        guard let data = notification.userInfo?["data"] as? SensorData else { return }
        updateChart(data)
    }
}
```

### 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| Protocol-Mediator | 类型安全，编译期检查，支持返回值 | 需要注册管理，耦合略高 | 模块间方法调用 |
| URL Router | 解耦彻底，支持动态调用，支持 deep link | 非类型安全，参数传递受限 | 页面跳转 |
| Notification/EventBus | 完全解耦，一对多通信 | 无法获取返回值，调试困难 | 事件通知 |

实践中通常组合使用：Protocol-Mediator 处理模块间方法调用，URL Router 处理页面跳转和 deep link，Notification 处理广播事件。

## 工程配置

### CocoaPods 模块化

```ruby
# Podfile
target 'IoTCompanionApp' do
  # 内部模块
  pod 'IoTCore', :path => './Modules/Core'
  pod 'IoTBleService', :path => './Modules/BleService'
  pod 'IoTDeviceManager', :path => './Modules/DeviceManager'
  pod 'IoTDeviceControl', :path => './Modules/DeviceControl'
  pod 'IoTOTAUpgrade', :path => './Modules/OTAUpgrade'

  # 第三方依赖
  pod 'Alamofire'
  pod 'SnapKit'
end
```

### Swift Package Manager

```swift
// Modules/Core/Package.swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IoTCore",
    products: [
        .library(name: "IoTCore", targets: ["IoTCore"]),
    ],
    targets: [
        .target(name: "IoTCore", path: "Sources/IoTCore"),
        .testTarget(name: "IoTCoreTests", dependencies: ["IoTCore"]),
    ]
)

// Modules/BleService/Package.swift
let package = Package(
    name: "IoTBleService",
    products: [
        .library(name: "IoTBleService", targets: ["IoTBleService"]),
    ],
    dependencies: [
        .package(path: "../Core"),  // 依赖 Core
    ],
    targets: [
        .target(name: "IoTBleService",
                dependencies: ["IoTCore"],
                path: "Sources/IoTBleService"),
    ]
)
```

### 模块目录结构

```
Modules/
├── Core/
│   ├── Package.swift
│   ├── Sources/
│   │   └── IoTCore/
│   │       ├── Extensions/      — UIKit/Foundation 扩展
│   │       ├── Models/          — 基础模型
│   │       ├── Utilities/       — 通用工具
│   │       └── Protocols/       — 全局协议
│   └── Tests/
│       └── IoTCoreTests/
│
├── BleService/
│   ├── Package.swift
│   ├── Sources/
│   │   └── IoTBleService/
│   │       ├── Central/         — CBCentralManager 封装
│   │       ├── Peripheral/      — CBPeripheral 管理
│   │       ├── Protocol/        — BLE 通信协议
│   │       └── OTA/             — OTA 升级实现
│   └── Tests/
│       └── IoTBleServiceTests/
│
├── DeviceManager/
│   ├── Package.swift
│   ├── Sources/
│   │   └── IoTDeviceManager/
│   │       ├── Models/          — Device 业务模型
│   │       ├── Repository/      — 设备数据仓库
│   │       ├── Manager/         — 设备管理器
│   │       └── Interface/       — 对外接口
│   └── Tests/
│
└── DeviceControl/
    ├── Package.swift
    ├── Sources/
    │   └── IoTDeviceControl/
    │       ├── ViewModels/      — MVVM ViewModel
    │       ├── Views/           — UI 视图
    │       └── UseCases/        — 业务用例
    └── Tests/
```

## 公共依赖管理

### 第三方库下沉

多个模块依赖同一个第三方库时，应在 Core 模块中统一引入并封装：

```swift
// Core 模块封装网络请求（不直接暴露 Alamofire）
public protocol NetworkClient {
    func request<T: Decodable>(_ endpoint: Endpoint<T>) -> AnyPublisher<T, Error>
}

public class AppNetworkClient: NetworkClient {
    // 内部使用 Alamofire，但不暴露给上层
    private let session = Session()

    public func request<T: Decodable>(_ endpoint: Endpoint<T>) -> AnyPublisher<T, Error> {
        // 实现...
    }
}
```

### 避免依赖环

模块间依赖必须是 DAG（有向无环图）。如果 Module A 依赖 Module B，B 不能再依赖 A。如果确实需要双向交互，通过协议或事件总线解耦。

## 测试优势

组件化后可以针对单个模块进行独立测试：

```swift
// BleService 模块的单元测试
import XCTest
@testable import IoTBleService

class BLEManagerTests: XCTestCase {
    var sut: BLEManager!
    var mockCentralManager: MockCBCentralManager!

    override func setUp() {
        super.setUp()
        mockCentralManager = MockCBCentralManager()
        sut = BLEManager(centralManager: mockCentralManager)
    }

    func testStartScanning_WhenPoweredOn_ShouldStartScan() {
        // Given
        mockCentralManager.state = .poweredOn

        // When
        sut.startScanning(serviceUUID: CBUUID(string: "FF60"))

        // Then
        XCTAssertTrue(mockCentralManager.isScanning)
        XCTAssertEqual(mockCentralManager.scanServices, [CBUUID(string: "FF60")])
    }

    func testOnDeviceDiscovered_ShouldUpdateDeviceList() {
        // Given
        let mockPeripheral = MockCBPeripheral(identifier: UUID(), name: "TestDevice")

        // When
        mockCentralManager.simulateDiscovered(peripheral: mockPeripheral, rssi: -50)

        // Then
        XCTAssertEqual(sut.discoveredDevices.count, 1)
        XCTAssertEqual(sut.discoveredDevices.first?.name, "TestDevice")
    }
}
```

## 渐进式组件化

不必一次性重构整个 App。推荐的渐进路径：

第一步：提取 Core 模块，将通用工具、扩展、基础模型迁移到独立 framework。

第二步：提取 Service 层，将 CoreBluetooth 封装、网络请求封装为独立模块。

第三步：逐个提取 Feature 模块。从耦合最少的功能开始，如设置页面、关于页面。

第四步：引入通信机制，将模块间的直接调用替换为 Protocol-Mediator 或 Router。

第五步：建立模块模板和规范，新功能直接按模块化结构开发。

## 总结

组件化的核心价值在于将复杂系统拆分为可独立开发、编译、测试的模块。关键设计决策包括：按业务域划分模块、严格管理依赖方向（上层依赖下层）、选择合适的模块间通信机制（Protocol-Mediator + URL Router + EventBus 组合）、以及公共依赖的统一管理。对于 IoT Companion App，典型拆分为 Core → Services（BLE/Network）→ Features（DeviceManager/Control/OTA）三层结构，既保证了模块的独立性和可测试性，又通过通信机制保持了功能间的协作能力。
