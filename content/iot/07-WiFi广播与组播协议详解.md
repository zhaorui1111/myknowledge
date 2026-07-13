# 07 · WiFi 广播与组播协议详解

## 一、概述

在 WiFi 网络中，广播（Broadcast）和组播（Multicast）是 IoT 设备发现、配网、组控制等场景的基础通信机制。理解 WiFi 广播协议的工作原理对于 IoT 工程实践至关重要。

本章从 IEEE 802.11 MAC 层帧类型讲起，覆盖 WiFi 广播/组播的原理、IoT 中的典型应用以及常见问题。

## 二、802.11 MAC 帧类型

IEEE 802.11 标准定义了三种 MAC 帧类型：

| 帧类型 | Type | 子类型 | 用途 |
|--------|------|--------|------|
| 管理帧 | 00 | Beacon, Probe Request/Response, Association | 网络发现与连接管理 |
| 控制帧 | 01 | RTS/CTS, ACK | 介质访问控制 |
| 数据帧 | 10 | Data, QoS Data | 数据传输 |

### 2.1 地址字段

802.11 数据帧有 4 个地址字段（Address 1-4），常见用法：

| 地址字段 | 含义（STA→AP方向） | 含义（AP→STA方向） |
|---------|-------------------|-------------------|
| Address 1 | RA（接收地址）= AP | RA = 目标STA |
| Address 2 | TA（发送地址）= STA | TA = AP |
| Address 3 | DA（目标地址） | SA（源地址） |
| Address 4 | （仅 IBSS 使用） | （仅 IBSS 使用） |

广播帧的 DA（目标地址）为 `FF:FF:FF:FF:FF:FF`。组播帧的 DA 为组播 MAC 地址（第一字节最低位为 1）。

### 2.2 广播/组播帧的特点

- **无 ACK**：广播和组播帧不要求接收方返回 ACK 确认，因为发送方无法同时处理多个接收方的 ACK。这导致广播/组播的可靠性低于单播。
- **最低速率发送**：广播/组播帧通常以基础速率（Basic Rate，如 1Mbps 或 6Mbps）发送，确保所有设备都能接收。这降低了传输效率但提高了覆盖范围。
- **不加密（部分场景）**：在 WPA2/WPA3 加密网络中，广播/组播帧使用 Group Key 加密，但管理帧（如 Beacon）不加密。

## 三、管理帧

### 3.1 Beacon（信标帧）

AP 周期性广播 Beacon 帧，宣告网络的存在：

```
Beacon Frame 结构:
├── Frame Control (管理帧, 子类型=Beacon)
├── Duration
├── Address 1 = FF:FF:FF:FF:FF:FF (广播)
├── Address 2 = AP MAC
├── Address 3 = SSID (BSSID)
├── Sequence Control
├── Timestamp
├── Beacon Interval (通常 100ms)
├── Capability Information
├── SSIE (SSID)
├── Supported Rates
├── DS Parameter (信道)
├── RSN (安全能力)
├── HT/VHE Capabilities
└── ...
```

**Beacon Interval**：默认 100ms（102.4ms 精确值）。IoT 场景中，部分低功耗 AP 可调整至 1 秒以减少唤醒次数。

**隐藏 SSID**：当 SSID 隐藏时，Beacon 中 SSIE 字段的 SSID 长度为 0，设备需要通过 Probe Request 主动获取 SSID。

### 3.2 Probe Request / Probe Response

设备主动扫描时发送 Probe Request：

```
设备(STA)                         AP
  |                                 |
  |--- Probe Request (广播) ------->|  (可选: 包含特定SSID)
  |                                 |
  |<--- Probe Response -------------|  (AP 回复)
  |<--- Probe Response -------------|  (多个AP各自回复)
```

**Active Scan vs Passive Scan**：
- **Passive Scan**：设备在每个信道监听 Beacon，不发送任何帧。功耗低但扫描慢。
- **Active Scan**：设备在每个信道发送 Probe Request，等待 Probe Response。扫描快但功耗高。

IoT 设备通常优先使用 Active Scan 以加快连接速度，但对电池供电设备可配置为 Passive Scan。

### 3.3 管理帧保护（PMF）

802.11w 引入了 **Protected Management Frames（PMF）**，对部分管理帧加密：

- 加密的管理帧：Disassociation, Deauthentication, Action。
- 仍然不加密的管理帧：Beacon, Probe Request/Response, Association（这些在加密前就需要传输）。

PMF 防止了伪造的 Deauth/Disassoc 攻击，IoT 设备应尽量启用 PMF。

## 四、IP 层广播与组播

### 4.1 广播

**受限广播**：`255.255.255.255`，只在当前子网内传播，路由器不转发。

**定向广播**：`192.168.1.255`（子网广播地址），可跨路由器转发（默认情况下路由器通常关闭此功能）。

WiFi 中的 IP 广播：
- AP 将广播包以 802.11 广播帧的形式在空口发送。
- 同一 BSS（基本服务集）内的所有设备都能收到。
- 使用 Group Key 加密（如果启用了 WPA2/3）。

### 4.2 组播

IP 组播地址范围：`224.0.0.0 - 239.255.255.255`

**组播 MAC 地址映射**：IP 组播地址映射到 MAC 组播地址的方法是：`01:00:5E:XX:XX:XX`，其中 `XX:XX:XX` 是 IP 组播地址低 23 位。

例如：`224.0.0.251` → `01:00:5E:00:00:FB`（mDNS 地址）。

**组播在 WiFi 中的问题**：
- WiFi AP 通常将组播帧以最低速率发送，效率低。
- 组播帧无 ACK，可靠性差。
- 设备需要在 WiFi 芯片层面开启组播接收（部分芯片默认关闭以省电）。

### 4.3 IGMP Snooping

AP 可以通过 IGMP Snooping 学习哪些设备加入了哪个组播组，只向组内成员转发组播帧，减少空口浪费。

## 五、IoT 中的广播/组播应用

### 5.1 设备发现

**mDNS（Multicast DNS）**：
- 使用组播地址 `224.0.0.251:5353`（IPv4）和 `FF02::FB:5353`（IPv6）。
- 设备广播自身的服务信息，其他设备可以监听发现。
- 常用于局域网内 IoT 设备发现（如 Matter On-network 发现、AirPlay 设备发现）。

```
设备A: "我提供 _matter._tcp 服务，IP=192.168.1.100, Port=5540"
  → 组播发送 mDNS PTR/SRV/TXT 记录

设备B: 收到组播，解析服务信息
  → 发现设备A，可建立连接
```

**SSDP（Simple Service Discovery Protocol）****：
- 使用组播地址 `239.255.255.250:1900`。
- UPnP 协议的设备发现机制。
- IoT 设备广播自身描述，控制点搜索设备。

### 5.2 SmartConfig 配网

SmartConfig 利用 WiFi 广播/组播传递配网信息：
- App 通过 UDP 广播或组播发送编码后的 WiFi 凭证。
- 设备在监听模式（Promiscuous Mode）下捕获这些帧。
- 编码方式利用包长度、目标地址等元信息（因为 payload 在加密网络中不可读）。

### 5.3 组控制

IoT 场景中的组控制（如一个开关同时控制多个灯）：
- 使用 IP 组播向一组设备发送控制指令。
- 相比逐个单播，组播减少了空口开销。
- 但需要处理组播不可靠的问题（无 ACK），通常配合应用层确认。

### 5.4 OTA 升级通知

- 云端或网关通过组播通知局域网内设备有新固件。
- 设备收到通知后自行下载固件。
- 减少逐个通知的开销。

## 六、WiFi 功率管理与广播/组播

### 6.1 DTIM

**Delivery Traffic Indication Message（DTIM）** 是 Beacon 中的特殊字段，指示 AP 缓存了广播/组播帧：

- AP 周期性发送 Beacon（Beacon Interval = 100ms）。
- 每 N 个 Beacon 中包含一个 DTIM（DTIM Interval，通常 1-3）。
- DTIM 到达时，AP 发送缓存的广播/组播帧。
- 省电模式的设备只需在 DTIM 时唤醒接收广播/组播。

```
时间轴:
  Beacon --- Beacon --- DTIM(Beacon) --- Beacon --- Beacon --- DTIM(Beacon)
                                     |                                |
                               发送缓存的广播/组播               发送缓存的广播/组播
```

**IoT 低功耗优化**：
- 对于不需要实时接收广播的设备，可设置较大的 DTIM Interval（如 3 或 10）。
- 设备只在 DTIM Beacon 时唤醒，其余时间睡眠。
- 但 DTIM Interval 过大会增加广播延迟。

### 6.2 省电模式的影响

- **Active Mode**：设备持续清醒，可立即接收广播/组播。
- **PS Mode（Power Save）**：设备睡眠，AP 缓存单播帧，在 DTIM 时发送广播/组播。
- **U-APSD**：设备主动轮询 AP 获取缓存帧，可进一步省电。

## 七、常见问题与排查

### 7.1 组播包丢失

**原因**：
- 组播以最低速率发送，受干扰概率大。
- 无 ACK 机制，丢包无法重传。
- 部分设备 WiFi 芯片未开启组播接收。

**解决方案**：
- 在应用层实现重传或确认机制。
- 将组播转换为单播（Unicast-to-Multicast 转换，部分 AP 支持）。
- 调整 DTIM Interval 减少省电模式下的丢包。

### 7.2 广播风暴

**原因**：网络中出现大量广播包（如 ARP 风暴、环路广播），导致空口拥塞。

**解决方案**：
- AP 配置广播限速（Broadcast Suppression）。
- 合理划分 VLAN，限制广播域。
- IoT 设备避免频繁发送广播包。

### 7.3 隐藏节点问题

广播/组播帧没有 RTS/CTS 机制，容易受隐藏节点干扰。

**解决方案**：
- 合理规划 AP 部署位置。
- 使用 5GHz 频段减少干扰（如果设备支持）。

## 八、总结

WiFi 广播和组播是 IoT 设备发现、配网、组控制的核心机制。理解 802.11 管理帧（Beacon/Probe）和数据帧广播的原理，有助于优化 IoT 设备的连接速度和功耗。在实际工程中，需要注意广播/组播的不可靠性（无 ACK），在应用层实现必要的重传和确认机制。DTIM 机制是平衡低功耗和广播接收的关键参数，需要根据设备类型合理配置。
