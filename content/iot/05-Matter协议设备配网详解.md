# 05 · Matter 协议设备配网详解

## 一、概述

Matter 是由连接标准联盟（CSA，Connectivity Standards Alliance）主导制定的智能家居统一标准，于 2022 年 10 月发布 1.0 版本。Matter 的目标是解决智能家居生态碎片化问题，让不同厂商的设备可以跨平台互联互通。

Matter 底层支持两种传输网络：**Thread**（基于 IEEE 802.15.4 的低功耗 Mesh 网络）和 **WiFi**。无论底层使用哪种网络，Matter 设备的配网流程（Commissioning）是统一的。

## 二、Matter 协议架构

```
┌──────────────────────────────────┐
│      Application Clusters        │  设备类型定义（灯、开关、传感器等）
├──────────────────────────────────┤
│   Data Model (Interaction Model)  │  数据模型：属性、命令、事件
├──────────────────────────────────┤
│      Secure Channel (CASE)        │  安全会话：基于证书的认证
├──────────────────────────────────┤
│      Messaging Layer (MRP)        │  消息可靠性：重传、分片
├──────────────────────────────────┤
│        Matter Protocol            │  Matter 协议层
├──────────────────────────────────┤
│    Thread (6LoWPAN)  |  WiFi     │  传输网络
├──────────────────────────────────┤
│  IEEE 802.15.4     |  802.11    │  物理层
└──────────────────────────────────┘
```

## 三、Matter 设备角色

| 角色 | 说明 | 典型设备 |
|------|------|---------|
| Commissioner | 发起配网的设备，通常是手机 App | iPhone (Home App)、Android (Google Home) |
| Commissionee | 被配网的设备 | 智能灯泡、温控器、门锁 |
| Controller | 控制其他设备的设备 | 手机、语音助手 |
| Bridge | 桥接非 Matter 设备到 Matter 网络 | Zigbee-to-Matter 网关 |

## 四、配网流程（Commissioning）

Matter 配网流程分为以下几个阶段：

### 4.1 阶段一：设备发现

设备上电后，进入配网模式，通过以下方式广播自身：

**BLE 广播（主要发现方式）**：
- 设备广播 BLE 广播包，包含 Matter Service UUID 和设备标识。
- Commissioner（手机）扫描 BLE 广播，发现待配网设备。
- BLE 同时用于配网过程中的通信通道。

**WiFi SoftAP（备用发现方式）**：
- 设备启动 WiFi SoftAP 模式。
- Commissioner 连接设备热点。
- 适用于无 BLE 的设备。

**On-network（已联网设备发现）**：
- 设备已通过其他方式连上 IP 网络。
- Commissioner 通过 DNS-SD（mDNS）发现设备。
- 适用于已联网但需要重新配网的场景。

### 4.2 阶段二：建立 BLE 连接

```
Commissioner (手机)                Commissionee (设备)
     |                                    |
     | 1. BLE扫描，发现设备               |
     |<--- BLE Advertising ---------------|
     |                                    |
     | 2. 建立BLE GATT连接                |
     |---- BLE Connect ------------------>|
     |                                    |
     | 3. 发现Matter GATT Service         |
     |    UUID: 0000FFF6-0000-1000-8000   |
     |---- GATT Discover ---------------->|
     |                                    |
     | 4. 建立Matter BTP传输层            |
     |    (BLE Transaction Protocol)      |
     |<=================================>|
```

Matter over BLE 使用 GATT 特征值进行数据传输：
- TX Characteristic（C1）：Commissioner → Commissionee
- RX Characteristic（C2）：Commissionee → Commissioner
- 使用 BTP（BLE Transaction Protocol）进行分片和重组

### 4.3 阶段三：PASE 会话建立

配网通信需要加密保护。Matter 使用 **PASE（Passcode-Authenticated Session Establishment）** 协议建立安全会话：

```
Commissioner                       Commissionee
     |                                    |
     | 1. 获取设备Passcode                 |
     |    (二维码/手动输入)                |
     |    Passcode: 278156 (6位数字)       |
     |                                    |
     | 2. PAKE参数协商 (SPAKE2+协议)       |
     |---- PBKDFParamRequest ------------>|
     |<--- PBKDFParamResponse ------------|
     |    (迭代次数, salt, pubkey)         |
     |                                    |
     | 3. SPAKE2+ 密钥协商                |
     |---- PASEPake1 -------------------->|
     |<--- PASEPake2 ---------------------|
     |                                    |
     | 4. 派生会话密钥                     |
     |    SessionKey = SPAKE2+(passcode)  |
     |                                    |
     | 5. PASE 会话建立完成                |
     |<=== 加密通信通道 =================>|
```

**Passcode 来源**：
- 设备上印有二维码，包含 Passcode 和设备信息。
- 也可通过 11 位手动配对码输入。
- 部分设备支持通过 NFC 传递 Passcode。

**SPAKE2+ 协议**：这是一种 PAKE（Password-Authenticated Key Exchange）协议，允许双方在仅共享一个低熵密码（6 位数字）的情况下安全地协商高熵会话密钥。SPAKE2+ 保证了即使攻击者监听整个协商过程，也无法离线暴力破解 Passcode。

### 4.4 阶段四：设备认证

PASE 会话建立后，Commissioner 验证设备的身份：

```
Commissioner                       Commissionee
     |                                    |
     | 1. 请求设备证书链                   |
     |---- Attestation Request ---------->|
     |                                    |
     |<--- Attestation Response ----------|
     |    (设备证书 + 厂商签名 + 证书链)    |
     |                                    |
     | 2. 验证证书链                       |
     |    - DAC (Device Attestation Cert) |
     |    - PAI (Product Attestation      |
     |      Intermediate)                 |
     |    - PAA (Product Attestation      |
     |      Authority)                    |
     |    - 信任根在CSA根证书列表中         |
     |                                    |
     | 3. 验证设备证明签名                  |
     |    (用设备公钥验签，确认设备私钥      |
     |     确实存在于设备中)                |
     |                                    |
     | 4. 可选: 云端认证                   |
     |    Commissioner可向厂商云服务       |
     |    查询设备是否合法/已报失           |
```

**设备认证证书体系**：
- **PAA（Product Attestation Authority）**：根证书，由 CSA 认证的机构签发，是信任锚点。
- **PAI（Product Attestation Intermediate）**：厂商证书，由 PAA 签发，绑定到厂商。
- **DAC（Device Attestation Certificate）**：设备证书，由 PAI 签发，每台设备唯一。

每台 Matter 设备在出厂时烧录唯一的 DAC 和对应私钥。这套 PKI 体系确保了设备的真实性和不可伪造性。

### 4.5 阶段五：网络配置

设备认证通过后，Commissioner 向设备传递网络凭证：

**Thread 网络**：
```
Commissioner                       Commissionee
     |                                    |
     | 1. 发送Thread网络凭证               |
     |---- Network Commissioning -------->|
     |    - Operational Dataset           |
     |    - Network Key                   |
     |    - PAN ID                        |
     |    - Extended PAN ID               |
     |    - Channel                       |
     |                                    |
     | 2. 设备保存网络信息                 |
     |                                    |
     | 3. 设备切换到Thread网络             |
     |    断开BLE，加入Thread Mesh         |
```

**WiFi 网络**：
```
Commissioner                       Commissionee
     |                                    |
     | 1. 发送WiFi凭证                    |
     |---- Network Commissioning -------->|
     |    - SSID                          |
     |    - Password                      |
     |                                    |
     | 2. 设备连接WiFi                    |
     |    断开BLE，连接WiFi                |
```

### 4.6 阶段六：操作证书配置（NOC Chain）

设备加入网络后，Commissioner 为设备签发 **操作证书（NOC, Node Operational Certificate）**：

```
Commissioner                       Commissionee
     |                                    |
     | 1. 设备生成CSR                      |
     |    (CS Root Key → CSR)             |
     |<--- CSR Response ------------------|
     |                                    |
     | 2. Commissioner签发NOC              |
     |    - 用Fabric CA私钥签名             |
     |    - 包含Node ID和Fabric ID         |
     |---- NOC Response ----------------->|
     |    (NOC + ICAC + RCAC)             |
     |                                    |
     | 3. 设备保存NOC和私钥                 |
     |    加入Fabric (信任域)              |
     |                                    |
     | 4. 建立CASE会话                    |
     |    (Certificate Authenticated     |
     |     Session Establishment)        |
     |<=== CASE加密通信 =================>|
```

**Fabric 概念**：Fabric 是 Matter 中的信任域，由一个 Fabric CA（通常是生态系统提供者如 Apple/Google/Amazon）管理。一个设备可以同时加入多个 Fabric（多管理员控制），每个 Fabric 有独立的 NOC。

### 4.7 阶段七：ACL 配置

最后，Commissioner 为设备配置访问控制列表（ACL），定义哪些 Controller 可以访问设备的哪些功能：

```
Commissioner                       Commissionee
     |                                    |
     | 1. 写入ACL簇                       |
     |---- ACL Entries ----------------->|
     |    - Entry 1: Commissioner(全部)  |
     |    - Entry 2: 其他Controller(受限)|
     |                                    |
     | 2. 配置完成                        |
     |<=== 设备可正常使用 ===============>|
```

## 五、Matter 配网二维码

Matter 设备上的二维码遵循统一格式，包含配网所需的关键信息：

**二维码内容（TLV 格式）**：
- **Version**：版本号
- **Vendor ID**：厂商 ID（CSA 分配）
- **Product ID**：产品 ID（厂商分配）
- **Setup Passcode**：配网密码（278156 等）
- **Discriminator**：区分标识（12 位，用于 BLE 发现时筛选设备）
- **Discovery Capabilities**：发现能力（BLE / WiFi SoftAP / On-network）

手动配对码（11 位数字）也编码了相同的信息，用于无摄像头设备输入。

## 六、多管理员（Multi-Admin）

Matter 支持一个设备同时被多个生态系统的 Controller 控制：

1. 设备通过 Commissioner A（如 Apple Home）完成配网，加入 Fabric A。
2. 用户在设备上发起「Open Commissioning Window」（开启配网窗口）。
3. Commissioner B（如 Google Home）通过 PASE 搜索发现设备。
4. Commissioner B 验证设备证书，签发 Fabric B 的 NOC。
5. 设备同时属于 Fabric A 和 Fabric B，两个生态可以独立控制。

每个 Fabric 有独立的密钥体系和 ACL，互不干扰。

## 七、Thread 与 WiFi 的选择

| 因素 | Thread | WiFi |
|------|--------|------|
| 功耗 | 极低（电池供电可用） | 高（需常供电） |
| 速率 | 250kbps | 高（11-9600Mbps） |
| Mesh | 支持（设备间中继） | 不支持（需连路由器） |
| 延迟 | 低（局域Mesh） | 低（局域直连） |
| 适用设备 | 传感器、开关、门锁 | 摄像头、智能音箱 |
| 需要额外硬件 | Thread Border Router | 标准 WiFi 路由器 |

Thread 网络需要一个 **Border Router** 连接 Thread 网络和 IP 网络（如 WiFi/以太网）。Apple TV 4K、HomePod mini、Google Nest Hub 等设备内置了 Thread Border Router。

## 八、总结

Matter 配网流程是一个设计精密的多阶段过程，涵盖了设备发现（BLE）、密码认证（PASE/SPAKE2+）、设备身份验证（DAC 证书链）、网络配置（Thread/WiFi）、操作证书签发（NOC/Fabric）和访问控制（ACL）。这套机制在保证安全性的同时提供了良好的用户体验——用户只需扫描二维码即可完成配网。Matter 的多管理员特性更是打破了智能家居生态壁垒，让一个设备可以同时被多个平台控制。
