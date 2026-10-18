import Foundation

// ZIP "stored" entries: no third-party capture/analytics SDK and no image recompression.
enum StoredZip {
    private static func u16(_ value: UInt16) -> Data { var little = value.littleEndian; return withUnsafeBytes(of: &little) { Data($0) } }
    private static func u32(_ value: UInt32) -> Data { var little = value.littleEndian; return withUnsafeBytes(of: &little) { Data($0) } }
    private static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffffffff
        for byte in data { crc ^= UInt32(byte); for _ in 0..<8 { crc = (crc >> 1) ^ ((crc & 1) == 1 ? 0xedb88320 : 0) } }
        return crc ^ 0xffffffff
    }
    static func write(folder: URL, destination: URL) throws {
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.fileSizeKey]).sorted { $0.lastPathComponent < $1.lastPathComponent }
        FileManager.default.createFile(atPath: destination.path, contents: nil, attributes: [.protectionKey: FileProtectionType.complete])
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }
        var central = Data()
        for file in files {
            let data = try Data(contentsOf: file), name = Data(file.lastPathComponent.utf8), crc = crc32(data)
            let offset = try output.offset()
            guard offset + UInt64(data.count) < 150 * 1024 * 1024 else { throw CaptureError.message("Capture exceeds 150 MiB. Record fewer frames.") }
            var header = u32(0x04034b50) + u16(20) + u16(0) + u16(0) + u16(0) + u16(0)
            header += u32(crc) + u32(UInt32(data.count)) + u32(UInt32(data.count)) + u16(UInt16(name.count)) + u16(0) + name
            try output.write(contentsOf: header); try output.write(contentsOf: data)
            var entry = u32(0x02014b50) + u16(20) + u16(20) + u16(0) + u16(0) + u16(0) + u16(0)
            entry += u32(crc) + u32(UInt32(data.count)) + u32(UInt32(data.count)) + u16(UInt16(name.count))
            entry += u16(0) + u16(0) + u16(0) + u16(0) + u32(0) + u32(UInt32(offset)) + name
            central += entry
        }
        let centralOffset = try output.offset()
        try output.write(contentsOf: central)
        let end = u32(0x06054b50) + u16(0) + u16(0) + u16(UInt16(files.count)) + u16(UInt16(files.count)) + u32(UInt32(central.count)) + u32(UInt32(centralOffset)) + u16(0)
        try output.write(contentsOf: end)
    }
}
