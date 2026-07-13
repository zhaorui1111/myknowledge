# BLE GATT 服务设计与数据交互实践

## 概述

GATT（Generic Attribute Profile）是 BLE 协议栈中最贴近应用层的规范，定义了设备如何组织和暴露数据。对于 IoT Companion App 开发者来说，理解 GATT 结构不仅是读懂设备文档的前提，更是设计私有设备协议的基础。本文将从 GATT 数据模型出发，结合 iOS CoreBluetooth 实践，详细讲解服务设计、数据交互模式及工程最佳实践。

## GATT 数据模型

GATT 采用树形层级结构组织数据：

```
Profile（应用配置）
  └── Service（服务）
        ├── Characteristic（特征值）
        │     ├── Value（数据值，最大 512 字节）
        │     └── Descriptor（描述符）
        │           └── Value
        ├── Characteristic
        │     └── ...
        └── Included Service（包含的服务引用）
```

### Service（服务）

Service 是一组相关功能特征值的集合。每个 Service 由 128-bit UUID 唯一标识。UUID 分为两类：

**标准 UUID（16-bit）**：由 Bluetooth SIG 分配，如 `0x180D`（心率服务）、`0x180F`（电池服务）。在 iOS 中用 `CBUUID(string: "180D")` 表示。

**自定义 UUID（128-bit）**：用于私有服务，如 `CBUUID(string: "0000FFE0-0000-1000-8000-00805F9B34FB")`。这是 BLE 模块（如 nRF52、CC2541）常用的自定义 Service UUID。

Service 有两种类型：

**Primary Service**：公开的、可被其他服务包含的主服务，通过 Primary Service 声明。这是最常见的类型。

**Secondary Service**：从属的、只在被引用时有意义的服务，通过 Secondary Service 声明。使用较少。

### Characteristic（特征值）

Characteristic 是 GATT 数据的基本单元，每个特征值包含：

**UUID**：唯一标识，同样区分 16-bit 标准和 128-bit 自定义。

**Properties**：定义该特征值支持的操作类型，是 OptionSet。

```
Broadcast     — 可广播
Read          — 可读
Write Without Response — 可无响应写入
Write         — 可有响应写入
Notify        — 可通知（无确认）
Indicate      — 可指示（需确认）
Authenticated Signed Writes — 签名认证写入
Extended Properties — 有扩展属性
```

**Value**：实际数据，最大 512 字节。

**Descriptors（描述符）**：附加元数据。最重要的描述符是 CCCD（Client Characteristic Configuration Descriptor，UUID `0x2902`），用于开启/关闭 Notify/Indicate。

### Descriptor（描述符）

常见描述符：

```
0x2900 — Extended Properties（扩展属性）
0x2901 — User Description（用户可读描述）
0x2902 — Client Characteristic Configuration（CCCD，控制 Notify/Indicate 开关）
0x2903 — Server Characteristic Configuration
0x2904 — Characteristic Presentation Format（数据格式描述）
0x2905 — Characteristic Aggregate Format
```

CCCD 是最常用的描述符。当调用 `setNotifyValue(true, for: characteristic)` 时，CoreBluetooth 底层就是向 CCCD 写入 `0x0001`（开启 Notify）或 `0x0002`（开启 Indicate）。

## GATT 服务设计原则

### 1. 服务划分粒度

一个 BLE 设备应该按照功能域划分 Service。例如一个智能门锁设备：

```
Service 1: 基础信息服务 (0x180A - Device Information)
  ├── Manufacturer Name (0x2A29)
  ├── Model Number (0x2A24)
  ├── Firmware Revision (0x2A26)
  └── Battery Level (0x2A19)

Service 2: 门锁控制服务 (自定义 UUID)
  ├── Lock State (可读 + Notify)        — 门锁当前状态
  ├── Lock Command (可写)               — 下发开锁/关锁命令
  ├── Unlock Code (可写)                — 密码验证
  └── Lock Event Log (Notify)           — 事件日志推送

Service 3: OTA 升级服务 (自定义 UUID)
  ├── OTA Control (可读 + 可写)         — 控制升级流程
  ├── OTA Data (Write Without Response) — 固件数据传输
  └── OTA Status (Notify)               — 升级状态推送
```

### 2. 特征值 Properties 设计

根据数据流向选择合适的 Properties：

| 数据流向 | 推荐 Properties | 说明 |
|---------|----------------|------|
| 设备 → App（被动读取）| Read | App 主动读取，如读取设备版本号 |
| 设备 → App（主动推送）| Notify | 设备状态变化时推送，如温度报警 |
| 设备 → App（可靠推送）| Indicate | 需要确认的推送，如安全事件 |
| App → 设备（可靠写入）| Write | 需要设备确认的命令，如开锁指令 |
| App → 设备（快速写入）| Write Without Response | 高频数据写入，如 OTA 固件分片 |
| 双向交互 | Read + Write + Notify | 如配置参数的读取、修改和变更通知 |

### 3. 数据编码格式

Characteristic Value 的数据编码需要考虑跨平台兼容性：

```swift
// 大端序（Big-Endian）编码 — 推荐用于跨平台协议
struct LockState: Codable {
    var state: UInt8       // 0: 关锁, 1: 开锁, 2: 异常
    var battery: UInt8     // 0-100
    var timestamp: UInt32  // Unix 时间戳
}

// 编码
func encode(_ state: LockState) -> Data {
    var data = Data()
    data.append(state.state)
    data.append(state.battery)
    var timestamp = state.timestamp.bigEndian  // 大端序
    withUnsafeBytes(of: &timestamp) { data.append(contentsOf: $0) }
    return data
}

// 解码
func decode(_ data: Data) -> LockState? {
    guard data.count >= 6 else { return nil }
    let state = data[0]
    let battery = data[1]
    let timestamp = data.subdata(in: 2..<6).withUnsafeBytes {
        $0.load(as: UInt32.self).byteSwapped  // 大端序转主机序
    }
    return LockState(state: state, battery: battery, timestamp: timestamp)
}
```

### 4. UUID 规划

自定义 UUID 建议基于 Bluetooth Base UUID 生成：

```
Base UUID: 00000000-0000-1000-8000-00805F9B34FB

自定义 Service:  0000FF00-0000-1000-8000-00805F9B34FB
自定义 Characteristic:
  0000FF01-0000-1000-8000-00805F9B34FB  (设备状态)
  0000FF02-0000-1000-8000-00805F9B34FB  (命令下发)
  0000FF03-0000-1000-8000-00805F9B34FB  (OTA 数据)
```

## iOS 数据交互实践

### 完整交互流程封装

```swift
class GATTServiceManager: NSObject {
    private let peripheral: CBPeripheral
    private var characteristics: [CBUUID: CBCharacteristic] = [:]

    // 命令队列：缓存待发送的命令
    private var commandQueue: [(data: Data, charUUID: CBUUID)] = []
    private var isSending = false

    init(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        super.init()
        peripheral.delegate = self
    }

    // 发送命令
    func sendCommand(_ data: Data, to charUUID: CBUUID) {
        commandQueue.append((data, charUUID))
        processQueue()
    }

    private func processQueue() {
        guard !isSending, !commandQueue.isEmpty else { return }
        guard let char = characteristics[commandQueue[0].charUUID] else {
            commandQueue.removeFirst()
            processQueue()
            return
        }

        isSending = true
        let command = commandQueue.removeFirst()
        peripheral.writeValue(command.data, for: char, type: .withResponse)
    }
}

extension GATTServiceManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        guard let chars = service.characteristics else { return }
        for char in chars {
            characteristics[char.uuid] = char

            if char.properties.contains(.notify) {
                peripheral.setNotifyValue(true, for: char)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        isSending = false
        if let error = error {
            print("写入失败: \(error.localizedDescription)")
        }
        // 继续处理队列
        processQueue()
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard let data = characteristic.value else { return }
        handleReceivedData(data, for: characteristic.uuid)
    }
}
```

### Notify 数据流处理

设备通过 Notify 推送的数据可能是连续的数据流，需要处理粘包/拆包问题：

```swift
class NotifyDataParser {
    private var buffer = Data()

    func append(_ data: Data) -> [Message]? {
        buffer.append(data)
        var messages: [Message] = []

        while buffer.count >= Message.headerSize {
            // 读取包头（魔数 + 长度）
            let magic = buffer.subdata(in: 0..<2)
            guard magic == Data([0xAA, 0x55]) else {
                // 帧头不匹配，丢弃一个字节重新对齐
                buffer.removeFirst()
                continue
            }

            let payloadLength = Int(buffer[2])
            let frameLength = Message.headerSize + payloadLength + 2  // 头 + 负载 + CRC16

            guard buffer.count >= frameLength else {
                break  // 数据不完整，等待更多数据
            }

            let frameData = buffer.subdata(in: 0..<frameLength)
            if let message = Message.deserialize(frameData) {
                messages.append(message)
            }
            buffer.removeFirst(frameLength)
        }

        return messages.isEmpty ? nil : messages
    }
}
```

### 多特征值协同设计

复杂设备通常需要多个特征值协同工作。以 OTA 升级为例：

```swift
// OTA 特征值定义
let otaControlUUID = CBUUID(string: "FF10")  // 控制：开始/暂停/完成
let otaDataUUID = CBUUID(string: "FF11")     // 数据：固件分片
let otaStatusUUID = CBUUID(string: "FF12")   // 状态：进度/错误

class OTAManager {
    private var controlChar: CBCharacteristic?
    private var dataChar: CBCharacteristic?
    private var statusChar: CBCharacteristic?

    func startOTA(firmware: Data) {
        // 1. 发送开始命令到控制特征值
        let startCmd = Data([0x01])  // 命令字: 开始升级
        peripheral.writeValue(startCmd, for: controlChar!, type: .withResponse)

        // 2. 开始分片发送固件数据
        sendFirmwareChunk(firmware, offset: 0)
    }

    private func sendFirmwareChunk(_ firmware: Data, offset: Int) {
        let chunkSize = 180  // 根据 MTU 动态调整
        let end = min(offset + chunkSize, firmware.count)
        let chunk = firmware.subdata(in: offset..<end)

        // 使用 Write Without Response 提高吞吐
        peripheral.writeValue(chunk, for: dataChar!, type: .withoutResponse)

        if end < firmware.count {
            // 继续发送下一片
            sendFirmwareChunk(firmware, offset: end)
        } else {
            // 发送完成命令
            let completeCmd = Data([0x03])
            peripheral.writeValue(completeCmd, for: controlChar!, type: .withResponse)
        }
    }

    // 通过 Status 特征值的 Notify 接收升级进度
    func handleOTAStatus(_ data: Data) {
        guard data.count >= 2 else { return }
        let status = data[0]  // 0: 进行中, 1: 成功, 2: 失败
        let progress = data[1] // 0-100

        switch status {
        case 0: print("升级中: \(progress)%")
        case 1: print("升级成功")
        case 2: print("升级失败")
        default: break
        }
    }
}
```

## GATT 设计常见问题

### 1. 特征值数量过多

BLE 规范允许一个 Service 下有大量特征值，但实际设备发现所有特征值需要多次 ATT 请求，增加连接时间和功耗。建议每个 Service 下的特征值控制在 5-10 个以内，按功能域拆分 Service。

### 2. 数据大小超限

单个 Characteristic Value 最大 512 字节，但实际可用大小受 MTU 限制（默认 MTU=23，有效载荷 20 字节）。大于 MTU 的 Read 会自动分多次传输，但 Write 需要自行处理。设计协议时应将单帧 payload 控制在 MTU 范围内。

### 3. Notify 频率过高

高频 Notify（如每秒 100+ 次传感器数据）可能导致 iOS 端回调堆积、数据丢失。解决方案：在设备端做数据聚合，降低 Notify 频率；或使用 Indicate 替代 Notify（牺牲吞吐换可靠性）。

### 4. 安全性考虑

敏感特征值应设置 Security 权限，要求加密连接后才能访问。iOS 端在 `didDiscoverCharacteristicsFor` 中检查 `characteristic.properties` 和权限标识，引导用户完成配对加密。

## 总结

GATT 服务设计是 BLE 设备开发的核心环节。好的设计应该按功能域划分 Service、合理选择 Characteristic Properties、规范数据编码格式、预留扩展性。在 iOS 端，需要结合 CoreBluetooth 的异步回调模型封装可靠的数据交互层，处理命令队列、粘包拆包和多特征值协同等问题。这些基础工作做好了，上层的协议设计和 OTA 升级才有稳固的基石。
