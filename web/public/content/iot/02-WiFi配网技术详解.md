# 02 · WiFi 配网技术详解

## 一、概述

WiFi 是 IoT 设备最常用的联网方式。由于 IoT 设备通常没有键盘和屏幕，如何将 WiFi 的 SSID 和密码安全地传递给设备，是一个核心工程问题。本章详细讲解四种主流 WiFi 配网技术：SmartConfig、SoftAP、BLE 辅助配网和 Wi-Fi Easy Connect（DPP）。

## 二、SmartConfig（广播/组播配网）

### 2.1 基本原理

SmartConfig 的核心思想是：手机已经连接到目标 WiFi，利用手机通过空口发送编码后的 WiFi 凭证，设备端在监听模式下捕获这些数据包并解码。

设备端工作流程：
1. 启动 WiFi 芯片进入 **混杂模式（Promiscuous Mode）**，监听所有 802.11 帧（不只是发给自己的帧）。
2. 提取每个数据包的长度、目标地址或 payload 信息。
3. 根据预定的编码协议，将提取的信息还原为 SSID 和密码。
4. 连接目标 WiFi。

### 2.2 编码方案

不同厂商的 SmartConfig 实现采用了不同的编码方案：

**ESP-TOUCH（乐鑫）**：
- 使用 UDP 组播包，将数据编码在目标 IP 地址的最后一个字节中。
- 每个字节的数据通过一个 UDP 包的目标 IP 地址最后一位来表示（0-255）。
- 使用前导码（如 0x00 序列）标识数据起始。
- 加入 CRC 校验保证数据完整性。

**AirKiss（微信）**：
- 使用 UDP 广播包，将数据编码在包的 payload 长度中。
- payload 长度映射到特定字符集，通过多个包组合传输完整数据。
- 使用魔术字和 CRC16 校验。

**长度编码通用原理**：
```
数据: "Hello" = [0x48, 0x65, 0x6C, 0x6C, 0x6F]

编码为包长度序列:
  包1长度 = 0x48 + 偏移量 = 72 + 100 = 172 字节
  包2长度 = 0x65 + 偏移量 = 101 + 100 = 201 字节
  ...
```

### 2.3 完整流程

```
┌──────┐                               ┌──────┐
│ App  │                               │Device│
└──┬───┘                               └──┬───┘
   | 1. 用户输入WiFi密码                   |
   |                                      |
   | 2. 发送前导码包序列 (同步)            |
   |---- UDP广播 x N ------------------->|
   |                                      | 3. 识别前导码，建立同步
   |                                      |
   | 4. 发送编码后的SSID+密码+CRC         |
   |---- UDP广播 x M ------------------->|
   |                                      | 5. 解码、校验CRC
   |                                      |
   |                                      | 6. 连接WiFi (STA模式)
   |                                      |---- DHCP ----> 路由器
   |                                      |<--- IP ------|
   |                                      |
   | 7. 设备连上WiFi后，发送通知           |
   |    (UDP广播或连App的端口)             |
   |<---- 通知(设备IP/MAC) ---------------|
   |                                      |
   | 8. App收到通知，完成绑定              |
```

### 2.4 关键问题与限制

**2.4.1 5GHz/2.4GHz 频段问题**
- 大多数 IoT 设备只支持 2.4GHz WiFi。
- 如果手机连接的是 5GHz 频段，手机发送的 UDP 包在 5GHz 空口上，设备在 2.4GHz 监听不到。
- 解决方案：引导用户关闭路由器 5GHz 或使用路由器「WiFi 频段分离」功能。部分 App（如米家）会通过 Android 的 WiFi 信息 API 检测频段。

**2.4.2 加密网络下的监听**
- 设备在未连接 WiFi 时，无法解密加密的数据帧内容。
- 因此 SmartConfig 只能利用数据包的 **长度** 和 **目标地址**（广播/组播地址不加密）等元信息来编码数据，不能利用 payload 内容（除非是明文传输）。
- 这极大地限制了传输效率，也是 SmartConfig 成功率不如 SoftAP 的根本原因。

**2.4.3 隐藏 SSID**
- 隐藏 SSID 的路由器不广播 Beacon 中的 SSID 字段，设备无法通过扫描获知 SSID。
- SmartConfig 可以通过编码传递 SSID，但设备连接时可能遇到兼容性问题。

**2.4.4 多设备并发**
- 当多台设备同时处于监听模式时，它们都会收到相同的编码包。
- 这实际上是一个优势——可以同时为多台设备配网。但需要确保每台设备正确解码。

### 2.5 成功率优化

- **重传机制**：App 端循环发送编码包 3-5 轮，提高设备解码成功率。
- **信道扫描**：设备端依次扫描 1-13 信道，在每个信道监听一段时间。
- **信号强度过滤**：设备端只处理 RSSI 高于阈值的包，减少噪声干扰。
- **双通道监听**：部分芯片支持同时监听两个信道，加快扫描速度。

## 三、SoftAP 配网

### 3.1 基本原理

设备启动后进入 **AP 模式（SoftAP）**，自身作为一个 WiFi 热点。手机连接这个热点后，通过 HTTP 接口或自定义 TCP 协议将 WiFi 凭证发送给设备。

### 3.2 详细流程

```
┌──────┐                               ┌──────┐
│ App  │                               │Device│
└──┬───┘                               └──┬───┘
   |                                      |
   | 1. 设备上电，进入SoftAP模式           |
   |    广播热点: "MyDevice-A1B2C3"        |
   |                                      |
   | 2. App扫描或引导用户连接设备热点      |
   |---- WiFi连接(设备热点) ------------->|
   |                                      |
   | 3. App发送WiFi凭证                   |
   |    POST /provision HTTP/1.1          |
   |    {ssid, password, token}           |
   |------------------------------------->|
   |                                      |
   | 4. 设备保存凭证，返回ACK             |
   |<--- 200 OK --------------------------|
   |                                      |
   | 5. 设备切换到STA模式                 |
   |    断开AP，连接目标WiFi               |
   |                                      |
   | 6. 手机断开设备热点，连回家庭WiFi     |
   |                                      |
   | 7. 设备连上WiFi后上报云端             |
   |    App通过云端或局域网发现设备        |
   |<---- 设备在线通知 -------------------|
```

### 3.3 HTTP 接口设计示例

设备端 HTTP 服务器（端口通常为 80 或 8888）：

```
POST /provision
Content-Type: application/json

{
  "ssid": "MyHomeWiFi",
  "password": "mypassword",
  "token": "bind_token_from_cloud",
  "device_id": "DEVICE_A1B2C3"
}

Response:
200 OK
{
  "status": "ok",
  "device_id": "DEVICE_A1B2C3"
}
```

状态查询接口：
```
GET /status

Response:
{
  "wifi_status": "connecting",  // connecting / connected / failed
  "ip": "",
  "error": ""
}
```

### 3.4 iOS 上的特殊处理

iOS 在连接临时 WiFi 热点时存在限制：
- iOS 不会自动将临时热点视为默认网络，可能仍在使用蜂窝网络。
- ` URLSession` 请求可能不走 WiFi 接口而是走蜂窝。
- 解决方案：使用 `NWConnection`（Network.framework）指定 WiFi 接口发送数据，或引导用户在系统设置中手动连接热点。

iOS 14+ 可以使用 `NEHotspotConfiguration` API 程序化连接指定 SSID 的热点：
```swift
let configuration = NEHotspotConfiguration(ssid: "MyDevice-A1B2C3")
configuration.joinOnce = true
NEHotspotConfigurationManager.shared.apply(configuration) { error in
    // 连接成功后发送凭证
}
```

### 3.5 优缺点

**优点**：
- 成功率最高（95%+），因为走标准 WiFi 连接 + HTTP，不依赖空口监听。
- 兼容所有路由器（包括隐藏 SSID、5GHz）。
- 可以传递任意长度数据（不受编码效率限制）。

**缺点**：
- 用户操作步骤多（连热点 → 输密码 → 等待 → 切回 WiFi）。
- 配网过程中手机断网（无法同时连接设备热点和家庭 WiFi）。
- 需要设备端实现 HTTP Server，占用更多 Flash/RAM。

## 四、BLE 辅助配网（BLE Provisioning）

### 4.1 基本原理

设备内置 BLE + WiFi 双模芯片（如 ESP32、nRF52840 + WiFi 模组）。设备启动后广播 BLE 广播包，手机扫描发现设备后建立 BLE GATT 连接，通过 GATT 特征值交换 WiFi 凭证。

### 4.2 GATT 服务设计

标准 BLE Provisioning Service（UUID: 0xFFA0）：

| 特征值 | UUID | 属性 | 用途 |
|--------|------|------|------|
| Prov Data | 0xFFA1 | Write | 写入 SSID/密码（加密） |
| Prov Status | 0xFFA2 | Notify | 通知配网状态 |
| Device Info | 0xFFA3 | Read | 读取设备信息（型号、版本） |
| Session | 0xFFA4 | Write/Notify | 密钥协商（ECDH） |

### 4.3 安全校验流程

```
手机                                 设备
  |--- 1. BLE扫描，发现设备 ----------->|
  |--- 2. 建立GATT连接 ---------------->|
  |                                    |
  |--- 3. 读取DeviceInfo(0xFFA3) ----->|
  |<-- 设备型号/版本/公钥指纹 ----------|
  |                                    |
  |--- 4. ECDH密钥协商 ---------------->|
  |    (通过0xFFA4交换ECDH公钥)         |
  |<--- 设备ECDH公钥 ------------------|
  |                                    | 派生会话密钥
  |                                    |
  |--- 5. 加密写入WiFi凭证 ----------->|
  |    (用会话密钥加密SSID+Password)    |
  |    Write 0xFFA1: encrypted_data    |
  |                                    | 解密验证
  |                                    |
  |<-- 6. Notify配网状态(0xFFA2) ------|
  |    status: WiFi连接成功/失败        |
  |                                    |
  |--- 7. 写入绑定Token -------------->|
  |    Write 0xFFA1: bind_token        |
  |<--- 8. 绑定确认 --------------------|
```

### 4.4 优势

- **安全性最高**：BLE 连接是点对点的，不像广播包可被任意设备捕获。加上 ECDH 密钥协商，凭证传输全程加密。
- **用户体验最好**：App 自动扫描发现设备，用户只需输入 WiFi 密码，全程无需手动切换 WiFi。
- **成功率最高**：不依赖空口监听，BLE 通信稳定可靠。
- **多功能**：BLE 通道可同时用于配网、设备绑定、OTA 升级和后续的本地控制。

## 五、Wi-Fi Easy Connect（DPP）

### 5.1 概述

Wi-Fi Easy Connect 是 WiFi 联盟在 WPA3 中引入的 Device Provisioning Protocol（DPP），又称 **Easy Connect**。它通过公钥加密安全地交换 WiFi 凭证，Android 10+ 和 iOS 13+ 已原生支持。

### 5.2 流程

1. **设备启动 DPP Configurator 角色**，广播自身的公钥信息（通过 BLE 或 WiFi 邻居发现）。
2. 手机（作为 Configurator）扫描到设备后，双方进行公钥交换。
3. 手机生成 WiFi 凭证，用设备的公钥加密后发送。
4. 设备用私钥解密获得凭证，连接 WiFi。

### 5.3 引导方式

- **二维码**：设备屏幕或贴纸上印有 DPP URI 二维码，格式如 `DPP:S:device_pk;M:ble;`
- **NFC**：NFC Tag 中写入 DPP URI。
- **BLE**：设备 BLE 广播中包含 DPP 信息。

### 5.4 优势与局限

**优势**：标准化协议，原生系统支持，安全性高（公钥加密），用户体验好（扫码即配）。

**局限**：需要设备支持 DPP 协议栈（较新的芯片才支持）；目前 IoT 生态中采用率还不高，主要在手机间分享 WiFi 密码场景使用。

## 六、配网成功率的工程实践

在实际量产项目中，通常会采用 **组合配网策略** 来最大化成功率：

```
默认: BLE Provisioning (成功率 98%)
  ↓ 如果设备无BLE
降级: SoftAP (成功率 95%)
  ↓ 如果用户操作困难
降级: SmartConfig (成功率 85%)
  ↓ 如果SmartConfig失败
回退: SoftAP (兜底)
```

**App 端最佳实践**：
- 提供「配网方式选择」页面，让用户根据设备和环境选择。
- SmartConfig 配网时提供实时进度反馈和重试机制。
- SoftAP 配网时提供步骤引导动画，降低用户操作门槛。
- 配网失败时提供详细的排障指南（如检查 2.4GHz、密码正确性等）。

## 七、总结

| 方案 | 成功率 | 安全性 | 用户体验 | 硬件成本 | 适用场景 |
|------|--------|--------|---------|---------|---------|
| SmartConfig | ~85% | 低 | 好（一键） | 最低 | 纯WiFi低成本设备 |
| SoftAP | ~95% | 中 | 一般（多步） | 低 | 兼容性要求高的设备 |
| BLE Provisioning | ~98% | 高 | 最好 | 中 | BLE+WiFi双模设备 |
| DPP | ~95% | 高 | 好 | 中 | 新标准设备 |

实际项目中，BLE 辅助配网是当前最优解，SoftAP 是最可靠的兜底方案，SmartConfig 适合对成本极度敏感的纯 WiFi 设备。
