# CoreBluetooth 框架核心 API 与状态机详解

## 概述

CoreBluetooth 是 Apple 提供的用于与 BLE（Bluetooth Low Energy）设备通信的原生框架。它封装了 BLE 协议栈的底层细节，提供了面向对象的 API。深入理解 CoreBluetooth 的核心 API、状态机流转以及异步回调时序，是开发稳定可靠的 IoT Companion App 的基础。

## CoreBluetooth 架构总览

CoreBluetooth 框架主要涉及两类角色：

**Central（中心设备）**：通常是 iPhone/iPad，作为 BLE 连接的发起方，扫描外围设备、建立连接、读写数据。对应 `CBCentralManager` 和 `CBPeer`/`CBPeripheral`。

**Peripheral（外围设备）**：被连接的 BLE 设备，如智能手环、温度传感器等，对外广播自身存在，响应 Central 的请求。对应 `CBPeripheralManager`（当 iOS 设备作为 Peripheral 时使用）。

在 IoT Companion App 场景中，iOS 设备绝大多数情况下扮演 Central 角色。

## CBCentralManager 状态机

`CBCentralManager` 是 Central 角色的核心管理类，它有一个明确的状态机：

```
unknown → resetting → poweredOn
                  ↗
unknown → poweredOff
                  ↘
unknown → unauthorized
                  ↗
unknown → unsupported
```

### 状态定义

```swift
enum CBManagerState: Int {
    case unknown = 0        // 状态未知，初始化中
    case resetting = 1      // 蓝牙模块正在重置
    case unsupported = 2    // 设备不支持蓝牙
    case unauthorized = 3   // 用户未授权使用蓝牙
    case poweredOff = 4     // 蓝牙已关闭
    case poweredOn = 5      // 蓝牙已开启，可用
}
```

### 状态监听

```swift
class BLEManager: NSObject, CBCentralManagerDelegate {
    var centralManager: CBCentralManager!

    override init() {
        super.init()
        // 初始化时会异步触发状态更新
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            // 蓝牙可用，可以开始扫描
            startScanning()
        case .poweredOff:
            // 提示用户打开蓝牙
            showBluetoothOffAlert()
        case .unauthorized:
            // 引导用户去设置授权
            showPermissionAlert()
        case .resetting:
            // 蓝牙模块重置中，等待恢复
            break
        default:
            break
        }
    }
}
```

关键点：`CBCentralManager` 初始化后不会立即处于 `poweredOn` 状态，必须等待 `centralManagerDidUpdateState` 回调。在此回调之前调用任何扫描/连接方法都会被忽略或抛出异常。

## 扫描设备

```swift
// 基本扫描
centralManager.scanForPeripherals(withServices: nil, options: nil)

// 按 Service UUID 过滤扫描（推荐）
let heartRateService = CBUUID(string: "180D")
centralManager.scanForPeripherals(
    withServices: [heartRateService],
    options: [
        CBCentralManagerScanOptionAllowDuplicatesKey: true  // 接收重复广播
    ]
)
```

### 扫描回调

```swift
func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
) {
    // peripheral: 发现的设备对象
    // advertisementData: 广播包数据，包含 Service UUIDs、Local Name 等
    // RSSI: 信号强度（dBm），越接近 0 信号越强

    let name = peripheral.name ?? "Unknown"
    let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
    let isConnectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool

    print("发现设备: \(name), RSSI: \(RSSI), 可连接: \(isConnectable ?? false)")
}
```

### 扫描策略与功耗

扫描是高功耗操作，应遵循以下原则：

```swift
// 1. 带过滤的扫描，减少无效回调
centralManager.scanForPeripherals(
    withServices: [targetServiceUUID],
    options: nil
)

// 2. 设置扫描超时，避免长时间扫描
DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
    self?.centralManager.stopScan()
    // 处理扫描超时逻辑
}

// 3. 找到目标设备后立即停止扫描
func centralManager(_ central: CBCentralManager,
                    didDiscover peripheral: CBPeripheral,
                    advertisementData: [String: Any],
                    rssi RSSI: NSNumber) {
    if peripheral.identifier == targetIdentifier {
        centralManager.stopScan()
        centralManager.connect(peripheral, options: nil)
    }
}
```

## 连接设备

### 建立连接

```swift
centralManager.connect(peripheral, options: [
    CBConnectPeripheralOptionNotifyOnConnectionKey: true,
    CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
    CBConnectPeripheralOptionNotifyOnNotificationKey: true
])
```

连接选项说明：
- `NotifyOnConnectionKey`：连接成功后显示通知
- `NotifyOnDisconnectionKey`：App 在后台时断开连接显示通知
- `NotifyOnNotificationKey`：App 在挂起时收到 notify 数据显示通知

### 连接回调

```swift
func centralManager(_ central: CBCentralManager,
                    didConnect peripheral: CBPeripheral) {
    // 连接成功，开始发现服务
    peripheral.delegate = self
    peripheral.discoverServices(nil)  // nil = 发现所有服务
}

func centralManager(_ central: CBCentralManager,
                    didFailToConnect peripheral: CBPeripheral,
                    error: Error?) {
    // 连接失败处理
    if let error = error {
        print("连接失败: \(error.localizedDescription)")
    }
    // 可实现重连逻辑
}

func centralManager(_ central: CBCentralManager,
                    didDisconnectPeripheral peripheral: CBPeripheral,
                    error: Error?) {
    if let error = error {
        // 异常断开
        print("设备断开: \(error.localizedDescription)")
    } else {
        // 主动断开
        print("设备主动断开")
    }
    // 可根据业务需求决定是否自动重连
}
```

## 发现服务与特征值

BLE 的数据模型是树形结构：Peripheral → Service → Characteristic → Descriptor。每一层的发现都是异步的，必须在回调中继续下一层。

### 发现服务

```swift
func peripheral(_ peripheral: CBPeripheral,
                didDiscoverServices error: Error?) {
    guard let services = peripheral.services else { return }
    for service in services {
        print("发现服务: \(service.uuid)")
        // 发现该服务下的所有特征值
        peripheral.discoverCharacteristics(nil, for: service)
    }
}
```

### 发现特征值

```swift
func peripheral(_ peripheral: CBPeripheral,
                didDiscoverCharacteristicsFor service: CBService,
                error: Error?) {
    guard let characteristics = service.characteristics else { return }
    for char in characteristics {
        print("发现特征值: \(char.uuid), properties: \(char.properties)")

        // 根据 properties 订阅 notify
        if char.properties.contains(.notify) {
            peripheral.setNotifyValue(true, for: char)
        }

        // 根据 properties 读取值
        if char.properties.contains(.read) {
            peripheral.readValue(for: char)
        }
    }
}
```

### Properties 详解

```swift
// CBCharacteristicProperties 是 OptionSet
static var broadcast: CBCharacteristicProperties       // 0x01
static var read: CBCharacteristicProperties            // 0x02
static var writeWithoutResponse: CBCharacteristicProperties  // 0x04
static var write: CBCharacteristicProperties           // 0x08
static var notify: CBCharacteristicProperties          // 0x10
static var indicate: CBCharacteristicProperties        // 0x20
static var authenticatedSignedWrites: CBCharacteristicProperties  // 0x40
static var extendedProperties: CBCharacteristicProperties  // 0x80
```

常见用法：notify 用于设备主动推送数据（如传感器数据），write 用于下发命令，read 用于读取状态。

## 数据读写

### 读取数据

```swift
// 发起读取
peripheral.readValue(for: characteristic)

// 接收数据
func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    guard let data = characteristic.value else { return }

    switch characteristic.uuid {
    case CBUUID(string: "FFE1"):
        handleCustomData(data)
    case CBUUID(string: "2A19"):  // Battery Level
        let batteryLevel = data.first ?? 0
        print("电量: \(batteryLevel)%")
    default:
        break
    }
}
```

### 写入数据

```swift
// 有响应写入（可靠传输）
peripheral.writeValue(data, for: characteristic, type: .withResponse)

// 无响应写入（快速传输，不保证到达）
peripheral.writeValue(data, for: characteristic, type: .withoutResponse)

// 有响应写入的回调
func peripheral(_ peripheral: CBPeripheral,
                didWriteValueFor characteristic: CBCharacteristic,
                error: Error?) {
    if let error = error {
        print("写入失败: \(error.localizedDescription)")
    } else {
        print("写入成功")
    }
}
```

### 订阅 Notify

```swift
// 开启订阅
peripheral.setNotifyValue(true, for: characteristic)

// 订阅状态回调
func peripheral(_ peripheral: CBPeripheral,
                didUpdateNotificationStateFor characteristic: CBCharacteristic,
                error: Error?) {
    if let error = error {
        print("订阅失败: \(error.localizedDescription)")
        return
    }
    if characteristic.isNotifying {
        print("Notify 已开启")
    } else {
        print("Notify 已关闭")
    }
}

// 订阅后数据通过 didUpdateValueFor 回调持续返回
```

## 异步回调时序总览

完整的 BLE 交互时序如下：

```
scanForPeripherals
    ↓ didDiscover (可多次回调)
stopScan + connect
    ↓ didConnect
discoverServices
    ↓ didDiscoverServices
discoverCharacteristics (for each service)
    ↓ didDiscoverCharacteristicsFor
setNotifyValue / readValue / writeValue
    ↓ didUpdateNotificationStateFor
    ↓ didUpdateValueFor (持续回调)
    ↓ didWriteValueFor
```

每一层都是异步的，不能假设时序。例如不能在 `didConnect` 中直接读取特征值，因为此时服务还未发现。必须严格遵循"回调驱动"的开发模式。

## 线程模型

CoreBluetooth 的回调默认在主队列（`main queue`）执行。如果需要在后台队列处理，可以在初始化时指定：

```swift
let bleQueue = DispatchQueue(label: "com.iot.ble", qos: .utility)
centralManager = CBCentralManager(delegate: self, queue: bleQueue)
```

注意：如果在后台队列回调，UI 更新必须切回主线程。同时，CoreBluetooth 的所有方法调用都应该在同一个队列上执行，避免多线程竞争。

## 常见陷阱

**1. 持有 CBPeripheral 引用**：`CBPeripheral` 对象是弱引用的，如果没有强持有，可能在连接过程中被释放导致连接失败或回调丢失。

```swift
// 错误做法
func centralManager(_ central: CBCentralManager,
                    didDiscover peripheral: CBPeripheral, ...) {
    centralManager.connect(peripheral, ...)  // peripheral 可能被释放
}

// 正确做法
var connectedPeripherals: [UUID: CBPeripheral] = [:]

func centralManager(_ central: CBCentralManager,
                    didDiscover peripheral: CBPeripheral, ...) {
    connectedPeripherals[peripheral.identifier] = peripheral
    centralManager.connect(peripheral, ...)
}
```

**2. 重复扫描**：在 `didDiscover` 回调中，同一个设备可能被多次发现（尤其开启了 `AllowDuplicatesKey`）。需要做去重处理。

**3. 后台限制**：iOS 后台扫描只能通过 Service UUID 过滤，`nil` 过滤在后台不会收到任何广播。后台扫描响应间隔也会被系统拉长。

**4. 连接超时**：CoreBluetooth 没有内置连接超时机制。如果设备不响应连接请求，`didConnect` 和 `didFailToConnect` 都不会被调用。需要自行实现超时逻辑。

```swift
// 连接超时实现
func connectWithTimeout(_ peripheral: CBPeripheral, timeout: TimeInterval = 15) {
    centralManager.connect(peripheral, options: nil)

    DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
        guard let self = self else { return }
        if peripheral.state != .connected {
            self.centralManager.cancelPeripheralConnection(peripheral)
            // 通知上层连接超时
        }
    }
}
```

**5. 系统资源回收**：iOS 在内存紧张时会挂起或终止后台 App，导致 BLE 连接断开。需要配合 Background Modes 中的 `bluetooth-central` 权限，并在 `didDisconnectPeripheral` 中实现重连逻辑。

## 总结

CoreBluetooth 的核心是围绕 `CBCentralManager` 和 `CBPeripheral` 两个类构建的异步状态机。开发要点在于：严格遵循回调驱动的时序、强持有 Peripheral 引用、合理管理扫描功耗、正确处理后台限制和连接异常。掌握这些基础后，才能在此基础上构建可靠的设备通信协议和 OTA 升级等高级功能。
