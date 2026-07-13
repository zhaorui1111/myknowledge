# 20 · 蓝牙 Mesh 网络协议详解

## 一、概述

蓝牙 Mesh 是建立在 BLE 物理层之上的网状网络协议，于 2017 年作为蓝牙 Mesh Profile 规范正式发布。它解决了传统 BLE "一对一"或"一对多广播"的局限性，实现了真正的"多对多"网络拓扑，使蓝牙技术能够覆盖大规模 IoT 场景，如智能照明、楼宇自动化、传感器网络等。

蓝牙 Mesh **不是**经典蓝牙的 Mesh，也**不是**一个全新的物理层，而是完全基于 BLE 的广播和连接机制构建的上层网络协议栈。任何支持 BLE 4.0+ 的芯片理论上都可以通过软件升级支持 Mesh（需有足够 Flash/RAM）。

## 二、蓝牙 Mesh 与其他 Mesh 对比

| 特性 | 蓝牙 Mesh | Zigbee Mesh | Thread Mesh | Wi-Fi Mesh |
|------|-----------|-------------|-------------|------------|
| 物理层 | BLE (2.4GHz) | IEEE 802.15.4 | IEEE 802.15.4 | Wi-Fi (2.4/5GHz) |
| 节点数 | 理论数千 | ~250 | ~250 | ~32 |
| 功耗 | 低 (Relay较高) | 极低 | 低 | 高 |
| 带宽 | ~1 Mbps | ~250 kbps | ~250 kbps | ~数百 Mbps |
| 延迟 | 10-100ms | 15-30ms | 10-50ms | 5-20ms |
| 网络 | 泛洪 (受控) | 路由表 | 路由表 (6LoWPAN) | 路由表 |
| 安全 | AES-CCM 全层 | AES-128 网络层 | AES-CCM + DTLS | WPA2/3 |
| 手机直连 | 是 (Proxy) | 否 (需网关) | 否 (需网关) | 是 |
| 成本 | 低 | 低 | 中 | 高 |

蓝牙 Mesh 最大的优势是 **手机可直接通过 BLE Proxy 节点接入 Mesh 网络**，无需额外网关，同时保持了 BLE 的低功耗特性。

## 三、Mesh 网络拓扑

### 3.1 节点角色

蓝牙 Mesh 网络中的设备称为**节点（Node）**，未加入网络的设备称为**未配网设备（Unprovisioned Device）**。节点可以具有以下特性（Feature）：

```
Mesh 网络拓扑:

                    ┌─────────┐
                    │ Friend  │
         ┌──────────┤  Node   ├──────────┐
         │          └────┬────┘          │
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌────┴────┐
    │ Relay   │    │  Relay    │   │ Relay   │
    │  Node   ├────┤   Node    ├───┤  Node   │
    └────┬────┘    └─────┬─────┘   └────┬────┘
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌────┴────┐
    │Low Power│    │  Proxy    │   │  普通   │
    │  Node   │    │   Node    │   │  Node   │
    └─────────┘    └─────┬─────┘   └─────────┘
                          │
                    ┌─────┴─────┐
                    │  手机/App  │
                    │ (GATT连接) │
                    └───────────┘
```

**四种节点特性：**

| 特性 | 功能 | 功耗 | 适用场景 |
|------|------|------|---------|
| Relay Node（中继节点） | 转发消息，扩展网络范围 | 较高（需持续监听） | 常供电设备（灯具、插座） |
| Proxy Node（代理节点） | 提供 GATT 接口，让手机等设备接入 Mesh | 中等 | 常供电设备 |
| Friend Node（朋友节点） | 为 Low Power 节点缓存消息 | 较高 | 常供电设备 |
| Low Power Node（低功耗节点） | 休眠，定期从 Friend 节点拉取消息 | 极低 | 电池供电设备（传感器、开关） |

### 3.2 Low Power + Friend 机制

这是蓝牙 Mesh 最精妙的设计之一：

```
Low Power Node (LPN)           Friend Node
      │                            │
      │  1. Friend Request         │
      ├───────────────────────────→│
      │                            │
      │  2. Friend Offer           │
      │←───────────────────────────┤
      │                            │
      │  3. Friend Poll (周期性)   │
      ├───────────────────────────→│
      │                            │
      │  4. Friend Update          │
      │  (有消息: "有数据")         │
      │  (无消息: "无数据")         │
      │←───────────────────────────┤
      │                            │
      │  5. 如有消息, LPN请求数据   │
      ├───────────────────────────→│
      │                            │
      │  6. 发送缓存的消息          │
      │←───────────────────────────┤
      │                            │
      │  7. LPN进入休眠             │
      │  (Repeat from step 3)      │
```

LPN 的工作流程：
1. 发送 Friend Request，寻找 Friend 节点。
2. 收到 Friend Offer 后选择一个 Friend。
3. 建立友谊后，LPN 大部分时间休眠。
4. 定期发送 Friend Poll 询问是否有消息。
5. Friend 节点为 LPN 缓存所有发往它的消息。
6. LPN 被唤醒后拉取消息。
7. LPN 返回休眠状态。

关键参数：
- `ReceiveDelay`：LPN 发送 Poll 后等待接收的延迟（通常 50-250ms）。
- `PollTimeout`：LPN 两次 Poll 之间的最大间隔（通常 10s-96h）。
- `Friend Queue Size`：Friend 节点为 LPN 缓存的消息队列大小（至少 16 条）。

## 四、Mesh 协议栈

```
┌───────────────────────────────────────────┐
│           Application (Models)             │
│  (Generic OnOff, Light, Sensor, Scene)    │
├───────────────────────────────────────────┤
│        Foundation Models (管理)            │
│  (Config, Health, Provisioning)           │
├───────────────────────────────────────────┤
│           Access Layer                     │
│  (Model消息格式, 应用密钥)                  │
├───────────────────────────────────────────┤
│         Upper Transport Layer              │
│  (应用层加密, 消息分段重组)                  │
├───────────────────────────────────────────┤
│         Lower Transport Layer              │
│  (消息分段, 确认重传)                       │
├───────────────────────────────────────────┤
│           Network Layer                    │
│  (寻址, 中继, 网络密钥加密)                  │
├───────────────────────────────────────────┤
│           Bearer Layer                     │
│  (Advertising Bearer / GATT Bearer)       │
├───────────────────────────────────────────┤
│              BLE Link Layer                │
└───────────────────────────────────────────┘
```

### 4.1 Bearer Layer（承载层）

Mesh 消息通过两种承载方式传输：

**Advertising Bearer（广播承载）**：
- 使用 BLE 广播通道（37/38/39）发送 Mesh PDU。
- 传输速度快，但无连接保障。
- 所有 Mesh 消息的默认传输方式。
- 使用特定的广播类型：`Mesh Message` (0x2A) 和 `Mesh Beacon` (0x2B)。

**GATT Bearer（GATT 承载）**：
- 使用 BLE GATT 连接传输 Mesh PDU。
- 用于 Proxy 节点让非 Mesh 设备（手机）接入。
- 传输距离受限于 BLE 连接范围。
- 使用 Mesh Proxy Service (UUID: 0x1828)。

### 4.2 Network Layer（网络层）

网络层负责消息的寻址和中继：

**地址类型：**

| 地址类型 | 格式 | 说明 |
|---------|------|------|
| Unicast Address（单播地址） | 0x0001-0x7FFF | 分配给每个节点的唯一地址 |
| Group Address（组地址） | 0xC000-0xFEFF | 一组节点的共享地址 |
| Virtual Address（虚拟地址） | 0x8000-0xBFFF | 基于 Label UUID 的动态地址 |
| All-proxies | 0xFFFC | 所有 Proxy 节点 |
| All-friends | 0xFFFD | 所有 Friend 节点 |
| All-relays | 0xFFFE | 所有 Relay 节点 |
| All-nodes | 0xFFFF | 所有节点 |

**中继机制：**
```
节点A (源)     Relay节点B     Relay节点C     节点D (目的)
   │              │              │              │
   │──Msg(TTL=3)─→│              │              │
   │              │──Msg(TTL=2)─→│              │
   │              │              │──Msg(TTL=1)─→│
   │              │              │              │ (处理消息)
   │              │              │              │
   │  (TTL=0, 丢弃, 不再中继)
```

中继节点收到消息后：
1. 检查 TTL（Time To Live），如果 TTL ≤ 1 则丢弃。
2. 将 TTL 减 1。
3. 检查消息缓存（是否已转发过此消息），避免环路。
4. 重新加密网络层头部（使用相同的 Network Key）。
5. 转发消息。

TTL 默认值为 5，最大值 127。合理设置 TTL 可以控制网络范围并减少不必要的流量。

### 4.3 Lower Transport Layer（下传输层）

负责消息分段和重组：

- **未分段消息**：最长 15 字节负载（使用 1 字节头）。
- **分段消息**：将大消息拆分为多个段，每段最多 12 字节。
- **确认重传**：接收方对每个分段发送 ACK。

```
大消息 (如 200 bytes)
  ├── Seg 0 (12 bytes) ──→ ACK
  ├── Seg 1 (12 bytes) ──→ ACK
  ├── Seg 2 (12 bytes) ──→ (超时, 重传)
  ├── Seg 2 (12 bytes) ──→ ACK
  ├── Seg 3 (12 bytes) ──→ ACK
  └── ...
```

### 4.4 Upper Transport Layer（上传输层）

负责应用层加密和心跳：

- **应用密钥加密**：使用 AppKey 对消息加密，确保只有授权节点能解密。
- **心跳发布**：节点定期发送 Heartbeat 消息，让其他节点知道自己的状态。
- **Friend 缓存管理**：为 LPN 缓存的消息在此层处理。

### 4.5 Access Layer（接入层）

定义 Model 的消息格式和密钥管理：

- 每个 Model 定义了一组消息和对应的行为。
- 使用 AppKey 控制哪些应用可以访问哪些 Model。
- 一个节点可以有多个 Model（如灯泡有 Generic OnOff Server 和 Light Lightness Server）。

## 五、配网流程（Provisioning）

配网是将未配网设备加入 Mesh 网络的过程：

```
Provisioner (手机)              Unprovisioned Device
      │                              │
      │ 1. 发现 (广播监听)            │
      │←── Unprovisioned Device Beacon
      │                              │
      │ 2. 邀请                      │
      │──── Invite Protocol ────────→│
      │←─── Capabilities ────────────│
      │  (公钥支持, OOB支持等)        │
      │                              │
      │ 3. 交换公钥 (ECDH P-256)     │
      │──── Public Key ─────────────→│
      │←─── Public Key ──────────────│
      │                              │
      │ 4. 认证                      │
      │    - Output OOB             │
      │    - Input OOB              │
      │    - Static OOB             │
      │    - No OOB (不安全)         │
      │                              │
      │ 5. 确认 (Confirmation)       │
      │──── Confirm ────────────────→│
      │←─── Confirm ──────────────────│
      │                              │
      │ 6. 生成会话密钥              │
      │    (ECDH Secret + 随机数)    │
      │                              │
      │ 7. 分配配网数据              │
      │──── Provisioning Data ──────→│
      │  (NetKey, Unicast Addr,      │
      │   IV Index, 等)              │
      │                              │
      │ 8. 完成配网                  │
      │←── Complete ──────────────────│
      │                              │
      │    设备现在成为Mesh节点       │
```

### 5.1 配网认证方式

| 方式 | 流程 | 安全性 |
|------|------|--------|
| No OOB | 无额外认证 | 最低（易受 MITM） |
| Static OOB | 双方预置相同密钥 | 中 |
| Output OOB | 设备显示数字/闪烁，用户输入 | 高 |
| Input OOB | Provisioner 显示数字，用户在设备输入 | 高 |

### 5.2 配网后分配

配网完成后，Provisioner 为新节点分配以下数据：

- **NetKey**：网络密钥（可能多个子网密钥）。
- **Unicast Address**：唯一单播地址（可能分配多个连续地址）。
- **IV Index**：IV 索引（网络全局参数，影响加密）。
- **DevKey**：设备密钥（用于配置该节点的 Foundation Model）。
- **TTL 默认值**：默认 TTL。
- **Network Key Index**：网络密钥索引。

## 六、Model 与消息

### 6.1 Model 概念

Model 是蓝牙 Mesh 中定义功能的基本单元，类似于 BLE GATT 的 Service/Characteristic：

```
Model 类型:
  ┌──────────────────────────────────┐
  │         Server Model             │
  │  (持有状态, 响应消息)              │
  ├──────────────────────────────────┤
  │         Client Model             │
  │  (发送命令, 请求状态)              │
  ├──────────────────────────────────┤
  │      Control Model               │
  │  (协调 Server和Client)            │
  └──────────────────────────────────┘
```

### 6.2 SIG 标准 Model

| Model ID | 名称 | 消息 | 典型应用 |
|----------|------|------|---------|
| 0x1000 | Generic OnOff Server | Get, Set, Set Unack, Status | 开关控制 |
| 0x1001 | Generic OnOff Client | Get, Set, Set Unack | 开关发起方 |
| 0x1002 | Generic Level Server | Get, Set, Delta, Move | 亮度/音量 |
| 0x1300 | Generic Default Transition | Set, Get | 过渡时间 |
| 0x1200 | Generic Power OnOff | 上电状态 | 上电行为 |
| 0x1003 | Generic Battery Server | Get, Status | 电池状态 |
| 0x1100 | Generic Location Server | Get, Status | 位置信息 |
| 0x1600 | Light Lightness Server | Get, Set | 灯光亮度 |
| 0x1303 | Light CTL Server | Get, Set | 色温+亮度 |
| 0x1A00 | Scene Server | Recall, Register | 场景控制 |
| 0x1A03 | Scheduler Server | Get, Set | 定时调度 |

### 6.3 消息格式

Mesh 消息使用 Opcode 标识类型：

```
Access PDU 格式:
┌──────────┬───────────────┬──────────────┐
│ Opcode   │ Parameters    │ (Padding)    │
│ (1-3 B)  │ (0-379 B)     │              │
└──────────┴───────────────┴──────────────┘

Opcode 编码:
  0x00            ─→ 保留
  0x01-0x7F       ─→ SIG 标准 Model (1字节)
  0x8000-0xBFFF   ─→ SIG 标准 Model (2字节)
  0xC000-0xFFFF   ─→ Vendor Model (2字节, 含Vendor ID)

示例 - Generic OnOff Get:
  Opcode: 0x8201 (2字节)
  Parameters: 无
  响应 - Generic OnOff Status:
  Opcode: 0x8204
  Parameters: Present OnOff (1B), Target OnOff (1B, 可选), Remaining Time (1B, 可选)
```

### 6.4 消息可靠性

Mesh 消息有两种发送模式：

**Unacknowledged（无确认）**：
- 发送后不等待响应。
- 适合频繁的状态更新（如传感器周期上报）。
- 可能丢失消息，但不会阻塞网络。

**Acknowledged（有确认）**：
- 发送后等待接收方的 Status 响应。
- 超时后自动重传（默认重传 3 次，间隔 200-5000ms）。
- 适合关键控制命令（如开锁）。

## 七、安全性

### 7.1 多层加密

蓝牙 Mesh 使用多层加密，每层保护不同的数据：

```
┌───────────────────────────────────────┐
│  Application Payload (明文)            │
├───────────────────────────────────────┤
│  ↑ Upper Transport Layer 加密          │
│  (AppKey - 应用层加密)                  │
│  加密: 消息内容 + 源地址 + 目的地址      │
├───────────────────────────────────────┤
│  ↑ Network Layer 加密                   │
│  (NetKey - 网络层加密)                  │
│  加密: 整个 Upper Transport PDU         │
│  + 网络头部 (TTL, Src, Dst, 等)         │
├───────────────────────────────────────┤
│  Bearer Layer (BLE广播/GATT传输)        │
└───────────────────────────────────────┘
```

**NetKey**：
- 网络层密钥，所有同一 Mesh 网络的节点共享。
- 用于加密和解密网络层数据。
- 支持 NetKey 更新（密钥刷新）实现平滑过渡。
- 一个网络可以有多个 NetKey（子网功能）。

**AppKey**：
- 应用层密钥，按应用域分组。
- 不同应用使用不同 AppKey（如照明控制 vs 安防控制）。
- 只有绑定到对应 Model 的 AppKey 才能解密该 Model 的消息。
- 支持 AppKey 更新（密钥刷新）。

**DevKey**：
- 每个节点唯一的设备密钥。
- 用于配置该节点的 Foundation Model（如添加/删除 AppKey 绑定）。
- 只有 Provisioner 知道 DevKey。

### 7.2 重放攻击防护

Mesh 使用 **Seq（序列号）** 和 **IV Index** 防止重放攻击：

- **Seq**：每个节点维护一个 24 位序列号，每发一条消息递增。
- **IV Index**：32 位全局网络参数，周期性递增。
- 接收方检查 `Seq + IV Index` 是否大于之前收到的值。
- 如果 Seq 接近耗尽（24 位最多 1677 万条），IV Index 递增重置 Seq。

### 7.3 密钥刷新

当网络密钥需要更新时（如设备丢失、安全策略要求），Mesh 支持平滑的密钥刷新：

```
Phase 1 (Key Distribution):
  Provisioner 分发新NetKey
  → 所有节点同时持有旧密钥和新密钥

Phase 2 (Switching):
  Provisioner 触发切换
  → 所有节点切换到新密钥
  → 旧密钥保留一段时间处理缓存消息

Phase 3 (Revoke):
  Provisioner 撤销旧密钥
  → 所有节点删除旧密钥
```

## 八、Mesh 子网

蓝牙 Mesh 支持将网络分为多个子网（Subnet），每个子网使用不同的 NetKey：

```
                    ┌──────────┐
                    │Subnet A  │
              ┌─────┤ NetKey A ├─────┐
              │     └──────────┘     │
              │                      │
         ┌────┴────┐            ┌────┴────┐
         │ Node A1 │            │ Node A2 │
         │ Node A3 │            │         │
         │ +NetKeyB│            │         │
         └────┬────┘            └─────────┘
              │
              │     ┌──────────┐
              └─────┤Subnet B  │
                    │ NetKey B ├─────┐
                    └──────────┘     │
                               ┌─────┴────┐
                               │ Node B1  │
                               │ Node B2  │
                               └──────────┘

Node A3 同时拥有 NetKey A 和 NetKey B, 可以在两个子网间中继消息
```

子网的应用场景：
- **楼宇分区**：每层楼一个子网，减少跨层广播流量。
- **功能分组**：照明子网、安防子网分离管理。
- **安全隔离**：不同安全级别使用不同 NetKey。

## 九、Proxy 节点与手机接入

### 9.1 Proxy 机制

Proxy 节点是 Mesh 网络与外部 BLE 设备（手机）的桥梁：

```
手机 (BLE GATT)            Proxy Node              Mesh Network
     │                          │                       │
     │ 1. GATT Connect          │                       │
     ├─────────────────────────→│                       │
     │                          │                       │
     │ 2. Discover Proxy Service│                       │
     │  (UUID: 0x1828)          │                       │
     │                          │                       │
     │ 3. Write Mesh PDU        │                       │
     ├─────────────────────────→│                       │
     │                          │ 4. 广播转发到Mesh网络   │
     │                          ├──────────────────────→│
     │                          │                       │
     │                          │ 5. Mesh网络响应        │
     │                          │←──────────────────────┤
     │                          │                       │
     │ 6. Notification Mesh PDU │                       │
     │←─────────────────────────┤                       │
```

### 9.2 Proxy Service

Mesh Proxy Service (UUID: 0x1828) 包含两个 Characteristic：

| Characteristic | UUID | 功能 |
|---------------|------|------|
| Mesh Proxy Data In | 0x2ADD | 手机→Proxy（Write + Notify） |
| Mesh Proxy Data Out | 0x2ADE | Proxy→手机（Notify） |

Proxy 节点通过 GATT 连接传输 Mesh PDU，使手机无需实现完整的 Mesh 协议栈即可参与 Mesh 网络。

### 9.3 Proxy 过滤

为减少 GATT 连接上的不必要流量，Proxy 节点支持**代理过滤（Proxy Filter）**：

- 手机可以设置白名单/黑名单，指定只接收特定地址的消息。
- 默认是白名单模式，只接收配置好的地址消息。
- 减少手机端处理负担和功耗。

## 十、典型应用场景

### 10.1 智能照明

蓝牙 Mesh 最成熟的应用场景：

```
手机 App
  │ (GATT)
  ↓
Proxy Node (常供电灯具)
  │ (Mesh 广播)
  ├── 灯具1 (Relay) ── 灯具2 (Relay) ── 灯具3
  ├── 灯具4 (Relay) ── 灯具5 ── 灯具6
  └── 开关 (LPN) ──── Friend 灯具
```

- 灯具作为 Relay 节点，常供电，负责扩展网络。
- 开关作为 LPN，电池供电，通过 Friend 节点收发消息。
- 手机通过 Proxy 节点控制照明。
- 使用 Generic OnOff Model 和 Light Lightness Model。
- 场景控制通过 Scene Server 实现。

### 10.2 楼宇自动化

- 传感器网络：温度、湿度、CO2 传感器作为 LPN。
- HVAC 控制：空调控制器作为 Relay 节点。
- 安防系统：门磁、PIR 传感器使用独立 AppKey。
- 分区管理：不同楼层使用不同子网。

### 10.3 商业照明

- 大规模部署：数百到数千个灯具节点。
- 传感器集成：人感、光感传感器联动照明。
- 能耗管理：电量计量数据上报。
- 远程管理：通过网关连接云端平台。

## 十一、Mesh 网络管理

### 11.1 配置管理

Provisioner 负责网络的配置管理：

- **添加/删除节点**：配网和踢出设备。
- **AppKey 绑定**：为节点的 Model 绑定 AppKey。
- **订阅地址管理**：为 Model 添加/删除 Group 订阅。
- **Relay/Friend/Proxy 特性配置**：启用/禁用节点特性。
- **TTL 配置**：设置节点的默认 TTL。
- **Beacon 配置**：启用/禁用 Secure Network Beacon。

### 11.2 心跳监控

通过 Heartbeat 机制监控网络健康：

- 节点定期发送 Heartbeat Publication。
- 其他节点统计收到的心跳数量。
- 超过阈值未收到心跳，触发告警。
- 可配置心跳周期（1s-65535s）和 TTL。

### 11.3 IV Update

IV Index 是 Mesh 安全的关键参数，其更新流程：

```
Normal Operation (IV Index = N)
  │
  │  Seq 接近耗尽时触发
  ↓
IV Update in Progress (IV Index = N)
  │  - 新消息使用 IV Index = N+1
  │  - 旧消息使用 IV Index = N
  │  - 持续至少 96 小时
  ↓
Normal Operation (IV Index = N+1)
  │  - Seq 重置为 0
  │  - 所有消息使用 IV Index = N+1
```

IV Update 过程确保所有节点平滑过渡到新的 IV Index，同时重置 Seq 防止序列号耗尽。

## 十二、性能与限制

### 12.1 网络规模

- **理论节点数**：单播地址范围 0x0001-0x7FFF，共 32767 个节点。
- **实际建议**：单个子网 100-500 个节点（过多节点会导致广播风暴）。
- **多子网**：通过子网分割可支持更大规模网络。
- **Relay 节点比例**：建议 30-50% 的节点为 Relay（常供电设备）。

### 12.2 延迟

- **单跳延迟**：消息从源到第一个 Relay 约 2-10ms。
- **多跳延迟**：每跳增加 2-10ms，5 跳约 10-50ms。
- **LPN 延迟**：取决于 PollInterval，可能达数百 ms 到数秒。
- **网络拥塞**：节点过多或消息频率过高会导致延迟增加和丢包。

### 12.3 吞吐量

- **单节点理论带宽**：BLE 广播通道约 1 Mbps。
- **实际有效吞吐**：受广播占空比限制，约 10-100 kbps。
- **网络总吞吐**：随 Relay 节点数量增加而降低（广播冲突）。
- **大消息传输**：200 字节消息需要约 20 个分段，传输时间 100-500ms。

## 十三、蓝牙 Mesh vs 其他 Mesh 方案选型

### 13.1 何时选择蓝牙 Mesh

- 需要手机直连控制（无需网关）。
- 智能照明/楼宇自动化场景。
- 节点数量在数百级别。
- 对功耗敏感（LPN 机制）。
- 已有 BLE 生态基础。

### 13.2 何时选择其他方案

- **Zigbee**：已有成熟 Zigbee 生态，需要与 Zigbee 设备互通。
- **Thread**：需要 IP 通信（每个节点有 IP 地址），需要与 Thread 设备互通。
- **Wi-Fi**：需要高带宽（如视频流），节点数量少（<32）。
- **LoRa**：需要远距离通信（公里级），容忍高延迟。
- **NB-IoT**：需要运营商网络覆盖，无本地 Mesh 需求。

## 十四、总结

蓝牙 Mesh 基于 BLE 物理层构建，通过受控泛洪中继机制实现多对多网络拓扑，解决了传统 BLE 点对点通信的局限。其核心特性包括：四种节点特性（Relay/Proxy/Friend/LPN）适应不同功耗需求，多层加密（NetKey/AppKey/DevKey）确保端到端安全，SIG 标准 Model 提供丰富的开箱即用功能。在智能照明和楼宇自动化领域，蓝牙 Mesh 已经成为主流方案之一。其最大的差异化优势是手机可通过 Proxy 节点直接接入 Mesh 网络，无需额外网关。选择蓝牙 Mesh 时需权衡网络规模、延迟需求和功耗约束，对于超大规模或需要 IP 通信的场景，应考虑 Thread 或 Zigbee 等替代方案。
