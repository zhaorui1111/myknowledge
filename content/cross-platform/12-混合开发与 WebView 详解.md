# 混合开发与 WebView 详解

---

## 一、混合开发模式概述

移动端混合开发指 Native 与 Web（HTML/CSS/JS）技术的结合，核心目标是兼顾开发效率和用户体验。

```
┌─────────────────────────────────────────────────────────────────┐
│                     混合开发技术谱系                             │
├──────────────────┬──────────────────────────────────────────────┤
│  纯 Native        │  最佳性能、体验，开发成本最高                  │
├──────────────────┼──────────────────────────────────────────────┤
│  Hybrid (WebView) │  Web 开发效率，通过 JSBridge 调用原生能力      │
├──────────────────┼──────────────────────────────────────────────┤
│  Hybrid+          │  WebView + 原生渲染混合（如 Weex、DSBridge）   │
├──────────────────┼──────────────────────────────────────────────┤
│  跨端框架          │  RN/Flutter 自绘 UI，接近原生体验              │
├──────────────────┼──────────────────────────────────────────────┤
│  纯 Web (PWA)     │  开发效率最高，能力受限、体验最差               │
└──────────────────┴──────────────────────────────────────────────┘
```

### 1.1 WebView 混合方案分类

| 方案 | 代表 | 特点 |
|------|------|------|
| 基础 WebView | Cordova/PhoneGap | 纯 WebView + JSBridge |
| 增强 WebView | Ionic/Capacitor | WebView + 原生 UI 组件 |
| 自研容器 | 微信小程序/美团 WebView | 定制 WebView + 调度 + 离线包 |
| 原生渲染 | Weex/DSBridge | JS 引擎 + 原生组件树 |

---

## 二、WebView 基础

### 2.1 iOS WKWebView

```swift
import WebKit

class WebViewController: UIViewController {
    var webView: WKWebView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // 1. 配置 WKWebViewConfiguration
        let config = WKWebViewConfiguration()
        
        // 2. 添加 JS 交互接口
        let userContentController = WKUserContentController()
        
        // 注册 JS 调原生的消息处理器
        userContentController.add(MessageHandlerDelegate(), name: "nativeBridge")
        
        // 注入 JS
        let bridgeScript = WKUserScript(
            source: """
            window.nativeBridge = {
                call: function(method, params, callback) {
                    window.webkit.messageHandlers.nativeBridge.postMessage({
                        method: method,
                        params: params || {},
                        callbackId: callback
                    });
                }
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(bridgeScript)
        
        config.userContentController = userContentController
        config.preferences.javaScriptEnabled = true
        
        // 3. 创建 WebView
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        view.addSubview(webView)
        
        // 4. 加载页面
        let url = URL(string: "https://app.example.com/index.html")!
        webView.load(URLRequest(url: url))
    }
}

// JS 调原生的消息处理器
class MessageHandlerDelegate: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard message.name == "nativeBridge" else { return }
        
        let body = message.body as! [String: Any]
        let method = body["method"] as! String
        let params = body["params"] as? [String: Any]
        let callbackId = body["callbackId"] as? String
        
        switch method {
        case "getDeviceInfo":
            let deviceInfo: [String: Any] = [
                "model": UIDevice.current.model,
                "systemVersion": UIDevice.current.systemVersion,
                "bundleId": Bundle.main.bundleIdentifier ?? ""
            ]
            // 原生调 JS 回调
            if let callbackId = callbackId {
                let json = try! JSONSerialization.data(withJSONObject: deviceInfo)
                let jsonString = String(data: json, encoding: .utf8)!
                message.frameInfo.webView?.evaluateJavaScript(
                    "window.nativeBridge.callbacks['\(callbackId)'](\(jsonString));",
                    completionHandler: nil
                )
            }
            
        case "openCamera":
            // 打开相机...
            break
            
        default:
            break
        }
    }
}
```

### 2.2 Android WebView

```kotlin
class WebActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this).also {
            // 1. 配置 WebSettings
            it.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString = "$userAgentString MyApp/1.0"
            }
            
            // 2. 添加 JS 接口
            it.addJavascriptInterface(NativeBridge(this), "nativeBridge")
            
            // 3. 设置 WebViewClient
            it.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // 拦截自定义 scheme
                    val url = request.url.toString()
                    if (url.startsWith("myscheme://")) {
                        handleCustomScheme(url)
                        return true
                    }
                    return false
                }
            }
            
            setContentView(it)
            
            // 4. 加载页面
            it.loadUrl("https://app.example.com/index.html")
        }
    }
    
    // JS 接口类
    class NativeBridge(private val context: Context) {
        
        @JavascriptInterface
        fun getDeviceInfo(callbackId: String) {
            val deviceInfo = JSONObject().apply {
                put("model", android.os.Build.MODEL)
                put("version", android.os.Build.VERSION.RELEASE)
                put("package", context.packageName)
            }
            
            // 回调 JS
            (context as Activity).runOnUiThread {
                val webView = (context as WebActivity).webView
                webView.evaluateJavascript(
                    "window.nativeBridge.callbacks['$callbackId']($deviceInfo);",
                    null
                )
            }
        }
        
        @JavascriptInterface
        fun openCamera(callbackId: String) {
            // 打开相机
        }
    }
    
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
    
    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
```

---

## 三、JSBridge 设计

### 3.1 JSBridge 通信原理

```
┌─────────────────────────────────────────────────────────────┐
│                    JSBridge 通信流程                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   JS (WebView)                    Native                    │
│       │                             │                       │
│       │  1. nativeBridge.call(      │                       │
│       │     'getDeviceInfo',        │                       │
│       │     {}, callback)           │                       │
│       │ ─────────────────────────→  │                       │
│       │  (iOS: postMessage)         │                       │
│       │  (Android: @JavascriptInterface)                    │
│       │                             │                       │
│       │                             │  2. 执行原生逻辑       │
│       │                             │     getDeviceInfo()   │
│       │                             │                       │
│       │  3. evaluateJavaScript(     │                       │
│       │     callback(result))       │                       │
│       │ ←─────────────────────────  │                       │
│       │                             │                       │
│   4. 执行回调函数                    │                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 完整 JSBridge 实现

```javascript
// H5 侧 JSBridge SDK
(function(window) {
    var callbackId = 0;
    var callbacks = {};
    
    var JSBridge = {
        callbacks: callbacks,
        
        // 调用原生方法
        call: function(method, params, callback) {
            var id = 'cb_' + (++callbackId);
            callbacks[id] = callback;
            
            var message = {
                method: method,
                params: params || {},
                callbackId: id
            };
            
            // iOS
            if (window.webkit && window.webkit.messageHandlers.nativeBridge) {
                window.webkit.messageHandlers.nativeBridge.postMessage(message);
            }
            // Android
            else if (window.nativeBridge && window.nativeBridge.postMessage) {
                window.nativeBridge.postMessage(JSON.stringify(message));
            }
            // 降级：prompt 方式
            else {
                var result = prompt('jsbridge://' + method + '?' + JSON.stringify(params));
                if (callback) {
                    callback(JSON.parse(result));
                }
            }
        },
        
        // 原生调用 JS
        onNativeEvent: function(event, data) {
            var listeners = eventListeners[event];
            if (listeners) {
                listeners.forEach(function(listener) {
                    listener(data);
                });
            }
        }
    };
    
    // 事件监听
    var eventListeners = {};
    JSBridge.on = function(event, listener) {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(listener);
    };
    
    JSBridge.off = function(event, listener) {
        var listeners = eventListeners[event];
        if (listeners) {
            var index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    };
    
    window.JSBridge = JSBridge;
})(window);

// 使用示例
JSBridge.call('getDeviceInfo', {}, function(device) {
    console.log('Model:', device.model);
    console.log('OS:', device.systemVersion);
});

JSBridge.call('openCamera', { quality: 'high' }, function(result) {
    if (result.success) {
        showImage(result.base64);
    }
});

JSBridge.on('networkChange', function(info) {
    console.log('Network changed:', info.type);
});
```

### 3.3 URL Scheme 拦截方案（兼容方案）

```dart
// Flutter WebView 中拦截 URL
WebView(
  javascriptMode: JavascriptMode.unrestricted,
  navigationDelegate: (NavigationRequest request) {
    if (request.url.startsWith('jsbridge://')) {
      // 解析 scheme
      final uri = Uri.parse(request.url);
      final method = uri.host;
      final params = uri.queryParameters;
      
      // 执行原生方法
      _handleBridgeCall(method, params);
      
      return NavigationDecision.prevent;  // 阻止导航
    }
    return NavigationDecision.navigate;
  },
  onMessageReceived: (JavaScriptMessage message) {
    // 处理 JS 消息
    final data = jsonDecode(message.message);
    _handleBridgeCall(data['method'], data['params']);
  },
)
```

---

## 四、离线包方案

离线包是提升 WebView 页面加载速度的关键技术。

### 4.1 离线包架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      离线包系统架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐         ┌──────────────┐                     │
│   │  CDN/服务端  │ ←───── │  离线包管理平台 │                     │
│   │  (zip 包)    │         │  (构建/发布)   │                     │
│   └─────────────┘         └──────────────┘                     │
│         │                           │                           │
│         ↓                           ↓                           │
│   ┌─────────────────────────────────────────────┐             │
│   │            客户端离线包引擎                    │             │
│   ├─────────────────────────────────────────────┤             │
│   │  1. 启动时检查更新 (版本对比)                  │             │
│   │  2. 后台下载差分包/全量包                      │             │
│   │  3. 解压到本地沙盒                            │             │
│   │  4. WebView 拦截请求，命中本地文件返回           │             │
│   │  5. 未命中时降级到网络请求                      │             │
│   └─────────────────────────────────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 离线包目录结构

```
offline_packages/
├── home/                    # 首页模块
│   ├── manifest.json        # 离线包清单
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── images/
├── user/                    # 用户模块
│   ├── manifest.json
│   └── ...
└── config.json              # 全局配置（版本号、模块列表）
```

```json
// manifest.json
{
  "moduleId": "home",
  "version": "1.2.0",
  "pages": [
    { "path": "/index.html", "hash": "a1b2c3d4" },
    { "path": "/css/main.css", "hash": "e5f6g7h8" }
  ]
}
```

### 4.3 请求拦截（iOS WKURLSchemeHandler）

```swift
// iOS 11+ 使用 WKURLSchemeHandler 拦截请求
class OfflinePackageSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let url = urlSchemeTask.request.url!
        
        // 解析路径
        let path = url.path
        let moduleId = url.host!
        
        // 查找本地文件
        let localPath = getOfflinePath(moduleId: moduleId, path: path)
        
        if FileManager.default.fileExists(atPath: localPath) {
            // 命中离线包
            let data = try! Data(contentsOf: URL(fileURLWithPath: localPath))
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": mimeType(for: path)]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            // 未命中，降级到网络请求
            URLSession.shared.dataTask(with: url) { data, response, error in
                if let data = data, let response = response {
                    urlSchemeTask.didReceive(response)
                    urlSchemeTask.didReceive(data)
                    urlSchemeTask.didFinish()
                } else {
                    urlSchemeTask.didFailWithError(error!)
                }
            }.resume()
        }
    }
    
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // 取消请求
    }
}

// 注册
let config = WKWebViewConfiguration()
config.setURLSchemeHandler(OfflinePackageSchemeHandler(), forURLScheme: "offline")
```

---

## 五、WebView 性能优化

### 5.1 预加载 WebView

```android
// Android: 全局 WebView 池
class WebViewPool {
    private val pool = Stack<WebView>()
    
    fun prepare(context: Context) {
        for (i in 0 until 2) {
            val webView = WebView(context)
            // 预热：加载空白页
            webView.loadDataWithBaseURL(null, "", "text/html", "utf-8", null)
            pool.push(webView)
        }
    }
    
    fun obtain(context: Context): WebView {
        return if (pool.isNotEmpty()) {
            pool.pop()
        } else {
            WebView(context)
        }
    }
    
    fun recycle(webView: WebView) {
        webView.clearHistory()
        webView.loadUrl("about:blank")
        pool.push(webView)
    }
}
```

### 5.2 预加载资源

```dart
// Flutter WebView 预加载
Future<void> preloadWebContent() async {
  // 预加载 HTML
  final response = await http.get(Uri.parse('https://app.example.com/page.html'));
  
  // 缓存到本地
  await File('${appDocPath}/cache/page.html').writeAsString(response.body);
}

// 使用本地文件加载
WebView(
  initialFile: '${appDocPath}/cache/page.html',
)
```

### 5.3 按需加载 JS/CSS

```html
<!-- 延迟加载非关键 JS -->
<script>
  // 1. 首屏关键 CSS 内联
  // 2. 非关键 JS 延迟加载
  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.body.appendChild(script);
  }
  
  // DOMContentLoaded 后加载
  document.addEventListener('DOMContentLoaded', function() {
    loadScript('js/analytics.js');
    loadScript('js/lazy-features.js');
  });
</script>
```

---

## 六、Flutter 中的 WebView

### 6.1 webview_flutter

```dart
import 'package:webview_flutter/webview_flutter.dart';

class WebPage extends StatefulWidget {
  final String url;
  const WebPage({super.key, required this.url});

  @override
  State<WebPage> createState() => _WebPageState();
}

class _WebPageState extends State<WebPage> {
  late final WebViewController _controller;
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            setState(() => _progress = progress / 100);
          },
          onPageStarted: (url) {
            print('Page started: $url');
          },
          onPageFinished: (url) {
            print('Page finished: $url');
            // 注入 JSBridge
            _injectBridge();
          },
          onWebResourceError: (error) {
            print('Error: ${error.description}');
          },
          onNavigationRequest: (request) {
            // 拦截特定 URL
            if (request.url.startsWith('myapp://')) {
              _handleDeepLink(request.url);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..addJavaScriptChannel(
        'nativeBridge',
        onMessageReceived: (JavaScriptMessage message) {
          final data = jsonDecode(message.message);
          _handleBridgeCall(data);
        },
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  Future<void> _injectBridge() async {
    await _controller.runJavaScript('''
      window.JSBridge = {
        call: function(method, params) {
          nativeBridge.postMessage(JSON.stringify({
            method: method,
            params: params || {}
          }));
        }
      };
    ''');
  }

  void _handleBridgeCall(Map<String, dynamic> data) {
    final method = data['method'];
    final params = data['params'];
    
    switch (method) {
      case 'closePage':
        Navigator.pop(context);
        break;
      case 'showToast':
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(params['message'])),
        );
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: LinearProgressIndicator(value: _progress),
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}
```

### 6.2 Flutter 与 WebView 通信

```dart
// Flutter 调 JS
Future<void> _callJSMethod() async {
  final result = await _controller.runJavaScriptReturningResult(
    'window.app.getData()'
  );
  print('JS returned: $result');
}

// JS 调 Flutter（通过 JavaScriptChannel）
// 已在上方 addJavaScriptChannel 中处理
```

---

## 七、混合开发架构实践

### 7.1 统一路由管理

```dart
// 统一路由：原生页面和 H5 页面都通过路由表管理
class HybridRouter {
  static const _webRoutes = {
    '/help': 'https://app.example.com/help',
    '/about': 'https://app.example.com/about',
    '/agreement': 'https://app.example.com/agreement',
  };
  
  static const _nativeRoutes = {
    '/home': HomePage,
    '/profile': ProfilePage,
    '/settings': SettingsPage,
  };
  
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final path = settings.name!;
    
    // 原生路由
    if (_nativeRoutes.containsKey(path)) {
      return MaterialPageRoute(
        builder: (_) => _nativeRoutes[path]!(),
        settings: settings,
      );
    }
    
    // Web 路由
    if (_webRoutes.containsKey(path)) {
      return MaterialPageRoute(
        builder: (_) => WebPage(url: _webRoutes[path]!),
        settings: settings,
      );
    }
    
    // 远程动态路由
    if (path.startsWith('/web/')) {
      final url = path.replaceFirst('/web/', 'https://app.example.com/');
      return MaterialPageRoute(
        builder: (_) => WebPage(url: url),
        settings: settings,
      );
    }
    
    return MaterialPageRoute(builder: (_) => NotFoundPage());
  }
}
```

### 7.2 登录态同步

```dart
// 原生登录后同步 token 到 WebView Cookie
class WebCookieManager {
  static Future<void> syncAuthCookies(String token, String domain) async {
    final cookieManager = WebViewCookieManager();
    
    await cookieManager.setCookie(
      WebViewCookie(
        name: 'auth_token',
        value: token,
        domain: domain,
        path: '/',
      ),
    );
    
    await cookieManager.setCookie(
      WebViewCookie(
        name: 'platform',
        value: 'flutter',
        domain: domain,
        path: '/',
      ),
    );
  }
}

// 使用
await WebCookieManager.syncAuthCookies(userToken, '.example.com');
// 之后打开 WebView 会自动携带 Cookie
```

### 7.3 调试与监控

```dart
// WebView 异常监控
class WebViewMonitor {
  static void reportError({
    required String url,
    required String error,
    StackTrace? stack,
  }) {
    // 上报到监控平台
    Analytics.logEvent(
      name: 'webview_error',
      parameters: {
        'url': url,
        'error': error,
        'stack': stack?.toString(),
      },
    );
  }
}

// H5 侧异常上报
// window.onerror = function(msg, url, line, col, error) {
//   JSBridge.call('reportError', {
//     msg: msg,
//     url: url,
//     line: line,
//     col: col,
//     stack: error && error.stack
//   });
// };
```

---

## 八、混合开发的挑战与权衡

| 维度 | 纯原生 | Hybrid (WebView) | 跨端框架 (RN/Flutter) |
|------|--------|-------------------|----------------------|
| 开发效率 | 低（双端开发） | 高（一套代码） | 中（一套代码，需原生桥接） |
| 性能 | 最优 | 较差（WebView 开销） | 较好（接近原生） |
| 动态化 | 差（需发版） | 最优（H5 可热更新） | 差（需发版或热更新框架） |
| 首屏速度 | 最快 | 慢（WebView 初始化 + 网络加载） | 快（本地资源） |
| 用户体验 | 最佳 | 一般（有白屏、卡顿问题） | 较好 |
| 能力覆盖 | 完整 | 受限（通过 JSBridge 扩展） | 较完整（通过插件扩展） |
| 团队成本 | 高（需 iOS/Android + Web） | 低（主要 Web 团队） | 中（需框架学习成本） |

**选型建议**：
- 高频核心页面（首页、商品页）：原生或 Flutter/RN
- 低频内容页（帮助、协议、活动）：WebView
- 需要快速迭代的营销活动页：WebView
- 需要复杂交互和动画：原生或 Flutter

---

## 九、小结

混合开发通过 WebView 和 JSBridge 实现 Web 与原生的通信协作，核心在于 JSBridge 的设计、离线包加速和 WebView 预加载优化。在实际项目中，通常采用原生 + WebView + 跨端框架的组合策略，根据页面特性选择最合适的技术方案。离线包技术能显著提升 WebView 页面的首屏加载速度，而统一的 Cookie/登录态同步和路由管理是混合开发架构的基础设施。
