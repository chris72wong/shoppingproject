"""Rigid, scale-preserving arrangement in Blender coordinates (Z-up)."""
import math


def body_frame(landmarks, category):
    anchor = "waist" if category == "bottom" else "chest"
    convert = lambda p: (p[0], -p[2], p[1])
    front, back = [convert(landmarks[anchor + side]) for side in ("Front", "Back")]
    left, right = [convert(landmarks["shoulder" + side]) for side in ("Left", "Right")]
    dx, dy = right[0] - left[0], right[1] - left[1]
    norm = math.hypot(dx, dy)
    if not all(math.isfinite(v) for p in (front, back, left, right) for v in p) or norm < .1 or math.hypot(front[0] - back[0], front[1] - back[1]) < .05:
        raise ValueError("Torso orientation is ambiguous")
    x = (dx / norm, dy / norm, 0)
    y = (-x[1], x[0], 0)
    if sum(y[i] * (front[i] - back[i]) for i in range(3)) >= 0:
        raise ValueError("Front/back and left/right landmarks disagree")
    if abs(front[2] - back[2]) > .05:
        raise ValueError("Torso front/back landmarks must use the same section height")
    return {"origin": tuple((a + b) / 2 for a, b in zip(front, back)), "axes": (x, y, (0, 0, 1))}


def place(point, reference, frame):
    delta = [a-b for a, b in zip(point, reference)]
    return tuple(frame["origin"][i] + sum(frame["axes"][j][i] * delta[j] for j in range(3)) for i in range(3))
