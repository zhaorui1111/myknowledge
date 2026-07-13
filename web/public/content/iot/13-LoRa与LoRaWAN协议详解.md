# 13 · LoRa 与 LoRaWAN 协议详解

## 一、概述

LoRa（Long Range）是一种远距离低功耗无线通信技术，由 Semtech 公司开发。LoRa 物理层使用 **CSS（Chirp Spread Spectrum，啁啾扩频）** 调制技术，实现了远距离通信（城市 2-5km， rural 15km+）和极低功耗（电池可使用数年到十年以上）。

LoRaWAN 是定义在 LoRa 物理层之上的 MAC 层和网络协议，由 LoRa Alliance 标准化。LoRaWAN 定义了设备类型、网络架构、安全机制和数据管理规则。

LoRa/LoRaWAN 适用于低数据速率、长距离、电池供电的场景，如农业监测、环境监测、智能抄表、资产追踪等。

## 二、LoRa 物理层

### 2.1 CSS 调制

LoRa 使用线性调频扩频（Chirp Spread Spectrum）：

- **Chirp**：频率随时间线性变化的信号。LoRa 使用两种 Chirp：
  - Up-chirp：频率从低到高线性变化
  - Down-chirp：频率从高到低线性变化

- 数据编码：通过在 Chirp 的频率跳变点上编码数据。每个符号携带 log2(SF) 位数据。

```
Up-chirp 示意图:
  频率
  ↑     ╱─────
  │   ╱
  │ ╱
  │╱
  └──────────→ 时间

  起始频率由数据决定，频率从起始值线性扫到最高频率，
  然后从最低频率继续扫到起始频率。
```

### 2.2 关键参数

| 参数 | 范围 | 说明 |
|------|------|------|
| Spreading Factor (SF) | SF7 - SF12 | 扩频因子，影响速率和距离 |
| Bandwidth (BW) | 125/250/500 kHz | 信号带宽 |
| Coding Rate (CR) | 4/5, 4/6, 4/7, 4/8 | 前向纠错码率 |
| Carrier Frequency | 433/868/915 MHz | 载波频率（区域相关） |

**Spreading Factor（SF）的影响**：

| SF | 符号时长 | 数据速率 (BW=125kHz) | 通信距离 | 抗噪声 |
|----|---------|---------------------|---------|--------|
| SF7 | 1.0ms | 5470 bps | 短 | 较低 |
| SF8 | 2.0ms | 3125 bps | 中 | 中 |
| SF9 | 4.1ms | 1760 bps | 中长 | 中高 |
| SF10 | 8.2ms | 980 bps | 长 | 高 |
| SF11 | 16.4ms | 540 bps | 更长 | 更高 |
| SF12 | 32.8ms | 290 bps | 最长 | 最高 |

SF 越大，每个符号持续时间越长，信号能量越大，通信距离越远，但数据速率越低。不同 SF 的信号之间几乎正交，可以同时在同一信道传输不互相干扰。

### 2.3 频段

LoRa 使用 Sub-GHz 免授权频段：

| 区域 | 频段 | 法规限制 |
|------|------|---------|
| 欧洲 | 868 MHz (863-870) | 1% Duty Cycle 或 LBT |
| 北美 | 915 MHz (902-928) | FCC Part 15, 400ms Dwell Time |
| 中国 | 470-510 MHz | CN470 频段 |
| 亚洲 | 433 MHz (433-434) | 通用 ISM 频段 |

### 2.4 链路预算

LoRa 的链路预算可达 **157 dB**（SF12, 125kHz, CR=4/5），远超传统无线技术：

```
链路预算 = 发射功率 + 处理增益 - 接收灵敏度

示例:
  发射功率: +14 dBm
  接收灵敏度: -137 dBm (SF12)
  链路预算: 14 - (-137) = 151 dB

自由空间路径损耗 (1km, 868MHz):
  FSPL = 32.4 + 20log(868) + 20log(1) = 91.3 dB

可用裕量: 151 - 91.3 = 59.7 dB
  → 可穿透多面墙壁，或在 rural 环境通信 15km+
```

## 三、LoRaWAN 网络架构

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ End Device│    │ End Device│    │ End Device│
└─────┬─────┘    └─────┬─────┘    └─────┬─────┘
      |                |                |
      | LoRa无线       | LoRa无线       | LoRa无线
      |                |                |
      ▼                ▼                ▼
┌──────────────────────────────────────────┐
│              Gateway (网关)               │
│    (透明转发，不做MAC层处理)              │
└──────────────────┬───────────────────────┘
                   | IP (UDP/JSON 或 MQTT)
                   |
                   ▼
┌──────────────────────────────────────────┐
│            Network Server                │
│  (去重、MAC层管理、数据路由、安全)         │
└──────────────────┬───────────────────────┘
                   |
                   ▼
┌──────────────────────────────────────────┐
│           Application Server              │
│    (业务逻辑、数据处理)                    │
└──────────────────────────────────────────┘
```

### 3.1 网关（Gateway）

- 网关是 LoRa 物理层和 IP 网络之间的桥梁。
- 网关透明转发：接收 LoRa 信号，封装为 IP 数据包发送给 Network Server；反之亦然。
- 网关不做任何 MAC 层处理（不做去重、加密解密等）。
- 一个网关可以同时接收多个设备的信号。
- 网关之间可以重叠覆盖，提高可靠性。

### 3.2 Network Server

- 管理设备的入网、数据去重、MAC 命令处理。
- 维护设备会话密钥，解密设备数据。
- 将解密后的数据路由到 Application Server。
- 管理 ADR（Adaptive Data Rate）策略。

### 3.3 Application Server

- 处理业务逻辑。
- 管理应用层密钥（AppSKey），解密应用层数据。
- 提供数据 API 供下游系统消费。

## 四、LoRaWAN 设备类型

LoRaWAN 定义了三种设备类型：

### 4.1 Class A（All Devices）

```
时间轴:
  设备 ──── 上行 ──────────────────────── 睡眠 ────
           ↑        ↑        ↑
         RX1窗口  RX2窗口  (回到睡眠)
         (1s后)  (2s后)

  Class A 设备:
  - 上行后打开两个下行接收窗口
  - RX1: 上行后 1 秒，使用上行频率（偏移）
  - RX2: 上行后 2 秒，使用固定频率和速率
  - 其余时间全部睡眠，功耗最低
  - 下行只能在 RX1/RX2 窗口发送
```

**特点**：功耗最低，但下行延迟不可控（必须等待设备上行后才能下行）。所有 LoRaWAN 设备必须支持 Class A。

### 4.2 Class B（Beacon Synchronized）

```
时间轴:
  Beacon ─── 上行 ── RX ── ── ── Ping Slot ── ── ── Ping Slot ── Beacon
    ↑                    ↑                       ↑
  同步时间点           接收窗口1              接收窗口2

  Class B 设备:
  - 在 Class A 基础上，通过接收 Beacon 实现时间同步
  - 周期性打开额外的 Ping Slot 接收下行
  - 下行延迟可控（最多一个 Ping 周期，通常 128 秒）
  - 功耗略高于 Class A
```

### 4.3 Class C（Continuously Listening）

```
时间轴:
  设备 ──── 上行 ── RX ── RX ── RX ── RX ── RX ── RX ── 
                      (几乎持续监听)

  Class C 设备:
  - 除了上行后的 RX1/RX2，其余时间也持续监听
  - 下行可以随时发送（延迟接近零）
  - 功耗最高（接收机持续工作）
  - 适用于常供电设备
```

## 五、入网流程

LoRaWAN 设备入网有两种方式：**OTAA（Over The Air Activation）** 和 **ABP（Activation By Personalization）**。

### 5.1 OTAA（空中激活）

OTAA 是推荐的方式，设备通过与 Network Server 的握手完成入网：

```
设备                           网关                    Network Server
  |                               |                         |
  | 1. Join Request               |                         |
  |   (JoinEUI, DevEUI,           |                         |
  |    DevNonce, MIC)             |                         |
  |--- LoRa -------------------->|--- UDP ---------------->|
  |                               |                         |
  |                               | 2. 验证设备             |
  |                               |    (查DevEUI数据库)     |
  |                               |    验证MIC              |
  |                               |    (用AppKey计算)       |
  |                               |                         |
  |                               | 3. 生成会话密钥         |
  |                               |    NwkSKey = f(AppKey,  |
  |                               |     JoinNonce, ...)     |
  |                               |    AppSKey = f(AppKey,  |
  |                               |     JoinNonce, ...)     |
  |                               |                         |
  |<-- LoRa <-- Join Accept -----|<-- UDP ------------------|
  |    (JoinNonce, NetID,         |                         |
  |     DevAddr, DLSettings,      |                         |
  |     RxDelay, CFList, MIC)     |                         |
  |                               |                         |
  | 4. 派生会话密钥               |                         |
  |    NwkSKey, AppSKey           |                         |
  |    (用AppKey解密Join Accept)  |                         |
  |                               |                         |
  | 5. 入网完成，可开始通信       |                         |
```

**入网参数**：
- **JoinEUI（AppEUI）**：应用标识，64 位。
- **DevEUI**：设备唯一标识，64 位（基于 EUI-64）。
- **DevNonce**：设备生成的随机数，每次入网不同，防止重放。
- **AppKey**：应用密钥，128 位 AES，出厂烧录，用于 OTAA 过程的加密和 MIC 计算。
- **DevAddr**：设备网络地址，32 位，入网时由 Network Server 分配。

### 5.2 ABP（个性化激活）

ABP 不需要入网过程，设备出厂时直接预置所有参数：

- DevAddr、NwkSKey、AppSKey 出厂时烧录。
- 设备直接开始通信，无需 Join 流程。
- 简单但不安全（密钥固定，无法更新）。
- 适用于测试或私有网络部署。

### 5.3 密钥体系

| 密钥 | 用途 | 生成方式 |
|------|------|---------|
| AppKey | OTAA 加密和 MIC | 出厂烧录 |
| NwkSKey | 网络层加密和 MIC | OTAA 派生 / ABP 预置 |
| AppSKey | 应用层加密 | OTAA 派生 / ABP 预置 |
| AppKey (1.1) | OTAA 专用 | 出厂烧录 |
| NwkKey (1.1) | 网络层 OTAA | 出厂烧录 |
| JceSIntKey (1.1) | Join-Accept 签名 | 派生 |

LoRaWAN 1.1 将 AppKey 拆分为 NwkKey（用于网络层 OTAA）和 AppKey（用于应用层 OTAA），提升了安全性。

## 六、数据帧格式

```
LoRaWAN 帧结构:
┌──────────┬──────────┬──────────────┬──────────┬──────────┐
│ MHDR     │ DevAddr  │ FCtrl        │ FCnt     │ FPort    │
│ (1 byte) │ (4 bytes)│ (1 byte)     │ (2 bytes)│ (1 byte) │
├──────────┴──────────┴──────────────┴──────────┴──────────┤
│                     FOpts (0-15 bytes)                    │
├───────────────────────────────────────────────────────────┤
│                     Payload (加密)                        │
├───────────────────────────────────────────────────────────┤
│                     MIC (4 bytes)                         │
└───────────────────────────────────────────────────────────┘

MHDR: MAC 头部 (MType + Major)
DevAddr: 设备网络地址 (32 bit)
FCtrl: 帧控制 (ADR, ADRACKReq, ACK, ClassB, FOptsLen)
FCnt: 帧计数器 (防重放)
FPort: 端口 (0=MAC命令, 1-223=应用数据, 224=测试)
FOpts: MAC 命令 (内联)
Payload: 加密的应用数据或 MAC 命令
MIC: 消息完整性码 (AES-CMAC)
```

### 6.1 加密

LoRaWAN 使用两层加密：

- **NwkSKey** 加密 MAC 命令和帧头相关信息。
- **AppSKey** 加密应用层数据（Payload）。
- 加密使用 AES-128 CTR 模式。
- MIC 使用 AES-128 CMAC 计算，确保数据完整性。

### 6.2 帧计数器

每个上行/下行帧都有一个 16 位（或 32 位）帧计数器（FCnt）：
- 每次发送递增。
- 接收方维护计数器，拒绝计数器小于已收到的帧（防重放）。
- ABP 设备的计数器在 Network Server 重启后可能需要重置，这是 ABP 的一个风险点。

## 七、ADR（自适应数据速率）

ADR 是 LoRaWAN 的核心优化机制，根据链路质量动态调整设备参数：

```
Network Server                    设备
  |                                 |
  | 1. 收集上行信号质量 (SNR, RSSI)  |
  |                                 |
  | 2. 计算最优参数                   |
  |    SF, BW, TXPower               |
  |    (在保证可靠性的前提下           |
  |     使用最高速率/最低功耗)         |
  |                                 |
  | 3. 通过MAC命令下发ADR配置         |
  |--- LinkADRReq ----------------->|
  |    (DataRate, TXPower, ChMask)   |
  |                                 |
  |<-- LinkADRAns ------------------|
  |    (确认)                        |
  |                                 |
  | 4. 设备调整参数                   |
  |    降低SF → 提高速率 → 降低功耗   |
```

ADR 的收益：
- 链路质量好时使用低 SF（高速率），减少空口占用时间，降低功耗。
- 链路质量差时使用高 SF（低速率），保证可靠性。
- 整体优化网络容量。

## 八、LoRaWAN 区域规范

LoRaWAN 定义了区域参数规范，不同区域使用不同的频率计划和法规要求：

| 区域 | 频段 | 信道数 | 最大ERP | Duty Cycle |
|------|------|--------|---------|-----------|
| EU868 | 868-868.6 | 3+ | 14 dBm | 1% |
| US915 | 902-928 | 64+8 | 30 dBm | 400ms Dwell |
| CN470 | 470-510 | 96 | 17 dBm | — |
| AS923 | 920-923 | 2+ | 16 dBm | 1% |
| KR920 | 920-923 | 2+ | 14 dBm | — |
| IN865 | 865-867 | 3+ | 30 dBm | — |

## 九、LoRaWAN 1.0 vs 1.1

| 特性 | 1.0.x | 1.1 |
|------|-------|-----|
| 密钥体系 | 单 AppKey | NwkKey + AppKey 分离 |
| 下行帧 | 通过一个 NwkSKey | NwkSKey(下行MAC) + SNwkSIntKey |
| Join Accept | AppKey 加密 | NwkKey 加密，AppKey 派生密钥 |
| Rejoin | 不支持 | 支持 Rejoin-request |
| ROAMING | 有限 | 改进的漫游 |
| Class B | 可选 | 改进的时间同步 |

## 十、应用场景

| 场景 | 设备类型 | Class | 数据频率 |
|------|---------|-------|---------|
| 智能水表 | End Device | A | 每天/每月 |
| 农业监测 | End Device | A | 每小时 |
| 资产追踪 | End Device | A/C | 每10分钟 |
| 环境监测 | End Device | A | 每30分钟 |
| 智能停车 | End Device | B | 事件驱动 |
| 智慧路灯 | End Device | C | 事件驱动 |

## 十一、总结

LoRa 的 CSS 调制技术实现了超长距离和超低功耗的通信，LoRaWAN 在此基础上定义了完整的网络协议。Class A/B/C 三种设备类型覆盖了从极低功耗到低延迟的不同需求。OTAA 入网机制和双层密钥体系提供了安全基础，ADR 机制优化了网络容量和设备功耗。LoRaWAN 适用于广域、低频、低数据速率的 IoT 场景，与 WiFi/BLE/Zigbee 等短距离协议形成互补。
