# 03 · 蓝牙 BLE 配对与绑定流程

## 一、概述

蓝牙低功耗（Bluetooth Low Energy，BLE）的配对（Pairing）和绑定（Bonding）是建立安全连接的核心机制。配对是设备间交换密钥并建立加密连接的过程，绑定是配对成功后保存密钥以便后续重连时跳过配对步骤。

在 IoT 场景中，BLE 配对不仅用于蓝牙设备本身的通信安全，也常作为 WiFi 设备配网的辅助通道（BLE Provisioning）。

## 二、BLE 协议栈中的角色

### 2.1 GAP 角色

GAP（Generic Access Profile）定义了四种角色：

| 角色 | 说明 | 典型设备 |
|------|------|---------|
| Broadcaster | 只广播，不建立连接 | iBeacon 信标 |
| Observer | 只扫描广播，不建立连接 | 接收信标的设备 |
| Peripheral | 广播并可接受连接 | 传感器、手环 |
| Central | 扫描并发起连接 | 手机、网关 |

配对场景中，Peripheral 是被配对的设备（IoT 设备），Central 是发起配对的设备（手机/网关）。

### 2.2 GATT 角色

连接建立后，设备进入 GATT（Generic Attribute Profile）层：
- **Server**：提供数据（特征值），通常是 IoT 设备。
- **Client**：访问数据，通常是手机。

GATT 角色与 GAP 角色相互独立，一个 Peripheral 可以同时是 GATT Server 或 Client。

## 三、配对流程详解

### 3.1 配对的三个阶段

BLE 配对分为三个阶段：

```
阶段1: Pairing Feature Exchange
  Central 和 Peripheral 交换各自支持的配对特性
  （IO能力、认证要求、密钥大小等）

阶段2: 密钥生成
  根据认证方式生成短期密钥(STK)或长期密钥(LTK)
  LE Legacy Pairing: 使用临时密钥(TK)生成STK
  LE Secure Connections: 使用ECDH直接生成LTK

阶段3: 密钥分发
  双方交换各自生成的密钥（LTK, IRK, CSRK等）
  绑定时保存这些密钥
```

### 3.2 LE Legacy Pairing（传统配对）

LE Legacy Pairing 是蓝牙 4.0 引入的配对方式，使用 AES-128 对称加密：

1. **生成临时密钥（TK）**：根据 IO 能力，通过以下方式之一生成 TK：
   - **Just Works**：TK = 0，无认证，容易受到中间人攻击。
   - **Passkey Entry**：一方显示 6 位数字，另一方输入，TK = 6 位数字。
   - **Out of Band（OOB）**：通过 NFC 或其他通道传递 TK，安全性最高。

2. **生成短期密钥（STK）**：双方各生成一个随机数（Srand 和 Mrand），用 TK 加密这两个随机数，生成 STK。

3. **加密连接**：用 STK 加密后续通信。

4. **密钥分发**：双方交换长期密钥（LTK）等密钥，用于后续连接。

**安全弱点**：TK 只有 6 位数字（000000-999999），可被暴力破解。攻击者可以在配对过程中监听并离线计算 TK。

### 3.3 LE Secure Connections（安全连接配对）

蓝牙 4.2 引入，使用 ECDH（P-256 椭圆曲线）非对称加密：

1. **ECDH 密钥交换**：双方各生成一对 ECDH 公私钥对，交换公钥。
2. **生成 DHKey**：用自己的私钥和对方的公钥计算共享密钥 DHKey。
3. **认证**：
   - **Just Works**：不额外验证，但 DHKey 提供了基础安全性。
   - **Numeric Comparison**：双方显示 6 位确认码，用户确认是否一致。与 Legacy Passkey 不同，这里的确认码是通过 DHKey 计算的，无法离线破解。
   - **Passkey Entry**：20 位 Passkey 逐位参与计算，安全性高于 Legacy。
   - **OOB**：通过 NFC 等通道传递公钥和认证数据。

4. **生成 LTK**：直接用 DHKey 和随机数生成 LTK，不经过 STK 中间步骤。

**优势**：抗中间人攻击（ECDH），无需分发 LTK（连接级密钥直接由 ECDH 派生）。

### 3.4 IO 能力矩阵

配对方式由双方的 IO 能力决定：

| Central \ Peripheral | DisplayOnly | DisplayYesNo | KeyboardOnly | NoInputNoOutput | KeyboardDisplay |
|----------------------|-------------|--------------|--------------|-----------------|-----------------|
| DisplayOnly | Just Works | Just Works | Passkey Entry | Just Works | Passkey Entry |
| DisplayYesNo | Just Works | Numeric Comparison | Passkey Entry | Just Works | Numeric Comparison |
| KeyboardOnly | Passkey Entry | Passkey Entry | Passkey Entry | Just Works | Passkey Entry |
| NoInputNoOutput | Just Works | Just Works | Just Works | Just Works | Just Works |
| KeyboardDisplay | Passkey Entry | Numeric Comparison | Passkey Entry | Just Works | Numeric Comparison |

注：以上为 LE Secure Connections 的矩阵。LE Legacy 中 DisplayYesNo × DisplayYesNo 是 Just Works（无 Numeric Comparison）。

## 四、绑定（Bonding）

### 4.1 绑定的本质

配对成功后，双方将密钥信息保存到非易失性存储中，这个过程就是绑定。下次连接时直接使用保存的密钥加密，无需重新配对。

### 4.2 密钥类型

| 密钥 | 全称 | 用途 | 长度 |
|------|------|------|------|
| LTK | Long Term Key | 加密连接数据 | 128 bit |
| IRK | Identity Resolving Key | 生成/解析随机地址 | 128 bit |
| CSRK | Connection Signature Resolving Key | 数据签名 | 128 bit |
| LTK（SC） | LE Secure Connections LTK | SC 加密连接 | 128 bit |

### 4.3 地址解析

BLE 设备可以使用两种地址类型：
- **Public Address**：固定不变，类似 MAC 地址。
- **Random Address**：又分 Static（静态随机）和 Private（私有随机，用 IRK 生成）。

私有随机地址会定期变化以保护隐私。绑定时双方交换 IRK，后续连接时 Central 用 IRK 解析设备不断变化的随机地址，识别出是已绑定的设备。

### 4.4 绑定信息存储

```
手机端存储:
{
  "device_address": "AA:BB:CC:DD:EE:FF",
  "device_irk": "0x...",
  "device_ltk": "0x...",  // LE Legacy 时存储
  "key_type": "LESecureConnections",
  "ediv": 0x0001,
  "rand": "0x...",
}

设备端存储:
{
  "central_irk": "0x...",
  "central_addr_type": "public",
  "ltk": "0x...",
}
```

## 五、重连流程

已绑定的设备重连时：

```
Central                             Peripheral
  |                                    |
  | 1. 扫描，发现设备(可能地址已变)      |
  |    用IRK解析随机地址                 |
  |                                    |
  | 2. 发起连接                        |
  |---- CONNECT_REQ ------------------>|
  |                                    |
  | 3. 加密请求(提供EDIV/Rand)         |
  |---- LL_ENC_REQ (ediv, rand) ------>|
  |                                    |
  | 4. 设备查找对应LTK                  |
  |<--- LL_ENC_RSP (skd_m, iv_m) -----|
  |                                    |
  | 5. 双方用LTK计算会话密钥            |
  |    SessionKey = f5(LTK, ...)       |
  |                                    |
  | 6. 加密连接建立                     |
  |<=== 加密数据通信 ==================>|
```

对于 LE Secure Connections，重连时双方直接用 ECDH 派生的 LTK 加密，流程更简洁。

## 六、IoT 场景中的 BLE 配对实践

### 6.1 智能门锁配对

门锁通常使用 **Passkey Entry** 方式：
1. 门锁键盘面板上显示 6 位随机数字。
2. 用户在 App 中输入这 6 位数字。
3. 使用 LE Secure Connections 完成配对。
4. 绑定后，App 可通过 BLE 解锁。

### 6.2 智能手环配对

手环通常使用 **Just Works**（Legacy）或 **Numeric Comparison**（SC）：
1. App 扫描发现手环。
2. 弹出确认码，用户在手环上确认（SC）或直接 Just Works（Legacy）。
3. 配对成功后同步数据。

### 6.3 BLE Mesh 配网

BLE Mesh 使用独立的 Provisioning 协议：
1. Provisioner（手机/网关）发送 Provisioning Invite。
2. 设备返回 Capabilities（支持的算法、公钥类型等）。
3. 双方交换 ECDH 公钥。
4. 通过 OOB 或 Passkey 完成认证。
5. 生成 Network Key 和 Device Key。
6. 设备加入 Mesh 网络。

## 七、安全问题与最佳实践

### 7.1 已知攻击

- **中间人攻击（MITM）**：Just Works 模式无认证，攻击者可在配对过程中间劫持。解决：使用 Numeric Comparison 或 Passkey Entry。
- **TK 暴力破解**：LE Legacy 的 6 位 TK 可被离线暴力破解。解决：使用 LE Secure Connections。
- **重放攻击**：捕获并重放配对数据包。BLE 使用计数器机制防止重放。
- **降级攻击**：攻击者迫使双方使用 Legacy 而非 Secure Connections。解决：设备端强制要求 LE Secure Connections。

### 7.2 最佳实践

1. 强制使用 LE Secure Connections（蓝牙 4.2+）。
2. 避免使用 Just Works，至少使用 Numeric Comparison。
3. 高安全场景使用 OOB（NFC）传递认证信息。
4. 配对过程设置超时（通常 30 秒），超时后需重新触发。
5. 绑定信息加密存储，防止密钥泄露。
6. 支持解绑功能，允许用户清除绑定信息。

## 八、总结

BLE 配对和绑定是蓝牙 IoT 设备安全的基础。LE Secure Connections 相比 Legacy 显著提升了安全性，是当前新设备的首选。在 IoT 工程实践中，需要根据设备形态（有无屏幕/键盘）选择合适的配对方式，并在安全性和用户体验之间取得平衡。
