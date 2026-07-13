# 15 · Z-Wave 协议详解

## 一、概述

Z-Wave 是一种低功耗无线通信协议，由丹麦公司 Zensys（后被 Silicon Labs 收购）开发，专注于智能家居自动化。Z-Wave 工作在 Sub-GHz 频段（因地区而异，如美国 908.4 MHz、欧洲 868.4 MHz、中国 919.7 MHz），避免了 2.4GHz 频段的拥挤干扰。

Z-Wave 与 Zigbee 类似，都支持网状网络，但 Z-Wave 采用专有物理层（非 IEEE 802.15.4），协议更封闭，但互操作性更好（所有 Z-Wave 产品必须通过认证）。

2023 年，Silicon Labs 将 Z-Wave 协议规范开放为开源（Z-Wave Open Source），推动了社区的参与。

## 二、技术特点

| 特性 | 参数 |
|------|------|
| 频段 | Sub-GHz (868/908/919 MHz 等) |
| 调制方式 | GFSK (Gaussian FSK) |
| 数据速率 | 9.6 / 40 / 100 kbps |
| 通信距离 | 室内 40m, 室外 100m+ |
| 网络规模 | 最多 232 个节点 |
| 网络拓扑 | 网状网络 (Mesh) |
| 功耗 | 极低（电池设备可运行数年） |

### 2.1 Sub-GHz 优势

- **穿墙能力强**：低频信号比 2.4GHz 更好地穿透墙壁和障碍物。
- **干扰少**：远离 WiFi、蓝牙、Zigbee 的 2.4GHz 拥挤频段。
- **法规限制**：Sub-GHz 频段通常有占空比限制（如欧洲 1%），限制了持续传输。

## 三、网络架构

### 3.1 设备类型

| 设备类型 | 功能 | 供电 |
|---------|------|------|
| Controller (Primary) | 主控制器，管理网络、入网、路由 | 常供电 |
| Controller (Secondary) | 辅助控制器（如壁挂式开关面板） | 常供电 |
| End Device (Always On) | 始终在线的设备，可中继数据 | 常供电 |
| End Device (Sleeping) | 睡眠设备，不能中继 | 电池供电 |

### 3.2 网络拓扑

Z-Wave 使用 **源路由（Source Routing）** 机制：

- 发送方在数据帧中包含完整路由路径。
- 中间节点按路径转发，不需要维护路由表。
- 路由由 Controller 计算和维护。
- Controller 维护网络拓扑图和路由表。

```
Controller                     End Device
  |                                |
  | 维护网络拓扑:                   |
  | A - B - C - D (路径)           |
  |                                |
  | 发送数据时在帧头中包含:           |
  | Route: [Controller, A, B, C, D]|
  |-------------------------------->|
  | (A收到, 转发给B; B转发给C;      |
  |  C转发给D)                     |
```

### 3.3 SIS（SIS - Static Update Server）

- Primary Controller 拥有 SIS 角色。
- SIS 允许 Secondary Controller 发起设备入网。
- 没有 SIS 的网络中，只有 Primary Controller 可以入网设备。
- SIS 简化了多控制器网络的设备管理。

## 四、设备入网（Inclusion）

### 4.1 经典入网流程

```
Controller                     新设备
  |                               |
  | 1. 进入Inclusion模式           |
  |    (按控制器上的按钮)           |
  |                               |
  | 2. 触发设备入网模式             |
  |    (按设备上的按钮)             |
  |                               |
  | 3. 设备发送 Node Info Frame    |
  |<-- Node Info Frame ------------|
  |    (设备类型、命令类支持列表)    |
  |                               |
  | 4. Controller 分配 Node ID     |
  |--- Assign Node ID ------------>|
  |    (1-232 之间的唯一ID)         |
  |                               |
  | 5. 交换安全密钥 (S2)            |
  |    (详见下文)                  |
  |                               |
  | 6. Controller 探测网络拓扑     |
  |    (请求邻居列表, 更新路由表)   |
  |                               |
  | 7. 入网完成                    |
```

### 4.2 S2 安全入网

Z-Wave S2（Security 2）是 Z-Wave 的最新安全框架，于 2016 年引入：

```
Controller                      新设备
  |                                |
  | 1. KEX (Key Exchange) 开始     |
  |--- KEX GET ------------------->|
  |<-- KEX REPORT -----------------|
  |    (支持的密钥类型、方案)        |
  |                                |
  | 2. 用户输入/确认 DSK PIN       |
  |    DSK = Device Specific Key   |
  |    (5位PIN码, 印在设备上)       |
  |                                |
  | 3. ECDH密钥协商 (P-256)        |
  |--- Public Key ---------------->|
  |<-- Public Key -----------------|
  |    (用DSK前5位验证设备身份)     |
  |                                |
  | 4. 派生临时密钥                 |
  |    TempKey = ECDH(privA, pubB)|
  |                                |
  | 5. 交换网络密钥 (加密)          |
  |--- Network Key (加密) -------->|
  |    (用TempKey加密)              |
  |                                |
  | 6. 验证完成                    |
  |--- KEX SET (确认) ------------>|
  |<-- KEX SET (确认) -------------|
  |                                |
  | 7. 安全入网完成                 |
```

**S2 密钥等级**：

| 密钥等级 | 用途 | 场景 |
|---------|------|------|
| S2 Access Control | 最高安全 | 门锁、安防系统 |
| S2 Authenticated | 高安全 | 智能开关、传感器 |
| S2 Unauthenticated | 基本安全 | 低安全需求设备 |
| S0 (Legacy) | 旧版安全 | 向后兼容 |

不同安全等级的设备使用不同的网络密钥，高安全等级设备之间的通信低安全等级设备无法解密。

### 4.3 SmartStart

Z-Wave SmartStart 简化了入网流程：
- 设备出厂时预置 DSK 并录入 Controller 的 Provisioning List。
- 设备上电后自动发起入网请求。
- Controller 识别 DSK 后自动完成入网和安全配置。
- 用户无需手动按按钮，通电即自动加入网络。

## 五、命令类（Command Class）

Z-Wave 使用命令类（Command Class）定义设备功能，类似 Zigbee 的 Cluster：

| Command Class | 名称 | 功能 |
|--------------|------|------|
| 0x20 | Basic | 基本开关/值控制 |
| 0x25 | Binary Switch | 二进制开关（开/关） |
| 0x26 | Multilevel Switch | 多级控制（调光、调速） |
| 0x30 | Binary Sensor | 二进制传感器（门磁） |
| 0x31 | Multilevel Sensor | 多级传感器（温湿度） |
| 0x40 | Thermostat | 温控器 |
| 0x62 | Door Lock | 门锁 |
| 0x71 | Notification | 通知事件 |
| 0x80 | Battery | 电池状态 |
| 0x86 | Version | 版本信息 |
| 0x98 | Security | 安全命令 |
| 0x9F | Security 2 | S2 安全命令 |

### 5.1 命令格式

```
Z-Wave 帧结构:
┌──────────┬──────────────┬──────────────────┐
│ Frame    │ Command Class│ Command + Params │
│ Header   │ (1 byte)     │ (variable)       │
└──────────┴──────────────┴──────────────────┘

示例: Binary Switch Set (开灯)
  Command Class: 0x25 (Binary Switch)
  Command: 0x01 (Set)
  Value: 0xFF (On)

示例: Multilevel Sensor Report (温度上报)
  Command Class: 0x31 (Multilevel Sensor)
  Command: 0x05 (Report)
  Sensor Type: 0x01 (Temperature)
  Value: 0x17 (23°C)
```

## 六、路由与网络管理

### 6.1 路由发现

Controller 维护网络中所有节点的邻居关系和路由表。当需要发送数据时，Controller 计算最优路径：

1. Controller 查找目标设备的邻居列表。
2. 选择最优路径（最多 4 跳）。
3. 将完整路径编码在帧头中。
4. 中间节点按路径转发。

### 6.2 路由修复

如果某条路由失效（中间节点离线或干扰）：
1. 发送失败后，Controller 尝试备用路由。
2. 如果所有路由都失败，Controller 发起路由发现。
3. 请求沿途节点更新邻居信息。
4. 重新计算路由。

### 6.3 网络迁移

当用户更换 Controller 时：
1. 旧 Controller 执行 Network Wide Inclusion。
2. 新 Controller 加入网络。
3. 旧 Controller 将 Primary 角色转移给新 Controller。
4. 新 Controller 获得完整的网络拓扑和路由表。

## 七、Z-Wave LR（Long Range）

Z-Wave LR（Z-Wave Long Range）是 2022 年引入的扩展，显著增加了通信距离：

| 特性 | Z-Wave 经典 | Z-Wave LR |
|------|-----------|-----------|
| 通信距离 | 室内 40m | 室内 300m+ |
| 节点数 | 232 | 4000 |
| 网络拓扑 | Mesh | Mesh + 星型 |
| 功耗 | 低 | 极低 |
| 速率 | 100 kbps | 100 kbps |

Z-Wave LR 设备可以直接与网关通信（星型），无需中间节点中继。这简化了网络部署，特别适合大型建筑和户外场景。

## 八、Z-Wave vs Zigbee vs Thread 对比

| 特性 | Z-Wave | Zigbee | Thread |
|------|--------|--------|--------|
| 频段 | Sub-GHz | 2.4GHz | 2.4GHz |
| 物理层 | 专有 | 802.15.4 | 802.15.4 |
| 速率 | 100kbps | 250kbps | 250kbps |
| 最大节点 | 232 (LR: 4000) | 65535 | 65535 |
| 路由 | Source Routing | Mesh (表路由) | RPL Mesh |
| IP 支持 | 否 | 否 | 是 (IPv6) |
| 互操作性 | 强制认证 | 认证可选 | Matter |
| 开放性 | 已开源 | 开放标准 | 开放标准 |
| 生态 | 4000+ 产品 | 广泛 | 成长中 |

Z-Wave 的核心优势在于 Sub-GHz 频段的穿墙能力和强制认证带来的互操作性。劣势在于专有物理层（芯片选择少）和较小的网络规模。

## 九、总结

Z-Wave 是智能家居领域成熟可靠的无线协议。其 Sub-GHz 频段提供了更好的穿透能力和抗干扰能力，S2 安全框架和 SmartStart 自动入网提升了安全性和用户体验。虽然 Z-Wave 在节点数量和开放性上不如 Zigbee 和 Thread，但其严格的互操作性认证确保了不同厂商产品的无缝配合。Z-Wave LR 的推出进一步扩展了其在大规模部署中的适用性。
