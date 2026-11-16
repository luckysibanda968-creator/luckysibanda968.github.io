#!/usr/bin/env python3
"""Build the Bulawayo facilities and simplified cadastre GeoJSON files."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable

import geopandas as gpd
import pandas as pd
from pyproj import CRS
from pyproj import Transformer
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping
from shapely.ops import transform, unary_union
from shapely.validation import make_valid


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "cadastral 2023"
DATA_DIR = ROOT / "data"
FACILITIES_PATH = DATA_DIR / "facilities.geojson"
CADASTRE_PATH = DATA_DIR / "cadastre.geojson"
DETAILS_PATH = DATA_DIR / "facilities_details.csv"
METRIC_CRS = CRS.from_epsg(32735)
OUTPUT_CRS = CRS.from_epsg(4326)
MISSING = "Not available"
DEFAULT_SIMPLIFY_METERS = 2.0
FACILITY_SIMPLIFY_METERS = 0.75
DETAIL_FIELDS = (
    "id",
    "name",
    "category",
    "address",
    "stand_number",
    "suburb",
    "ward",
    "area_m2",
    "status",
    "operating_hours",
    "contact",
    "description",
    "photo",
    "owner_verification",
)

CATEGORY_RULES = (
    ("Health", ("clinic", "hospital", "health centre", "health center", "medical", "dispensary")),
    ("Education", ("school", "college", "nursery", "pre-school", "preschool", "training institute")),
    (
        "Parks & recreation",
        (
            "park",
            "playground",
            "play ground",
            "open space",
            "sports",
            "stadium",
            "swimming",
            "garden",
            "recreation",
            "beer garden",
            "municipal reserve",
        ),
    ),
    ("Transport", ("bus terminus", "bus rank", "terminus")),
    ("Emergency", ("fire station",)),
    ("Cemetery", ("cemetery", "graveyard")),
    ("Markets", ("market",)),
    ("Utilities", ("water works", "waterworks", "sewerage", "sewer", "water treatment", "water pump")),
    (
        "Community",
        ("community", "hall", "youth centre", "women day centre", "social hall", "disabled peoples home"),
    ),
    (
        "Civic offices",
        (
            "municipal office",
            "municipality",
            "administration",
            "admin office",
            "local authority",
            "township land",
            "public building",
            "public authority",
            "post office",
        ),
    ),
)
FACILITY_KEYWORDS = tuple(keyword for _, keywords in CATEGORY_RULES for keyword in keywords)
COUNCIL_OWNER = re.compile(r"\b(?:bulawayo city council|city of bulawayo|bulawayo municipality)\b", re.I)
DETAIL_PLACEHOLDERS = {
    "status": MISSING,
    "operating_hours": MISSING,
    "contact": MISSING,
    "description": MISSING,
    "photo": MISSING,
    "owner_verification": MISSING,
}


def field_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).strip().lower())


def record_fields(record: Any) -> dict[str, Any]:
    return {field_key(key): value for key, value in record.items() if key != "geometry"}


def text(value: Any) -> str:
    if value is None:
        return MISSING
    try:
        if pd.isna(value):
            return MISSING
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        value = value.item()
    result = str(value).strip()
    return result if result else MISSING


def first_field(fields: dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        value = fields.get(field_key(name))
        if text(value) != MISSING:
            return value
    return None


def get_name(fields: dict[str, Any]) -> str:
    return text(first_field(fields, ("NAME", "FACILITY", "SITE_NAME")))


def get_use(fields: dict[str, Any]) -> str:
    return text(first_field(fields, ("USE", "USE_1", "LAND_USE", "LANDUSE")))


def get_suburb(fields: dict[str, Any]) -> str:
    return text(first_field(fields, ("SUBURB", "SURBUB", "SUBURB_NAME")))


def get_stand(fields: dict[str, Any]) -> str:
    explicit = first_field(
        fields,
        (
            "STAND_NO",
            "STAND_NO_1",
            "STAND_NO1",
            "STAND__NO",
            "STAND_NO.",
            "STAND_NUMB",
            "STAND_NUMBER",
        ),
    )
    if explicit is not None:
        return text(explicit)
    for key, value in fields.items():
        if key.startswith("stand") and text(value) != MISSING:
            return text(value)
    return MISSING


def get_address(fields: dict[str, Any]) -> str:
    parts = []
    for key in ("address", "address1", "address2", "address3", "adress", "adress2", "adrress"):
        value = text(fields.get(key))
        if value != MISSING and value not in parts:
            parts.append(value)
    return ", ".join(parts) if parts else MISSING


def get_owner(fields: dict[str, Any]) -> str:
    return text(first_field(fields, ("OWN_NAME", "OWNER", "OWNERSHIP")))


def category_for(fields: dict[str, Any]) -> str | None:
    searchable = f"{get_use(fields)} {get_name(fields)}".casefold()
    if searchable.strip() == f"{MISSING} {MISSING}".casefold():
        return None
    for category, keywords in CATEGORY_RULES:
        if any(keyword in searchable for keyword in keywords):
            return category
    return None


def is_council_owner(owner: str) -> bool:
    return owner != MISSING and bool(COUNCIL_OWNER.search(owner))


def polygonal(geometry: Any) -> Polygon | MultiPolygon | None:
    if geometry is None or geometry.is_empty:
        return None
    if not geometry.is_valid:
        geometry = make_valid(geometry)
    if geometry.is_empty:
        return None
    if isinstance(geometry, Polygon):
        return geometry
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, GeometryCollection):
        parts = []
        for part in geometry.geoms:
            candidate = polygonal(part)
            if candidate is not None:
                parts.extend(candidate.geoms if isinstance(candidate, MultiPolygon) else [candidate])
        if not parts:
            return None
        merged = unary_union(parts)
        if isinstance(merged, Polygon | MultiPolygon):
            return merged
    return None


def rounded_coordinates(value: Any) -> Any:
    if isinstance(value, (tuple, list)):
        return [rounded_coordinates(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"Encountered a non-finite coordinate: {value}")
        return round(value, 6)
    if hasattr(value, "item"):
        return rounded_coordinates(value.item())
    return value


def safe_property(value: Any) -> Any:
    if value is None:
        return MISSING
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return MISSING
    if isinstance(value, str) and not value.strip():
        return MISSING
    return value


def geojson_feature(identifier: str, geometry: Any, properties: dict[str, Any]) -> dict[str, Any]:
    geo = mapping(geometry)
    return {
        "type": "Feature",
        "id": identifier,
        "geometry": {
            "type": geo["type"],
            "coordinates": rounded_coordinates(geo["coordinates"]),
        },
        "properties": {key: safe_property(value) for key, value in properties.items()},
    }


def write_feature_collection(path: Path, features: Iterable[dict[str, Any]]) -> int:
    count = 0
    with path.open("w", encoding="utf-8", newline="\n") as output:
        output.write('{"type":"FeatureCollection","features":[')
        for feature in features:
            if count:
                output.write(",")
            json.dump(feature, output, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            count += 1
        output.write("]}\n")
    return count


def stable_id(source: str, row_number: int, stand: str, suburb: str, use: str, name: str) -> str:
    identity = "\x1f".join((source, str(row_number), stand, suburb, use, name)).encode("utf-8")
    return f"facility-{hashlib.sha1(identity).hexdigest()[:14]}"


def parcel_key(geometry: Any, fields: dict[str, Any]) -> bytes:
    identity = "\x1f".join(
        text(fields.get(field_key(name)))
        for name in ("STAND_NO", "STAND_NO_1", "NAME", "USE", "SUBURB")
    )
    return hashlib.sha256(identity.encode("utf-8") + geometry.wkb).digest()


def load_details() -> dict[str, dict[str, str]]:
    if not DETAILS_PATH.exists() or DETAILS_PATH.stat().st_size == 0:
        return {}
    with DETAILS_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        rows = csv.DictReader(source)
        if not rows.fieldnames or "id" not in rows.fieldnames:
            raise ValueError(f"{DETAILS_PATH} must contain an 'id' column.")
        return {
            row["id"].strip(): {key: (value or "").strip() for key, value in row.items() if key}
            for row in rows
            if row.get("id", "").strip()
        }


def merge_details(base: dict[str, Any], edits: dict[str, str]) -> dict[str, Any]:
    merged = dict(base)
    for field in DETAIL_FIELDS:
        if field == "id":
            continue
        value = (edits.get(field) or "").strip()
        if value and value.casefold() != MISSING.casefold():
            if field == "area_m2":
                try:
                    value = round(float(value), 1)
                except ValueError as error:
                    raise ValueError(f"Invalid area_m2 value for {base['id']}: {value}") from error
            merged[field] = value
    return merged


def write_details(rows: list[dict[str, Any]]) -> None:
    with DETAILS_PATH.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=DETAIL_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def process(source_dir: Path, simplify_meters: float) -> None:
    shapefiles = sorted(path for path in source_dir.rglob("*.shp") if not path.name.startswith("._"))
    if not shapefiles:
        raise FileNotFoundError(f"No .shp files found under {source_dir}")

    edits = load_details()
    seen_sources: set[str] = set()
    seen_parcels: set[bytes] = set()
    facility_keys: set[bytes] = set()
    facilities: list[dict[str, Any]] = []
    detail_rows: list[dict[str, Any]] = []
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    cadastre_count = 0
    candidate_count = 0
    skipped_geometry_count = 0
    skipped_owner_count = 0

    def cadastre_features() -> Iterable[dict[str, Any]]:
        nonlocal cadastre_count, candidate_count, skipped_geometry_count, skipped_owner_count
        with CADASTRE_PATH.open("w", encoding="utf-8", newline="\n") as output:
            output.write('{"type":"FeatureCollection","features":[')
            first = True
            for path in shapefiles:
                if path.resolve().is_relative_to(DATA_DIR.resolve()):
                    continue
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest in seen_sources:
                    print(f"Duplicate shapefile skipped: {path.relative_to(source_dir)}", file=sys.stderr)
                    continue
                seen_sources.add(digest)
                frame = gpd.read_file(path, on_invalid="fix")
                if frame.crs is None:
                    raise ValueError(f"{path} has no CRS (.prj). Assign its correct CRS before conversion.")
                if frame.empty or frame.geometry.name not in frame.columns:
                    continue

                frame = frame.to_crs(METRIC_CRS)
                previous_count = len(frame)
                frame.geometry = frame.geometry.map(polygonal)
                frame = frame.loc[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
                skipped_geometry_count += previous_count - len(frame)
                if frame.empty:
                    continue

                relative_path = path.relative_to(source_dir).as_posix()
                print(f"Reading {relative_path}: {len(frame):,} polygon records")
                to_wgs84 = Transformer.from_crs(METRIC_CRS, OUTPUT_CRS, always_xy=True).transform

                for row_number, (_, row) in enumerate(frame.iterrows(), start=1):
                    geometry = row.geometry
                    fields = record_fields(row)
                    key = parcel_key(geometry, fields)
                    if key in seen_parcels:
                        continue
                    seen_parcels.add(key)

                    name = get_name(fields)
                    use = get_use(fields)
                    suburb = get_suburb(fields)
                    stand = get_stand(fields)
                    area = round(float(geometry.area), 1)
                    source_id = hashlib.sha1(
                        f"{relative_path}\x1f{row_number}\x1f{stand}\x1f{suburb}".encode("utf-8")
                    ).hexdigest()[:14]
                    simplified = geometry.simplify(simplify_meters, preserve_topology=True)
                    output_geometry = transform(to_wgs84, simplified)
                    properties = {
                        "id": f"parcel-{source_id}",
                        "name": name,
                        "source_use": use,
                        "suburb": suburb,
                        "address": get_address(fields),
                        "stand_number": stand,
                        "area_m2": area,
                        "source_file": relative_path,
                    }
                    feature = geojson_feature(f"parcel-{source_id}", output_geometry, properties)
                    if not first:
                        output.write(",")
                    json.dump(feature, output, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
                    first = False
                    cadastre_count += 1

                    category = category_for(fields)
                    if not category:
                        continue
                    candidate_count += 1
                    owner = get_owner(fields)
                    if owner != MISSING and not is_council_owner(owner):
                        skipped_owner_count += 1
                        continue
                    identity = hashlib.sha256(
                        f"{category}\x1f{stand}\x1f{suburb}\x1f{name}\x1f{use}".encode("utf-8")
                        + geometry.wkb
                    ).digest()
                    if identity in facility_keys:
                        continue
                    facility_keys.add(identity)

                    identifier = stable_id(relative_path, row_number, stand, suburb, use, name)
                    verification = "City Council named as parcel owner in source" if is_council_owner(owner) else MISSING
                    base = {
                        "id": identifier,
                        "name": name,
                        "category": category,
                        "address": get_address(fields),
                        "stand_number": stand,
                        "suburb": suburb,
                        "ward": MISSING,
                        "area_m2": area,
                        **DETAIL_PLACEHOLDERS,
                        "owner_verification": verification,
                    }
                    merged_details = merge_details(base, edits.get(identifier, {}))
                    properties = {
                        **merged_details,
                        "display_layer": "facility",
                        "source_use": use,
                        "source_file": relative_path,
                    }
                    facility_geometry = geometry.simplify(
                        FACILITY_SIMPLIFY_METERS, preserve_topology=True
                    )
                    polygon_4326 = transform(to_wgs84, facility_geometry)
                    facilities.append(geojson_feature(identifier, polygon_4326, properties))

                    centroid = transform(to_wgs84, geometry.centroid)
                    facilities.append(
                        geojson_feature(
                            f"{identifier}-marker",
                            centroid,
                            {**properties, "display_layer": "marker"},
                        )
                    )
                    detail_rows.append(merged_details)

            output.write("]}\n")

    # Write parcels incrementally to keep memory use predictable.
    cadastre_features()
    if cadastre_count == 0:
        raise ValueError("No polygon parcels were found; cadastre.geojson would be empty.")

    facilities_count = write_feature_collection(FACILITIES_PATH, facilities)
    write_details(detail_rows)
    print(f"\nWrote {cadastre_count:,} unique cadastral polygons to {CADASTRE_PATH}")
    print(
        f"Wrote {facilities_count:,} facility polygon/centroid features "
        f"({len(detail_rows):,} unique facilities) to {FACILITIES_PATH}"
    )
    print(f"Wrote editable facility details to {DETAILS_PATH}")
    print(f"Facility candidates considered: {candidate_count:,}")
    print(f"Candidates with a recorded non-Council owner excluded: {skipped_owner_count:,}")
    print(f"Non-polygon/empty source geometries ignored: {skipped_geometry_count:,}")
    if not detail_rows:
        print("Warning: no facilities matched the configured land-use/name rules.", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Folder containing extracted cadastral shapefiles (default: {DEFAULT_SOURCE})",
    )
    parser.add_argument(
        "--simplify-meters",
        type=float,
        default=DEFAULT_SIMPLIFY_METERS,
        help="Topology-preserving parcel simplification tolerance in metres (default: 2)",
    )
    arguments = parser.parse_args()
    if arguments.simplify_meters < 0:
        parser.error("--simplify-meters must be zero or greater")
    source_dir = arguments.source.resolve()
    if not source_dir.is_dir():
        raise NotADirectoryError(f"Cadastral source folder does not exist: {source_dir}")
    process(source_dir, arguments.simplify_meters)


if __name__ == "__main__":
    main()
