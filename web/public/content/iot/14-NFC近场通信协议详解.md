# 14 · NFC 近场通信协议详解

## 一、概述

NFC（Near Field Communication，近场通信）是一种短距离（通常 < 10cm）的高频无线通信技术，工作在 13.56 MHz 频段，传输速率通常为 106/212/424 kbps。NFC 由 NFC Forum 标准化，兼容 ISO/IEC 14443、ISO/IEC 15693 和 FeliCa 等标准。

NFC 在 IoT 领域的主要应用：设备配网（碰一碰）、门禁系统、支付、身份认证、标签读取等。

## 二、NFC 技术基础

### 2.1 工作原理

NFC 基于电磁感应耦合：

```
发起设备 (Initiator)              目标设备 (Target)
  ┌────────────────┐              ┌────────────────┐
  │  天线线圈       │  13.56MHz    │  天线线圈       │
  │  产生磁场       │ ═════════>  │  感应电动势     │
  │                │  磁场耦合     │  (被动供电)     │
  └────────────────┘              └────────────────┘

  主动设备通过天线产生 13.56MHz 交变磁场
  被动设备的线圈在磁场中感应出电动势
  → 被动设备获得能量（无需电池）
  → 被动设备通过负载调制返回数据
```

**负载调制（Load Modulation）**：被动设备通过改变自身天线的负载（接通/断开电阻），改变发起设备天线的电压，实现数据回传。这种机制使被动设备无需电源即可通信。

### 2.2 通信模式

| 模式 | 说明 | 典型场景 |
|------|------|---------|
| 主动模式 (Active) | 双方都主动发射磁场，交替通信 | 手机对手机传输 |
| 被动模式 (Passive) | 发起设备发射磁场，目标设备通过负载调制回应 | 手机读取 NFC Tag |

### 2.3 与 RFID 的关系

NFC 是 RFID 的超集：
- NFC 兼容 ISO 14443 Type A/B（如 MIFARE、DESFIRE）。
- NFC 兼容 FeliCa（Sony 的 RFID 技术，日本广泛使用）。
- NFC 兼容 ISO 15693（Vicinity Card）。
- NFC 新增了点对点通信模式和卡模拟模式。

## 三、NFC 设备角色与模式

### 3.1 三种工作模式

| 模式 | 说明 | 典型应用 |
|------|------|---------|
| 读/写模式 (Reader/Writer) | 设备作为发起者，读写 NFC Tag | 读取智能海报、写入配网信息 |
| 点对点模式 (P2P) | 两个 NFC 设备双向通信 | 手机间分享联系人、照片 |
| 卡模拟模式 (Card Emulation) | 设备模拟为非接触式卡片 | 手机支付、门禁卡 |

### 3.2 IoT 中的典型应用

在 IoT 场景中，NFC 最常见的应用是 **设备配网辅助**：

```
手机 (NFC Reader)              IoT 设备 (NFC Tag)
  |                               |
  | 1. 手机靠近设备NFC区域          |
  |    读取NFC Tag内容             |
  |<-- NDEF Message --------------|
  |    (设备ID, 配网URL, BLE MAC)  |
  |                               |
  | 2. App解析NDEF，启动配网流程    |
  |    (BLE/SoftAP/直接连接)       |
  |                               |
  | 3. 配网完成                    |
```

设备上的 NFC Tag 是被动的（无需电源），出厂时写入配网信息。手机碰一碰即可读取并启动配网。

## 四、NFC 协议栈

```
┌─────────────────────────────────┐
│  Application (NDEF, Custom)      │  应用层
├─────────────────────────────────┤
│  LLCP (Logical Link Control)     │  逻辑链路控制（P2P）
├─────────────────────────────────┤
│  NFC Digital Protocol            │  数字协议层
│  (ISO 14443, FeliCa, Type 1-5)   │
├─────────────────────────────────┤
│  NFC RF (Analog)                 │  射频模拟层
│  (13.56MHz, ASK调制)             │
└─────────────────────────────────┘
```

## 五、NFC Forum Tag 类型

NFC Forum 定义了五种 Tag 类型：

### 5.1 Type 1 Tag

- 基于 ISO 14443 Type A。
- 存储容量：96 bytes - 2 KB。
- 速率：106 kbps。
- 代表产品：NXP Topaz。
- 特点：成本低，容量小，可改写。

### 5.2 Type 2 Tag

- 基于 ISO 14443 Type A。
- 存储容量：48 bytes - 4 KB。
- 速率：106 kbps。
- 代表产品：NXP NTAG 系列（NTAG213/215/216）。
- 特点：最常用的 NFC Tag，性价比高。
- NTAG216 容量 924 bytes，可存储完整 NDEF 消息或 vCard。

### 5.3 Type 3 Tag

- 基于 Sony FeliCa 技术。
- 存储容量：可变。
- 速率：212/424 kbps。
- 代表产品：FeliCa Lite-S。
- 特点：主要在日本使用，支持较大存储和更快速率。

### 5.4 Type 4 Tag

- 基于 ISO 14443 Type A/B。
- 存储容量：最大 64 KB。
- 速率：106/212/424 kbps。
- 代表产品：NXP DESFire、MIFARE Plus。
- 特点：支持文件系统和安全认证，容量大。

### 5.5 Type 5 Tag

- 基于 ISO 15693 (Vicinity Card)。
- 存储容量：可变。
- 速率：26.48 kbps。
- 代表产品：NXP ICODE 系列。
- 特点：读取距离稍远（可达 1.5m），但速率低。

## 六、NDEF（NFC Data Exchange Format）

NDEF 是 NFC Forum 定义的标准数据格式，用于在 NFC Tag 和设备间交换结构化数据。

### 6.1 NDEF 消息结构

```
NDEF Message:
┌──────────────────────────────────┐
│         NDEF Record 1             │
├──────────────────────────────────┤
│         NDEF Record 2             │
├──────────────────────────────────┤
│         ...                       │
└──────────────────────────────────┘

NDEF Record:
┌──────┬──────┬──────┬──────┬──────┬───────┬──────────┐
│ MB   │ ME   │ CF   │ SR   │ IL   │ TNF   │ Type     │
│ (1b) │ (1b) │ (1b) │ (1b) │ (1b) │ (3b)  │ Length   │
├──────┴──────┴──────┴──────┴──────┴───────┴──────────┤
│  Type Length │ Payload Length │ ID Length │          │
│  (1 byte)    │ (1-4 bytes)   │ (1 byte)  │          │
├──────────────┴───────────────┴───────────┤──────────┤
│  Type │ ID │ Payload                                │
└──────────────────────────────────────────┘

MB: Message Begin (是否是第一个Record)
ME: Message End (是否是最后一个Record)
CF: Chunk Flag (是否分片)
SR: Short Record (Payload < 255 bytes)
IL: ID Length Field 存在
TNF: Type Name Format
```

### 6.2 TNF（Type Name Format）

| TNF 值 | 说明 |
|--------|------|
| 0x00 | Empty（空记录） |
| 0x01 | NFC Forum well-known type（如 "U" = URI, "T" = Text） |
| 0x02 | Media-type (RFC 2046，如 "text/plain") |
| 0x03 | Absolute URI (RFC 3986) |
| 0x04 | NFC Forum external type（厂商自定义） |
| 0x05 | Unknown |
| 0x06 | Unchanged（分片续包） |

### 6.3 常见 NDEF Record 类型

**URI Record**：
```
Type: "U" (well-known)
URI Identifier Code: 0x00 (无前缀) / 0x01 (http://) / 0x04 (https://)
URI: "example.com/provision"
```

**Text Record**：
```
Type: "T" (well-known)
Language: "en"
Text: "Hello NFC"
```

**Smart Poster（智能海报）**：
- 包含 URI + 文本 + 可选元数据（如图像、动作）。
- 用于 NFC 海报、广告牌。

**Handover Record**：
- 用于 NFC Connection Handover，切换到蓝牙/WiFi 进行大数据传输。
- 包含蓝牙 MAC 地址、WiFi 配置等。

**Matter Handover**：
- Matter 使用 NDEF 携带配网信息。
- URI 格式：`MT:...`，包含 Passcode、Discriminator 等。

### 6.4 IoT 配网 NDEF 示例

设备 NFC Tag 中的 NDEF 消息示例：

```
Record 1 (URI):
  Type: "U"
  URI: "https://app.example.com/provision?device=DEVICE_001"

Record 2 (External Type):
  Type: "example.com:ble"
  Payload: {
    "ble_mac": "AA:BB:CC:DD:EE:FF",
    "service_uuid": "0000FFA0-0000-1000-8000-00805F9B34FB",
    "device_name": "MyDevice-001"
  }

Record 3 (Text):
  Type: "T"
  Text: "Scan to setup MyDevice-001"
```

手机碰一碰后，系统自动打开 URI 链接，App 解析 NDEF 中的设备信息，启动 BLE 配网流程。

## 七、NFC 安全

### 7.1 安全特性

NFC 的物理特性提供了一定的安全保障：
- 通信距离极短（< 10cm），需要物理接近。
- 难以远程窃听（需要非常近的距离）。
- 但仍需应用层加密保护敏感数据。

### 7.2 常见安全机制

- **Tag 密码保护**：部分 Tag（如 NTAG216）支持密码保护和读/写限制。
- **AES 加密**：Type 4 Tag（如 DESFire）支持 AES-128 加密。
- **安全芯片（SE）**：卡模拟模式可使用嵌入在设备中的安全芯片存储密钥。
- **HCE（Host Card Emulation）**：Android 支持软件卡模拟，通过云端安全元件管理密钥。

## 八、NFC Connection Handover

NFC Connection Handover 允许通过 NFC 快速建立蓝牙或 WiFi 连接：

```
手机 (NFC)                    设备 (NFC)
  |                              |
  | 1. NFC碰触                   |
  |--- Handover Request -------->|
  |    (携带蓝牙MAC/能力)          |
  |                              |
  |<-- Handover Select -----------|
  |    (确认蓝牙连接参数)          |
  |                              |
  | 2. NFC断开                   |
  |                              |
  | 3. 通过蓝牙建立连接            |
  |<=== BLE 连接 ==============>|
  |                              |
  | 4. 通过蓝牙进行大数据传输      |
  |<=== BLE 数据传输 ==========>|
```

这种方式结合了 NFC 的便利性（碰一碰建立连接）和蓝牙的高带宽（传输数据），广泛应用于无线音频设备配对。

## 九、NFC 在各平台的支持

### 9.1 Android

- `android.nfc` 包提供 NFC API。
- `NfcAdapter` 管理 NFC 硬件。
- 前台调度（Foreground Dispatch）：App 在前台时接收 NFC Intent。
- Reader Mode API：直接控制 Tag 读写。
- HCE API：实现卡模拟。
- Beam API（已废弃）：P2P 数据传输。

### 9.2 iOS

- iOS 11+ 支持 NFC Tag 读取（CoreNFC framework）。
- iOS 13+ 支持后台 Tag 读取（无需打开 App）。
- iOS 14+ 支持 App Clip Code（NFC 触发 App Clip）。
- iOS 不支持 P2P 模式和卡模拟（Apple Pay 除外，使用 SE）。

### 9.3 嵌入式平台

- NFC 读写器芯片：NXP PN532、ST CR95HF、TI TRF7970。
- 通常通过 SPI 或 I2C 连接 MCU。
- 提供 C 库支持 Tag 读写和 NDEF 解析。

## 十、总结

NFC 凭借其极短的通信距离和被动供电特性，在 IoT 领域主要用作设备配网入口和身份认证手段。NDEF 标准数据格式使得不同厂商的 NFC 设备可以互操作。虽然 NFC 的数据传输速率和距离有限，但其「碰一碰」的极致用户体验使其成为 IoT 设备配网的理想辅助手段。结合 BLE 或 WiFi 进行后续的大数据传输，NFC + BLE/WiFi 是当前智能家居配网的最佳体验组合。
