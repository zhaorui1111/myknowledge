# 09 · Zigbee 协议栈详解

## 一、概述

Zigbee 是基于 IEEE 802.15.4 标准的高级通信协议，由 Zigbee 联盟（现更名为连接标准联盟 CSA）制定和维护。Zigbee 专注于低功耗、低数据速率、自组网的无线通信，广泛应用于智能家居、楼宇自动化和工业控制领域。

本章全面讲解 Zigbee 协议栈各层的功能、网状网络原理和关键机制。

## 二、协议栈分层

Zigbee 协议栈从下到上分为五层：

```
┌─────────────────────────────────┐
│  ZCL (Zigbee Cluster Library)    │  应用层：设备类型和簇定义
├─────────────────────────────────┤
│  ZDO (Zigbee Device Object)      │  设备管理：发现、绑定、网络管理
├─────────────────────────────────┤
│  APS (Application Support)       │  应用支持：端点、绑定表、组地址
├─────────────────────────────────┤
│  NWK (Network Layer)             │  网络层：路由、地址分配、安全
├─────────────────────────────────┤
│  MAC (IEEE 802.15.4 MAC)         │  介质访问：CSMA/CA、帧确认、GTS
├─────────────────────────────────┤
│  PHY (IEEE 802.15.4 PHY)         │  物理层：DSSS调制、信道、功率
└─────────────────────────────────┘
```

## 三、物理层（PHY）

### 3.1 频段与信道

IEEE 802.15.4 定义了三个频段：

| 频段 | 频率范围 | 信道数 | 速率 | 调制方式 | 区域 |
|------|---------|--------|------|---------|------|
| 2.4GHz | 2400-2483.5 MHz | 16 (11-26) | 250kbps | O-QPSK DSSS | 全球 |
| 868MHz | 868-868.6 MHz | 1 (0) | 20kbps | BPSK DSSS | 欧洲 |
| 915MHz | 902-928 MHz | 10 (1-10) | 40kbps | BPSK DSSS | 北美 |

2.4GHz 频段是全球通用的，也是 Zigbee 最常用的频段。

### 3.2 信道分配

2.4GHz 频段的 16 个信道，每个信道带宽 2MHz，信道间隔 5MHz：

```
信道 11: 2405 MHz
信道 12: 2410 MHz
...
信道 26: 2480 MHz

WiFi 信道与 Zigbee 信道重叠:
  WiFi Ch1 (2412): 与 Zigbee Ch11-14 重叠
  WiFi Ch6 (2437): 与 Zigbee Ch15-19 重叠
  WiFi Ch11 (2462): 与 Zigbee Ch21-24 重叠

避免干扰的建议:
  WiFi Ch1  → 使用 Zigbee Ch25/26
  WiFi Ch6  → 使用 Zigbee Ch11/26
  WiFi Ch11 → 使用 Zigbee Ch11/12
```

### 3.3 调制方式

2.4GHz 频段使用 **O-QPSK（偏移正交相移键控）+ DSSS（直接序列扩频）**：
- 数据先进行 DSSS 扩频（每 4 bit 映射为 32 chip 伪随机码）。
- 扩频后的 chip 序列以 2 Mchip/s 速率发送。
- 接收端用相同的伪随机码解扩，恢复原始数据。
- DSSS 提供了抗干扰能力和处理增益。

### 3.4 发射功率与接收灵敏度

- 发射功率：通常 0 dBm (1mW) 到 +20 dBm (100mW)，受区域法规限制。
- 接收灵敏度：典型 -85 dBm 到 -100 dBm。
- 室内通信距离：10-100 米（取决于环境和功率）。
- 网状网络扩展可以大大增加覆盖范围。

## 四、MAC 层

### 4.1 帧类型

| 帧类型 | 用途 |
|--------|------|
| Beacon Frame | 协调器/路由器广播网络信标 |
| Data Frame | 数据传输 |
| ACK Frame | 帧确认 |
| MAC Command Frame | MAC 层命令（关联、解关联等） |

### 4.2 CSMA/CA 介质访问

Zigbee 使用 **CSMA/CA（载波监听多路访问/碰撞避免）** 机制：

```
退避算法:
  1. 设备有数据要发送
  2. 随机退避 (0 - 2^BE - 1) 个 Backoff Period (320μs)
     BE 初始值 = 3 (macMinBE), 最大 5
  3. 执行 CCA (Clear Channel Assessment)
     - 检测信道空闲 → 发送数据
     - 检测信道忙 → BE++, 回到步骤 2
  4. 最多重试 4 次 (macMaxCSMABackoffs)
  5. 发送后等待 ACK (可选)
```

**两种 CSMA/CA 模式**：
- **Slotted CSMA/CA**：在超帧结构的时隙边界对齐发送，用于有 Beacon 的网络。
- **Unslotted CSMA/CA**：无时隙对齐，用于无 Beacon 的网络（大多数 Zigbee 网络使用此模式）。

### 4.3 帧确认

- 单播帧可以要求 ACK 确认（ACK 可选）。
- 广播帧不要求 ACK。
- ACK 等待时间：macAckWaitDuration（通常 54-120 symbols）。
- 未收到 ACK 时重传，最多 macMaxFrameRetries 次（默认 3）。

### 4.4 超帧结构

Beacon 网络中使用超帧（Superframe）组织通信：

```
┌─────────────────────────────────────────┐
│              Superframe                  │
├──────┬──────┬──────┬──────┬─────┬───────┤
│ CAP  │ CAP  │ CAP  │ CAP  │ GTS │ Inactive│
└──────┴──────┴──────┴──────┴─────┴───────┘
|<--- Active Period --->|<--- Inactive --->|

Beacon ─────────────────────────── Beacon
|<-------- BI (Beacon Interval) -------->|

CAP: Contention Access Period (CSMA/CA)
GTS: Guaranteed Time Slot (预留时隙, 无竞争)
```

大多数 Zigbee 网络（非 Beacon 模式）不使用超帧结构，设备可以随时发送数据。

## 五、网络层（NWK）

### 5.1 设备角色

| 角色 | 功能 | 供电要求 |
|------|------|---------|
| Coordinator | 创建网络、管理地址分配、作为 Trust Center | 常供电 |
| Router | 转发数据、扩展覆盖、参与路由 | 常供电 |
| End Device | 只与父节点通信，不转发数据 | 电池供电 |

### 5.2 地址分配

Zigbee 使用 16 位短地址标识网络中的设备：

- Coordinator 地址固定为 0x0000。
- 地址由父节点分配给子节点。
- 使用 **Cskip 分布式地址分配算法**。

**Cskip 参数**：
- `Cm` (nwkMaxChildren)：每个路由器最大子设备数。
- `Rm` (nwkMaxRouters)：最大路由器子设备数。
- `Lm` (nwkMaxDepth)：网络最大深度。

**Cskip 计算**：
```
当 Rm = 1:
  Cskip(d) = 1 + Cm * (Lm - d - 1)

当 Rm ≠ 1:
  Cskip(d) = (1 + Cm - Rm - Cm * Rm^(Lm-d-1)) / (1 - Rm)

示例 (Cm=6, Rm=4, Lm=5):
  Cskip(0) = (1 + 6 - 4 - 6*4^4) / (1 - 4) = 1341
  Cskip(1) = 331
  Cskip(2) = 81
  Cskip(3) = 19
  Cskip(4) = 4
```

**地址分配规则**：
- 深度 d 的路由器，其第 n 个路由器子设备的地址 = 父地址 + Cskip(d) * (n-1) + 1
- 深度 d 的路由器，其第 n 个终端子设备的地址 = 父地址 + Rm * Cskip(d) + n

### 5.3 路由机制

Zigbee 网状网络使用三种路由方式：

**5.3.1 基于树的路由（Tree Routing）**
- 按照地址分配的树结构路由。
- 不需要路由表，计算简单。
- 但路径不是最优的，且不能自愈合。

**5.3.2 基于表的路由（Mesh Routing）**
- 使用路由发现机制寻找最优路径。
- 每个路由器维护路由表和路由发现表。
- 支持多跳路由和路径优化。

**路由发现过程**：
```
源设备 A                    目标设备 Z
  |                              |
  | 1. 广播 Route Request (RREQ) |
  |------> B -------> D ------->|
  |        |         |          |
  |        > C -----> E ------->|
  |                              |
  | 2. Z 收到 RREQ, 沿反向路径   |
  |    发送 Route Reply (RREP)   |
  |<------ D <-------|          |
  |<------ E <-------|          |
  |                              |
  | 3. A 选择最优路径 (如 A-B-D-Z)|
  |    更新路由表                  |
```

**5.3.3 源路由（Source Routing）**
- 发送方在帧头中包含完整路径。
- 中间节点不需要维护路由表。
- 适用于 Zigbee Green Power 等低功耗场景。

### 5.4 路由表维护

每个路由器维护：
- **路由表**：目标地址 → 下一跳 + 状态（Active/Inactive/Discovery）。
- **路由发现表**：正在进行的路由发现请求。
- **邻居表**：一跳邻居设备的信息（地址、链路质量、关系）。

### 5.5 链路质量

Zigbee 使用 **LQI（Link Quality Indication）** 衡量链路质量：
- LQI 取值 0-255。
- 基于 RSSI 和/或误码率计算。
- 用于路由选择和邻居表维护。

### 5.6 网络安全

NWK 层安全使用 **Network Key**：
- 128 位 AES 对称密钥。
- 加密网络层帧，提供来源认证和完整性保护。
- 所有网络设备共享同一 Network Key。
- 使用帧计数器防止重放攻击。

## 六、APS 层（Application Support）

### 6.1 端点（Endpoint）

每个设备有 1-240 个端点（0 为 ZDO 保留，255 为广播）：
- 端点类似于 TCP/IP 中的端口号。
- 每个端点可以运行不同的应用配置文件（Profile）。
- 通信建立在「源端点 → 目标端点」的基础上。

### 6.2 绑定表

APS 层维护绑定表，建立端点间的逻辑关联：

```
绑定表示例:
  源地址   源端点  Cluster ID  目标地址    目标端点
  0x0001   1       0x0006      0x0002      1
  0x0001   1       0x0008      0x0002      1
  0x0003   1       0x0402      0x0000      10
```

绑定后，源设备发送数据时只需指定 Cluster ID，APS 层自动查找绑定表，将数据路由到正确的目标。

### 6.3 组地址

可以将多个端点加入同一组：
- 组地址为 16 位多播地址（0x0001-0xFFF7）。
- 向组地址发送数据，组内所有成员都收到。
- 适用于「一键控制多灯」的场景。

### 6.4 APS 层安全

APS 层安全使用 **Link Key**：
- 128 位 AES 对称密钥。
- 用于端到端加密单播通信。
- 比 NWK 层安全更强，因为只有通信双方知道 Link Key。

## 七、ZDO（Zigbee Device Object）

ZDO 提供设备管理功能：

| 功能 | 描述 |
|------|------|
| Network Management | 网络发现、启动网络、加入/离开网络 |
| Device Discovery | 发现网络中的其他设备 |
| Service Discovery | 查询设备支持的端点和簇 |
| Binding Management | 创建、删除绑定 |
| Security Management | 密钥管理、设备认证 |

ZDO 使用端点 0 通信。

## 八、ZCL（Zigbee Cluster Library）

ZCL 定义了标准设备类型和簇，实现互操作性。

### 8.1 簇（Cluster）

簇是一组相关属性和命令的集合：

```
Cluster: On/Off (0x0006)
  属性:
    - OnOff (0x0000, bool): 开关状态
    - GlobalSceneControl (0x4000, bool)
    - OnTime (0x4001, uint16)
    - OffWaitTime (0x4002, uint16)
  
  命令 (Client → Server):
    - Off (0x00)
    - On (0x01)
    - Toggle (0x02)
  
  命令 (Server → Client):
    - Off (0x00, 响应)
    - On (0x01, 响应)
```

### 8.2 常用簇

| Cluster ID | 名称 | 设备类型 |
|-----------|------|---------|
| 0x0006 | On/Off | 开关、灯 |
| 0x0008 | Level Control | 调光灯 |
| 0x0300 | Color Control | 彩灯 |
| 0x0402 | Temperature Measurement | 温度传感器 |
| 0x0405 | Relative Humidity | 湿度传感器 |
| 0x0406 | Occupancy Sensing | 人体传感器 |
| 0x0500 | IAS Zone | 安防传感器（门磁、烟感） |
| 0x0101 | Door Lock | 门锁 |

### 8.3 设备类型

ZCL 定义了标准设备类型（Device ID），每种设备类型规定了必须支持和可选支持的簇：

| 设备类型 | Device ID | 必须支持的簇 |
|---------|-----------|------------|
| On/Off Light | 0x0100 | On/Off |
| On/Off Switch | 0x0103 | On/Off |
| Dimmable Light | 0x0101 | On/Off, Level Control |
| Color Light | 0x0102 | On/Off, Level, Color Control |
| Temperature Sensor | 0x0302 | Temperature Measurement |

## 九、Zigbee 3.0

Zigbee 3.0 是当前最新版本，主要变化：

1. **统一认证**：所有设备必须使用基于安装码（Install Code）的认证流程。
2. **Green Power**：支持能量收集设备（如无电池开关），通过源路由参与网络。
3. **Base Device Behavior**：定义了设备的标准行为（入网、重置、状态恢复）。
4. **向后兼容**：兼容 Zigbee Light Link 和 Zigbee Home Automation。

## 十、总结

Zigbee 协议栈是一个分层的、完整的低功耗无线通信协议。物理层基于 IEEE 802.15.4，使用 DSSS 扩频提供抗干扰能力；MAC 层使用 CSMA/CA 介质访问；网络层支持网状路由和分布式地址分配；APS 层提供端点管理和绑定机制；ZCL 定义了丰富的设备类型和簇实现互操作性。Zigbee 的网状网络自愈合能力和低功耗特性使其在智能家居领域保持重要地位。
