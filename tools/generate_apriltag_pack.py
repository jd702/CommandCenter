#!/usr/bin/env python3
"""
Generate a Vision 60 AprilTag print/config pack from downloaded tag PNGs.

Inputs:
- a directory containing files like tag36_11_00000.png ... tag36_11_00015.png

Outputs:
- manifest.json
- manifest.csv
- apriltag.yaml
- tag_map.yaml
- printable_tags.pdf
- printable_contact_sheet.pdf
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List

import yaml
from PIL import Image, ImageDraw, ImageFont


TAG_RE = re.compile(r"^(?P<prefix>tag\d+_\d+)_(?P<id>\d{5})\.png$")
MM_PER_INCH = 25.4


@dataclass
class TagRecord:
    filename: str
    tag_id: int
    family: str
    size_m: float
    size_mm: int
    location_name: str
    wall_label: str
    x: float
    y: float
    z: float
    yaw: float
    reserved: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Vision 60 AprilTag print and config files.")
    parser.add_argument("input_dir", help="Directory containing downloaded AprilTag PNGs")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory. Defaults to <input_dir>/generated_pack",
    )
    parser.add_argument("--family", default="tag36h11", help="AprilTag family name")
    parser.add_argument("--size-mm", type=int, default=180, help="Default printed tag size in mm")
    parser.add_argument("--site-name", default="building_a", help="Site/building name")
    parser.add_argument("--prefix", default="zone", help="Location name prefix")
    parser.add_argument("--page-size", choices=["letter", "a4"], default="letter")
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="Render DPI for generated PDFs",
    )
    return parser.parse_args()


def page_size_inches(name: str):
    if name == "a4":
        return (8.27, 11.69)
    return (8.5, 11.0)


def load_font(size: int):
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def collect_tags(input_dir: Path, family: str, size_mm: int, prefix: str) -> List[TagRecord]:
    records: List[TagRecord] = []
    for png in sorted(input_dir.glob("*.png")):
        match = TAG_RE.match(png.name)
        if not match:
            continue
        tag_id = int(match.group("id"))
        reserved = 340 <= tag_id <= 345
        records.append(
            TagRecord(
                filename=png.name,
                tag_id=tag_id,
                family=family,
                size_m=round(size_mm / 1000.0, 3),
                size_mm=size_mm,
                location_name=f"{prefix}_{tag_id:02d}",
                wall_label="TBD",
                x=0.0,
                y=0.0,
                z=1.5,
                yaw=0.0,
                reserved=reserved,
            )
        )
    return records


def write_manifest_json(records: List[TagRecord], output_dir: Path, site_name: str):
    payload = {
        "site_name": site_name,
        "family": records[0].family if records else "tag36h11",
        "count": len(records),
        "tags": [asdict(record) for record in records],
    }
    path = output_dir / "manifest.json"
    path.write_text(json.dumps(payload, indent=2))


def write_manifest_csv(records: List[TagRecord], output_dir: Path):
    path = output_dir / "manifest.csv"
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "filename",
                "tag_id",
                "family",
                "size_m",
                "size_mm",
                "location_name",
                "wall_label",
                "x",
                "y",
                "z",
                "yaw",
                "reserved",
            ],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))


def write_apriltag_yaml(records: List[TagRecord], output_dir: Path):
    payload = {
        "tag_family": records[0].family if records else "tag36h11",
        "publish_tf": True,
        "image_msgs_decimation": 1,
        "publish_tag_detections_image": True,
        "standalone_tags": [
            {
                "id": record.tag_id,
                "size": record.size_m,
                "name": record.location_name,
            }
            for record in records
        ],
    }
    path = output_dir / "apriltag.yaml"
    path.write_text(yaml.safe_dump(payload, sort_keys=False))


def write_tag_map_yaml(records: List[TagRecord], output_dir: Path, site_name: str):
    payload = {
        "site_name": site_name,
        "family": records[0].family if records else "tag36h11",
        "tags": [
            {
                "id": record.tag_id,
                "name": record.location_name,
                "size": record.size_m,
                "wall_label": record.wall_label,
                "pose": {
                    "x": record.x,
                    "y": record.y,
                    "z": record.z,
                    "yaw": record.yaw,
                },
            }
            for record in records
        ],
    }
    path = output_dir / "tag_map.yaml"
    path.write_text(yaml.safe_dump(payload, sort_keys=False))


def _draw_header(draw: ImageDraw.ImageDraw, page_w: int, title: str, subtitle: str):
    title_font = load_font(42)
    body_font = load_font(24)
    draw.text((60, 40), title, fill="black", font=title_font)
    draw.text((60, 94), subtitle, fill=(60, 60, 60), font=body_font)
    draw.line((60, 132, page_w - 60, 132), fill=(0, 0, 0), width=2)


def _fit_tag_image(image: Image.Image, target_px: int) -> Image.Image:
    return image.resize((target_px, target_px), Image.Resampling.NEAREST)


def build_print_pages(records: List[TagRecord], input_dir: Path, output_dir: Path, page_size: str, dpi: int):
    width_in, height_in = page_size_inches(page_size)
    page_w = int(width_in * dpi)
    page_h = int(height_in * dpi)
    margin = int(0.5 * dpi)
    label_font = load_font(28)
    small_font = load_font(22)
    pages: List[Image.Image] = []

    for record in records:
        page = Image.new("RGB", (page_w, page_h), "white")
        draw = ImageDraw.Draw(page)
        _draw_header(
            draw,
            page_w,
            f"Vision 60 AprilTag {record.tag_id:05d}",
            f"{record.filename} | {record.family} | target size {record.size_mm} mm",
        )

        tag_img = Image.open(input_dir / record.filename).convert("RGB")
        target_px = int((record.size_mm / MM_PER_INCH) * dpi)
        fitted = _fit_tag_image(tag_img, target_px)
        x = (page_w - target_px) // 2
        y = 180
        page.paste(fitted, (x, y))

        lines = [
            f"Location: {record.location_name}",
            f"Wall label: {record.wall_label}",
            f"Measured black-square size after print: ______ mm",
            f"Reserved dock ID range 340-345: {'YES' if record.reserved else 'NO'}",
        ]
        text_y = y + target_px + 50
        for line in lines:
            draw.text((margin, text_y), line, fill="black", font=label_font)
            text_y += 44

        footer = "Print at 100% scale. Do not fit-to-page. Measure after printing."
        draw.text((margin, page_h - 90), footer, fill=(80, 0, 0), font=small_font)
        pages.append(page)

    if pages:
        pages[0].save(
            output_dir / "printable_tags.pdf",
            "PDF",
            resolution=float(dpi),
            save_all=True,
            append_images=pages[1:],
        )


def build_contact_sheet(records: List[TagRecord], input_dir: Path, output_dir: Path, page_size: str, dpi: int):
    width_in, height_in = page_size_inches(page_size)
    page_w = int(width_in * dpi)
    page_h = int(height_in * dpi)
    title_font = load_font(34)
    body_font = load_font(18)
    cols = 2
    rows = 3
    cell_w = (page_w - 180) // cols
    cell_h = (page_h - 240) // rows
    per_page = cols * rows
    pages: List[Image.Image] = []

    for start in range(0, len(records), per_page):
        page = Image.new("RGB", (page_w, page_h), "white")
        draw = ImageDraw.Draw(page)
        draw.text((60, 36), "Vision 60 AprilTag Contact Sheet", fill="black", font=title_font)
        draw.text((60, 84), "Use for location assignment and print review", fill=(60, 60, 60), font=body_font)

        subset = records[start:start + per_page]
        for idx, record in enumerate(subset):
            row = idx // cols
            col = idx % cols
            ox = 60 + col * cell_w
            oy = 140 + row * cell_h
            draw.rectangle((ox, oy, ox + cell_w - 20, oy + cell_h - 20), outline=(180, 180, 180), width=2)
            tag_img = Image.open(input_dir / record.filename).convert("RGB")
            preview = _fit_tag_image(tag_img, min(cell_w - 80, cell_h - 130))
            page.paste(preview, (ox + 24, oy + 24))
            tx = ox + preview.width + 40
            draw.text((tx, oy + 24), record.filename, fill="black", font=body_font)
            draw.text((tx, oy + 52), f"ID: {record.tag_id}", fill="black", font=body_font)
            draw.text((tx, oy + 80), f"Target: {record.size_mm} mm", fill="black", font=body_font)
            draw.text((tx, oy + 108), f"Location: {record.location_name}", fill="black", font=body_font)
            draw.text((tx, oy + 136), "Installed at: __________", fill="black", font=body_font)
        pages.append(page)

    if pages:
        pages[0].save(
            output_dir / "printable_contact_sheet.pdf",
            "PDF",
            resolution=float(dpi),
            save_all=True,
            append_images=pages[1:],
        )


def write_readme(records: List[TagRecord], output_dir: Path, site_name: str):
    lines = [
        f"# AprilTag Pack For {site_name}",
        "",
        "Generated files:",
        "- manifest.json",
        "- manifest.csv",
        "- apriltag.yaml",
        "- tag_map.yaml",
        "- printable_tags.pdf",
        "- printable_contact_sheet.pdf",
        "",
        "Operator steps:",
        "1. Print one sample tag from printable_tags.pdf at 100% scale.",
        "2. Measure the actual black-square size in mm.",
        "3. If correct, print the rest at the same printer settings.",
        "4. Mount tags on matte rigid backing.",
        "5. Fill in the actual installation poses in tag_map.yaml.",
        "6. Copy apriltag.yaml to /home/ghost/.apriltag_configs/default/apriltag.yaml on Vision 60.",
        "",
        "Files included:",
    ]
    lines.extend([f"- {record.filename}" for record in records])
    (output_dir / "README.md").write_text("\n".join(lines) + "\n")


def main():
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    if not input_dir.exists():
        raise SystemExit(f"Input directory not found: {input_dir}")

    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else (input_dir / "generated_pack")
    output_dir.mkdir(parents=True, exist_ok=True)

    records = collect_tags(input_dir, args.family, args.size_mm, args.prefix)
    if not records:
        raise SystemExit(f"No tag PNGs matching tagNN_NN_00000.png found in: {input_dir}")

    write_manifest_json(records, output_dir, args.site_name)
    write_manifest_csv(records, output_dir)
    write_apriltag_yaml(records, output_dir)
    write_tag_map_yaml(records, output_dir, args.site_name)
    build_print_pages(records, input_dir, output_dir, args.page_size, args.dpi)
    build_contact_sheet(records, input_dir, output_dir, args.page_size, args.dpi)
    write_readme(records, output_dir, args.site_name)

    print(f"Generated AprilTag pack in: {output_dir}")
    print(f"Tags processed: {len(records)}")


if __name__ == "__main__":
    main()
