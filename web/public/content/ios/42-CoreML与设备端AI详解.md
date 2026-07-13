# CoreML 与设备端 AI 详解

## 一、Core ML 概述

Core ML 是 Apple 的设备端机器学习框架，允许在 iOS 设备上运行训练好的模型，执行图像分类、目标检测、文本分析、语音识别等任务。设备端推理的优势：无需网络、低延迟、隐私保护、无服务器成本。

Core ML 支持的模型类型覆盖主流 ML 框架：TensorFlow、PyTorch、scikit-learn、XGBoost 等。通过 Core ML Tools 将这些框架训练的模型转换为 `.mlmodel` 格式。

## 二、模型集成

### 2.1 添加模型

将 `.mlmodel` 文件拖入 Xcode 项目。Xcode 自动生成 Swift 接口类：

```swift
// 假设模型名为 MobileNetV2.mlmodel
import CoreML

let model = try? MobileNetV2(configuration: MLModelConfiguration())

// 预测
let input = MobileNetV2Input(image: pixelBuffer)
let output = try? model?.prediction(input: input)
print(output?.classLabel)  // 分类结果
```

### 2.2 MLModelConfiguration

```swift
let config = MLModelConfiguration()
config.computeUnits = .all  // CPU + GPU + Neural Engine

// .cpuOnly: 仅 CPU（最慢但最兼容）
// .cpuAndGPU: CPU + GPU（不使用 Neural Engine）
// .all: CPU + GPU + Neural Engine（最快，默认）
```

### 2.3 异步预测

```swift
let prediction = try await model.prediction(input: input)
```

对于大模型，异步预测避免阻塞主线程。

## 三、Vision 框架

Vision 提供计算机视觉相关的高级 API，封装了常用的视觉任务，底层使用 Core ML：

### 3.1 图像分类

```swift
import Vision

func classifyImage(_ image: UIImage) {
    guard let cgImage = image.cgImage else { return }

    let request = VNCoreMLRequest(model: try! VNCoreMLModel(for: MobileNetV2().model)) { request, error in
        guard let results = request.results as? [VNClassificationObservation] else { return }

        for result in results.prefix(5) {
            print("\(result.identifier): \(result.confidence)")
        }
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([request])
}
```

### 3.2 人脸检测

```swift
let faceRequest = VNDetectFaceRectanglesRequest { request, error in
    guard let faces = request.results as? [VNFaceObservation] else { return }
    for face in faces {
        print("Face at: \(face.boundingBox)")  // 归一化坐标 (0-1)
    }
}

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([faceRequest])
```

### 3.3 文字识别

```swift
let textRequest = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    for observation in observations {
        if let text = observation.topCandidates(1).first {
            print("Text: \(text.string), confidence: \(text.confidence)")
        }
    }
}
textRequest.recognitionLevel = .accurate  // .fast 或 .accurate
textRequest.recognitionLanguages = ["zh-Hans", "en-US"]
```

### 3.4 目标检测

```swift
let request = VNCoreMLRequest(model: try! VNCoreMLModel(for: YOLOv3().model)) { request, error in
    guard let results = request.results as? [VNRecognizedObjectObservation] else { return }
    for detection in results {
        let boundingBox = detection.boundingBox
        let label = detection.labels.first?.identifier ?? "Unknown"
        let confidence = detection.labels.first?.confidence ?? 0
        print("\(label): \(confidence) at \(boundingBox)")
    }
}
```

### 3.5 Vision 与实时视频流

```swift
// 在 AVCaptureVideoDataOutput 回调中
func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    let request = VNCoreMLRequest(model: visionModel) { request, _ in
        // 处理结果
    }
    request.imageCropAndScaleOption = .scaleFill

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up)
    try? handler.perform([request])
}
```

## 四、Natural Language 框架

### 4.1 文本分类

```swift
import NaturalLanguage

let classifier = try? NLModel(mlModel: TextClassifier().model)

let label = classifier?.predictedLabel(for: "这个产品太棒了！")
print(label)  // "positive"

// 批量分类
let labels = classifier?.predictedLabels(for: ["好评", "差评", "还行"])
```

### 4.2 词性标注与命名实体识别

```swift
let tagger = NLTagger(tagSchemes: [.nameType, .lexicalClass])
tagger.string = "张三在北京大学读书"

let options: [NLTagger.Option: Any] = [
    .tokenize: true,
    .joinWhitespace: false
]

tagger.enumerateTags(in: tagger.string.startIndex..<tagger.string.endIndex,
                     unit: .word,
                     scheme: .nameType,
                     options: options) { tag, range in
    if let tag = tag {
        let word = tagger.string[range]
        print("\(word): \(tag)")  // 张三: PersonalName, 北京大学: OrganizationName
    }
    return true
}
```

### 4.3 语言识别

```swift
let recognizer = NLLanguageRecognizer()
recognizer.processString("Hello world")
let language = recognizer.dominantLanguage
print(language)  // Optional(English)
```

## 五、语音识别

### 5.1 Speech 框架

```swift
import Speech

// 请求权限
SFSpeechRecognizer.requestAuthorization { status in
    if status == .authorized {
        // 开始识别
    }
}

// 识别音频文件
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))!
let request = SFSpeechURLRecognitionRequest(url: audioURL)
recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        print(text)
        if result.isFinal {
            // 识别完成
        }
    }
}
```

### 5.2 实时语音识别

```swift
let audioEngine = AVAudioEngine()
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))!
let request = SFSpeechAudioBufferRecognitionRequest()
var recognitionTask: SFSpeechRecognitionTask?

func startListening() {
    let inputNode = audioEngine.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
        request.append(buffer)
    }

    audioEngine.prepare()
    try? audioEngine.start()

    recognitionTask = recognizer.recognitionTask(with: request) { result, error in
        if let result = result {
            let text = result.bestTranscription.formattedString
            print("Heard: \(text)")
        }
    }
}

func stopListening() {
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionTask?.cancel()
}
```

## 六、Create ML 模型训练

### 6.1 Create ML App

Xcode 自带的 Create ML App（Window → Get Started with Create ML）提供图形化训练界面，支持：

- 图像分类（Image Classification）
- 对象检测（Object Detection）
- 文本分类（Text Classification）
- 表格数据回归/分类（Tabular Regression/Classification）
- 声音分类（Sound Classification）
- 手势分类（Action Classification）

### 6.2 代码训练

```swift
import CreateML

// 训练图像分类器
let trainingData = MLImageClassifier.DataSource.labeledDirectories(at: URL(fileURLWithPath: "/path/to/training"))

let params = MLImageClassifier.ModelParameters(
    augmentation: [.crop, .rotation],
    maxIterations: 50
)

let classifier = try MLImageClassifier(trainingData: trainingData, parameters: params)

// 评估
let testData = MLImageClassifier.DataSource.labeledDirectories(at: URL(fileURLWithPath: "/path/to/test"))
let metrics = classifier.evaluation(on: testData)
print("Accuracy: \(metrics.classificationError)")

// 导出
let metadata = MLModelMetadata(author: "Developer", shortDescription: "Cat vs Dog", version: "1.0")
try classifier.write(to: URL(fileURLWithPath: "/path/to/Model.mlmodel"), metadata: metadata)
```

## 七、模型优化

### 7.1 模型压缩

```python
# Core ML Tools 压缩
import coremltools as ct

model = ct.models.MLModel("model.mlmodel")

# 量化到 8 位
quantized_model = ct.models.neural_network.quantization_utils.quantize_weights(model, nbits=8)
quantized_model.save("model_quantized.mlmodel")

# 量化到 6 位或 4 位（更小但精度降低）
# quantized_model = quantization_utils.quantize_weights(model, nbits=4)
```

8 位量化通常将模型体积减少 75%，精度损失极小。4 位量化减少 87.5%，但可能明显影响精度。

### 7.2 模型转换

```python
# PyTorch → Core ML
import coremltools as ct
import torch

# 先导出为 ONNX 或 TorchScript
# 再使用 coremltools 转换

# TensorFlow → Core ML
model = ct.convert("tensorflow_model.pb", source="tensorflow")
model.save("model.mlmodel")

# 设置输入输出
model = ct.convert(
    traced_model,
    inputs=[ct.TensorType(name="input", shape=(1, 3, 224, 224))],
    outputs=[ct.TensorType(name="output")]
)
```

## 八、性能考量

**模型大小**：`.mlmodel` 文件会增加 App 包体积。使用量化压缩或下载模型（首次启动后下载到沙盒）。

**推理速度**：Neural Engine 最快（A12+ 设备有 NPU），GPU 次之，CPU 最慢。对于实时性要求高的场景（视频帧处理），确保模型能在单帧时间内（16ms@60fps）完成推理。

**内存占用**：大模型在推理时占用大量内存。使用 Instruments 的 Allocations 工具监控峰值。对于图像模型，输入尺寸直接影响内存——224x224 是常用尺寸，512x512 内存会翻几倍。

**电量**：持续推理会快速消耗电量。降低推理频率、使用 `.fast` 识别级别、在非关键场景跳帧处理。
