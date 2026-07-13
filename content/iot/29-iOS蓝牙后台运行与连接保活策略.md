# iOS 蓝牙后台运行与连接保活策略

## 概述

iOS 对后台应用有严格的资源限制，蓝牙应用在后台面临扫描受限、连接断开、数据传输被挂起等问题。理解 iOS 后台蓝牙机制并设计合理的保活策略，是 IoT Companion App 在实际使用中保持稳定连接的关键。

## iOS 后台蓝牙机制

### Background Modes

要在后台使用 CoreBluetooth，必须在项目的 Capabilities 中开启 Background Modes，勾选 `Uses Bluetooth LE accessories`：

```
Target → Signing & Capabilities → Background Modes
  ☑ Uses Bluetooth LE accessories (bluetooth-central)
```

开启后，系统会在 App 挂起时仍保持 BLE 连接，并允许处理蓝牙相关的系统事件。

### 后台状态与蓝牙行为

iOS App 有以下几种运行状态，蓝牙行为各不相同：

**Foreground（前台）**：所有 CoreBluetooth API 正常工作，扫描无限制，传输无限制。

**Background（后台）**：App 被挂起但仍在内存中。开启了 bluetooth-central 后台模式后：
- 已建立的连接仍然保持
- 可以收到 Notify/Indicate 数据
- 可以收到连接断开事件
- 扫描行为被限制：必须指定 Service UUID 过滤，不能传 nil
- 扫描响应间隔被系统大幅拉长（从毫秒级到分钟级）
- Write Without Response 可能被延迟

**Suspended（挂起）**：系统可能在内存压力下将后台 App 从挂起状态终止。此时所有蓝牙连接被断开。系统会在特定条件下（如收到 Notify）短暂唤醒 App 处理事件。

**Terminated（终止）**：App 被完全杀死。如果之前设置了 `CBConnectPeripheralOptionNotifyOnConnectionKey` 等选项，系统会在蓝牙事件发生时重新启动 App。

### 后台扫描限制

```swift
// 前台扫描 — 可以使用 nil 过滤
centralManager.scanForPeripherals(withServices: nil, options: nil)

// 后台扫描 — 必须指定 Service UUID
let serviceUUID = CBUUID(string: "FF60")
centralManager.scanForPeripherals(withServices: [serviceUUID], options: nil)
// 如果传 nil，后台不会收到任何广播
```

后台扫描的广播响应延迟：

```
前台扫描：广播间隔 ≈ 20ms-100ms（设备端配置）
后台扫描：iOS 将扫描窗口拉长，可能 10-60 秒才发现设备
```

## 连接保活策略

### 策略一：State Restoration（状态恢复）

State Restoration 是 iOS 蓝牙后台保活的核心机制。当 App 被系统终止后，蓝牙事件可以重新唤醒 App 并恢复蓝牙状态。

```swift
// 1. 初始化时启用状态恢复
class BLECentral: NSObject, CBCentralManagerDelegate {

    var centralManager: CBCentralManager!
    var peripherals: [UUID: CBPeripheral] = [:]

    override init() {
        super.init()

        // 使用 restoration identifier 初始化
        centralManager = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [
                CBCentralManagerOptionShowPowerAlertKey: false
            ]
        )
        // 注意：restoration identifier 应在 CBCentralManager 初始化时设置
    }

    // 使用 restoration 方式初始化
    func restoreCentralManager() {
        centralManager = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [
                CBCentralManagerOptionShowPowerAlertKey: true,
                CBCentralManagerOptionRestoreIdentifierKey: "com.iot.ble.central"
            ]
        )
    }

    // 2. 实现状态恢复代理方法
    func centralManager(_ central: CBCentralManager,
                        willRestoreState dict: [String: Any]) {

        // 恢复 Peripherals
        if let restoredPeripherals = dict[CBCentralManagerRestoredStatePeripheralsKey]
            as? [CBPeripheral] {
            for peripheral in restoredPeripherals {
                peripherals[peripheral.identifier] = peripheral
                peripheral.delegate = self

                switch peripheral.state {
                case .connected:
                    // 连接仍然保持，恢复交互
                    restorePeripheralConnection(peripheral)
                case .connecting:
                    // 正在连接中，等待回调
                    break
                default:
                    // 需要重新连接
                    centralManager.connect(peripheral, options: nil)
                }
            }
        }

        // 恢复扫描状态
        if let restoredScanServices = dict[CBCentralManagerRestoredStateScanServicesKey]
            as? [CBUUID] {
            // 之前正在扫描的 Service UUIDs
            centralManager.scanForPeripherals(withServices: restoredScanServices, options: nil)
        }
    }
}
```

### 策略二：自动重连机制

设备断开后的自动重连是保活的关键：

```swift
class ReconnectionManager {

    private let centralManager: CBCentralManager
    private var targetIdentifier: UUID?
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 10
    private var reconnectTimer: DispatchSourceTimer?

    // 指数退避策略
    private let baseDelay: TimeInterval = 1.0
    private let maxDelay: TimeInterval = 60.0

    init(centralManager: CBCentralManager) {
        self.centralManager = centralManager
    }

    func startReconnection(for identifier: UUID) {
        targetIdentifier = identifier
        reconnectAttempts = 0
        scheduleReconnect()
    }

    func stopReconnection() {
        reconnectTimer?.cancel()
        reconnectTimer = nil
        targetIdentifier = nil
    }

    private func scheduleReconnect() {
        guard reconnectAttempts < maxReconnectAttempts,
              let identifier = targetIdentifier else {
            // 超过最大重试次数，切换到扫描模式
            startScanningForDevice()
            return
        }

        // 指数退避：delay = min(baseDelay * 2^attempts, maxDelay)
        let delay = min(baseDelay * pow(2.0, Double(reconnectAttempts)), maxDelay)
        reconnectAttempts += 1

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + delay)
        timer.setEventHandler { [weak self] in
            self?.attemptReconnect(identifier: identifier)
        }
        timer.resume()
        reconnectTimer = timer
    }

    private func attemptReconnect(identifier: UUID) {
        // 尝试从系统已知的 peripherals 中恢复连接
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [identifier])
        if let peripheral = peripherals.first {
            centralManager.connect(peripheral, options: [
                CBConnectPeripheralOptionNotifyOnConnectionKey: true,
                CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
                CBConnectPeripheralOptionNotifyOnNotificationKey: true
            ])
        } else {
            // 系统不认识此 peripheral，切换到扫描
            startScanningForDevice()
        }
    }

    private func startScanningForDevice() {
        // 回退到扫描模式
        centralManager.scanForPeripherals(
            withServices: [CBUUID(string: "FF60")],
            options: [
                CBCentralManagerScanOptionAllowDuplicatesKey: true
            ]
        )
    }

    func onConnected() {
        stopReconnection()
    }

    func onDisconnected() {
        if let identifier = targetIdentifier {
            scheduleReconnect()
        }
    }
}
```

### 策略三：连接参数优化

设备端的连接参数对后台保活影响很大：

```
连接间隔（Connection Interval）：
  - 前台频繁通信：7.5ms-15ms（高吞吐）
  - 后台保活：500ms-1000ms（低功耗）

Slave Latency：
  - 设备可以跳过多个连接事件不响应
  - 后台保活设为 4-10，减少射频唤醒次数

Supervision Timeout：
  - 建议设为 6-10 秒
  - 太短：后台连接容易被误判为超时断开
  - 太长：真正断开后重连延迟
```

### 策略四：心跳保活

```swift
class HeartbeatManager {

    private let peripheral: CBPeripheral
    private let heartbeatChar: CBCharacteristic
    private var heartbeatTimer: DispatchSourceTimer?
    private var lastHeartbeatTime: Date?
    private let heartbeatInterval: TimeInterval = 10  // 10秒
    private let heartbeatTimeout: TimeInterval = 30   // 30秒无响应判定断开

    init(peripheral: CBPeripheral, heartbeatChar: CBCharacteristic) {
        self.peripheral = peripheral
        self.heartbeatChar = heartbeatChar
    }

    func start() {
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timer.schedule(deadline: .now() + heartbeatInterval,
                      repeating: heartbeatInterval)
        timer.setEventHandler { [weak self] in
            self?.sendHeartbeat()
        }
        timer.resume()
        heartbeatTimer = timer
    }

    func stop() {
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
    }

    private func sendHeartbeat() {
        let heartbeatData = Data([0xAA, 0x55])
        peripheral.writeValue(heartbeatData, for: heartbeatChar, type: .withResponse)

        // 检查超时
        if let lastTime = lastHeartbeatTime {
            if Date().timeIntervalSince(lastTime) > heartbeatTimeout {
                // 心跳超时，判定连接已断开
                NotificationCenter.default.post(
                    name: .BLEHeartbeatTimeout,
                    object: peripheral
                )
            }
        }
    }

    func onHeartbeatReceived() {
        lastHeartbeatTime = Date()
    }
}
```

## 后台通知处理

### Notify 唤醒机制

当 App 在后台时，如果设备通过 Notify 发送数据，iOS 会短暂唤醒 App 处理 `didUpdateValueFor` 回调：

```swift
func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    guard let data = characteristic.value else { return }

    // 即使在后台，此回调也会被调用
    // 但处理时间有限（约 10 秒），需要快速处理

    handleDeviceNotification(data)

    // 如果需要执行长时间任务，请求后台执行时间
    var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    backgroundTaskID = UIApplication.shared.beginBackgroundTask {
        // 超时清理
        UIApplication.shared.endBackgroundTask(backgroundTaskID)
    }

    DispatchQueue.global(qos: .utility).async {
        // 执行数据处理
        self.processData(data)

        DispatchQueue.main.async {
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
        }
    }
}
```

### 后台通知提示

通过连接选项可以让系统在后台收到 Notify 时显示通知：

```swift
// 连接时设置 Notify 通知选项
centralManager.connect(peripheral, options: [
    CBConnectPeripheralOptionNotifyOnNotificationKey: true
])
// 当 App 在后台收到 Notify 时，系统会显示本地通知
```

## 实际场景与解决方案

### 场景一：后台断连后自动重连

用户打开 App 连接设备后切换到其他 App，设备断开后需要自动重连：

```swift
// 1. 开启 bluetooth-central 后台模式
// 2. 使用 State Restoration
// 3. 在 didDisconnectPeripheral 中启动重连

func centralManager(_ central: CBCentralManager,
                    didDisconnectPeripheral peripheral: CBPeripheral,
                    error: Error?) {
    // 启动自动重连
    reconnectionManager.startReconnection(for: peripheral.identifier)
}
```

### 场景二：App 被杀死后恢复连接

系统在内存压力下终止了 App，用户打开设备触发蓝牙事件重新唤醒 App：

```swift
// AppDelegate 中处理状态恢复
func application(_ application: UIApplication,
                 didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

    // 检查是否由蓝牙事件唤醒
    if let centralManagerIdentifiers = launchOptions?[.bluetoothCentralsKey] as? [String] {
        // App 由蓝牙系统事件唤醒
        for identifier in centralManagerIdentifiers {
            // 重新初始化对应 CBCentralManager，触发 willRestoreState
            bleCentral.restoreCentralManager()
        }
    }

    return true
}
```

### 场景三：保持长时间后台连接

某些场景（如智能家居门锁）需要长时间保持连接：

```swift
class PersistentConnectionManager {

    private let centralManager: CBCentralManager
    private var connectedPeripheral: CBPeripheral?
    private var reconnectionManager: ReconnectionManager?

    func connect(_ peripheral: CBPeripheral) {
        connectedPeripheral = peripheral
        peripheral.delegate = self

        centralManager.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
            CBConnectPeripheralOptionNotifyOnNotificationKey: true
        ])
    }

    // App 进入后台时调用
    func onAppDidEnterBackground() {
        // 降低心跳频率
        heartbeatManager?.reduceFrequency()
        // 确保连接选项已设置
        guard let peripheral = connectedPeripheral,
              peripheral.state == .connected else { return }
        // 连接已在后台模式下保持，无需额外操作
    }

    // App 回到前台时调用
    func onAppWillEnterForeground() {
        // 恢复正常心跳频率
        heartbeatManager?.restoreFrequency()

        // 检查连接状态
        if let peripheral = connectedPeripheral,
           peripheral.state != .connected {
            reconnectionManager?.startReconnection(for: peripheral.identifier)
        }
    }
}
```

## 常见问题与陷阱

**1. State Restoration 未触发**：`willRestoreState` 只在 App 被系统因蓝牙事件唤醒时调用。如果用户手动打开 App，不会触发恢复。需要在 `didFinishLaunchingWithOptions` 中检查蓝牙启动选项。

**2. 后台连接频繁断开**：可能是连接参数中 Supervision Timeout 设置过短。建议后台保活场景设为 6 秒以上。也可能是设备端没有配置好 slave latency，导致设备频繁唤醒消耗电池。

**3. 后台扫描无法发现设备**：必须指定 Service UUID。另外，后台扫描响应很慢，可能需要等待 10-60 秒。如果需要快速发现，考虑引导用户回到前台。

**4. 后台 Write 延迟**：iOS 后台会延迟 Write Without Response 的发送。如果需要可靠传输，使用 Write With Response，但吞吐会大幅降低。

**5. App 被 killed 后无法自动重连**：iOS 不允许 App 在被用户手动杀死后自动重启。只有系统因蓝牙事件唤醒才能恢复。如果用户手动杀死了 App，需要引导用户重新打开。

## 总结

iOS 蓝牙后台运行的核心是 Background Modes（bluetooth-central）和 State Restoration 机制。通过合理的连接选项配置、自动重连策略（指数退避 + 回退扫描）、心跳保活和连接参数优化，可以在 iOS 严格的后台限制下实现较稳定的 BLE 连接维持。但需要注意，iOS 的后台策略会随系统版本更新而变化，且没有任何方案能保证 100% 后台保活——最可靠的方案始终是引导用户保持 App 在前台运行。
