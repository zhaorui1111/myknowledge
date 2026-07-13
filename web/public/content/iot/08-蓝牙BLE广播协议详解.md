# 08 · 蓝牙 BLE 广播协议详解

## 一、概述

BLE 广播（Advertising）是蓝牙低功耗设备被发现的机制。设备通过在特定信道上发送广播包，让扫描者（如手机）发现自己。广播是 BLE 通信的第一步——无论是建立连接还是无连接数据传输（Beacon），都始于广播。

## 二、BLE 物理信道

BLE 使用 2.4GHz ISM 频段，将 2402-2480MHz 划分为 40 个信道（每个 2MHz）：

```
信道 0  ─── 信道 12 ─── 信道 39
  |              |              |
  2402MHz      2440MHz       2480MHz

广播信道 (3个): 37, 38, 39
数据信道 (37个): 0-36

广播信道位置:
  37 → 2402 MHz (信道 0 附近)
  38 → 2426 MHz (信道 12 附近)  
  39 → 2480 MHz (信道 39 附近)
```

三个广播信道分布在频段的两端和中间，这样设计的目的是避免与 WiFi 信道（1/6/11）完全重叠，减少干扰。

## 三、广播包格式

### 3.1 广播 PDU 结构

BLE 广播包的物理层结构：

```
┌──────────┬──────────┬─────────────────────┬───────────┐
│ Preamble │  Access  │     PDU             │    CRC    │
│ (1 byte) │ Address  │  (2-39 bytes)       │  (3 bytes)│
│          │ (4 bytes)│                     │           │
└──────────┴──────────┴─────────────────────┴───────────┘

PDU 结构:
┌──────────────┬───────────────────────────┐
│   Header     │      Payload              │
│  (2 bytes)   │   (0-37 bytes)            │
└──────────────┴───────────────────────────┘

Header 结构:
┌─────────┬──────┬─────────┬──────────────┐
│ PDU Type│ RFU  │ ChSel   │ Length (6bit)│
│ (4 bit) │(2bit)│ (1 bit) │              │
└─────────┴──────┴─────────┴──────────────┘
```

### 3.2 PDU 类型

| PDU Type | 名称 | 方向 | 用途 |
|----------|------|------|------|
| 0000 | ADV_IND | P → S | 可连接、可扫描的广播 |
| 0001 | ADV_DIRECT_IND | P → S | 定向广播（指定接收方） |
| 0010 | ADV_NONCONN_IND | P → S | 不可连接的广播（Beacon） |
| 0011 | SCAN_REQ | S → P | 扫描请求 |
| 0100 | SCAN_RSP | P → S | 扫描响应（附加数据） |
| 0101 | ADV_EXT_IND | P → S | 扩展广播（BLE 5.0+） |
| 0110 | AUX_SYNC_IND | P → S | 周期性广播 |
| 0111 | AUX_CHAIN_IND | P → S | 链式广播（大数据分片） |

P = Peripheral（广播者），S = Scanner（扫描者）

### 3.3 广播数据（AD Data）格式

广播包 Payload 中的数据以 AD Structure 格式组织：

```
┌─────────────┬──────────────────┐
│ Length      │ AD Data          │
│ (1 byte)    │ (Length-1 bytes) │
├─────────────┼──────────────────┤
│             │ AD Type │ AD Value│
│             │ (1 byte) │        │
└─────────────┴──────────────────┘
```

一个广播包中可以包含多个 AD Structure，但总长度不超过 31 字节（Legacy）或 254 字节（Extended）。

### 3.4 常用 AD Type

| AD Type | 值 | 说明 |
|---------|---|------|
| Flags | 0x01 | 广播标志（LE General/Limited Discoverable, BR/EDR Not Supported） |
| Complete/Incomplete 16-bit Service UUID | 0x03/0x02 | 16 位服务 UUID |
| Complete/Incomplete 128-bit Service UUID | 0x07/0x06 | 128 位服务 UUID |
| Shortened/Complete Local Name | 0x08/0x09 | 设备名称 |
| TX Power Level | 0x0A | 发射功率 |
| Service Data (16-bit) | 0x16 | 服务数据（如 iBeacon） |
| Manufacturer Specific Data | 0xFF | 厂商自定义数据 |
| Appearance | 0x19 | 外观类型（如 Heart Rate Sensor） |
| LE Supported Features | 0x1B | 支持的 LE 特性 |

## 四、广播过程

### 4.1 广播事件（Advertising Event）

广播者在三个广播信道（37, 38, 39）上依次发送广播包，这构成一个广播事件：

```
信道37          信道38          信道39
  |               |               |
  ADV_IND         ADV_IND         ADV_IND
  (t1)            (t2)            (t3)
  
  |<--- 广播间隔 (advInterval) --->|
  
  ADV_IND         ADV_IND         ADV_IND
  (t4)            (t5)            (t6)
```

### 4.2 广播参数

| 参数 | 范围 | 说明 |
|------|------|------|
| Advertising Interval | 20ms - 10240ms | 广播事件之间的间隔 |
| Advertising Type | 4种 | 可连接/不可连接/定向/扩展 |
| Advertising Channel Map | 3 bit | 使用哪些广播信道（37/38/39） |
| Advertising Filter Policy | 4种 | 过滤扫描/连接请求 |
| TX Power Level | -127 to +127 dBm | 发射功率 |

**广播间隔与功耗**：
- 间隔越短，被发现越快，但功耗越高。
- 间隔越长，功耗越低，但被发现越慢。
- 实际广播间隔 = advInterval + 0-10ms 随机抖动（防止多个设备持续碰撞）。

**推荐间隔**：
- 主动配网模式：20-100ms（快速被发现）
- 正常运行模式：1000ms（平衡功耗和响应速度）
- Beacon 模式：100-1000ms

### 4.3 扫描过程

扫描者在三个广播信道上依次监听：

```
扫描者时间线:
  |--- 监听信道37 ---|--- 监听信道38 ---|--- 监听信道39 ---|
  |<--- scanWindow --->|                |
  |<------- scanInterval ----------->|

参数:
  scanWindow: 每个信道监听时长 (10ms - 4096ms)
  scanInterval: 扫描周期 (10ms - 4096ms)
```

- **连续扫描**：scanWindow = scanInterval，持续监听。
- **间歇扫描**：scanWindow < scanInterval，省电模式。

## 五、连接建立

当扫描者收到可连接的广播包后，可以发起连接请求：

```
广播者(Peripheral)              扫描者(Central)
  |                               |
  |--- ADV_IND (信道37) --------->|
  |                               |
  |<-- CONNECT_IND ---------------|  (连接请求)
  |                               |
  |  连接建立，切换到数据信道      |
  |  使用自适应跳频(AFH)通信       |
  |<=== 数据信道通信 ============>|
```

CONNECT_IND 包含连接参数：
- **Connection Interval**：7.5ms - 4000ms，连接事件间隔。
- **Slave Latency**：从机可跳过的连接事件数（省电）。
- **Supervision Timeout**：连接超时（4s - 32s）。
- **Channel Map**：可用的数据信道列表。
- **Hop Interval**：跳频间隔。
- **Access Address**：连接标识（32 位随机数）。

## 六、扩展广播（BLE 5.0+）

BLE 5.0 引入了扩展广播，解决了 Legacy 广播的几个限制：

### 6.1 Legacy 广播的限制
- 广播包 Payload 最大 31 字节（加上 Scan Response 共 62 字节）。
- 只能在三个广播信道发送。
- 广播和扫描不能同时进行。

### 6.2 扩展广播机制

扩展广播引入了 Auxiliary PDU，允许在辅助信道上传输更大的数据：

```
广播信道(37/38/39)          辅助信道(0-36之一)
  |                               |
  ADV_EXT_IND                     AUX_SYNC_IND
  (指向辅助信道)                  (主数据包, 最大 254 bytes)
                                  |
                                  AUX_CHAIN_IND
                                  (链式续包, 传输更多数据)
```

**优势**：
- Payload 最大 254 字节（单包），链式可传输更多。
- 支持周期性广播（Periodic Advertising），扫描者可同步到周期性广播序列。
- 广播和扫描可并行（使用不同信道）。

### 6.3 周期性广播

```
广播者:
  ADV_EXT_IND(37) → AUX_SYNC_IND(信道X) → [等待] → ADV_EXT_IND(37) → AUX_SYNC_IND(信道X) → ...
                    |                                    |
                    |<-------- PA Interval ------------>|

扫描者:
  扫描发现 ADV_EXT_IND → 同步到周期性广播序列 → 在指定时间唤醒接收 AUX_SYNC_IND
```

周期性广播适用于需要持续广播大数据的场景，如传感器持续广播环境数据。

## 七、BLE Beacon 协议

### 7.1 iBeacon（Apple）

iBeacon 使用 ADV_NONCONN_IND（不可连接广播），数据放在 Manufacturer Specific Data 中：

```
AD Structure:
  Length: 0x1A (26 bytes)
  AD Type: 0xFF (Manufacturer Specific Data)
  Manufacturer ID: 0x004C (Apple)
  
Payload:
  Byte 0: 0x02 (iBeacon type)
  Byte 1: 0x15 (data length = 21)
  UUID: 16 bytes (iBeacon UUID)
  Major: 2 bytes
  Minor: 2 bytes
  TX Power: 1 byte (校准 RSSI @ 1m)
```

扫描者通过 UUID/Major/Minor 识别 Beacon，通过比较 TX Power 和实际 RSSI 估算距离。

### 7.2 Eddystone（Google）

Eddystone 支持多种帧类型：

| 帧类型 | 说明 |
|--------|------|
| Eddystone-UID | 16 字节设备标识（10B namespace + 6B instance） |
| Eddystone-URL | 压缩 URL，扫描后可直接打开网页 |
| Eddystone-TLM | 遥测数据（温度、电池电压、广播计数、运行时间） |
| Eddystone-EID | 加密标识（旋转广播，防追踪） |

### 7.3 自定义 Beacon

IoT 应用中常见自定义 Beacon 格式，利用 Service Data (0x16) 或 Manufacturer Data (0xFF) 携带业务数据：

```
自定义 Beacon 示例:
  AD Type: 0x16 (Service Data, 16-bit UUID)
  UUID: 0xFE9F (自定义服务)
  Payload:
    Device Type: 1 byte
    Device ID: 6 bytes
    Sensor Data: 4 bytes (温度/湿度)
    Battery: 1 byte
    CRC: 1 byte
```

## 八、广播安全与隐私

### 8.1 隐私地址

为了防止设备被追踪，BLE 支持 **随机地址**：

- **Static Random Address**：设备生成后保持不变（除非重置）。不提供隐私保护。
- **Private Random Address (Resolvable)**：用 IRK（Identity Resolving Key）生成，定期变化。已绑定的设备可以用 IRK 解析出真实身份。提供隐私保护。
- **Private Random Address (Non-Resolvable)**：完全随机，不可解析。

```
可解析私有地址格式 (48 bit):
┌──────────┬──────────────────────┬──────────┐
│ Random   │   Hash (24 bit)      │ Random   │
│ Part     │ prand(24bit) → hash   │ Part     │
│ (2 bit)  │                      │ (22 bit) │
└──────────┴──────────────────────┴──────────┘
  0b01 或 0b10          ah(IRK, prand)
```

### 8.2 广播安全注意事项

- Legacy 广播包是明文的，任何人都可以扫描到。
- 不要在广播包中传递敏感信息（如密码、密钥）。
- 使用可解析私有地址防止设备被追踪。
- BLE 5.4 引入了 Encrypted Advertising Data（加密广播数据），可以对广播 payload 进行加密。

## 九、广播性能优化

### 9.1 功耗优化

- 使用较长的广播间隔（如 1 秒）降低功耗。
- 在不需要被发现时关闭广播。
- 使用最小必要的 Payload 长度。

### 9.2 被发现速度优化

- 使用较短的广播间隔（如 20ms）加快被发现。
- 确保扫描者的 scanWindow 覆盖至少一个完整广播间隔。
- 三个广播信道全部启用。

### 9.3 共存优化

- BLE 和 WiFi 共享 2.4GHz 频段，需要处理共存干扰。
- 部分芯片支持时间分片（Time Slicing）机制，交替进行 BLE 和 WiFi 操作。
- 将 BLE 广播信道映射到 WiFi 信道间的空闲频率。

## 十、总结

BLE 广播协议是蓝牙 IoT 设备被发现的基础机制。理解广播 PDU 格式、AD Structure 编码、广播/扫描参数调优对于 IoT 开发至关重要。BLE 5.0 的扩展广播解决了 Legacy 广播的 Payload 大小限制，为更复杂的 IoT 场景提供了支持。在实际应用中，需要根据功耗、被发现速度和安全性需求，合理配置广播参数。
