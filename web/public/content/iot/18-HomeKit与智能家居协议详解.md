# 18 · HomeKit 与智能家居协议详解

## 一、概述

Apple HomeKit 是 Apple 推出的智能家居框架，允许用户通过 iPhone、iPad、Apple Watch 和 HomePod 控制兼容的智能家居设备。HomeKit 的底层通信协议是 **HAP（HomeKit Accessory Protocol）**，支持 WiFi 和 BLE 两种传输方式。自 iOS 13 起，HomeKit 还支持通过路由器实现的「HomeKit Secure Video」和 Thread 协议。

HomeKit 的核心特点：端到端加密、严格的隐私保护、Siri 语音控制、与 Apple 生态深度集成。Matter 协议发布后，HomeKit 通过 Matter 获得了更广泛的设备兼容性。

## 二、HomeKit 架构

```
┌──────────────────────────────────────────────────┐
│                   Apple Ecosystem                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  iPhone  │  │ HomePod  │  │ Apple TV │        │
│  │ Home App │  │ (Hub)    │  │ (Hub)    │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       |              |              |              │
│       |  iCloud同步  |              |              │
│       └──────────────┴──────────────┘              │
│                      |                             │
└──────────────────────┼─────────────────────────────┘
                       |
          ┌────────────┼────────────┐
          |            |            |
     ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
     │ WiFi    │ │ BLE     │ │ Thread  │
     │ Device  │ │ Device  │ │ Device  │
     └─────────┘ └─────────┘ └─────────┘
```

### 2.1 Home Hub（家庭中枢）

Home Hub 是 HomeKit 网络的核心：
- **远程控制**：用户不在家时，通过 Hub 远程控制设备。
- **自动化**：执行自动化规则（如定时、位置触发）。
- **状态共享**：在用户的多台 Apple 设备间同步状态。
- **Secure Video**：处理摄像头视频流分析。

Home Hub 设备：Apple TV 4K、HomePod、HomePod mini、iPad（iOS 10-16）。

### 2.2 设备角色

| 角色 | 说明 | 示例 |
|------|------|------|
| HAP Accessory | HomeKit 兼容设备 | 灯泡、开关、门锁 |
| Controller | 控制设备的 Apple 设备 | iPhone, iPad |
| Home Hub | 远程访问和自动化的中枢 | Apple TV, HomePod |
| Bridge | 桥接非 HomeKit 设备 | Hue Bridge |
| Router | HomeKit 兼容路由器 | eero, Linksys |

## 三、HAP 协议

### 3.1 HAP 传输层

HAP 支持三种传输方式：

| 传输 | 传输协议 | 适用场景 |
|------|---------|---------|
| HAP over IP | HTTP + TCP (WiFi/Ethernet) | 常供电设备 |
| HAP over BLE | GATT | 电池供电设备 |
| HAP over Matter | Matter 协议 | Matter 兼容设备 |

### 3.2 HAP over IP

HAP over IP 使用标准 HTTP/1.1，每个设备是一个 HTTP 服务器：

```
请求: POST /characteristics
Headers:
  Content-Type: application/hap+json
  Authorization: encrypted-tag
Body (加密):
  {
    "characteristics": [
      {
        "aid": 1,
        "iid": 8,
        "value": true
      }
    ]
  }

响应: 200 OK
  Content-Type: application/hap+json
  Body (加密): {...}
```

所有请求和响应的 body 都使用 **ChaCha20-Poly1305** 加密（配对完成后）。

### 3.3 HAP over BLE

HAP over BLE 使用 GATT 服务：
- Service UUID: `00000040-0000-1000-8000-0026BB765291` (HAP Service)
- 通过 GATT 特征值进行 HAP PDU 传输。
- 支持 Read/Write/Notify 操作。
- BLE 批量读取使用「BTLV」编码格式。

BLE 限制：
- 单次 GATT 操作最大 180 字节（ATT MTU 限制）。
- 大数据需要分片传输。
- 功耗低但带宽受限。

## 四、HomeKit 配对流程

HomeKit 配对是 HAP 安全的核心，使用 **SRP（Secure Remote Password）** 和 Ed25519 签名建立安全会话。

### 4.1 配对阶段

```
iOS设备                        HomeKit设备
  |                               |
  | 阶段1: M1 - Setup Code Exchange
  |--- Pair-Setup (M1) ---------->|
  |    (请求配对)                  |
  |<-- Pair-Setup (M2) -----------|
  |    (SRP salt, public key B)   |
  |                               |
  | 阶段2: M3 - SRP 验证
  |    (iOS用Setup Code计算)      |
  |--- Pair-Setup (M3) ---------->|
  |    (SRP public key A, proof)  |
  |<-- Pair-Setup (M4) -----------|
  |    (SRP proof 验证)            |
  |    → SRP 会话建立              |
  |                               |
  | 阶段3: M5 - 设备信息交换
  |    (通过SRP加密通道)           |
  |--- Pair-Setup (M5) ---------->|
  |    (iOS UUID + Ed25519公钥)   |
  |<-- Pair-Setup (M6) -----------|
  |    (设备UUID + Ed25519公钥    |
  |     + 设备签名)               |
  |                               |
  | 阶段4: M7 - 配对完成确认
  |--- Pair-Setup (M7) ---------->|
  |    (iOS签名确认)               |
  |<-- 确认配对成功 ---------------|
  |                               |
  | 配对完成，后续使用配对会话加密  |
```

### 4.2 Setup Code

Setup Code 是配对的核心密码，格式为 8 位数字：`XXX-XX-XXX`

获取方式：
- **打印贴纸**：印在设备上的 Setup Code（最常见）。
- **NFC**：设备 NFC Tag 中包含 Setup Code（iOS 13+）。
- **二维码**：设备上的二维码包含 Setup Code 和设备信息。
- **App 显示**：设备有屏幕，显示动态 Setup Code。

### 4.3 配对后的安全

配对完成后，双方交换 Ed25519 公钥。后续通信使用 **HKDF-SHA512** 派生的会话密钥，通过 **ChaCha20-Poly1305** 加密：

```
会话建立:
  1. iOS 发起 Pair-Verify 请求
  2. 双方交换临时密钥
  3. 用配对时的长期公钥签名验证身份
  4. 派生会话密钥
  5. 后续 HTTP/BLE 通信全部加密
```

### 4.4 多控制器支持

HomeKit 支持多个控制器（iPhone, iPad, Apple Watch）控制同一设备：
- 首个配对的控制器成为「Owner Controller」。
- Owner 可以邀请其他用户（分享 Home）。
- 被邀请用户获得受限权限（可选的设备访问）。
- 设备可以存储多个 Controller 的公钥。

## 五、HomeKit 数据模型

### 5.1 Accessory（配件）

一个 HomeKit 设备称为 Accessory，包含一个或多个 Service：

```
Accessory (温控器)
├── Service: Thermostat
│   ├── Characteristic: CurrentTemperature (读)
│   ├── Characteristic: TargetTemperature (读写)
│   ├── Characteristic: CurrentHeatingCoolingState (读)
│   └── Characteristic: TargetHeatingCoolingState (读写)
├── Service: Battery
│   ├── Characteristic: BatteryLevel (读)
│   └── Characteristic: StatusLowBattery (读)
└── Service: AccessoryInformation
    ├── Characteristic: Manufacturer (读)
    ├── Characteristic: Model (读)
    └── Characteristic: SerialNumber (读)
```

### 5.2 Service（服务）

Service 是一组相关功能的集合：

| Service Type | UUID | 说明 |
|-------------|------|------|
| AccessoryInformation | 0000003E | 设备信息（必选） |
| Lightbulb | 00000043 | 灯泡 |
| Switch | 00000049 | 开关 |
| Outlet | 00000047 | 插座 |
| Thermostat | 0000004A | 温控器 |
| DoorLock | 00000045 | 门锁 |
| Camera | 00000008 | 摄像头 |
| MotionSensor | 00000085 | 人体传感器 |
| ContactSensor | 00000080 | 门磁传感器 |
| TemperatureSensor | 0000008A | 温度传感器 |
| HumiditySensor | 00000082 | 湿度传感器 |
| Fan | 00000040 | 风扇 |
| GarageDoorOpener | 00000041 | 车库门 |
| WindowCovering | 0000008C | 窗帘 |

### 5.3 Characteristic（特征值）

Characteristic 是具体的数据点，有类型、格式、权限：

| Characteristic | UUID | 格式 | 权限 | 说明 |
|---------------|------|------|------|------|
| On | 00000025 | bool | rw | 开关状态 |
| Brightness | 00000008 | int | rw | 亮度 (0-100) |
| CurrentTemperature | 00000011 | float | r | 当前温度 |
| TargetTemperature | 00000035 | float | rw | 目标温度 |
| Hue | 00000013 | float | rw | 色调 (0-360) |
| Saturation | 0000002F | float | rw | 饱和度 (0-100) |
| LockCurrentState | 0000001D | int | r | 门锁当前状态 |
| LockTargetState | 0000001E | int | rw | 门锁目标状态 |
| MotionDetected | 00000022 | bool | r | 人体检测 |
| ContactSensorState | 00000006 | int | r | 门磁状态 |
| BatteryLevel | 00000068 | int | r | 电池电量 |

### 5.4 Instance ID（实例 ID）

每个 Accessory 有唯一的 Accessory ID（aid），每个 Characteristic 有唯一的 Instance ID（iid）：
- aid 在设备范围内唯一。
- iid 在 Accessory 范围内唯一。
- 访问特征值时用 `{aid, iid}` 组合定位。

## 六、HomeKit 事件通知

### 6.1 IP 设备的事件订阅

HAP over IP 支持事件订阅：
- Controller 发起 `/characteristics` 请求，设置 `ev: true`。
- 设备在特征值变化时通过 HTTP 事件推送通知 Controller。

```
订阅:
POST /characteristics
{
  "characteristics": [
    {"aid": 1, "iid": 11, "ev": true}
  ]
}

事件通知:
EVENT /characteristics
{
  "characteristics": [
    {"aid": 1, "iid": 11, "value": 23.5}
  ]
}
```

### 6.2 BLE 设备的事件通知

BLE 设备使用 GATT Notify 机制：
- Controller 订阅特定特征值的 Notify。
- 设备在值变化时发送 GATT Notification。

## 七、HomeKit 自动化

### 7.1 场景（Scene）

场景是一组设备状态的预设：
```
"回家场景":
  - 玄关灯: On = true, Brightness = 80
  - 客厅灯: On = true, Brightness = 60
  - 空调: TargetTemperature = 24, Mode = Cool
  - 窗帘: Position = 0 (关闭)
```

### 7.2 自动化触发器

| 触发类型 | 说明 | 示例 |
|---------|------|------|
| 时间 | 定时触发 | 每天 7:00 打开窗帘 |
| 位置 | 到达/离开家 | 到家时开灯 |
| 特征值 | 设备状态变化 | 门打开时开灯 |
| 传感器 | 传感器触发 | 检测到运动时录像 |

## 八、HomeKit Secure Video

HomeKit Secure Video 是 Apple 的摄像头安全存储方案：

```
摄像头 → Home Hub → iCloud (加密存储)

特性:
  - 端到端加密 (只有用户设备能解密)
  - 本地分析 (Home Hub 做人脸/宠物/车辆检测)
  - 事件触发录像 (不是24小时连续录像)
  - 免费存储 (不占用 iCloud 存储配额, 需 iCloud+ 订阅)
```

## 九、Matter over HomeKit

iOS 15+ 支持 Matter 协议。Matter 设备可以在 Home App 中使用：

- Matter 设备通过 Matter 配网流程加入网络。
- 配网后设备加入 Apple 的 Fabric。
- Home App 像控制 HomeKit 设备一样控制 Matter 设备。
- Matter 设备与原生 HAP 设备功能相同（Siri、自动化、场景）。

Apple TV 4K 和 HomePod mini 内置 Thread Border Router，支持 Thread 设备直接接入。

## 十、HomeKit 开发

### 10.1 MFi 认证

- HomeKit 设备需要通过 Apple MFi（Made for iPhone）认证。
- MFi 认证需要购买 MFi 芯片（Auth Coprocessor）。
- 芯片中包含 Apple 证书，用于 HAP 协议认证。
- 认证过程严格，需要通过 Apple 的测试。

### 10.2 HomeKit ADK

Apple 提供了 **HomeKit ADK（Accessory Development Kit）**，开源在 GitHub：
- 实现了完整的 HAP 协议栈。
- 支持 IP 和 BLE 传输。
- 包含示例代码和测试工具。
- 但仍需要 MFi 认证才能量产。

### 10.3 HomeKit App 开发

iOS App 使用 `HomeKit` framework：
```swift
import HomeKit

// 获取 Home Manager
let homeManager = HMHomeManager()

// 添加设备
homeManager.homes.first?.addAccessory(accessory) { error in
    // 处理结果
}

// 控制设备
let characteristic = ... // 获取特征值
characteristic.writeValue(24, completionHandler: { error in
    // 写入完成
})
```

## 十一、总结

HomeKit 是 Apple 构建的智能家居生态，其核心优势在于端到端加密的安全性和与 Apple 生态的深度集成。HAP 协议通过 SRP 配对和 Ed25519 签名建立了严格的设备认证机制，所有通信使用 ChaCha20-Poly1305 加密。HomeKit 的数据模型（Accessory-Service-Characteristic）清晰且可扩展。随着 Matter 协议的推广，HomeKit 通过 Matter 获得了更广泛的设备兼容性，同时 Thread Border Router 的集成使得 Thread 设备也能无缝接入 HomeKit 生态。
