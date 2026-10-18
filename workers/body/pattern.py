"""Checks editable, operator-authored patterns without requiring Blender."""
import math


def distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))


def dimension_m(d, circumference=False):
    if circumference and d["convention"] == "length":
        raise ValueError("Length cannot establish circumference")
    factor = {"m": 1, "cm": .01, "mm": .001, "in": .0254}[d["units"]]
    if circumference and d["convention"] == "flat-width":
        factor *= 2
    value, uncertainty = float(d["value"]), float(d["uncertainty"])
    if not math.isfinite(value) or not math.isfinite(uncertainty) or value <= 0 or uncertainty < 0:
        raise ValueError("Invalid garment dimension")
    return value * factor, uncertainty * factor


def validate_pattern(pattern, garment, size):
    if pattern.get("units") != "m" or pattern.get("upAxis") != "y" or pattern.get("version") != garment["pattern"]["version"]:
        raise ValueError("Pattern must match the version and use meters, Y-up")
    if pattern.get("size") != size["label"] or pattern.get("sku") != garment["identity"]["sku"]:
        raise ValueError("Pattern identity does not match this product and size")
    vertices, faces = pattern["vertices"], pattern["faces"]
    if not 3 <= len(vertices) <= 100000 or not 1 <= len(faces) <= 200000:
        raise ValueError("Pattern topology exceeds limits")
    if any(len(v) != 3 or any(not math.isfinite(x) or abs(x) > 5 for x in v) for v in vertices):
        raise ValueError("Pattern has invalid metric vertices")
    def indices(items):
        if any(type(i) is not int or not 0 <= i < len(vertices) for i in items):
            raise ValueError("Invalid pattern vertex reference")
    for face in faces:
        indices(face)
        if len(face) not in (3, 4) or len(set(face)) != len(face):
            raise ValueError("Pattern needs nondegenerate triangles or quads")
        a, b, c = [vertices[i] for i in face[:3]]
        ab, ac = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
        cross = [ab[1]*ac[2] - ab[2]*ac[1], ab[2]*ac[0] - ab[0]*ac[2], ab[0]*ac[1] - ab[1]*ac[0]]
        if sum(v*v for v in cross) < 1e-16:
            raise ValueError("Pattern contains zero-area faces")
    if not pattern.get("seams") or not pattern.get("grainDirection") or not pattern.get("constructionNotes"):
        raise ValueError("Seams, grain and construction review are required")
    for seam in pattern["seams"]:
        a, b = seam["a"], seam["b"]
        indices(a + b)
        if len(a) < 2 or len(a) != len(b):
            raise ValueError("Seam paths must have matching vertex counts")
        lengths = [sum(distance(vertices[x], vertices[y]) for x, y in zip(path, path[1:])) for path in (a, b)]
        # Intentional easing must be explicitly reviewed, not silently stretched.
        ease = float(seam.get("approvedEaseM", 0))
        tolerance = ease + garment["pattern"]["dimensionToleranceM"]
        if ease < 0 or not math.isfinite(tolerance) or abs(lengths[0] - lengths[1]) > tolerance:
            raise ValueError("Seam lengths disagree beyond approved ease")
    required = {"waist", "hip", "inseam", "thigh", "rise"} if garment["category"] == "bottom" else {"chest", "shoulder", "sleeve", "upperArm", "length"}
    covered, measured = set(), {}
    for constraint in pattern["dimensionChecks"]:
        name, paths = constraint["dimension"], constraint["paths"]
        if not paths:
            raise ValueError("Dimension needs measured vertex paths")
        total = 0
        for path in paths:
            indices(path)
            if len(path) < 2:
                raise ValueError("Dimension path is incomplete")
            total += sum(distance(vertices[a], vertices[b]) for a, b in zip(path, path[1:]))
        circumference = constraint.get("circumference", False)
        expected, uncertainty = dimension_m(size["dimensions"][name], circumference)
        if abs(total - expected) > uncertainty + garment["pattern"]["dimensionToleranceM"]:
            raise ValueError("Pattern does not reproduce recorded garment dimension: " + name)
        covered.add(name)
        measured[name] = total
    if not required.issubset(covered):
        raise ValueError("Pattern does not verify all critical garment dimensions")
    if pattern.get("closure") not in ("closed", "open"):
        raise ValueError("Specify the authored closure state")
    return measured
