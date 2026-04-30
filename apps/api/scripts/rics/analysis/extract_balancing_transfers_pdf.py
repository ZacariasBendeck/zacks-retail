#!/usr/bin/env python3
"""Extract a RICS Balancing Transfers preview PDF into comparison CSVs."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


def clean(value: str | None) -> str:
    return (value or "").replace("\xa0", " ").strip()


def to_int(value: str | None, default: int = 0) -> int:
    text = clean(value)
    if not text or text == r"\N":
        return default
    try:
        return int(float(text))
    except ValueError:
        return default


def to_float(value: str | None, default: float = 0.0) -> float:
    text = clean(value).replace(",", ".")
    if not text or text == r"\N":
        return default
    try:
        return float(text)
    except ValueError:
        return default


def load_manifest_columns(manifest_path: Path) -> dict[str, list[str]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        table["targetTable"]: [column["targetColumn"] for column in table["columns"]]
        for table in manifest["tables"]
    }


def csv_dicts(csv_path: Path, columns: list[str]) -> Iterable[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if not row:
                continue
            yield dict(zip(columns, row))


def load_products(reference_artifact: Path) -> dict[str, dict[str, object]]:
    columns = load_manifest_columns(reference_artifact / "manifest.json")["inventory_master"]
    products: dict[str, dict[str, object]] = {}
    for row in csv_dicts(reference_artifact / "inventory_master.csv", columns):
        sku = clean(row.get("sku"))
        if not sku:
            continue
        products[sku] = {
            "sku": sku,
            "vendor_sku": clean(row.get("vendor_sku")),
            "category": to_int(row.get("category")),
            "vendor": clean(row.get("vendor")),
            "description": clean(row.get("desc")),
            "style_color": clean(row.get("style_color")),
        }
    return products


def load_store_names(reference_artifact: Path) -> dict[int, str]:
    columns = load_manifest_columns(reference_artifact / "manifest.json")["store_master"]
    names: dict[int, str] = {}
    for row in csv_dicts(reference_artifact / "store_master.csv", columns):
        store = to_int(row.get("number"), -1)
        if store >= 0:
            names[store] = clean(row.get("desc"))
    return names


def load_category_names(reference_artifact: Path) -> dict[int, str]:
    columns = load_manifest_columns(reference_artifact / "manifest.json")["categories"]
    names: dict[int, str] = {}
    for row in csv_dicts(reference_artifact / "categories.csv", columns):
        category = to_int(row.get("number"), -1)
        if category >= 0:
            names[category] = clean(row.get("desc"))
    return names


def first_store_match(pattern: str, line: str) -> tuple[int, str] | None:
    match = re.search(pattern, line)
    if not match:
        return None
    number = to_int(match.group(1), -1)
    rest = line[match.end():]
    repeated = re.search(r"\s{8,}(?:From Store|to Store|Store \d+)", rest)
    name = clean(rest[: repeated.start()] if repeated else rest)
    return number, name


def parse_size_positions(size_line: str) -> tuple[list[tuple[int, str]], int]:
    total_index = size_line.find("Total")
    usable = size_line[:total_index] if total_index >= 0 else size_line
    positions: list[tuple[int, str]] = []
    for match in re.finditer(r"\S+", usable):
        token = clean(match.group(0))
        if token:
            positions.append((match.start(), token))
    return positions, total_index if total_index >= 0 else len(size_line)


def nearest_size_label(position: int, size_positions: list[tuple[int, str]]) -> str | None:
    if not size_positions:
        return None
    return min(size_positions, key=lambda item: abs(position - item[0]))[1]


def parse_quantities(quantity_line: str, size_positions: list[tuple[int, str]], total_index: int) -> tuple[list[tuple[str, int]], int]:
    quantities: list[tuple[str, int]] = []
    total = 0
    for match in re.finditer(r"\d+", quantity_line):
        quantity = to_int(match.group(0))
        if match.start() >= total_index:
            total += quantity
            continue
        label = nearest_size_label(match.start(), size_positions)
        if label is None:
            continue
        quantities.append((label, quantity))
    return quantities, total


def parse_header_line(line: str, products: dict[str, dict[str, object]]) -> tuple[str, str, float, str, float] | None:
    first = clean(line).split(maxsplit=1)[0] if clean(line) else ""
    if first not in products:
        return None
    matches = re.findall(r"-?\d+,\d+", line)
    if len(matches) < 2:
        return None
    return first, matches[-2], to_float(matches[-2]), matches[-1], to_float(matches[-1])


def extract(pdf_path: Path, reference_artifact: Path, out_dir: Path) -> dict[str, object]:
    products = load_products(reference_artifact)
    store_names = load_store_names(reference_artifact)
    category_names = load_category_names(reference_artifact)
    reader = PdfReader(str(pdf_path))

    units: list[dict[str, object]] = []
    items: list[dict[str, object]] = []
    parse_warnings: list[str] = []
    report_date = ""
    report_time = ""
    selection_name = ""
    selected_stores = ""
    selected_categories = ""
    selected_seasons = ""
    selected_keywords = ""
    sort_order = ""
    current_from: tuple[int, str] | None = None
    current_to: tuple[int, str] | None = None
    store_pair_report_totals: Counter[tuple[int, int]] = Counter()

    item_id = 0
    for page_index, page in enumerate(reader.pages, start=1):
        lines = (page.extract_text() or "").splitlines()
        if page_index == 1:
            if lines:
                date_match = re.search(r"\d{2}/\d{2}/\d{4}", lines[0])
                if date_match:
                    report_date = date_match.group(0)
            if len(lines) > 1:
                time_match = re.search(r"\d{2}:\d{2}", lines[1])
                if time_match:
                    report_time = time_match.group(0)

        index = 0
        while index < len(lines):
            line = lines[index]
            stripped = clean(line)
            if page_index == 1:
                if stripped and not selection_name and stripped not in {"LLAMADAS"} and stripped.startswith("ZAP"):
                    selection_name = stripped
                if stripped.startswith("Printing in "):
                    sort_order = stripped.replace("Printing in ", "")
                if stripped.startswith("Selecting these Stores"):
                    selected_stores = clean(stripped.split(":", 1)[1] if ":" in stripped else "")
                if stripped.startswith("Selecting these categories"):
                    selected_categories = clean(stripped.split(":", 1)[1] if ":" in stripped else "")
                if stripped.startswith("Selecting these seasons"):
                    selected_seasons = clean(stripped.split(":", 1)[1] if ":" in stripped else "")
                if stripped.startswith("Selecting these keywords"):
                    selected_keywords = clean(stripped.split(":", 1)[1] if ":" in stripped else "")

            from_match = first_store_match(r"From Store #\s*(\d+)\s+-\s*", line)
            if from_match:
                current_from = from_match
            to_match = first_store_match(r"to Store #\s*(\d+)\s+-\s*", line)
            if to_match:
                current_to = to_match

            subtotal_match = re.search(r"(\d+)\s+units would be transferred to this store", stripped)
            if subtotal_match and current_from and current_to:
                store_pair_report_totals[(current_from[0], current_to[0])] += to_int(subtotal_match.group(1))

            header = parse_header_line(line, products)
            if header and current_from and current_to:
                sku, from_turns_raw, from_turns, to_turns_raw, to_turns = header
                size_index = index + 1
                while size_index < len(lines) and (not clean(lines[size_index]) or "Total" not in lines[size_index]):
                    size_index += 1
                qty_index = size_index + 1
                while qty_index < len(lines) and not clean(lines[qty_index]):
                    qty_index += 1
                if size_index >= len(lines) or qty_index >= len(lines):
                    parse_warnings.append(f"Page {page_index}: could not find size/quantity lines for {sku}")
                    index += 1
                    continue

                size_positions, total_index = parse_size_positions(lines[size_index])
                qty_breakdown, item_total = parse_quantities(lines[qty_index], size_positions, total_index)
                if not qty_breakdown:
                    parse_warnings.append(f"Page {page_index}: no quantity breakdown parsed for {sku}")
                    index += 1
                    continue
                breakdown_total = sum(quantity for _, quantity in qty_breakdown)
                if item_total and item_total != breakdown_total:
                    parse_warnings.append(
                        f"Page {page_index}: item total mismatch for {sku}; breakdown={breakdown_total}, report={item_total}"
                    )
                product = products[sku]
                item_id += 1
                item_row = {
                    "item_id": item_id,
                    "page": page_index,
                    "from_store_number": current_from[0],
                    "from_store_name": current_from[1] or store_names.get(current_from[0], ""),
                    "to_store_number": current_to[0],
                    "to_store_name": current_to[1] or store_names.get(current_to[0], ""),
                    "sku": sku,
                    "description": product["description"],
                    "style_color": product["style_color"],
                    "vendor": product["vendor"],
                    "vendor_sku": product["vendor_sku"],
                    "category_code": product["category"],
                    "category_name": category_names.get(int(product["category"]), ""),
                    "from_mtd_turns_raw": from_turns_raw,
                    "from_mtd_turns": from_turns,
                    "to_mtd_turns_raw": to_turns_raw,
                    "to_mtd_turns": to_turns,
                    "size_grid": " | ".join(label for _, label in size_positions),
                    "quantity_breakdown_json": json.dumps(
                        [{"row": "", "column": label, "quantity": quantity} for label, quantity in qty_breakdown],
                        ensure_ascii=False,
                    ),
                    "total_quantity": breakdown_total,
                    "report_total_quantity": item_total or breakdown_total,
                }
                items.append(item_row)
                for label, quantity in qty_breakdown:
                    units.append({
                        "item_id": item_id,
                        "page": page_index,
                        "from_store_number": current_from[0],
                        "from_store_name": current_from[1] or store_names.get(current_from[0], ""),
                        "to_store_number": current_to[0],
                        "to_store_name": current_to[1] or store_names.get(current_to[0], ""),
                        "sku": sku,
                        "description": product["description"],
                        "style_color": product["style_color"],
                        "vendor": product["vendor"],
                        "vendor_sku": product["vendor_sku"],
                        "category_code": product["category"],
                        "category_name": category_names.get(int(product["category"]), ""),
                        "from_mtd_turns_raw": from_turns_raw,
                        "from_mtd_turns": from_turns,
                        "to_mtd_turns_raw": to_turns_raw,
                        "to_mtd_turns": to_turns,
                        "size_row": "",
                        "size_column": label,
                        "quantity": quantity,
                    })
                index = qty_index + 1
                continue

            index += 1

    out_dir.mkdir(parents=True, exist_ok=True)
    item_path = out_dir / "transfer_items.csv"
    unit_path = out_dir / "transfer_units_by_size.csv"
    pair_path = out_dir / "store_pair_summary.csv"
    summary_path = out_dir / "report_summary.json"

    item_fields = [
        "item_id",
        "page",
        "from_store_number",
        "from_store_name",
        "to_store_number",
        "to_store_name",
        "sku",
        "description",
        "style_color",
        "vendor",
        "vendor_sku",
        "category_code",
        "category_name",
        "from_mtd_turns_raw",
        "from_mtd_turns",
        "to_mtd_turns_raw",
        "to_mtd_turns",
        "size_grid",
        "quantity_breakdown_json",
        "total_quantity",
        "report_total_quantity",
    ]
    unit_fields = [
        "item_id",
        "page",
        "from_store_number",
        "from_store_name",
        "to_store_number",
        "to_store_name",
        "sku",
        "description",
        "style_color",
        "vendor",
        "vendor_sku",
        "category_code",
        "category_name",
        "from_mtd_turns_raw",
        "from_mtd_turns",
        "to_mtd_turns_raw",
        "to_mtd_turns",
        "size_row",
        "size_column",
        "quantity",
    ]
    with item_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=item_fields)
        writer.writeheader()
        writer.writerows(items)
    with unit_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=unit_fields)
        writer.writeheader()
        writer.writerows(units)

    pair_counter: Counter[tuple[int, str, int, str]] = Counter()
    pair_item_counter: Counter[tuple[int, str, int, str]] = Counter()
    for row in units:
        key = (
            int(row["from_store_number"]),
            str(row["from_store_name"]),
            int(row["to_store_number"]),
            str(row["to_store_name"]),
        )
        pair_counter[key] += int(row["quantity"])
    for row in items:
        key = (
            int(row["from_store_number"]),
            str(row["from_store_name"]),
            int(row["to_store_number"]),
            str(row["to_store_name"]),
        )
        pair_item_counter[key] += 1
    with pair_path.open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["from_store_number", "from_store_name", "to_store_number", "to_store_name", "item_rows", "units", "report_subtotal_units", "delta"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for key in sorted(pair_counter):
            report_total = store_pair_report_totals.get((key[0], key[2]), 0)
            writer.writerow({
                "from_store_number": key[0],
                "from_store_name": key[1],
                "to_store_number": key[2],
                "to_store_name": key[3],
                "item_rows": pair_item_counter[key],
                "units": pair_counter[key],
                "report_subtotal_units": report_total,
                "delta": pair_counter[key] - report_total,
            })

    summary = {
        "source_pdf": str(pdf_path),
        "report_date": report_date,
        "report_time": report_time,
        "title": "RICS - Balancing Transfers (Preview)",
        "report_name": "LLAMADAS",
        "selection_name": selection_name,
        "sort_order": sort_order,
        "transfer_basis": "SKUs over/under models; inventory based on Month-to-Date turns",
        "selected_stores": selected_stores,
        "selected_categories": selected_categories,
        "selected_seasons": selected_seasons,
        "selected_keywords": selected_keywords,
        "pages": len(reader.pages),
        "transfer_item_rows": len(items),
        "transfer_unit_rows": len(units),
        "total_units_to_transfer": sum(int(row["quantity"]) for row in units),
        "store_pair_count": len(pair_counter),
        "store_pair_subtotal_delta": sum(abs(pair_counter[key] - store_pair_report_totals.get((key[0], key[2]), 0)) for key in pair_counter),
        "parse_warning_count": len(parse_warnings),
        "parse_warnings_sample": parse_warnings[:25],
        "outputs": {
            "transfer_items": str(item_path),
            "transfer_units_by_size": str(unit_path),
            "store_pair_summary": str(pair_path),
        },
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract a RICS Balancing Transfers preview PDF into CSV files.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--reference-artifact", type=Path, default=Path("apps/.tmp/render-legacy-baselines-artifact"))
    parser.add_argument("--out-dir", type=Path, required=True)
    return parser.parse_args()


def resolve(root: Path, value: Path) -> Path:
    return value if value.is_absolute() else root / value


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    summary = extract(
        pdf_path=resolve(root, args.pdf),
        reference_artifact=resolve(root, args.reference_artifact),
        out_dir=resolve(root, args.out_dir),
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
