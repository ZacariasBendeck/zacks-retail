#!/usr/bin/env python3
"""
Replay a RICS Balancing Transfers preview from exported RICS CSV artifacts.

This is an analysis script, not a production transfer writer. It intentionally
does not touch Postgres or RICS MDB files. The goal is to make the legacy
algorithm testable against a PDF report that was converted to CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable


DEFAULT_STORE_SELECTION = "2,5-25,28-30,35-43,99"
DEFAULT_CATEGORY_SELECTION = "301-499"
DEFAULT_SEASON_SELECTION = "A-Z,1-9,0"
DEFAULT_KEYWORD_EXCLUSIONS = "DST,VER26*"


@dataclass(frozen=True)
class SelectionCriteria:
    stores: list[int]
    categories: set[int]
    seasons: set[str]
    keyword_exclusions: list[str]


@dataclass(frozen=True)
class Product:
    sku: str
    vendor_sku: str
    category: int
    vendor: str
    size_type: int
    description: str
    style_color: str
    season: str
    group_code: str
    keywords: str
    current_cost: float


@dataclass
class Cell:
    row_label: str
    column_index: int
    column_label: str
    on_hand: int = 0
    model: int = 0
    mtd_sales: int = 0
    max_qty: int = 0
    reorder: int = 0

    @property
    def key(self) -> tuple[str, int, str]:
        return (self.row_label, self.column_index, self.column_label)


@dataclass
class StoreSkuState:
    cells: dict[tuple[str, int, str], Cell] = field(default_factory=dict)
    on_hand_total: int = 0
    model_total: int = 0
    mtd_sales_total: int = 0

    @property
    def mtd_turns(self) -> float:
        denominator = self.on_hand_total + (self.mtd_sales_total / 2)
        if denominator <= 0:
            return 0.0
        return self.mtd_sales_total / denominator * 12


@dataclass(frozen=True)
class TransferUnit:
    from_store: int
    to_store: int
    sku: str
    row_label: str
    column_index: int
    column_label: str
    quantity: int
    from_mtd_turns: float
    to_mtd_turns: float

    @property
    def match_key(self) -> tuple[int, int, str, str, str]:
        return (self.from_store, self.to_store, self.sku, self.row_label, self.column_label)


def clean(value: str | None) -> str:
    return (value or "").strip()


def to_int(value: str | None, default: int = 0) -> int:
    text = clean(value)
    if not text or text == r"\N":
        return default
    try:
        return int(float(text))
    except ValueError:
        return default


def to_float(value: str | None, default: float = 0.0) -> float:
    text = clean(value)
    if not text or text == r"\N":
        return default
    try:
        return float(text)
    except ValueError:
        return default


def parse_number_selection(value: str) -> set[int]:
    selected: set[int] = set()
    for token in value.split(","):
        part = clean(token)
        if not part:
            continue
        if "-" in part:
            left, right = [clean(piece) for piece in part.split("-", 1)]
            start = to_int(left, -1)
            end = to_int(right, -1)
            if start < 0 or end < 0:
                continue
            low, high = sorted((start, end))
            selected.update(range(low, high + 1))
            continue
        selected.add(to_int(part, -1))
    selected.discard(-1)
    return selected


def parse_store_selection(value: str) -> list[int]:
    return sorted(parse_number_selection(value))


def parse_season_selection(value: str) -> set[str]:
    selected: set[str] = set()
    for token in value.split(","):
        part = clean(token).upper()
        if not part:
            continue
        if len(part) == 3 and part[1] == "-":
            start = ord(part[0])
            end = ord(part[2])
            low, high = sorted((start, end))
            selected.update(chr(code) for code in range(low, high + 1))
            continue
        selected.add(part)
    return selected


def parse_keyword_exclusions(value: str) -> list[str]:
    return [clean(token).upper() for token in value.split(",") if clean(token)]


def build_selection_criteria(
    stores: str,
    categories: str,
    seasons: str,
    keyword_exclusions: str,
) -> SelectionCriteria:
    return SelectionCriteria(
        stores=parse_store_selection(stores),
        categories=parse_number_selection(categories),
        seasons=parse_season_selection(seasons),
        keyword_exclusions=parse_keyword_exclusions(keyword_exclusions),
    )


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


def keyword_allowed(keyword_text: str, exclusions: list[str]) -> bool:
    # RICS report filter: <>DST, <>VER26**, <><>RP20ABR.
    # The observed report excludes DST and VER26 campaign SKUs, but it includes
    # RP20ABR rows. In this RICS filter expression, <><>RP20ABR is therefore
    # not a simple exclusion.
    normalized = keyword_text.upper()
    for pattern in exclusions:
        normalized_pattern = pattern.rstrip("*").upper()
        if normalized_pattern and normalized_pattern in normalized:
            return False
    return True


def product_allowed(row: dict[str, str], criteria: SelectionCriteria) -> bool:
    category = to_int(row.get("category"), -1)
    if category not in criteria.categories:
        return False
    season = clean(row.get("season")).upper()
    if not re.fullmatch(r"[A-Z0-9]", season) or season not in criteria.seasons:
        return False
    if not keyword_allowed(clean(row.get("key_words")), criteria.keyword_exclusions):
        return False
    status = clean(row.get("status")).upper()
    # RICS active status is commonly blank. Keep "1" as active because some
    # exports use numeric active flags; exclude obvious inactive markers only.
    if status in {"D", "DISC", "DISCONTINUED", "I", "INACTIVE"}:
        return False
    return True


def load_products(artifact_dir: Path, criteria: SelectionCriteria) -> dict[str, Product]:
    columns = load_manifest_columns(artifact_dir / "manifest.json")["inventory_master"]
    products: dict[str, Product] = {}
    for row in csv_dicts(artifact_dir / "inventory_master.csv", columns):
        sku = clean(row.get("sku"))
        if not sku or not product_allowed(row, criteria):
            continue
        products[sku] = Product(
            sku=sku,
            vendor_sku=clean(row.get("vendor_sku")),
            category=to_int(row.get("category")),
            vendor=clean(row.get("vendor")),
            size_type=to_int(row.get("size_type")),
            description=clean(row.get("desc")),
            style_color=clean(row.get("style_color")),
            season=clean(row.get("season")),
            group_code=clean(row.get("group_code")),
            keywords=clean(row.get("key_words")),
            current_cost=to_float(row.get("current_cost")),
        )
    return products


def load_size_columns(artifact_dir: Path) -> dict[int, dict[int, str]]:
    columns = load_manifest_columns(artifact_dir / "manifest.json")["size_types"]
    size_columns: dict[int, dict[int, str]] = {}
    for row in csv_dicts(artifact_dir / "size_types.csv", columns):
        code = to_int(row.get("code"), -1)
        if code < 0:
            continue
        labels: dict[int, str] = {}
        for index in range(1, 55):
            label = clean(row.get(f"columns_{index:02d}"))
            if label:
                labels[index] = label
        size_columns[code] = labels
    return size_columns


def column_label_for(size_columns: dict[int, dict[int, str]], product: Product, global_column: int) -> str:
    return size_columns.get(product.size_type, {}).get(global_column, str(global_column))


def load_store_names(artifact_dir: Path) -> dict[int, str]:
    columns = load_manifest_columns(artifact_dir / "manifest.json")["store_master"]
    names: dict[int, str] = {}
    for row in csv_dicts(artifact_dir / "store_master.csv", columns):
        store = to_int(row.get("number"), -1)
        if store >= 0:
            names[store] = clean(row.get("desc"))
    return names


def load_inventory_states(
    inquiry_dir: Path,
    products: dict[str, Product],
    size_columns: dict[int, dict[int, str]],
    selected_stores: list[int],
) -> dict[str, dict[int, StoreSkuState]]:
    columns = load_manifest_columns(inquiry_dir / "manifest.json")["inventory_quantities"]
    states: dict[str, dict[int, StoreSkuState]] = defaultdict(lambda: defaultdict(StoreSkuState))
    selected_store_set = set(selected_stores)

    for row in csv_dicts(inquiry_dir / "inventory_quantities.csv", columns):
        sku = clean(row.get("sku"))
        product = products.get(sku)
        if product is None:
            continue
        store = to_int(row.get("store"), -1)
        if store not in selected_store_set:
            continue
        row_label = clean(row.get("row"))
        segment = to_int(row.get("segment"), 1)
        if segment < 1:
            segment = 1
        state = states[sku][store]

        for ordinal in range(1, 19):
            global_column = (segment - 1) * 18 + ordinal
            column_label = column_label_for(size_columns, product, global_column)
            on_hand = to_int(row.get(f"on_hand_{ordinal:02d}"))
            model = to_int(row.get(f"model_{ordinal:02d}"))
            mtd_sales = to_int(row.get(f"m_t_d_sales_{ordinal:02d}"))
            max_qty = to_int(row.get(f"max_qtys_{ordinal:02d}"))
            reorder = to_int(row.get(f"reorder_{ordinal:02d}"))
            if on_hand == 0 and model == 0 and mtd_sales == 0 and max_qty == 0 and reorder == 0:
                continue
            cell = Cell(
                row_label=row_label,
                column_index=global_column,
                column_label=column_label,
                on_hand=on_hand,
                model=model,
                mtd_sales=mtd_sales,
                max_qty=max_qty,
                reorder=reorder,
            )
            state.cells[cell.key] = cell
            state.on_hand_total += on_hand
            state.model_total += model
            state.mtd_sales_total += mtd_sales

    return states


def sort_products(products: dict[str, Product], mode: str) -> list[Product]:
    if mode == "sku":
        return sorted(products.values(), key=lambda product: product.sku)
    if mode == "vendor":
        return sorted(
            products.values(),
            key=lambda product: (product.vendor, product.category, product.sku),
        )
    return sorted(
        products.values(),
        key=lambda product: (product.category, product.vendor, product.sku),
    )


def make_store_sorter(
    mode: str,
    state_by_store: dict[int, StoreSkuState],
    role: str,
) -> Callable[[int], tuple[float, int]]:
    def metric(store: int) -> tuple[float, int]:
        turns = state_by_store.get(store, StoreSkuState()).mtd_turns
        if mode == "turns_desc":
            # RICS appears to prioritize the strongest donor first when a
            # donor is still over model. Donor tie-breaks trend toward the
            # higher store number; receiver tie-breaks trend lower.
            return (-turns, -store if role == "donor" else store)
        if mode == "turns_asc":
            return (turns, store)
        return (0, store)

    return metric


def rics_donor_key(store: int, state_by_store: dict[int, StoreSkuState]) -> tuple[int, float, float, int]:
    state = state_by_store.get(store, StoreSkuState())
    total_surplus = state.on_hand_total - state.model_total
    if state.model_total <= 0 and state.on_hand_total > 0:
        return (0, 0 if store == 99 else 1, store, 0)
    if total_surplus <= 0:
        return (1, state.mtd_turns, store, 0)
    return (2, -total_surplus, state.mtd_turns, store)


def rics_receiver_key(
    store: int,
    state_by_store: dict[int, StoreSkuState],
    donor_state: StoreSkuState,
) -> tuple[int, float, int]:
    state = state_by_store.get(store, StoreSkuState())
    return (0, -state.mtd_turns, store)


def negative_mtd_sales_stores(state_by_store: dict[int, StoreSkuState]) -> list[int]:
    return sorted(
        store
        for store, store_state in state_by_store.items()
        if store_state.mtd_sales_total < 0
    )


def negative_mtd_sales_detail(state_by_store: dict[int, StoreSkuState]) -> str:
    details: list[str] = []
    for store in negative_mtd_sales_stores(state_by_store):
        store_state = state_by_store[store]
        negative_cells = [
            f"{cell.row_label or ''}/{cell.column_label}:{cell.mtd_sales}"
            for cell in sorted(store_state.cells.values(), key=lambda item: (item.row_label, item.column_index))
            if cell.mtd_sales < 0
        ]
        suffix = f" cells={'|'.join(negative_cells)}" if negative_cells else ""
        details.append(
            f"{store}: total_mtd_sales={store_state.mtd_sales_total} "
            f"on_hand={store_state.on_hand_total} model={store_state.model_total}{suffix}"
        )
    return "; ".join(details)


def append_product_transfers(
    product: Product,
    state_by_store: dict[int, StoreSkuState],
    selected_stores: list[int],
    donor_order: str,
    receiver_order: str,
    transfers: list[TransferUnit],
    exceptions: list[dict[str, object]],
) -> None:
    all_keys = sorted(
        {key for store_state in state_by_store.values() for key in store_state.cells},
        key=lambda key: (key[0], key[1], key[2]),
    )

    for key in all_keys:
        cell_states: dict[int, Cell] = {}
        for store in selected_stores:
            store_state = state_by_store.get(store)
            if store_state is None:
                continue
            cell = store_state.cells.get(key)
            if cell is None:
                continue
            cell_states[store] = cell

        for store, cell in cell_states.items():
            if cell.on_hand < 0 and cell.model > cell.on_hand:
                exceptions.append({
                    "store": store,
                    "sku": product.sku,
                    "row_label": cell.row_label,
                    "column_label": cell.column_label,
                    "column_index": cell.column_index,
                    "on_hand": cell.on_hand,
                    "reason": "negative on-hand cannot receive",
                })

        donors = [
            store
            for store, cell in cell_states.items()
            if cell.on_hand >= 0 and cell.on_hand > cell.model
        ]
        receivers = [
            store
            for store, cell in cell_states.items()
            if cell.on_hand >= 0 and cell.model > cell.on_hand
        ]
        if donor_order == "rics":
            donors.sort(key=lambda store: rics_donor_key(store, state_by_store))
        else:
            donors.sort(key=make_store_sorter(donor_order, state_by_store, "donor"))

        for donor_store in donors:
            donor_cell = cell_states[donor_store]
            surplus = donor_cell.on_hand - donor_cell.model
            if surplus <= 0:
                continue
            donor_state = state_by_store[donor_store]
            ordered_receivers = receivers[:]
            if receiver_order == "rics":
                ordered_receivers.sort(key=lambda store: rics_receiver_key(store, state_by_store, donor_state))
            else:
                ordered_receivers.sort(key=make_store_sorter(receiver_order, state_by_store, "receiver"))
            for receiver_store in ordered_receivers:
                if receiver_store == donor_store:
                    continue
                receiver_cell = cell_states[receiver_store]
                need = receiver_cell.model - receiver_cell.on_hand
                if need <= 0:
                    continue
                move_qty = min(surplus, need)
                if move_qty <= 0:
                    continue
                receiver_state = state_by_store[receiver_store]
                transfers.append(
                    TransferUnit(
                        from_store=donor_store,
                        to_store=receiver_store,
                        sku=product.sku,
                        row_label=donor_cell.row_label,
                        column_index=donor_cell.column_index,
                        column_label=donor_cell.column_label,
                        quantity=move_qty,
                        from_mtd_turns=donor_state.mtd_turns,
                        to_mtd_turns=receiver_state.mtd_turns,
                    )
                )
                donor_cell.on_hand -= move_qty
                receiver_cell.on_hand += move_qty
                surplus -= move_qty
                if surplus <= 0:
                    break


def build_transfers(
    products: dict[str, Product],
    states: dict[str, dict[int, StoreSkuState]],
    selected_stores: list[int],
    product_order: str,
    donor_order: str,
    receiver_order: str,
) -> tuple[list[TransferUnit], list[dict[str, object]], list[dict[str, object]]]:
    transfers: list[TransferUnit] = []
    exceptions: list[dict[str, object]] = []
    negative_mtd_sales_skips: list[dict[str, object]] = []

    for product in sort_products(products, product_order):
        state_by_store = states.get(product.sku, {})
        if len(state_by_store) < 2:
            continue
        # RICS omits SKUs where returns make a selected store's total M-T-D
        # sales negative. Negative size-level M-T-D values are tolerated when
        # the store-SKU total remains non-negative.
        negative_stores = negative_mtd_sales_stores(state_by_store)
        if negative_stores:
            blocked_transfers: list[TransferUnit] = []
            blocked_exceptions: list[dict[str, object]] = []
            append_product_transfers(
                product=product,
                state_by_store=deepcopy(state_by_store),
                selected_stores=selected_stores,
                donor_order=donor_order,
                receiver_order=receiver_order,
                transfers=blocked_transfers,
                exceptions=blocked_exceptions,
            )
            negative_detail = negative_mtd_sales_detail(state_by_store)
            if blocked_transfers:
                for unit in blocked_transfers:
                    negative_mtd_sales_skips.append({
                        "sku": product.sku,
                        "description": product.description,
                        "category_code": product.category,
                        "vendor": product.vendor,
                        "negative_store_numbers": ",".join(str(store) for store in negative_stores),
                        "negative_mtd_sales_detail": negative_detail,
                        "blocked_from_store_number": unit.from_store,
                        "blocked_to_store_number": unit.to_store,
                        "row_label": unit.row_label,
                        "column_index": unit.column_index,
                        "column_label": unit.column_label,
                        "blocked_quantity": unit.quantity,
                        "blocked_from_mtd_turns": round(unit.from_mtd_turns, 1),
                        "blocked_to_mtd_turns": round(unit.to_mtd_turns, 1),
                    })
            else:
                negative_mtd_sales_skips.append({
                    "sku": product.sku,
                    "description": product.description,
                    "category_code": product.category,
                    "vendor": product.vendor,
                    "negative_store_numbers": ",".join(str(store) for store in negative_stores),
                    "negative_mtd_sales_detail": negative_detail,
                    "blocked_from_store_number": "",
                    "blocked_to_store_number": "",
                    "row_label": "",
                    "column_index": "",
                    "column_label": "",
                    "blocked_quantity": 0,
                    "blocked_from_mtd_turns": "",
                    "blocked_to_mtd_turns": "",
                })
            continue

        append_product_transfers(
            product=product,
            state_by_store=state_by_store,
            selected_stores=selected_stores,
            donor_order=donor_order,
            receiver_order=receiver_order,
            transfers=transfers,
            exceptions=exceptions,
        )

    return transfers, exceptions, negative_mtd_sales_skips


def aggregate_units(units: Iterable[TransferUnit]) -> Counter[tuple[int, int, str, str, str]]:
    counter: Counter[tuple[int, int, str, str, str]] = Counter()
    for unit in units:
        counter[unit.match_key] += unit.quantity
    return counter


def load_rics_units(report_dir: Path) -> Counter[tuple[int, int, str, str, str]]:
    counter: Counter[tuple[int, int, str, str, str]] = Counter()
    report_path = report_dir / "transfer_units_by_size.csv"
    with report_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            key = (
                to_int(row.get("from_store_number")),
                to_int(row.get("to_store_number")),
                clean(row.get("sku")),
                clean(row.get("size_row")),
                clean(row.get("size_column")),
            )
            counter[key] += to_int(row.get("quantity"))
    return counter


def write_generated_units(
    path: Path,
    units: list[TransferUnit],
    products: dict[str, Product],
    store_names: dict[int, str],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = [
            "from_store_number",
            "from_store_name",
            "to_store_number",
            "to_store_name",
            "sku",
            "description",
            "category_code",
            "vendor",
            "row_label",
            "column_index",
            "column_label",
            "quantity",
            "from_mtd_turns",
            "to_mtd_turns",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for unit in sorted(units, key=lambda item: (item.from_store, item.to_store, products[item.sku].category, item.sku, item.row_label, item.column_index)):
            product = products[unit.sku]
            writer.writerow({
                "from_store_number": unit.from_store,
                "from_store_name": store_names.get(unit.from_store, ""),
                "to_store_number": unit.to_store,
                "to_store_name": store_names.get(unit.to_store, ""),
                "sku": unit.sku,
                "description": product.description,
                "category_code": product.category,
                "vendor": product.vendor,
                "row_label": unit.row_label,
                "column_index": unit.column_index,
                "column_label": unit.column_label,
                "quantity": unit.quantity,
                "from_mtd_turns": round(unit.from_mtd_turns, 1),
                "to_mtd_turns": round(unit.to_mtd_turns, 1),
            })


def write_counter_diff(
    path: Path,
    rics: Counter[tuple[int, int, str, str, str]],
    generated: Counter[tuple[int, int, str, str, str]],
) -> dict[str, int]:
    keys = sorted(set(rics) | set(generated))
    exact = 0
    missing = 0
    extra = 0
    qty_mismatch = 0
    total_abs_delta = 0

    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = [
            "status",
            "from_store_number",
            "to_store_number",
            "sku",
            "row_label",
            "column_label",
            "rics_qty",
            "generated_qty",
            "delta",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for key in keys:
            rics_qty = rics.get(key, 0)
            generated_qty = generated.get(key, 0)
            delta = generated_qty - rics_qty
            if delta == 0:
                exact += 1
                continue
            if rics_qty and not generated_qty:
                status = "missing_from_generated"
                missing += 1
            elif generated_qty and not rics_qty:
                status = "extra_generated"
                extra += 1
            else:
                status = "quantity_mismatch"
                qty_mismatch += 1
            total_abs_delta += abs(delta)
            writer.writerow({
                "status": status,
                "from_store_number": key[0],
                "to_store_number": key[1],
                "sku": key[2],
                "row_label": key[3],
                "column_label": key[4],
                "rics_qty": rics_qty,
                "generated_qty": generated_qty,
                "delta": delta,
            })

    return {
        "exact_keys": exact,
        "missing_keys": missing,
        "extra_keys": extra,
        "quantity_mismatch_keys": qty_mismatch,
        "total_abs_quantity_delta": total_abs_delta,
    }


def write_exceptions(path: Path, exceptions: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = ["store", "sku", "row_label", "column_label", "column_index", "on_hand", "reason"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in exceptions:
            writer.writerow(row)


def write_negative_mtd_sales_skips(
    path: Path,
    skipped_rows: list[dict[str, object]],
    store_names: dict[int, str],
) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = [
            "sku",
            "description",
            "category_code",
            "vendor",
            "negative_store_numbers",
            "negative_mtd_sales_detail",
            "blocked_from_store_number",
            "blocked_from_store_name",
            "blocked_to_store_number",
            "blocked_to_store_name",
            "row_label",
            "column_index",
            "column_label",
            "blocked_quantity",
            "blocked_from_mtd_turns",
            "blocked_to_mtd_turns",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in skipped_rows:
            from_store = to_int(str(row.get("blocked_from_store_number", "")), -1)
            to_store = to_int(str(row.get("blocked_to_store_number", "")), -1)
            writer.writerow({
                **row,
                "blocked_from_store_name": store_names.get(from_store, ""),
                "blocked_to_store_name": store_names.get(to_store, ""),
            })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay a RICS Balancing Transfers report from CSV artifacts.")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--reference-artifact", type=Path, default=Path("apps/.tmp/render-legacy-baselines-artifact"))
    parser.add_argument("--inventory-artifact", type=Path, default=Path("apps/.tmp/inquiry-sales-artifact"))
    parser.add_argument("--report-dir", type=Path, default=Path("outputs/balancing_transfers_2026-04-28_132646"))
    parser.add_argument("--out-dir", type=Path, default=Path("outputs/balancing_transfers_2026-04-28_132646/replay"))
    parser.add_argument("--stores", default=DEFAULT_STORE_SELECTION)
    parser.add_argument("--categories", default=DEFAULT_CATEGORY_SELECTION)
    parser.add_argument("--seasons", default=DEFAULT_SEASON_SELECTION)
    parser.add_argument("--exclude-keywords", default=DEFAULT_KEYWORD_EXCLUSIONS)
    parser.add_argument("--skip-compare", action="store_true")
    parser.add_argument("--product-order", choices=["category", "vendor", "sku"], default="category")
    parser.add_argument("--donor-order", choices=["store", "turns_asc", "turns_desc", "rics"], default="rics")
    parser.add_argument("--receiver-order", choices=["store", "turns_asc", "turns_desc", "rics"], default="rics")
    return parser.parse_args()


def resolve(root: Path, value: Path) -> Path:
    return value if value.is_absolute() else root / value


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    reference_artifact = resolve(root, args.reference_artifact)
    inventory_artifact = resolve(root, args.inventory_artifact)
    report_dir = resolve(root, args.report_dir)
    out_dir = resolve(root, args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    criteria = build_selection_criteria(
        stores=args.stores,
        categories=args.categories,
        seasons=args.seasons,
        keyword_exclusions=args.exclude_keywords,
    )

    print("Loading products...")
    products = load_products(reference_artifact, criteria)
    print(f"Selected product candidates: {len(products):,}")
    print("Loading size/store metadata...")
    size_columns = load_size_columns(reference_artifact)
    store_names = load_store_names(reference_artifact)
    print("Loading inventory quantities...")
    states = load_inventory_states(inventory_artifact, products, size_columns, criteria.stores)
    print(f"SKUs with selected-store inventory/model rows: {len(states):,}")

    print("Generating transfer replay...")
    transfers, exceptions, negative_mtd_sales_skips = build_transfers(
        products=products,
        states=states,
        selected_stores=criteria.stores,
        product_order=args.product_order,
        donor_order=args.donor_order,
        receiver_order=args.receiver_order,
    )

    generated_counter = aggregate_units(transfers)
    rics_counter: Counter[tuple[int, int, str, str, str]] = Counter()
    if not args.skip_compare:
        rics_counter = load_rics_units(report_dir)

    generated_units_path = out_dir / "generated_transfer_units.csv"
    diff_path = out_dir / "comparison_diff.csv"
    exceptions_path = out_dir / "generated_exceptions.csv"
    negative_mtd_sales_skips_path = out_dir / "negative_mtd_sales_skips.csv"
    summary_path = out_dir / "comparison_summary.json"

    write_generated_units(generated_units_path, transfers, products, store_names)
    diff_summary = (
        write_counter_diff(diff_path, rics_counter, generated_counter)
        if not args.skip_compare
        else {
            "exact_keys": 0,
            "missing_keys": 0,
            "extra_keys": 0,
            "quantity_mismatch_keys": 0,
            "total_abs_quantity_delta": 0,
        }
    )
    write_exceptions(exceptions_path, exceptions)
    write_negative_mtd_sales_skips(negative_mtd_sales_skips_path, negative_mtd_sales_skips, store_names)

    generated_total = sum(generated_counter.values())
    rics_total = sum(rics_counter.values())
    generated_pairs = {(key[0], key[1]) for key in generated_counter}
    rics_pairs = {(key[0], key[1]) for key in rics_counter}
    generated_skus = {key[2] for key in generated_counter}
    rics_skus = {key[2] for key in rics_counter}

    summary = {
        "algorithm": {
            "scope": "RICS Balancing Transfers Preview",
            "mode": "over_under_models",
            "metric": "month_to_date_turns",
            "mtd_turns_formula": "mtd_sales / (current_on_hand + mtd_sales / 2) * 12",
            "product_order": args.product_order,
            "donor_order": args.donor_order,
            "donor_order_notes": "RICS replay buckets donors as warehouse/no-model stock first, then SKU-stores at or below total model by lower M-T-D turns, then SKU-stores over total model by largest total surplus.",
            "receiver_order": args.receiver_order,
            "receiver_order_notes": "RICS replay gives receiver priority to higher M-T-D turns, then lower store number for ties.",
            "store_selection": args.stores,
            "category_range": args.categories,
            "season_filter": args.seasons,
            "keyword_exclusions": criteria.keyword_exclusions,
            "keyword_notes": "RP20ABR is present in the RICS report; <><>RP20ABR is not treated as an exclusion here.",
            "negative_mtd_sales_rule": "Skip a SKU if any selected store has negative total M-T-D sales for that SKU.",
        },
        "generated": {
            "unit_keys": len(generated_counter),
            "total_units": generated_total,
            "sku_count": len(generated_skus),
            "store_pair_count": len(generated_pairs),
            "exception_count": len(exceptions),
            "negative_mtd_sales_skip_rows": len(negative_mtd_sales_skips),
            "negative_mtd_sales_skip_sku_count": len({row["sku"] for row in negative_mtd_sales_skips}),
            "negative_mtd_sales_blocked_units": sum(to_int(str(row.get("blocked_quantity"))) for row in negative_mtd_sales_skips),
        },
        "rics_report": None if args.skip_compare else {
            "unit_keys": len(rics_counter),
            "total_units": rics_total,
            "sku_count": len(rics_skus),
            "store_pair_count": len(rics_pairs),
        },
        "comparison": None if args.skip_compare else {
            **diff_summary,
            "matched_unit_quantity": sum(min(rics_counter.get(key, 0), generated_counter.get(key, 0)) for key in set(rics_counter) | set(generated_counter)),
            "unit_precision": (sum(min(rics_counter.get(key, 0), generated_counter.get(key, 0)) for key in set(rics_counter) | set(generated_counter)) / generated_total) if generated_total else 0,
            "unit_recall": (sum(min(rics_counter.get(key, 0), generated_counter.get(key, 0)) for key in set(rics_counter) | set(generated_counter)) / rics_total) if rics_total else 0,
        },
        "outputs": {
            "generated_units": str(generated_units_path),
            "comparison_diff": None if args.skip_compare else str(diff_path),
            "generated_exceptions": str(exceptions_path),
            "negative_mtd_sales_skips": str(negative_mtd_sales_skips_path),
        },
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
