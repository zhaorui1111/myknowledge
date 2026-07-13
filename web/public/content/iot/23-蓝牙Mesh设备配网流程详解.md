# 23 · 蓝牙 Mesh 设备配网流程详解

## 一、概述

第 20 篇系统讲解了蓝牙 Mesh 网络的协议栈、拓扑和安全体系。第 22 篇讲解了纯蓝牙（点对点 BLE）设备的配网流程。本文聚焦**蓝牙 Mesh 设备的配网（Provisioning）**——将一个出厂的未配网设备（Unprovisioned Device）安全地加入已有的 Mesh 网络，使其成为 Mesh 节点的完整过程。

蓝牙 Mesh 配网与纯 BLE 配网有本质区别：纯 BLE 配网是建立两个设备之间的绑定关系；Mesh 配网是将设备加入一个**多对多网络**，为其分配网络密钥、单播地址等网络身份，使其能被网络中所有授权节点通信。Mesh 配网使用独立的**配网协议（Provisioning Protocol）**，不复用 BLE 的 GAP 配对机制。

## 二、角色定义

| 角色 | 说明 | 典型设备 |
|------|------|---------|
| Provisioner（配网者） | 发起配网、管理网络的设备 | 手机 App、网关 |
| Unprovisioned Device（未配网设备） | 待加入网络的出厂设备 | 灯具、开关、传感器 |

Provisioner 通常同时是 Mesh 网络的管理者，负责：
- 发现并配网新设备。
- 为新设备分配网络密钥和地址。
- 配置新节点的 Model、订阅地址、AppKey 绑定等。
- 管理节点的添加、删除和密钥更新。

## 三、配网前：设备发现

### 3.1 未配网设备广播

出厂设备通过 BLE 广播宣告自己的存在，等待 Provisioner 发现：

```
广播包类型: Unprovisioned Device Beacon
PDU 类型: 0x2B (Mesh Beacon)

广播内容 (Mesh Beacon payload):
  ┌──────────────┬───────────────────────────┐
  │ 字段          │ 长度/说明                  │
  ├──────────────┼───────────────────────────┤
  │ Beacon Type  │ 1B = 0x00 (Unprovisioned) │
  │ Device UUID  │ 16B (设备唯一标识)          │
  │ OOB Info     │ 2B (OOB认证能力)            │
  │ URI Hash     │ 4B (可选, URI 哈希)         │
  └──────────────┴───────────────────────────┘

广播间隔: 典型 100-1000ms (待配网时快速广播)
广播通道: 37/38/39
```

**Device UUID（16 字节）** 是设备的全球唯一标识，通常由厂商在出厂时烧录，包含厂商 ID、产品 ID、序列号等信息：

```
Device UUID 结构示例 (厂商自定义):
  ┌────────────┬────────────────────────────┐
  │ 厂商 ID    │ 2B (如 0x0193 = Philips)    │
  │ 产品 ID    │ 2B (如 0x0001 = Hue Light)  │
  │ 序列号     │ 8B (唯一序列号)              │
  │ 版本/保留  │ 4B                          │
  └────────────┴────────────────────────────┘
```

### 3.2 OOB Info 字段

OOB Info 告知 Provisioner 设备支持的带外认证方式：

| Bit | OOB 方式 | 说明 |
|-----|---------|------|
| 0 | Electronic | 电子方式（如 NFC） |
| 1 | QR Code | 二维码 |
| 2 | Bar Code | 条形码 |
| 3 | NFC | NFC 标签 |
| 4 | Number | 设备上显示数字 |
| 5 | String | 设备上显示字符串 |
| 6-15 | 保留 | — |

### 3.3 Provisioner 扫描

```
Provisioner 扫描流程:
  1. 启动 BLE 扫描, 过滤 Mesh Beacon (类型 0x2B)
  2. 解析 Unprovisioned Device Beacon
  3. 提取 Device UUID, OOB Info
  4. 展示发现的设备列表
  5. 用户选择要配网的设备

可选: 如果 OOB Info 包含 QR Code, 用户可以扫描
     设备上的二维码获取 Device UUID 和 OOB 数据,
     跳过广播扫描步骤直接配网
```

## 四、配网协议详解

配网通过 BLE GATT 连接进行（注意：不是通过 Mesh 广播承载层，而是独立的 GATT 连接）。Provisioner 作为 GATT Client，未配网设备作为 GATT Server。

### 4.1 配网 GATT 服务

设备暴露一个专用的 GATT Service 用于配网：

```
Provisioning Service:
  Service UUID: 0x1827 (Mesh Provisioning Service)

  Characteristic: Provisioning Data In
    UUID: 0x2DB8
    Properties: Write (Provisioner → Device)

  Characteristic: Provisioning Data Out
    UUID: 0x2DB9
    Properties: Notify (Device → Provisioner)
```

所有配网协议消息都通过这两个 Characteristic 传输。

### 4.2 配网协议完整流程

```
Provisioner                     未配网设备
    │                               │
    │ 0. GATT 连接                   │
    ├──────────────────────────────→│
    │                               │
    │ 1. Invite (邀请)               │
    │    注意: 此消息告知设备配网开始   │
    ├──────────────────────────────→│
    │                               │
    │ 2. Capabilities (能力上报)     │
    │←──────────────────────────────┤
    │  (设备支持的配网能力)            │
    │                               │
    │ 3. Start (启动配网)            │
    │    (Provisioner 选择认证方式)   │
    ├──────────────────────────────→│
    │                               │
    │ 4. Public Key Exchange         │
    │    (ECDH P-256 公钥交换)        │
    │──── Public Key A ────────────→│
    │←─── Public Key B ──────────────│
    │                               │
    │ 5. Authentication              │
    │    (根据选择的认证方式执行)       │
    │←──── 认证数据交换 ─────────────→│
    │                               │
    │ 6. Confirmation                │
    │    (双向确认, 验证认证结果)       │
    │──── Confirm A ───────────────→│
    │←─── Confirm B ─────────────────│
    │                               │
    │ 7. Random                      │
    │    (交换随机数, 用于验证确认)     │
    │──── Random A ────────────────→│
    │←─── Random B ──────────────────│
    │                               │
    │ 8. Provisioning Data           │
    │    (下发网络参数)               │
    │──── Data ────────────────────→│
    │  (NetKey, Unicast Addr,        │
    │   IV Index, DevKey 等)          │
    │                               │
    │ 9. Complete (完成)             │
    │←──────────────────────────────┤
    │                               │
    │    设备成为 Mesh 节点           │
    │    GATT 连接可断开              │
```

### 4.3 各阶段详解

**阶段 1：Invite（邀请）**

Provisioner 发送 Invite 消息，通知设备配网开始：

```
Invite 消息:
  ┌────────────────────┐
  │ Attention Timer    │ 1B (秒)
  │                    │ 设备需要保持注意状态的时间
  │                    │ (如闪烁LED, 蜂鸣等)
  └────────────────────┘

设备收到后:
  - 启动注意力计时器 (如闪烁LED)
  - 准备配网流程
```

**阶段 2：Capabilities（能力上报）**

设备回复自己支持的配网能力：

```
Capabilities 消息:
  ┌────────────────────────┬──────────────────────┐
  │ 字段                    │ 说明                  │
  ├────────────────────────┼──────────────────────┤
  │ Number of Elements     │ 1B (设备包含的元素数)  │
  │ Algorithms             │ 2B (支持的配网算法)    │
  │ Public Key Type        │ 1B (公钥类型)         │
  │  - 0x00: 内置公钥       │                      │
  │  - 0x01: OOB 公钥       │                      │
  │ Static OOB Type        │ 1B (静态OOB类型)      │
  │ Output OOB Size        │ 1B (输出OOB最大长度)  │
  │ Output OOB Action      │ 2B (输出OOB方式)      │
  │ Input OOB Size         │ 1B (输入OOB最大长度)  │
  │ Input OOB Action       │ 2B (输入OOB方式)      │
  └────────────────────────┴──────────────────────┘

Algorithms:
  Bit 0: FIPS P-256 Elliptic Curve (必须支持)

Output OOB Action:
  Bit 0: Blink (闪烁)
  Bit 1: Beep (蜂鸣)
  Bit 2: Vibrate (震动)
  Bit 3: Output Numeric (显示数字)
  Bit 4: Output Alphanumeric (显示字符)

Input OOB Action:
  Bit 0: Push (按键)
  Bit 1: Twist (旋钮)
  Bit 2: Input Numeric (输入数字)
  Bit 3: Input Alphanumeric (输入字符)
```

**阶段 3：Start（启动）**

Provisioner 根据 Capabilities 选择认证方式：

```
Start 消息:
  ┌────────────────────────┬──────────────────────┐
  │ Algorithm              │ 1B (选择的算法)       │
  │ Public Key             │ 1B (0=内置, 1=OOB)   │
  │ Authentication Method  │ 1B                   │
  │  - 0x00: No OOB        │                      │
  │  - 0x01: Static OOB    │                      │
  │  - 0x02: Output OOB    │                      │
  │  - 0x03: Input OOB     │                      │
  │ OOB Action             │ 1B (具体动作)         │
  │ OOB Size               │ 1B (数据长度)         │
  └────────────────────────┴──────────────────────┘
```

**阶段 4：Public Key Exchange（公钥交换）**

双方交换 ECDH P-256 公钥，建立密钥交换基础：

```
1. 如果 PublicKey = OOB:
   - 设备的公钥通过带外通道传递 (如二维码)
   - Provisioner 通过扫描二维码获取设备公钥
   - 跳过通过 GATT 传输公钥

2. 如果 PublicKey = 内置:
   - 双方通过 GATT 直接交换公钥
   - Provisioner → Device: Public Key A (64B)
   - Device → Provisioner: Public Key B (64B)

3. ECDH 计算:
   - 双方用各自的私钥和对方的公钥计算共享密钥
   - SharedSecret = ECDH(PrivateKey_A, PublicKey_B)
   - SharedSecret = ECDH(PrivateKey_B, PublicKey_A) (相同)
   - SharedSecret 用于后续配网数据的加密
```

**阶段 5：Authentication（认证）**

根据 Start 阶段选择的认证方式执行：

```
方式 1: No OOB (无认证)
  - 无额外步骤
  - 安全性最低, 容易受到 MITM 攻击
  - 仅用于安全要求极低的场景

方式 2: Static OOB (静态认证)
  - 双方预置相同的 Static OOB 数据 (如出厂烧录)
  - Static OOB 用于后续 Confirmation 计算
  - 中等安全性

方式 3: Output OOB (输出认证)
  ┌──────────────────────────────────────────┐
  │ Provisioner                设备           │
  │                            │              │
  │                            │ 设备输出随机数 │
  │                            │ (闪烁N次/     │
  │                            │  显示数字N/   │
  │                            │  蜂鸣N次)     │
  │                            │              │
  │ 用户观察设备输出             │              │
  │ 并在Provisioner输入N        │              │
  │                            │              │
  │ N 用于 Confirmation 计算    │              │
  └──────────────────────────────────────────┘

方式 4: Input OOB (输入认证)
  ┌──────────────────────────────────────────┐
  │ Provisioner                设备           │
  │                            │              │
  │ Provisioner 生成随机数N     │              │
  │ 并显示N                    │              │
  │                            │              │
  │ 用户在设备上输入N            │              │
  │ (按键N次/输入数字N)          │              │
  │                            │              │
  │ N 用于 Confirmation 计算    │              │
  └──────────────────────────────────────────┘
```

**阶段 6：Confirmation（确认）**

双方交换 Confirmation 值，验证认证过程正确：

```
Confirmation 计算:
  ConfirmationKey = K1(SharedSecret, "prck", Random_Provisioner || Random_Device)
  
  Provisioner Confirmation:
    ConfA = AES-CMAC(ConfirmationKey, Random_A || AuthValue || Random_B)
    AuthValue = 认证阶段获得的数据 (OOB数据或全0)

  Device Confirmation:
    ConfB = AES-CMAC(ConfirmationKey, Random_B || AuthValue || Random_A)

  交换:
    Provisioner → Device: ConfA
    Device → Provisioner: ConfB

  双方各自验证对方的 Confirmation 值
```

**阶段 7：Random（随机数交换）**

确认通过后，双方交换 Random 值，用于验证 Confirmation 的正确性：

```
Provisioner → Device: Random_A (16B)
Device → Provisioner: Random_B (16B)

双方用对方的 Random 重新计算 Confirmation, 验证一致性:
  - Provisioner 用 Random_B 重新计算 ConfB, 与收到的 ConfB 比较
  - Device 用 Random_A 重新计算 ConfA, 与收到的 ConfA 比较
  - 不匹配则中止配网
```

**阶段 8：Provisioning Data（配网数据下发）**

认证通过后，Provisioner 向设备下发网络参数：

```
配网数据 (加密传输):
  ┌──────────────────────┬──────────────────────────────┐
  │ 字段                  │ 说明                         │
  ├──────────────────────┼──────────────────────────────┤
  │ Network Key (NetKey)  │ 16B (网络密钥)                │
  │ Key Index            │ 2B (NetKey 索引)             │
  │ Flags                │ 1B (网络标志)                 │
  │  - Bit 0: Key Refresh│                              │
  │  - Bit 1: IV Update  │                              │
  │ IV Index             │ 4B (IV索引)                  │
  │ Unicast Address      │ 2B (分配的单播地址)            │
  └──────────────────────┴──────────────────────────────┘

加密方式:
  SessionKey = K1(SharedSecret, "prks", Random_A || Random_B)
  配网数据用 SessionKey 通过 AES-CCM 加密

DevKey 计算:
  DevKey = K1(SharedSecret, "prdk", DeviceUUID || Random_A || Random_B)
  DevKey 用于后续配置该节点的 Foundation Model
  (只有 Provisioner 知道 DevKey, 其他节点不知道)
```

**阶段 9：Complete（完成）**

设备成功接收并存储配网数据后，发送 Complete 消息：

```
设备操作:
  1. 存储 NetKey, KeyIndex, IVIndex, UnicastAddr
  2. 计算 DevKey 并存储
  3. 生成 Network ID (从 NetKey 派生)
  4. 生成 Network Key 衍生密钥 (Privacy Key, Encryption Key)
  5. 切换到 Mesh 节点状态
  6. 停止 Unprovisioned Device Beacon 广播
  7. 开始 Secure Network Beacon 广播
  8. 发送 Complete 消息给 Provisioner

  → GATT 配网连接可以断开
  → 设备现在作为 Mesh 节点工作
  → 可以收发 Mesh 消息
```

## 五、配网后：节点配置

配网完成后，设备已是 Mesh 节点，但还需要进行**节点配置（Configuration）**才能正常工作。配置通过 Mesh 消息完成（不再通过配网 GATT 连接）。

### 5.1 配置流程

```
Provisioner                      新节点
    │                               │
    │ 1. AppKey 添加                 │
    │    Config AppKey Add           │
    │    (为新节点的Model绑定AppKey)   │
    ├──────────────────────────────→│
    │←────────── AppKey Status ──────│
    │                               │
    │ 2. Model 绑定 AppKey           │
    │    Config Model App Bind       │
    │    (为每个Model指定可用AppKey)   │
    ├──────────────────────────────→│
    │←────────── Bind Status ────────│
    │                               │
    │ 3. 订阅地址配置                 │
    │    Config Model Subscription Add│
    │    (让Model订阅Group地址)       │
    ├──────────────────────────────→│
    │←────────── Sub Status ─────────│
    │                               │
    │ 4. 发布配置                    │
    │    Config Model Publication Set│
    │    (配置Model发布目标和参数)     │
    ├──────────────────────────────→│
    │←────────── Pub Status ─────────│
    │                               │
    │ 5. Relay/Proxy/Friend 配置     │
    │    Config Relay/Set            │
    │    Config Beacon/Set           │
    │    Config Friend/Set           │
    │    Config GATT Proxy/Set       │
    ├──────────────────────────────→│
    │←────────── Status ─────────────│
    │                               │
    │ 6. 默认 TTL 配置                │
    │    Config Default TTL Set      │
    ├──────────────────────────────→│
    │←────────── Status ─────────────│
    │                               │
    │    节点配置完成, 可正常使用      │
```

### 5.2 关键配置项说明

**AppKey 绑定：**
```
AppKey 是应用层加密密钥, 不同应用域使用不同 AppKey:
  - 照明控制 AppKey: 控制灯具开关/亮度
  - 安防控制 AppKey: 控制门锁/传感器
  - 配置管理 AppKey: 管理设备配置

每个 Model 必须绑定至少一个 AppKey 才能收发该应用域的消息:
  Model: Generic OnOff Server (灯)
    → 绑定照明 AppKey
    → 只能解密用该 AppKey 加密的控制消息
```

**订阅地址（Subscription）：**
```
节点通过订阅 Group Address 接收组播消息:
  灯1 订阅 Group: 0xC001 (客厅灯组)
  灯2 订阅 Group: 0xC001 (客厅灯组)
  灯3 订阅 Group: 0xC002 (卧室灯组)

  开关发消息到 0xC001 → 灯1和灯2同时收到
  开关发消息到 0xC002 → 只有灯3收到
```

**发布配置（Publication）：**
```
配置 Model 的消息发布目标:
  温度传感器的 Sensor Server:
    发布目标: Group 0xC003 (HVAC控制组)
    发布周期: 60秒
    发布TTL: 5

  开关的 Generic OnOff Client:
    发布目标: Group 0xC001 (客厅灯组)
    发布TTL: 5
    无周期发布, 按键触发
```

## 六、配网安全分析

### 6.1 配网协议的安全机制

| 安全机制 | 说明 |
|---------|------|
| ECDH P-256 | 公钥交换, 防止窃听者推导共享密钥 |
| OOB 认证 | 防止中间人攻击 (MITM) |
| Confirmation 验证 | 确保双方持有相同的共享密钥和认证数据 |
| 配网数据加密 | 用 SessionKey 加密 NetKey 等敏感数据 |
| DevKey 唯一性 | 每个节点的 DevKey 不同, 只有 Provisioner 知道 |

### 6.2 安全级别对比

| 认证方式 | MITM 防护 | 安全级别 | 适用场景 |
|---------|-----------|---------|---------|
| No OOB | 无 | 低 | 测试/演示 |
| Static OOB | 弱 | 中 | 低安全设备 |
| Output OOB | 有 | 高 | 有输出能力的设备（LED/屏幕） |
| Input OOB | 有 | 高 | 有输入能力的设备（按键/旋钮） |
| OOB Public Key | 最高 | 最高 | 高安全设备（NFC/二维码传公钥） |

### 6.3 配网安全最佳实践

- 生产环境禁用 No OOB 方式。
- 设备有 LED/屏幕时优先使用 Output OOB（Blink 或 Numeric）。
- 高安全设备（门锁、安防）使用 OOB Public Key + Output/Input OOB 组合。
- DevKey 存储在设备的安全存储区，防止物理提取。
- Provisioner 应安全存储所有节点的 DevKey，防止泄露。

## 七、设备从网络中移除

### 7.1 主动移除

```
Provisioner                    目标节点               Mesh网络
    │                             │                      │
    │ 1. Config Node Reset        │                      │
    ├────────────────────────────→│                      │
    │                             │                      │
    │                             │ 清除所有 Mesh 数据:    │
    │                             │ - NetKey, AppKey     │
    │                             │ - UnicastAddr        │
    │                             │ - DevKey             │
    │                             │ - 订阅/发布配置        │
    │                             │                      │
    │ 2. Node Reset Status        │                      │
    │←────────────────────────────┤                      │
    │                             │                      │
    │ 3. Provisioner 更新网络列表  │                      │
    │    - 删除节点记录            │                      │
    │    - 回收单播地址            │                      │
    │    - 通知其他节点刷新路由     │                      │
    │                             │                      │
    │                             │ 设备回到未配网状态     │
    │                             │ 开始 Unprovisioned    │
    │                             │ Device Beacon 广播   │
```

### 7.2 强制移除（设备丢失/故障）

当设备无法响应时，Provisioner 进行强制移除：

```
1. Provisioner 单方面删除节点记录
2. 从 Key Refresh 流程中排除该节点
3. 执行 NetKey 更新 (密钥刷新)
   → 丢失设备持有的旧 NetKey 失效
   → 无法解密新网络消息
4. 从 AppKey 更新中排除该节点
   → 无法解密应用消息
5. 回收地址 (等待 IV Index 更新后可重新分配)
```

强制移除的关键是**密钥刷新**——通过更新 NetKey 和 AppKey 使丢失设备的密钥失效，防止其继续参与网络通信。

## 八、配网与纯 BLE 配网的对比

| 维度 | Mesh 配网 | 纯 BLE 配网 |
|------|----------|------------|
| 目标 | 加入多对多网络 | 建立点对点绑定 |
| 配网通道 | GATT 连接（配网 Service） | GATT 连接 |
| 认证机制 | ECDH + OOB | LE Secure Connections (ECDH) |
| 密钥类型 | NetKey, AppKey, DevKey | LTK, IRK, CSRK |
| 地址分配 | Provisioner 分配单播地址 | 设备 MAC 地址 |
| 配网后配置 | Model 绑定、订阅、发布 | GATT 服务发现、参数配置 |
| 网络范围 | 整个 Mesh 网络 | 点对点 |
| 重连方式 | Mesh 消息（广播/GATT Proxy） | BLE 直连 + LTK 加密 |

## 九、实际配网用户体验

### 9.1 典型配网交互流程

```
用户操作流程 (以智能灯泡为例):

1. 用户拧入灯泡, 通电
   → 灯泡开始快速闪烁 (待配网状态)
   → 灯泡广播 Unprovisioned Device Beacon

2. 用户打开手机 App, 点击"添加设备"
   → App 扫描发现灯泡
   → 显示"发现智能灯泡"

3. 用户点击确认配网
   → App 通过 GATT 连接灯泡
   → 执行配网协议 (公钥交换 → 认证 → 数据下发)
   → 灯泡停止闪烁 (配网成功)

4. 认证交互 (根据设备能力):
   a. Output OOB (Blink):
      → 灯泡闪烁 N 次
      → App 提示"请输入灯泡闪烁次数"
      → 用户输入 N

   b. No OOB:
      → 无额外交互
      → 直接完成配网 (安全性低)

   c. Static OOB (二维码):
      → 用户扫描灯泡上的二维码
      → App 获取 OOB 数据, 自动完成认证

5. App 自动配置节点
   → 绑定 AppKey
   → 设置订阅地址 (如"客厅灯组")
   → 配置发布参数

6. 配网完成
   → App 显示"灯泡已添加"
   → 用户可以控制灯泡开关/亮度
   → 灯泡参与 Mesh 网络中继
```

### 9.2 批量配网

大型部署（如办公楼照明）需要批量配网：

```
批量配网策略:
  1. Provisioner 扫描所有待配网设备
  2. 用户选择多个设备批量配网
  3. App 逐个执行配网协议 (串行, 每个设备约 5-15 秒)
  4. 配网后批量配置 (统一 AppKey, 按位置分配 Group)
  5. 验证所有设备在线

优化:
  - 并行 GATT 连接 (部分手机支持多连接)
  - 预配置模板 (批量应用相同配置)
  - NFC 触碰配网 (快速触发, 跳过扫描)
```

## 十、总结

蓝牙 Mesh 设备配网是一个多阶段的安全协议流程：设备发现（Unprovisioned Device Beacon）→ GATT 连接 → Invite 邀请 → Capabilities 能力上报 → Start 选择认证方式 → ECDH 公钥交换 → OOB 认证 → Confirmation 双向确认 → Random 验证 → Provisioning Data 下发网络参数 → Complete 完成。配网后还需要通过 Mesh 消息进行节点配置（AppKey 绑定、订阅地址、发布参数、特性配置），设备才能正常工作。Mesh 配网的安全基础是 ECDH P-256 密钥交换和 OOB 认证，生产环境应避免使用 No OOB 方式。理解 Mesh 配网流程对于开发蓝牙 Mesh 产品和 Provisioner 应用至关重要。
