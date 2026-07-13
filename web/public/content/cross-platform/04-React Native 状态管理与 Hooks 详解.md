# React Native 状态管理与 Hooks 详解

---

## 一、React Hooks 核心

### 1.1 useState

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  // 函数式更新：基于前一个值计算
  const increment = () => setCount(prev => prev + 1);
  const decrement = () => setCount(prev => prev - 1);

  // 批量更新：React 18 自动批处理
  const reset = () => {
    setCount(0);
    setCount(0);  // 会被批处理为一次渲染
  };

  return (
    <View>
      <Text>{count}</Text>
      <Button title="+" onPress={increment} />
      <Button title="-" onPress={decrement} />
    </View>
  );
}
```

**useState 注意事项**：

```tsx
// 1. 惰性初始化：传入函数避免每次渲染都执行昂贵计算
const [data, setData] = useState(() => {
  return expensiveComputation();  // 只在首次渲染时执行
});

// 2. 对象状态更新必须展开
const [user, setUser] = useState({ name: '', age: 0 });
// ❌ 错误：会丢失其他属性
setUser({ name: 'Alice' });
// ✅ 正确：展开后覆盖
setUser(prev => ({ ...prev, name: 'Alice' }));

// 3. 使用函数式更新避免闭包陷阱
const [count, setCount] = useState(0);
useEffect(() => {
  const timer = setInterval(() => {
    // ❌ 闭包陷阱：count 永远是 0
    // setCount(count + 1);
    // ✅ 函数式更新：总是获取最新值
    setCount(prev => prev + 1);
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

### 1.2 useReducer

适用于复杂状态逻辑（多状态关联、状态转换有明确规则）：

```tsx
type DeviceState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  device: Device | null;
  error: string | null;
};

type DeviceAction =
  | { type: 'CONNECT_START' }
  | { type: 'CONNECT_SUCCESS'; device: Device }
  | { type: 'CONNECT_ERROR'; error: string }
  | { type: 'DISCONNECT' }
  | { type: 'RESET' };

function deviceReducer(state: DeviceState, action: DeviceAction): DeviceState {
  switch (action.type) {
    case 'CONNECT_START':
      return { ...state, status: 'connecting', error: null };
    case 'CONNECT_SUCCESS':
      return { status: 'connected', device: action.device, error: null };
    case 'CONNECT_ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'DISCONNECT':
      return { status: 'idle', device: null, error: null };
    case 'RESET':
      return { status: 'idle', device: null, error: null };
    default:
      return state;
  }
}

function useDevice() {
  const [state, dispatch] = useReducer(deviceReducer, {
    status: 'idle',
    device: null,
    error: null,
  });

  const connect = async (deviceId: string) => {
    dispatch({ type: 'CONNECT_START' });
    try {
      const device = await BLEService.connect(deviceId);
      dispatch({ type: 'CONNECT_SUCCESS', device });
    } catch (err) {
      dispatch({ type: 'CONNECT_ERROR', error: err.message });
    }
  };

  return { ...state, connect };
}
```

### 1.3 useContext

```tsx
// 1. 创建 Context
const ThemeContext = createContext<{
  theme: 'light' | 'dark';
  toggle: () => void;
}>({ theme: 'light', toggle: () => {} });

// 2. Provider
function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const toggle = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <RootNavigator />
    </ThemeContext.Provider>
  );
}

// 3. Consumer
function ThemedButton() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <Button
      title="Toggle Theme"
      color={theme === 'dark' ? '#fff' : '#000'}
      onPress={toggle}
    />
  );
}
```

### 1.4 useMemo 与 useCallback

```tsx
function ProductList({ products, filterText, sortBy }) {
  // useMemo：缓存计算结果
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => p.name.includes(filterText))
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'price') return a.price - b.price;
        return 0;
      });
  }, [products, filterText, sortBy]);

  // useCallback：缓存函数引用
  const handlePress = useCallback((productId: string) => {
    navigation.navigate('Detail', { productId });
  }, [navigation]);

  return (
    <FlatList
      data={filteredProducts}
      renderItem={({ item }) => (
        <ProductCard product={item} onPress={handlePress} />
      )}
    />
  );
}
```

**性能优化原则**：
- `useMemo` 用于缓存昂贵计算的结果
- `useCallback` 用于缓存传递给子组件的回调函数
- 不要过度使用：简单的值和函数不需要缓存，缓存本身也有开销

### 1.5 useRef

```tsx
function CameraScreen() {
  // 1. 引用 DOM/组件实例
  const cameraRef = useRef<Camera>(null);

  const takePhoto = async () => {
    const photo = await cameraRef.current?.takePhoto();
    // ...
  };

  return <Camera ref={cameraRef} />;

  // 2. 存储可变值不触发重渲染
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchData = async () => {
    const data = await API.fetch();
    if (isMounted.current) {
      setData(data);  // 仅在组件挂载时更新
    }
  };
}
```

### 1.6 useEffect 与依赖管理

```tsx
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  // 正确的依赖管理
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const data = await fetchUser(userId);
      if (!cancelled) {
        setUser(data);
      }
    };

    loadUser();

    // 清理函数：防止竞态条件和内存泄漏
    return () => {
      cancelled = true;
    };
  }, [userId]);  // 依赖数组：userId 变化时重新执行

  // 空依赖数组：仅在挂载时执行一次
  useEffect(() => {
    const subscription = DeviceEvent.addListener('update', handler);
    return () => subscription.remove();
  }, []);

  // 无依赖数组：每次渲染都执行（避免使用）
  useEffect(() => {
    // 每次渲染都执行，慎用
  });
}
```

---

## 二、Redux Toolkit

### 2.1 创建 Store

```tsx
import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// 1. 创建 Slice
const deviceSlice = createSlice({
  name: 'devices',
  initialState: {
    list: [] as Device[],
    selectedId: null as string | null,
    loading: false,
    error: null as string | null,
  },
  reducers: {
    // Immer 自动处理不可变更新
    selectDevice: (state, action) => {
      state.selectedId = action.payload;
    },
    clearSelection: (state) => {
      state.selectedId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDevices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDevices.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchDevices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

// 2. 异步 Thunk
const fetchDevices = createAsyncThunk(
  'devices/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      return await DeviceService.getAllDevices();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// 3. 配置 Store
const store = configureStore({
  reducer: {
    devices: deviceSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // 允许非序列化值（如 Date）
        ignoredActions: ['devices/fetchAll/fulfilled'],
      },
    }),
});

export const { selectDevice, clearSelection } = deviceSlice.actions;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### 2.2 在组件中使用

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { fetchDevices, selectDevice } from './store';

// 类型安全的 Hooks
import { RootState, AppDispatch } from './store';
const useAppDispatch = () => useDispatch<AppDispatch>();
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

function DeviceList() {
  const dispatch = useAppDispatch();
  const { list, loading, error } = useAppSelector(state => state.devices);

  useEffect(() => {
    dispatch(fetchDevices());
  }, [dispatch]);

  if (loading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <FlatList
      data={list}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => dispatch(selectDevice(item.id))}>
          <Text>{item.name}</Text>
        </Pressable>
      )}
    />
  );
}
```

---

## 三、Zustand

### 3.1 为什么选 Zustand

Zustand 相比 Redux 的优势：
- 无 Provider 包裹
- 无样板代码
- 天然支持 TypeScript
- 包体积更小（~1KB vs ~3KB）
- 无需 reducer/action/type

```tsx
import { create } from 'zustand';

interface DeviceStore {
  devices: Device[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  fetchDevices: () => Promise<void>;
  selectDevice: (id: string) => void;
  clearSelection: () => void;
}

const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  selectedId: null,
  loading: false,
  error: null,

  fetchDevices: async () => {
    set({ loading: true, error: null });
    try {
      const devices = await DeviceService.getAllDevices();
      set({ devices, loading: false });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  selectDevice: (id) => set({ selectedId: id }),
  clearSelection: () => set({ selectedId: null }),
}));

// 在组件中使用（无需 Provider）
function DeviceList() {
  const devices = useDeviceStore(state => state.devices);
  const loading = useDeviceStore(state => state.loading);
  const fetchDevices = useDeviceStore(state => state.fetchDevices);
  const selectDevice = useDeviceStore(state => state.selectDevice);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return (
    <FlatList
      data={devices}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => selectDevice(item.id)}>
          <Text>{item.name}</Text>
        </Pressable>
      )}
    />
  );
}

// 选择器优化：只在 devices 变化时重新渲染
const deviceNames = useDeviceStore(useShallow(state => 
  state.devices.map(d => d.name)
));
```

---

## 四、React Query（TanStack Query）

React Query 专注于服务端状态管理（数据获取、缓存、同步），与上述本地状态管理方案互补。

```tsx
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';

// 配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5分钟内不重新请求
      cacheTime: 1000 * 60 * 30,  // 缓存保留 30 分钟
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}

// 查询数据
function DeviceList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: () => DeviceService.getAllDevices(),
  });

  if (isLoading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <FlatList
      data={data}
      keyExtractor={item => item.id}
      refreshing={false}
      onRefresh={refetch}
      renderItem={({ item }) => <DeviceCard device={item} />}
    />
  );
}

// 变更数据
function useRenameDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      DeviceService.rename(id, name),
    
    // 乐观更新
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ['devices'] });
      const previousDevices = queryClient.getQueryData<Device[]>(['devices']);
      
      queryClient.setQueryData<Device[]>(['devices'], (old) =>
        old?.map(d => d.id === id ? { ...d, name } : d)
      );
      
      return { previousDevices };
    },
    
    onError: (err, vars, context) => {
      // 回滚
      queryClient.setQueryData(['devices'], context?.previousDevices);
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
```

---

## 五、状态管理方案选型

| 方案 | 适用场景 | 复杂度 | 包体积 | 特点 |
|------|---------|--------|--------|------|
| useState/useReducer | 局部状态 | 低 | 0 | React 内置 |
| Context | 跨组件共享简单状态 | 低 | 0 | React 内置，慎防过度渲染 |
| Redux Toolkit | 大型应用全局状态 | 高 | ~3KB | 成熟生态，DevTools 强大 |
| Zustand | 中型应用全局状态 | 低 | ~1KB | 简洁轻量，无 Provider |
| React Query | 服务端数据缓存 | 中 | ~13KB | 自动缓存/重试/同步 |
| MobX | 响应式数据绑定 | 中 | ~5KB | 自动追踪依赖 |

**选型建议**：
- 简单应用：useState + Context + React Query
- 中型应用：Zustand + React Query
- 大型应用：Redux Toolkit + React Query
- 任何规模都推荐 React Query 管理服务端数据，与本地状态管理方案搭配使用
