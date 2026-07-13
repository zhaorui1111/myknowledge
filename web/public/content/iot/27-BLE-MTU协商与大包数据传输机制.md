# BLE MTU 协商与大包数据传输机制

## 概述

BLE 的 ATT 协议默认 MTU（Maximum Transmission Unit）为 23 字节，其中 3 字节为 ATT 头部，有效载荷仅 20 字节。这对于传输少量传感器数据尚可，但对于 OTA 固件升级、日志传输、批量数据同步等场景远远不够。理解 MTU 协商机制和大包数据传输策略，是开发高性能 BLE 应用的关键。

## MTU 协商机制

### MTU 的含义

MTU 是 ATT 层面的最大传输单元，定义了单个 ATT PDU（Protocol Data Unit）的最大字节数。在 BLE 4.2+ 中引入了数据长度扩展（Data Length Extension, DLE），进一步提高了链路层的单包数据容量。

完整的 BLE 数据包层次：

```
应用数据 (Payload)
  ← ATT 头部 (3 bytes) → 组成 ATT PDU (MTU)
    ← L2CAP 头部 (4 bytes) → 组成 L2CAP PDU
      ← LL 头部 + MIC → 组成 LL Data PDU (链路层包)
```

### iOS MTU 协商

iOS 在连接建立后会自动发起 MTU 协商。开发者无需手动调用协商方法，但可以读取协商后的 MTU 值：

```swift
func peripheral(_ peripheral: CBPeripheral,
                didDiscoverServices error: Error?) {
    // 获取协商后的 MTU
    let mtu = peripheral.maximumWriteValueLength(for: .withoutResponse)
    // maximumWriteValueLength 返回的是最大可写数据长度
    // 对于 .withResponse，返回值为 MTU - 3
    // 对于 .withoutResponse，返回值可能更小

    print("当前 MTU 有效载荷: \(mtu) bytes")
}
```

### 各版本 MTU 能力

| BLE 版本 | 默认 MTU | 最大 MTU | 最大有效载荷 |
|---------|---------|---------|------------|
| BLE 4.0/4.1 | 23 | 23 | 20 bytes |
| BLE 4.2+ | 23 | 247（iOS 典型值）| 244 bytes |
| BLE 5.0+ | 23 | 517（理论值）| 514 bytes |

iOS 平台实际协商的 MTU 取决于 iOS 设备和对端设备的共同支持能力。iPhone 通常支持到 247，部分 Android 设备支持 517。

### MTU 协商流程

```
iOS (Central)                         Device (Peripheral)
     |                                        |
     | -------- ATT Exchange MTU Request ---> |
     |     (Client RX MTU = 247)              |
     |                                        |
     | <------- ATT Exchange MTU Response --- |
     |     (Server RX MTU = 247)              |
     |                                        |
     最终 MTU = min(Client RX, Server RX) = 247
     有效载荷 = 247 - 3 = 244 bytes
```

## Write Without Response 的吞吐量

### Write Without Response vs Write With Response

| 特性 | Write Without Response | Write With Response |
|------|----------------------|-------------------|
| 可靠性 | 不保证到达 | 保证到达，有 ACK |
| 速度 | 快（无需等待 ACK） | 慢（每包需等待 ACK） |
| 适用场景 | 高吞吐数据传输 | 命令下发、配置写入 |
| 拥塞控制 | 需自行处理 | 协议栈自动处理 |

### iOS Write Without Response 的流控

iOS 对 Write Without Response 有内部队列限制。当队列满时，`canSendWriteWithoutResponse` 返回 `false`：

```swift
class BLEDataSender {
    private let peripheral: CBPeripheral
    private let characteristic: CBCharacteristic
    private var sendQueue: [Data] = []
    private var isSending = false

    // iOS 11+ 使用 isReadyToSendWriteWithoutResponse 回调
    func sendData(_ data: Data) {
        sendQueue.append(data)
        flushQueue()
    }

    private func flushQueue() {
        guard !isSending else { return }

        while !sendQueue.isEmpty,
              peripheral.canSendWriteWithoutResponse(for: characteristic) {
            let data = sendQueue.removeFirst()
            isSending = sendQueue.isNotEmpty
            peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
        }
    }
}

// CBPeripheralDelegate 回调
extension BLEDataSender: CBPeripheralDelegate {
    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        isSending = false
        flushQueue()
    }
}
```

### 吞吐量估算

BLE 吞吐量受多个因素影响：

```
理论最大吞吐量 = (有效载荷 / 总包大小) × (1 / 连接间隔) × 包数/连接事件

示例（BLE 4.2, MTU=247, 连接间隔=15ms, 每事件 4 包）:
  有效载荷 = 244 bytes
  每连接事件数据 = 244 × 4 = 976 bytes
  吞吐量 = 976 / 0.015 ≈ 65 KB/s

实际受 iOS 调度、信号质量、重传等影响，通常为 30-50 KB/s
```

## 大包数据传输策略

### 策略一：Write Without Response + 流控

适用于 OTA 固件传输等高吞吐场景：

```swift
class OTADataTransfer {
    private let peripheral: CBPeripheral
    private let dataChar: CBCharacteristic

    private var firmwareData: Data = Data()
    private var offset: Int = 0
    private var chunkSize: Int = 240  // 根据 MTU 动态调整
    private var pendingChunks: Int = 0
    private let maxPendingChunks = 4  // 滑动窗口大小

    var progressHandler: ((Double) -> Void)?

    func startTransfer(firmware: Data) {
        firmwareData = firmware
        offset = 0
        sendNextBatch()
    }

    private func sendNextBatch() {
        while pendingChunks < maxPendingChunks,
              offset < firmwareData.count,
              peripheral.canSendWriteWithoutResponse(for: dataChar) {

            let end = min(offset + chunkSize, firmwareData.count)
            let chunk = firmwareData.subdata(in: offset..<end)

            // 添加帧头：序号 + 长度
            var frame = Data()
            frame.append(contentsOf: withUnsafeBytes(of: UInt16(offset).bigEndian) { Array($0) })
            frame.append(UInt8(chunk.count))
            frame.append(chunk)
            frame.append(crc8(frame))  // 校验

            peripheral.writeValue(frame, for: dataChar, type: .withoutResponse)

            offset = end
            pendingChunks += 1

            let progress = Double(offset) / Double(firmwareData.count)
            DispatchQueue.main.async {
                self.progressHandler?(progress)
            }
        }

        if offset >= firmwareData.count && pendingChunks == 0 {
            print("传输完成")
        }
    }
}

extension OTADataTransfer: CBPeripheralDelegate {
    // 当 iOS 内部队列有空间时回调
    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        sendNextBatch()
    }

    // 设端通过 Notify 确认接收
    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard let data = characteristic.value, data.count >= 2 else { return }
        let ackOffset = data.subdata(in: 0..<2).withUnsafeBytes {
            $0.load(as: UInt16.self).byteSwapped
        }
        // 设备确认已接收到的偏移量
        pendingChunks = max(0, pendingChunks - 1)
        sendNextBatch()
    }
}
```

### 策略二：Long Read（Read Blob）

适用于设备 → App 方向的大数据读取，如读取设备日志：

```swift
// CoreBluetooth 自动处理 Long Read
// 当数据超过 MTU 时，框架自动发送 Read Blob 请求分片读取
func readLargeData() {
    peripheral.readValue(for: largeDataChar)
}

// 回调可能被多次触发，每次返回一个分片
// 需要在应用层拼接
private var receiveBuffer = Data()

func peripheral(_ peripheral: CBPeripheral,
                didUpdateValueFor characteristic: CBCharacteristic,
                error: Error?) {
    if let chunk = characteristic.value {
        receiveBuffer.append(chunk)

        // 通过某种方式判断是否接收完成
        // 例如：检查总长度字段、魔数尾标记、或固定头中的长度域
    }
}
```

注意：iOS 的 Long Read 是透明的——`readValue` 会触发多个 Read Blob 请求，但每次 `didUpdateValueFor` 回调返回的是一个分片。需要应用层自行判断数据完整性。

### 策略三：Notify 分片推送

适用于设备主动推送大数据，如实时波形数据：

```swift
class NotifyStreamReceiver {
    private var buffer = Data()
    private var expectedLength: Int?
    private var sequenceNumber: UInt16 = 0

    func handleNotify(_ data: Data) -> Data? {
        guard data.count >= 4 else { return nil }

        // 帧格式: [SeqNum 2B][TotalLen 2B][Payload NB]
        let seqNum = data.subdata(in: 0..<2).withUnsafeBytes {
            $0.load(as: UInt16.self).byteSwapped
        }
        let totalLen = data.subdata(in: 2..<4).withUnsafeBytes {
            $0.load(as: UInt16.self).byteSwapped
        }
        let payload = data.subdata(in: 4..<data.count)

        // 序列号校验
        if seqNum != sequenceNumber {
            print("丢包: 期望 \(sequenceNumber), 收到 \(seqNum)")
            // 触发重传请求
        }
        sequenceNumber += 1

        buffer.append(payload)

        if buffer.count >= Int(totalLen) {
            let completeData = buffer
            buffer.removeAll()
            sequenceNumber = 0
            expectedLength = nil
            return completeData
        }

        return nil
    }
}
```

## 动态 MTU 优化

### 自适应分片大小

```swift
class AdaptiveTransferManager {
    private let peripheral: CBPeripheral
    private var optimalChunkSize: Int = 20  // 默认保守值

    func updateChunkSize() {
        // 连接后获取实际 MTU
        let mtu = peripheral.maximumWriteValueLength(for: .withoutResponse)

        if mtu > 20 {
            // 预留帧头空间
            optimalChunkSize = mtu - 8  // 2(seq) + 1(len) + 1(cmd) + 4(crc)
        }

        print("自适应分片大小: \(optimalChunkSize) bytes")
    }

    func sendLargeData(_ data: Data, to char: CBCharacteristic) {
        var offset = 0
        while offset < data.count {
            let end = min(offset + optimalChunkSize, data.count)
            let chunk = data.subdata(in: offset..<end)
            peripheral.writeValue(chunk, for: char, type: .withoutResponse)
            offset = end
        }
    }
}
```

### 连接参数优化

连接参数影响吞吐和功耗的平衡：

```swift
// 连接参数说明（这些值由设备端决定，iOS 作为 Central 不能直接设置）
// Connection Interval: 7.5ms - 4000ms（15ms 是吞吐和功耗的较好平衡点）
// Slave Latency: 0 - 499（高延迟场景可设置较大值以省电）
// Supervision Timeout: 100ms - 32000ms（建议 6000ms，避免频繁断连）

// 可以在连接后通过读取特定 Service 获取设备建议的连接参数
// 然后通过 L2CAP Connection Parameter Update Request 协商
```

## 实际性能基准

在不同条件下的实际测试数据（以 nRF52 + iPhone 14 为例）：

| MTU | 连接间隔 | 传输方式 | 实测吞吐 |
|-----|---------|---------|---------|
| 23 | 30ms | Write With Response | ~5 KB/s |
| 23 | 30ms | Write Without Response | ~8 KB/s |
| 247 | 15ms | Write Without Response | ~40 KB/s |
| 247 | 7.5ms | Write Without Response + DLE | ~60 KB/s |

## 常见问题

**1. MTU 协商失败**：部分老旧设备不支持 MTU 协商，始终使用 23 字节。应用层需要回退到 20 字节的有效载荷。

**2. canSendWriteWithoutResponse 始终返回 false**：可能是连接未完全建立，或特征值不支持 Write Without Response。检查 `characteristic.properties`。

**3. 数据丢失**：Write Without Response 不保证到达。对于关键数据，需要应用层 ACK 机制或使用 Write With Response。

**4. iOS 后台吞吐骤降**：iOS 后台模式下，BLE 传输被大幅限制。后台只有连接维持和关键通知可用，不适合大数据传输。OTA 等操作应在前台进行。

## 总结

MTU 协商和大包数据传输是 BLE 高吞吐通信的核心。实践中需要根据实际协商的 MTU 动态调整分片大小，合理使用 Write Without Response 配合应用层流控和 ACK 机制实现可靠传输，同时在连接参数和滑动窗口之间找到吞吐与可靠性的最优平衡点。这些机制的组合使用，构成了 OTA 固件升级、日志同步等大数据传输场景的技术基础。
