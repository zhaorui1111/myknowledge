# Flutter Widget 体系与布局详解

---

## 一、Widget 分类

### 1.1 StatelessWidget vs StatefulWidget

```dart
// StatelessWidget：无状态，纯展示，build 方法只在父组件重建时调用
class DeviceCard extends StatelessWidget {
  final String name;
  final String status;
  final VoidCallback onTap;

  const DeviceCard({
    super.key,
    required this.name,
    required this.status,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(name, style: Theme.of(context).textTheme.titleMedium),
            Text(status, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

// StatefulWidget：有状态，setState 触发重建
class DeviceCounter extends StatefulWidget {
  const DeviceCounter({super.key});

  @override
  State<DeviceCounter> createState() => _DeviceCounterState();
}

class _DeviceCounterState extends State<DeviceCounter> {
  int _count = 0;

  void _increment() {
    setState(() {
      _count++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$_count'),
        ElevatedButton(onPressed: _increment, child: const Text('Add')),
      ],
    );
  }
}
```

### 1.2 生命周期

```dart
class LifecycleDemo extends StatefulWidget {
  @override
  State<LifecycleDemo> createState() => _LifecycleDemoState();
}

class _LifecycleDemoState extends State<LifecycleDemo>
    with WidgetsBindingObserver {
  
  @override
  void initState() {
    super.initState();
    // 1. 初始化：只执行一次
    // 适合：初始化控制器、订阅事件、启动定时器
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 2. 依赖变化：initState 后及 InheritedWidget 变化时
    // 适合：获取 Theme.of(context)、MediaQuery.of(context)
  }

  @override
  void didUpdateWidget(LifecycleDemo oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 3. Widget 更新：父组件重建并传入新参数时
    // 适合：比较新旧参数，触发副作用
  }

  @override
  void dispose() {
    // 4. 销毁：组件从树中移除
    // 必须：取消订阅、释放控制器、停止定时器
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // App 生命周期
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // 前台可交互
        break;
      case AppLifecycleState.inactive:
        // 前台但不交互（如来电）
        break;
      case AppLifecycleState.paused:
        // 后台
        break;
      case AppLifecycleState.detached:
        // 即将销毁
        break;
      case AppLifecycleState.hidden:
        // 隐藏
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container();
  }
}
```

---

## 二、布局组件

### 2.1 Flex 布局（Row / Column）

```dart
// Row：水平排列
Row(
  mainAxisAlignment: MainAxisAlignment.spaceEvenly,  // 主轴对齐
  crossAxisAlignment: CrossAxisAlignment.center,      // 交叉轴对齐
  mainAxisSize: MainAxisSize.max,                     // 主轴尺寸
  children: [
    Text('Left'),
    Text('Center'),
    Text('Right'),
  ],
)

// Column：垂直排列
Column(
  children: [
    Text('Top'),
    Expanded(child: Container()),  // 占据剩余空间
    Text('Bottom'),
  ],
)

// Expanded / Flexible：弹性布局
Row(
  children: [
    Expanded(flex: 1, child: Container(color: Colors.red)),    // 1/3
    Expanded(flex: 2, child: Container(color: Colors.blue)),   // 2/3
  ],
)

// Flexible 的区别
// Expanded: 强制填满剩余空间（fit: FlexFit.tight）
// Flexible: 可选填满（fit: FlexFit.loose，可以小于分配空间）
```

### 2.2 Stack（层叠布局）

```dart
Stack(
  alignment: Alignment.center,
  children: [
    // 底层
    Image.network('background.jpg'),
    // 上层
    Positioned(
      top: 10,
      right: 10,
      child: Icon(Icons.close),
    ),
    // 居中
    Positioned.fill(
      child: Center(child: Text('Overlay')),
    ),
  ],
)
```

### 2.3 Container

```dart
Container(
  width: 200,
  height: 100,
  margin: const EdgeInsets.all(16),
  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
  decoration: BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(12),
    border: Border.all(color: Colors.grey.shade300),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withOpacity(0.1),
        blurRadius: 8,
        offset: const Offset(0, 2),
      ),
    ],
  ),
  child: Text('Content'),
)
```

---

## 三、列表与滚动

### 3.1 ListView

```dart
// 1. 简单列表
ListView(
  children: [
    ListTile(title: Text('Item 1')),
    ListTile(title: Text('Item 2')),
  ],
)

// 2. 构建器列表（推荐：懒加载）
ListView.builder(
  itemCount: devices.length,
  itemBuilder: (context, index) {
    return DeviceTile(device: devices[index]);
  },
)

// 3. 分隔符列表
ListView.separated(
  itemCount: devices.length,
  separatorBuilder: (context, index) => const Divider(),
  itemBuilder: (context, index) => DeviceTile(device: devices[index]),
)
```

### 3.2 Sliver 体系

Sliver 是 Flutter 滚动系统的底层抽象，可以实现复杂的滚动效果：

```dart
CustomScrollView(
  slivers: [
    // 1. 固定高度头部
    SliverAppBar(
      expandedHeight: 200,
      pinned: true,        // 滚动时是否固定
      flexibleSpace: FlexibleSpaceBar(
        title: Text('Dashboard'),
        background: Image.network('header.jpg'),
      ),
    ),
    
    // 2. 网格
    SliverGrid(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.5,
      ),
      delegate: SliverChildBuilderDelegate(
        (context, index) => DeviceCard(device: devices[index]),
        childCount: devices.length,
      ),
    ),
    
    // 3. 列表
    SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) => ListTile(
          title: Text('Item $index'),
        ),
        childCount: 100,
      ),
    ),
    
    // 4. 固定高度区域
    SliverToBoxAdapter(
      child: Container(height: 80, child: AdBanner()),
    ),
    
    // 5. 填充剩余空间
    SliverFillRemaining(
      hasScrollBody: false,
      child: Center(child: Text('End')),
    ),
  ],
)
```

### 3.3 下拉刷新与上拉加载

```dart
RefreshIndicator(
  onRefresh: () async {
    await refreshData();
  },
  child: ListView.builder(
    controller: _scrollController,
    itemCount: items.length + (hasMore ? 1 : 0),
    itemBuilder: (context, index) {
      if (index == items.length) {
        return const Center(child: CircularProgressIndicator());
      }
      return ItemTile(item: items[index]);
    },
  ),
)

// 上拉加载
_scrollController.addListener(() {
  if (_scrollController.position.pixels >=
      _scrollController.position.maxScrollExtent - 100) {
    loadMore();
  }
});
```

---

## 四、导航与路由

### 4.1 命令式导航

```dart
// 推入新页面
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => DeviceDetailPage(deviceId: '123'),
  ),
);

// 弹出
Navigator.pop(context);

// 带返回值
final result = await Navigator.push(
  context,
  MaterialPageRoute(builder: (context) => const SelectDevicePage()),
);
if (result != null) {
  print('Selected: $result');
}

// 替换当前页面
Navigator.pushReplacement(
  context,
  MaterialPageRoute(builder: (context) => const HomePage()),
);

// 清空栈并推入
Navigator.pushAndRemoveUntil(
  context,
  MaterialPageRoute(builder: (context) => const LoginPage()),
  (route) => false,  // 移除所有路由
);
```

### 4.2 声明式导航（GoRouter）

```dart
// 使用 go_router 包（官方推荐）
final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomePage(),
    ),
    GoRoute(
      path: '/device/:id',
      builder: (context, state) => DeviceDetailPage(
        deviceId: state.pathParameters['id']!,
      ),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsPage(),
      routes: [
        GoRoute(
          path: 'bluetooth',  // /settings/bluetooth
          builder: (context, state) => const BluetoothSettingsPage(),
        ),
      ],
    ),
  ],
  // 重定向
  redirect: (context, state) {
    if (!isLoggedIn && state.matchedLocation != '/login') {
      return '/login';
    }
    return null;
  },
);

// MaterialApp.router
MaterialApp.router(
  routerConfig: router,
);

// 导航
context.go('/device/123');           // 替换当前路由
context.push('/settings');            // 压入路由
context.pop();                        // 弹出
context.pushNamed('device', params: {'id': '123'});
```

---

## 五、动画体系

### 5.1 隐式动画（AnimatedWidget）

```dart
// AnimatedContainer：属性变化自动动画
class AnimatedBox extends StatefulWidget {
  @override
  State<AnimatedBox> createState() => _AnimatedBoxState();
}

class _AnimatedBoxState extends State<AnimatedBox> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        width: _expanded ? 200 : 100,
        height: _expanded ? 200 : 100,
        color: _expanded ? Colors.blue : Colors.grey,
      ),
    );
  }
}

// 其他隐式动画组件
// AnimatedOpacity, AnimatedPositioned, AnimatedAlign,
// AnimatedPadding, AnimatedDefaultTextStyle, AnimatedSwitcher
```

### 5.2 显式动画（AnimationController）

```dart
class FadeTransitionDemo extends StatefulWidget {
  @override
  State<FadeTransitionDemo> createState() => _FadeTransitionDemoState();
}

class _FadeTransitionDemoState extends State<FadeTransitionDemo>
    with TickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,  // TickerProvider
    );
    
    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    );
    
    _controller.forward();  // 启动动画
  }

  @override
  void dispose() {
    _controller.dispose();  // 必须释放
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        width: 100,
        height: 100,
        color: Colors.blue,
      ),
    );
  }
}
```

### 5.3 自定义 Tween 动画

```dart
class ColorAnimation extends StatefulWidget {
  @override
  State<ColorAnimation> createState() => _ColorAnimationState();
}

class _ColorAnimationState extends State<ColorAnimation>
    with TickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);  // 循环播放
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        // 使用 ColorTween 在两种颜色之间插值
        final color = ColorTween(
          begin: Colors.red,
          end: Colors.blue,
        ).lerp(_controller.value);  // 0.0 → 1.0
        
        return Container(
          width: 100,
          height: 100,
          color: color,
        );
      },
    );
  }
}
```

### 5.4 Hero 动画（共享元素过渡）

```dart
// 页面 A
Hero(
  tag: 'device-image-${device.id}',
  child: Image.network(device.imageUrl),
)

// 页面 B
Hero(
  tag: 'device-image-${device.id}',  // tag 必须匹配
  child: Image.network(device.imageUrl),
)
// Flutter 自动处理过渡动画
```

---

## 六、Material 与 Cupertino

### 6.1 Material 组件

```dart
// Material Design 3 组件
MaterialApp(
  theme: ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
  ),
  home: Scaffold(
    appBar: AppBar(title: const Text('Home')),
    body: Center(
      child: Column(
        children: [
          // 按钮
          ElevatedButton(onPressed: () {}, child: const Text('Elevated')),
          FilledButton(onPressed: () {}, child: const Text('Filled')),
          TextButton(onPressed: () {}, child: const Text('Text')),
          
          // 卡片
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Card content'),
            ),
          ),
          
          // 输入框
          TextField(
            decoration: InputDecoration(
              labelText: 'Device Name',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.devices),
            ),
          ),
          
          // 底部导航
          NavigationBar(
            selectedIndex: 0,
            onDestinationSelected: (i) {},
            destinations: const [
              NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
              NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
            ],
          ),
        ],
      ),
    ),
    floatingActionButton: FloatingActionButton(
      onPressed: () {},
      child: const Icon(Icons.add),
    ),
  ),
)
```

### 6.2 Cupertino 组件

```dart
// iOS 风格组件
CupertinoApp(
  home: CupertinoPageScaffold(
    navigationBar: const CupertinoNavigationBar(
      middle: Text('Settings'),
    ),
    child: SafeArea(
      child: CupertinoListSection(
        children: [
          CupertinoListTile(
            title: const Text('Bluetooth'),
            trailing: CupertinoSwitch(
              value: true,
              onChanged: (v) {},
            ),
          ),
          CupertinoListTile(
            title: const Text('Device Name'),
            additionalText: 'Sensor-A',
            onTap: () {},
          ),
        ],
      ),
    ),
  ),
)

// 平台自适应
import 'dart:io' show Platform;

Widget buildButton() {
  if (Platform.isIOS) {
    return CupertinoButton(onPressed: () {}, child: Text('Done'));
  }
  return ElevatedButton(onPressed: () {}, child: Text('Done'));
}

// 或使用 Theme 判断
Widget buildButton(BuildContext context) {
  final platform = Theme.of(context).platform;
  if (platform == TargetPlatform.iOS) {
    return CupertinoButton(...);
  }
  return ElevatedButton(...);
}
```

---

## 七、小结

Flutter 的 Widget 体系通过组合而非继承来构建 UI，StatelessWidget 和 StatefulWidget 覆盖了几乎所有场景。布局系统以 Flex（Row/Column）为核心，Sliver 体系支持复杂滚动效果。动画从隐式到显式提供了不同复杂度的选择。Material 和 Cupertino 两套组件库可以构建平台一致的 UI 体验。理解 Widget 生命周期和三棵树机制是高效开发 Flutter 应用的基础。
