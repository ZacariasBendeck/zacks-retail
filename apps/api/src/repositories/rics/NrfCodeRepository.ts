/**
 * NRF code repository — RISIZE.MDB / `NRMACodes`.
 *
 * Schema: Code SMALLINT | Row SMALLINT | Segment SMALLINT |
 *         NRMACode_01..NRMACode_18 SMALLINT | DateLastChanged DATE
 *
 * RICS pp. 148–152 — NRF (NRMA) codes are per-(SizeType, Row, Column) 5-digit
 * industry codes used for UPC cross-reference, EDI, and Direct Sale. The
 * physical shape mirrors the inventory wide-column pattern: one Access row
 * per (Code=SizeType, Row, Segment), with `NRMACode_01..18` carrying up to
 * 18 columns per segment row.
 *
 * Phase 1 scope: **READ-ONLY**. Per the Phase 1 contract, NRF writes are
 * deferred. The `NRMACodes` table is empty in this customer's data, so the
 * read surface is mostly for completeness — future Size Type editors can
 * still surface the lookup once vendors ship NRF-coded UPC imports.
 */

import { executeQuery, type AccessParam } from '../../services/accessOleDb';
import { Err, Ok, type Result } from './repoResult';
import { openRicsDb, RicsDb, toRepoError, coerceNumber } from './ricsAccess';
import { SEG, columnList, unpackRow } from '../../utils/segmentCodec';

export interface NrfCodeCell {
  sizeTypeCode: number;
  rowLabel: number;
  /** 1-based column position within the size type. */
  columnPosition: number;
  /** The 5-digit NRF code. Returned as a number because the Access column is SMALLINT. */
  nrfCode: number;
}

interface NrmaCodesRow {
  Code: number;
  Row: number;
  Segment: number;
  [cell: string]: unknown;
}

const ALL_CELLS = columnList(SEG.NRMA_CODE);

function expandSegment(row: NrmaCodesRow): NrfCodeCell[] {
  const cells = unpackRow<number | string>(row, SEG.NRMA_CODE);
  const out: NrfCodeCell[] = [];
  const segment = Number(row.Segment ?? 1);
  const basePosition = (segment - 1) * SEG.NRMA_CODE.cellsPerSegment + 1;
  cells.forEach((val, i) => {
    const num = coerceNumber(val);
    if (num == null || num === 0) return;
    out.push({
      sizeTypeCode: Number(row.Code),
      rowLabel: Number(row.Row),
      columnPosition: basePosition + i,
      nrfCode: num,
    });
  });
  return out;
}

export interface NrfLookupParams {
  sizeTypeCode: number;
  rowLabel?: number;
  columnPosition?: number;
}

export const NrfCodeRepository = {
  async listForSizeType(sizeTypeCode: number): Promise<Result<NrfCodeCell[]>> {
    try {
      const { path, password } = openRicsDb(RicsDb.NrfCodes);
      const params: AccessParam[] = [{ value: sizeTypeCode, type: 'integer' }];
      const rows = executeQuery<NrmaCodesRow>(
        path,
        password,
        `SELECT [Code], [Row], [Segment], ${ALL_CELLS.join(', ')} FROM [NRMACodes] WHERE [Code] = ? ORDER BY [Row], [Segment]`,
        params,
      );
      const out: NrfCodeCell[] = [];
      for (const r of rows) out.push(...expandSegment(r));
      return Ok(out);
    } catch (err) {
      return Err(toRepoError(err));
    }
  },

  async lookup(params: NrfLookupParams): Promise<Result<NrfCodeCell[]>> {
    const listResult = await this.listForSizeType(params.sizeTypeCode);
    if (!listResult.ok) return listResult;
    return Ok(
      listResult.value.filter((c) => {
        if (params.rowLabel != null && c.rowLabel !== params.rowLabel) return false;
        if (params.columnPosition != null && c.columnPosition !== params.columnPosition) return false;
        return true;
      }),
    );
  },
};
