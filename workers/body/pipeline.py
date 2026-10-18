"""Metric reconstruction and operator-landmarked measurements; never infer a nude body."""
import json
import sys
from pathlib import Path
import numpy as np
import open3d as o3d
import trimesh
from PIL import Image
from validation import unpack_capture, validate_glb, validate_ply

Image.MAX_IMAGE_PIXELS = 16_000_000


def reconstruct_depth(path, root):
    manifest = unpack_capture(path, root / "capture")
    volume = o3d.pipelines.integration.ScalableTSDFVolume(
        voxel_length=0.004, sdf_trunc=0.016,
        color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
    positions, centers, accepted, good_ratios = [], [], 0, []
    for frame in manifest["frames"]:
        w, h = frame["width"], frame["height"]
        depth = np.fromfile(root / "capture" / frame["depth"], dtype="<f4").reshape(h, w).copy()
        confidence = np.fromfile(root / "capture" / frame["confidence"], dtype="u1").reshape(h, w)
        mask = np.array(Image.open(root / "capture" / frame["mask"]).convert("L").resize((w, h), Image.Resampling.NEAREST)) > 127
        rgb = np.array(Image.open(root / "capture" / frame["rgb"]).convert("RGB").resize((w, h), Image.Resampling.BILINEAR))
        valid = mask & (confidence >= 2) & np.isfinite(depth) & (depth > 0.3) & (depth < 3.0)
        ratio = np.count_nonzero(valid) / max(1, np.count_nonzero(mask))
        if ratio < 0.7 or np.count_nonzero(valid) < 500:
            continue
        # Erode segmentation boundary to avoid integrating background at silhouettes.
        from scipy.ndimage import binary_erosion
        valid &= binary_erosion(mask, iterations=1)
        depth[~valid] = 0
        camera = np.array(frame["cameraToWorld"], dtype=float).reshape((4, 4), order="F")
        k = np.array(frame["intrinsics"], dtype=float).reshape((3, 3), order="F")
        if k[0, 0] <= 0 or k[1, 1] <= 0 or not np.allclose(camera[3], [0, 0, 0, 1]) or not np.allclose(camera[:3, :3].T @ camera[:3, :3], np.eye(3), atol=0.02):
            raise ValueError("Invalid camera transform")
        if "bodyCenter" not in frame or len(frame["bodyCenter"]) != 3:
            raise ValueError("Missing motion-validation landmark")
        centers.append(frame["bodyCenter"])
        positions.append(camera[:3, 3])
        # ARKit cameras look along -Z with Y up; Open3D RGB-D uses +Z, Y down.
        c2w = camera @ np.diag([1, -1, -1, 1])
        intrinsic = o3d.camera.PinholeCameraIntrinsic(w, h, k[0, 0], k[1, 1], k[0, 2], k[1, 2])
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(o3d.geometry.Image(rgb), o3d.geometry.Image(depth.astype("float32")), depth_scale=1.0, depth_trunc=3.0, convert_rgb_to_intensity=False)
        volume.integrate(rgbd, intrinsic, np.linalg.inv(c2w))
        accepted += 1
        good_ratios.append(ratio)
    if accepted < 20:
        raise ValueError("Insufficient reliable depth frames; rescan")
    centers = np.array(centers, dtype=float)
    if not np.isfinite(centers).all() or np.max(np.linalg.norm(centers - np.median(centers, axis=0), axis=1)) > 0.08:
        raise ValueError("Subject movement exceeded 8 cm; rescan while stationary")
    delta = np.array(positions) - np.median(centers, axis=0)
    bearings = np.arctan2(delta[:, 0], delta[:, 2])
    sectors = set((np.floor((bearings + np.pi) / (np.pi / 2)).astype(int) % 4).tolist())
    if len(sectors) != 4:
        raise ValueError("Missing front, side, or back coverage")
    surface = volume.extract_triangle_mesh()
    surface.remove_degenerate_triangles().remove_duplicated_triangles().remove_unreferenced_vertices()
    mesh = trimesh.Trimesh(np.asarray(surface.vertices), np.asarray(surface.triangles), vertex_colors=(np.asarray(surface.vertex_colors) * 255).astype("uint8"), process=False)
    return mesh, {"acceptedFrames": accepted, "coverageSectors": len(sectors), "meanDepthConfidence": float(np.mean(good_ratios))}


def reconstruct(input_path, metadata, root):
    quality = {"validation": "unvalidated", "captureClothing": "requires-operator-review"}
    if metadata["format"] == "rgbd":
        mesh, stats = reconstruct_depth(input_path, root)
        quality.update(stats)
    else:
        if metadata["format"] == "glb":
            validate_glb(input_path.read_bytes())
        else:
            validate_ply(input_path)
        loaded = trimesh.load(input_path, process=False)
        if isinstance(loaded, trimesh.Scene):
            # Scene.to_geometry applies all node transforms; concatenating raw
            # scene geometries would silently destroy scale and placement.
            loaded = loaded.to_geometry()
        if isinstance(loaded, trimesh.points.PointCloud):
            points = np.asarray(loaded.vertices)
            if len(points) < 1000 or len(points) > 2_000_000 or not np.isfinite(points).all():
                raise ValueError("Invalid point cloud")
            cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
            factor = {"m": 1, "cm": 0.01, "mm": 0.001}[metadata["units"]]
            cloud.scale(factor, center=(0, 0, 0))
            cloud, _ = cloud.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
            cloud.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=0.025, max_nn=40))
            cloud.orient_normals_consistent_tangent_plane(30)
            # Ball pivoting preserves holes rather than inventing a watertight body.
            surface = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(cloud, o3d.utility.DoubleVector([0.008, 0.016]))
            mesh = trimesh.Trimesh(np.asarray(surface.vertices), np.asarray(surface.triangles), process=False)
            quality["pointCloudSurface"] = "ball-pivoted-review-required"
        else:
            mesh = loaded
            mesh.apply_scale({"m": 1, "cm": 0.01, "mm": 0.001}[metadata["units"]])
        if metadata["upAxis"] == "z":
            mesh.apply_transform(np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]], dtype=float))
    if not isinstance(mesh, trimesh.Trimesh) or not 100 <= len(mesh.faces) <= 2_000_000 or not np.isfinite(mesh.vertices).all():
        raise ValueError("Scan needs a finite body surface within pilot limits")
    bounds = mesh.bounds
    height = float(bounds[1, 1] - bounds[0, 1])
    if not 0.8 <= height <= 2.5 or abs(height - metadata["confirmedHeight"]) > max(0.03, metadata["confirmedHeight"] * 0.03):
        raise ValueError("Scan scale disagrees with confirmed height; check units, coverage, and up axis")
    if np.any(mesh.extents > [2.5, 2.5, 1.2]):
        raise ValueError("Scan contains background or unsupported pose")
    components = mesh.split(only_watertight=False)
    if len(components) > 1:
        largest = max(components, key=lambda m: m.area)
        fraction = largest.area / sum(m.area for m in components)
        quality["largestSurfaceFraction"] = float(fraction)
        if fraction < 0.98:
            raise ValueError("Disconnected body/background surfaces require a cleaner capture")
        # Preserve textured source geometry. Operator explicitly reviews tiny components.
    mesh.apply_translation([-mesh.centroid[0], -bounds[0, 1], -mesh.centroid[2]])
    quality.update({"heightMeters": height, "vertices": len(mesh.vertices), "faces": len(mesh.faces), "watertight": bool(mesh.is_watertight)})
    mesh.export(root / "display.glb")
    collision_o3d = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(mesh.vertices), o3d.utility.Vector3iVector(mesh.faces))
    if len(mesh.faces) > 30000:
        collision_o3d = collision_o3d.simplify_quadric_decimation(30000)
    collision = trimesh.Trimesh(np.asarray(collision_o3d.vertices), np.asarray(collision_o3d.triangles), process=False)
    collision.export(root / "collision.glb")
    validate_glb((root / "display.glb").read_bytes())
    (root / "result.json").write_text(json.dumps({"quality": quality}))


def measure(path, landmarks, root):
    scene = trimesh.load(path, process=False)
    mesh = scene.to_geometry() if isinstance(scene, trimesh.Scene) else scene
    height = float(mesh.extents[1])
    result = {}
    def dimension(value, method):
        if not np.isfinite(value) or not 0.05 <= value <= 2.5:
            raise ValueError("Invalid measurement; review landmarks")
        # No automatic promotion to validated. Calibration must be established
        # using the external feasibility trial and a later versioned algorithm.
        return {"value": float(value), "uncertainty": 0.02, "method": method, "quality": "unvalidated", "overClothing": True}
    result["height"] = dimension(height, "landmark-distance")
    for name in ("chest", "waist", "hip"):
        section = mesh.section(plane_origin=[0, landmarks[name + "Y"], 0], plane_normal=[0, 1, 0])
        if section is None:
            raise ValueError("Landmark has no surface section")
        # Closed torso contour only; don't sum arm contours into chest girth.
        loops = [line for line in section.discrete if len(line) >= 4 and np.linalg.norm(line[0] - line[-1]) < 0.005]
        central = [line for line in loops if np.min(line[:, 0]) < 0 < np.max(line[:, 0])]
        if len(central) != 1:
            raise ValueError("Torso section is open or ambiguous; rescan or review")
        result[name] = dimension(np.linalg.norm(np.diff(central[0], axis=0), axis=1).sum(), "surface-section")
    left, right, crotch = [np.array(landmarks[k], dtype=float) for k in ("shoulderLeft", "shoulderRight", "crotch")]
    for point in (left, right, crotch):
        _, distances, _ = trimesh.proximity.closest_point_naive(mesh, point.reshape(1,3))
        if distances[0] > 0.03:
            raise ValueError("Landmark is not on the captured surface")
    result["shoulder"] = dimension(np.linalg.norm(left - right), "landmark-distance")
    result["inseam"] = dimension(crotch[1] - mesh.bounds[0, 1], "landmark-distance")
    (root / "result.json").write_text(json.dumps({"measurements": result}))


if __name__ == "__main__":
    request = json.loads(Path(sys.argv[1]).read_text())
    root = Path(sys.argv[1]).parent
    if request["kind"] == "reconstruct":
        reconstruct(Path(request["input"]), request["metadata"], root)
    else:
        measure(Path(request["input"]), request["landmarks"], root)
