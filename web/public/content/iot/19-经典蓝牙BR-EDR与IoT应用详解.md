# 19 · 经典蓝牙（BR/EDR）与 IoT 应用详解

## 一、概述

提到蓝牙，很多人首先想到的是 BLE（Bluetooth Low Energy），但实际上蓝牙技术包含两大体系：**经典蓝牙（BR/EDR）** 和 **低功耗蓝牙（BLE）**。两者在物理层、协议栈、应用场景上完全不同，虽然从蓝牙 4.0 起可以双模共存，但它们本质上是两套独立的通信机制。

经典蓝牙（Basic Rate / Enhanced Data Rate）是最早的蓝牙技术，设计目标是替代有线连接，传输音频、文件等较高带宽的数据。在 IoT 领域，经典蓝牙仍然有重要地位——蓝牙音频设备（音箱、耳机）、串口透传设备（SPP）、医疗设备等大量使用经典蓝牙。

## 二、经典蓝牙 vs BLE 对比

| 特性 | 经典蓝牙 (BR/EDR) | BLE |
|------|-------------------|-----|
| 设计目标 | 替代有线，高带宽 | 低功耗，低带宽 |
| 物理层调制 | GFSK (BR) / π/4-DQPSK, 8DPSK (EDR) | GFSK |
| 最大速率 | 3 Mbps (EDR) | 2 Mbps (BLE 5+) |
| 连接机制 | 面向连接 (面向电路) | 面向连接 (面向分组) |
| 功耗 | 高 (数十 mA) | 极低 (微安级) |
| 典型应用 | 音频、文件传输 | 传感器、信标 |
| 协议栈 | RFCOMM, L2CAP, SDP, AVDTP, A2DP | ATT, GATT, GAP |
| 配对 | SSP (Secure Simple Pairing) | Legacy / Secure Connections |
| 拓扑 | 点对点 / 微微网 / 散射网 | 点对点 / 广播 |

## 三、经典蓝牙协议栈

```
┌───────────────────────────────────────┐
│           Application Profiles         │
│  (A2DP, AVRCP, HFP, SPP, HID, PAN)    │
├───────────────────────────────────────┤
│  RFCOMM    │  AVDTP   │  AVCTP  │ BNEP │  传输协议
├───────────────────────────────────────┤
│              SDP (Service Discovery)    │  服务发现
├───────────────────────────────────────┤
│              L2CAP (Logical Link)       │  逻辑链路
├───────────────────────────────────────┤
│              Baseband + LM              │  基带 + 链路管理
├───────────────────────────────────────┤
│              Radio (PHY)                │  射频
└───────────────────────────────────────┘
```

### 3.1 物理层（Radio）

经典蓝牙工作在 2.4GHz ISM 频段，使用 79 个信道（每信道 1MHz），采用 **FHSS（跳频扩频）** 技术：

- **BR (Basic Rate)**：GFSK 调制，速率 1 Mbps。
- **EDR (Enhanced Data Rate)**：π/4-DQPSK 调制速率 2 Mbps，8DPSK 调制速率 3 Mbps。
- 跳频速率：1600 次/秒。
- 信道分配：79 个信道（与 BLE 的 40 个信道不同）。

```
经典蓝牙频段:
  2402 MHz ──── 2480 MHz (79 信道, 每信道 1MHz)
  |----|----|----|----|---- .... ----|
  Ch0  Ch1  Ch2  Ch3  Ch4        Ch78

BLE 频段:
  2402 MHz ──── 2480 MHz (40 信道, 每信道 2MHz)
  |--------|--------|--------|----|
  Ch0      Ch1      Ch2      Ch39
```

### 3.2 基带（Baseband）

基带层管理物理链路，定义了两种链路类型：

**SCO（Synchronous Connection-Oriented）**：
- 面向电路的同步链路。
- 用于实时音频传输（如电话通话）。
- 固定速率 64 kbps。
- 不重传，保证实时性但不保证完整性。
- 最多支持 3 条并发 SCO 链路。

**ACL（Asynchronous Connection-Less）**：
- 面向分组的异步链路。
- 用于数据传输（如文件、串口数据）。
- 速率：BR 1 Mbps / ER 2-3 Mbps。
- 支持 ARQ 重传，保证完整性。
- 每个微微网中每对设备只有一条 ACL 链路。

### 3.3 链路管理器（Link Manager）

链路管理器协议（LMP）负责链路建立、认证、加密和参数协商：

- **配对（Pairing）**：使用 SSP（Secure Simple Pairing）建立安全连接。
- **认证**：基于配对生成的链路密钥进行挑战-响应认证。
- **加密**：使用 E0 流密码（蓝牙 2.1+）或 AES-CCM（蓝牙 4.1+）。
- **角色切换**：Master/Slave 角色切换。
- **功率控制**：动态调整发射功率。
- **QoS**：服务质量参数协商。

### 3.4 L2CAP

逻辑链路控制和适配协议（L2CAP）为上层协议提供数据分段和重组：

- 将上层大数据分段为基带可传输的小包。
- 接收端重组为完整数据。
- 提供多路复用（多个上层协议共享一条 ACL 链路）。
- 支持流量控制和重传模式（ERTM）。

### 3.5 RFCOMM

RFCOMM 模拟 RS-232 串口通信，是经典蓝牙最常用的 IoT 协议：

- 提供虚拟串口（最多 60 个并发连接）。
- 透明传输串口数据。
- 很多 IoT 设备（如蓝牙串口模块、GPS 模块、医疗设备）使用 RFCOMM/SPP。
- 数据格式与 RS-232 相同（起始位、数据位、停止位、校验位）。

### 3.6 SDP

服务发现协议（SDP）让设备查询对方支持的服务：

```
设备A                          设备B
  |--- SDP Service Search ----->|
  |    (UUID: SPP 0x1101)       |
  |                             |
  |<-- SDP Service Response ----|
  |    (RFCOMM Channel: 3,      |
  |     Service Name: "SPP")    |
  |                             |
  |--- RFCOMM Connect (Ch3) --->|
  |<-- RFCOMM Connect Ack ------|
  |                             |
  |<=== 串口数据传输 ==========>|
```

## 四、经典蓝牙 Profiles

经典蓝牙通过 Profile 定义特定应用场景的协议组合：

### 4.1 SPP（Serial Port Profile）

```
应用场景: 蓝牙串口模块、GPS、医疗设备、工业传感器

流程:
  1. 设备B注册SPP服务 (UUID: 0x1101)
  2. 设备A通过SDP查询SPP服务
  3. 获取RFCOMM通道号
  4. 建立RFCOMM连接
  5. 透明传输串口数据

特点:
  - 透明串口传输，应用层无需关心蓝牙细节
  - 适合需要可靠数据传输的IoT设备
  - 很多HC-05/HC-06蓝牙模块使用SPP
```

### 4.2 A2DP（Advanced Audio Distribution Profile）

```
应用场景: 蓝牙音箱、蓝牙耳机、智能音箱

流程:
  1. 设备搜索和配对
  2. SDP查询A2DP服务 (UUID: 0x110B)
  3. 建立AVDTP连接
  4. 协商音频编解码器 (SBC/AAC/aptX/LDAC)
  5. 通过AVDTP传输音频流

音频编码:
  - SBC: 强制支持, 约328kbps
  - AAC: 高质量, 约256kbps
  - aptX/aptX HD: 高品质低延迟
  - LDAC: 高解析度音频, 最高990kbps

特点:
  - 单向音频流 (Source → Sink)
  - 不支持双向通话 (需要HFP)
  - 延迟约100-200ms
```

### 4.3 HFP（Hands-Free Profile）

```
应用场景: 车载蓝牙、蓝牙耳机通话

特点:
  - 双向语音通信 (SCO链路)
  - 支持语音命令控制
  - 语音编码: CVSD (窄带) / mSBC (宽带)
  - 通话质量低于A2DP音频
```

### 4.4 HID（Human Interface Device）

```
应用场景: 蓝牙键盘、鼠标、游戏手柄

特点:
  - 低延迟输入
  - 支持HOGP (HID over GATT, BLE版本)
  - 使用中断通道传输输入报告
  - 支持控制通道传输控制命令
```

### 4.5 其他常用 Profile

| Profile | UUID | 应用场景 |
|---------|------|---------|
| OPP (Object Push) | 0x1105 | 文件传输 |
| PAN (Personal Area Network) | 0x1116 | 网络共享（蓝牙 tethering） |
| HSP (Headset Profile) | 0x1108 | 耳机 |
| AVRCP (Audio/Video Remote Control) | 0x110E | 音频遥控 |
| DIP (Device ID Profile) | 0x1200 | 设备标识 |
| MAP (Message Access Profile) | 0x1134 | 短信访问 |

## 五、微微网与散射网

### 5.1 微微网（Piconet）

经典蓝牙使用主从模式，一个 Master 最多连接 7 个 Active Slave，组成一个微微网：

```
微微网结构:
          Master
         /  |  \
       /    |    \
     S1     S2    S3
            |
           S4 (Parked, 最多255个)

- Master: 提供跳频序列和时钟同步
- Active Slave: 1-7个, 参与通信
- Parked Slave: 最多255个, 不参与通信但保持连接
- 所有设备共享 Master 的跳频序列
- Master 通过轮询调度 Slave 的通信
```

### 5.2 散射网（Scatter Net）

多个微微网可以通过共享设备连接成散射网：

```
微微网1          微微网2
  Master1          Master2
  / | \            / | \
 S1  S2  S3      S4  S5  S6
        |
        └── S3 同时属于两个微微网 (Bridge/Slave角色)

特点:
  - Bridge 设备在两个微微网间转发数据
  - 散射网扩展了覆盖范围
  - 但 Bridge 需要时分切换微微网, 吞吐量降低
  - 实际应用较少, 主要在蓝牙定位等场景使用
```

### 5.3 轮询调度

Master 控制微微网中所有通信，Slave 只能在 Master 轮询时发送数据：

```
时间轴:
  Master → S1 | S1 → Master | Master → S2 | S2 → Master | Master → S3 | ...
  
  每个时隙 625μs (一个跳频点)
  Master 在偶数时隙发送, Slave 在奇数时隙发送
  多时隙包占用 3 或 5 个时隙 (保持在同一跳频信道)
```

## 六、安全简单配对（SSP）

蓝牙 2.1 引入了 SSP（Secure Simple Pairing），替代了之前不安全的 PIN 码配对：

### 6.1 SSP 流程

```
设备A                    设备B
  |                        |
  | 1. IO Capability Exchange
  |--- IO Cap Req -------->|
  |<-- IO Cap Res ---------|
  |                        |
  | 2. Public Key Exchange (ECDH P-256)
  |--- Public Key A ------>|
  |<-- Public Key B -------|
  |                        |
  | 3. Authentication (根据IO能力选择)
  |    - Numeric Comparison
  |    - Just Works
  |    - Passkey Entry
  |    - Out of Band (OOB)
  |                        |
  | 4. 确认计算 (DHKey + 认证数据)
  |                        |
  | 5. 生成链路密钥 (Link Key)
  |    LK = f(DHKey, nonce_A, nonce_B, addr_A, addr_B)
  |                        |
  |<== 加密连接 ==========>|
```

### 6.2 SSP 认证方式

| 方式 | 流程 | 安全性 | 典型场景 |
|------|------|--------|---------|
| Numeric Comparison | 双方显示6位数字，用户确认是否一致 | 高 | 手机配对音箱 |
| Just Works | 无用户交互 | 低（无MITM防护） | 无输入输出设备 |
| Passkey Entry | 一方显示6位数字，另一方输入 | 高 | 键盘配对 |
| OOB | 通过NFC等通道传递认证信息 | 最高 | NFC辅助配对 |

SSP 使用 ECDH P-256 椭圆曲线密钥交换，相比旧版 PIN 码配对安全性大幅提升。

## 七、IoT 中的经典蓝牙应用

### 7.1 蓝牙音频设备

IoT 领域大量音频设备使用经典蓝牙：
- 智能音箱（A2DP + AVRCP + 可能含 BLE 配网）
- 蓝牙耳机/头戴设备
- 车载音频系统
- 智能玩具（语音交互）

这些设备通常采用 **双模蓝牙**（Dual Mode）：经典蓝牙传输音频，BLE 传输控制数据和配网信息。

### 7.2 串口透传设备

使用 SPP/RFCOMM 透传串口数据：
- 蓝牙串口模块（HC-05/HC-06）
- GPS 模块
- 工业传感器
- 医疗设备（血糖仪、血压计）
- 条码扫描枪

这类设备通常使用简单的 AT 命令集配置，通过虚拟串口透明传输数据。

### 7.3 蓝牙 HID 设备

- 蓝牙键盘/鼠标
- 游戏控制器
- 智能遥控器
- 电子白板笔

### 7.4 蓝牙网络共享

通过 PAN Profile 实现网络共享：
- 手机蓝牙 tethering（分享移动网络给 IoT 设备）
- 蓝牙网关（通过蓝牙连接多个传感器，汇聚后通过以太网上传）

## 八、双模设备设计

### 8.1 双模芯片架构

```
┌─────────────────────────────────┐
│         Application MCU          │
├─────────────────────────────────┤
│        Bluetooth Stack           │
│  ┌──────────┬─────────────────┐ │
│  │ BR/EDR   │     BLE         │ │
│  │ Stack    │     Stack       │ │
│  │ (A2DP,   │  (GATT, GAP,    │ │
│  │  SPP,    │   Advertising,  │ │
│  │  HFP)    │   Pairing)      │ │
│  └──────────┴─────────────────┘ │
├─────────────────────────────────┤
│       Shared 2.4GHz Radio        │
└─────────────────────────────────┘

代表芯片:
  - CSR8675 (Qualcomm, 经典音频+BLE)
  - nRF52840 (Nordic, BLE为主+BR/EDR limited)
  - ESP32 (Espressif, BLE+经典蓝牙)
  - BCM4346x (Broadcom, 全功能双模)
```

### 8.2 时间分片共存

双模设备需要处理经典蓝牙和 BLE 共享 2.4GHz 射频的问题：

- **时分复用**：芯片在经典蓝牙和 BLE 之间交替使用射频。
- **优先级调度**：音频流（SCO/A2DP）通常优先级最高，BLE 操作在空闲时隙进行。
- **BLE 连接参数调整**：在经典蓝牙音频活跃时，调整 BLE 连接间隔避免冲突。

### 8.3 典型双模 IoT 设备设计

智能音箱示例：
```
用户手机 ──BLE配网──→ 智能音箱
    │                    │
    │                    ├── WiFi: 连接云端
    │                    ├── BR/EDR A2DP: 接收手机音频
    │                    ├── BLE: 配网 + 设备发现
    │                    └── BLE Mesh: 控制其他Mesh设备
```

## 九、经典蓝牙的局限与BLE的选择

| 因素 | 选择经典蓝牙 | 选择 BLE |
|------|------------|---------|
| 需要音频传输 | 是（A2DP/HFP） | 否（BLE Audio 5.2+ 可选） |
| 需要高带宽 | 是（>100kbps） | 否 |
| 电池供电 | 否（功耗高） | 是（功耗极低） |
| 需要Mesh网络 | 否 | 是（BLE Mesh） |
| 仅传感器数据 | 否 | 是 |
| 串口透传 | SPP 可用 | BLE GATT 可替代 |

蓝牙 5.2 引入了 **LE Audio**（BLE 音频），通过 LC3 编解码器和 BAP（Basic Audio Profile）在 BLE 上实现高质量音频传输。未来经典蓝牙在音频领域的地位可能逐渐被 BLE Audio 取代，但当前经典蓝牙音频仍然占主导地位。

## 十、总结

经典蓝牙（BR/EDR）在 IoT 领域并非过时技术，它在音频传输、串口透传和 HID 设备等场景中仍然是首选方案。理解经典蓝牙的协议栈（Baseband/L2CAP/RFCOMM/SDP）、微微网拓扑、SSP 配对机制和各种 Profile 对于 IoT 工程实践非常重要。双模蓝牙设备设计是当前 IoT 的常见模式——经典蓝牙负责高带宽数据传输，BLE 负责低功耗配网和控制。随着 BLE Audio 的发展，经典蓝牙和 BLE 的界限正在模糊化，但在相当长一段时间内两者仍将共存。
