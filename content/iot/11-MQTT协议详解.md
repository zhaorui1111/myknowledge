# 11 · MQTT 协议详解

## 一、概述

MQTT（Message Queuing Telemetry Transport）是一种轻量级的发布/订阅消息协议，由 IBM 于 1999 年设计，最初用于石油管道传感器与卫星之间的通信。2014 年成为 OASIS 标准，当前最新版本为 MQTT 5.0（2018 年）。

MQTT 是 IoT 领域最广泛使用的应用层通信协议。其设计理念是：最小化网络带宽和设备资源需求，同时保证可靠性和一定程度的服务质量。

## 二、核心概念

### 2.1 发布/订阅模型

MQTT 采用发布/订阅（Pub/Sub）模式，解耦消息的生产者和消费者：

```
┌──────────┐     publish     ┌──────────┐     subscribe     ┌──────────┐
│ Publisher │ ──────────────> │  Broker  │ <──────────────── │ Subscriber│
└──────────┘                 └──────────┘                   └──────────┘

Publisher 不需要知道 Subscriber 是谁
Subscriber 不需要知道 Publisher 是谁
Broker 负责消息路由
```

### 2.2 Topic（主题）

Topic 是消息的路由键，使用层级结构，以 `/` 分隔：

```
home/livingroom/temperature
home/livingroom/humidity
home/bedroom/temperature
office/floor1/meetingroom/temperature
```

**通配符**：
- `+`：单层匹配。`home/+/temperature` 匹配 `home/livingroom/temperature` 和 `home/bedroom/temperature`，但不匹配 `home/livingroom/sensor1/temperature`。
- `#`：多层匹配（只能放在末尾）。`home/#` 匹配 `home/` 下所有层级。
- `$`：以 `$` 开头的 Topic 是系统 Topic（如 `$SYS/broker/clients/connected`），通配符不匹配。

### 2.3 QoS（服务质量）

MQTT 定义了三个 QoS 级别：

| QoS | 名称 | 保证 | 开销 |
|-----|------|------|------|
| 0 | At most once | 最多一次，不保证到达 | 最低 |
| 1 | At least once | 至少一次，可能重复 | 中等 |
| 2 | Exactly once | 恰好一次，不重复 | 最高 |

**QoS 0 — At most once**：
```
Publisher → PUBLISH → Broker
（不等确认，Fire and Forget）
```

**QoS 1 — At least once**：
```
Publisher                Broker
  |--- PUBLISH (id=1) --->|
  |                        |  (转发给Subscriber)
  |<-- PUBACK (id=1) -----|
  |                        |
  | (未收到PUBACK则重发)    |
```

**QoS 2 — Exactly once**：
```
Publisher                Broker
  |--- PUBLISH (id=1) --->|
  |<-- PUBREC (id=1) -----|
  |--- PUBREL (id=1) --->|
  |<-- PUBCOMP (id=1) ----|
  
  四步握手确保消息既不丢失也不重复
```

QoS 2 虽然最可靠，但四步握手的开销大。IoT 场景中，遥测数据通常用 QoS 0 或 1，控制指令用 QoS 1 或 2。

### 2.4 Retained Message（保留消息）

Broker 可以为每个 Topic 保留最后一条消息。新订阅者连接时会立即收到保留消息，而不需要等待下一次发布。

适用于状态类数据：设备在线状态、当前温度等。设备上线后订阅 Topic，立即获得最新状态。

### 2.5 Last Will and Testament（遗嘱）

客户端连接时可以声明一个「遗嘱消息」。如果客户端异常断开（非正常 DISCONNECT），Broker 自动发布遗嘱消息。

```
设备连接时:
  CONNECT {
    will_topic: "device/sensor01/status",
    will_message: "offline",
    will_qos: 1,
    will_retain: true
  }

设备正常断开:
  DISCONNECT → Broker 不发送遗嘱

设备异常断开 (网络断开、崩溃):
  Broker 自动发布: 
    topic = "device/sensor01/status"
    message = "offline"
    retain = true
```

## 三、连接流程

### 3.1 CONNECT

客户端发起连接：

```
CONNECT 报文:
  Protocol Name: "MQTT" (MQTT 3.1.1) / "MQTT" (MQTT 5.0)
  Protocol Level: 4 (3.1.1) / 5 (5.0)
  Connect Flags:
    Clean Session: true/false
    Will Flag: true/false
    Will QoS: 0/1/2
    Will Retain: true/false
    Username Flag: true/false
    Password Flag: true/false
  Keep Alive: 60 (秒)
  Client ID: "client-001"
  Will Topic: "device/sensor01/status"
  Will Message: "offline"
  Username: "user"
  Password: "pass"
```

**Clean Session**：
- `true`：Broker 不保存会话状态，断开后清除订阅和未投递消息。
- `false`：Broker 保存会话状态，重连后恢复订阅并投递离线消息。

**Keep Alive**：
- 客户端承诺在 Keep Alive 秒数内发送至少一个报文。
- 如果没有数据要发送，客户端发送 PINGREQ。
- Broker 在 1.5 倍 Keep Alive 时间未收到任何报文，则认为客户端离线。

### 3.2 CONNACK

Broker 响应连接：

```
CONNACK 报文:
  Session Present: 0/1 (是否恢复了之前的会话)
  Return Code:
    0x00 - 接受连接
    0x01 - 协议版本不支持
    0x02 - Client ID 不合法
    0x03 - 服务不可用
    0x04 - 用户名/密码错误
    0x05 - 未授权
```

### 3.3 PUBLISH / SUBSCRIBE / UNSUBSCRIBE

```
客户端                              Broker
  |--- CONNECT --------------------->|
  |<-- CONNACK ----------------------|
  |                                  |
  |--- SUBSCRIBE (topic, qos) ------>|
  |<-- SUBACK -----------------------|
  |                                  |
  |--- PUBLISH (topic, data, qos) -->|
  |<-- PUBACK (qos=1) --------------|
  |                                  |
  |<-- PUBLISH (订阅的消息) ----------|  (其他客户端发布的消息)
  |--- PUBACK ---------------------->|
  |                                  |
  |--- PINGREQ (心跳) -------------->|
  |<-- PINGRESP ---------------------|
  |                                  |
  |--- DISCONNECT ----------------->|
```

## 四、报文格式

MQTT 报文由固定头部（Fixed Header）+ 可变头部（Variable Header）+ 负载（Payload）组成。

### 4.1 固定头部

```
┌───────────────┬───────────────┐
│  Packet Type  │    Remaining  │
│  + Flags      │    Length     │
│   (1 byte)    │   (1-4 bytes) │
└───────────────┴───────────────┘

Packet Type (4 bits):
  1 = CONNECT
  2 = CONNACK
  3 = PUBLISH
  4 = PUBACK
  5 = PUBREC
  6 = PUBREL
  7 = PUBCOMP
  8 = SUBSCRIBE
  9 = SUBACK
  10 = UNSUBSCRIBE
  11 = UNSUBACK
  12 = PINGREQ
  13 = PINGRESP
  14 = DISCONNECT
  15 = AUTH (MQTT 5.0)

Remaining Length 使用变长编码 (1-4 bytes):
  每字节低7位为数据，最高位为继续标志
  最大表示 256MB
```

### 4.2 PUBLISH 报文示例

```
PUBLISH (QoS 1):
┌─────────────────────────────────────────┐
│ Fixed Header:                           │
│   Type=3, DUP=0, QoS=1, RETAIN=0       │
│   Remaining Length=20                    │
├─────────────────────────────────────────┤
│ Variable Header:                        │
│   Topic Length=15                        │
│   Topic="home/livingroom/temp"          │
│   Packet Identifier=42                  │
├─────────────────────────────────────────┤
│ Payload:                                │
│   "23.5°C"                              │
└─────────────────────────────────────────┘
```

## 五、MQTT 5.0 新特性

MQTT 5.0 相比 3.1.1 引入了多项重要改进：

### 5.1 原因码（Reason Code）

所有 ACK 报文都包含原因码，提供更详细的反馈：

```
CONNACK Reason Code:
  0x00 - 成功
  0x80 - 连接错误（未指定原因）
  0x84 - 协议版本不支持
  0x86 - Client ID 不合法
  0x87 - 服务器繁忙
  0x8A - 认证失败
  
DISCONNECT Reason Code:
  0x00 - 正常断开
  0x04 - 包含遗嘱消息
  0x80 - 连接错误
  0x97 - 配额超限
```

### 5.2 用户属性（User Properties）

类似 HTTP Header 的键值对，可附加在任何报文中：

```
PUBLISH {
  topic: "sensors/temp",
  payload: "23.5",
  user_properties: {
    "location": "livingroom",
    "device_model": "DHT22",
    "firmware": "1.2.3"
  }
}
```

### 5.3 共享订阅（Shared Subscriptions）

多个订阅者共享同一订阅，Broker 轮询分发消息：

```
Subscribe: $share/group1/sensors/temperature

  Producer → Broker → [Sub A, Sub B, Sub C] (轮询分发)
  
  消息1 → Sub A
  消息2 → Sub B
  消息3 → Sub C
  消息4 → Sub A
```

用于负载均衡场景，多个消费者共同处理消息。

### 5.4 消息过期

```
PUBLISH {
  topic: "commands/light",
  payload: "on",
  message_expiry_interval: 30  // 30秒后过期
}
```

如果设备离线超过 30 秒，消息不会投递给重连后的设备。

### 5.5 Topic Alias

用整数别名替代长 Topic 名，减少报文大小：

```
第一帧:
  PUBLISH {
    topic: "home/livingroom/temperature/sensor1",
    topic_alias: 1,
    payload: "23.5"
  }

后续帧:
  PUBLISH {
    topic: "",  // 空
    topic_alias: 1,
    payload: "23.6"
  }
```

## 六、安全

### 6.1 TLS 加密

MQTT 运行在 TCP 之上，可以使用 TLS 加密：

- 标准端口：1883（明文）/ 8883（TLS）
- IoT 设备通常使用 TLS 1.2 或 1.3
- 双向认证（mTLS）：设备出示客户端证书，Broker 出示服务器证书

### 6.2 认证方式

| 方式 | 说明 | 安全性 |
|------|------|--------|
| 用户名/密码 | 明文（需 TLS 保护） | 中 |
| 客户端证书 | TLS 双向认证 | 高 |
| OAuth 2.0 | JWT Token 认证（MQTT 5.0） | 高 |
| Enhanced Auth | SASL-style 认证（MQTT 5.0） | 高 |

### 6.3 ACL（访问控制）

Broker 可以配置 ACL，限制客户端可以发布/订阅的 Topic：

```
ACL 规则示例:
  client "sensor01":
    publish: "sensors/sensor01/#"
    subscribe: "commands/sensor01/#"
    
  client "app_user":
    subscribe: "sensors/#"
    publish: "commands/#"
```

## 七、MQTT-SN（Sensor Networks）

MQTT-SN 是 MQTT 的变种，专为非 IP 网络（如 Zigbee、LoRa）设计：

- 使用 Topic ID（短整数）替代 Topic Name（字符串），减少开销。
- 支持无连接模式（UDP）。
- 支持 Topic 预定义（设备出厂时分配 Topic ID）。
- 需要一个 MQTT-SN Gateway 转发到标准 MQTT Broker。

## 八、IoT 场景最佳实践

### 8.1 Topic 设计

```
遥测数据上传:
  {product_id}/{device_id}/telemetry/{metric}

  示例: "prod001/DEVICE_001/telemetry/temperature"

命令下发:
  {product_id}/{device_id}/command/{cmd_type}

  示例: "prod001/DEVICE_001/command/set_brightness"

设备状态:
  {product_id}/{device_id}/status
  (Retained Message, "online"/"offline")

设备上线/下线:
  使用 Last Will 机制自动通知
```

### 8.2 QoS 选择

- 遥测数据：QoS 0（高频数据，丢一两条无所谓）或 QoS 1（需要可靠传输）
- 控制指令：QoS 1（确保到达，可能重复，应用层去重）
- 关键操作（如 OTA 升级指令）：QoS 2（确保恰好一次）

### 8.3 心跳与保活

- Keep Alive 设为 60-120 秒（平衡功耗和及时检测断线）。
- 设备定期发送遥测数据，可替代 PINGREQ。
- Broker 在 1.5 倍 Keep Alive 未收到消息时发布遗嘱消息。

### 8.4 连接管理

- 使用 Clean Session = false（持久会话），断线重连后恢复订阅。
- Client ID 使用设备唯一标识（如 MAC 或 SN），避免冲突。
- 实现自动重连机制，指数退避重连策略。

## 九、主流 MQTT Broker

| Broker | 特点 |
|--------|------|
| Mosquitto | 开源，轻量，C 语言，适合边缘部署 |
| EMQX | 开源/商业，Erlang，高并发，企业级 |
| HiveMQ | 商业，Java，企业级，MQTT 5.0 |
| AWS IoT Core | 云服务，支持 MQTT 5.0，与 AWS 生态集成 |
| Azure IoT Hub | 云服务，支持 MQTT，与 Azure 生态集成 |

## 十、总结

MQTT 凭借其轻量级设计、灵活的发布/订阅模型和三个 QoS 级别，成为 IoT 领域最广泛使用的应用层协议。MQTT 5.0 的原因码、共享订阅、消息过期等特性进一步增强了其在企业级 IoT 场景中的适用性。在设计 IoT 系统时，合理的 Topic 结构和 QoS 策略是确保系统可靠性和可扩展性的关键。
