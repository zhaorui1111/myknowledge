# Flutter 原生通信与 Platform Channel 详解

---

## 一、Platform Channel 概述

Flutter 与原生平台的通信通过 Platform Channel 实现，有三种类型：

| 类型 | 通信模式 | 特点 |
|------|---------|------|
| MethodChannel | 方法调用（请求-响应） | 最常用，支持异步方法调用 |
| EventChannel | 事件流（原生→Flutter） | 适合持续事件（传感器、状态变化） |
| BasicMessageChannel | 双向消息传递 | 支持自定义编解码器 |

```
Flutter (Dart)                    Native (Swift/Kotlin)
    │                                     │
    │  MethodChannel.invokeMethod         │
    │ ──────────────────────────────────→ │  执行原生方法
    │                                     │
    │  result                             │
    │ ←────────────────────────────────── │  返回结果
    │                                     │
    │  EventChannel.receiveBroadcastStream│
    │ ←────────────────────────────────── │  持续发送事件
    │                                     │
```

---

## 二、MethodChannel

### 2.1 Dart 侧

```dart
import 'package:flutter/services.dart';

// 创建 MethodChannel
class BLEService {
  static const _channel = MethodChannel('com.myapp/ble');

  // 异步方法调用
  static Future<bool> startScan({int duration = 5000}) async {
    try {
      final result = await _channel.invokeMethod<bool>('startScan', {
        'duration': duration,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      throw BLEException(
        code: e.code,
        message: e.message ?? 'Unknown error',
        details: e.details,
      );
    }
  }

  static Future<Device> connect(String deviceId) async {
    final result = await _channel.invokeMethod<Map>('connect', {
      'deviceId': deviceId,
    });
    return Device.fromMap(result!.cast<String, dynamic>());
  }

  // 同步方法（Flutter 3.7+，仅 Android/iOS）
  static int getConnectionState(String deviceId) {
    // 注意：invokeMethod 不支持同步返回
    // 需要使用 BasicMessageChannel 或 FFI
    throw UnimplementedError('Use async method instead');
  }
}

// 使用
Future<void> main() async {
  final started = await BLEService.startScan(duration: 10000);
  if (started) {
    print('Scanning...');
  }
}
```

### 2.2 iOS 侧（Swift）

```swift
import Flutter
import CoreBluetooth

class BLEPlugin: NSObject, FlutterPlugin, CBCentralManagerDelegate {
    private var centralManager: CBCentralManager!
    private var channel: FlutterMethodChannel!
    
    static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(
            name: "com.myapp/ble",
            binaryMessenger: registrar.messenger()
        )
        let instance = BLEPlugin()
        instance.channel = channel
        registrar.addMethodCallDelegate(instance, channel: channel)
    }
    
    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "startScan":
            let args = call.arguments as? [String: Any]
            let duration = args?["duration"] as? Int ?? 5000
            startScan(duration: duration, result: result)
            
        case "connect":
            let args = call.arguments as? [String: Any]
            let deviceId = args?["deviceId"] as? String
            connect(deviceId: deviceId!, result: result)
            
        case "disconnect":
            disconnect(result: result)
            
        default:
            result(FlutterMethodNotImplemented)
        }
    }
    
    private func startScan(duration: Int, result: @escaping FlutterResult) {
        centralManager = CBCentralManager(delegate: self, queue: nil)
        
        // 延迟停止扫描
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(duration)) {
            self.centralManager.stopScan()
            result(true)
        }
    }
    
    private func connect(deviceId: String, result: @escaping FlutterResult) {
        guard let uuid = UUID(uuidString: deviceId) else {
            result(FlutterError(code: "invalid_id", message: "Invalid device ID", details: nil))
            return
        }
        
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])
        guard let peripheral = peripherals.first else {
            result(FlutterError(code: "not_found", message: "Device not found", details: nil))
            return
        }
        
        peripheral.delegate = self
        centralManager.connect(peripheral)
        
        // 保存 result 回调，在连接成功回调中调用
        pendingConnectResult = result
    }
    
    private var pendingConnectResult: FlutterResult?
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        let device: [String: Any] = [
            "id": peripheral.identifier.uuidString,
            "name": peripheral.name ?? "Unknown",
            "state": "connected"
        ]
        pendingConnectResult?(device)
        pendingConnectResult = nil
    }
    
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        pendingConnectResult?(FlutterError(
            code: "connect_failed",
            message: error?.localizedDescription ?? "Connection failed",
            details: nil
        ))
        pendingConnectResult = nil
    }
}
```

### 2.3 Android 侧（Kotlin）

```kotlin
class BLEPlugin : FlutterPlugin, MethodCallHandler {
    private lateinit var channel: MethodChannel
    private var context: Context? = null
    private var bluetoothAdapter: BluetoothAdapter? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, "com.myapp/ble")
        channel.setMethodCallHandler(this)
        context = binding.applicationContext
        
        val bluetoothManager = context?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
    }

    override fun onMethodCall(call: MethodCall, result: Result) {
        when (call.method) {
            "startScan" -> {
                val duration = call.argument<Int>("duration") ?: 5000
                startScan(duration, result)
            }
            "connect" -> {
                val deviceId = call.argument<String>("deviceId")
                connect(deviceId!!, result)
            }
            else -> result.notImplemented()
        }
    }

    private fun startScan(duration: Int, result: Result) {
        if (bluetoothAdapter == null || !bluetoothAdapter!!.isEnabled) {
            result.error("BLUETOOTH_UNAVAILABLE", "Bluetooth not available", null)
            return
        }
        
        bluetoothAdapter?.bluetoothLeScanner?.startScan(scanCallback)
        
        Handler(Looper.getMainLooper()).postDelayed({
            bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
            result.success(true)
        }, duration.toLong())
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = hashMapOf(
                "id" to result.device.address,
                "name" to (result.device.name ?: "Unknown"),
                "rssi" to result.rssi
            )
            channel.invokeMethod("onDeviceFound", device)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
        context = null
    }
}
```

---

## 三、EventChannel

### 3.1 Dart 侧

```dart
class BLEEventStream {
  static const _channel = EventChannel('com.myapp/ble/events');

  // 接收原生事件流
  static Stream<dynamic> get deviceFoundStream {
    return _channel.receiveBroadcastStream();
  }
}

// 使用
final subscription = BLEEventStream.deviceFoundStream.listen(
  (event) {
    final device = event as Map<dynamic, dynamic>;
    print('Found: ${device['name']}');
  },
  onError: (e) {
    print('Error: $e');
  },
  onDone: () {
    print('Stream closed');
  },
);

// 取消
subscription.cancel();
```

### 3.2 iOS 侧

```swift
class BLEEventStreamHandler: NSObject, FlutterStreamHandler {
    private var eventSink: FlutterEventSink?
    
    func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        eventSink = events
        return nil
    }
    
    func onCancel(withArguments arguments: Any?) -> FlutterError? {
        eventSink = nil
        return nil
    }
    
    // 在发现设备时调用
    func onDeviceFound(_ device: [String: Any]) {
        eventSink?(device)
    }
    
    // 发送错误
    func onError(_ error: Error) {
        eventSink?(FlutterError(code: "scan_error", message: error.localizedDescription, details: nil))
    }
    
    // 结束流
    func onDone() {
        eventSink?(FlutterEndOfEventStream)
    }
}

// 注册
let eventChannel = FlutterEventChannel(
    name: "com.myapp/ble/events",
    binaryMessenger: registrar.messenger()
)
let handler = BLEEventStreamHandler()
eventChannel.setStreamHandler(handler)
```

---

## 四、BasicMessageChannel

用于双向消息传递，支持自定义编解码器：

```dart
// Dart 侧
const channel = BasicMessageChannel<String>(
  'com.myapp/messages',
  StringCodec(),
);

// 发送消息并接收回复
final reply = await channel.send('Hello from Flutter');
print('Reply: $reply');

// 接收原生消息
channel.setMessageHandler((message) async {
  print('Received: $message');
  return 'Acknowledged';
});
```

```swift
// iOS 侧
let channel = FlutterBasicMessageChannel(
    name: "com.myapp/messages",
    binaryMessenger: controller.binaryMessenger,
    codec: FlutterStringCodec.sharedInstance()
)

channel.setMessageHandler { (message, reply) in
    if let msg = message as? String {
        print("Received: \(msg)")
        reply("Hello from iOS")
    }
}
```

---

## 五、Platform View

嵌入原生 View 到 Flutter Widget 树中：

```dart
// Dart 侧
class NativeMapView extends StatelessWidget {
  final double lat;
  final double lng;

  const NativeMapView({super.key, required this.lat, required this.lng});

  @override
  Widget build(BuildContext context) {
    // Android: 使用 AndroidView
    // iOS: 使用 UiKitView
    return PlatformViewLink(
      viewType: 'com.myapp/mapview',
      surfaceFactory: (context, controller) {
        return AndroidViewSurface(
          controller: controller as AndroidViewController,
          gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
          hitTestBehavior: PlatformViewHitTestBehavior.opaque,
        );
      },
      onCreatePlatformView: (params) {
        return PlatformViewSurface(
          controller: params.controller,
          gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
          hitTestBehavior: PlatformViewHitTestBehavior.opaque,
        );
      },
    );
    
    // 或简化版：
    // return UiKitView(
    //   viewType: 'com.myapp/mapview',
    //   creationParams: {'lat': lat, 'lng': lng},
    //   creationParamsCodec: const StandardMessageCodec(),
    // );
  }
}
```

**Platform View 性能注意**：
- Platform View 通过虚拟显示或混合合成嵌入 Flutter
- iOS 使用 Hybrid Composition 模式（Flutter 14+），性能较好
- Android 的 Hybrid Composition 模式有额外合成开销
- 避免在列表中大量使用 Platform View

---

## 六、FFI（dart:ffi）

直接调用 C/C++ 库，无需经过 Platform Channel：

```dart
import 'dart:ffi';
import 'dart:io';

// 1. 加载动态库
final DynamicLibrary lib = Platform.isIOS
    ? DynamicLibrary.process()  // iOS 静态链接
    : DynamicLibrary.open('libnative.so');

// 2. 绑定 C 函数
typedef _NativeAdd = Int32 Function(Int32 a, Int32 b);
typedef _DartAdd = int Function(int a, int b);

final _DartAdd nativeAdd = lib.lookupFunction<_NativeAdd, _DartAdd>('add');

// 3. 使用
void main() {
  print('3 + 4 = ${nativeAdd(3, 4)}');  // 同步调用，无序列化
}

// 4. 复杂结构体
final class DeviceConfig extends Struct {
  @Int32() external int deviceId;
  @Int32() external int batteryLevel;
  @Bool() external bool isOnline;
  
  // 嵌套数组
  @Array(16) external Array<Uint8> macAddress;
}

// 5. 异步调用（Isolate 中执行 FFI）
final result = await Isolate.run(() {
  return nativeAdd(3, 4);  // 在独立 Isolate 中执行
});
```

**FFI vs Platform Channel**：

| 特性 | Platform Channel | FFI |
|------|------------------|-----|
| 调用方式 | 异步 | 同步（可在 Isolate 中异步） |
| 数据序列化 | 需要（StandardMessageCodec） | 不需要（直接内存访问） |
| 性能 | 中等 | 最优（接近原生调用） |
| 适用场景 | 调用平台 API | 调用 C/C++ 库 |
| 跨平台 | 自动适配 | 需要各平台编译库 |

---

## 七、插件开发

### 7.1 创建插件项目

```bash
flutter create --template=plugin --platforms=ios,android my_plugin
```

### 7.2 插件结构

```
my_plugin/
├── lib/
│   └── my_plugin.dart        # Dart API
├── ios/
│   └── Classes/
│       └── MyPlugin.swift     # iOS 实现
├── android/
│   └── src/main/kotlin/
│       └── MyPlugin.kt        # Android 实现
└── pubspec.yaml
```

```yaml
# pubspec.yaml
name: my_plugin
version: 1.0.0

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: '>=3.10.0'

dependencies:
  flutter:
    sdk: flutter

flutter:
  plugin:
    platforms:
      ios:
        pluginClass: MyPlugin
      android:
        package: com.example.my_plugin
        pluginClass: MyPlugin
```

### 7.3 联邦插件（Federated Plugin）

大型插件采用联邦架构，分离平台实现：

```
my_plugin/              # App-facing API（Dart 接口）
├── my_plugin_platform_interface/  # 平台接口定义
└── my_plugin_ios/      # iOS 实现
└── my_plugin_android/  # Android 实现
└── my_plugin_web/      # Web 实现
```

---

## 八、小结

Flutter 的原生通信通过 Platform Channel 实现，MethodChannel 适合方法调用，EventChannel 适合持续事件流，BasicMessageChannel 适合双向消息。FFI 提供了更高性能的 C/C++ 直接调用方式。Platform View 允许嵌入原生 UI 组件但需注意性能影响。插件开发采用联邦架构可以支持多平台独立实现。
