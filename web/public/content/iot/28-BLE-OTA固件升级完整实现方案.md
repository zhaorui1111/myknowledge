# BLE OTA 固件升级完整实现方案

## 概述

OTA（Over-The-Air）固件升级是 IoT 设备的必备能力，也是 BLE 通信中最复杂的应用场景之一。一次完整的 OTA 涉及固件分片、流控传输、断点续传、完整性校验、双分区切换和失败回滚等多个环节。本文将基于 iOS CoreBluetooth，从协议设计到工程实现，完整讲解 BLE OTA 升级方案。

## OTA 整体架构

### 升级流程总览

```
App 端                                设备端
  |                                     |
  |  1. 请求 OTA 版本信息 (Read)         |
  | ----------------------------------> |
  |  返回当前版本 + 硬件型号 + 可用空间    |
  | <---------------------------------- |
  |                                     |
  |  2. 发送升级开始命令 (Write)          |
  |     携带固件大小 + CRC32 + 版本号     |
  | ----------------------------------> |
  |  返回就绪状态 + 支持的 MTU            |
  | <---------------------------------- |
  |                                     |
  |  3. 逐片发送固件数据 (Write NoResp)  |
  |     每片含: 偏移量 + 序号 + 数据      |
  | ----------------------------------> |
  |     逐片 ACK (Notify)               |
  | <---------------------------------- |
  |       （重复至全部发送完成）           |
  |                                     |
  |  4. 发送校验命令 (Write)             |
  | ----------------------------------> |
  |  设备校验 CRC32 + 签名               |
  |  返回校验结果 (Notify)               |
  | <---------------------------------- |
  |                                     |
  |  5. 发送重启命令 (Write)             |
  | ----------------------------------> |
  |  设备写入标志位，重启切换分区          |
  |                                     |
  |  6. 等待设备重新广播                  |
  |     重新连接，读取新版本号确认         |
  | <---------------------------------- |
```

### GATT 服务定义

```
OTA Service (UUID: 0000FF60-0000-1000-8000-00805F9B34FB)
  ├── OTA Control    (FF61) — Read + Write + Notify
  ├── OTA Data       (FF62) — Write Without Response
  └ OTA Version Info (FF63) — Read + Notify
```

## 协议帧格式设计

### 控制帧（OTA Control）

```
Byte:  0        1        2-5           6-9           10-13         14-15
     [CmdID] [Status] [FirmwareSize] [FirmwareCRC] [FirmwareVer] [Reserved]

CmdID:
  0x01 — 开始升级
  0x02 — 暂停传输
  0x03 — 恢复传输
  0x04 — 传输完成
  0x05 — 校验请求
  0x06 — 重启切换
  0x07 — 查询断点（恢复续传）

Status (设备返回):
  0x00 — 成功/就绪
  0x01 — 存储空间不足
  0x02 — 版本不兼容
  0x03 — 校验失败
  0x04 — 电池电量不足
  0x05 — 忙碌中
```

### 数据帧（OTA Data）

```
Byte:  0-3          4-5         6-N
     [Offset]    [SeqNum]    [Payload]

Offset: 当前数据在固件中的字节偏移（大端序 UInt32）
SeqNum: 数据包序号（大端序 UInt16），用于丢包检测
Payload: 固件分片数据（大小 ≤ MTU - 3 - 6）
```

### ACK 帧（Notify）

```
Byte:  0-3          4-5          6
     [AckOffset] [AckSeqNum] [Result]

AckOffset: 已成功接收的偏移量
AckSeqNum: 已成功接收的最后一个序号
Result: 0x00 = 成功, 0x01 = CRC错误, 0x02 = 存储失败
```

## iOS 实现代码

### OTA 状态机

```swift
enum OTAState {
    case idle                // 空闲
    case requestingInfo      // 请求版本信息
    case starting            // 发送开始命令
    case transferring        // 传输固件数据
    case paused              // 暂停
    case verifying           // 校验中
    case restarting          // 重启切换
    case waitingReconnect    // 等待重连
    case verifyingVersion    // 验证新版本
    case success             // 升级成功
    case failed(Error)       // 升级失败
}

protocol OTADelegate: AnyObject {
    func otaProgressChanged(progress: Double)
    func otaStateChanged(_ state: OTAState)
    func otaFailed(_ error: OTAError)
}

enum OTAError: Error {
    case deviceNotReady
    case insufficientStorage
    case batteryLow
    case crcMismatch
    case transferTimeout
    case reconnectFailed
    case versionMismatch
}
```

### OTA 管理器实现

```swift
class BLEOTAManager: NSObject {

    // MARK: - 依赖
    private let peripheral: CBPeripheral
    private var controlChar: CBCharacteristic?
    private var dataChar: CBCharacteristic?
    private var versionChar: CBCharacteristic?

    // MARK: - OTA 参数
    private var firmwareData: Data = Data()
    private var firmwareCRC32: UInt32 = 0
    private var firmwareVersion: UInt32 = 0
    private var chunkSize: Int = 240
    private var deviceMTU: Int = 23

    // MARK: - 传输状态
    private var transferOffset: Int = 0
    private var sequenceNumber: UInt16 = 0
    private var ackedOffset: Int = 0
    private var pendingPackets: Int = 0
    private let windowSize = 4  // 滑动窗口

    // MARK: - 重试机制
    private var retryCount: Int = 0
    private let maxRetries = 3
    private var timeoutTimer: Timer?

    // MARK: - 状态
    private(set) var state: OTAState = .idle {
        didSet { delegate?.otaStateChanged(state) }
    }

    weak var delegate: OTADelegate?

    // MARK: - 初始化
    init(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        super.init()
        peripheral.delegate = self
    }

    // MARK: - 设置特征值
    func setupCharacteristics(control: CBCharacteristic,
                               data: CBCharacteristic,
                               version: CBCharacteristic) {
        controlChar = control
        dataChar = data
        versionChar = version

        // 动态调整分片大小
        let maxWrite = peripheral.maximumWriteValueLength(for: .withoutResponse)
        chunkSize = max(20, min(maxWrite - 6, 240))  // 预留 6 字节帧头

        // 订阅 Control 和 Version 的 Notify
        peripheral.setNotifyValue(true, for: control)
        peripheral.setNotifyValue(true, for: version)
    }

    // MARK: - 启动 OTA
    func startOTA(firmware: Data, version: UInt32) {
        firmwareData = firmware
        firmwareVersion = version
        firmwareCRC32 = calculateCRC32(firmware)

        state = .requestingInfo

        // 读取设备版本信息
        if let versionChar = versionChar {
            peripheral.readValue(for: versionChar)
        }
    }

    // MARK: - 发送开始命令
    private func sendStartCommand() {
        state = .starting

        var frame = Data()
        frame.append(0x01)  // CmdID: 开始升级
        frame.append(0x00)  // Status: 0

        // Firmware Size (4 bytes, big endian)
        var size = UInt32(firmwareData.count).bigEndian
        frame.append(Data(bytes: &size, count: 4))

        // Firmware CRC32 (4 bytes, big endian)
        var crc = firmwareCRC32.bigEndian
        frame.append(Data(bytes: &crc, count: 4))

        // Firmware Version (4 bytes, big endian)
        var ver = firmwareVersion.bigEndian
        frame.append(Data(bytes: &ver, count: 4))

        // Reserved (2 bytes)
        frame.append(contentsOf: [0x00, 0x00])

        if let controlChar = controlChar {
            peripheral.writeValue(frame, for: controlChar, type: .withResponse)
        }

        startTimeout(seconds: 10)
    }

    // MARK: - 传输固件数据
    private func startTransfer() {
        state = .transferring
        transferOffset = 0
        sequenceNumber = 0
        ackedOffset = 0
        pendingPackets = 0
        retryCount = 0
        sendNextPackets()
    }

    private func sendNextPackets() {
        guard state == .transferring else { return }

        while pendingPackets < windowSize,
              transferOffset < firmwareData.count,
              peripheral.canSendWriteWithoutResponse(for: dataChar!) {

            let end = min(transferOffset + chunkSize, firmwareData.count)
            let payload = firmwareData.subdata(in: transferOffset..<end)

            var frame = Data()
            // Offset (4 bytes)
            var offset = UInt32(transferOffset).bigEndian
            frame.append(Data(bytes: &offset, count: 4))
            // SeqNum (2 bytes)
            var seq = sequenceNumber.bigEndian
            frame.append(Data(bytes: &seq, count: 2))
            // Payload
            frame.append(payload)

            peripheral.writeValue(frame, for: dataChar!, type: .withoutResponse)

            transferOffset = end
            sequenceNumber += 1
            pendingPackets += 1

            // 上报进度
            let progress = Double(transferOffset) / Double(firmwareData.count)
            DispatchQueue.main.async {
                self.delegate?.otaProgressChanged(progress: progress)
            }
        }

        // 所有数据发送完毕，等待最后一批 ACK
        if transferOffset >= firmwareData.count && pendingPackets == 0 {
            sendVerifyCommand()
        }
    }

    // MARK: - 发送校验命令
    private func sendVerifyCommand() {
        state = .verifying

        var frame = Data()
        frame.append(0x05)  // CmdID: 校验请求
        frame.append(0x00)
        frame.append(contentsOf: [0x00, 0x00, 0x00, 0x00])  // Reserved

        if let controlChar = controlChar {
            peripheral.writeValue(frame, for: controlChar, type: .withResponse)
        }

        startTimeout(seconds: 30)  // 校验可能较慢
    }

    // MARK: - 发送重启命令
    private func sendRestartCommand() {
        state = .restarting

        var frame = Data()
        frame.append(0x06)  // CmdID: 重启切换
        frame.append(0x00)
        frame.append(contentsOf: [0x00, 0x00, 0x00, 0x00])

        if let controlChar = controlChar {
            peripheral.writeValue(frame, for: controlChar, type: .withResponse)
        }

        // 等待设备断开重连
        state = .waitingReconnect
        startTimeout(seconds: 60)
    }

    // MARK: - 断点续传
    func resumeTransfer() {
        state = .starting

        // 查询设备端已接收的偏移量
        var frame = Data()
        frame.append(0x07)  // CmdID: 查询断点
        frame.append(0x00)
        frame.append(contentsOf: [0x00, 0x00, 0x00, 0x00])

        if let controlChar = controlChar {
            peripheral.writeValue(frame, for: controlChar, type: .withResponse)
        }

        startTimeout(seconds: 10)
    }

    // MARK: - 超时处理
    private func startTimeout(seconds: TimeInterval) {
        timeoutTimer?.invalidate()
        timeoutTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.handleTimeout()
        }
    }

    private func cancelTimeout() {
        timeoutTimer?.invalidate()
        timeoutTimer = nil
    }

    private func handleTimeout() {
        retryCount += 1
        if retryCount > maxRetries {
            state = .failed(OTAError.transferTimeout)
            return
        }
        // 重试当前步骤
        switch state {
        case .starting:
            sendStartCommand()
        case .transferring:
            sendNextPackets()
        case .verifying:
            sendVerifyCommand()
        default:
            break
        }
    }

    // MARK: - CRC32 计算
    private func calculateCRC32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFFFFFF
        let polynomial: UInt32 = 0xEDB88320

        for byte in data {
            crc ^= UInt32(byte)
            for _ in 0..<8 {
                if crc & 1 != 0 {
                    crc = (crc >> 1) ^ polynomial
                } else {
                    crc >>= 1
                }
            }
        }
        return crc ^ 0xFFFFFFFF
    }
}
```

### 处理设备回调

```swift
extension BLEOTAManager: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard let data = characteristic.value else { return }

        if characteristic.uuid == versionChar?.uuid {
            handleVersionInfo(data)
        } else if characteristic.uuid == controlChar?.uuid {
            handleControlResponse(data)
        }
    }

    private func handleVersionInfo(_ data: Data) {
        guard data.count >= 8 else { return }
        // 解析设备版本信息
        let currentVersion = data.subdata(in: 0..<4).withUnsafeBytes {
            $0.load(as: UInt32.self).byteSwapped
        }
        let deviceMTU = data.subdata(in: 4..<6).withUnsafeBytes {
            $0.load(as: UInt16.self).byteSwapped
        }

        print("设备当前版本: \(currentVersion), MTU: \(deviceMTU)")

        // 发送开始命令
        sendStartCommand()
    }

    private func handleControlResponse(_ data: Data) {
        cancelTimeout()
        guard data.count >= 2 else { return }

        let cmdID = data[0]
        let status = data[1]

        switch (cmdID, state) {
        case (0x01, .starting):
            // 开始命令响应
            if status == 0x00 {
                startTransfer()
            } else {
                handleStartError(status)
            }

        case (0x05, .verifying):
            // 校验结果
            if status == 0x00 {
                sendRestartCommand()
            } else {
                state = .failed(OTAError.crcMismatch)
            }

        case (0x07, .starting):
            // 断点查询响应
            if data.count >= 6 {
                let resumeOffset = data.subdata(in: 2..<6).withUnsafeBytes {
                    $0.load(as: UInt32.self).byteSwapped
                }
                transferOffset = Int(resumeOffset)
                ackedOffset = Int(resumeOffset)
                startTransfer()
            }

        default:
            // ACK 帧
            if data.count >= 5 {
                let ackOffset = data.subdata(in: 0..<4).withUnsafeBytes {
                    $0.load(as: UInt32.self).byteSwapped
                }
                let result = data[4]

                if result == 0x00 {
                    ackedOffset = Int(ackOffset)
                    pendingPackets = max(0, pendingPackets - 1)
                    sendNextPackets()
                } else {
                    // 重传从 ACK 偏移量开始
                    transferOffset = Int(ackOffset)
                    pendingPackets = 0
                    sendNextPackets()
                }
            }
        }
    }

    private func handleStartError(_ status: UInt8) {
        switch status {
        case 0x01: state = .failed(OTAError.insufficientStorage)
        case 0x04: state = .failed(OTAError.batteryLow)
        default: state = .failed(OTAError.deviceNotReady)
        }
    }

    // 设备断开（重启切换分区时预期行为）
    func peripheral(_ peripheral: CBPeripheral,
                    didDisconnectPeripheral error: Error?) {
        if state == .waitingReconnect {
            // 等待设备重启后重新连接
            // 需要外部的连接管理器重新扫描连接
        }
    }
}
```

### 重连与新版本验证

```swift
extension BLEOTAManager {
    // 设备重启后重新连接，调用此方法验证
    func verifyUpgradeSuccess() {
        state = .verifyingVersion
        if let versionChar = versionChar {
            peripheral.readValue(for: versionChar)
        }
        // 在 didUpdateValueFor 中比较版本号
    }

    private func handlePostUpgradeVersion(_ data: Data) {
        guard data.count >= 4 else { return }
        let newVersion = data.subdata(in: 0..<4).withUnsafeBytes {
            $0.load(as: UInt32.self).byteSwapped
        }

        if newVersion == firmwareVersion {
            state = .success
        } else {
            state = .failed(OTAError.versionMismatch)
        }
    }
}
```

## 工程实践要点

### 1. 电池电量检查

OTA 升级是高功耗操作，应在升级前检查设备电量：

```swift
func checkBatteryBeforeOTA() -> Bool {
    // 通过 Battery Service (0x180F) 读取电量
    // 建议电量 > 30% 才允许升级
    guard batteryLevel >= 30 else {
        delegate?.otaFailed(.batteryLow)
        return false
    }
    return true
}
```

### 2. 前台执行要求

iOS 后台不适合 OTA 大数据传输。应在 App 前台时执行，并提示用户保持 App 打开：

```swift
func startOTA(firmware: Data, version: UInt32) {
    guard UIApplication.shared.applicationState == .active else {
        delegate?.otaFailed(.transferTimeout)
        return
    }
    // 开始 OTA...
}
```

### 3. 进度持久化

断点续传需要持久化传输进度，以便 App 被杀后恢复：

```swift
struct OTAProgress: Codable {
    let deviceIdentifier: UUID
    let firmwareVersion: UInt32
    let transferOffset: Int
    let firmwareCRC32: UInt32
    let timestamp: Date
}

// 存储到 UserDefaults
func saveProgress() {
    let progress = OTAProgress(
        deviceIdentifier: peripheral.identifier,
        firmwareVersion: firmwareVersion,
        transferOffset: ackedOffset,
        firmwareCRC32: firmwareCRC32,
        timestamp: Date()
    )
    if let encoded = try? JSONEncoder().encode(progress) {
        UserDefaults.standard.set(encoded, forKey: "ota_progress_\(peripheral.identifier.uuidString)")
    }
}
```

### 4. 防降级保护

设备端应拒绝低于当前版本的固件，App 端也应做检查：

```swift
func validateVersion(target: UInt32, current: UInt32) -> Bool {
    return target > current  // 只允许升级
}
```

### 5. 升级失败回滚

设备端的固件管理应支持 AB 双分区：

```
分区 A (当前运行)  ←→  分区 B (OTA 写入)

1. 正常运行在 A 分区
2. OTA 数据写入 B 分区
3. 校验通过后设置启动标志，重启
4. Bootloader 检查标志，从 B 分区启动
5. 启动成功后标记 B 为活动分区
6. 如果启动失败，回滚到 A 分区
```

App 端需要处理回滚场景：重启后版本号未变化，说明升级失败已回滚。

## 总结

BLE OTA 是一个涉及协议设计、流控传输、状态管理和错误恢复的系统工程。核心要点包括：设计清晰的帧格式和状态机、实现滑动窗口流控和 ACK 重传、支持断点续传和失败重试、配合设备端双分区实现安全切换。在 iOS 端还需要特别注意前台执行要求、进度持久化和重连验证等工程细节。一个健壮的 OTA 方案能显著提升 IoT 产品的用户体验和运维效率。
