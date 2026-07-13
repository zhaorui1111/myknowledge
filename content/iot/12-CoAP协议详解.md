# 12 · CoAP 协议详解

## 一、概述

CoAP（Constrained Application Protocol）是专为资源受限设备设计的 Web 传输协议，由 IETF 在 RFC 7252 中定义。CoAP 可以理解为「轻量版 HTTP」，采用与 HTTP 类似的 RESTful 架构，但运行在 UDP 之上，头部开销极小，适合 IoT 设备使用。

CoAP 的设计目标是在微控制器级别的设备上实现 Web 服务，使 IoT 设备能够像 Web 服务器一样被访问。

## 二、CoAP 与 HTTP 对比

| 特性 | HTTP | CoAP |
|------|------|------|
| 传输层 | TCP | UDP |
| 头部大小 | 大（数百字节） | 小（4 字节固定头部） |
| 方法 | GET/POST/PUT/DELETE | GET/POST/PUT/DELETE |
| 数据格式 | 任意（通常 JSON/XML） | 任意（通常 CBOR/SenML） |
| 可靠性 | TCP 保证 | 应用层重传 |
| 多播 | 不支持 | 支持 |
| 资源发现 | 无标准机制 | CoRE Link Format |
| 加密 | TLS | DTLS |

## 三、协议结构

### 3.1 报文格式

CoAP 报文由头部（Header）+ 选项（Options）+ 负载（Payload）组成：

```
┌─────────────────────────────────────────┐
│              CoAP Message                │
├──────────┬──────────┬──────────┬────────┤
│  Ver(2b) │  T(2b)   │ TKL(4b)  │ Code   │
│          │          │          │ (8b)   │
├──────────┴──────────┴──────────┴────────┤
│           Message ID (16b)              │
├─────────────────────────────────────────┤
│           Token (0-8 bytes)             │
├─────────────────────────────────────────┤
│           Options (variable)            │
├─────────────────────────────────────────┤
│  0xFF (Payload Marker)                  │
├─────────────────────────────────────────┤
│           Payload (variable)            │
└─────────────────────────────────────────┘

Ver: 协议版本 (当前为1)
T: 报文类型 (CON/NON/ACK/RST)
TKL: Token 长度 (0-8)
Code: 方法或响应码
Message ID: 报文标识 (用于匹配请求和响应)
Token: 请求-响应匹配令牌
```

### 3.2 报文类型

| 类型 | 缩写 | 说明 |
|------|------|------|
| Confirmable | CON | 需要确认的报文，可靠传输 |
| Non-confirmable | NON | 不需要确认的报文，不可靠传输 |
| Acknowledgement | ACK | 对 CON 报文的确认 |
| Reset | RST | 拒绝报文（如无法处理） |

### 3.3 请求方法

| 方法 | Code | 语义 |
|------|------|------|
| GET | 0.01 | 获取资源 |
| POST | 0.02 | 创建/处理资源 |
| PUT | 0.03 | 更新资源 |
| DELETE | 0.04 | 删除资源 |
| FETCH | 0.05 | 条件查询（RFC 8132 扩展） |
| PATCH | 0.06 | 部分更新（RFC 8132 扩展） |
| iPATCH | 0.07 | 原子部分更新 |

### 3.4 响应码

CoAP 响应码使用点分十进制表示（类似 HTTP 状态码）：

| 响应码 | 含义 | HTTP 对应 |
|--------|------|----------|
| 2.01 | Created | 201 |
| 2.02 | Deleted | 200 |
| 2.03 | Valid | 304 |
| 2.04 | Changed | 204 |
| 2.05 | Content | 200 |
| 4.00 | Bad Request | 400 |
| 4.01 | Unauthorized | 401 |
| 4.04 | Not Found | 404 |
| 4.05 | Method Not Allowed | 405 |
| 5.00 | Internal Server Error | 500 |
| 5.01 | Not Implemented | 501 |
| 5.03 | Service Unavailable | 503 |

## 四、可靠传输机制

CoAP 运行在 UDP 之上，对于需要可靠传输的报文（CON 类型），使用应用层重传机制：

### 4.1 CON/ACK 机制

```
客户端                              服务端
  |--- CON GET /temperature (id=1) -->|
  |                                    |
  |  (等待 ACK, 超时时间 = ACK_TIMEOUT) |
  |  (通常 2 秒, 带随机抖动)             |
  |                                    |
  |<-- ACK 2.05 Content (id=1) -------|
  |    payload: "23.5"                 |
```

### 4.2 重传参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| ACK_TIMEOUT | 2s | 首次等待 ACK 超时 |
| ACK_RANDOM_FACTOR | 1.5 | 随机抖动因子 |
| MAX_RETRANSMIT | 4 | 最大重传次数 |
| MAX_RETRANSMIT_WAIT | 93s | 最大等待时间 |

重传间隔指数增长：2s → 4s → 8s → 16s → 32s，4 次重传后放弃。

### 4.3 NON 报文

对于不需要可靠传输的报文（如周期性遥测数据），使用 NON 类型，不等待 ACK：

```
客户端                              服务端
  |--- NON POST /temp (id=2) -------->|
  |    payload: "23.5"                 |
  |                                    |
  |  (不等待响应)                      |
```

## 五、请求-响应匹配

CoAP 使用 **Message ID** 和 **Token** 两个机制匹配请求和响应：

### 5.1 Message ID

- 每个报文有 16 位 Message ID。
- ACK/RST 报文通过 Message ID 匹配对应的 CON/NON 报文。
- 用于传输层匹配（确认收到了报文）。

### 5.2 Token

- 请求携带 Token（0-8 字节），响应携带相同的 Token。
- 用于应用层匹配（确认响应对应哪个请求）。
- 一个请求的响应可能通过多个报文传输（如 Observe 通知），都用同一个 Token。

```
客户端                              服务端
  |--- CON GET /temp (id=1, token=0xAB) -->|
  |                                          |
  |<-- ACK 2.05 (id=1, token=0xAB) --------|
  |    payload: "23.5"                       |
  |                                          |
  |  Message ID 匹配: 确认收到 CON           |
  |  Token 匹配: 响应对应请求                 |
```

## 六、选项（Options）

CoAP 选项类似 HTTP 头部，使用编号标识：

| 选项编号 | 名称 | 类型 | 说明 |
|---------|------|------|------|
| 1 | If-Match | 重复 | 条件请求（ETag 匹配） |
| 3 | Uri-Host | 字符串 | 目标主机 |
| 4 | ETag | 重复 | 资源版本标签 |
| 5 | If-None-Match | 空 | 条件请求（资源不存在） |
| 6 | Observe | uint | 订阅资源变化 |
| 7 | Uri-Port | uint | 目标端口 |
| 8 | Location-Path | 字符串 | 创建资源的路径 |
| 11 | Uri-Path | 字符串 | URI 路径段 |
| 12 | Content-Format | uint | 负载格式（如 JSON/CBOR） |
| 15 | Uri-Query | 字符串 | URI 查询参数 |
| 17 | Accept | uint | 期望的响应格式 |
| 23 | Block2 | uint | 响应分块传输 |
| 27 | Block1 | uint | 请求分块传输 |
| 28 | Size2 | uint | 响应总大小 |
| 35 | Proxy-Uri | 字符串 | 代理 URI |

### 6.1 URI 构造

CoAP URI 格式：`coap://host:port/path?query`

```
coap://sensor.local:5683/temperature?unit=celsius

分解为选项:
  Uri-Host: "sensor.local"
  Uri-Port: 5683
  Uri-Path: "temperature"
  Uri-Query: "unit=celsius"
```

### 6.2 Content-Format

| 值 | 格式 |
|----|------|
| 0 | text/plain; charset=utf-8 |
| 40 | application/link-format |
| 41 | application/xml |
| 42 | application/octet-stream |
| 47 | application/exi |
| 50 | application/json |
| 60 | application/cbor |
| 320 | application/senml+json |
| 112 | application/senml+cbor |

## 七、Observe（资源观察）

CoAP 的 Observe 机制允许客户端订阅资源变化，服务端在资源变化时主动推送通知：

```
客户端                              服务端
  |--- GET /temperature               |
  |    Observe: 0 (注册观察)           |
  |    Token: 0xAB                    |
  |---------------------------------->|
  |                                    |
  |<-- 2.05 Content                   |
  |    Observe: 12 (序号)              |
  |    Token: 0xAB                    |
  |    payload: "23.5"                |
  |                                    |
  |  (温度变化)                        |
  |                                    |
  |<-- 2.05 Content (推送)            |
  |    Observe: 13 (序号递增)          |
  |    Token: 0xAB                    |
  |    payload: "24.0"                |
  |                                    |
  |  (再次变化)                        |
  |                                    |
  |<-- 2.05 Content (推送)            |
  |    Observe: 14                    |
  |    Token: 0xAB                    |
  |    payload: "23.8"                |
  |                                    |
  |--- GET /temperature               |
  |    Observe: 1 (取消观察)           |
  |---------------------------------->|
```

Observe 序号用于排序和去重（序号大的覆盖序号小的）。

## 八、Block-wise Transfer（分块传输）

CoAP 报文受 UDP MTU 限制（通常约 1280 字节），大文件需要分块传输：

### 8.1 Block1（请求分块）

用于上传大 payload（如 PUT/POST 大数据）：

```
客户端                              服务端
  |--- PUT /firmware (Block1: 0/0/1024) -->|
  |    payload: [1024 bytes chunk 0]        |
  |<-- 2.31 (Block1: 0/0/1024) ------------|
  |                                          |
  |--- PUT /firmware (Block1: 1/0/1024) -->|
  |    payload: [1024 bytes chunk 1]        |
  |<-- 2.31 (Block1: 1/0/1024) ------------|
  |                                          |
  |--- PUT /firmware (Block1: 2/1/1024) -->|
  |    payload: [512 bytes chunk 2, 最后]    |
  |<-- 2.04 Changed -----------------------|
```

Block 选项格式：`NUM/M/Size`
- NUM：块编号
- M（More）：1=还有后续块，0=最后一块
- Size：块大小（16/32/64/128/256/512/1024 字节）

### 8.2 Block2（响应分块）

用于下载大 payload（如 GET 大资源）：

```
客户端                              服务端
  |--- GET /firmware (Block2: 0/0/1024) -->|
  |<-- 2.05 Content (Block2: 0/1/1024) ----|
  |    payload: [1024 bytes chunk 0]        |
  |                                          |
  |--- GET /firmware (Block2: 1/0/1024) -->|
  |<-- 2.05 Content (Block2: 1/1/1024) ----|
  |    payload: [1024 bytes chunk 1]        |
  |                                          |
  |--- GET /firmware (Block2: 2/0/1024) -->|
  |<-- 2.05 Content (Block2: 2/0/1024) ----|
  |    payload: [512 bytes chunk 2, 最后]    |
```

## 九、资源发现

CoAP 使用 **CoRE Link Format**（RFC 6690）进行资源发现：

```
GET /.well-known/core

响应 (Content-Format: application/link-format):
  </temperature>;rt="temperature";if="sensor",
  </humidity>;rt="humidity";if="sensor",
  </light>;rt="light";if="actuator";title="Light Control"
```

Link Format 属性：
- `rt`：资源类型（Resource Type）
- `if`：接口描述（Interface Description）
- `title`：人类可读名称
- `ct`：Content-Format
- `sz`：资源最大大小

## 十、安全：DTLS

CoAP 使用 **DTLS（Datagram Transport Layer Security）** 提供安全保证。DTLS 是 TLS 的 UDP 版本。

### 10.1 DTLS 模式

| 模式 | 安全级别 | 说明 |
|------|---------|------|
| NoSec | 无安全 | 明文传输 |
| PreSharedKey | 中 | 预共享密钥（PSK） |
| RawPublicKey | 高 | 原始公钥（无 CA） |
| Certificate | 最高 | X.509 证书 |

### 10.2 PSK 模式

```
客户端                              服务端
  |--- ClientHello (PSK ID) -------->|
  |<-- HelloVerifyRequest -----------|
  |--- ClientHello (with cookie) --->|
  |<-- ServerHello ------------------|
  |    ServerKeyExchange (PSK hint)  |
  |--- ClientKeyExchange (PSK ID) -->|
  |    (双方用PSK派生密钥)             |
  |<== DTLS 加密通道 ===============>|
```

### 10.3 DTLS 开销

DTLS 握手比 TLS 更重（需要处理 UDP 丢包），对于资源极度受限的设备可能过于昂贵。为此，IETF 正在推进 **EDHOC**（RFC 9528）轻量级密钥交换协议，大幅减少握手开销。

## 十一、CoAP 代理

CoAP 支持 HTTP-CoAP 代理，实现 Web 浏览器访问 CoAP 设备：

```
浏览器 (HTTP)              代理              CoAP 设备
  |--- HTTP GET /temp ---->|--- CoAP GET /temp --->|
  |                        |<-- CoAP 2.05 "23.5" --|
  |<-- HTTP 200 "23.5" ----|
```

这使得 CoAP 设备可以通过标准 HTTP 客户端访问，降低了 IoT 设备的集成门槛。

## 十二、总结

CoAP 是为资源受限设备设计的 RESTful 协议，在保持与 HTTP 相似语义的同时大幅降低了开销。其 CON/NON 报文类型平衡了可靠性和效率，Observe 机制实现了高效的推送通知，Block-wise Transfer 解决了大文件传输问题。CoAP 通常与 DTLS 配合提供安全通信，在 LwM2M 等 IoT 设备管理协议中被广泛使用。
