"""Reusable flat-top offset hex grid in a fictional local coordinate plane."""

import math


def hex_center(row: int, column: int, radius: float, origin_lon: float = 0, origin_lat: float = 0) -> tuple[float, float]:
    return (origin_lon + 1.5 * radius * column,
            origin_lat + math.sqrt(3) * radius * (row + (column % 2) / 2))


def hex_vertices(center: tuple[float, float], radius: float) -> list[list[float]]:
    lon, lat = center
    vertices = [[round(lon + radius * math.cos(math.radians(60 * side)), 9),
                 round(lat + radius * math.sin(math.radians(60 * side)), 9)] for side in range(6)]
    return vertices + [vertices[0]]


def grid(rows: int, columns: int, radius: float, origin_lon: float = 0, origin_lat: float = 0) -> tuple[dict, dict]:
    centers = {}
    features = {}
    for row in range(rows):
        for column in range(columns):
            index = row * columns + column + 1
            site_id = f"FIC-{index:02d}"
            center = hex_center(row, column, radius, origin_lon, origin_lat)
            centers[site_id] = center
            features[site_id] = {"type": "Feature", "id": site_id,
                                 "properties": {"site_id": site_id, "name": f"Fictional sector {index:02d}",
                                                "fictional": True, "row": row, "column": column},
                                 "geometry": {"type": "Polygon", "coordinates": [hex_vertices(center, radius)]}}
    return centers, features


def adjacency(centers: dict[str, tuple[float, float]], radius: float) -> dict[str, list[str]]:
    shared_edge_distance = math.sqrt(3) * radius
    tolerance = radius * 1e-6
    return {site_id: sorted(other for other, position in centers.items()
                            if other != site_id and abs(math.dist(center, position) - shared_edge_distance) <= tolerance)
            for site_id, center in centers.items()}


def containing_zone(centers: dict[str, tuple[float, float]], point: tuple[float, float], radius: float) -> str | None:
    site_id = min(centers, key=lambda key: math.dist(centers[key], point))
    return site_id if math.dist(centers[site_id], point) <= radius + radius * 1e-6 else None
