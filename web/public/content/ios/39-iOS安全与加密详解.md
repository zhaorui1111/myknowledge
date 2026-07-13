# iOS 安全与加密详解

## 一、安全威胁模型

iOS App 面临的安全威胁主要包括：逆向工程（反编译分析业务逻辑）、数据泄露（敏感信息被提取）、网络攻击（中间人攻击、流量劫持）、代码注入（动态库注入、Method Swizzling）、重签名打包（二次打包分发）。

安全防护的目标不是绝对安全，而是提高攻击成本，使其在合理时间内无法得手。防护措施应根据数据敏感程度分层部署。

## 二、Keychain 与数据保护

### 2.1 Keychain 安全存储

Keychain 使用硬件级加密（Secure Enclave），是存储密码、Token 等敏感信息的最佳选择。

```swift
// 存储时设置访问级别
attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
```

访问级别从高到低：
- `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`：仅在设备设置了密码时可访问，不随备份迁移（最高安全）
- `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`：设备解锁时可访问，不随备份迁移
- `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`：首次解锁后可访问，不随备份迁移
- `kSecAttrAccessibleWhenUnlocked`：设备解锁时可访问，随备份迁移
- `kSecAttrAccessibleAlways`：始终可访问（已废弃）

### 2.2 文件保护级别

```swift
// 写入文件时设置保护级别
try data.write(to: fileURL, options: [.completeFileProtection])
```

- `.completeFileProtection`：设备锁定后文件密钥从内存中清除，文件不可读
- `.completeFileProtectionUnlessOpen`：文件打开后保持可访问，适合需要后台访问的文件
- `.completeFileProtectionUntilFirstUserAuthentication`：首次解锁后一直可访问（默认）

### 2.3 Secure Enclave

Secure Enclave 是独立的安全协处理器，用于管理加密密钥和生物识别数据。密钥在 Secure Enclave 内部生成和存储，永不离开芯片。

```swift
// 使用 Secure Enclave 生成密钥
let attributes: [String: Any] = [
    kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
    kSecAttrKeySizeInBits as String: 256,
    kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: tag,
        kSecAttrAccessControl as String: SecAccessControlCreate(
            kCFAllocatorDefault,
            kSecAttrAccessControlBiometryCurrentSet,  // 需要生物识别
            nil
        )!
    ]
]

let privateKey = try SecKeyCreateRandomKey(attributes as CFDictionary, &error)
```

## 三、网络通信安全

### 3.1 HTTPS 与 ATS

App Transport Security（ATS）强制使用 HTTPS 连接。在 Info.plist 中配置：

```xml
<!-- 完全启用 ATS（推荐） -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>

<!-- 例外：允许特定域名使用 HTTP -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### 3.2 SSL Pinning（证书绑定）

防止中间人攻击，验证服务器证书而非信任系统证书链：

```swift
// URLSession Delegate 方式
class PinningDelegate: NSObject, URLSessionDelegate {
    func urlSession(_ session: URLSession,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // 方式一：验证证书
        if let localCertData = loadLocalCertData(),
           let remoteCert = SecTrustGetCertificateAtIndex(serverTrust, 0) {
            let remoteCertData = SecCertificateCopyData(remoteCert) as Data
            if localCertData == remoteCertData {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }

        // 方式二：验证公钥（推荐，证书更新时无需改代码）
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}
```

公钥绑定比证书绑定更灵活——证书更新时只要公钥不变就不需要更新 App。

### 3.3 请求签名

```swift
class APIClient {
    func signRequest(_ request: URLRequest) -> URLRequest {
        var signedRequest = request
        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = UUID().uuidString

        // 构建签名串
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? ""
        let body = request.httpBody?.base64EncodedString() ?? ""

        let stringToSign = "\(method)\n\(path)\n\(timestamp)\n\(nonce)\n\(body)"

        // 使用 HMAC-SHA256 签名
        let key = "secret_key_from_keychain"
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(stringToSign.utf8),
            using: SymmetricKey(data: Data(key.utf8))
        )

        signedRequest.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        signedRequest.setValue(nonce, forHTTPHeaderField: "X-Nonce")
        signedRequest.setValue(signature.base64EncodedString(), forHTTPHeaderField: "X-Signature")

        return signedRequest
    }
}
```

签名密钥不应硬编码在代码中，应从 Keychain 动态获取或通过挑战-响应机制协商。

## 四、代码安全与反逆向

### 4.1 代码混淆

**字符串混淆**：敏感字符串（API 密钥、URL）不应以明文存在于二进制中。

```swift
// 不安全
let apiKey = "sk-xxxxxxxxxxxxx"

// 简单混淆：运行时拼接或解码
let apiKey = ["sk-", "xxxx", "xxxx", "xxx", "xx"].joined()
let apiKey = String(data: Data(base64Encoded: "c2steHh4eHh4eHh4eHg=")!, encoding: .utf8)!

// 更安全：使用白盒加密，密钥分散在代码中
```

**符号混淆**：在 Release 构建中剥离符号（Strip Style: All Symbols）。但 ObjC 方法名无法剥离（runtime 需要方法名）。

### 4.2 反调试

检测调试器附加：

```c
#include <sys/types.h>
#include <sys/sysctl.h>

bool isBeingDebugged() {
    int name[4] = {CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()};
    struct kinfo_proc info;
    size_t info_size = sizeof(info);

    if (sysctl(name, 4, &info, &info_size, NULL, 0) == -1) {
        return false;
    }

    return (info.kp_proc.p_flag & P_TRACED) != 0;
}

// 定期检查
if (isBeingDebugged()) {
    // 退出或禁用功能
    exit(0);
}
```

### 4.3 越狱检测

```swift
func isJailbroken() -> Bool {
    let jailbreakPaths = [
        "/Applications/Cydia.app",
        "/Library/MobileSubstrate/MobileSubstrate.dylib",
        "/bin/bash",
        "/usr/sbin/sshd",
        "/etc/apt",
        "/private/var/lib/apt/"
    ]

    for path in jailbreakPaths {
        if FileManager.default.fileExists(atPath: path) {
            return true
        }
    }

    // 检查是否能写系统目录
    let testString = "jailbreak_test"
    do {
        try testString.write(toFile: "/private/jailbreak_test.txt", atomically: true, encoding: .utf8)
        try? FileManager.default.removeItem(atPath: "/private/jailbreak_test.txt")
        return true
    } catch {
        return false
    }
}
```

越狱检测不是绝对可靠的——越狱工具会绕过常见检测。应组合多种检测方式，并定期更新。

### 4.4 完整性校验

```swift
func verifyCodeSignature() -> Bool {
    let bundlePath = Bundle.main.bundlePath
    let executablePath = (bundlePath as NSString).appendingPathComponent(Bundle.main.executableURL?.lastPathComponent ?? "")

    var staticCode: SecStaticCode?
    let result = SecStaticCodeCreateWithPath(executablePath as CFURL, [], &staticCode)

    guard result == errSecSuccess, let code = staticCode else {
        return false
    }

    // 验证签名
    let requirement = "cdhash H\"abcdef0123456789\""  // 预期的 cdhash
    var req: SecRequirement?
    SecRequirementCreateWithString(requirement as CFString, [], &req)

    if let req = req {
        return SecStaticCodeCheckValidity(code, [.basicOnly], req) == errSecSuccess
    }
    return false
}
```

## 五、CryptoKit

iOS 13 引入 CryptoKit，提供 Swift 原生的加密 API：

### 5.1 哈希

```swift
import CryptoKit

let data = Data("Hello".utf8)

let md5 = Insecure.MD5.hash(data: data)       // 不安全，仅兼容用
let sha256 = SHA256.hash(data: data)           // 推荐
let sha512 = SHA512.hash(data: data)

let hashString = sha256.map { String(format: "%02x", $0) }.joined()
```

### 5.2 对称加密

```swift
// AES-GCM
let key = SymmetricKey(size: .bits256)
let nonce = AES.GCM.Nonce()
let sealedBox = try AES.GCM.seal(data, using: key, nonce: nonce)

// 加密结果 = nonce + ciphertext + tag
let combined = sealedBox.combined!

// 解密
let openedBox = try AES.GCM.open(sealedBox, using: key)
```

### 5.3 非对称加密

```swift
// Curve25519 密钥对
let privateKey = Curve25519.KeyAgreement.PrivateKey()
let publicKey = privateKey.publicKey

// 密钥协商
let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: otherPublicKey)

// 从共享密钥派生对称密钥
let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
    using: SHA256.self,
    salt: Data(),
    sharedInfo: Data(),
    outputByteCount: 32
)
```

### 5.4 签名验证

```swift
// Ed25519 签名
let signingKey = Curve25519.Signing.PrivateKey()
let signature = try signingKey.signature(for: data)

// 验证
let isValid = signingKey.publicKey.isValidSignature(signature, for: data)
```

## 六、安全最佳实践清单

数据存储：敏感信息存 Keychain（`WhenPasscodeSetThisDeviceOnly`），文件设 `.completeFileProtection`，不在 UserDefaults 存敏感数据，不在日志打印敏感信息。

网络通信：全量 HTTPS + SSL Pinning，请求签名防篡改，Token 定期刷新，API 响应校验。

代码保护：Release 构建剥离符号，字符串加密混淆，越狱检测降级功能，反调试检测，完整性校验。

密钥管理：密钥存 Keychain 或 Secure Enclave，不在代码中硬编码，运行时组装密钥，白盒加密分散密钥。
