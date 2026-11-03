"""Small math helpers shared by both directions of the translator.

Everything here uses only NumPy, so the same code runs on a laptop and
inside the browser (through Pyodide).
"""

import numpy as np


def normalize(values):
    """Squash any array of numbers into the range 0 to 1."""
    values = np.asarray(values, dtype=float)
    low, high = values.min(), values.max()
    if high - low < 1e-9:
        return np.zeros_like(values)
    return (values - low) / (high - low)


def shrink_time(values, steps):
    """Average a time series (or the columns of a 2D array) down to `steps` slices."""
    values = np.asarray(values)
    edges = np.linspace(0, values.shape[-1], steps + 1).astype(int)
    pieces = []
    for i in range(steps):
        a, b = edges[i], max(edges[i + 1], edges[i] + 1)
        pieces.append(values[..., a:b].mean(axis=-1))
    return np.stack(pieces, axis=-1)


def smooth(values, size):
    """Moving average that keeps the same length (edges are padded)."""
    size = max(1, int(size))
    kernel = np.ones(size) / size
    padded = np.pad(np.asarray(values, dtype=float), size, mode="edge")
    return np.convolve(padded, kernel, mode="same")[size:-size]


def hilbert_point(size, d):
    """(x, y) of the d-th cell along a Hilbert curve on a size x size grid
    (size must be a power of 2). Neighbors along the curve are neighbors in space."""
    x = y = 0
    s = 1
    while s < size:
        rx = 1 & (d // 2)
        ry = 1 & (d ^ rx)
        if ry == 0:  # rotate this quarter of the curve
            if rx == 1:
                x = s - 1 - x
                y = s - 1 - y
            x, y = y, x
        x += s * rx
        y += s * ry
        d //= 4
        s *= 2
    return x, y


def nmf(matrix, parts, iterations=300, seed=0):
    """Non-negative matrix factorization: matrix ~= W @ H, nothing negative.
    W holds `parts` column patterns, H says how strongly each is used.
    Uses the classic multiplicative update rule (Lee & Seung)."""
    V = np.maximum(np.asarray(matrix, dtype=float), 0) + 1e-9
    rng = np.random.default_rng(seed)
    scale = np.sqrt(V.mean() / parts)
    W = rng.random((V.shape[0], parts)) * scale + 1e-3
    H = rng.random((parts, V.shape[1])) * scale + 1e-3
    for _ in range(iterations):
        H *= (W.T @ V) / (W.T @ W @ H + 1e-9)
        W *= (V @ H.T) / (W @ H @ H.T + 1e-9)
    return W, H


def kmeans(points, k, iterations=50):
    """Group points (one per row) into k clusters. Returns a label per point.
    Starts from spread-out points so the result is the same every run."""
    points = np.asarray(points, dtype=float)
    k = min(k, len(points))
    centers = [points[0]]
    for _ in range(1, k):  # pick each new center far from the existing ones
        distance = np.min([((points - c) ** 2).sum(axis=1) for c in centers], axis=0)
        centers.append(points[int(np.argmax(distance))])
    centers = np.array(centers)
    labels = np.zeros(len(points), dtype=int)
    for _ in range(iterations):
        distance = ((points[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = distance.argmin(axis=1)
        for j in range(k):
            if np.any(labels == j):
                centers[j] = points[labels == j].mean(axis=0)
    return labels


def segment(features, sections):
    """Cut a sequence of feature columns into `sections` runs of similar columns.
    Start with every column on its own, then keep merging the two neighboring
    runs that are most alike (Ward's rule) until `sections` runs remain.
    Returns the start index of each run."""
    columns = np.asarray(features, dtype=float).T
    starts = list(range(len(columns)))
    sizes = [1] * len(columns)
    means = [c.copy() for c in columns]
    while len(starts) > sections:
        costs = [sizes[i] * sizes[i + 1] / (sizes[i] + sizes[i + 1])
                 * ((means[i] - means[i + 1]) ** 2).sum() for i in range(len(starts) - 1)]
        i = int(np.argmin(costs))
        total = sizes[i] + sizes[i + 1]
        means[i] = (means[i] * sizes[i] + means[i + 1] * sizes[i + 1]) / total
        sizes[i] = total
        del starts[i + 1], sizes[i + 1], means[i + 1]
    return starts
