"""Untrusted input validation. No file/network access is permitted by importers."""
import json
import math
import struct
from pathlib import PurePosixPath
import zipfile

MAX_BYTES = 150 * 1024 * 1024


def validate_glb(data):
    if len(data) < 20 or len(data) > MAX_BYTES:
        raise ValueError("Invalid GLB size")
    magic, version, length = struct.unpack_from("<III", data)
    if (magic, version, length) != (0x46546C67, 2, len(data)):
        raise ValueError("Invalid GLB header")
    offset, document, binary = 12, None, 0
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("Truncated GLB")
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if size % 4 or offset + size > len(data):
            raise ValueError("Invalid GLB chunk")
        if kind == 0x4E4F534A and document is None and offset == 20:
            document = json.loads(data[offset:offset + size])
        elif kind == 0x004E4942 and document is not None and not binary:
            binary = size
        else:
            raise ValueError("Unsupported GLB chunk")
        offset += size
    if not document or document.get("asset", {}).get("version") != "2.0" or not binary:
        raise ValueError("GLB requires JSON and binary data")

    def visit(value, depth=0):
        if depth > 64:
            raise ValueError("GLB nesting limit")
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ("uri", "extensions", "extensionsUsed", "extensionsRequired"):
                    raise ValueError("External references and extensions are not supported")
                visit(item, depth + 1)
        elif isinstance(value, list):
            for item in value:
                visit(item, depth + 1)
    visit(document)
    buffers = document.get("buffers", [])
    if len(buffers) != 1 or buffers[0].get("byteLength", binary + 1) > binary:
        raise ValueError("Invalid binary buffer")
    if len(document.get("nodes", [])) > 1000 or len(document.get("meshes", [])) > 100:
        raise ValueError("GLB resource limit")
    for image in document.get("images", []):
        if image.get("mimeType") not in ("image/png", "image/jpeg") or not isinstance(image.get("bufferView"), int):
            raise ValueError("Only embedded PNG/JPEG textures are supported")
    return document


def validate_ply(path):
    with open(path, "rb") as source:
        header = bytearray()
        while b"end_header\n" not in header and b"end_header\r\n" not in header:
            line = source.readline(4096)
            if not line or len(header) + len(line) > 65536:
                raise ValueError("Invalid PLY header")
            header.extend(line)
    text = header.decode("ascii")
    if not text.startswith("ply\n") and not text.startswith("ply\r\n"):
        raise ValueError("Invalid PLY magic")
    if not any(f"format {kind} 1.0" in text for kind in ("ascii", "binary_little_endian", "binary_big_endian")):
        raise ValueError("Unsupported PLY format")
    for line in text.splitlines():
        if line.startswith("element "):
            _, name, count = line.split()
            if name not in ("vertex", "face") or not 0 <= int(count) <= 2_000_000:
                raise ValueError("PLY resource limit")


def unpack_capture(path, destination):
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if len(members) > 1000 or sum(m.file_size for m in members) > 600 * 1024 * 1024:
            raise ValueError("Capture archive exceeds limits")
        names = set()
        for member in members:
            item = PurePosixPath(member.filename)
            if item.is_absolute() or ".." in item.parts or "\\" in member.filename or ":" in member.filename or member.filename in names or member.is_dir() or ((member.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError("Unsafe capture entry")
            names.add(member.filename)
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("schemaVersion") != 1 or manifest.get("units") != "m" or manifest.get("upAxis") != "y":
            raise ValueError("Unsupported capture contract")
        frames = manifest.get("frames", [])
        if not 20 <= len(frames) <= 160:
            raise ValueError("Capture needs 20–160 calibrated frames")
        required = {"manifest.json"}
        for frame in frames:
            for key in ("rgb", "depth", "confidence", "mask"):
                name = frame.get(key)
                if name not in names:
                    raise ValueError("Missing capture frame")
                required.add(name)
            w, h = frame["width"], frame["height"]
            if not isinstance(w, int) or not isinstance(h, int) or not 1 <= w <= 1024 or not 1 <= h <= 1024:
                raise ValueError("Invalid depth resolution")
            if archive.getinfo(frame["depth"]).file_size != w * h * 4 or archive.getinfo(frame["confidence"]).file_size != w * h:
                raise ValueError("Invalid depth buffer length")
            if len(frame["intrinsics"]) != 9 or len(frame["cameraToWorld"]) != 16 or not all(math.isfinite(v) for v in frame["intrinsics"] + frame["cameraToWorld"]):
                raise ValueError("Invalid calibration")
        if names != required:
            raise ValueError("Unexpected capture files")
        archive.extractall(destination)
    return manifest
