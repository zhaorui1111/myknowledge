# React Native 组件与导航详解

---

## 一、核心组件体系

### 1.1 基础组件

RN 提供了一组跨平台的基础组件，它们会被映射到各平台的原生组件：

| RN 组件 | iOS 映射 | Android 映射 | 用途 |
|---------|---------|-------------|------|
| `View` | UIView | android.view.View | 容器 |
| `Text` | UILabel / UITextView | TextView | 文本 |
| `Image` | UIImageView | ImageView | 图片 |
| `TextInput` | UITextField / UITextView | EditText | 输入框 |
| `ScrollView` | UIScrollView | ScrollView | 滚动容器 |
| `FlatList` | RCTScrollView | RecyclerView | 长列表 |
| `Pressable` | RCTView + Gesture | RCTView + Gesture | 可按压区域 |
| `Animated.View` | UIView + CADisplayLink | View + ValueAnimator | 动画 |

```tsx
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';

// 基础组件使用
function ProfileCard({ name, avatar, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <Image source={{ uri: avatar }} style={styles.avatar} />
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>查看详情</Text>
      </View>
    </Pressable>
  );
}
```

### 1.2 Pressable vs TouchableOpacity

从 RN 0.63 起，`Pressable` 取代了 `TouchableOpacity` / `TouchableHighlight` 成为推荐的可按压组件：

```tsx
// Pressable：提供更细粒度的按压状态控制
<Pressable
  style={({ pressed }) => ({
    opacity: pressed ? 0.6 : 1,
    backgroundColor: pressed ? '#e0e0e0' : '#ffffff',
  })}
  onPress={() => console.log('pressed')}
  onLongPress={() => console.log('long pressed')}
  delayLongPress={500}
  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}  // 扩大点击区域
>
  <Text>Click me</Text>
</Pressable>

// 旧写法（仍可用但不推荐）：
<TouchableOpacity onPress={...} activeOpacity={0.6}>
  <Text>Click me</Text>
</TouchableOpacity>
```

---

## 二、StyleSheet 与 Flexbox 布局

### 2.1 StyleSheet

```tsx
// StyleSheet.create 会将样式对象注册为原生样式表，提高性能
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
});

// 行内样式（每次渲染都会创建新对象，性能较差）
<View style={{ flex: 1, backgroundColor: '#fff' }} />

// 推荐使用 StyleSheet.create + 引用
<View style={styles.container} />
```

### 2.2 Flexbox 布局

RN 的 Flexbox 与 CSS Flexbox 基本一致，但默认值不同：

| 属性 | CSS 默认值 | RN 默认值 |
|------|-----------|----------|
| `flexDirection` | `row` | `column` |
| `alignContent` | `stretch` | `flex-start` |
| `flexShrink` | `1` | `0` |

```tsx
// 常见布局模式

// 1. 居中布局
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
  <Text>居中显示</Text>
</View>

// 2. 顶部 + 底部固定，中间滚动
<View style={{ flex: 1 }}>
  <View style={{ height: 60, backgroundColor: '#f0f0f0' }}>
    <Text>Header</Text>
  </View>
  <ScrollView style={{ flex: 1 }}>
    <Text>Content</Text>
  </ScrollView>
  <View style={{ height: 50, backgroundColor: '#f0f0f0' }}>
    <Text>Footer</Text>
  </View>
</View>

// 3. 水平排列
<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
  <Text>Left</Text>
  <Text>Right</Text>
</View>

// 4. flex 比例分配
<View style={{ flexDirection: 'row' }}>
  <View style={{ flex: 1, backgroundColor: 'red' }} />    // 1/3
  <View style={{ flex: 2, backgroundColor: 'green' }} />   // 2/3
</View>
```

### 2.3 平台特定样式

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,  // Android 阴影
      },
    }),
  },
});

// 平台条件渲染
{Platform.OS === 'ios' ? <IOSComponent /> : <AndroidComponent />}
```

---

## 三、FlatList 与列表优化

### 3.1 FlatList 核心 API

```tsx
import { FlatList } from 'react-native';

function DeviceList({ devices }) {
  const renderItem = useCallback(({ item }) => (
    <DeviceCard device={item} onPress={handlePress} />
  ), [handlePress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const getItemLayout = useCallback((data, index) => ({
    length: 80,   // 每项高度固定
    offset: 80 * index,
    index,
  }), []);

  return (
    <FlatList
      data={devices}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}  // 跳转优化：避免测量
      removeClippedSubviews={true}   // 卸载屏幕外视图
      maxToRenderPerBatch={10}       // 每批渲染最多数量
      initialNumToRender={10}        // 首屏渲染数量
      windowSize={5}                 // 渲染窗口大小
      onEndReached={loadMore}        // 触底加载
      onEndReachedThreshold={0.5}    // 触底阈值
      ListHeaderComponent={Header}
      ListEmptyComponent={EmptyState}
      ItemSeparatorComponent={Separator}
    />
  );
}
```

### 3.2 列表性能优化要点

```tsx
// 1. renderItem 必须用 useCallback 包裹，避免每次渲染都创建新函数
const renderItem = useCallback(({ item, index }) => (
  <DeviceCard device={item} />
), []);

// 2. keyExtractor 必须稳定唯一
const keyExtractor = useCallback((item) => item.id, []);

// 3. getItemLayout：如果行高固定，提供此方法可跳过测量步骤
const getItemLayout = (_, index) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});

// 4. 避免在 renderItem 中创建内联对象
// ❌ 错误：
<DeviceCard style={{ marginTop: 10 }} />
// ✅ 正确：
const styles = StyleSheet.create({ card: { marginTop: 10 } });
<DeviceCard style={styles.card} />

// 5. 使用 React.memo 包裹列表项组件
const DeviceCard = React.memo(({ device, onPress }) => {
  return (
    <Pressable onPress={onPress}>
      <Text>{device.name}</Text>
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只在 device 或 onPress 变化时重新渲染
  return prevProps.device.id === nextProps.device.id
    && prevProps.device.name === nextProps.device.name
    && prevProps.onPress === nextProps.onPress;
});
```

---

## 四、React Navigation 导航

### 4.1 导航容器

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#6366f1' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '首页' }}
        />
        <Stack.Screen
          name="DeviceDetail"
          component={DeviceDetailScreen}
          options={({ route }) => ({ title: route.params.deviceName })}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ presentation: 'modal' }}  // 模态弹出
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### 4.2 导航类型

| 导航类型 | 创建函数 | 特点 |
|---------|---------|------|
| Stack | `createNativeStackNavigator` | 栈式导航，页面堆叠 |
| Tab | `createBottomTabNavigator` | 底部 Tab 切换 |
| Drawer | `createDrawerNavigator` | 侧边栏抽屉 |
| Material Top Tab | `createMaterialTopTabNavigator` | 顶部 Tab（Android 风格） |

### 4.3 页面间导航与传参

```tsx
// 导航到新页面并传参
function HomeScreen({ navigation }) {
  return (
    <Button
      title="查看设备详情"
      onPress={() => navigation.navigate('DeviceDetail', {
        deviceId: '12345',
        deviceName: '传感器A',
      })}
    />
  );
}

// 接收参数
function DeviceDetailScreen({ route, navigation }) {
  const { deviceId, deviceName } = route.params;
  
  return (
    <View>
      <Text>{deviceName}</Text>
      <Button title="返回" onPress={() => navigation.goBack()} />
      <Button title="回到首页" onPress={() => navigation.popToTop()} />
    </View>
  );
}

// 设置页面标题
function DeviceDetailScreen({ route, navigation }) {
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: route.params.deviceName });
  }, [navigation, route.params.deviceName]);
  
  // ...
}
```

### 4.4 TypeScript 类型安全导航

```tsx
// 定义所有路由的参数类型
type RootStackParamList = {
  Home: undefined;
  DeviceDetail: { deviceId: string; deviceName: string };
  Settings: { section?: string };
};

// 使用泛型约束
import { NativeStackScreenProps } from '@react-navigation/native-stack';

type DeviceDetailProps = NativeStackScreenProps<RootStackParamList, 'DeviceDetail'>;

function DeviceDetailScreen({ route, navigation }: DeviceDetailProps) {
  const { deviceId, deviceName } = route.params;  // 类型安全
  // ...
}
```

### 4.5 Deep Linking

```tsx
// 配置 Deep Link
const linking = {
  prefixes: ['myapp://', 'https://myapp.com'],
  config: {
    screens: {
      Home: '',
      DeviceDetail: 'device/:deviceId',
      Settings: 'settings',
    },
  },
};

function App() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>...</Stack.Navigator>
    </NavigationContainer>
  );
}

// URL: myapp://device/12345 → 导航到 DeviceDetail, deviceId='12345'
```

---

## 五、SafeArea 与手势

### 5.1 SafeArea

```tsx
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Content />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// 使用 useSafeAreaInsets 获取安全区域
function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, paddingLeft: insets.left }}>
      <Text>Header</Text>
    </View>
  );
}
```

### 5.2 React Native Gesture Handler

```tsx
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

function SwipeableCard() {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 100) {
        // 滑动超过阈值，触发删除
        translateX.value = withSpring(e.translationX > 0 ? 400 : -400);
      } else {
        // 回弹
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text>Swipe me</Text>
      </Animated.View>
    </GestureDetector>
  );
}
```

---

## 六、Animated 动画系统

### 6.1 Animated API

```tsx
import { Animated, Easing } from 'react-native';

// 1. 创建 Animated.Value
const fadeAnim = useRef(new Animated.Value(0)).current;

// 2. 动画类型
// Animated.timing：时间驱动
Animated.timing(fadeAnim, {
  toValue: 1,
  duration: 500,
  easing: Easing.ease,
  useNativeDriver: true,  // 使用原生驱动，不阻塞 JS 线程
}).start();

// Animated.spring：弹簧物理
Animated.spring(fadeAnim, {
  toValue: 1,
  friction: 7,
  tension: 40,
  useNativeDriver: true,
}).start();

// Animated.decay：衰减（用于滑动）
Animated.decay(position, {
  velocity: { x: 0.5, y: 0 },
  deceleration: 0.997,
  useNativeDriver: true,
}).start();

// 3. 组合动画
Animated.parallel([
  Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
  Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
]).start();

Animated.sequence([
  Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
  Animated.delay(200),
  Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
]).start();

// 4. 渲染
<Animated.View style={{ opacity: fadeAnim }}>
  <Text>Fade in</Text>
</Animated.View>
```

### 6.2 Reanimated 3（推荐）

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

function PulseCard() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const startPulse = () => {
    scale.value = withSequence(
      withTiming(1.1, { duration: 200 }),
      withTiming(1.0, { duration: 200 }),
    );
  };

  return (
    <Pressable onPress={startPulse}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text>Tap me</Text>
      </Animated.View>
    </Pressable>
  );
}
```

**Reanimated vs Animated**：

| 特性 | Animated | Reanimated 3 |
|------|----------|-------------|
| 线程 | useNativeDriver 时在原生线程 | 默认在 UI 线程 |
| 工作lets | 不支持 | 支持（worklet） |
| 回调 | 异步回调 | 同步回调 |
| 手势 | 需配合手势库 | 内置手势支持 |
| 性能 | 好 | 更好（减少线程切换） |

---

## 七、小结

RN 的组件体系映射到原生组件，通过 StyleSheet + Flexbox 实现跨平台布局。React Navigation 提供了完整的导航方案，配合 TypeScript 可以实现类型安全的路由。列表渲染推荐使用 FlatList 并遵循性能优化最佳实践。动画方面，Reanimated 3 是当前推荐方案，能在 UI 线程执行动画，避免 JS 线程阻塞。
