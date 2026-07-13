# 10 · Thread 协议详解

## 一、概述

Thread 是一种基于 IPv6 的低功耗网状网络协议，由 Thread Group（由 Google/Nest、ARM、Samsung 等公司发起）于 2014 年发布。Thread 运行在 IEEE 802.15.4 物理层上，使用 6LoWPAN 适配层实现 IPv6 通信。

Thread 的核心特点：原生 IP 支持、自愈合 Mesh 网络、低功耗、无单点故障。Thread 本身只定义网络层，不定义应用层——应用层由 Matter 等协议承载。

## 二、协议栈结构

```
┌─────────────────────────────────┐
│  Application (Matter / other)   │  应用层
├─────────────────────────────────┤
│  UDP / CoAP                     │  传输层
├─────────────────────────────────┤
│  IPv6                           │  网络层
├─────────────────────────────────┤
│  6LoWPAN (Header Compression)   │  适配层
├─────────────────────────────────┤
│  Thread Mesh (Routing, MLE)     │  Mesh 网络层
├─────────────────────────────────┤
│  IEEE 802.15.4 MAC              │  介质访问层
├─────────────────────────────────┤
│  IEEE 802.15.4 PHY (2.4GHz)     │  物理层
└─────────────────────────────────┘
```

## 三、设备角色

Thread 网络定义了以下角色（一个设备可以同时具有多个角色）：

| 角色 | 功能 | 供电要求 |
|------|------|---------|
| Router | 转发数据、维护路由表、为子设备提供接入 | 常供电 |
| End Device | 只与父 Router 通信，不转发数据 | 电池供电 |
| Router-Eligible End Device (REED) | 当前是 End Device，但可升级为 Router | 常供电 |
| Leader | 管理 Router ID 分配和网络数据 | 常供电 |
| Border Router | 连接 Thread 网络与其他 IP 网络 | 常供电 |
| Commissioner | 对新设备进行认证和配网（通常是手机） | 任意 |

### 3.1 Router

- Thread 网络最多支持 32 个 Router。
- Router 维护路由表，参与 Mesh 路由。
- Router 可以为子设备（End Device）提供网络接入。
- Router 之间使用 MLE（Mesh Link Establishment）协议维护邻居关系。

### 3.2 End Device

- 只与一个父 Router 通信，不参与路由转发。
- 可以进入低功耗睡眠模式，父 Router 缓存其数据。
- REED 在网络需要更多 Router 时可以升级为 Router。

### 3.3 Leader

- Leader 是网络中的一个特殊 Router，负责管理 Router ID 分配。
- Leader 维护网络数据（Network Data），包括网络前缀、Border Router 信息等。
- Leader 通过选举产生，Leader 故障时网络会自动选举新的 Leader。
- Leader 选举基于 Router ID 和路由成本。

### 3.4 Border Router

- Border Router 连接 Thread 网络和外部 IP 网络（如 WiFi/以太网）。
- Thread 网络可以有多个 Border Router（冗余，无单点故障）。
- Border Router 向 Thread 网络通告外部 IP 前缀，使 Thread 设备可以访问互联网。
- 典型设备：Apple TV 4K、HomePod mini、Google Nest Hub。

## 四、网络建立与加入

### 4.1 网络建立

```
第一个设备 (成为 Leader):
  1. 选择信道（扫描最空闲的 802.15.4 信道）
  2. 选择 PAN ID 和 Extended PAN ID
  3. 生成 Network Key 和 Master Key
  4. 分配自己 Router ID = 1
  5. 成为 Leader
  6. 开始广播 MLE Advertisements
```

### 4.2 设备加入（Commissioning）

Thread 设备加入网络分两步：**Attach**（关联到网络）和 **Commission**（认证）。

**Attach 过程**：
```
新设备                        网络中已有设备
  |                               |
  | 1. 扫描 802.15.4 信道         |
  |    发送 MLE Discovery Request |
  |------------------------------>|
  |                               |
  |<-- MLE Discovery Response ----|
  |    (网络信息、信道、PAN ID)     |
  |                               |
  | 2. 选择父 Router              |
  |    发送 MLE Parent Request    |
  |------------------------------>|
  |                               |
  |<-- MLE Parent Response -------|
  |    (分配的短地址)              |
  |                               |
  | 3. 发送 MLE Child ID Request  |
  |    (请求加入)                  |
  |------------------------------>|
  |                               |
  |<-- MLE Child ID Response -----|
  |    (加入成功，成为 End Device) |
```

**Commissioning 过程**：
新设备需要获得 Network Key 才能解密网络通信。Thread 使用 **Commissioner** 模型：

```
新设备 (Joiner)              Border Router (Commissioner)
  |                               |
  | 1. 通过BLE发现Commissioner     |
  |    (或使用带外通道)             |
  |                               |
  | 2. Joiner DSID (Device ID)    |
  |    Joiner Credential (PSKd)   |
  |    通过Joiner Request交换       |
  |<==============================>|
  |                               |
  | 3. Commissioner 验证 PSKd     |
  |    (PSKd = 安装码/配网密码)     |
  |                               |
  | 4. 通过安全通道传递 Network Key |
  |<--- Network Key --------------|
  |                               |
  | 5. Joiner 用 Network Key      |
  |    解密网络通信，正式加入        |
```

### 4.3 REED 升级为 Router

当网络中某个 Router 故障或 Router 数量不足时：
1. End Device 检测到需要更多 Router（通过 Router ID 可用性和邻居信号质量）。
2. REED 自主决定升级为 Router。
3. 向 Leader 请求 Router ID。
4. Leader 分配 Router ID。
5. REED 成为 Router，开始转发数据和接受子设备。

这个机制使 Thread 网络具备自愈合能力。

## 五、路由机制

### 5.1 Mesh 路由

Thread 使用 **RPL（Routing Protocol for Low-Power and Lossy Networks）** 进行路由：

- RPL 构建一个 **DODAG（Destination-Oriented Directed Acyclic Graph）**。
- 每个 Router 计算到达其他 Router 的路径。
- 路由基于 Rank（到 DODAG 根的跳数/成本）。

### 5.2 路由表

每个 Router 维护：
- **邻居表**：一跳邻居的信息。
- **路由表**：到网络中其他 Router 的下一跳。
- **缓存表**：为子设备缓存的数据帧。

### 5.3 数据转发

```
End Device A → 父 Router R1 → Router R3 → Router R5 → Border Router
                                                          ↓
                                                    外部 IP 网络
```

End Device 的数据通过父 Router 进入 Mesh 网络，Router 之间根据路由表转发。

## 六、IPv6 与 6LoWPAN

### 6.1 IPv6 地址

Thread 网络中每个设备都有 IPv6 地址：

- **RLOC（Routing Locator）**：基于 Router ID 和 Child ID 的地址，用于网络内路由。
  - 格式：`fd00:db8::[Router ID]:[Child ID]`
  - 当设备更换父 Router 时，RLOC 会变化。

- **ML-EID（Mesh-Local EID）**：基于设备 EUI-64 的地址，不随网络拓扑变化。
  - 用于设备身份标识。

- **GUA（Global Unicast Address）**：基于 Border Router 通告的全局前缀的地址。
  - 用于与外部互联网通信。

### 6.2 6LoWPAN 适配

6LoWPAN 在 IPv6 和 802.15.4 之间做适配：

- **头部压缩**：IPv6 头部 40 字节，6LoWPAN 可压缩到 2-7 字节。
- **分片重组**：802.15.4 帧最大 127 字节，IPv6 最小 MTU 1280 字节，需要分片。
- **地址自动配置**：基于 802.15.4 EUI-64 自动生成 IPv6 接口标识符。

```
IPHC压缩示例:
  原始 IPv6 头部: 40 bytes
  ┌──────────────────────────────┐
  │ Version(4) + TC(8) + FL(20) │
  │ Payload Length(16)          │
  │ Next Header(8)              │
  │ Hop Limit(8)                │
  │ Source Address(128)         │
  │ Destination Address(128)    │
  └──────────────────────────────┘

  IPHC压缩后: 7 bytes
  ┌──────────────────┐
  │ IPHC Dispatch(2) │
  │ Next Header(1)   │
  │ Hop Limit(1)     │
  │ Source (压缩)    │
  │ Dest (压缩)      │
  └──────────────────┘
```

## 七、安全机制

### 7.1 密钥体系

| 密钥 | 用途 | 说明 |
|------|------|------|
| Master Key | 生成其他密钥 | 网络建立时生成 |
| Network Key | MAC 层加密 | 所有设备共享 |
| K1-K2 | 密钥派生 | 用于生成其他密钥 |
| PSKc | Commissioner 认证 | Commissioning 密码 |
| Joiner PSKd | 设备入网认证 | 一次性密码 |

### 7.2 MAC 层安全

- 使用 AES-128-CCM 加密。
- 帧计数器防止重放攻击。
- Network Key 用于设备间通信加密。

### 7.3 应用层安全

- Matter 在 Thread 之上使用 CASE（Certificate Authenticated Session Establishment）建立端到端加密。
- 即使 Network Key 泄露，应用层数据仍然安全。

## 八、Thread 网络特性

### 8.1 无单点故障

- 多个 Border Router：任意 Border Router 故障不影响网络。
- Router 自主升级：Router 故障时 REED 自动补位。
- Leader 自动选举：Leader 故障时网络重新选举。

### 8.2 自愈合

- Router 故障时，其子设备自动寻找新的父 Router。
- 路由表自动更新，绕过故障节点。
- 整个过程对应用层透明。

### 8.3 低功耗

- End Device 可以进入睡眠模式。
- 父 Router 缓存睡眠子设备的数据。
- 睡眠设备定期唤醒轮询父 Router 获取数据。
- 典型占空比 < 1%（电池可使用数年）。

## 九、Thread 与其他协议对比

| 特性 | Thread | Zigbee | BLE Mesh |
|------|--------|--------|----------|
| 物理层 | 802.15.4 | 802.15.4 | BLE PHY |
| IP 支持 | IPv6 原生 | 否 | 否 |
| Mesh | 是 | 是 | 是 |
| 最大节点 | 32 Routers + 大量子设备 | 65535 | 32767 |
| 应用层 | Matter 等 | ZCL | BLE Mesh Model |
| Border Router | 多个，无单点故障 | 单一协调器 | 无网关概念 |
| 自愈合 | 强 | 中 | 中 |

## 十、Thread 与 Matter 的关系

Thread 是网络层协议，Matter 是应用层协议。Matter 可以运行在 Thread 或 WiFi 之上：

```
Matter 应用层
     ↓
Thread (Mesh 网络)  或  WiFi (直连)
     ↓
802.15.4 PHY        或  802.11 PHY
```

选择 Thread 的场景：电池供电设备、需要 Mesh 覆盖的设备（传感器、门锁、开关）。
选择 WiFi 的场景：高带宽设备（摄像头）、需要直连互联网的设备（智能音箱）。

## 十一、总结

Thread 是一个设计精良的低功耗 IPv6 Mesh 网络协议。它的核心优势在于原生 IP 支持（可与互联网无缝互通）、无单点故障的架构和自愈合能力。Thread 与 Matter 的结合被视为智能家居的未来标准——Thread 提供可靠的网络基础设施，Matter 提供统一的应用层协议。
