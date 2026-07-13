# iOS App 架构模式详解（MVVM 与 Clean Architecture）

## 概述

大型 IoT Companion App 通常包含设备管理、设备控制、数据可视化、用户账户等多个功能模块，如果架构不合理，代码会迅速膨胀为难以维护的"巨型控制器"。本文深入分析 MVVM 和 Clean Architecture 两种主流架构模式的原理、落地方式和适用场景，并讨论如何在实际项目中结合使用。

## 架构演进路径

从简单到复杂，iOS 架构通常经历以下演进：

```
MVC → MVP → MVVM → Clean Architecture / VIPER
```

每种架构都在解决前一种的问题：

MVC 的问题是 Massive ViewController（控制器臃肿）。MVP 将业务逻辑移到 Presenter，但 Presenter 与 View 强耦合。MVVM 通过数据绑定解耦 View 和 ViewModel。Clean Architecture 则从根本上解决依赖方向和分层问题。

## MVVM 详解

### 核心思想

MVVM 将界面逻辑分为三层：

**View（视图）**：负责 UI 渲染和用户交互，对应 UIViewController 和 UIView。不包含业务逻辑。

**ViewModel（视图模型）**：负责界面状态管理和业务逻辑处理。不持有 View 的引用，通过数据绑定驱动 UI 更新。

**Model（数据模型）**：负责数据结构和数据访问。

关键约束是依赖方向：View → ViewModel → Model。ViewModel 不知道 View 的存在，只暴露数据和命令。

### 数据绑定方式

```swift
// 方式一：闭包绑定（轻量级，无第三方依赖）

class DeviceListViewModel {
    // 输出
    var devicesDidChange: (([Device]) -> Void)?
    var loadingDidChange: ((Bool) -> Void)?
    var errorDidChange: ((String?) -> Void)?

    // 输入
    func loadDevices() {
        loadingDidChange?(true)
        deviceService.fetchDevices { [weak self] result in
            self?.loadingDidChange?(false)
            switch result {
            case .success(let devices):
                self?.devicesDidChange?(devices)
            case .failure(let error):
                self?.errorDidChange?(error.localizedDescription)
            }
        }
    }
}

// View 中绑定
class DeviceListViewController: UIViewController {
    private let viewModel = DeviceListViewModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        bindViewModel()
        viewModel.loadDevices()
    }

    private func bindViewModel() {
        viewModel.devicesDidChange = { [weak self] devices in
            DispatchQueue.main.async {
                self?.tableView.reloadData()
            }
        }
        viewModel.loadingDidChange = { [weak self] isLoading in
            DispatchQueue.main.async {
                self?.loadingIndicator.isHidden = !isLoading
            }
        }
        viewModel.errorDidChange = { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.showErrorAlert(error)
                }
            }
        }
    }
}
```

```swift
// 方式二：Combine 框架（iOS 13+，推荐）

import Combine

class DeviceControlViewModel: ObservableObject {

    // 输出（View 订阅）
    @Published var deviceState: DeviceState = .disconnected
    @Published var temperature: Double = 0
    @Published var isConnecting: Bool = false
    @Published var errorMessage: String?

    // 输入（View 调用）
    func connect(to device: Device) {
        isConnecting = true
        bleManager.connect(device) { [weak self] result in
            self?.isConnecting = false
            switch result {
            case .success:
                self?.deviceState = .connected
            case .failure(let error):
                self?.errorMessage = error.localizedDescription
            }
        }
    }

    func sendCommand(_ command: DeviceCommand) {
        bleManager.sendCommand(command) { [weak self] result in
            switch result {
            case .success(let response):
                self?.handleResponse(response)
            case .failure(let error):
                self?.errorMessage = error.localizedDescription
            }
        }
    }

    private func handleResponse(_ response: DeviceResponse) {
        switch response {
        case .temperature(let value):
            temperature = value
        case .stateChange(let state):
            deviceState = state
        }
    }

    private let bleManager = BLEManager()
    private var cancellables = Set<AnyCancellable>()
}

// SwiftUI View
struct DeviceControlView: View {
    @StateObject var viewModel = DeviceControlViewModel()

    var body: some View {
        VStack {
            if viewModel.isConnecting {
                ProgressView("连接中...")
            }

            Text("温度: \(viewModel.temperature, specifier: "%.1f")°C")
                .font(.title)

            Text("状态: \(viewModel.deviceState.description)")
                .foregroundColor(viewModel.deviceState.color)

            Button("连接设备") {
                viewModel.connect(to: targetDevice)
            }
        }
        .alert("错误", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("确定") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }
}
```

### MVVM 在 BLE 场景中的应用

```swift
// 完整的 BLE 设备控制 MVVM 架构

// MARK: - Model
struct DeviceModel: Identifiable {
    let id: UUID
    let name: String
    let type: DeviceType
    var batteryLevel: Int
    var rssi: Int
    var state: ConnectionState
}

enum DeviceType {
    case sensor, actuator, gateway
}

enum ConnectionState {
    case disconnected, connecting, connected, disconnecting
}

// MARK: - Service Layer（被 ViewModel 调用）
protocol DeviceServiceProtocol {
    func scanDevices(serviceUUID: CBUUID?) -> AnyPublisher<[DeviceModel], Never>
    func connect(_ device: DeviceModel) -> AnyPublisher<Void, Error>
    func sendCommand(_ command: Data, to device: DeviceModel) -> AnyPublisher<Data, Error>
    func disconnect(_ device: DeviceModel) -> AnyPublisher<Void, Never>
}

class BLEDeviceService: DeviceServiceProtocol {
    private let centralManager: CBCentralManager

    func scanDevices(serviceUUID: CBUUID?) -> AnyPublisher<[DeviceModel], Never> {
        // 封装 CoreBluetooth 扫描为 Combine Publisher
        // ...
    }

    func connect(_ device: DeviceModel) -> AnyPublisher<Void, Error> {
        // 封装连接逻辑为 Combine Publisher
        // ...
    }
}

// MARK: - ViewModel
class DeviceListViewModel: ObservableObject {
    @Published var devices: [DeviceModel] = []
    @Published var isScanning = false
    @Published var connectedDevice: DeviceModel?
    @Published var error: DeviceError?

    private let deviceService: DeviceServiceProtocol
    private var cancellables = Set<AnyCancellable>()

    init(deviceService: DeviceServiceProtocol = BLEDeviceService()) {
        self.deviceService = deviceService
    }

    func startScanning() {
        isScanning = true
        devices = []

        deviceService.scanDevices(serviceUUID: CBUUID(string: "FF60"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] discoveredDevices in
                self?.mergeDevices(discoveredDevices)
            }
            .store(in: &cancellables)
    }

    func stopScanning() {
        isScanning = false
        // 停止扫描...
    }

    func connect(_ device: DeviceModel) {
        deviceService.connect(device)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                switch completion {
                case .failure(let error):
                    self?.error = .connectionFailed(error)
                case .finished:
                    break
                }
            } receiveValue: { [weak self] _ in
                self?.connectedDevice = device
            }
            .store(in: &cancellables)
    }

    private func mergeDevices(_ newDevices: [DeviceModel]) {
        for newDevice in newDevices {
            if let index = devices.firstIndex(where: { $0.id == newDevice.id }) {
                devices[index] = newDevice  // 更新 RSSI 等
            } else {
                devices.append(newDevice)
            }
        }
    }
}
```

## Clean Architecture 详解

### 核心原则

Clean Architecture 的核心是依赖反转原则（Dependency Inversion Principle）：依赖方向必须从外层指向内层，内层业务逻辑不能依赖外层框架或细节。

```
┌─────────────────────────────────────────────────┐
│  Frameworks & Drivers                           │
│  (UIKit, CoreBluetooth, CoreData, HTTP)        │
│  ┌───────────────────────────────────────────┐  │
│  │  Interface Adapters                       │  │
│  │  (Controllers, Presenters, Gateways)      │  │
│  │  ┌─────────────────────────────────────┐ │  │
│  │  │  Use Cases (应用业务规则)            │ │  │
│  │  │  (Interactors)                      │ │  │
│  │  │  ┌─────────────────────────────────┐│ │  │
│  │  │  │  Entities (企业业务规则)         ││ │  │
│  │  │  │  (核心业务模型)                  ││ │  │
│  │  │  └─────────────────────────────────┘│ │  │
│  │  └─────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

依赖方向：外层 → 内层（箭头指向内层）
```

### 分层说明

**Entities（实体层）**：最核心的业务模型和规则，完全独立于任何框架和平台。

```swift
// 纯业务模型，不依赖任何框架
struct Device {
    let id: UUID
    let serialNumber: String
    let type: DeviceType
    var firmwareVersion: String
    var lastSeenAt: Date?
}

struct DeviceCommand {
    let deviceId: UUID
    let commandType: CommandType
    let payload: Data
    let timestamp: Date
}

// 业务规则
protocol DeviceRepository {
    func getDevice(by id: UUID) -> Device?
    func saveDevice(_ device: Device)
    func getAllDevices() -> [Device]
}
```

**Use Cases（用例层）**：应用级别的业务逻辑，编排实体和接口适配器。

```swift
// 连接设备用例
class ConnectDeviceUseCase {
    private let deviceRepository: DeviceRepository
    private let connectionGateway: ConnectionGateway

    init(deviceRepository: DeviceRepository, connectionGateway: ConnectionGateway) {
        self.deviceRepository = deviceRepository
        self.connectionGateway = connectionGateway
    }

    func execute(deviceId: UUID, completion: @escaping (Result<Device, Error>) -> Void) {
        guard let device = deviceRepository.getDevice(by: deviceId) else {
            completion(.failure(UseCaseError.deviceNotFound))
            return
        }

        connectionGateway.connect(device) { [weak self] result in
            switch result {
            case .success:
                var updatedDevice = device
                updatedDevice.lastSeenAt = Date()
                self?.deviceRepository.saveDevice(updatedDevice)
                completion(.success(updatedDevice))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
}

// OTA 升级用例
class StartOTAUpgradeUseCase {
    private let deviceRepository: DeviceRepository
    private let otaGateway: OTAGateway

    func execute(deviceId: UUID, firmware: Data, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let device = deviceRepository.getDevice(by: deviceId) else {
            completion(.failure(UseCaseError.deviceNotFound))
            return
        }

        // 前置条件检查
        guard device.firmwareVersion < firmware.version else {
            completion(.failure(UseCaseError.alreadyUpToDate))
            return
        }

        otaGateway.startUpgrade(device: device, firmware: firmware, completion: completion)
    }
}
```

**Interface Adapters（接口适配器层）**：将外层数据格式转换为内层可用格式。

```swift
// Gateway 接口（定义在 Use Case 层，实现在外层）
protocol ConnectionGateway {
    func connect(_ device: Device, completion: @escaping (Result<Void, Error>) -> Void)
}

protocol OTAGateway {
    func startUpgrade(device: Device, firmware: Data, completion: @escaping (Result<Void, Error>) -> Void)
}

// BLE 实现（外层）
class BLEConnectionGateway: ConnectionGateway {
    private let centralManager: CBCentralManager

    func connect(_ device: Device, completion: @escaping (Result<Void, Error>) -> Void) {
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [device.id])
        guard let peripheral = peripherals.first else {
            completion(.failure(BLEError.peripheralNotFound))
            return
        }
        // CoreBluetooth 连接逻辑...
    }
}

// Presenter — 将 Use Case 结果转换为 View 可显示的格式
class DeviceListPresenter {
    weak var view: DeviceListViewInput?

    private let connectUseCase: ConnectDeviceUseCase

    func didTapConnect(deviceId: UUID) {
        view?.showLoading()
        connectUseCase.execute(deviceId: deviceId) { [weak self] result in
            DispatchQueue.main.async {
                self?.view?.hideLoading()
                switch result {
                case .success(let device):
                    self?.view?.showDeviceConnected(device)
                case .failure(let error):
                    self?.view?.showError(error.localizedDescription)
                }
            }
        }
    }
}

// ViewModel（View Data 格式）
struct DeviceViewModel {
    let displayName: String
    let statusText: String
    let batteryDisplay: String
    let isConnectable: Bool
}
```

**Frameworks & Drivers（框架与驱动层）**：具体的技术实现，如 UIKit、CoreBluetooth、网络库等。

### 依赖注入

```swift
// 组合根（Composition Root）— 在 App 启动时组装依赖
class AppDependencies {

    // 单例服务
    lazy var centralManager: CBCentralManager = {
        CBCentralManager(delegate: nil, queue: nil)
    }()

    lazy var deviceRepository: DeviceRepository = {
        CoreDataDeviceRepository()
    }()

    lazy var connectionGateway: ConnectionGateway = {
        BLEConnectionGateway(centralManager: centralManager)
    }()

    lazy var otaGateway: OTAGateway = {
        BLEOTAGateway(centralManager: centralManager)
    }()

    // Use Cases
    lazy var connectUseCase: ConnectDeviceUseCase = {
        ConnectDeviceUseCase(
            deviceRepository: deviceRepository,
            connectionGateway: connectionGateway
        )
    }()

    lazy var otaUseCase: StartOTAUpgradeUseCase = {
        StartOTAUpgradeUseCase(
            deviceRepository: deviceRepository,
            otaGateway: otaGateway
        )
    }()
}

// ViewController 构造
func makeDeviceListVC() -> DeviceListViewController {
    let deps = AppDependencies.shared
    let presenter = DeviceListPresenter(connectUseCase: deps.connectUseCase)
    let vc = DeviceListViewController(presenter: presenter)
    presenter.view = vc
    return vc
}
```

## MVVM + Clean Architecture 组合

实际项目中，通常将 MVVM 和 Clean Architecture 结合使用：

```
View (UIViewController / SwiftUI View)
  ↕ 数据绑定
ViewModel (Published 属性 + 命令方法)
  ↕ 调用
Use Case (Interactor)
  ↕ 调用
Repository / Gateway (Protocol)
  ↕ 实现
Service (CoreBluetooth / Network / Database)
```

```swift
// 组合示例：设备控制模块
class DeviceControlViewModel: ObservableObject {

    @Published var deviceState: DeviceState = .disconnected
    @Published var sensorData: SensorData?
    @Published var isUpgrading: Bool = false
    @Published var otaProgress: Double = 0
    @Published var error: String?

    private let connectUseCase: ConnectDeviceUseCase
    private let otaUseCase: StartOTAUpgradeUseCase
    private let commandUseCase: SendCommandUseCase

    init(connectUseCase: ConnectDeviceUseCase,
         otaUseCase: StartOTAUpgradeUseCase,
         commandUseCase: SendCommandUseCase) {
        self.connectUseCase = connectUseCase
        self.otaUseCase = otaUseCase
        self.commandUseCase = commandUseCase
    }

    func connect(deviceId: UUID) {
        connectUseCase.execute(deviceId: deviceId) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let device):
                    self?.deviceState = .connected
                case .failure(let error):
                    self?.error = error.localizedDescription
                }
            }
        }
    }

    func startOTA(deviceId: UUID, firmware: Data) {
        isUpgrading = true
        otaUseCase.execute(deviceId: deviceId, firmware: firmware) { [weak self] result in
            DispatchQueue.main.async {
                self?.isUpgrading = false
                switch result {
                case .success:
                    self?.deviceState = .connected
                case .failure(let error):
                    self?.error = error.localizedDescription
                }
            }
        }
    }
}
```

## 架构选型建议

**小型项目（5-10 个页面）**：MVVM 足够。ViewModel 直接调用 Service，不需要 Use Case 层。

**中型项目（10-30 个页面）**：MVVM + 简化的 Clean Architecture。引入 Repository 和 Use Case，但不需要完整的 Presenter 层。

**大型项目（30+ 页面，多团队协作）**：完整 Clean Architecture + MVVM。严格的分层和依赖注入，确保各模块可独立开发和测试。

**关键原则**：架构选择应基于项目复杂度和团队规模，不要过度设计。最重要的原则是依赖方向（外层依赖内层）和单一职责。

## 总结

MVVM 通过数据绑定解决了 View 和业务逻辑的耦合问题，适合大多数 iOS 应用。Clean Architecture 通过严格的分层和依赖反转，适合需要长期维护和多人协作的大型项目。两者结合使用时，ViewModel 作为 Use Case 的调用者和 View 的数据源，既保持了架构的清晰性，又不至于过度复杂。在 IoT Companion App 中，这种架构使得 BLE 通信逻辑、设备业务规则和 UI 展示各司其职，便于测试、维护和扩展。
