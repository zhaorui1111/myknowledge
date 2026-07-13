# Flutter 状态管理详解

---

## 一、setState 与 InheritedWidget

### 1.1 setState 的局限

```dart
// setState 只能在当前 Widget 树内传递状态
// 跨组件传递需要逐层构造函数传参（prop drilling）

// ❌ 逐层传递
class GrandParent extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Parent(themeColor: Colors.blue);
  }
}

class Parent extends StatelessWidget {
  final Color themeColor;
  const Parent({required this.themeColor});
  
  @override
  Widget build(BuildContext context) {
    return Child(themeColor: themeColor);
  }
}

class Child extends StatelessWidget {
  final Color themeColor;
  const Child({required this.themeColor});
  
  @override
  Widget build(BuildContext context) {
    return Container(color: themeColor);
  }
}
```

### 1.2 InheritedWidget

```dart
// 1. 创建 InheritedWidget
class ThemeInherited extends InheritedWidget {
  final Color themeColor;
  final VoidCallback onToggle;

  const ThemeInherited({
    super.key,
    required this.themeColor,
    required this.onToggle,
    required super.child,
  });

  // 依赖变化时是否通知子组件重建
  @override
  bool updateShouldNotify(ThemeInherited oldWidget) {
    return themeColor != oldWidget.themeColor;
  }

  // 获取最近的 ThemeInherited
  static ThemeInherited of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ThemeInherited>()!;
  }
}

// 2. Provider Widget
class ThemeProvider extends StatefulWidget {
  final Widget child;
  const ThemeProvider({super.key, required this.child});

  @override
  State<ThemeProvider> createState() => _ThemeProviderState();
}

class _ThemeProviderState extends State<ThemeProvider> {
  Color _themeColor = Colors.blue;

  void _toggle() {
    setState(() {
      _themeColor = _themeColor == Colors.blue ? Colors.red : Colors.blue;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ThemeInherited(
      themeColor: _themeColor,
      onToggle: _toggle,
      child: widget.child,
    );
  }
}

// 3. 子组件使用
class ThemedButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = ThemeInherited.of(context);
    return ElevatedButton(
      style: ElevatedButton.styleFrom(backgroundColor: theme.themeColor),
      onPressed: theme.onToggle,
      child: const Text('Toggle Theme'),
    );
  }
}
```

---

## 二、Provider

Provider 是 Flutter 官方推荐的状态管理方案，基于 InheritedWidget 封装，更易用。

### 2.1 ChangeNotifier + Provider

```dart
// 1. 创建 Model
class DeviceModel extends ChangeNotifier {
  List<Device> _devices = [];
  Device? _selected;
  bool _loading = false;

  List<Device> get devices => _devices;
  Device? get selected => _selected;
  bool get loading => _loading;

  Future<void> loadDevices() async {
    _loading = true;
    notifyListeners();

    _devices = await DeviceService.getAll();
    _loading = false;
    notifyListeners();
  }

  void selectDevice(Device device) {
    _selected = device;
    notifyListeners();
  }

  void addDevice(Device device) {
    _devices.add(device);
    notifyListeners();
  }
}

// 2. 注册 Provider
void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => DeviceModel()),
        ChangeNotifierProvider(create: (_) => ThemeModel()),
      ],
      child: const MyApp(),
    ),
  );
}

// 3. 使用
class DeviceListPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Consumer：只在 model 变化时重建
    return Consumer<DeviceModel>(
      builder: (context, model, child) {
        if (model.loading) {
          return const CircularProgressIndicator();
        }
        return ListView.builder(
          itemCount: model.devices.length,
          itemBuilder: (context, index) {
            final device = model.devices[index];
            return ListTile(
              title: Text(device.name),
              onTap: () => model.selectDevice(device),
            );
          },
        );
      },
    );
  }
}

// Selector：精确控制重建条件
class SelectedDeviceName extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Selector<DeviceModel, String?>(
      selector: (_, model) => model.selected?.name,
      builder: (context, name, child) {
        return Text(name ?? 'No device selected');
      },
    );
  }
}

// context.read vs context.watch
class DeviceActions extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      // read：不监听变化，只获取一次（用于事件处理）
      onPressed: () => context.read<DeviceModel>().loadDevices(),
      child: const Text('Refresh'),
    );
  }
}

// watch：监听变化（等同于 Consumer，触发重建）
// final model = context.watch<DeviceModel>();
```

### 2.2 Provider 优化技巧

```dart
// 1. Consumer 的 child 参数：不依赖 model 的部分提到 child 中
Consumer<DeviceModel>(
  builder: (context, model, child) {
    return Column(
      children: [
        child!,  // 不重建
        Text('${model.devices.length} devices'),  // 重建
      ],
    );
  },
  child: const Icon(Icons.devices),  // 不依赖 model，不重建
)

// 2. MultiProvider 组合
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => DeviceModel()),
    Provider(create: (_) => DeviceService()),  // 不需要通知的服务
    FutureProvider(create: (_) => fetchConfig(), initialData: null),
    StreamProvider(create: (_) => bleScanner.stream, initialData: null),
  ],
  child: MyApp(),
)
```

---

## 三、Riverpod

Riverpod 是 Provider 的改进版，解决了 Provider 的编译时安全问题和上下文依赖问题。

### 3.1 基本用法

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

// 1. 定义 Provider
final deviceProvider = StateNotifierProvider<DeviceNotifier, DeviceState>((ref) {
  return DeviceNotifier(ref);
});

class DeviceState {
  final List<Device> devices;
  final bool loading;
  final String? error;

  DeviceState({this.devices = const [], this.loading = false, this.error});

  DeviceState copyWith({List<Device>? devices, bool? loading, String? error}) {
    return DeviceState(
      devices: devices ?? this.devices,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

class DeviceNotifier extends StateNotifier<DeviceState> {
  final Ref ref;
  
  DeviceNotifier(this.ref) : super(DeviceState()) {
    loadDevices();
  }

  Future<void> loadDevices() async {
    state = state.copyWith(loading: true, error: null);
    try {
      final service = ref.read(deviceServiceProvider);
      final devices = await service.getAll();
      state = state.copyWith(devices: devices, loading: false);
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  void selectDevice(Device device) {
    // 可以组合其他 provider
    ref.read(selectedDeviceProvider.notifier).state = device;
  }
}

// 2. 使用 Provider
class DeviceListPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(deviceProvider);

    if (state.loading) return const CircularProgressIndicator();
    if (state.error != null) return Text('Error: ${state.error}');

    return ListView.builder(
      itemCount: state.devices.length,
      itemBuilder: (context, index) {
        final device = state.devices[index];
        return ListTile(
          title: Text(device.name),
          onTap: () => ref.read(deviceProvider.notifier).selectDevice(device),
        );
      },
    );
  }
}

// 3. runApp
void main() {
  runApp(const ProviderScope(child: MyApp()));
}
```

### 3.2 Provider 类型

```dart
// Provider：只读值
final configProvider = Provider<Config>((ref) {
  return Config.fromJson(defaultConfig);
});

// StateProvider：简单状态
final selectedIndexProvider = StateProvider<int>((ref) => 0);

// FutureProvider：异步数据
final devicesFutureProvider = FutureProvider<List<Device>>((ref) async {
  return await DeviceService.getAll();
});

// StreamProvider：流数据
final scanResultProvider = StreamProvider<Device>((ref) {
  return BLEScanner.scanStream;
});

// StateNotifierProvider：复杂状态逻辑
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

// AsyncNotifierProvider（Riverpod 2.0+）
final devicesProvider = AsyncNotifierProvider<DevicesNotifier, List<Device>>(() {
  return DevicesNotifier();
});

class DevicesNotifier extends AsyncNotifier<List<Device>> {
  @override
  Future<List<Device>> build() async {
    return await DeviceService.getAll();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => DeviceService.getAll());
  }
}
```

---

## 四、Bloc

Bloc（Business Logic Component）使用事件驱动模式，状态变化通过事件触发。

### 4.1 Cubit（简化版 Bloc）

```dart
// 1. 定义状态
sealed class DeviceState {}
class DeviceInitial extends DeviceState {}
class DeviceLoading extends DeviceState {}
class DeviceLoaded extends DeviceState {
  final List<Device> devices;
  DeviceLoaded(this.devices);
}
class DeviceError extends DeviceState {
  final String message;
  DeviceError(this.message);
}

// 2. 定义 Cubit
class DeviceCubit extends Cubit<DeviceState> {
  final DeviceService service;

  DeviceCubit(this.service) : super(DeviceInitial());

  Future<void> loadDevices() async {
    emit(DeviceLoading());
    try {
      final devices = await service.getAll();
      emit(DeviceLoaded(devices));
    } catch (e) {
      emit(DeviceError(e.toString()));
    }
  }

  void selectDevice(Device device) {
    // ...
  }
}

// 3. 使用
class DeviceListPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => DeviceCubit(DeviceService())..loadDevices(),
      child: BlocBuilder<DeviceCubit, DeviceState>(
        builder: (context, state) {
          if (state is DeviceLoading) return CircularProgressIndicator();
          if (state is DeviceError) return Text(state.message);
          if (state is DeviceLoaded) {
            return ListView.builder(
              itemCount: state.devices.length,
              itemBuilder: (context, index) => 
                ListTile(title: Text(state.devices[index].name)),
            );
          }
          return const SizedBox();
        },
      ),
    );
  }
}
```

### 4.2 完整 Bloc（事件驱动）

```dart
// 1. 事件
sealed class DeviceEvent {}
class LoadDevices extends DeviceEvent {}
class SelectDevice extends DeviceEvent {
  final Device device;
  SelectDevice(this.device);
}
class DeleteDevice extends DeviceEvent {
  final String deviceId;
  DeleteDevice(this.deviceId);
}

// 2. Bloc
class DeviceBloc extends Bloc<DeviceEvent, DeviceState> {
  final DeviceService service;

  DeviceBloc(this.service) : super(DeviceInitial()) {
    on<LoadDevices>(_onLoadDevices);
    on<SelectDevice>(_onSelectDevice);
    on<DeleteDevice>(_onDeleteDevice);
  }

  Future<void> _onLoadDevices(LoadDevices event, Emitter<DeviceState> emit) async {
    emit(DeviceLoading());
    try {
      final devices = await service.getAll();
      emit(DeviceLoaded(devices));
    } catch (e) {
      emit(DeviceError(e.toString()));
    }
  }

  void _onSelectDevice(SelectDevice event, Emitter<DeviceState> emit) {
    // ...
  }

  Future<void> _onDeleteDevice(DeleteDevice event, Emitter<DeviceState> emit) async {
    final state = this.state;
    if (state is DeviceLoaded) {
      await service.delete(event.deviceId);
      final updated = state.devices.where((d) => d.id != event.deviceId).toList();
      emit(DeviceLoaded(updated));
    }
  }
}
```

---

## 五、状态管理选型对比

| 方案 | 复杂度 | 适用场景 | 特点 |
|------|--------|---------|------|
| setState | 低 | 局部状态 | 简单直接，不跨组件 |
| InheritedWidget | 中 | 简单全局状态 | Flutter 原生，样板代码多 |
| Provider | 低 | 中小型应用 | 官方推荐，简单易用 |
| Riverpod | 中 | 中大型应用 | 编译时安全，无 BuildContext 依赖 |
| Bloc | 高 | 大型应用 | 事件驱动，可测试性强，模板代码多 |
| GetX | 低 | 快速开发 | 简洁但架构松散，社区争议较大 |

**选型建议**：
- 小型应用：Provider
- 中大型应用：Riverpod（推荐）
- 需要严格架构的大型应用：Bloc
- 不建议过度设计：如果 setState 够用，不要引入额外框架
