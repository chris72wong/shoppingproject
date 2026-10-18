import SwiftUI
import ARKit
import SceneKit

@main
struct FormCaptureApp: App {
    @StateObject private var capture = DepthCapture()
    @State private var server: URL?
    @State private var sessionToken = ""
    @State private var height = ""
    @State private var consent = false
    @State private var status = "Pair this device from the web pilot."
    @State private var uploading = false
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 10) {
                Text("FORM Capture").font(.title)
                Text("An assistant walks around you while you stand still in an A-pose wearing close-fitting clothing.")
                CameraView(session: capture.session).frame(minHeight: 220).clipShape(RoundedRectangle(cornerRadius: 12))
                Text(capture.guidance).accessibilityAddTraits(.updatesFrequently)
                Text("\(capture.count) reliable frames · \(capture.sectors)/4 sides")
                TextField("Measured height in cm", text: $height).keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                Toggle("I consent to private cloud processing and authorized pilot review; raw captures expire within 24 hours, results after 30 inactive days. I am wearing close-fitting clothing.", isOn: $consent).font(.footnote)
                HStack {
                    Button("Start capture") { capture.start() }
                        .disabled(!capture.supported || capture.recording || sessionToken.isEmpty || !consent || uploading)
                    Button("Stop") { capture.stop() }.disabled(!capture.recording)
                    Button("Upload") { Task { await upload() } }
                        .disabled(capture.recording || capture.count < 20 || capture.sectors < 4 || sessionToken.isEmpty || !consent || uploading)
                }.buttonStyle(.bordered)
                Text(status).font(.footnote)
            }
            .padding()
            .onOpenURL { url in Task { await pair(url) } }
            .onDisappear { capture.stop() }
        }
    }
    @MainActor private func pair(_ url: URL) async {
        do {
            guard url.scheme == "formcapture", url.host == "pair",
                  let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let rawOrigin = components.queryItems?.first(where: { $0.name == "origin" })?.value,
                  let origin = URL(string: rawOrigin), origin.scheme == "https", origin.user == nil, origin.password == nil,
                  origin.path.isEmpty || origin.path == "/",
                  let code = components.queryItems?.first(where: { $0.name == "token" })?.value else {
                throw CaptureError.message("Pairing requires an HTTPS pilot origin.")
            }
            let api = PilotAPI(origin: origin, token: "")
            let paired: PairResponse = try await api.json("pairings/consume", payload: ["token": code])
            server = origin
            sessionToken = paired.token // Memory only; expires after one hour.
            status = "Paired. Enter your height, consent, and begin an assisted scan."
        } catch { status = error.localizedDescription }
    }
    @MainActor private func upload() async {
        guard let origin = server, let cm = Double(height), (80...250).contains(cm), consent else {
            status = "Enter a measured height between 80 and 250 cm and consent before uploading."
            return
        }
        uploading = true
        defer { uploading = false }
        do {
            status = "Preparing private capture…"
            let archive = try await capture.archive()
            defer { try? FileManager.default.removeItem(at: archive) }
            let size = try archive.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 150 * 1024 * 1024 else { throw CaptureError.message("Capture exceeds 150 MiB; use fewer frames.") }
            let api = PilotAPI(origin: origin, token: sessionToken)
            let created: UploadResponse = try await api.json("scans", payload: [
                "format": "rgbd", "source": "FORM Capture 1", "units": "m", "upAxis": "y",
                "confirmedHeight": cm / 100, "bytes": size, "consent": true, "closeFittingClothing": true
            ])
            status = "Uploading depth capture…"
            var request = URLRequest(url: created.uploadUrl)
            request.httpMethod = "PUT"
            request.timeoutInterval = 300
            for (key, value) in created.uploadHeaders { request.setValue(value, forHTTPHeaderField: key) }
            let (_, response) = try await URLSession.shared.upload(for: request, fromFile: archive)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw CaptureError.message("Private upload failed. Re-pair if the session expired, then retry.")
            }
            let _: ScanResponse = try await api.json("scans/\(created.scan.id)/finalize", payload: [:])
            capture.discard()
            status = "Uploaded. Return to the browser for processing and operator review."
        } catch { status = error.localizedDescription }
    }
}

struct CameraView: UIViewRepresentable {
    let session: ARSession
    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView()
        view.session = session
        view.scene = SCNScene()
        return view
    }
    func updateUIView(_ view: ARSCNView, context: Context) {}
}

enum CaptureError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}
struct PairResponse: Decodable { let token: String }
struct ScanResponse: Decodable { let id: String }
struct UploadResponse: Decodable { let scan: ScanResponse; let uploadUrl: URL; let uploadHeaders: [String:String] }
struct PilotAPI {
    let origin: URL
    let token: String
    func json<T: Decodable>(_ path: String, payload: [String:Any]) async throws -> T {
        var request = URLRequest(url: origin.appendingPathComponent("api/body/" + path))
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let value = try? JSONSerialization.jsonObject(with: data) as? [String:Any]
            throw CaptureError.message(value?["error"] as? String ?? "Pilot service unavailable.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
