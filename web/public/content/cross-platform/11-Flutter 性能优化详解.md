# Flutter 性能优化详解

---

## 一、Flutter 渲染流水线

理解 Flutter 性能优化的前提是理解渲染流水线：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Flutter 渲染流水线                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Widget Tree  ──→  Element Tree  ──→  RenderObject Tree        │
│   (不可变配置)       (可变实例)          (布局/绘制)              │
│                                                                 │
│   ┌──────────┐     ┌──────────┐     ┌──────────────────┐       │
│   │ setState │ →   │ markDirty │ →   │ markNeedsLayout  │       │
│   └──────────┘     └──────────┘     └──────────────────┘       │
│                                                          ↓      │
│   ┌──────────────────────────────────────────────────────┐     │
│   │                   build phase                        │     │
│   │           (rebuild dirty elements)                   │     │
│   └──────────────────────────────────────────────────────┘     │
│                          ↓                                      │
│   ┌──────────────────────────────────────────────────────┐     │
│   │                   layout phase                        │     │
│   │     (measure & position, Constraints down)            │     │
│   │         (Sizes up)                                    │     │
│   └──────────────────────────────────────────────────────┘     │
│                          ↓                                      │
│   ┌──────────────────────────────────────────────────────┐     │
│   │                   paint phase                         │     │
│   │        (paint onto Skia/Impeller canvas)              │     │
│   └──────────────────────────────────────────────────────┘     │
│                          ↓                                      │
│   ┌──────────────────────────────────────────────────────┐     │
│   │                   composite phase                     │     │
│   │       (send layer tree to GPU for compositing)        │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**关键概念**：
- **FPS**：目标 60fps（每帧 16.67ms），高刷新率设备 120fps（每帧 8.33ms）
- **UI Thread**：执行 Dart 代码（build/layout/paint）
- **Raster Thread**（GPU Thread）：执行 Skia/Impeller 绘制命令
- **Jank**：帧渲染时间超过预算导致掉帧

---

## 二、Widget 重建优化

### 2.1 setState 的粒度控制

```dart
// ❌ 差：整个页面重建
class _MyPageState extends State<MyPage> {
  int _counter = 0;
  String _title = "Hello";
  List<Item> _items = [];

  void _increment() {
    setState(() {
      _counter++;  // 导致整个 build 重建，包括不依赖 _counter 的部分
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(_title),                    // 不依赖 _counter
        Text('$_counter'),               // 依赖 _counter
        Expanded(child: ItemList(_items)), // 不依赖 _counter
      ],
    );
  }
}

// ✅ 好：提取独立 Widget
class _MyPageState extends State<MyPage> {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Text("Hello"),               // const，不重建
        const _CounterWidget(),             // 独立管理状态
        Expanded(child: ItemList(_items)),  // 不受 _counter 影响
      ],
    );
  }
}

class _CounterWidget extends StatefulWidget {
  const _CounterWidget();
  
  @override
  State<_CounterWidget> createState() => _CounterWidgetState();
}

class _CounterWidgetState extends State<_CounterWidget> {
  int _counter = 0;
  
  void _increment() {
    setState(() {
      _counter++;  // 只重建这个小 Widget
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _increment,
      child: Text('$_counter'),
    );
  }
}
```

### 2.2 const 构造函数

```dart
// const Widget 在编译时常量化，永远不重建
const Padding(
  padding: EdgeInsets.all(8.0),
  child: Text('Hello'),
)

// 非 const Widget 每次 build 都会创建新实例
Padding(
  padding: EdgeInsets.all(8.0),
  child: Text(DateTime.now().toString()),  // 依赖运行时值
)
```

### 2.3 Builder 与提取

```dart
// 使用 Builder 缩小重建范围
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Theme.of(context) 变化时只重建 Builder 内部
        Builder(
          builder: (context) {
            final theme = Theme.of(context);
            return Text('Title', style: theme.textTheme.titleLarge);
          },
        ),
        // 这里不会因 Theme 变化而重建
        const SizedBox(height: 20),
        const Text('Content'),
      ],
    );
  }
}
```

### 2.4 RepaintBoundary

```dart
// RepaintBoundary 创建独立的绘制层
// 适合复杂但变化不频繁的 Widget
RepaintBoundary(
  child: ComplexChart(data: largeDataSet),
)

// 列表项使用 RepaintBoundary
ListView.builder(
  itemBuilder: (context, index) {
    return RepaintBoundary(
      child: ListItem(item: items[index]),
    );
  },
)
```

**RepaintBoundary 原理**：
- 创建独立的 Layer，当该 Widget 外部变化时不需要重绘
- 当该 Widget 内部变化时只重绘该层，不影响外部
- 但会增加 Layer 合成开销，不可滥用

---

## 三、列表优化

### 3.1 ListView.builder 懒加载

```dart
// ❌ 差：一次性构建所有子项
ListView(
  children: items.map((item) => ListItem(item: item)).toList(),
)

// ✅ 好：懒加载
ListView.builder(
  itemCount: items.length,
  itemBuilder: (context, index) {
    return ListItem(item: items[index]);
  },
)
```

### 3.2 滑动性能优化

```dart
// 1. 使用 itemExtent 提高测量效率
ListView.builder(
  itemExtent: 80.0,  // 固定高度，跳过 layout 计算
  itemCount: items.length,
  itemBuilder: (context, index) => ListItem(item: items[index]),
)

// 2. 使用 prototypeItem（Flutter 3.0+）
ListView.builder(
  prototypeItem: const ListItem(item: null),  // 用原型测量
  itemCount: items.length,
  itemBuilder: (context, index) => ListItem(item: items[index]),
)

// 3. 使用 cacheExtent 控制预渲染范围
ListView.builder(
  cacheExtent: 500.0,  // 预渲染 500px 范围
  itemCount: items.length,
  itemBuilder: (context, index) => ListItem(item: items[index]),
)

// 4. Sliver 系列实现复杂滚动效果
CustomScrollView(
  slivers: [
    SliverPersistentHeader(
      delegate: MyHeaderDelegate(),
      pinned: true,
    ),
    SliverList.builder(
      itemCount: items.length,
      itemBuilder: (context, index) => ListItem(item: items[index]),
    ),
    SliverGrid.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.7,
      ),
      itemCount: gridItems.length,
      itemBuilder: (context, index) => GridItem(item: gridItems[index]),
    ),
  ],
)
```

---

## 四、避免不必要重建

### 4.1 Riverpod select

```dart
// 只监听需要的字段
final userNameProvider = Provider((ref) {
  return ref.watch(userProvider.select((user) => user.name));
});

// 多字段 select
Widget build(BuildContext context, WidgetRef ref) {
  // 只有 firstName 或 lastName 变化时才重建
  final fullName = ref.watch(
    userProvider.select((user) => '${user.firstName} ${user.lastName}')
  );
  return Text(fullName);
}
```

### 4.2 Selector（Provider）

```dart
// 使用 Selector 缩小监听范围
Selector<AppState, String>(
  selector: (state) => state.currentUser.name,
  builder: (context, name, child) {
    return Text(name);
  },
  // 只有 name 变化时才重建
)
```

---

## 五、图片优化

### 5.1 使用 cacheWidth/cacheHeight

```dart
// ❌ 差：加载原始分辨率
Image.network('https://example.com/4k_photo.jpg')

// ✅ 好：解码到需要的尺寸
Image.network(
  'https://example.com/4k_photo.jpg',
  cacheWidth: (200 * MediaQuery.devicePixelRatioOf(context)).toInt(),
  cacheHeight: (200 * MediaQuery.devicePixelRatioOf(context)).toInt(),
)
```

### 5.2 图片缓存管理

```dart
// 调整缓存限制
PaintingBinding.instance.imageCache.maximumSize = 100;  // 图片数量
PaintingBinding.instance.imageCache.maximumSizeBytes = 50 * 1024 * 1024;  // 50MB

// 预缓存图片
Future<void> precacheImages(BuildContext context) async {
  await precacheImage(
    NetworkImage('https://example.com/hero.jpg'),
    context,
  );
}

// 清除缓存
imageCache.clear();
imageCache.clearLiveImages();
```

### 5.3 使用 cached_network_image

```dart
CachedNetworkImage(
  imageUrl: 'https://example.com/photo.jpg',
  placeholder: (context, url) => const CircularProgressIndicator(),
  errorWidget: (context, url, error) => const Icon(Icons.error),
  memCacheWidth: 200,
  fadeInDuration: const Duration(milliseconds: 300),
)
```

---

## 六、启动优化

### 6.1 首帧渲染优化

```dart
// ❌ 差：main() 中同步初始化
void main() {
  initDatabase();      // 阻塞
  initAnalytics();     // 阻塞
  loadConfig();        // 阻塞
  runApp(MyApp());
}

// ✅ 好：延迟非关键初始化
void main() {
  // 只做必要的初始化
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: const SplashPage(),
    );
  }
}

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    // 并行初始化
    await Future.wait([
      _initDatabase(),
      _initAnalytics(),
      _loadConfig(),
    ]);
    
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
    }
  }

  Future<void> _initDatabase() async {
    final db = await openDatabase();
    GetIt.instance.registerSingleton(db);
  }

  Future<void> _initAnalytics() async {
    await FirebaseAnalytics.instance.logAppOpen();
  }

  Future<void> _loadConfig() async {
    final config = await RemoteConfig.fetch();
    GetIt.instance.registerSingleton(config);
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
```

### 6.2 引擎预热（Engine Warm-up）

```swift
// iOS AppDelegate - 预热 FlutterEngine
class AppDelegate: FlutterAppDelegate {
    var flutterEngine: FlutterEngine?
    
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: ...) -> Bool {
        flutterEngine = FlutterEngine(name: "warm_up")
        flutterEngine?.run(withEntrypoint: "main")  // 提前启动引擎
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
}

// 在需要时直接使用预热的引擎
let flutterVC = FlutterViewController(engine: flutterEngine!, nibName: nil, bundle: nil)
present(flutterVC, animated: true)
```

### 6.3 延迟加载库（Deferred Components）

```dart
// pubspec.yaml
flutter:
  deferred-components:
    - name: feature_x
      libraries:
        - package:my_app/feature_x.dart

// 代码中使用 deferred import
import 'package:my_app/feature_x.dart' deferred as feature_x;

Future<void> loadFeatureX() async {
  await feature_x.loadLibrary();  // 按需下载
  feature_x.openFeatureX(context);
}
```

---

## 七、内存优化

### 7.1 及时释放资源

```dart
class _MyPageState extends State<MyPage> {
  StreamSubscription? _subscription;
  Timer? _timer;
  AnimationController? _animController;

  @override
  void initState() {
    super.initState();
    _subscription = myStream.listen((data) { ... });
    _timer = Timer.periodic(Duration(seconds: 1), (_) { ... });
    _animController = AnimationController(
      vsync: this,
      duration: Duration(seconds: 2),
    );
  }

  @override
  void dispose() {
    _subscription?.cancel();    // 取消订阅
    _timer?.cancel();           // 取消定时器
    _animController?.dispose(); // 释放动画控制器
    super.dispose();
  }
}
```

### 7.2 大列表内存管理

```dart
// 使用 AutomaticKeepAliveClientMixin 保持关键项
class ListItem extends StatefulWidget {
  @override
  State<ListItem> createState() => _ListItemState();
}

class _ListItemState extends State<ListItem>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;  // 保持状态

  @override
  Widget build(BuildContext context) {
    super.build(context);  // 必须调用
    return ListTile(title: Text(widget.item.title));
  }
}
```

### 7.3 Isolate 处理耗时计算

```dart
// 主线程阻塞
String processData(List<int> data) {
  // 耗时计算
  return data.map((e) => e * 2).join(',');
}

// 使用 Isolate
Future<String> processDataInIsolate(List<int> data) async {
  return await Isolate.run(() {
    return data.map((e) => e * 2).join(',');
  });
}

// 使用 compute（简化版）
Future<String> processDataWithCompute(List<int> data) async {
  return await compute(_heavyCompute, data);
}

String _heavyCompute(List<int> data) {
  return data.map((e) => e * 2).join(',');
}
```

---

## 八、动画优化

### 8.1 使用 Implicit Animation

```dart
// AnimatedContainer / AnimatedOpacity 等
// 自动管理 AnimationController
AnimatedContainer(
  duration: const Duration(milliseconds: 300),
  curve: Curves.easeInOut,
  width: _expanded ? 200 : 100,
  height: _expanded ? 200 : 100,
  color: _expanded ? Colors.blue : Colors.grey,
)
```

### 8.2 使用 TweenAnimationBuilder

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: targetValue),
  duration: const Duration(milliseconds: 500),
  builder: (context, value, child) {
    return Opacity(opacity: value, child: child);
  },
  child: const Text('Fading Text'),  // child 不重建
)
```

### 8.3 TickerMode 优化不可见动画

```dart
// 当 Widget 不可见时暂停动画
Visibility(
  visible: _showAnimation,
  maintainState: true,
  child: TickerMode(
    enabled: _showAnimation,
    child: MyAnimatedWidget(),
  ),
)
```

---

## 九、性能分析工具

### 9.1 Flutter DevTools

```bash
# 启动 DevTools
flutter pub global run devtools

# 或在 IDE 中打开
```

**Performance 面板**：
- **Timeline**：查看每帧的 build/layout/paint 时间
- **CPU Profiler**：分析 Dart 代码执行时间
- **Memory**：检测内存泄漏和分配

### 9.2 Performance Overlay

```dart
MaterialApp(
  showPerformanceOverlay: true,  // 显示性能图表
  home: MyHomePage(),
)
```

- **GPU 线程**：Raster 线程时间
- **UI 线程**：Dart 代码执行时间
- 绿色 = 正常，红色 = 掉帧

### 9.3 debugPrint 和诊断

```dart
// 统计重建次数
class RebuildCounter extends StatefulWidget {
  @override
  State<RebuildCounter> createState() => _RebuildCounterState();
}

class _RebuildCounterState extends State<RebuildCounter> {
  int _buildCount = 0;

  @override
  Widget build(BuildContext context) {
    _buildCount++;
    if (_buildCount % 10 == 0) {
      debugPrint('Rebuild count: $_buildCount');
    }
    return Container();
  }
}

// 检查 Widget 是否可以 const
// 在 Analysis Options 中启用
analyzer:
  errors:
    prefer_const_constructors: warning
    prefer_const_literals_to_create_immutables: warning
```

### 9.4 Timeline 标记

```dart
void _doWork() {
  Timeline.startSync('my-expensive-operation');
  // 耗时操作
  doExpensiveWork();
  Timeline.finishSync();
}
```

---

## 十、常见性能陷阱与最佳实践

| 陷阱 | 影响 | 解决方案 |
|------|------|---------|
| 在 build 中做耗时操作 | 阻塞 UI 线程 | 在 initState/事件回调中异步处理 |
| 过度使用 setState | 大范围重建 | 提取 Widget、使用状态管理 |
| 非 const Widget | 每次创建新实例 | 尽可能使用 const |
| 缺少 RepaintBoundary | 不必要的重绘 | 复杂 Widget 包裹 RepaintBoundary |
| ListView 无 itemExtent | 额外布局计算 | 固定高度或使用 prototypeItem |
| 大图不缩放 | 内存占用高 | 使用 cacheWidth/cacheHeight |
| 未取消订阅/定时器 | 内存泄漏 | dispose 中清理 |
| 在列表中使用 PlatformView | GPU 合成开销 | 限制使用数量 |
| Opacity Widget | 创建额外 Layer | 使用 AnimatedOpacity 或 Visibility |
| Shader 编译卡顿 | 首次绘制慢 | 使用 SkSL warmup 或 Impeller |

---

## 十一、SkSL Warmup（Skia 着色器预热）

Shader 编译发生在首次绘制时，会导致首次卡顿（Jank）：

```dart
// Flutter 3.7 之前：手动捕获 SkSL
void main() {
  if (kDebugMode) {
    testExecutable = () async {
      final sksl = await flutterTest.captureShaderJank();
      // 保存到文件
    };
  }
  runApp(MyApp());
}

// Flutter 3.7+：推荐开启 Impeller（自动处理 Shader 编译）
// iOS: 默认开启
// Android: 在 manifest 中开启
// <meta-data android:name="io.flutter.embedding.android.EnableImpeller" android:value="true" />
```

---

## 十二、小结

Flutter 性能优化的核心在于减少 Widget 重建、优化列表渲染、合理管理内存。通过 const 构造函数、RepaintBoundary、Selector 等手段缩小重建范围。使用 itemExtent、cacheExtent 优化列表性能。通过 DevTools 的 Performance 面板和 Performance Overlay 分析定位瓶颈。开启 Impeller 引擎可以从根本上解决 Shader 编译卡顿问题。
