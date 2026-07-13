# React Native 原生模块与 Bridge 详解

---

## 一、Native Modules（旧架构）

### 1.1 iOS 原生模块

```objc
// RCTBLEModule.h
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCTBLEModule : RCTEventEmitter <RCTBridgeModule>
@end

// RCTBLEModule.m
#import "RCTBLEModule.h"
#import <CoreBluetooth/CoreBluetooth.h>

@implementation RCTBLEModule {
  CBCentralManager *_centralManager;
  NSMutableArray<CBPeripheral *> *_discoveredPeripherals;
}

// 注册模块名
RCT_EXPORT_MODULE(BLEModule)

// 导出方法
RCT_EXPORT_METHOD(scanForDevices:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_centralManager = [[CBCentralManager alloc]
      initWithDelegate:self
                 queue:nil
               options:@{
                 CBCentralManagerOptionShowPowerAlertKey: @YES
               }];
    resolve(@(YES));
  });
}

RCT_EXPORT_METHOD(connectToDevice:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  // 查找 peripheral
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  NSArray<CBPeripheral *> *peripherals = [self->_centralManager retrievePeripheralsWithIdentifiers:@[uuid]];
  
  if (peripherals.count == 0) {
    reject(@"not_found", @"Device not found", nil);
    return;
  }
  
  CBPeripheral *peripheral = peripherals.firstObject;
  peripheral.delegate = self;
  [self->_centralManager connectPeripheral:peripheral options:nil];
  
  // 保存 resolve/reject 在连接回调中使用
  self.connectResolve = resolve;
  self.connectReject = reject;
}

// 导出常量
- (NSDictionary *)constantsToExport
{
  return @{
    @"STATE_POWERED_OFF": @(CBManagerStatePoweredOff),
    @"STATE_POWERED_ON": @(CBManagerStatePoweredOn),
    @"STATE_RESETTING": @(CBManagerStateResetting),
  };
}

// 事件发送（Native → JS）
- (void)centralManager:(CBCentralManager *)central
  didDiscoverPeripheral:(CBPeripheral *)peripheral
      advertisementData:(NSDictionary *)advertisementData
                   RSSI:(NSNumber *)RSSI
{
  [self sendEventWithName:@"onDeviceDiscovered" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"name": peripheral.name ?: @"Unknown",
    @"rssi": RSSI,
  }];
}

// 支持的事件名
- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onDeviceDiscovered", @"onDeviceConnected", @"onDeviceDisconnected", @"onDataReceived"];
}

@end
```

### 1.2 Android 原生模块

```java
// BLEModule.java
package com.myapp.ble;

import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class BLEModule extends ReactContextBaseJavaModule implements BluetoothAdapter.LeScanCallback {

  private final ReactApplicationContext reactContext;

  public BLEModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "BLEModule";
  }

  @ReactMethod
  public void scanForDevices(ReadableMap options, Promise promise) {
    BluetoothManager bm = (BluetoothManager) reactContext
      .getSystemService(Context.BLUETOOTH_SERVICE);
    BluetoothAdapter adapter = bm.getAdapter();
    
    if (adapter == null || !adapter.isEnabled()) {
      promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth not available");
      return;
    }
    
    adapter.startLeScan(this);
    promise.resolve(true);
  }

  @ReactMethod
  public void connectToDevice(String deviceId, Promise promise) {
    // 连接逻辑...
  }

  // 发送事件到 JS
  private void sendEvent(String eventName, WritableMap params) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(eventName, params);
  }

  @Override
  public void onLeScan(BluetoothDevice device, int rssi, byte[] scanRecord) {
    WritableMap map = Arguments.createMap();
    map.putString("id", device.getAddress());
    map.putString("name", device.getName());
    map.putInt("rssi", rssi);
    sendEvent("onDeviceDiscovered", map);
  }

  // 导出常量
  @Override
  public Map<String, Object> getConstants() {
    Map<String, Object> constants = new HashMap<>();
    constants.put("STATE_OFF", BluetoothAdapter.STATE_OFF);
    constants.put("STATE_ON", BluetoothAdapter.STATE_ON);
    return constants;
  }
}
```

### 1.3 JS 侧调用

```tsx
import { NativeModules, NativeEventEmitter } from 'react-native';

const { BLEModule } = NativeModules;
const bleEmitter = new NativeEventEmitter(BLEModule);

// 调用原生方法
async function startScan() {
  try {
    const result = await BLEModule.scanForDevices({ duration: 5000 });
    console.log('Scan started:', result);
  } catch (err) {
    console.error('Scan failed:', err);
  }
}

// 监听原生事件
useEffect(() => {
  const subscription = bleEmitter.addListener('onDeviceDiscovered', (device) => {
    console.log('Found device:', device.name);
    setDevices(prev => [...prev, device]);
  });

  return () => subscription.remove();
}, []);

// 读取常量
console.log(BLEModule.STATE_POWERED_ON);  // 5
```

---

## 二、TurboModule（新架构）

### 2.1 创建 Spec 文件

```typescript
// src/turbo-modules/BLEModuleSpec.ts
import type { TurboModule, TurboModuleRegistry } from 'react-native';

export interface DeviceInfo {
  id: string;
  name: string;
  rssi: number;
}

export interface Spec extends TurboModule {
  // 异步方法
  scanForDevices(duration: number): Promise<boolean>;
  connectToDevice(deviceId: string): Promise<DeviceInfo>;
  disconnect(deviceId: string): Promise<void>;
  writeData(deviceId: string, data: string): Promise<void>;
  
  // 同步方法（JSI 直调，无需 Promise）
  getConnectionState(deviceId: string): 'disconnected' | 'connecting' | 'connected';
  isBluetoothEnabled(): boolean;
  
  // 事件支持
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  
  // 常量
  readonly getConstants: () => {
    STATE_POWERED_OFF: number;
    STATE_POWERED_ON: number;
  };
}

export default TurboModuleRegistry.getEnforcing<Spec>('BLEModule');
```

### 2.2 iOS TurboModule 实现

```objc
// RCTBLEModule.h
#import "BLEModuleSpec.h"  // CodeGen 生成的头文件

@interface RCTBLEModule : NSObject <NativeBLEModuleSpec>
@end

// RCTBLEModule.mm
#import "RCTBLEModule.h"
#import <CoreBluetooth/CoreBluetooth.h>

@implementation RCTBLEModule {
  CBCentralManager *_centralManager;
}

// TurboModule 注册
RCT_EXPORT_MODULE(BLEModule)

// 实现 Spec 中定义的同步方法
- (BOOL)isBluetoothEnabled {
  return _centralManager.state == CBManagerStatePoweredOn;
}

- (NSString *)getConnectionState:(NSString *)deviceId {
  // 同步返回连接状态
  CBPeripheral *peripheral = [self findPeripheral:deviceId];
  if (!peripheral) return @"disconnected";
  switch (peripheral.state) {
    case CBPeripheralStateConnected: return @"connected";
    case CBPeripheralStateConnecting: return @"connecting";
    default: return @"disconnected";
  }
}

// 异步方法
- (void)scanForDevices:(double)duration
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject {
  [_centralManager scanForPeripheralsWithServices:nil options:nil];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(duration * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    [self->_centralManager stopScan];
    resolve(@(YES));
  });
}

// CodeGen 要求实现的方法
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeBLEModuleSpecJSI>(params);
}

@end
```

### 2.3 JS 侧使用（与旧模块完全一致）

```tsx
import BLEModule from '../src/turbo-modules/BLEModuleSpec';

// 同步调用（JSI 直调，无延迟！）
const isConnected = BLEModule.getConnectionState(deviceId);  // 同步返回
const isEnabled = BLEModule.isBluetoothEnabled();  // 同步返回

// 异步调用
await BLEModule.scanForDevices(5000);
```

---

## 三、原生组件（Fabric）

### 3.1 创建原生组件 Spec

```typescript
// src/turbo-components/MapViewSpec.ts
import type { HostComponent, ViewProps } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface MapViewProps extends ViewProps {
  region?: Readonly<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }>;
  zoomEnabled?: boolean;
  onRegionChange?: (event: {
    nativeEvent: {
      latitude: number;
      longitude: number;
    };
  }) => void;
}

export default codegenNativeComponent<MapViewProps>('RTNMapView');
```

### 3.2 iOS Fabric 组件实现

```objc
// RTNMapView.h
#import <React/RCTViewComponentView.h>
#import "MapViewSpec.h"

@interface RTNMapView : RCTViewComponentView <NativeRTNMapViewSpec>
@property (nonatomic, strong) MKMapView *mapView;
@end

// RTNMapView.mm
#import "RTNMapView.h"

@implementation RTNMapView {
  MKMapView *_mapView;
}

// 注册组件
+ (NSString *)moduleName { return @"RTNMapView"; }

// 新架构使用 Class 来注册组件
+ (void)load {
  [RCTComponentViewFactory currentComponentViewFactory]
    registerComponentViewClass:[self class]];
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _mapView = [[MKMapView alloc] initWithFrame:CGRectZero];
    _mapView.delegate = self;
    self.contentView = _mapView;
  }
  return self;
}

// 实现 Props 设置
- (void)setRegion:(NSDictionary *)region {
  CLLocationCoordinate2D center = {
    [region[@"latitude"] doubleValue],
    [region[@"longitude"] doubleValue]
  };
  MKCoordinateSpan span = {
    [region[@"latitudeDelta"] doubleValue],
    [region[@"longitudeDelta"] doubleValue]
  };
  [_mapView setRegion:MKCoordinateRegionMake(center, span) animated:YES];
}

- (void)setZoomEnabled:(BOOL)enabled {
  _mapView.zoomEnabled = enabled;
}

// 事件处理
- (void)mapView:(MKMapView *)mapView regionDidChangeAnimated:(BOOL)animated {
  // 通过 EventEmitter 发送事件到 JS
  NSDictionary *event = @{
    @"latitude": @(mapView.region.center.latitude),
    @"longitude": @(mapView.region.center.longitude),
  };
  // Fabric 事件系统发送
  [self emitDirectEvent:@"onRegionChange" params:event];
}

@end
```

### 3.3 JS 侧使用

```tsx
import MapView from '../src/turbo-components/MapViewSpec';

function MapScreen() {
  return (
    <MapView
      style={{ flex: 1 }}
      region={{
        latitude: 39.9042,
        longitude: 116.4074,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      zoomEnabled={true}
      onRegionChange={(event) => {
        console.log('Region changed:', event.nativeEvent);
      }}
    />
  );
}
```

---

## 四、Bridge 通信机制深度分析

### 4.1 旧 Bridge 通信流程

```
JS 调用 Native 方法：
  JS: NativeModules.BLEModule.scanForDevices(5000)
   │
   ▼
  1. JS 将方法名和参数序列化为 JSON 字符串
   │
   ▼
  2. 通过 Bridge 队列发送到 Native 线程
   │ (异步，可能延迟 1 帧)
   ▼
  3. Native 反序列化 JSON，查找对应模块和方法
   │
   ▼
  4. 执行原生代码
   │
   ▼
  5. 结果序列化为 JSON，通过 Bridge 返回 JS
   │ (异步，再延迟 1 帧)
   ▼
  6. JS Promise resolve/reject

Native 发送事件到 JS：
  Native: [self sendEventWithName:@"onDeviceDiscovered" body:dict]
   │
   ▼
  1. 序列化 dict 为 JSON
   │
   ▼
  2. 通过 Bridge 队列发送到 JS 线程
   │ (异步)
   ▼
  3. JS EventListener 回调
```

### 4.2 新架构（JSI）通信流程

```
JS 调用 Native 方法（同步）：
  JS: BLEModule.getConnectionState('device-123')
   │
   ▼
  1. JSI 直接调用 C++ 函数（无序列化）
   │
   ▼
  2. C++ 持有 JS 引擎引用，直接执行 ObjC/Java 代码
   │
   ▼
  3. 结果直接返回 JS（同步，无延迟）

通信耗时对比：
  Bridge: ~2-5ms（含序列化 + 线程切换 + 延迟）
  JSI:    ~0.01ms（直接函数调用）
```

---

## 五、第三方原生模块集成

### 5.1 安装与链接

```bash
# RN 0.60+ 自动链接
npm install @react-native-ble-plx

# iOS 需要安装 Pods
cd ios && pod install

# 需要在 Info.plist 添加权限
<key>NSBluetoothAlwaysUsageDescription</key>
<string>App needs Bluetooth to connect to devices</string>
```

### 5.2 常用原生模块

| 模块 | 用途 | 通信方式 |
|------|------|---------|
| `react-native-ble-plx` | BLE 蓝牙通信 | Native Module |
| `@react-native-community/netinfo` | 网络状态 | Native Module |
| `react-native-permissions` | 权限管理 | Native Module |
| `react-native-fs` | 文件系统 | Native Module |
| `react-native-keychain` | 安全存储 | Native Module |
| `react-native-sensors` | 传感器 | Native Module + EventEmitter |
| `react-native-vision-camera` | 相机 | Fabric Component |

---

## 六、小结

原生模块是 RN 与平台原生能力交互的桥梁。新架构（TurboModule + Fabric）通过 JSI 实现了同步直接调用，大幅提升了通信效率。开发原生模块时需要同时实现 iOS 和 Android 两端，通过 Spec 文件保证接口一致性。对于简单的原生能力调用，优先使用社区已有的原生模块，避免重复造轮子。
