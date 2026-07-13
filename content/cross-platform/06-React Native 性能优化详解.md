# React Native 性能优化详解

---

## 一、渲染性能优化

### 1.1 避免不必要的重新渲染

```tsx
// 1. React.memo：包裹子组件，只在 props 变化时重新渲染
const DeviceCard = React.memo(({ device, onPress }: Props) => {
  return (
    <Pressable onPress={onPress}>
      <Text>{device.name}</Text>
      <Text>{device.rssi} dBm</Text>
    </Pressable>
  );
}, (prev, next) => {
  // 自定义比较：只在关键字段变化时重渲染
  return prev.device.id === next.device.id
    && prev.device.name === next.device.name
    && prev.device.rssi === next.device.rssi
    && prev.onPress === next.onPress;
});

// 2. useCallback：缓存函数引用，避免子组件不必要的渲染
function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  
  const handlePress = useCallback((id: string) => {
    navigation.navigate('Detail', { id });
  }, [navigation]);

  // ❌ 错误：每次渲染创建新函数，导致 DeviceCard 总是重渲染
  // const handlePress = (id: string) => { navigation.navigate('Detail', { id }); };

  return (
    <FlatList
      data={devices}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <DeviceCard device={item} onPress={handlePress} />
      )}
    />
  );
}

// 3. useMemo：缓存计算结果
function SearchResults({ devices, query }) {
  // ❌ 每次渲染都重新过滤
  // const results = devices.filter(d => d.name.includes(query));

  // ✅ 只在 devices 或 query 变化时重新计算
  const results = useMemo(
    () => devices.filter(d => d.name.includes(query)),
    [devices, query]
  );

  return <FlatList data={results} ... />;
}
```

### 1.2 使用 useDeferredValue 处理高频更新

```tsx
import { useDeferredValue } from 'react';

function SearchScreen({ allDevices }) {
  const [query, setQuery] = useState('');
  
  // 延迟搜索结果的更新，让输入框保持流畅
  const deferredQuery = useDeferredValue(query);
  
  const results = useMemo(
    () => allDevices.filter(d => d.name.includes(deferredQuery)),
    [allDevices, deferredQuery]
  );

  const isStale = query !== deferredQuery;

  return (
    <View>
      <TextInput value={query} onChangeText={setQuery} />
      <FlatList
        data={results}
        renderItem={({ item }) => <DeviceCard device={item} />}
        style={{ opacity: isStale ? 0.5 : 1 }}
      />
    </View>
  );
}
```

---

## 二、列表性能优化

### 2.1 FlashList 替代 FlatList

```tsx
import { FlashList } from '@shopify/flash-list';

// FlashList 使用 RecyclerListView 原理，性能远超 FlatList
<FlashList
  data={devices}
  renderItem={({ item }) => <DeviceCard device={item} />}
  estimatedItemSize={80}  // 必须提供，用于回收计算
  keyExtractor={item => item.id}
  overrideItemLayout={(layout, item) => {
    layout.size = 80;  // 精确高度
  }}
/>
```

**FlashList vs FlatList 性能对比**：

| 指标 | FlatList | FlashList |
|------|----------|-----------|
| 滚动帧率 | 45-55 fps | 58-60 fps |
| 内存占用 | 高（持有所有视图） | 低（回收复用） |
| 1000+ 项加载 | 2-3s | <500ms |
| 空白区域 | 常见 | 几乎不出现 |

### 2.2 列表项优化检查清单

- [ ] `renderItem` 使用 `useCallback` 包裹
- [ ] `keyExtractor` 稳定且唯一
- [ ] 行高固定时提供 `getItemLayout`
- [ ] 列表项组件使用 `React.memo` 包裹
- [ ] 避免在 `renderItem` 中创建内联对象和函数
- [ ] 使用 `removeClippedSubviews`（仅 Android）
- [ ] 合理设置 `windowSize`（默认 21，可降低到 5-7）

---

## 三、启动优化

### 3.1 Bundle 体积优化

```javascript
// metro.config.js — 启用内联 require
module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        inlineRequires: true,  // 延迟加载模块
      },
    }),
  },
};

// 分析 Bundle 体积
// npx react-native-bundle-visualizer
```

### 3.2 分包加载

```tsx
// 按路由分包，延迟加载非首屏模块
const lazy = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) => {
  const Component = React.lazy(factory);
  return (props: any) => (
    <React.Suspense fallback={<LoadingScreen />}>
      <Component {...props} />
    </React.Suspense>
  );
};

// 首屏只加载核心模块
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
// 非首屏模块延迟加载
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
```

### 3.3 Hermes 优化

```javascript
// android/app/build.gradle
project.ext.react = [
  enableHermes: true,  // 启用 Hermes
  bundleInDebug: false,
  bundleInRelease: true,
  // 预编译字节码
  hermesCommand: "$rootDir/my-hernes-command",
]

// iOS: Podfile
use_react_native!(
  :hermes_enabled => true,
  :fabric_enabled => true,  // 启用新架构
  :app_path => "#{Pod::Config.instance.installation_root}/.."
)
```

---

## 四、动画与交互优化

### 4.1 使用原生驱动的动画

```tsx
// ✅ useNativeDriver: true — 动画在原生线程执行，不阻塞 JS
const fadeAnim = useRef(new Animated.Value(0)).current;

Animated.timing(fadeAnim, {
  toValue: 1,
  duration: 300,
  useNativeDriver: true,  // 关键！
}).start();

// useNativeDriver 限制：
// ✅ 支持: opacity, transform (translate/scale/rotate)
// ❌ 不支持: width, height, backgroundColor, borderRadius
```

### 4.2 Reanimated worklet 优化

```tsx
// Reanimated 3 默认在 UI 线程执行，不经过 JS 线程
const gesture = Gesture.Pan()
  .onStart(() => {
    'worklet';  // worklet 在 UI 线程执行
    console.log('Gesture started');
  })
  .onUpdate((e) => {
    'worklet';
    // 直接更新 SharedValue，不触发 JS 重渲染
    translateX.value = e.translationX;
    translateY.value = e.translationY;
  })
  .onEnd((e) => {
    'worklet';
    if (Math.abs(e.velocityX) > 500) {
      // 快速滑动 → 飞出
      translateX.value = withDecay({ velocity: e.velocityX });
    } else {
      // 回弹
      translateX.value = withSpring(0);
    }
  });
```

### 4.3 避免 JS 线程阻塞

```tsx
// ❌ 阻塞 JS 线程的操作
function handleSearch(query: string) {
  // 大数据量同步过滤会阻塞 JS 线程
  const results = hugeDataset.filter(item => item.name.includes(query));
  setResults(results);
}

// ✅ 使用 InteractionManager 或 setTimeout 分片处理
function handleSearch(query: string) {
  InteractionManager.runAfterInteractions(() => {
    const results = hugeDataset.filter(item => item.name.includes(query));
    setResults(results);
  });
}

// ✅ 更好的方案：使用 requestAnimationFrame 分片
function chunkedFilter(data, query, chunkSize = 100) {
  const results = [];
  let index = 0;
  
  function processChunk() {
    const end = Math.min(index + chunkSize, data.length);
    for (let i = index; i < end; i++) {
      if (data[i].name.includes(query)) {
        results.push(data[i]);
      }
    }
    index = end;
    
    if (index < data.length) {
      requestAnimationFrame(processChunk);
    } else {
      setResults(results);
    }
  }
  
  processChunk();
}
```

---

## 五、内存优化

### 5.1 避免内存泄漏

```tsx
// 1. 清理定时器和监听器
function useBLEScanner() {
  useEffect(() => {
    const subscription = bleEmitter.addListener('onDeviceFound', handler);
    const timer = setInterval(() => checkConnection(), 5000);
    
    return () => {
      subscription.remove();  // 必须清理！
      clearInterval(timer);    // 必须清理！
    };
  }, []);
}

// 2. 取消异步操作
useEffect(() => {
  const controller = new AbortController();
  
  fetch('/api/devices', { signal: controller.signal })
    .then(res => res.json())
    .then(setDevices)
    .catch(err => {
      if (err.name !== 'AbortError') {
        console.error(err);
      }
    });
    
  return () => controller.abort();
}, []);

// 3. 避免闭包泄漏
function Component() {
  const largeData = useRef(hugeArray);
  
  // ❌ 闭包持有 largeData 引用，阻止 GC
  // const handler = () => console.log(largeData.current);
  
  // ✅ 只引用需要的字段
  const handler = useCallback(() => {
    console.log(largeData.current.length);
  }, []);
}
```

### 5.2 图片内存优化

```tsx
import { FastImage } from 'react-native-fast-image';

// 使用 FastImage 替代 Image，支持内存缓存和磁盘缓存
<FastImage
  source={{ uri: imageUrl, priority: 'normal' }}
  style={styles.image}
  resizeMode={FastImage.resizeMode.cover}
  // 内存缓存自动管理
/>

// 列表中使用低分辨率图片
<FastImage
  source={{ uri: thumbnailUrl }}  // 列表用缩略图
  style={styles.thumbnail}
/>

// 及时释放大图
useEffect(() => {
  return () => {
    // 组件卸载时清理图片缓存（如需要）
    FastImage.clearMemoryCache();
  };
}, []);
```

---

## 六、性能监控与调试

### 6.1 Flipper / React DevTools

```tsx
// React DevTools Profiler 分析组件渲染
// npx react-devtools

// Flipper 查看：
// - Network 请求
// - Layout Inspector
// - Hermes 性能分析
// - Redux/Zustand 状态变化
```

### 6.2 性能监控 SDK

```tsx
// 使用 react-native-performance 监控关键指标
import { Performance } from 'react-native-performance';

// 标记启动阶段
Performance.mark('appStart');
Performance.mark('jsBundleLoaded');
Performance.mark('firstRender');

// 测量
Performance.measure('bundleLoadTime', 'appStart', 'jsBundleLoaded');
Performance.measure('firstRenderTime', 'jsBundleLoaded', 'firstRender');

// 自定义性能指标
function trackScreenRender(screenName: string) {
  const start = performance.now();
  
  requestAnimationFrame(() => {
    const duration = performance.now() - start;
    Analytics.track('screen_render', { screen: screenName, duration });
  });
}
```

### 6.3 关键性能指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 冷启动时间 | < 2s | 从点击图标到首屏渲染 |
| 热启动时间 | < 500ms | 从后台恢复到可交互 |
| JS 线程帧率 | > 55fps | 滚动/动画时 |
| UI 线程帧率 | > 58fps | 滚动/动画时 |
| 列表滚动帧率 | > 55fps | 1000+ 项列表 |
| 内存占用 | < 200MB | 正常使用时 |

---

## 七、小结

RN 性能优化的核心原则：减少 JS 线程工作量、利用原生线程、避免不必要的渲染。具体手段包括：使用 React.memo/useCallback/useMemo 减少重渲染、使用 FlashList 替代 FlatList 优化列表、使用 Reanimated 在 UI 线程执行动画、使用 Hermes 字节码预编译加速启动、及时清理定时器和监听器防止内存泄漏。
