# RICS MDB Schema (auto-generated)

_Generated at 2026-04-17T22:19:48.367Z by `pnpm --filter @benlow-rics/api rics:discover`._

This file enumerates user tables and columns in the RICS Access databases that the storefront adapter reads from. **Do not edit the per-MDB sections by hand** — re-run the script instead. Mapping decisions (RICS column → storefront field) go under the _Mappings_ heading at the bottom and are hand-maintained.

## RIINVMAS.MDB
_Product / SKU master_

**Tables (2):** `InvCatalog`, `InventoryMaster`

### `InvCatalog`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `SKU` | WCHAR | yes |
| 2 | `LongColor` | WCHAR | yes |
| 3 | `BoldDesc` | WCHAR | yes |
| 4 | `ParaDesc` | WCHAR | yes |
| 5 | `CatalogSKU` | WCHAR | yes |
| 6 | `BulletText_01` | WCHAR | yes |
| 7 | `BulletText_02` | WCHAR | yes |
| 8 | `BulletText_03` | WCHAR | yes |
| 9 | `BulletText_04` | WCHAR | yes |
| 10 | `BulletText_05` | WCHAR | yes |
| 11 | `PictureName_01` | WCHAR | yes |
| 12 | `PictureName_02` | WCHAR | yes |
| 13 | `SizeText` | WCHAR | yes |
| 14 | `CfgFileName` | WCHAR | yes |
| 15 | `WebFileName` | WCHAR | yes |
| 16 | `Categories_01` | SMALLINT | yes |
| 17 | `Categories_02` | SMALLINT | yes |
| 18 | `Categories_03` | SMALLINT | yes |
| 19 | `Categories_04` | SMALLINT | yes |
| 20 | `Categories_05` | SMALLINT | yes |
| 21 | `DateLastChanged` | DATE | yes |

### `InventoryMaster`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `SKU` | WCHAR | yes |
| 2 | `VendorSKU` | WCHAR | yes |
| 3 | `Category` | SMALLINT | yes |
| 4 | `Vendor` | WCHAR | yes |
| 5 | `SizeType` | SMALLINT | yes |
| 6 | `Desc` | WCHAR | yes |
| 7 | `StyleColor` | WCHAR | yes |
| 8 | `Season` | WCHAR | yes |
| 9 | `Location` | WCHAR | yes |
| 10 | `ListPrice` | CURRENCY | yes |
| 11 | `RetailPrice` | CURRENCY | yes |
| 12 | `MarkDownPrice1` | CURRENCY | yes |
| 13 | `MarkDownPrice2` | CURRENCY | yes |
| 14 | `CurrentPrice` | SMALLINT | yes |
| 15 | `CurrentCost` | CURRENCY | yes |
| 16 | `OverSizeColumn` | WCHAR | yes |
| 17 | `OverSizeAmount` | CURRENCY | yes |
| 18 | `Perks` | CURRENCY | yes |
| 19 | `Manufacturer` | WCHAR | yes |
| 20 | `LabelCode` | WCHAR | yes |
| 21 | `ColorCode` | WCHAR | yes |
| 22 | `Comment` | WCHAR | yes |
| 23 | `GroupCode` | WCHAR | yes |
| 24 | `KeyWords` | WCHAR | yes |
| 25 | `PictureFileName` | WCHAR | yes |
| 26 | `Coupon` | BOOLEAN | no |
| 27 | `LastPriceChange` | DATE | yes |
| 28 | `Status` | WCHAR | yes |
| 29 | `DateLastChanged` | DATE | yes |
| 30 | `OrderMultiple` | SMALLINT | yes |
| 31 | `OrderUOM` | WCHAR | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `SKU` | \|DMTDU1BN |
| `VendorSKU` |  |
| `Category` | 586 |
| `Vendor` | KDEM |
| `SizeType` | 309 |
| `Desc` | SandPtMetCharMARIL K |
| `StyleColor` | CHAR/NEGR |
| `Season` | 0 |
| `Location` |  |
| `ListPrice` | 535 |
| `RetailPrice` | 465.22 |
| `MarkDownPrice1` | 232.61 |
| `MarkDownPrice2` | 325.65 |
| `CurrentPrice` | 1 |
| `CurrentCost` | 168.39 |
| `OverSizeColumn` |  |
| `OverSizeAmount` | 0 |
| `Perks` | 0 |
| `Manufacturer` |  |
| `LabelCode` | H |
| `ColorCode` |  |
| `Comment` |  |
| `GroupCode` | IBL |
| `KeyWords` | IBL ZB C1911 2D50 |
| `PictureFileName` | DMTDU1BK.jpg |
| `Coupon` | false |
| `LastPriceChange` | /Date(1610489968000)/ |
| `Status` |   |
| `DateLastChanged` | /Date(1753457388000)/ |
| `OrderMultiple` | 1 |
| `OrderUOM` | EA |

</details>

## RICATEG.MDB
_Category master_

**Tables (1):** `Categories`

### `Categories`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Number` | SMALLINT | yes |
| 2 | `Desc` | WCHAR | yes |
| 3 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Number` | 5 |
| `Desc` | Pantalon Ni�o Marca |
| `DateLastChanged` | /Date(1574831180000)/ |

</details>

## RIDEPT.MDB
_Department master_

**Tables (2):** `Departments`, `Sectors`

### `Departments`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Number` | SMALLINT | yes |
| 2 | `Desc` | WCHAR | yes |
| 3 | `BegCateg` | SMALLINT | yes |
| 4 | `EndCateg` | SMALLINT | yes |
| 5 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Number` | 1 |
| `Desc` | ROPA NI�OS MARCA |
| `BegCateg` | 5 |
| `EndCateg` | 10 |
| `DateLastChanged` | /Date(1574831110000)/ |

</details>

### `Sectors`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Number` | SMALLINT | yes |
| 2 | `Desc` | WCHAR | yes |
| 3 | `BegDept` | SMALLINT | yes |
| 4 | `EndDept` | SMALLINT | yes |
| 5 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Number` | 1 |
| `Desc` | SECTOR DE MARCAS H |
| `BegDept` | 1 |
| `EndDept` | 14 |
| `DateLastChanged` | /Date(1252622682000)/ |

</details>

## RIVENDOR.MDB
_Vendor master_

**Tables (2):** `Vendor Accounts`, `Vendor Master`

### `Vendor Accounts`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `Store` | SMALLINT | yes |
| 3 | `Account` | WCHAR | yes |
| 4 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | 138I |
| `Store` | 1 |
| `Account` | 67 |
| `DateLastChanged` | /Date(1032550530000)/ |

</details>

### `Vendor Master`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `Short Name` | WCHAR | yes |
| 3 | `Mail Name` | WCHAR | yes |
| 4 | `Addr1` | WCHAR | yes |
| 5 | `Addr2` | WCHAR | yes |
| 6 | `City` | WCHAR | yes |
| 7 | `State` | WCHAR | yes |
| 8 | `Zip` | WCHAR | yes |
| 9 | `Phone` | WCHAR | yes |
| 10 | `Fax` | WCHAR | yes |
| 11 | `Contact` | WCHAR | yes |
| 12 | `Terms` | WCHAR | yes |
| 13 | `Ship Inst` | WCHAR | yes |
| 14 | `Comment` | WCHAR | yes |
| 15 | `Manu Code` | WCHAR | yes |
| 16 | `Manu Name` | WCHAR | yes |
| 17 | `Qualifier ID` | WCHAR | yes |
| 18 | `Qualifier Code` | WCHAR | yes |
| 19 | `ColorCode` | BOOLEAN | no |
| 20 | `LongComment` | WCHAR | yes |
| 21 | `EMail` | WCHAR | yes |
| 22 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | 03EV |
| `Short Name` | 03 EVERLY |
| `Mail Name` | 03 EVERLY |
| `Addr1` | 1001 Crocker Street#2 |
| `Addr2` |  |
| `City` | Los Angeles |
| `State` | CA |
| `Zip` | 90021 |
| `Phone` | 213-765-5333 |
| `Fax` | 213-765-718 |
| `Contact` |  |
| `Terms` |  |
| `Ship Inst` |  |
| `Comment` |   |
| `Manu Code` |    |
| `Manu Name` |    |
| `Qualifier ID` |  |
| `Qualifier Code` |  |
| `ColorCode` | false |
| `LongComment` |  |
| `EMail` | www.03everly.colm             info@03everly.com |
| `DateLastChanged` | /Date(1290173760000)/ |

</details>

## RISIZE.MDB
_Size runs_

**Tables (2):** `NRMACodes`, `SizeTypes`

### `NRMACodes`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | SMALLINT | yes |
| 2 | `Row` | SMALLINT | yes |
| 3 | `Segment` | SMALLINT | yes |
| 4 | `NRMACode_01` | SMALLINT | yes |
| 5 | `NRMACode_02` | SMALLINT | yes |
| 6 | `NRMACode_03` | SMALLINT | yes |
| 7 | `NRMACode_04` | SMALLINT | yes |
| 8 | `NRMACode_05` | SMALLINT | yes |
| 9 | `NRMACode_06` | SMALLINT | yes |
| 10 | `NRMACode_07` | SMALLINT | yes |
| 11 | `NRMACode_08` | SMALLINT | yes |
| 12 | `NRMACode_09` | SMALLINT | yes |
| 13 | `NRMACode_10` | SMALLINT | yes |
| 14 | `NRMACode_11` | SMALLINT | yes |
| 15 | `NRMACode_12` | SMALLINT | yes |
| 16 | `NRMACode_13` | SMALLINT | yes |
| 17 | `NRMACode_14` | SMALLINT | yes |
| 18 | `NRMACode_15` | SMALLINT | yes |
| 19 | `NRMACode_16` | SMALLINT | yes |
| 20 | `NRMACode_17` | SMALLINT | yes |
| 21 | `NRMACode_18` | SMALLINT | yes |
| 22 | `DateLastChanged` | DATE | yes |

### `SizeTypes`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | SMALLINT | yes |
| 2 | `Desc` | WCHAR | yes |
| 3 | `ColumnDesc` | WCHAR | yes |
| 4 | `RowDesc` | WCHAR | yes |
| 5 | `Columns_01` | WCHAR | yes |
| 6 | `Columns_02` | WCHAR | yes |
| 7 | `Columns_03` | WCHAR | yes |
| 8 | `Columns_04` | WCHAR | yes |
| 9 | `Columns_05` | WCHAR | yes |
| 10 | `Columns_06` | WCHAR | yes |
| 11 | `Columns_07` | WCHAR | yes |
| 12 | `Columns_08` | WCHAR | yes |
| 13 | `Columns_09` | WCHAR | yes |
| 14 | `Columns_10` | WCHAR | yes |
| 15 | `Columns_11` | WCHAR | yes |
| 16 | `Columns_12` | WCHAR | yes |
| 17 | `Columns_13` | WCHAR | yes |
| 18 | `Columns_14` | WCHAR | yes |
| 19 | `Columns_15` | WCHAR | yes |
| 20 | `Columns_16` | WCHAR | yes |
| 21 | `Columns_17` | WCHAR | yes |
| 22 | `Columns_18` | WCHAR | yes |
| 23 | `Columns_19` | WCHAR | yes |
| 24 | `Columns_20` | WCHAR | yes |
| 25 | `Columns_21` | WCHAR | yes |
| 26 | `Columns_22` | WCHAR | yes |
| 27 | `Columns_23` | WCHAR | yes |
| 28 | `Columns_24` | WCHAR | yes |
| 29 | `Columns_25` | WCHAR | yes |
| 30 | `Columns_26` | WCHAR | yes |
| 31 | `Columns_27` | WCHAR | yes |
| 32 | `Columns_28` | WCHAR | yes |
| 33 | `Columns_29` | WCHAR | yes |
| 34 | `Columns_30` | WCHAR | yes |
| 35 | `Columns_31` | WCHAR | yes |
| 36 | `Columns_32` | WCHAR | yes |
| 37 | `Columns_33` | WCHAR | yes |
| 38 | `Columns_34` | WCHAR | yes |
| 39 | `Columns_35` | WCHAR | yes |
| 40 | `Columns_36` | WCHAR | yes |
| 41 | `Columns_37` | WCHAR | yes |
| 42 | `Columns_38` | WCHAR | yes |
| 43 | `Columns_39` | WCHAR | yes |
| 44 | `Columns_40` | WCHAR | yes |
| 45 | `Columns_41` | WCHAR | yes |
| 46 | `Columns_42` | WCHAR | yes |
| 47 | `Columns_43` | WCHAR | yes |
| 48 | `Columns_44` | WCHAR | yes |
| 49 | `Columns_45` | WCHAR | yes |
| 50 | `Columns_46` | WCHAR | yes |
| 51 | `Columns_47` | WCHAR | yes |
| 52 | `Columns_48` | WCHAR | yes |
| 53 | `Columns_49` | WCHAR | yes |
| 54 | `Columns_50` | WCHAR | yes |
| 55 | `Columns_51` | WCHAR | yes |
| 56 | `Columns_52` | WCHAR | yes |
| 57 | `Columns_53` | WCHAR | yes |
| 58 | `Columns_54` | WCHAR | yes |
| 59 | `Rows_01` | WCHAR | yes |
| 60 | `Rows_02` | WCHAR | yes |
| 61 | `Rows_03` | WCHAR | yes |
| 62 | `Rows_04` | WCHAR | yes |
| 63 | `Rows_05` | WCHAR | yes |
| 64 | `Rows_06` | WCHAR | yes |
| 65 | `Rows_07` | WCHAR | yes |
| 66 | `Rows_08` | WCHAR | yes |
| 67 | `Rows_09` | WCHAR | yes |
| 68 | `Rows_10` | WCHAR | yes |
| 69 | `Rows_11` | WCHAR | yes |
| 70 | `Rows_12` | WCHAR | yes |
| 71 | `Rows_13` | WCHAR | yes |
| 72 | `Rows_14` | WCHAR | yes |
| 73 | `Rows_15` | WCHAR | yes |
| 74 | `Rows_16` | WCHAR | yes |
| 75 | `Rows_17` | WCHAR | yes |
| 76 | `Rows_18` | WCHAR | yes |
| 77 | `Rows_19` | WCHAR | yes |
| 78 | `Rows_20` | WCHAR | yes |
| 79 | `Rows_21` | WCHAR | yes |
| 80 | `Rows_22` | WCHAR | yes |
| 81 | `Rows_23` | WCHAR | yes |
| 82 | `Rows_24` | WCHAR | yes |
| 83 | `Rows_25` | WCHAR | yes |
| 84 | `Rows_26` | WCHAR | yes |
| 85 | `Rows_27` | WCHAR | yes |
| 86 | `MaxColumns` | SMALLINT | yes |
| 87 | `MaxRows` | SMALLINT | yes |
| 88 | `TableType` | WCHAR | yes |
| 89 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | 10 |
| `Desc` | ZapHombMarcAnchMARCA |
| `ColumnDesc` | TALLA |
| `RowDesc` | ANCHO |
| `Columns_01` | 060  |
| `Columns_02` | 065  |
| `Columns_03` | 070  |
| `Columns_04` | 075  |
| `Columns_05` | 080  |
| `Columns_06` | 085  |
| `Columns_07` | 090  |
| `Columns_08` | 095  |
| `Columns_09` | 100  |
| `Columns_10` | 105  |
| `Columns_11` | 110  |
| `Columns_12` | 115  |
| `Columns_13` | 120  |
| `Columns_14` | 125  |
| `Columns_15` | 130  |
| `Columns_16` | M    |
| `Columns_17` |      |
| `Columns_18` |      |
| `Columns_19` |      |
| `Columns_20` |      |
| `Columns_21` |      |
| `Columns_22` |      |
| `Columns_23` |      |
| `Columns_24` |      |
| `Columns_25` |      |
| `Columns_26` |      |
| `Columns_27` |      |
| `Columns_28` |      |
| `Columns_29` |      |
| `Columns_30` |      |
| `Columns_31` |      |
| `Columns_32` |      |
| `Columns_33` |      |
| `Columns_34` |      |
| `Columns_35` |      |
| `Columns_36` |      |
| `Columns_37` |      |
| `Columns_38` |      |
| `Columns_39` |      |
| `Columns_40` |      |
| `Columns_41` |      |
| `Columns_42` |      |
| `Columns_43` |      |
| `Columns_44` |      |
| `Columns_45` |      |
| `Columns_46` |      |
| `Columns_47` |      |
| `Columns_48` |      |
| `Columns_49` |      |
| `Columns_50` |      |
| `Columns_51` |      |
| `Columns_52` |      |
| `Columns_53` |      |
| `Columns_54` |      |
| `Rows_01` | M   |
| `Rows_02` | W   |
| `Rows_03` | 3E  |
| `Rows_04` |     |
| `Rows_05` |     |
| `Rows_06` |     |
| `Rows_07` |     |
| `Rows_08` |     |
| `Rows_09` |     |
| `Rows_10` |     |
| `Rows_11` |     |
| `Rows_12` |     |
| `Rows_13` |     |
| `Rows_14` |     |
| `Rows_15` |     |
| `Rows_16` |     |
| `Rows_17` |     |
| `Rows_18` |     |
| `Rows_19` |     |
| `Rows_20` |     |
| `Rows_21` |     |
| `Rows_22` |     |
| `Rows_23` |     |
| `Rows_24` |     |
| `Rows_25` |     |
| `Rows_26` |     |
| `Rows_27` |     |
| `MaxColumns` | 16 |
| `MaxRows` | 3 |
| `TableType` |  |
| `DateLastChanged` | /Date(1504373436000)/ |

</details>

## RIUPC.MDB
_UPC / barcode mappings_

**Tables (1):** `UPC Cross Reference`

### `UPC Cross Reference`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Prefix` | WCHAR | yes |
| 2 | `Number` | WCHAR | yes |
| 3 | `Check Digit` | WCHAR | yes |
| 4 | `SKU` | WCHAR | yes |
| 5 | `Column` | WCHAR | yes |
| 6 | `Row` | WCHAR | yes |
| 7 | `VendorSKU` | WCHAR | yes |
| 8 | `NRMACode` | WCHAR | yes |
| 9 | `Status` | WCHAR | yes |
| 10 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Prefix` |     |
| `Number` | 4400056205 |
| `Check Digit` | 2 |
| `SKU` | TL1071747BL |
| `Column` | M |
| `Row` |  |
| `VendorSKU` | TL1071747BL |
| `NRMACode` | 0000 |
| `Status` |   |
| `DateLastChanged` | /Date(1452291153000)/ |

</details>

## RIINVQUA.MDB
_Inventory quantities_

**Tables (1):** `Inventory Quantities`

### `Inventory Quantities`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `SKU` | WCHAR | yes |
| 2 | `Store` | SMALLINT | yes |
| 3 | `Row` | WCHAR | yes |
| 4 | `Segment` | SMALLINT | yes |
| 5 | `OnHand_01` | SMALLINT | yes |
| 6 | `OnHand_02` | SMALLINT | yes |
| 7 | `OnHand_03` | SMALLINT | yes |
| 8 | `OnHand_04` | SMALLINT | yes |
| 9 | `OnHand_05` | SMALLINT | yes |
| 10 | `OnHand_06` | SMALLINT | yes |
| 11 | `OnHand_07` | SMALLINT | yes |
| 12 | `OnHand_08` | SMALLINT | yes |
| 13 | `OnHand_09` | SMALLINT | yes |
| 14 | `OnHand_10` | SMALLINT | yes |
| 15 | `OnHand_11` | SMALLINT | yes |
| 16 | `OnHand_12` | SMALLINT | yes |
| 17 | `OnHand_13` | SMALLINT | yes |
| 18 | `OnHand_14` | SMALLINT | yes |
| 19 | `OnHand_15` | SMALLINT | yes |
| 20 | `OnHand_16` | SMALLINT | yes |
| 21 | `OnHand_17` | SMALLINT | yes |
| 22 | `OnHand_18` | SMALLINT | yes |
| 23 | `CurrentOnOrder_01` | SMALLINT | yes |
| 24 | `CurrentOnOrder_02` | SMALLINT | yes |
| 25 | `CurrentOnOrder_03` | SMALLINT | yes |
| 26 | `CurrentOnOrder_04` | SMALLINT | yes |
| 27 | `CurrentOnOrder_05` | SMALLINT | yes |
| 28 | `CurrentOnOrder_06` | SMALLINT | yes |
| 29 | `CurrentOnOrder_07` | SMALLINT | yes |
| 30 | `CurrentOnOrder_08` | SMALLINT | yes |
| 31 | `CurrentOnOrder_09` | SMALLINT | yes |
| 32 | `CurrentOnOrder_10` | SMALLINT | yes |
| 33 | `CurrentOnOrder_11` | SMALLINT | yes |
| 34 | `CurrentOnOrder_12` | SMALLINT | yes |
| 35 | `CurrentOnOrder_13` | SMALLINT | yes |
| 36 | `CurrentOnOrder_14` | SMALLINT | yes |
| 37 | `CurrentOnOrder_15` | SMALLINT | yes |
| 38 | `CurrentOnOrder_16` | SMALLINT | yes |
| 39 | `CurrentOnOrder_17` | SMALLINT | yes |
| 40 | `CurrentOnOrder_18` | SMALLINT | yes |
| 41 | `FutureOnOrder_01` | SMALLINT | yes |
| 42 | `FutureOnOrder_02` | SMALLINT | yes |
| 43 | `FutureOnOrder_03` | SMALLINT | yes |
| 44 | `FutureOnOrder_04` | SMALLINT | yes |
| 45 | `FutureOnOrder_05` | SMALLINT | yes |
| 46 | `FutureOnOrder_06` | SMALLINT | yes |
| 47 | `FutureOnOrder_07` | SMALLINT | yes |
| 48 | `FutureOnOrder_08` | SMALLINT | yes |
| 49 | `FutureOnOrder_09` | SMALLINT | yes |
| 50 | `FutureOnOrder_10` | SMALLINT | yes |
| 51 | `FutureOnOrder_11` | SMALLINT | yes |
| 52 | `FutureOnOrder_12` | SMALLINT | yes |
| 53 | `FutureOnOrder_13` | SMALLINT | yes |
| 54 | `FutureOnOrder_14` | SMALLINT | yes |
| 55 | `FutureOnOrder_15` | SMALLINT | yes |
| 56 | `FutureOnOrder_16` | SMALLINT | yes |
| 57 | `FutureOnOrder_17` | SMALLINT | yes |
| 58 | `FutureOnOrder_18` | SMALLINT | yes |
| 59 | `Model_01` | SMALLINT | yes |
| 60 | `Model_02` | SMALLINT | yes |
| 61 | `Model_03` | SMALLINT | yes |
| 62 | `Model_04` | SMALLINT | yes |
| 63 | `Model_05` | SMALLINT | yes |
| 64 | `Model_06` | SMALLINT | yes |
| 65 | `Model_07` | SMALLINT | yes |
| 66 | `Model_08` | SMALLINT | yes |
| 67 | `Model_09` | SMALLINT | yes |
| 68 | `Model_10` | SMALLINT | yes |
| 69 | `Model_11` | SMALLINT | yes |
| 70 | `Model_12` | SMALLINT | yes |
| 71 | `Model_13` | SMALLINT | yes |
| 72 | `Model_14` | SMALLINT | yes |
| 73 | `Model_15` | SMALLINT | yes |
| 74 | `Model_16` | SMALLINT | yes |
| 75 | `Model_17` | SMALLINT | yes |
| 76 | `Model_18` | SMALLINT | yes |
| 77 | `M-T-DSales_01` | SMALLINT | yes |
| 78 | `M-T-DSales_02` | SMALLINT | yes |
| 79 | `M-T-DSales_03` | SMALLINT | yes |
| 80 | `M-T-DSales_04` | SMALLINT | yes |
| 81 | `M-T-DSales_05` | SMALLINT | yes |
| 82 | `M-T-DSales_06` | SMALLINT | yes |
| 83 | `M-T-DSales_07` | SMALLINT | yes |
| 84 | `M-T-DSales_08` | SMALLINT | yes |
| 85 | `M-T-DSales_09` | SMALLINT | yes |
| 86 | `M-T-DSales_10` | SMALLINT | yes |
| 87 | `M-T-DSales_11` | SMALLINT | yes |
| 88 | `M-T-DSales_12` | SMALLINT | yes |
| 89 | `M-T-DSales_13` | SMALLINT | yes |
| 90 | `M-T-DSales_14` | SMALLINT | yes |
| 91 | `M-T-DSales_15` | SMALLINT | yes |
| 92 | `M-T-DSales_16` | SMALLINT | yes |
| 93 | `M-T-DSales_17` | SMALLINT | yes |
| 94 | `M-T-DSales_18` | SMALLINT | yes |
| 95 | `S-T-DSales_01` | SMALLINT | yes |
| 96 | `S-T-DSales_02` | SMALLINT | yes |
| 97 | `S-T-DSales_03` | SMALLINT | yes |
| 98 | `S-T-DSales_04` | SMALLINT | yes |
| 99 | `S-T-DSales_05` | SMALLINT | yes |
| 100 | `S-T-DSales_06` | SMALLINT | yes |
| 101 | `S-T-DSales_07` | SMALLINT | yes |
| 102 | `S-T-DSales_08` | SMALLINT | yes |
| 103 | `S-T-DSales_09` | SMALLINT | yes |
| 104 | `S-T-DSales_10` | SMALLINT | yes |
| 105 | `S-T-DSales_11` | SMALLINT | yes |
| 106 | `S-T-DSales_12` | SMALLINT | yes |
| 107 | `S-T-DSales_13` | SMALLINT | yes |
| 108 | `S-T-DSales_14` | SMALLINT | yes |
| 109 | `S-T-DSales_15` | SMALLINT | yes |
| 110 | `S-T-DSales_16` | SMALLINT | yes |
| 111 | `S-T-DSales_17` | SMALLINT | yes |
| 112 | `S-T-DSales_18` | SMALLINT | yes |
| 113 | `Y-T-DSales_01` | SMALLINT | yes |
| 114 | `Y-T-DSales_02` | SMALLINT | yes |
| 115 | `Y-T-DSales_03` | SMALLINT | yes |
| 116 | `Y-T-DSales_04` | SMALLINT | yes |
| 117 | `Y-T-DSales_05` | SMALLINT | yes |
| 118 | `Y-T-DSales_06` | SMALLINT | yes |
| 119 | `Y-T-DSales_07` | SMALLINT | yes |
| 120 | `Y-T-DSales_08` | SMALLINT | yes |
| 121 | `Y-T-DSales_09` | SMALLINT | yes |
| 122 | `Y-T-DSales_10` | SMALLINT | yes |
| 123 | `Y-T-DSales_11` | SMALLINT | yes |
| 124 | `Y-T-DSales_12` | SMALLINT | yes |
| 125 | `Y-T-DSales_13` | SMALLINT | yes |
| 126 | `Y-T-DSales_14` | SMALLINT | yes |
| 127 | `Y-T-DSales_15` | SMALLINT | yes |
| 128 | `Y-T-DSales_16` | SMALLINT | yes |
| 129 | `Y-T-DSales_17` | SMALLINT | yes |
| 130 | `Y-T-DSales_18` | SMALLINT | yes |
| 131 | `MaxQtys_01` | SMALLINT | yes |
| 132 | `MaxQtys_02` | SMALLINT | yes |
| 133 | `MaxQtys_03` | SMALLINT | yes |
| 134 | `MaxQtys_04` | SMALLINT | yes |
| 135 | `MaxQtys_05` | SMALLINT | yes |
| 136 | `MaxQtys_06` | SMALLINT | yes |
| 137 | `MaxQtys_07` | SMALLINT | yes |
| 138 | `MaxQtys_08` | SMALLINT | yes |
| 139 | `MaxQtys_09` | SMALLINT | yes |
| 140 | `MaxQtys_10` | SMALLINT | yes |
| 141 | `MaxQtys_11` | SMALLINT | yes |
| 142 | `MaxQtys_12` | SMALLINT | yes |
| 143 | `MaxQtys_13` | SMALLINT | yes |
| 144 | `MaxQtys_14` | SMALLINT | yes |
| 145 | `MaxQtys_15` | SMALLINT | yes |
| 146 | `MaxQtys_16` | SMALLINT | yes |
| 147 | `MaxQtys_17` | SMALLINT | yes |
| 148 | `MaxQtys_18` | SMALLINT | yes |
| 149 | `Reorder_01` | SMALLINT | yes |
| 150 | `Reorder_02` | SMALLINT | yes |
| 151 | `Reorder_03` | SMALLINT | yes |
| 152 | `Reorder_04` | SMALLINT | yes |
| 153 | `Reorder_05` | SMALLINT | yes |
| 154 | `Reorder_06` | SMALLINT | yes |
| 155 | `Reorder_07` | SMALLINT | yes |
| 156 | `Reorder_08` | SMALLINT | yes |
| 157 | `Reorder_09` | SMALLINT | yes |
| 158 | `Reorder_10` | SMALLINT | yes |
| 159 | `Reorder_11` | SMALLINT | yes |
| 160 | `Reorder_12` | SMALLINT | yes |
| 161 | `Reorder_13` | SMALLINT | yes |
| 162 | `Reorder_14` | SMALLINT | yes |
| 163 | `Reorder_15` | SMALLINT | yes |
| 164 | `Reorder_16` | SMALLINT | yes |
| 165 | `Reorder_17` | SMALLINT | yes |
| 166 | `Reorder_18` | SMALLINT | yes |
| 167 | `LYSales_01` | SMALLINT | yes |
| 168 | `LYSales_02` | SMALLINT | yes |
| 169 | `LYSales_03` | SMALLINT | yes |
| 170 | `LYSales_04` | SMALLINT | yes |
| 171 | `LYSales_05` | SMALLINT | yes |
| 172 | `LYSales_06` | SMALLINT | yes |
| 173 | `LYSales_07` | SMALLINT | yes |
| 174 | `LYSales_08` | SMALLINT | yes |
| 175 | `LYSales_09` | SMALLINT | yes |
| 176 | `LYSales_10` | SMALLINT | yes |
| 177 | `LYSales_11` | SMALLINT | yes |
| 178 | `LYSales_12` | SMALLINT | yes |
| 179 | `LYSales_13` | SMALLINT | yes |
| 180 | `LYSales_14` | SMALLINT | yes |
| 181 | `LYSales_15` | SMALLINT | yes |
| 182 | `LYSales_16` | SMALLINT | yes |
| 183 | `LYSales_17` | SMALLINT | yes |
| 184 | `LYSales_18` | SMALLINT | yes |
| 185 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `SKU` | . |
| `Store` | 99 |
| `Row` |     |
| `Segment` | 1 |
| `OnHand_01` | 0 |
| `OnHand_02` | 0 |
| `OnHand_03` | 60 |
| `OnHand_04` | 60 |
| `OnHand_05` | 60 |
| `OnHand_06` | 0 |
| `OnHand_07` | 0 |
| `OnHand_08` | 0 |
| `OnHand_09` | 0 |
| `OnHand_10` | 0 |
| `OnHand_11` | 0 |
| `OnHand_12` | 0 |
| `OnHand_13` | 0 |
| `OnHand_14` | 0 |
| `OnHand_15` | 0 |
| `OnHand_16` | 0 |
| `OnHand_17` | 0 |
| `OnHand_18` | 0 |
| `CurrentOnOrder_01` | 0 |
| `CurrentOnOrder_02` | 0 |
| `CurrentOnOrder_03` | 0 |
| `CurrentOnOrder_04` | 0 |
| `CurrentOnOrder_05` | 0 |
| `CurrentOnOrder_06` | 0 |
| `CurrentOnOrder_07` | 0 |
| `CurrentOnOrder_08` | 0 |
| `CurrentOnOrder_09` | 0 |
| `CurrentOnOrder_10` | 0 |
| `CurrentOnOrder_11` | 0 |
| `CurrentOnOrder_12` | 0 |
| `CurrentOnOrder_13` | 0 |
| `CurrentOnOrder_14` | 0 |
| `CurrentOnOrder_15` | 0 |
| `CurrentOnOrder_16` | 0 |
| `CurrentOnOrder_17` | 0 |
| `CurrentOnOrder_18` | 0 |
| `FutureOnOrder_01` | 0 |
| `FutureOnOrder_02` | 0 |
| `FutureOnOrder_03` | 0 |
| `FutureOnOrder_04` | 0 |
| `FutureOnOrder_05` | 0 |
| `FutureOnOrder_06` | 0 |
| `FutureOnOrder_07` | 0 |
| `FutureOnOrder_08` | 0 |
| `FutureOnOrder_09` | 0 |
| `FutureOnOrder_10` | 0 |
| `FutureOnOrder_11` | 0 |
| `FutureOnOrder_12` | 0 |
| `FutureOnOrder_13` | 0 |
| `FutureOnOrder_14` | 0 |
| `FutureOnOrder_15` | 0 |
| `FutureOnOrder_16` | 0 |
| `FutureOnOrder_17` | 0 |
| `FutureOnOrder_18` | 0 |
| `Model_01` | 0 |
| `Model_02` | 0 |
| `Model_03` | 0 |
| `Model_04` | 0 |
| `Model_05` | 0 |
| `Model_06` | 0 |
| `Model_07` | 0 |
| `Model_08` | 0 |
| `Model_09` | 0 |
| `Model_10` | 0 |
| `Model_11` | 0 |
| `Model_12` | 0 |
| `Model_13` | 0 |
| `Model_14` | 0 |
| `Model_15` | 0 |
| `Model_16` | 0 |
| `Model_17` | 0 |
| `Model_18` | 0 |
| `M-T-DSales_01` | 0 |
| `M-T-DSales_02` | 0 |
| `M-T-DSales_03` | 0 |
| `M-T-DSales_04` | 0 |
| `M-T-DSales_05` | 0 |
| `M-T-DSales_06` | 0 |
| `M-T-DSales_07` | 0 |
| `M-T-DSales_08` | 0 |
| `M-T-DSales_09` | 0 |
| `M-T-DSales_10` | 0 |
| `M-T-DSales_11` | 0 |
| `M-T-DSales_12` | 0 |
| `M-T-DSales_13` | 0 |
| `M-T-DSales_14` | 0 |
| `M-T-DSales_15` | 0 |
| `M-T-DSales_16` | 0 |
| `M-T-DSales_17` | 0 |
| `M-T-DSales_18` | 0 |
| `S-T-DSales_01` | 0 |
| `S-T-DSales_02` | 0 |
| `S-T-DSales_03` | 0 |
| `S-T-DSales_04` | 0 |
| `S-T-DSales_05` | 0 |
| `S-T-DSales_06` | 0 |
| `S-T-DSales_07` | 0 |
| `S-T-DSales_08` | 0 |
| `S-T-DSales_09` | 0 |
| `S-T-DSales_10` | 0 |
| `S-T-DSales_11` | 0 |
| `S-T-DSales_12` | 0 |
| `S-T-DSales_13` | 0 |
| `S-T-DSales_14` | 0 |
| `S-T-DSales_15` | 0 |
| `S-T-DSales_16` | 0 |
| `S-T-DSales_17` | 0 |
| `S-T-DSales_18` | 0 |
| `Y-T-DSales_01` | 0 |
| `Y-T-DSales_02` | 0 |
| `Y-T-DSales_03` | 0 |
| `Y-T-DSales_04` | 0 |
| `Y-T-DSales_05` | 0 |
| `Y-T-DSales_06` | 0 |
| `Y-T-DSales_07` | 0 |
| `Y-T-DSales_08` | 0 |
| `Y-T-DSales_09` | 0 |
| `Y-T-DSales_10` | 0 |
| `Y-T-DSales_11` | 0 |
| `Y-T-DSales_12` | 0 |
| `Y-T-DSales_13` | 0 |
| `Y-T-DSales_14` | 0 |
| `Y-T-DSales_15` | 0 |
| `Y-T-DSales_16` | 0 |
| `Y-T-DSales_17` | 0 |
| `Y-T-DSales_18` | 0 |
| `MaxQtys_01` | 0 |
| `MaxQtys_02` | 0 |
| `MaxQtys_03` | 0 |
| `MaxQtys_04` | 0 |
| `MaxQtys_05` | 0 |
| `MaxQtys_06` | 0 |
| `MaxQtys_07` | 0 |
| `MaxQtys_08` | 0 |
| `MaxQtys_09` | 0 |
| `MaxQtys_10` | 0 |
| `MaxQtys_11` | 0 |
| `MaxQtys_12` | 0 |
| `MaxQtys_13` | 0 |
| `MaxQtys_14` | 0 |
| `MaxQtys_15` | 0 |
| `MaxQtys_16` | 0 |
| `MaxQtys_17` | 0 |
| `MaxQtys_18` | 0 |
| `Reorder_01` | 0 |
| `Reorder_02` | 0 |
| `Reorder_03` | 0 |
| `Reorder_04` | 0 |
| `Reorder_05` | 0 |
| `Reorder_06` | 0 |
| `Reorder_07` | 0 |
| `Reorder_08` | 0 |
| `Reorder_09` | 0 |
| `Reorder_10` | 0 |
| `Reorder_11` | 0 |
| `Reorder_12` | 0 |
| `Reorder_13` | 0 |
| `Reorder_14` | 0 |
| `Reorder_15` | 0 |
| `Reorder_16` | 0 |
| `Reorder_17` | 0 |
| `Reorder_18` | 0 |
| `LYSales_01` | 0 |
| `LYSales_02` | 0 |
| `LYSales_03` | 0 |
| `LYSales_04` | 0 |
| `LYSales_05` | 0 |
| `LYSales_06` | 0 |
| `LYSales_07` | 0 |
| `LYSales_08` | 0 |
| `LYSales_09` | 0 |
| `LYSales_10` | 0 |
| `LYSales_11` | 0 |
| `LYSales_12` | 0 |
| `LYSales_13` | 0 |
| `LYSales_14` | 0 |
| `LYSales_15` | 0 |
| `LYSales_16` | 0 |
| `LYSales_17` | 0 |
| `LYSales_18` | 0 |
| `DateLastChanged` | /Date(1763042610000)/ |

</details>

## RITRNSSV.MDB
_Sales ticket header + detail (sales-reporting)_

**Tables (7):** `Payouts`, `SalesBatches`, `TicketDetail`, `TicketHeader`, `TicketTender`, `TimeClock`, `Transmitted`

### `Payouts`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `UserID` | WCHAR | yes |
| 2 | `BatchDate` | DATE | yes |
| 3 | `UseDate` | DATE | yes |
| 4 | `Terminal` | WCHAR | yes |
| 5 | `Store` | SMALLINT | yes |
| 6 | `RealDate` | DATE | yes |
| 7 | `Cashier` | WCHAR | yes |
| 8 | `Description` | WCHAR | yes |
| 9 | `Amount` | CURRENCY | yes |
| 10 | `Printed` | BOOLEAN | no |
| 11 | `Posted` | WCHAR | yes |

### `SalesBatches`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `UserID` | WCHAR | yes |
| 2 | `BatchDate` | DATE | yes |
| 3 | `UseDate` | DATE | yes |
| 4 | `Terminal` | WCHAR | yes |
| 5 | `Store` | SMALLINT | yes |
| 6 | `BatchClosed` | BOOLEAN | no |
| 7 | `BatchCloseDate` | DATE | yes |
| 8 | `BatchOverShort` | CURRENCY | yes |
| 9 | `RealDate` | DATE | yes |
| 10 | `LastTicket` | INTEGER | yes |
| 11 | `DrawerIn` | CURRENCY | yes |
| 12 | `DrawerOut` | CURRENCY | yes |
| 13 | `BatchNo` | INTEGER | yes |
| 14 | `BatchStore` | SMALLINT | yes |
| 15 | `BatchRegister` | WCHAR | yes |
| 16 | `Printed` | BOOLEAN | no |
| 17 | `Posted` | WCHAR | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `UserID` | ACTUALIZAR |
| `BatchDate` | /Date(1701273218000)/ |
| `UseDate` |  |
| `Terminal` | P |
| `Store` | 13 |
| `BatchClosed` | false |
| `BatchCloseDate` |  |
| `BatchOverShort` | 0 |
| `RealDate` | /Date(1701273218000)/ |
| `LastTicket` | 0 |
| `DrawerIn` | 0 |
| `DrawerOut` | 0 |
| `BatchNo` | 7161 |
| `BatchStore` | 13 |
| `BatchRegister` | A |
| `Printed` | true |
| `Posted` | Y |

</details>

### `TicketDetail`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `UserID` | WCHAR | yes |
| 2 | `BatchDate` | DATE | yes |
| 3 | `UseDate` | DATE | yes |
| 4 | `Terminal` | WCHAR | yes |
| 5 | `Store` | SMALLINT | yes |
| 6 | `Ticket` | INTEGER | yes |
| 7 | `RealDate` | DATE | yes |
| 8 | `Line` | INTEGER | yes |
| 9 | `SKU` | WCHAR | yes |
| 10 | `Column` | WCHAR | yes |
| 11 | `Row` | WCHAR | yes |
| 12 | `Qty` | SMALLINT | yes |
| 13 | `Price` | CURRENCY | yes |
| 14 | `DiscPct` | CURRENCY | yes |
| 15 | `DiscAmt` | CURRENCY | yes |
| 16 | `Perks` | CURRENCY | yes |
| 17 | `SalesPerson` | WCHAR | yes |
| 18 | `FamMember` | WCHAR | yes |
| 19 | `Prices_01` | CURRENCY | yes |
| 20 | `Prices_02` | CURRENCY | yes |
| 21 | `Prices_03` | CURRENCY | yes |
| 22 | `Prices_04` | CURRENCY | yes |
| 23 | `OvsAmt` | CURRENCY | yes |
| 24 | `ThisOvsAmt` | CURRENCY | yes |
| 25 | `Category` | SMALLINT | yes |
| 26 | `Vendor` | WCHAR | yes |
| 27 | `RealPrice` | CURRENCY | yes |
| 28 | `Extension` | CURRENCY | yes |
| 29 | `OrigTicket` | INTEGER | yes |
| 30 | `Tax_01` | BOOLEAN | no |
| 31 | `Tax_02` | BOOLEAN | no |
| 32 | `Tax_03` | BOOLEAN | no |
| 33 | `TaxAmt_01` | CURRENCY | yes |
| 34 | `TaxAmt_02` | CURRENCY | yes |
| 35 | `TaxAmt_03` | CURRENCY | yes |
| 36 | `FBGen` | BOOLEAN | no |
| 37 | `DSShipCode` | SMALLINT | yes |
| 38 | `DSShipDesc` | WCHAR | yes |
| 39 | `DSDestCode` | WCHAR | yes |
| 40 | `DSDyeCode` | WCHAR | yes |
| 41 | `DSShipChg` | CURRENCY | yes |
| 42 | `ReturnCode` | SMALLINT | yes |
| 43 | `GiftCert` | WCHAR | yes |
| 44 | `GiftSeq` | SMALLINT | yes |
| 45 | `GiftAcct` | WCHAR | yes |
| 46 | `Cost` | CURRENCY | yes |
| 47 | `Comment` | WCHAR | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `UserID` | BASS |
| `BatchDate` | /Date(1698854827000)/ |
| `UseDate` |  |
| `Terminal` | P |
| `Store` | 19 |
| `Ticket` | 62751 |
| `RealDate` | /Date(1698857412000)/ |
| `Line` | 3 |
| `SKU` | TALLADEGABITBK  |
| `Column` | 090  |
| `Row` | M   |
| `Qty` | 1 |
| `Price` | 3201.1 |
| `DiscPct` | 0 |
| `DiscAmt` | 0 |
| `Perks` | 0 |
| `SalesPerson` | GAMU |
| `FamMember` |    |
| `Prices_01` | 3369.57 |
| `Prices_02` | 3201.1 |
| `Prices_03` | 2864.13 |
| `Prices_04` | 0 |
| `OvsAmt` | 0 |
| `ThisOvsAmt` | 0 |
| `Category` | 122 |
| `Vendor` | WEYC |
| `RealPrice` | 3201.1 |
| `Extension` | 3201.1 |
| `OrigTicket` | 0 |
| `Tax_01` | true |
| `Tax_02` | true |
| `Tax_03` | false |
| `TaxAmt_01` | 480.17 |
| `TaxAmt_02` | 0 |
| `TaxAmt_03` | 0 |
| `FBGen` | false |
| `DSShipCode` | 0 |
| `DSShipDesc` |                 |
| `DSDestCode` |   |
| `DSDyeCode` |      |
| `DSShipChg` | 0 |
| `ReturnCode` | 0 |
| `GiftCert` |  |
| `GiftSeq` | 0 |
| `GiftAcct` |  |
| `Cost` | 1793.15 |
| `Comment` |  |

</details>

### `TicketHeader`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `UserID` | WCHAR | yes |
| 2 | `BatchDate` | DATE | yes |
| 3 | `UseDate` | DATE | yes |
| 4 | `Terminal` | WCHAR | yes |
| 5 | `Store` | SMALLINT | yes |
| 6 | `Ticket` | INTEGER | yes |
| 7 | `RealDate` | DATE | yes |
| 8 | `Cashier` | WCHAR | yes |
| 9 | `TransType` | SMALLINT | yes |
| 10 | `Account` | WCHAR | yes |
| 11 | `Tax_01` | CURRENCY | yes |
| 12 | `Tax_02` | CURRENCY | yes |
| 13 | `Tax_03` | CURRENCY | yes |
| 14 | `TaxChange` | BOOLEAN | no |
| 15 | `OthChg` | CURRENCY | yes |
| 16 | `PrevPaid` | CURRENCY | yes |
| 17 | `Comment` | WCHAR | yes |
| 18 | `Change` | CURRENCY | yes |
| 19 | `AltChange` | CURRENCY | yes |
| 20 | `ExchRate` | CURRENCY | yes |
| 21 | `Discount` | REAL | yes |
| 22 | `ApplyTo` | INTEGER | yes |
| 23 | `ApplyTender` | SMALLINT | yes |
| 24 | `ApplyAmount` | CURRENCY | yes |
| 25 | `ShipState` | WCHAR | yes |
| 26 | `ShipCounty` | WCHAR | yes |
| 27 | `ShipCity` | WCHAR | yes |
| 28 | `MarketingCode` | WCHAR | yes |
| 29 | `Voided` | BOOLEAN | no |
| 30 | `Printed` | BOOLEAN | no |
| 31 | `Posted` | WCHAR | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `UserID` | PLACEMIR |
| `BatchDate` | /Date(1770566619000)/ |
| `UseDate` |  |
| `Terminal` | P |
| `Store` | 16 |
| `Ticket` | 72759 |
| `RealDate` | /Date(1770568273000)/ |
| `Cashier` | PONK |
| `TransType` | 1 |
| `Account` | 1697079607 |
| `Tax_01` | 193.96 |
| `Tax_02` | 0 |
| `Tax_03` | 0 |
| `TaxChange` | false |
| `OthChg` | 0 |
| `PrevPaid` | 0 |
| `Comment` | 9724  ide 0801- 1990-06238 |
| `Change` | 0 |
| `AltChange` | 0 |
| `ExchRate` | 0 |
| `Discount` | 0 |
| `ApplyTo` | 0 |
| `ApplyTender` | 0 |
| `ApplyAmount` | 0 |
| `ShipState` |  |
| `ShipCounty` |  |
| `ShipCity` |  |
| `MarketingCode` |  |
| `Voided` | false |
| `Printed` | true |
| `Posted` | Y |

</details>

### `TicketTender`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `UserID` | WCHAR | yes |
| 2 | `BatchDate` | DATE | yes |
| 3 | `UseDate` | DATE | yes |
| 4 | `Terminal` | WCHAR | yes |
| 5 | `Store` | SMALLINT | yes |
| 6 | `Ticket` | INTEGER | yes |
| 7 | `RealDate` | DATE | yes |
| 8 | `Tender` | SMALLINT | yes |
| 9 | `Amount` | CURRENCY | yes |
| 10 | `AltAmount` | CURRENCY | yes |
| 11 | `AltCurrency` | BOOLEAN | no |
| 12 | `ExchRate` | CURRENCY | yes |
| 13 | `GiftCert` | WCHAR | yes |
| 14 | `GiftSeq` | SMALLINT | yes |
| 15 | `GiftNew` | BOOLEAN | no |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `UserID` | UNMETRO |
| `BatchDate` | /Date(1760544015000)/ |
| `UseDate` |  |
| `Terminal` | P |
| `Store` | 14 |
| `Ticket` | 69557 |
| `RealDate` | /Date(1760551180000)/ |
| `Tender` | 1 |
| `Amount` | 1500 |
| `AltAmount` | 0 |
| `AltCurrency` | false |
| `ExchRate` | 0 |
| `GiftCert` |  |
| `GiftSeq` | 0 |
| `GiftNew` | false |

</details>

### `TimeClock`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `SalesPerson` | WCHAR | yes |
| 2 | `OnClock` | WCHAR | yes |
| 3 | `TimeIn` | WCHAR | yes |
| 4 | `TimeInOvr` | BOOLEAN | no |
| 5 | `TimeInUser` | WCHAR | yes |
| 6 | `TimeInReal` | WCHAR | yes |
| 7 | `TimeOut` | WCHAR | yes |
| 8 | `TimeOutOvr` | BOOLEAN | no |
| 9 | `TimeOutUser` | WCHAR | yes |
| 10 | `TimeOutReal` | WCHAR | yes |
| 11 | `NonSalesHours` | BOOLEAN | no |
| 12 | `ReverseHours` | BOOLEAN | no |
| 13 | `Store` | SMALLINT | yes |
| 14 | `Printed` | BOOLEAN | no |
| 15 | `Posted` | BOOLEAN | no |

### `Transmitted`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `TransDate` | DATE | yes |

## RISTORE.MDB
_Store master (sales-reporting)_

**Tables (1):** `StoreMaster`

### `StoreMaster`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Number` | SMALLINT | yes |
| 2 | `Desc` | WCHAR | yes |
| 3 | `MailName` | WCHAR | yes |
| 4 | `Addr1` | WCHAR | yes |
| 5 | `Addr2` | WCHAR | yes |
| 6 | `City` | WCHAR | yes |
| 7 | `State` | WCHAR | yes |
| 8 | `Zip` | WCHAR | yes |
| 9 | `EMail` | WCHAR | yes |
| 10 | `HowTax` | WCHAR | yes |
| 11 | `TaxDesc_01` | WCHAR | yes |
| 12 | `TaxDesc_02` | WCHAR | yes |
| 13 | `TaxDesc_03` | WCHAR | yes |
| 14 | `Tax_01` | REAL | yes |
| 15 | `Tax_02` | REAL | yes |
| 16 | `Tax_03` | REAL | yes |
| 17 | `TaxThreshold_01` | CURRENCY | yes |
| 18 | `TaxThreshold_02` | CURRENCY | yes |
| 19 | `TaxThreshold_03` | CURRENCY | yes |
| 20 | `TaxPriceDiff_01` | BOOLEAN | no |
| 21 | `TaxPriceDiff_02` | BOOLEAN | no |
| 22 | `TaxPriceDiff_03` | BOOLEAN | no |
| 23 | `TaxPriceCat_01` | WCHAR | yes |
| 24 | `TaxPriceCat_02` | WCHAR | yes |
| 25 | `TaxPriceCat_03` | WCHAR | yes |
| 26 | `Tender_01` | WCHAR | yes |
| 27 | `Tender_02` | WCHAR | yes |
| 28 | `Tender_03` | WCHAR | yes |
| 29 | `Tender_04` | WCHAR | yes |
| 30 | `Tender_05` | WCHAR | yes |
| 31 | `Tender_06` | WCHAR | yes |
| 32 | `Tender_07` | WCHAR | yes |
| 33 | `Tender_08` | WCHAR | yes |
| 34 | `Tender_09` | WCHAR | yes |
| 35 | `Tender_10` | WCHAR | yes |
| 36 | `Tender_11` | WCHAR | yes |
| 37 | `Tender_12` | WCHAR | yes |
| 38 | `TenderDrawer_01` | BOOLEAN | no |
| 39 | `TenderDrawer_02` | BOOLEAN | no |
| 40 | `TenderDrawer_03` | BOOLEAN | no |
| 41 | `TenderDrawer_04` | BOOLEAN | no |
| 42 | `TenderDrawer_05` | BOOLEAN | no |
| 43 | `TenderDrawer_06` | BOOLEAN | no |
| 44 | `TenderDrawer_07` | BOOLEAN | no |
| 45 | `TenderDrawer_08` | BOOLEAN | no |
| 46 | `TenderDrawer_09` | BOOLEAN | no |
| 47 | `TenderDrawer_10` | BOOLEAN | no |
| 48 | `TenderDrawer_11` | BOOLEAN | no |
| 49 | `TenderDrawer_12` | BOOLEAN | no |
| 50 | `TenderCash_01` | BOOLEAN | no |
| 51 | `TenderCash_02` | BOOLEAN | no |
| 52 | `TenderCash_03` | BOOLEAN | no |
| 53 | `TenderCash_04` | BOOLEAN | no |
| 54 | `TenderCash_05` | BOOLEAN | no |
| 55 | `TenderCash_06` | BOOLEAN | no |
| 56 | `TenderCash_07` | BOOLEAN | no |
| 57 | `TenderCash_08` | BOOLEAN | no |
| 58 | `TenderCash_09` | BOOLEAN | no |
| 59 | `TenderCash_10` | BOOLEAN | no |
| 60 | `TenderCash_11` | BOOLEAN | no |
| 61 | `TenderCash_12` | BOOLEAN | no |
| 62 | `LastTicket` | INTEGER | yes |
| 63 | `Phone` | WCHAR | yes |
| 64 | `Fax` | WCHAR | yes |
| 65 | `TenderAccum_01` | CURRENCY | yes |
| 66 | `TenderAccum_02` | CURRENCY | yes |
| 67 | `TenderAccum_03` | CURRENCY | yes |
| 68 | `TenderAccum_04` | CURRENCY | yes |
| 69 | `TenderAccum_05` | CURRENCY | yes |
| 70 | `TenderAccum_06` | CURRENCY | yes |
| 71 | `TenderAccum_07` | CURRENCY | yes |
| 72 | `TenderAccum_08` | CURRENCY | yes |
| 73 | `TenderAccum_09` | CURRENCY | yes |
| 74 | `TenderAccum_10` | CURRENCY | yes |
| 75 | `TenderAccum_11` | CURRENCY | yes |
| 76 | `TenderAccum_12` | CURRENCY | yes |
| 77 | `Payouts` | CURRENCY | yes |
| 78 | `OverShort` | CURRENCY | yes |
| 79 | `Trans2` | CURRENCY | yes |
| 80 | `Trans3` | CURRENCY | yes |
| 81 | `Trans4` | CURRENCY | yes |
| 82 | `Trans6` | CURRENCY | yes |
| 83 | `Trans7` | CURRENCY | yes |
| 84 | `Trans8` | CURRENCY | yes |
| 85 | `Retail` | CURRENCY | yes |
| 86 | `Markdown` | CURRENCY | yes |
| 87 | `Returns` | CURRENCY | yes |
| 88 | `CostofSales` | CURRENCY | yes |
| 89 | `SalesTax1` | CURRENCY | yes |
| 90 | `SalesTax2` | CURRENCY | yes |
| 91 | `SalesTax3` | CURRENCY | yes |
| 92 | `OtherCharges` | CURRENCY | yes |
| 93 | `GiftCertSold` | CURRENCY | yes |
| 94 | `Trans1Tenders_01` | CURRENCY | yes |
| 95 | `Trans1Tenders_02` | CURRENCY | yes |
| 96 | `Trans1Tenders_03` | CURRENCY | yes |
| 97 | `Trans1Tenders_04` | CURRENCY | yes |
| 98 | `Trans1Tenders_05` | CURRENCY | yes |
| 99 | `Trans1Tenders_06` | CURRENCY | yes |
| 100 | `Trans1Tenders_07` | CURRENCY | yes |
| 101 | `Trans1Tenders_08` | CURRENCY | yes |
| 102 | `Trans1Tenders_09` | CURRENCY | yes |
| 103 | `Trans1Tenders_10` | CURRENCY | yes |
| 104 | `Trans1Tenders_11` | CURRENCY | yes |
| 105 | `Trans1Tenders_12` | CURRENCY | yes |
| 106 | `DrawerDiff` | CURRENCY | yes |
| 107 | `YTDRetail` | CURRENCY | yes |
| 108 | `YTDMarkdown` | CURRENCY | yes |
| 109 | `YTDReturns` | CURRENCY | yes |
| 110 | `YTDCostofSales` | CURRENCY | yes |
| 111 | `YTDSalesTax1` | CURRENCY | yes |
| 112 | `YTDSalesTax2` | CURRENCY | yes |
| 113 | `YTDSalesTax3` | CURRENCY | yes |
| 114 | `YTDOtherCharges` | CURRENCY | yes |
| 115 | `YTDGiftCertSold` | CURRENCY | yes |
| 116 | `YTDGiftCertRedeem` | CURRENCY | yes |
| 117 | `YTDTrans1Tenders_01` | CURRENCY | yes |
| 118 | `YTDTrans1Tenders_02` | CURRENCY | yes |
| 119 | `YTDTrans1Tenders_03` | CURRENCY | yes |
| 120 | `YTDTrans1Tenders_04` | CURRENCY | yes |
| 121 | `YTDTrans1Tenders_05` | CURRENCY | yes |
| 122 | `YTDTrans1Tenders_06` | CURRENCY | yes |
| 123 | `YTDTrans1Tenders_07` | CURRENCY | yes |
| 124 | `YTDTrans1Tenders_08` | CURRENCY | yes |
| 125 | `YTDTrans1Tenders_09` | CURRENCY | yes |
| 126 | `YTDTrans1Tenders_10` | CURRENCY | yes |
| 127 | `YTDTrans1Tenders_11` | CURRENCY | yes |
| 128 | `YTDTrans1Tenders_12` | CURRENCY | yes |
| 129 | `YTDTrans2` | CURRENCY | yes |
| 130 | `YTDTrans3` | CURRENCY | yes |
| 131 | `YTDTrans4` | CURRENCY | yes |
| 132 | `YTDDrawerDiff` | CURRENCY | yes |
| 133 | `CurrYrSalesProj` | CURRENCY | yes |
| 134 | `NextYrSalesProj` | CURRENCY | yes |
| 135 | `CurrSalesPercent_01` | REAL | yes |
| 136 | `CurrSalesPercent_02` | REAL | yes |
| 137 | `CurrSalesPercent_03` | REAL | yes |
| 138 | `CurrSalesPercent_04` | REAL | yes |
| 139 | `CurrSalesPercent_05` | REAL | yes |
| 140 | `CurrSalesPercent_06` | REAL | yes |
| 141 | `CurrSalesPercent_07` | REAL | yes |
| 142 | `CurrSalesPercent_08` | REAL | yes |
| 143 | `CurrSalesPercent_09` | REAL | yes |
| 144 | `CurrSalesPercent_10` | REAL | yes |
| 145 | `CurrSalesPercent_11` | REAL | yes |
| 146 | `CurrSalesPercent_12` | REAL | yes |
| 147 | `NextSalesPercent_01` | REAL | yes |
| 148 | `NextSalesPercent_02` | REAL | yes |
| 149 | `NextSalesPercent_03` | REAL | yes |
| 150 | `NextSalesPercent_04` | REAL | yes |
| 151 | `NextSalesPercent_05` | REAL | yes |
| 152 | `NextSalesPercent_06` | REAL | yes |
| 153 | `NextSalesPercent_07` | REAL | yes |
| 154 | `NextSalesPercent_08` | REAL | yes |
| 155 | `NextSalesPercent_09` | REAL | yes |
| 156 | `NextSalesPercent_10` | REAL | yes |
| 157 | `NextSalesPercent_11` | REAL | yes |
| 158 | `NextSalesPercent_12` | REAL | yes |
| 159 | `CurrMkdwnPercent_01` | REAL | yes |
| 160 | `CurrMkdwnPercent_02` | REAL | yes |
| 161 | `CurrMkdwnPercent_03` | REAL | yes |
| 162 | `CurrMkdwnPercent_04` | REAL | yes |
| 163 | `CurrMkdwnPercent_05` | REAL | yes |
| 164 | `CurrMkdwnPercent_06` | REAL | yes |
| 165 | `CurrMkdwnPercent_07` | REAL | yes |
| 166 | `CurrMkdwnPercent_08` | REAL | yes |
| 167 | `CurrMkdwnPercent_09` | REAL | yes |
| 168 | `CurrMkdwnPercent_10` | REAL | yes |
| 169 | `CurrMkdwnPercent_11` | REAL | yes |
| 170 | `CurrMkdwnPercent_12` | REAL | yes |
| 171 | `NextMkdwnPercent_01` | REAL | yes |
| 172 | `NextMkdwnPercent_02` | REAL | yes |
| 173 | `NextMkdwnPercent_03` | REAL | yes |
| 174 | `NextMkdwnPercent_04` | REAL | yes |
| 175 | `NextMkdwnPercent_05` | REAL | yes |
| 176 | `NextMkdwnPercent_06` | REAL | yes |
| 177 | `NextMkdwnPercent_07` | REAL | yes |
| 178 | `NextMkdwnPercent_08` | REAL | yes |
| 179 | `NextMkdwnPercent_09` | REAL | yes |
| 180 | `NextMkdwnPercent_10` | REAL | yes |
| 181 | `NextMkdwnPercent_11` | REAL | yes |
| 182 | `NextMkdwnPercent_12` | REAL | yes |
| 183 | `BillMailName` | WCHAR | yes |
| 184 | `BillAddr1` | WCHAR | yes |
| 185 | `BillAddr2` | WCHAR | yes |
| 186 | `BillCity` | WCHAR | yes |
| 187 | `BillState` | WCHAR | yes |
| 188 | `BillZip` | WCHAR | yes |
| 189 | `OtherChargeDesc` | WCHAR | yes |
| 190 | `Region` | SMALLINT | yes |
| 191 | `Tender99` | CURRENCY | yes |
| 192 | `YTDTender99` | CURRENCY | yes |
| 193 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Number` | 1 |
| `Desc` | Venta en Linea |
| `MailName` |  |
| `Addr1` | Boulevard Suyapa Ed, Simon |
| `Addr2` |  |
| `City` | Tegucigalpa M.D.C. |
| `State` | FM |
| `Zip` |  |
| `EMail` |  |
| `HowTax` | 1 |
| `TaxDesc_01` | 15% I.S.V. |
| `TaxDesc_02` | ISV.Ad |
| `TaxDesc_03` |  |
| `Tax_01` | 15 |
| `Tax_02` | 0 |
| `Tax_03` | 0 |
| `TaxThreshold_01` | 0 |
| `TaxThreshold_02` | 0 |
| `TaxThreshold_03` | 0 |
| `TaxPriceDiff_01` | false |
| `TaxPriceDiff_02` | false |
| `TaxPriceDiff_03` | false |
| `TaxPriceCat_01` |  |
| `TaxPriceCat_02` |  |
| `TaxPriceCat_03` |  |
| `Tender_01` | Efectivo L |
| `Tender_02` | Cheque L |
| `Tender_03` | Credomatic L |
| `Tender_04` | Efvo Dol a L |
| `Tender_05` |  |
| `Tender_06` |  |
| `Tender_07` | Credt Slip |
| `Tender_08` | Not Used |
| `Tender_09` | House Charge |
| `Tender_10` | Gift Cert. |
| `Tender_11` | Store Credit |
| `Tender_12` |  |
| `TenderDrawer_01` | true |
| `TenderDrawer_02` | false |
| `TenderDrawer_03` | false |
| `TenderDrawer_04` | true |
| `TenderDrawer_05` | false |
| `TenderDrawer_06` | false |
| `TenderDrawer_07` | false |
| `TenderDrawer_08` | false |
| `TenderDrawer_09` | false |
| `TenderDrawer_10` | false |
| `TenderDrawer_11` | false |
| `TenderDrawer_12` | false |
| `TenderCash_01` | true |
| `TenderCash_02` | true |
| `TenderCash_03` | true |
| `TenderCash_04` | true |
| `TenderCash_05` | false |
| `TenderCash_06` | false |
| `TenderCash_07` | false |
| `TenderCash_08` | false |
| `TenderCash_09` | false |
| `TenderCash_10` | false |
| `TenderCash_11` | false |
| `TenderCash_12` | false |
| `LastTicket` | 0 |
| `Phone` |  |
| `Fax` |  |
| `TenderAccum_01` | 0 |
| `TenderAccum_02` | 0 |
| `TenderAccum_03` | 0 |
| `TenderAccum_04` | 0 |
| `TenderAccum_05` | 0 |
| `TenderAccum_06` | 0 |
| `TenderAccum_07` | 0 |
| `TenderAccum_08` | 0 |
| `TenderAccum_09` | 0 |
| `TenderAccum_10` | 0 |
| `TenderAccum_11` | 0 |
| `TenderAccum_12` | 0 |
| `Payouts` | 0 |
| `OverShort` | 0 |
| `Trans2` | 0 |
| `Trans3` | 0 |
| `Trans4` | 0 |
| `Trans6` | 0 |
| `Trans7` | 0 |
| `Trans8` | 0 |
| `Retail` | 0 |
| `Markdown` | 0 |
| `Returns` | 0 |
| `CostofSales` | 0 |
| `SalesTax1` | 0 |
| `SalesTax2` | 0 |
| `SalesTax3` | 0 |
| `OtherCharges` | 0 |
| `GiftCertSold` | 0 |
| `Trans1Tenders_01` | 0 |
| `Trans1Tenders_02` | 0 |
| `Trans1Tenders_03` | 0 |
| `Trans1Tenders_04` | 0 |
| `Trans1Tenders_05` | 0 |
| `Trans1Tenders_06` | 0 |
| `Trans1Tenders_07` | 0 |
| `Trans1Tenders_08` | 0 |
| `Trans1Tenders_09` | 0 |
| `Trans1Tenders_10` | 0 |
| `Trans1Tenders_11` | 0 |
| `Trans1Tenders_12` | 0 |
| `DrawerDiff` | 0 |
| `YTDRetail` | 0 |
| `YTDMarkdown` | 0 |
| `YTDReturns` | 0 |
| `YTDCostofSales` | 0 |
| `YTDSalesTax1` | 0 |
| `YTDSalesTax2` | 0 |
| `YTDSalesTax3` | 0 |
| `YTDOtherCharges` | 0 |
| `YTDGiftCertSold` | 0 |
| `YTDGiftCertRedeem` | 0 |
| `YTDTrans1Tenders_01` | 0 |
| `YTDTrans1Tenders_02` | 0 |
| `YTDTrans1Tenders_03` | 0 |
| `YTDTrans1Tenders_04` | 0 |
| `YTDTrans1Tenders_05` | 0 |
| `YTDTrans1Tenders_06` | 0 |
| `YTDTrans1Tenders_07` | 0 |
| `YTDTrans1Tenders_08` | 0 |
| `YTDTrans1Tenders_09` | 0 |
| `YTDTrans1Tenders_10` | 0 |
| `YTDTrans1Tenders_11` | 0 |
| `YTDTrans1Tenders_12` | 0 |
| `YTDTrans2` | 0 |
| `YTDTrans3` | 0 |
| `YTDTrans4` | 0 |
| `YTDDrawerDiff` | 0 |
| `CurrYrSalesProj` | 0 |
| `NextYrSalesProj` | 0 |
| `CurrSalesPercent_01` | 0 |
| `CurrSalesPercent_02` | 0 |
| `CurrSalesPercent_03` | 0 |
| `CurrSalesPercent_04` | 0 |
| `CurrSalesPercent_05` | 0 |
| `CurrSalesPercent_06` | 0 |
| `CurrSalesPercent_07` | 1.35631564e-19 |
| `CurrSalesPercent_08` | 1.35631564e-19 |
| `CurrSalesPercent_09` | 1.35631564e-19 |
| `CurrSalesPercent_10` | 1.35631564e-19 |
| `CurrSalesPercent_11` | 1.35631564e-19 |
| `CurrSalesPercent_12` | 1.35631564e-19 |
| `NextSalesPercent_01` | 0 |
| `NextSalesPercent_02` | 0 |
| `NextSalesPercent_03` | 0 |
| `NextSalesPercent_04` | 0 |
| `NextSalesPercent_05` | 0 |
| `NextSalesPercent_06` | 0 |
| `NextSalesPercent_07` | 1.35631564e-19 |
| `NextSalesPercent_08` | 1.35631564e-19 |
| `NextSalesPercent_09` | 1.35631564e-19 |
| `NextSalesPercent_10` | 1.35631564e-19 |
| `NextSalesPercent_11` | 1.35631564e-19 |
| `NextSalesPercent_12` | 1.35631564e-19 |
| `CurrMkdwnPercent_01` | 0 |
| `CurrMkdwnPercent_02` | 0 |
| `CurrMkdwnPercent_03` | 0 |
| `CurrMkdwnPercent_04` | 0 |
| `CurrMkdwnPercent_05` | 0 |
| `CurrMkdwnPercent_06` | 0 |
| `CurrMkdwnPercent_07` | 1.35631564e-19 |
| `CurrMkdwnPercent_08` | 1.35631564e-19 |
| `CurrMkdwnPercent_09` | 1.35631564e-19 |
| `CurrMkdwnPercent_10` | 1.35631564e-19 |
| `CurrMkdwnPercent_11` | 1.35631564e-19 |
| `CurrMkdwnPercent_12` | 1.35631564e-19 |
| `NextMkdwnPercent_01` | 0 |
| `NextMkdwnPercent_02` | 0 |
| `NextMkdwnPercent_03` | 0 |
| `NextMkdwnPercent_04` | 0 |
| `NextMkdwnPercent_05` | 0 |
| `NextMkdwnPercent_06` | 0 |
| `NextMkdwnPercent_07` | 1.35631564e-19 |
| `NextMkdwnPercent_08` | 1.35631564e-19 |
| `NextMkdwnPercent_09` | 1.35631564e-19 |
| `NextMkdwnPercent_10` | 1.35631564e-19 |
| `NextMkdwnPercent_11` | 1.35631564e-19 |
| `NextMkdwnPercent_12` | 1.35631564e-19 |
| `BillMailName` |  |
| `BillAddr1` |  |
| `BillAddr2` |  |
| `BillCity` |  |
| `BillState` |  |
| `BillZip` |  |
| `OtherChargeDesc` | Caja de Regalo |
| `Region` | 0 |
| `Tender99` | 0 |
| `YTDTender99` | 0 |
| `DateLastChanged` | /Date(1720071268000)/ |

</details>

## RISLSPSN.MDB
_Salesperson master (sales-reporting)_

**Tables (3):** `DeptOverride`, `Salespeople`, `SalespeopleSales`

### `DeptOverride`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `Dept` | SMALLINT | yes |
| 3 | `Commission` | REAL | yes |
| 4 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | PERG |
| `Dept` | 45 |
| `Commission` | 1 |
| `DateLastChanged` | /Date(1115135561000)/ |

</details>

### `Salespeople`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `Name` | WCHAR | yes |
| 3 | `Other Info` | WCHAR | yes |
| 4 | `Comm Method` | WCHAR | yes |
| 5 | `TCPassword` | WCHAR | yes |
| 6 | `TCAdmin` | BOOLEAN | no |
| 7 | `TCFullUser` | BOOLEAN | no |
| 8 | `Commission` | REAL | yes |
| 9 | `CashierPassword` | WCHAR | yes |
| 10 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | 29 |
| `Name` | Benigno Palma |
| `Other Info` |  |
| `Comm Method` | S |
| `TCPassword` |  |
| `TCAdmin` | false |
| `TCFullUser` | false |
| `Commission` | 1 |
| `CashierPassword` |  |
| `DateLastChanged` | /Date(1109372516000)/ |

</details>

### `SalespeopleSales`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Code` | WCHAR | yes |
| 2 | `Store` | SMALLINT | yes |
| 3 | `Sales_01` | CURRENCY | yes |
| 4 | `Sales_02` | CURRENCY | yes |
| 5 | `Sales_03` | CURRENCY | yes |
| 6 | `Sales_04` | CURRENCY | yes |
| 7 | `Profit_01` | CURRENCY | yes |
| 8 | `Profit_02` | CURRENCY | yes |
| 9 | `Profit_03` | CURRENCY | yes |
| 10 | `Profit_04` | CURRENCY | yes |
| 11 | `Comm_01` | CURRENCY | yes |
| 12 | `Comm_02` | CURRENCY | yes |
| 13 | `Comm_03` | CURRENCY | yes |
| 14 | `Comm_04` | CURRENCY | yes |
| 15 | `Perks_01` | CURRENCY | yes |
| 16 | `Perks_02` | CURRENCY | yes |
| 17 | `Perks_03` | CURRENCY | yes |
| 18 | `Perks_04` | CURRENCY | yes |
| 19 | `Hours_01` | CURRENCY | yes |
| 20 | `Hours_02` | CURRENCY | yes |
| 21 | `Hours_03` | CURRENCY | yes |
| 22 | `Hours_04` | CURRENCY | yes |
| 23 | `NonSalesHours_01` | CURRENCY | yes |
| 24 | `NonSalesHours_02` | CURRENCY | yes |
| 25 | `NonSalesHours_03` | CURRENCY | yes |
| 26 | `NonSalesHours_04` | CURRENCY | yes |
| 27 | `Total Tickets 1_01` | INTEGER | yes |
| 28 | `Total Tickets 1_02` | INTEGER | yes |
| 29 | `Total Tickets 1_03` | INTEGER | yes |
| 30 | `Total Tickets 1_04` | INTEGER | yes |
| 31 | `Total Tickets 2_01` | INTEGER | yes |
| 32 | `Total Tickets 2_02` | INTEGER | yes |
| 33 | `Total Tickets 2_03` | INTEGER | yes |
| 34 | `Total Tickets 2_04` | INTEGER | yes |
| 35 | `Total Tickets 3_01` | INTEGER | yes |
| 36 | `Total Tickets 3_02` | INTEGER | yes |
| 37 | `Total Tickets 3_03` | INTEGER | yes |
| 38 | `Total Tickets 3_04` | INTEGER | yes |
| 39 | `Total Tickets 4_01` | INTEGER | yes |
| 40 | `Total Tickets 4_02` | INTEGER | yes |
| 41 | `Total Tickets 4_03` | INTEGER | yes |
| 42 | `Total Tickets 4_04` | INTEGER | yes |
| 43 | `Total MultiTickets 1_01` | INTEGER | yes |
| 44 | `Total MultiTickets 1_02` | INTEGER | yes |
| 45 | `Total MultiTickets 1_03` | INTEGER | yes |
| 46 | `Total MultiTickets 1_04` | INTEGER | yes |
| 47 | `Total MultiTickets 2_01` | INTEGER | yes |
| 48 | `Total MultiTickets 2_02` | INTEGER | yes |
| 49 | `Total MultiTickets 2_03` | INTEGER | yes |
| 50 | `Total MultiTickets 2_04` | INTEGER | yes |
| 51 | `Total MultiTickets 3_01` | INTEGER | yes |
| 52 | `Total MultiTickets 3_02` | INTEGER | yes |
| 53 | `Total MultiTickets 3_03` | INTEGER | yes |
| 54 | `Total MultiTickets 3_04` | INTEGER | yes |
| 55 | `Total MultiTickets 4_01` | INTEGER | yes |
| 56 | `Total MultiTickets 4_02` | INTEGER | yes |
| 57 | `Total MultiTickets 4_03` | INTEGER | yes |
| 58 | `Total MultiTickets 4_04` | INTEGER | yes |
| 59 | `Total SKUS 1_01` | INTEGER | yes |
| 60 | `Total SKUS 1_02` | INTEGER | yes |
| 61 | `Total SKUS 1_03` | INTEGER | yes |
| 62 | `Total SKUS 1_04` | INTEGER | yes |
| 63 | `Total SKUS 2_01` | INTEGER | yes |
| 64 | `Total SKUS 2_02` | INTEGER | yes |
| 65 | `Total SKUS 2_03` | INTEGER | yes |
| 66 | `Total SKUS 2_04` | INTEGER | yes |
| 67 | `Total SKUS 3_01` | INTEGER | yes |
| 68 | `Total SKUS 3_02` | INTEGER | yes |
| 69 | `Total SKUS 3_03` | INTEGER | yes |
| 70 | `Total SKUS 3_04` | INTEGER | yes |
| 71 | `Total SKUS 4_01` | INTEGER | yes |
| 72 | `Total SKUS 4_02` | INTEGER | yes |
| 73 | `Total SKUS 4_03` | INTEGER | yes |
| 74 | `Total SKUS 4_04` | INTEGER | yes |
| 75 | `TotalMultiSales1_01` | CURRENCY | yes |
| 76 | `TotalMultiSales1_02` | CURRENCY | yes |
| 77 | `TotalMultiSales1_03` | CURRENCY | yes |
| 78 | `TotalMultiSales1_04` | CURRENCY | yes |
| 79 | `TotalMultiSales2_01` | CURRENCY | yes |
| 80 | `TotalMultiSales2_02` | CURRENCY | yes |
| 81 | `TotalMultiSales2_03` | CURRENCY | yes |
| 82 | `TotalMultiSales2_04` | CURRENCY | yes |
| 83 | `TotalMultiSales3_01` | CURRENCY | yes |
| 84 | `TotalMultiSales3_02` | CURRENCY | yes |
| 85 | `TotalMultiSales3_03` | CURRENCY | yes |
| 86 | `TotalMultiSales3_04` | CURRENCY | yes |
| 87 | `TotalMultiSales4_01` | CURRENCY | yes |
| 88 | `TotalMultiSales4_02` | CURRENCY | yes |
| 89 | `TotalMultiSales4_03` | CURRENCY | yes |
| 90 | `TotalMultiSales4_04` | CURRENCY | yes |
| 91 | `TotalAccSales1_01` | CURRENCY | yes |
| 92 | `TotalAccSales1_02` | CURRENCY | yes |
| 93 | `TotalAccSales1_03` | CURRENCY | yes |
| 94 | `TotalAccSales1_04` | CURRENCY | yes |
| 95 | `TotalAccSales2_01` | CURRENCY | yes |
| 96 | `TotalAccSales2_02` | CURRENCY | yes |
| 97 | `TotalAccSales2_03` | CURRENCY | yes |
| 98 | `TotalAccSales2_04` | CURRENCY | yes |
| 99 | `TotalAccSales3_01` | CURRENCY | yes |
| 100 | `TotalAccSales3_02` | CURRENCY | yes |
| 101 | `TotalAccSales3_03` | CURRENCY | yes |
| 102 | `TotalAccSales3_04` | CURRENCY | yes |
| 103 | `TotalAccSales4_01` | CURRENCY | yes |
| 104 | `TotalAccSales4_02` | CURRENCY | yes |
| 105 | `TotalAccSales4_03` | CURRENCY | yes |
| 106 | `TotalAccSales4_04` | CURRENCY | yes |
| 107 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Code` | RMLE |
| `Store` | 12 |
| `Sales_01` | 145318.78 |
| `Sales_02` | 145318.78 |
| `Sales_03` | 304594.19 |
| `Sales_04` | 304594.19 |
| `Profit_01` | 82684.67 |
| `Profit_02` | 82684.67 |
| `Profit_03` | 146668.15 |
| `Profit_04` | 146668.15 |
| `Comm_01` | 0 |
| `Comm_02` | 0 |
| `Comm_03` | 0 |
| `Comm_04` | 0 |
| `Perks_01` | 0 |
| `Perks_02` | 0 |
| `Perks_03` | 0 |
| `Perks_04` | 0 |
| `Hours_01` | 0 |
| `Hours_02` | 0 |
| `Hours_03` | 0 |
| `Hours_04` | 0 |
| `NonSalesHours_01` | 0 |
| `NonSalesHours_02` | 0 |
| `NonSalesHours_03` | 0 |
| `NonSalesHours_04` | 0 |
| `Total Tickets 1_01` | 249 |
| `Total Tickets 1_02` | 249 |
| `Total Tickets 1_03` | 524 |
| `Total Tickets 1_04` | 524 |
| `Total Tickets 2_01` | 0 |
| `Total Tickets 2_02` | 0 |
| `Total Tickets 2_03` | 0 |
| `Total Tickets 2_04` | 0 |
| `Total Tickets 3_01` | 0 |
| `Total Tickets 3_02` | 0 |
| `Total Tickets 3_03` | 0 |
| `Total Tickets 3_04` | 0 |
| `Total Tickets 4_01` | 0 |
| `Total Tickets 4_02` | 0 |
| `Total Tickets 4_03` | 0 |
| `Total Tickets 4_04` | 0 |
| `Total MultiTickets 1_01` | 233 |
| `Total MultiTickets 1_02` | 233 |
| `Total MultiTickets 1_03` | 490 |
| `Total MultiTickets 1_04` | 490 |
| `Total MultiTickets 2_01` | 0 |
| `Total MultiTickets 2_02` | 0 |
| `Total MultiTickets 2_03` | 0 |
| `Total MultiTickets 2_04` | 0 |
| `Total MultiTickets 3_01` | 0 |
| `Total MultiTickets 3_02` | 0 |
| `Total MultiTickets 3_03` | 0 |
| `Total MultiTickets 3_04` | 0 |
| `Total MultiTickets 4_01` | 0 |
| `Total MultiTickets 4_02` | 0 |
| `Total MultiTickets 4_03` | 0 |
| `Total MultiTickets 4_04` | 0 |
| `Total SKUS 1_01` | 699 |
| `Total SKUS 1_02` | 699 |
| `Total SKUS 1_03` | 1529 |
| `Total SKUS 1_04` | 1529 |
| `Total SKUS 2_01` | 0 |
| `Total SKUS 2_02` | 0 |
| `Total SKUS 2_03` | 0 |
| `Total SKUS 2_04` | 0 |
| `Total SKUS 3_01` | 0 |
| `Total SKUS 3_02` | 0 |
| `Total SKUS 3_03` | 0 |
| `Total SKUS 3_04` | 0 |
| `Total SKUS 4_01` | 0 |
| `Total SKUS 4_02` | 0 |
| `Total SKUS 4_03` | 0 |
| `Total SKUS 4_04` | 0 |
| `TotalMultiSales1_01` | 139377.01 |
| `TotalMultiSales1_02` | 139377.01 |
| `TotalMultiSales1_03` | 294822.13 |
| `TotalMultiSales1_04` | 294822.13 |
| `TotalMultiSales2_01` | 0 |
| `TotalMultiSales2_02` | 0 |
| `TotalMultiSales2_03` | 0 |
| `TotalMultiSales2_04` | 0 |
| `TotalMultiSales3_01` | 0 |
| `TotalMultiSales3_02` | 0 |
| `TotalMultiSales3_03` | 0 |
| `TotalMultiSales3_04` | 0 |
| `TotalMultiSales4_01` | 0 |
| `TotalMultiSales4_02` | 0 |
| `TotalMultiSales4_03` | 0 |
| `TotalMultiSales4_04` | 0 |
| `TotalAccSales1_01` | 0 |
| `TotalAccSales1_02` | 0 |
| `TotalAccSales1_03` | 0 |
| `TotalAccSales1_04` | 0 |
| `TotalAccSales2_01` | 0 |
| `TotalAccSales2_02` | 0 |
| `TotalAccSales2_03` | 0 |
| `TotalAccSales2_04` | 0 |
| `TotalAccSales3_01` | 0 |
| `TotalAccSales3_02` | 0 |
| `TotalAccSales3_03` | 0 |
| `TotalAccSales3_04` | 0 |
| `TotalAccSales4_01` | 0 |
| `TotalAccSales4_02` | 0 |
| `TotalAccSales4_03` | 0 |
| `TotalAccSales4_04` | 0 |
| `DateLastChanged` | /Date(1772346624000)/ |

</details>

## RITAX.MDB
_Sales tax rates (sales-reporting)_

**Tables (1):** `Tax OverRide`

### `Tax OverRide`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Store` | SMALLINT | yes |
| 2 | `Category` | SMALLINT | yes |
| 3 | `TaxAmt_01` | REAL | yes |
| 4 | `TaxAmt_02` | REAL | yes |
| 5 | `TaxAmt_03` | REAL | yes |
| 6 | `TaxThreshold_01` | CURRENCY | yes |
| 7 | `TaxThreshold_02` | CURRENCY | yes |
| 8 | `TaxThreshold_03` | CURRENCY | yes |
| 9 | `TaxPriceDiff_01` | BOOLEAN | no |
| 10 | `TaxPriceDiff_02` | BOOLEAN | no |
| 11 | `TaxPriceDiff_03` | BOOLEAN | no |
| 12 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Store` | 1 |
| `Category` | 87 |
| `TaxAmt_01` | 0 |
| `TaxAmt_02` | 0 |
| `TaxAmt_03` | 0 |
| `TaxThreshold_01` | 0 |
| `TaxThreshold_02` | 0 |
| `TaxThreshold_03` | 0 |
| `TaxPriceDiff_01` | false |
| `TaxPriceDiff_02` | false |
| `TaxPriceDiff_03` | false |
| `DateLastChanged` | /Date(1596935253000)/ |

</details>

## RIMAIL.MDB
_Customer / mail list (sales-reporting + crm)_

**Tables (2):** `MailListFamily`, `MailListNames`

### `MailListFamily`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Account` | WCHAR | yes |
| 2 | `Code` | WCHAR | yes |
| 3 | `Name` | WCHAR | yes |
| 4 | `Gender` | WCHAR | yes |
| 5 | `DateAdded` | DATE | yes |
| 6 | `Birthday` | DATE | yes |
| 7 | `Extra_01` | WCHAR | yes |
| 8 | `Extra_02` | WCHAR | yes |
| 9 | `Extra_03` | WCHAR | yes |
| 10 | `Extra_04` | WCHAR | yes |
| 11 | `Extra_05` | WCHAR | yes |
| 12 | `Extra_06` | WCHAR | yes |
| 13 | `Status` | WCHAR | yes |
| 14 | `Comment` | WCHAR | yes |
| 15 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Account` | 020703194700630 |
| `Code` | CA |
| `Name` | CARLOS GARNER |
| `Gender` | M |
| `DateAdded` | /Date(1122703200000)/ |
| `Birthday` |  |
| `Extra_01` |   |
| `Extra_02` |   |
| `Extra_03` | M |
| `Extra_04` |  |
| `Extra_05` |  |
| `Extra_06` |  |
| `Status` |   |
| `Comment` | EDAD 20 |
| `DateLastChanged` | /Date(1122743775000)/ |

</details>

### `MailListNames`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `Account` | WCHAR | yes |
| 2 | `Name` | WCHAR | yes |
| 3 | `Addr1` | WCHAR | yes |
| 4 | `Addr2` | WCHAR | yes |
| 5 | `City` | WCHAR | yes |
| 6 | `State` | WCHAR | yes |
| 7 | `Zip` | WCHAR | yes |
| 8 | `CreditLimit` | CURRENCY | yes |
| 9 | `CurrBal` | CURRENCY | yes |
| 10 | `CredSlip` | CURRENCY | yes |
| 11 | `Status` | WCHAR | yes |
| 12 | `DateAdded` | DATE | yes |
| 13 | `DateLstPurch` | DATE | yes |
| 14 | `PlanNum` | SMALLINT | yes |
| 15 | `PlanCount` | SMALLINT | yes |
| 16 | `PlanDollars` | CURRENCY | yes |
| 17 | `PlanLastCred` | DATE | yes |
| 18 | `PlanCredBal` | CURRENCY | yes |
| 19 | `NonTaxable` | BOOLEAN | no |
| 20 | `EMail` | WCHAR | yes |
| 21 | `Extra_01` | WCHAR | yes |
| 22 | `Extra_02` | WCHAR | yes |
| 23 | `Extra_03` | WCHAR | yes |
| 24 | `Extra_04` | WCHAR | yes |
| 25 | `Extra_05` | WCHAR | yes |
| 26 | `Extra_06` | WCHAR | yes |
| 27 | `QtySales_01` | INTEGER | yes |
| 28 | `QtySales_02` | INTEGER | yes |
| 29 | `QtySales_03` | INTEGER | yes |
| 30 | `QtySales_04` | INTEGER | yes |
| 31 | `DollarSales_01` | CURRENCY | yes |
| 32 | `DollarSales_02` | CURRENCY | yes |
| 33 | `DollarSales_03` | CURRENCY | yes |
| 34 | `DollarSales_04` | CURRENCY | yes |
| 35 | `County` | WCHAR | yes |
| 36 | `Comment` | WCHAR | yes |
| 37 | `ChangeTo` | WCHAR | yes |
| 38 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `Account` |  |
| `Name` | Mendoza,Johanna |
| `Addr1` |  |
| `Addr2` |  |
| `City` | TEGUCIGALPA MDC |
| `State` | FM |
| `Zip` | 504 |
| `CreditLimit` | 0 |
| `CurrBal` | 0 |
| `CredSlip` | 0 |
| `Status` |   |
| `DateAdded` | /Date(1658988000000)/ |
| `DateLstPurch` |  |
| `PlanNum` | 1 |
| `PlanCount` | 0 |
| `PlanDollars` | 0 |
| `PlanLastCred` |  |
| `PlanCredBal` | 0 |
| `NonTaxable` | false |
| `EMail` |  |
| `Extra_01` |  |
| `Extra_02` |  |
| `Extra_03` |  |
| `Extra_04` |  |
| `Extra_05` |  |
| `Extra_06` |  |
| `QtySales_01` | 0 |
| `QtySales_02` | 0 |
| `QtySales_03` | 0 |
| `QtySales_04` | 0 |
| `DollarSales_01` | 0 |
| `DollarSales_02` | 0 |
| `DollarSales_03` | 0 |
| `DollarSales_04` | 0 |
| `County` |  |
| `Comment` |  |
| `ChangeTo` |   |
| `DateLastChanged` | /Date(1659068597000)/ |

</details>

## RIARACCT.MDB
_A/R accounts / house charges (sales-reporting)_

> ❌ Table enumeration failed: Excepci�n al llamar a "Open" con los argumentos "0": "No se puede abrir una base de datos creada con una versi�n 
anterior de la aplicaci�n."
En l�nea: 7 Car�cter: 1
+ $conn.Open()
+ ~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : OleDbException

## RIGIFTCT.MDB
_Gift certificates (sales-reporting)_

**Tables (2):** `GiftCRedeem`, `GiftCSold`

### `GiftCRedeem`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `GiftCert` | WCHAR | yes |
| 2 | `Sequence` | SMALLINT | yes |
| 3 | `Line` | INTEGER | yes |
| 4 | `Store` | SMALLINT | yes |
| 5 | `Ticket` | INTEGER | yes |
| 6 | `Date` | DATE | yes |
| 7 | `Account` | WCHAR | yes |
| 8 | `Redeemed` | CURRENCY | yes |
| 9 | `DateLastChanged` | DATE | yes |

### `GiftCSold`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `GiftCert` | WCHAR | yes |
| 2 | `Sequence` | SMALLINT | yes |
| 3 | `Store` | SMALLINT | yes |
| 4 | `Ticket` | INTEGER | yes |
| 5 | `Date` | DATE | yes |
| 6 | `Account` | WCHAR | yes |
| 7 | `ForAccount` | WCHAR | yes |
| 8 | `Purchased` | CURRENCY | yes |
| 9 | `Redeemeed` | CURRENCY | yes |
| 10 | `DateLastChanged` | DATE | yes |

## RIPODET.MDB
_Purchase order detail — on-order for Stock Status_

**Tables (3):** `AsnCartonDet`, `AsnCartonHead`, `Purchase Detail`

### `AsnCartonDet`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `CartonNo` | WCHAR | yes |
| 2 | `PONumber` | WCHAR | yes |
| 3 | `UPC` | WCHAR | yes |
| 4 | `Qty` | SMALLINT | yes |
| 5 | `DateLastChanged` | DATE | yes |

### `AsnCartonHead`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `CartonNo` | WCHAR | yes |
| 2 | `PONumber` | WCHAR | yes |
| 3 | `DateReceived` | DATE | yes |
| 4 | `Status` | WCHAR | yes |
| 5 | `DateLastChanged` | DATE | yes |

### `Purchase Detail`

| # | column | type | nullable |
|---|--------|------|----------|
| 1 | `PO Number` | WCHAR | yes |
| 2 | `SKU` | WCHAR | yes |
| 3 | `Row` | WCHAR | yes |
| 4 | `Segment` | SMALLINT | yes |
| 5 | `Ordered_01` | SMALLINT | yes |
| 6 | `Ordered_02` | SMALLINT | yes |
| 7 | `Ordered_03` | SMALLINT | yes |
| 8 | `Ordered_04` | SMALLINT | yes |
| 9 | `Ordered_05` | SMALLINT | yes |
| 10 | `Ordered_06` | SMALLINT | yes |
| 11 | `Ordered_07` | SMALLINT | yes |
| 12 | `Ordered_08` | SMALLINT | yes |
| 13 | `Ordered_09` | SMALLINT | yes |
| 14 | `Ordered_10` | SMALLINT | yes |
| 15 | `Ordered_11` | SMALLINT | yes |
| 16 | `Ordered_12` | SMALLINT | yes |
| 17 | `Ordered_13` | SMALLINT | yes |
| 18 | `Ordered_14` | SMALLINT | yes |
| 19 | `Ordered_15` | SMALLINT | yes |
| 20 | `Ordered_16` | SMALLINT | yes |
| 21 | `Ordered_17` | SMALLINT | yes |
| 22 | `Ordered_18` | SMALLINT | yes |
| 23 | `Received_01` | SMALLINT | yes |
| 24 | `Received_02` | SMALLINT | yes |
| 25 | `Received_03` | SMALLINT | yes |
| 26 | `Received_04` | SMALLINT | yes |
| 27 | `Received_05` | SMALLINT | yes |
| 28 | `Received_06` | SMALLINT | yes |
| 29 | `Received_07` | SMALLINT | yes |
| 30 | `Received_08` | SMALLINT | yes |
| 31 | `Received_09` | SMALLINT | yes |
| 32 | `Received_10` | SMALLINT | yes |
| 33 | `Received_11` | SMALLINT | yes |
| 34 | `Received_12` | SMALLINT | yes |
| 35 | `Received_13` | SMALLINT | yes |
| 36 | `Received_14` | SMALLINT | yes |
| 37 | `Received_15` | SMALLINT | yes |
| 38 | `Received_16` | SMALLINT | yes |
| 39 | `Received_17` | SMALLINT | yes |
| 40 | `Received_18` | SMALLINT | yes |
| 41 | `Cost` | CURRENCY | yes |
| 42 | `Vendor` | WCHAR | yes |
| 43 | `Case Pack` | WCHAR | yes |
| 44 | `Case Multiplier` | SMALLINT | yes |
| 45 | `DateLastChanged` | DATE | yes |

<details><summary>sample row</summary>

| column | value |
|--------|-------|
| `PO Number` | 00000189 |
| `SKU` | CMTKD01AGY |
| `Row` |     |
| `Segment` | 1 |
| `Ordered_01` | 0 |
| `Ordered_02` | 20 |
| `Ordered_03` | 40 |
| `Ordered_04` | 39 |
| `Ordered_05` | 20 |
| `Ordered_06` | 10 |
| `Ordered_07` | 0 |
| `Ordered_08` | 0 |
| `Ordered_09` | 0 |
| `Ordered_10` | 0 |
| `Ordered_11` | 0 |
| `Ordered_12` | 0 |
| `Ordered_13` | 0 |
| `Ordered_14` | 0 |
| `Ordered_15` | 0 |
| `Ordered_16` | 0 |
| `Ordered_17` | 0 |
| `Ordered_18` | 0 |
| `Received_01` | 0 |
| `Received_02` | 20 |
| `Received_03` | 40 |
| `Received_04` | 39 |
| `Received_05` | 20 |
| `Received_06` | 10 |
| `Received_07` | 0 |
| `Received_08` | 0 |
| `Received_09` | 0 |
| `Received_10` | 0 |
| `Received_11` | 0 |
| `Received_12` | 0 |
| `Received_13` | 0 |
| `Received_14` | 0 |
| `Received_15` | 0 |
| `Received_16` | 0 |
| `Received_17` | 0 |
| `Received_18` | 0 |
| `Cost` | 31.35 |
| `Vendor` | HKAI |
| `Case Pack` |  |
| `Case Multiplier` | 0 |
| `DateLastChanged` | /Date(1549983720000)/ |

</details>

---

## Mappings (hand-maintained)

Record here which RICS column feeds which storefront field, along with any transformation.

### `ProductCard` (listing)
- _TBD — fill in after first run of this discovery script._

### `ProductDetail`
- _TBD_

### `Facets`
- _TBD_

### Sales Reporting

Column names pinned from the discovery run above, consumed by `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts`.

**Ticket join key** — 6-column composite, identical on `TicketHeader` and `TicketDetail`: `(UserID, BatchDate, Terminal, Store, Ticket, RealDate)`. `TicketTender` uses the same key.

**TicketHeader filters** (all reports):
- `TransType` — `1` = normal sale (filter on this).
- `Voided` — BOOLEAN, exclude `true`.
- `Posted` — WCHAR (`'Y'` / `'N'`); only filtered on for the legacy Sales-by-Day contract. Other reports default to Live mode (no Posted filter).

**TicketDetail columns used**:
- `SKU` (WCHAR) — joins to RIINVMAS.
- `Column`, `Row` (WCHAR) — size-grid coordinates; the "shoe" SizeType example: Column='090' (width), Row='M' (size code). Used as-is in reports; RISIZE join only required when rendering the grid header.
- `Qty` (SMALLINT, note: `Qty` not `Quantity`).
- `Price`, `RealPrice`, `Extension` (CURRENCY).
- `Perks` (CURRENCY) — salesperson perks/spiff paid.
- `Category` (SMALLINT), `Vendor` (WCHAR) — denormalized from RIINVMAS onto the line; reports can group without joining.
- `Cost` (CURRENCY) — line COGS; denormalized.
- `SalesPerson` (WCHAR) — lives on **TicketDetail**, not TicketHeader. Joins to `RISLSPSN.Salespeople.Code`.
- `ReturnCode` (SMALLINT) — nonzero means the line is a return (driven by return reasons setup).
- `DiscPct`, `DiscAmt` (CURRENCY) — line discount.
- `Prices_01..04` (CURRENCY) — the 4-slot price master at sale time (List / Retail / MD1 / MD2). For markdown derivation: Markdown ≈ `(Prices_02 - RealPrice) * Qty` when pricing slot is Retail; confirm per-line with samples.
- `Tax_01..03` / `TaxAmt_01..03` — per-tax-bucket flags + amounts; consumed by Sales Tax Recap (deferred past Phase 1+2).

**TicketHeader columns used**:
- `Cashier` (WCHAR) — distinct from SalesPerson (which is per line). Joins to `RISLSPSN.Salespeople.Code`.
- `MarketingCode` (WCHAR) — promotion-code-analysis key.
- `Account` (WCHAR) — AR customer account for house charges.

**StoreMaster (RISTORE.MDB)**:
- `Number` (SMALLINT) PK, `Desc` (WCHAR) name.
- `Tender_01..12` — tender type labels per store (e.g. `'Efectivo L'`, `'House Charge'`, `'Gift Cert.'`). Tender type dimension is NOT a separate table — pivot off this when consuming `TicketTender.Tender` (SMALLINT 1..12).
- `State` — used by Sales Tax Recap state rollup.

**Salespeople (RISLSPSN.MDB)**:
- Table name: `Salespeople` (plural).
- `Code` (WCHAR) PK — matches `TicketDetail.SalesPerson` and `TicketHeader.Cashier`.
- `Name` (WCHAR) — display.
- `Commission` (REAL), `Comm Method` (WCHAR).

**Purchase Detail (RIPODET.MDB → `Purchase Detail`)** — used by Stock Status On-Order:
- `PO Number`, `SKU`, `Row`, `Segment`.
- `Ordered_01..18`, `Received_01..18` (SMALLINT per column in size grid). Open qty = `Ordered_NN - Received_NN`.
- **No `Store` column** on Purchase Detail — to scope on-order by store, join via `RIPOMAS` (not yet enumerated; defer until Stock Status implementation needs per-store split).
- **No expected-ship date** on Purchase Detail — At-Once vs. Future classification requires `RIPOMAS` header date. For v1, report total open on-order without the A/O split.

**TicketTender (RITRNSSV.TicketTender)** — deferred past Phase 1+2:
- Same 6-col composite key + `Tender` (SMALLINT 1..12), `Amount`, `AltAmount`.
- Used by Sales Tax Recap and any tender-breakdown report.

**Known gaps (reports that need columns not on the ticket)**:
- Markdown amounts: no explicit column on TicketDetail — derive as `(Prices_02 - RealPrice) * Qty`, OR use `OvsAmt` / `ThisOvsAmt` (unclear semantics; verify with fixture data in Phase 2).
- First/Last-received dates (Stock Status aging): must come from `RIINVQUA` or `RIINVHIS` — not on the ticket.
- On-hand for Stock Status: sourced from `RIINVQUA.InventoryQuantity` (see earlier section).
