# 04 · Zigbee 设备入网与绑定流程

## 一、概述

Zigbee 是基于 IEEE 802.15.4 标准的低功耗、低数据速率无线通信协议，工作在 2.4GHz 频段，支持网状网络（Mesh Network）拓扑。Zigbee 广泛应用于智能家居、工业控制和楼宇自动化场景。

Zigbee 网络中有三种设备角色：协调器（Coordinator）、路由器（Router）和终端设备（End Device）。设备入网（Joining）是设备从「未联网」到「成为网络成员」的过程，绑定（Binding）是建立设备间数据传输逻辑关系的过程。

## 二、Zigbee 网络架构

### 2.1 三种设备角色

| 角色 | 功能 | 供电 | 典型设备 |
|------|------|------|---------|
| Coordinator（协调器） | 创建网络、管理地址分配、存储网络信息 | 常供电 | 网关、Hub |
| Router（路由器） | 转发数据、扩展网络覆盖、参与路由 | 常供电 | 智能插座、灯泡 |
| End Device（终端设备） | 只与父节点通信，不转发数据 | 电池供电 | 传感器、开关 |

### 2.2 网络拓扑

Zigbee 支持三种拓扑：

- **星形（Star）**：终端设备直接与协调器通信。
- **树形（Tree）**：数据沿树形路径传递，路由器作为中间节点。
- **网状（Mesh）**：路由器之间可以多跳路由，具备自愈合能力。这是 Zigbee 最核心的拓扑优势。

### 2.3 协议栈分层

```
┌─────────────────────────┐
│ ZCL (Zigbee Cluster Library) │  应用层：定义设备类型和簇
├─────────────────────────┤
│ ZDO (Zigbee Device Object)   │  设备管理：发现、绑定、网络管理
├─────────────────────────┤
│ APS (Application Support)     │  应用支持：端点、绑定表、组地址
├─────────────────────────┤
│ NWK (Network Layer)           │  网络层：路由、地址分配、安全
├─────────────────────────┤
│ MAC (IEEE 802.15.4 MAC)       │  介质访问：CSMA/CA、帧确认
├─────────────────────────┤
│ PHY (IEEE 802.15.4 PHY)       │  物理层：2.4GHz DSSS, 250kbps
└─────────────────────────┘
```

## 三、设备入网流程

### 3.1 网络发现与加入

```
新设备                           Coordinator/Router
   |                                    |
   | 1. 发起网络扫描                     |
   |    Beacon Request (广播)           |
   |----------------------------------->|
   |                                    |
   |<--- Beacon Response (网络信息) ----|
   |    (PAN ID, Permit Joining标志,    |
   |     Router Capacity, 等)           |
   |                                    |
   | 2. 选择网络，发送Association Request|
   |    Association Request             |
   |----------------------------------->|
   |                                    | 3. 分配网络地址
   |                                    |    (短地址)
   |                                    |
   |<--- Association Response ----------|
   |    (分配的短地址, 状态)              |
   |                                    |
   | 4. 设备已加入网络                    |
   |    可开始发送/接收数据               |
```

### 3.2 Permit Joining（允许加入）

协调器或路由器需要开启 **Permit Joining** 才能接受新设备加入。这是一个安全机制，防止未授权设备加入网络。

- 可以通过协调器的管理命令开启/关闭。
- 可以设置时间窗口（如 60 秒后自动关闭）。
- 生产环境中，通常只在配网时短暂开启。

### 3.3 网络密钥分发

Zigbee 使用网络密钥（Network Key）对网络层帧进行加密。设备加入网络时需要获取网络密钥：

**方式一：预置密钥**
- 设备出厂时预置网络密钥。
- 简单但安全性低，所有设备可能共享同一密钥。

**方式二：通过 Trust Center 分发**（Zigbee 3.0 标准方式）
- Coordinator 作为 Trust Center，生成随机网络密钥。
- 设备加入网络后，Trust Center 用 **安装码（Install Code）** 或 **链路密钥（Link Key）** 加密传输网络密钥。
- 安装码是设备出厂时预置的一次性码，印在设备标签上，用户在配网时输入。

```
新设备                         Trust Center (Coordinator)
   |                                    |
   | 1. Association Request             |
   |----------------------------------->|
   |<--- Association Response ----------|
   |                                    |
   | 2. Transport Key Request           |
   |    (用Install Code加密)             |
   |<--- Transport Key Response --------|
   |    (加密的网络密钥)                  |
   |                                    |
   | 3. 设备解密获得Network Key           |
   |    后续通信使用Network Key加密       |
```

### 3.4 安装码（Install Code）

Zigbee 3.0 引入安装码机制，提升配网安全性：

- 安装码是 6-18 字节的随机数，通常以二维码或文本形式印在设备上。
- 设备出厂时预置安装码，同时安装码的 AES-MMO hash 值录入协调器。
- 配网时，设备用安装码派生的 Link Key 加密网络密钥请求。
- Trust Center 验证安装码 hash，通过后分发网络密钥。

安装码格式示例：`ZB0082B3D0E8A4A2A2B2C2D2E2F3031`

## 四、设备绑定

### 4.1 绑定的概念

绑定（Binding）建立的是 **源设备的端点到目标设备端点** 之间的逻辑关系。绑定后，源设备发送数据时不需要指定目标地址，协议栈会自动根据绑定表路由数据。

绑定表存储在 Coordinator 或源设备中。

### 4.2 绑定方式

**方式一：ZDO Bind Request（集中式绑定）**
```
设备A                     Coordinator                设备B
  |                           |                         |
  | 1. ZDO Bind Request       |                         |
  | (src_ep, cluster, dst)    |                         |
  |-------------------------->|                         |
  |                           | 2. 存储绑定表            |
  |                           |                         |
  |<--- Bind Response --------|                         |
  |                           |                         |
  | 3. 发送数据(无需指定目标)  |                         |
  |--- APS Data (cluster) -->|                         |
  |                           |--- 转发给设备B --------->|
  |                           |                         |
```

**方式二：自动绑定（Touchlink / Identify）**
1. 用户触发设备的 Identify 模式（如长按按钮 5 秒）。
2. 设备进入 Identify 状态，广播自身信息。
3. 另一设备收到后，自动创建绑定。

**方式三：群组绑定**
- 将多个设备加入同一群组（Group Address）。
- 源设备向群组地址发送数据，群组内所有设备接收。
- 适用于一个开关控制多个灯泡的场景。

### 4.3 簇（Cluster）与设备类型

Zigbee Cluster Library（ZCL）定义了标准设备类型和簇：

| 设备类型 | 输入簇（Server） | 输出簇（Client） | 典型设备 |
|---------|-----------------|-----------------|---------|
| On/Off Switch | On/Off | On/Off | 墙壁开关 |
| On/Off Light | On/Off | — | 灯泡 |
| Dimmer Switch | Level Control | Level Control | 调光开关 |
| Color Controller | Color Control | Color Control | 彩灯控制器 |
| Temperature Sensor | Temperature Measurement | — | 温度传感器 |
| IAS Zone | Zone Status | — | 门磁、烟雾传感器 |

绑定是建立在相同 Cluster ID 上的。例如，开关的 On/Off 输出簇绑定到灯泡的 On/Off 输入簇。

## 五、Zigbee 3.0 安全机制

### 5.1 密钥体系

Zigbee 使用多层密钥：

| 密钥 | 用途 | 分发方式 |
|------|------|---------|
| Network Key | 网络层广播加密 | Trust Center 分发 |
| Link Key | APS 层单播加密 | 预置或安装码派生 |
| Trust Center Link Key | 与 Trust Center 通信 | 预置或安装码派生 |
| Application Link Key | 设备间应用层加密 | 通过 Trust Center 协商 |

### 5.2 安全模式

- **Standard Security Mode**：Trust Center 管理网络密钥，设备间使用网络密钥加密广播，使用链路密钥加密单播。这是 Zigbee 3.0 的默认模式。
- **Distributed Security Mode**：无 Trust Center，所有 Router 都可以分发网络密钥。适用于无网关场景，安全性较低。

### 5.3 帧安全

Zigbee 在 NWK 层和 APS 层都支持安全：
- **NWK 层安全**：使用 Network Key 加密所有网络帧，提供来源认证和完整性保护。
- **APS 层安全**：使用 Link Key 对特定端到端通信加密，提供更强的端到端安全。

安全帧格式包含：帧计数器（防重放）、密钥标识、MIC（消息完整性码）。

## 六、Zigbee 网络管理

### 6.1 地址分配

Zigbee 使用 16 位短地址（Short Address）。Coordinator 地址为 0x0000，其他设备由父节点分配。

地址分配使用 **分布式地址分配方案（Cskip）**：
- Coordinator 配置参数：`nwkMaxChildren (Cm)`、`nwkMaxRouters (Rm)`、`nwkMaxDepth (Lm)`。
- 每个路由器获得一个地址子树，可分配给其子设备。
- 计算公式：`Cskip(d) = (1 + Cm - Rm - Cm * Rm^(Lm-d-1)) / (1 - Rm)`（当 Rm ≠ 1）

### 6.2 路由发现

当设备需要发送数据但没有路由信息时，发起路由发现：
1. 源设备广播 Route Request。
2. 收到的 Router 记录来源，继续转发（TTL 递减）。
3. 目标设备收到后，沿反向路径发送 Route Reply。
4. 沿途节点更新路由表。
5. 路由建立，数据按最优路径传输。

### 6.3 设备离开网络

设备离开网络有两种方式：
- **主动离开**：设备发送 Leave Request 给父节点。
- **被动离开**：Coordinator 或父节点发送 Leave Request 给设备。

设备离开后，其子设备需要重新寻找新的父节点（如果是 Router）或进入孤立状态（如果是 End Device）。

## 七、Zigbee 与其他协议的对比

| 特性 | Zigbee | BLE Mesh | Thread | WiFi |
|------|--------|----------|--------|------|
| 频段 | 2.4GHz | 2.4GHz | 2.4GHz (802.15.4) | 2.4/5GHz |
| 速率 | 250kbps | 1Mbps | 250kbps | 11-9600Mbps |
| 功耗 | 极低 | 低 | 极低 | 高 |
| 节点数 | 最多 65535 | 最多 32767 | 最多 65535 | 通常 < 50 |
| Mesh | 支持 | 支持 | 支持 | 不支持（通常） |
| IP 协议 | 否 | 否 | 是 (6LoWPAN) | 是 |
| 生态 | 成熟 | 成长中 | 成长中 | 成熟 |

## 八、总结

Zigbee 的设备入网流程涉及网络发现、关联、密钥分发三个关键步骤。Zigbee 3.0 的安装码机制显著提升了配网安全性。绑定机制通过绑定表建立了设备间的逻辑关联，使得数据可以自动路由到正确的目标。Zigbee 的网状网络和自愈合能力使其在智能家居领域仍然是重要的通信协议之一。
