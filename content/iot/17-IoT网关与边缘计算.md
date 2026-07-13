# 17 · IoT 网关与边缘计算

## 一、概述

IoT 网关是连接 IoT 设备网络与外部网络（如互联网、云平台）的桥梁。随着 IoT 的发展，网关的角色从简单的协议转换器演变为边缘计算节点，承担着本地数据处理、实时决策、设备管理等职责。

IoT 设备通常使用低功耗、低带宽的协议（如 Zigbee、Thread、BLE、LoRa），而云平台使用 IP 协议（如 MQTT、HTTP）。网关在这两种网络之间进行协议转换和数据中继。

## 二、IoT 网关的角色

### 2.1 核心功能

| 功能 | 说明 |
|------|------|
| 协议转换 | 将 Zigbee/Thread/BLE 等协议转换为 IP 协议（MQTT/HTTP） |
| 设备管理 | 子设备的入网、绑定、状态维护、OTA 升级 |
| 数据聚合 | 收集多个子设备的数据，聚合后上报云端 |
| 本地控制 | 在无云端连接时提供本地自动化控制 |
| 边缘计算 | 在本地进行数据过滤、分析、AI 推理 |
| 安全网关 | TLS 终止、设备认证、访问控制 |

### 2.2 网关拓扑

```
┌─────────────────────────────────────────────┐
│                  Cloud Platform              │
│            (MQTT / HTTP / gRPC)              │
└──────────────────┬──────────────────────────┘
                   | Internet (TLS)
                   |
┌──────────────────┴──────────────────────────┐
│              IoT Gateway                      │
│  ┌─────────────────────────────────────────┐ │
│  │  Edge Runtime (本地自动化、规则引擎)      │ │
│  ├─────────────────────────────────────────┤ │
│  │  Protocol Bridges                        │ │
│  │  ┌─────────┬──────────┬─────────┬──────┐│ │
│  │  │ Zigbee  │ Thread   │  BLE    │ LoRa ││ │
│  │  │ Bridge  │ Border   │  Agent  │ Conc.││ │
│  │  │         │ Router   │         │      ││ │
│  │  └─────────┴──────────┴─────────┴──────┘│ │
│  ├─────────────────────────────────────────┤ │
│  │  Device Manager (入网/绑定/OTA/状态)     │ │
│  ├─────────────────────────────────────────┤ │
│  │  Local Storage (缓存/日志/配置)          │ │
│  └─────────────────────────────────────────┘ │
└──────┬───────────┬───────────┬──────────┬───┘
       | Zigbee    | Thread    | BLE      | LoRa
       |           |           |          |
   ┌───┴───┐  ┌───┴───┐  ┌───┴───┐  ┌───┴───┐
   │Sensor1│  │Sensor2│  │Lock 1 │  │Meter 1│
   │Light 1│  │Switch1│  │Beacon │  │Tracker│
   └───────┘  └───────┘  └───────┘  └───────┘
```

## 三、协议转换

### 3.1 Zigbee 网关

Zigbee 网关包含 Zigbee 协调器模块，负责：

- **网络管理**：创建 Zigbee 网络，管理设备入网/离网。
- **ZCL 解析**：解析 Zigbee Cluster Library 的属性和命令。
- **协议映射**：将 ZCL 命令映射为 MQTT Topic 或 HTTP API。
- **设备影子**：维护子设备的最新状态，供云端查询。

```
Zigbee 设备上报温度:
  ZCL Report: Temperature = 23.5°C
  
  网关转换为:
  MQTT Publish: 
    topic: "zigbee/{device_id}/temperature"
    payload: {"value": 23.5, "unit": "C", "timestamp": 1700000000}
```

### 3.2 Thread Border Router

Thread Border Router 连接 Thread 网络和 IP 网络：

- **IP 路由**：在 Thread 网络和外部 IP 网络间路由数据包。
- **前缀通告**：向 Thread 网络通告全局 IPv6 前缀。
- **Commissioner**：作为 Thread 网络的 Commissioner，管理设备入网。
- **DNS 代理**：为 Thread 设备提供 DNS 解析。

### 3.3 BLE 网关

BLE 网关扫描 BLE 设备并转发数据：

- **BLE 扫描**：持续或间歇性扫描 BLE 广播。
- **GATT 连接**：与 BLE 设备建立 GATT 连接读取数据。
- **数据转换**：将 BLE 广播/GATT 数据转换为 IP 协议格式。

```
BLE Beacon 广播:
  iBeacon: UUID=B9407F30, Major=1, Minor=3, RSSI=-65

  网关转换为:
  MQTT Publish:
    topic: "ble/{gateway_id}/beacon"
    payload: {"uuid": "B9407F30", "major": 1, "minor": 3, 
              "rssi": -65, "timestamp": 1700000000}
```

### 3.4 LoRaWAN 网关

LoRaWAN 网关（Concentrator）是透明转发设备：

- **LoRa 收发**：接收 LoRa 信号，解调为数据包。
- **透明转发**：将 LoRa 数据包通过 UDP/Semtech Protocol 发送给 Network Server。
- **下行转发**：将 Network Server 的下行数据通过 LoRa 发送给设备。

## 四、设备管理

### 4.1 设备生命周期

```
入网 → 绑定 → 运行 → 维护 → 退网

入网: 设备通过配网流程加入网关网络
绑定: 设备与用户账号关联
运行: 设备正常上报数据、接收指令
维护: OTA升级、配置更新、故障恢复
退网: 设备从网络移除，清除绑定关系
```

### 4.2 设备影子（Device Shadow）

设备影子是网关维护的设备状态缓存：

```json
{
  "device_id": "DEVICE_001",
  "device_type": "temperature_sensor",
  "model": "TS-100",
  "firmware_version": "1.2.3",
  "online": true,
  "last_seen": "2024-01-01T12:00:00Z",
  "reported": {
    "temperature": 23.5,
    "humidity": 45.0,
    "battery": 87
  },
  "desired": {
    "report_interval": 60
  },
  "metadata": {
    "zigbee_short_addr": "0x1A2B",
    "zigbee_endpoint": 1,
    "install_code": "XXXX"
  }
}
```

当云端查询设备状态时，网关直接返回设备影子，无需实时查询设备。当云端下发指令时，网关更新 desired 状态，并在设备下次上线时同步。

### 4.3 OTA 管理

网关负责子设备的 OTA 升级管理：

- 从云端接收固件包或固件下载 URL。
- 将固件分块下发给子设备（通过 Zigbee/Thread/BLE）。
- 监控升级进度，上报升级结果。
- 支持多设备批量升级。

## 五、边缘计算

### 5.1 边缘计算的价值

| 场景 | 云端方案 | 边缘方案 |
|------|---------|---------|
| 灯光控制 | 设备→云→网关→设备 (200ms+) | 设备→网关→设备 (<50ms) |
| 断网控制 | 无法控制 | 本地自动化正常运行 |
| 数据过滤 | 全量上传 (带宽大) | 只上传异常数据 (省带宽) |
| AI 推理 | 云端推理 (延迟高) | 本地推理 (低延迟) |
| 隐私保护 | 数据上云 | 数据留在本地 |

### 5.2 边缘规则引擎

网关上的规则引擎实现本地自动化：

```
规则示例1: 温度联动
  WHEN temperature_sensor.temp > 30°C
  THEN air_conditioner.power = ON
  AND   air_conditioner.target_temp = 26°C

规则示例2: 安防报警
  WHEN door_sensor.state = OPEN
  AND   time BETWEEN 22:00 AND 06:00
  THEN  alarm.siren = ON
  AND   send_notification(phone, "门在夜间被打开")

规则示例3: 数据过滤
  WHEN temperature_sensor.temp CHANGE > 0.5°C
  THEN  publish_to_cloud(temperature_sensor.temp)
  (温度变化小于0.5°C不上报，节省带宽)
```

### 5.3 边缘 AI 推理

在网关上运行轻量级 AI 模型：

- **语音识别**：本地唤醒词检测（如 "Hey Siri"），减少云端延迟。
- **图像分析**：摄像头视频流在网关上做目标检测，只上报检测结果。
- **异常检测**：对传感器数据做时序异常检测，只在异常时上报。
- **预测性维护**：本地分析设备运行数据，预测故障。

**推理框架**：
- TensorFlow Lite Micro：超轻量，适合 MCU。
- ONNX Runtime：跨平台，支持多种模型格式。
- PyTorch Mobile：移动端 PyTorch 推理。
- NCNN/MNN：腾讯/阿里的移动端推理框架。

### 5.4 边缘存储

网关本地存储用于：
- **离线缓存**：网络断开时缓存设备数据，网络恢复后补传。
- **时序数据**：本地存储近期传感器数据，支持本地查询。
- **日志**：设备运行日志和事件日志。
- **配置**：设备和自动化规则的配置。

## 六、网关硬件架构

### 6.1 典型硬件组成

```
┌──────────────────────────────────────┐
│              IoT Gateway              │
├──────────────────────────────────────┤
│  Main SoC:                            │
│  - CPU: ARM Cortex-A53/A72 (Linux)    │
│    或 ARM Cortex-M4/M7 (RTOS)         │
│  - RAM: 256MB - 2GB                   │
│  - Flash: 4GB - 32GB (eMMC)           │
├──────────────────────────────────────┤
│  Radio Modules:                       │
│  - WiFi: 2.4G/5G (STA + AP)          │
│  - Zigbee: CC2652/CC2531/EFR32       │
│  - Thread/BLE: nRF52840               │
│  - LoRa: SX1276/SX1262                │
│  - Z-Wave: ZGM130S                    │
│  - NFC: PN532                          │
├──────────────────────────────────────┤
│  Interfaces:                          │
│  - Ethernet (RJ45)                    │
│  - USB (扩展模块)                      │
│  - SD Card (存储扩展)                  │
│  - GPIO/UART/I2C (传感器扩展)          │
├──────────────────────────────────────┤
│  Security:                            │
│  - Secure Element (ATECC608A)         │
│  - TPM (可信平台模块)                  │
│  - eFuse (安全启动根密钥)               │
└──────────────────────────────────────┘
```

### 6.2 软件架构

**基于 Linux 的网关**（如 Raspberry Pi、OpenWrt 设备）：
- 运行完整 Linux 系统。
- 各协议模块作为独立进程运行。
- 支持容器化部署（Docker/K3s）。
- 丰富的开源生态：Zigbee2MQTT、Home Assistant、openHAB。

**基于 RTOS 的网关**（如 ESP32、nRF52840）：
- 运行 FreeRTOS/Zephyr。
- 轻量级协议栈。
- 低功耗，适合资源受限场景。
- 功能相对简单，适合简单网关。

## 七、网关高可用

### 7.1 多网关冗余

```
                  Cloud
                   |
          ┌────────┴────────┐
          |                 |
    ┌─────┴─────┐     ┌─────┴─────┐
    │ Gateway A │     │ Gateway B │
    │ (Primary) │     │ (Backup)  │
    └─────┬─────┘     └─────┬─────┘
          |                 |
    ┌─────┴─────────────────┴─────┐
    |        Zigbee/Thread Mesh     |
    |  (设备自动选择最近的网关)      |
    └─────────────────────────────┘
```

- 多个网关覆盖同一区域，互为备份。
- 设备自动连接信号最好的网关。
- 主网关故障时，设备切换到备用网关。
- 网关之间需要同步设备状态和配置。

### 7.2 网关故障恢复

- **本地状态持久化**：网关重启后恢复设备列表和自动化规则。
- **云端状态同步**：网关恢复后从云端同步最新配置。
- **设备重连机制**：子设备检测网关故障后自动重连。

## 八、安全

### 8.1 网关安全职责

- **设备认证**：验证子设备的身份（证书/密钥）。
- **传输加密**：网关与云端之间 TLS 加密，网关与子设备之间协议层加密。
- **访问控制**：限制每个设备的访问范围。
- **安全隔离**：不同协议网络之间逻辑隔离。

### 8.2 网关自身安全

- **安全启动**：网关固件签名验证。
- **TEE/SE**：密钥存储在安全硬件中。
- **防火墙**：限制网络访问范围。
- **日志审计**：记录所有关键操作。

## 九、开源网关项目

| 项目 | 说明 | 协议支持 |
|------|------|---------|
| Home Assistant | 开源智能家居平台 | Zigbee/Z-Wave/BLE/Thread |
| Zigbee2MQTT | Zigbee 转 MQTT 桥接 | Zigbee |
| openHAB | 开源家庭自动化 | 多协议 |
| Apache Pluto | 网关框架 | 可扩展 |
| EdgeX Foundry | 边缘计算框架 | 可扩展 |
| KubeEdge | Kubernetes 边缘扩展 | 容器化 |

## 十、总结

IoT 网关是物联网架构的核心枢纽，承担着协议转换、设备管理、边缘计算和安全网关的多重角色。随着边缘计算的发展，网关从简单的数据中继器演变为智能边缘节点，具备本地决策、AI 推理和离线运行能力。一个好的 IoT 网关设计需要考虑协议兼容性、高可用性、安全性和可扩展性，使其能够适应不断增长的设备数量和业务需求。
