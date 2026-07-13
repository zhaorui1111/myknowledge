# 局域网设备发现与 WiFi 通信实践

## 概述

IoT 设备除了通过 BLE 通信外，很多场景使用 WiFi 接入局域网。WiFi 设备的通信能力更强（带宽高、距离远），但需要解决设备发现、连接建立、数据传输等问题。本文详细讲解局域网设备发现机制（mDNS/Bonjour、UDP 广播）和 WiFi 设备通信实践（Socket、HTTP）。

## 设备发现机制

### 发现方式对比

| 方式 | 协议 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| mDNS/Bonjour | UDP 5353 | 标准协议，iOS 原生支持 | 组播可能被路由器过滤 | 通用设备发现 |
| UDP 广播 | UDP 255.255.255.255 | 简单直接 | 仅限同子网，部分网络禁用广播 | 简单设备发现 |
| UDP 组播 | UDP 224.x.x.x | 跨子网（需配置） | 配置复杂 | 跨网段发现 |
| 扫描指定 IP | TCP | 可靠 | 速度慢，耗费资源 | 最后一道手段 |

### mDNS/Bonjour 服务发现

mDNS（Multicast DNS）是零配置网络的核心协议，Apple 称之为 Bonjour。设备在局域网中广播自己的服务信息，App 通过监听发现设备。

**设备端服务注册**（以 ESP32 为例）：

```cpp
// ESP32 mDNS 注册
#include <ESPmDNS.h>

void setupMDNS() {
    if (!MDNS.begin("smart-light-001")) {
        Serial.println("mDNS 注册失败");
        return;
    }

    // 注册服务: _iot._tcp 端口 8080
    MDNS.addService("iot", "tcp", 8080);

    // 添加 TXT 记录（设备元数据）
    MDNS.addServiceTxt("iot", "tcp", "model", "SL-100");
    MDNS.addServiceTxt("iot", "tcp", "version", "1.2.0");
    MDNS.addServiceTxt("iot", "tcp", "mac", "AA:BB:CC:DD:EE:FF");
    MDNS.addServiceTxt("iot", "tcp", "proto", "json-v1");
}
```

**iOS 端服务发现**：

```swift
import Network

class DeviceDiscoveryManager: NSObject {

    private var browser: NWBrowser?
    private var discoveredDevices: [DiscoveredDevice] = []
    var onDeviceDiscovered: ((DiscoveredDevice) -> Void)?
    var onDeviceLost: ((String) -> Void)?

    func startDiscovery() {
        // 创建 Browser 参数
        let parameters = NWParameters()
        parameters.includePeerToPeer = true

        // 浏览 _iot._tcp 服务
        let descriptor = NWBrowser.Descriptor.bonjour(
            type: "_iot._tcp",
            domain: nil  // nil = 本地域
        )

        browser = NWBrowser(for: descriptor, using: parameters)

        // 设备发现回调
        browser?.browseResultsChangedHandler = { [weak self] results, changes in
            for change in changes {
                switch change {
                case .added(let result):
                    self?.handleDeviceAdded(result)
                case .removed(let result):
                    self?.handleDeviceRemoved(result)
                @unknown default:
                    break
                }
            }
        }

        // 状态更新回调
        browser?.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("mDNS 浏览器就绪")
            case .failed(let error):
                print("mDNS 浏览失败: \(error)")
            default:
                break
            }
        }

        browser?.start(queue: .main)
    }

    func stopDiscovery() {
        browser?.cancel()
        browser = nil
    }

    private func handleDeviceAdded(_ result: NWBrowser.Result) {
        guard case let .service(name, _, _, _) = result.endpoint else { return }

        // 连接设备获取 TXT 记录（详细信息）
        resolveService(result: result) { [weak self] device in
            if let device = device {
                self?.discoveredDevices.append(device)
                self?.onDeviceDiscovered?(device)
            }
        }
    }

    private func handleDeviceRemoved(_ result: NWBrowser.Result) {
        guard case let .service(name, _, _, _) = result.endpoint else { return }
        discoveredDevices.removeAll { $0.name == name }
        onDeviceLost?(name)
    }

    private func resolveService(result: NWBrowser.Result,
                                 completion: @escaping (DiscoveredDevice?) -> Void) {
        // 使用 NetService 解析 TXT 记录和获取 IP
        // NWBrowser 仅提供 endpoint，需要进一步解析

        if case let .service(name, type, domain, interface) = result.endpoint {
            let service = NetService(domain: domain, type: type, name: name)

            // 设置 delegate 并解析
            let resolver = ServiceResolver(service: service) { resolvedService in
                let device = DiscoveredDevice(
                    name: name,
                    hostName: resolvedService.hostName ?? "",
                    ipAddress: resolvedService.addresses?.first?.ipAddress() ?? "",
                    port: resolvedService.port,
                    txtRecord: resolvedService.txtRecordData()
                )
                completion(device)
            }
            resolver.resolve()
        }
    }
}

struct DiscoveredDevice {
    let name: String
    let hostName: String
    let ipAddress: String
    let port: Int32
    let txtRecord: Data?

    // 从 TXT Record 解析元数据
    var metadata: [String: String] {
        guard let txtData = txtRecord else { return [:] }
        let dict = NetService.dictionary(fromTXTRecord: txtData)
        return dict.mapValues { String(data: $0, encoding: .utf8) ?? "" }
    }

    var model: String? { metadata["model"] }
    var version: String? { metadata["version"] }
    var macAddress: String? { metadata["mac"] }
    var protocolVersion: String? { metadata["proto"] }
}

// 扩展：从 sockaddr 提取 IP 地址
extension Data {
    func ipAddress() -> String? {
        return withUnsafeBytes { ptr -> String? in
            guard let sockaddrPtr = ptr.baseAddress?.assumingMemoryBound(to: sockaddr.self) else {
                return nil
            }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                sockaddrPtr,
                socklen_t(count),
                &host,
                socklen_t(host.count),
                nil, 0,
                NI_NUMERICHOST
            )
            return result == 0 ? String(cString: host) : nil
        }
    }
}
```

### UDP 广播发现

当 mDNS 不可用时（部分路由器禁用组播），使用 UDP 广播作为备选发现机制：

```swift
class UDPDiscovery {

    private var listener: NWListener?
    private var connection: NWConnection?
    private let discoveryPort: UInt16 = 8888

    var onDeviceDiscovered: ((DiscoveredDevice) -> Void)?

    // 监听设备广播
    func startListening() {
        do {
            let parameters = NWParameters.udp
            let listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: discoveryPort))

            listener.newConnectionHandler = { [weak self] connection in
                self?.handleIncoming(connection: connection)
            }

            listener.start(queue: .main)
            self.listener = listener
        } catch {
            print("UDP 监听启动失败: \(error)")
        }
    }

    // 主动发送发现广播
    func sendDiscoveryBroadcast() {
        let parameters = NWParameters.udp

        // 创建广播连接
        let endpoint = NWEndpoint.hostPort(
            host: "255.255.255.255",
            port: NWEndpoint.Port(integerLiteral: discoveryPort)
        )

        let connection = NWConnection(to: endpoint, using: parameters)

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // 发送发现请求
                let request = DiscoveryRequest(
                    command: "DISCOVER",
                    appVersion: "1.0.0",
                    timestamp: Int(Date().timeIntervalSince1970)
                )

                let data = try? JSONEncoder().encode(request)
                if let data = data {
                    connection.send(content: data, completion: .contentProcessed { error in
                        if let error = error {
                            print("广播发送失败: \(error)")
                        }
                    })
                }

            default:
                break
            }
        }

        connection.start(queue: .main)
        self.connection = connection
    }

    private func handleIncoming(connection: NWConnection) {
        connection.start(queue: .main)

        connection.receiveMessage { [weak self] data, _, _, error in
            guard let data = data, error == nil else { return }

            // 解析设备响应
            if let response = try? JSONDecoder().decode(DiscoveryResponse.self, from: data) {
                let device = DiscoveredDevice(
                    name: response.deviceName,
                    hostName: response.hostName,
                    ipAddress: response.ipAddress,
                    port: response.port,
                    txtRecord: nil
                )
                self?.onDeviceDiscovered?(device)
            }

            // 继续监听
            self?.handleIncoming(connection: connection)
        }
    }
}

struct DiscoveryRequest: Codable {
    let command: String
    let appVersion: String
    let timestamp: Int
}

struct DiscoveryResponse: Codable {
    let deviceName: String
    let hostName: String
    let ipAddress: String
    let port: Int32
    let model: String
    let firmwareVersion: String
}
```

## WiFi 设备通信

### TCP Socket 通信

```swift
class TCPDeviceConnection {

    private var connection: NWConnection?
    private let host: NWEndpoint.Host
    private let port: NWEndpoint.Port

    // 接收缓冲区（处理粘包）
    private var receiveBuffer = Data()
    private let frameDecoder = FrameDecoder()

    var onConnected: (() -> Void)?
    var onDisconnected: ((Error?) -> Void)?
    var onFrameReceived: ((ProtocolFrame) -> Void)?

    init(ipAddress: String, port: UInt16) {
        self.host = NWEndpoint.Host(ipAddress)
        self.port = NWEndpoint.Port(integerLiteral: port)
    }

    func connect() {
        let parameters = NWParameters.tcp
        connection = NWConnection(to: NWEndpoint.hostPort(host: host, port: port), using: parameters)

        connection?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.onConnected?()
                self?.startReceiving()

            case .failed(let error):
                self?.onDisconnected?(error)

            case .cancelled:
                self?.onDisconnected?(nil)

            default:
                break
            }
        }

        connection?.start(queue: .global(qos: .utility))
    }

    func disconnect() {
        connection?.cancel()
    }

    func sendFrame(_ frame: ProtocolFrame) {
        let data = frame.encode()
        connection?.send(content: data, completion: .contentProcessed { error in
            if let error = error {
                print("发送失败: \(error)")
            }
        })
    }

    private func startReceiving() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }

            if let data = data, !data.isEmpty {
                self.receiveBuffer.append(data)

                // 使用帧解码器处理粘包
                let results = self.frameDecoder.append(self.receiveBuffer)
                for result in results {
                    switch result {
                    case .complete(let frame):
                        self.onFrameReceived?(frame)
                    case .partial:
                        break
                    case .error:
                        // 帧错误，清理缓冲区
                        break
                    }
                }
            }

            if isComplete {
                self.onDisconnected?(error)
                return
            }

            if let error = error {
                self.onDisconnected?(error)
                return
            }

            // 继续接收
            self.startReceiving()
        }
    }
}
```

### HTTP RESTful 通信

对于简单的设备控制，HTTP RESTful API 更直观：

```swift
class HTTPDeviceClient {

    private let baseURL: URL
    private let session: URLSession

    init(ipAddress: String, port: Int = 8080) {
        self.baseURL = URL(string: "http://\(ipAddress):\(port)")!
        self.session = URLSession(configuration: .default)
    }

    // GET 请求 — 获取设备状态
    func getStatus(completion: @escaping (Result<DeviceStatus, Error>) -> Void) {
        let url = baseURL.appendingPathComponent("/api/status")
        let task = session.dataTask(with: url) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let data = data,
                  let status = try? JSONDecoder().decode(DeviceStatus.self, from: data) else {
                completion(.failure(DeviceError.parseFailed))
                return
            }

            completion(.success(status))
        }
        task.resume()
    }

    // POST 请求 — 发送控制命令
    func sendCommand(_ command: DeviceCommand,
                     completion: @escaping (Result<CommandResponse, Error>) -> Void) {
        let url = baseURL.appendingPathComponent("/api/command")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        guard let bodyData = try? JSONEncoder().encode(command) else {
            completion(.failure(DeviceError.encodeFailed))
            return
        }
        request.httpBody = bodyData

        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let data = data,
                  let response = try? JSONDecoder().decode(CommandResponse.self, from: data) else {
                completion(.failure(DeviceError.parseFailed))
                return
            }

            completion(.success(response))
        }
        task.resume()
    }

    // WebSocket — 实时数据推送
    func openWebSocket() -> URLSessionWebSocketTask {
        let wsURL = baseURL.appendingPathComponent("/ws")
        var request = URLRequest(url: wsURL)
        request.setValue("device-token", forHTTPHeaderField: "Authorization")

        let task = session.webSocketTask(with: request)
        task.resume()
        return task
    }
}

struct DeviceStatus: Codable {
    let online: Bool
    let temperature: Double
    let humidity: Double
    let batteryLevel: Int
    let firmwareVersion: String
}

struct DeviceCommand: Codable {
    let command: String
    let parameters: [String: String]
}

struct CommandResponse: Codable {
    let success: Bool
    let message: String?
    let data: [String: String]?
}
```

### WebSocket 实时通信

对于需要实时推送的场景（传感器数据流、设备事件通知），WebSocket 比 HTTP 轮询更高效：

```swift
class DeviceWebSocket {

    private var task: URLSessionWebSocketTask?
    private var isConnected = false
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5

    var onMessage: ((Data) -> Void)?
    var onConnected: (() -> Void)?
    var onDisconnected: ((Error?) -> Void)?

    func connect(url: URL) {
        let session = URLSession(configuration: .default)
        task = session.webSocketTask(with: url)
        task?.resume()
        isConnected = true
        onConnected?()

        startListening()
    }

    private func startListening() {
        task?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .data(let data):
                    self.onMessage?(data)
                case .string(let text):
                    if let data = text.data(using: .utf8) {
                        self.onMessage?(data)
                    }
                @unknown default:
                    break
                }

                // 继续监听
                self.startListening()

            case .failure(let error):
                self.isConnected = false
                self.onDisconnected?(error)
                self.attemptReconnect()
            }
        }
    }

    func send(_ data: Data, completion: @escaping (Error?) -> Void) {
        task?.send(.data(data)) { error in
            completion(error)
        }
    }

    private func attemptReconnect() {
        guard reconnectAttempts < maxReconnectAttempts else { return }

        let delay = min(pow(2.0, Double(reconnectAttempts)), 30.0)
        reconnectAttempts += 1

        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, !self.isConnected else { return }
            // 重新连接...
        }
    }
}
```

## BLE 与 WiFi 通信融合

实际 IoT App 通常同时支持 BLE 和 WiFi 两种连接方式：

```swift
protocol DeviceConnectionProtocol {
    func connect()
    func disconnect()
    func send(_ data: Data)
    var isConnected: Bool { get }
    var connectionType: ConnectionType { get }
}

enum ConnectionType {
    case ble
    case wifi
}

class HybridConnectionManager: DeviceConnectionProtocol {

    private var bleConnection: BLEDeviceConnection?
    private var wifiConnection: TCPDeviceConnection?
    private(set) var connectionType: ConnectionType = .ble

    var isConnected: Bool {
        switch connectionType {
        case .ble: return bleConnection?.isConnected ?? false
        case .wifi: return wifiConnection != nil
        }
    }

    // 优先使用 WiFi（带宽大），BLE 作为备用
    func connect() {
        // 1. 尝试 WiFi 连接
        if let wifiDevice = findWiFiDevice() {
            wifiConnection = TCPDeviceConnection(ipAddress: wifiDevice.ipAddress, port: 8080)
            wifiConnection?.onConnected = { [weak self] in
                self?.connectionType = .wifi
            }
            wifiConnection?.connect()
        }

        // 2. 同时保持 BLE 连接（用于控制和小数据传输）
        if let bleDevice = findBLEDevice() {
            bleConnection = BLEDeviceConnection(peripheral: bleDevice)
            bleConnection?.connect()
        }
    }

    func send(_ data: Data) {
        switch connectionType {
        case .wifi:
            // 大数据走 WiFi
            wifiConnection?.sendFrame(ProtocolFrame(
                cmdID: 0x50,
                seqNum: nextSeqNum(),
                payload: data
            ))
        case .ble:
            // 小数据走 BLE
            bleConnection?.send(data)
        }
    }

    // 智能切换：WiFi 断开时切换到 BLE
    func onWiFiDisconnected() {
        if bleConnection?.isConnected == true {
            connectionType = .ble
        }
    }

    // WiFi 恢复时切换回来
    func onWiFiReconnected() {
        connectionType = .wifi
    }
}
```

## WiFi 配网

设备首次使用时需要配置 WiFi 凭据：

```swift
// SoftAP 配网模式
class SoftAPProvisioning {

    // 1. 设备进入 SoftAP 模式，iPhone 连接设备热点
    // 2. App 通过 HTTP 向设备发送 WiFi 配置

    func configureWiFi(ssid: String, password: String,
                       completion: @escaping (Result<Void, Error>) -> Void) {

        // 连接到设备的 SoftAP (通常 IP 为 192.168.4.1)
        let url = URL(string: "http://192.168.4.1/api/wifi/config")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let config = WiFiConfig(ssid: ssid, password: password)
        request.httpBody = try? JSONEncoder().encode(config)

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 200 {
                completion(.success(()))
            } else {
                completion(.failure(ProvisioningError.configFailed))
            }
        }.resume()
    }
}

struct WiFiConfig: Codable {
    let ssid: String
    let password: String
}
```

## 总结

局域网设备发现主要有 mDNS/Bonjour（标准方案）和 UDP 广播（备选方案）两种方式。WiFi 通信根据场景选择：TCP Socket 适合自定义协议通信，HTTP RESTful 适合简单控制，WebSocket 适合实时数据推送。在实际 IoT App 中，通常同时支持 BLE 和 WiFi 两种连接方式，通过融合管理器实现智能切换——BLE 负责配网和小数据控制，WiFi 负责大数据传输和实时通信。SoftAP 模式是 WiFi 设备配网的主流方案。理解这些机制有助于构建覆盖多种设备类型和通信场景的完整 IoT Companion App。
