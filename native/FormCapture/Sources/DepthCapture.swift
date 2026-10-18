import Foundation
import ARKit
import Vision
import CoreImage
import UIKit
import Combine

final class DepthCapture: NSObject, ObservableObject, ARSessionDelegate {
    let session = ARSession()
    let supported: Bool = ARWorldTrackingConfiguration.supportsFrameSemantics([.sceneDepth, .personSegmentationWithDepth])
    @Published private(set) var recording = false
    @Published private(set) var count = 0
    @Published private(set) var sectors = 0
    @Published private(set) var guidance = "Checking LiDAR support…"
    private let queue = DispatchQueue(label: "studio.form.capture", qos: .userInitiated)
    private let context = CIContext()
    private var running = false
    private var folder: URL?
    private var frames: [[String:Any]] = []
    private var directions = Set<Int>()
    private var initialCenter: SIMD3<Float>?
    private var lastTime: TimeInterval = 0
    override init() {
        super.init()
        session.delegate = self
        session.delegateQueue = queue
        guidance = supported ? "Ready for assisted capture." : "This device does not support the required LiDAR depth and person segmentation. Use web import or manual measurements."
        // Capture files are temporary sensitive data. Remove remnants of an
        // interrupted session on launch; never synchronize them to iCloud.
        let temp = FileManager.default.temporaryDirectory
        for url in (try? FileManager.default.contentsOfDirectory(at: temp, includingPropertiesForKeys: nil)) ?? [] where url.lastPathComponent.hasPrefix("form-depth-") {
            try? FileManager.default.removeItem(at: url)
        }
    }
    func start() {
        guard supported else { return }
        queue.async {
            do {
                if let folder = self.folder { try? FileManager.default.removeItem(at: folder) }
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("form-depth-" + UUID().uuidString)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: folder.path)
                self.folder = folder
                self.frames = []; self.directions = []; self.initialCenter = nil; self.lastTime = 0; self.running = true
                let config = ARWorldTrackingConfiguration()
                config.frameSemantics = [.sceneDepth, .personSegmentationWithDepth]
                self.session.run(config, options: [.resetTracking, .removeExistingAnchors])
                DispatchQueue.main.async { self.recording = true; self.count = 0; self.sectors = 0; self.guidance = "Keep the entire person visible. Walk slowly around all four sides." }
            } catch { self.report("Could not start a private capture.") }
        }
    }
    func stop() {
        queue.async { self.running = false; self.session.pause(); DispatchQueue.main.async { self.recording = false } }
    }
    func discard() {
        queue.async { if let folder = self.folder { try? FileManager.default.removeItem(at: folder) }; self.folder = nil; self.frames = [] }
    }
    private func report(_ text: String) { DispatchQueue.main.async { self.guidance = text } }
    func session(_ session: ARSession, didFailWithError error: Error) { running = false; session.pause(); DispatchQueue.main.async { self.recording = false; self.guidance = "Capture interrupted. Start a new scan." } }
    func sessionWasInterrupted(_ session: ARSession) { running = false; DispatchQueue.main.async { self.recording = false; self.guidance = "Capture interrupted. Start again while stationary." } }
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let folder = folder, frame.timestamp - lastTime >= 0.5, frames.count < 100,
              case .normal = frame.camera.trackingState,
              let depth = frame.sceneDepth, let confidence = depth.confidenceMap, let mask = frame.segmentationBuffer else { return }
        lastTime = frame.timestamp
        do {
            let pose = VNDetectHumanBodyPoseRequest()
            try VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, orientation: .up).perform([pose])
            guard let observations = pose.results, observations.count == 1 else { report("Keep exactly one person in frame."); return }
            let joints = try observations[0].recognizedPoints(.all)
            let required: [VNHumanBodyPoseObservation.JointName] = [.leftAnkle, .rightAnkle, .leftHip, .rightHip, .neck]
            guard required.allSatisfy({ (joints[$0]?.confidence ?? 0) > 0.3 }) else { report("Show the whole body, including both feet."); return }
            guard let left = joints[.leftHip], let right = joints[.rightHip] else { return }
            let x = (left.location.x + right.location.x) / 2
            let y = 1 - (left.location.y + right.location.y) / 2
            let w = CVPixelBufferGetWidth(depth.depthMap), h = CVPixelBufferGetHeight(depth.depthMap)
            CVPixelBufferLockBaseAddress(depth.depthMap, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(depth.depthMap, .readOnly) }
            let px = max(0, min(w - 1, Int(x * Double(w)))), py = max(0, min(h - 1, Int(y * Double(h))))
            let row = CVPixelBufferGetBaseAddress(depth.depthMap)!.advanced(by: py * CVPixelBufferGetBytesPerRow(depth.depthMap)).assumingMemoryBound(to: Float32.self)
            let distance = row[px]
            guard distance.isFinite, distance > 0.3, distance < 3 else { report("Move between 0.3 and 3 meters from the person."); return }
            var intrinsics = frame.camera.intrinsics
            let sx = Float(w) / Float(frame.camera.imageResolution.width), sy = Float(h) / Float(frame.camera.imageResolution.height)
            intrinsics[0][0] *= sx; intrinsics[1][1] *= sy; intrinsics[2][0] *= sx; intrinsics[2][1] *= sy
            let cameraPoint = SIMD4<Float>((Float(px) - intrinsics[2][0]) * distance / intrinsics[0][0], -(Float(py) - intrinsics[2][1]) * distance / intrinsics[1][1], -distance, 1)
            let center4 = frame.camera.transform * cameraPoint
            let center = SIMD3<Float>(center4.x, center4.y, center4.z)
            if let initial = initialCenter, simd_distance(center, initial) > 0.08 { report("The person moved or tracking drifted. Start a new scan."); return }
            if initialCenter == nil { initialCenter = center }
            let name = String(format: "f%03d", frames.count)
            let rgbUrl = folder.appendingPathComponent(name + ".jpg")
            guard let rgb = context.createCGImage(CIImage(cvPixelBuffer: frame.capturedImage), from: CIImage(cvPixelBuffer: frame.capturedImage).extent),
                  let jpg = UIImage(cgImage: rgb).jpegData(compressionQuality: 0.75),
                  let maskImage = context.createCGImage(CIImage(cvPixelBuffer: mask), from: CIImage(cvPixelBuffer: mask).extent),
                  let png = UIImage(cgImage: maskImage).pngData() else { return }
            try jpg.write(to: rgbUrl, options: .atomic)
            try png.write(to: folder.appendingPathComponent(name + "-mask.png"), options: .atomic)
            var depthData = Data(capacity: w * h * 4)
            let depthBase = CVPixelBufferGetBaseAddress(depth.depthMap)!
            for r in 0..<h { depthData.append(depthBase.advanced(by: r * CVPixelBufferGetBytesPerRow(depth.depthMap)).assumingMemoryBound(to: UInt8.self), count: w * 4) }
            try depthData.write(to: folder.appendingPathComponent(name + ".f32"), options: .atomic)
            CVPixelBufferLockBaseAddress(confidence, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(confidence, .readOnly) }
            guard CVPixelBufferGetWidth(confidence) == w, CVPixelBufferGetHeight(confidence) == h else { throw CaptureError.message("Invalid confidence resolution") }
            var confidenceData = Data(capacity: w * h)
            for r in 0..<h { confidenceData.append(CVPixelBufferGetBaseAddress(confidence)!.advanced(by: r * CVPixelBufferGetBytesPerRow(confidence)).assumingMemoryBound(to: UInt8.self), count: w) }
            try confidenceData.write(to: folder.appendingPathComponent(name + ".u8"), options: .atomic)
            frames.append(["rgb": name + ".jpg", "mask": name + "-mask.png", "depth": name + ".f32", "confidence": name + ".u8", "width": w, "height": h,
                "intrinsics": (0..<3).flatMap { column in (0..<3).map { intrinsics[column][$0] } },
                "cameraToWorld": (0..<4).flatMap { column in (0..<4).map { frame.camera.transform[column][$0] } },
                "bodyCenter": [center.x, center.y, center.z], "timestamp": frame.timestamp])
            let position = frame.camera.transform.columns.3
            let bearing = atan2(position.x - initialCenter!.x, position.z - initialCenter!.z)
            directions.insert(Int(floor((bearing + .pi) / (.pi / 2))) % 4)
            DispatchQueue.main.async { self.count = self.frames.count; self.sectors = self.directions.count; self.guidance = "Walk slowly around the stationary person. Capture all four sides." }
            if frames.count == 100 { stop() }
        } catch { report("A frame could not be captured. Stop and start a new scan.") }
    }
    func archive() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    guard !self.running, let folder = self.folder, self.frames.count >= 20, self.directions.count == 4 else { throw CaptureError.message("Stop capture after at least 20 frames across all four sides.") }
                    let manifest: [String:Any] = ["schemaVersion": 1, "units": "m", "upAxis": "y", "frames": self.frames]
                    try JSONSerialization.data(withJSONObject: manifest).write(to: folder.appendingPathComponent("manifest.json"), options: .atomic)
                    let archive = FileManager.default.temporaryDirectory.appendingPathComponent("form-depth-" + UUID().uuidString + ".zip")
                    try StoredZip.write(folder: folder, destination: archive)
                    continuation.resume(returning: archive)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
