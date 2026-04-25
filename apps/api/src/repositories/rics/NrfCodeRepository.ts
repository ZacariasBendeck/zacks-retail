/**
 * NRF code repository.
 *
 * RICS pp. 148–152 — NRF (NRMA) codes are per-(SizeType, Row, Column) 5-digit
 * industry codes used for UPC cross-reference, EDI, and Direct Sale. They
 * lived in RISIZE.MDB / NRMACodes as a wide-column table. On this customer's
 * install the table was empty and the feature was never used.
 *
 * Phase-A decision (2026-04-25): NRF codes are not being ported to Postgres.
 * The lookup stays in the API surface so the taxonomy routes keep their
 * contract, but every call returns an empty list. When a vendor ships an
 * NRF-coded UPC feed in the future the right move is a new `app.nrf_code`
 * table sized for the real data, not a replica of the 18-per-segment codec.
 */

import { Ok, type Result } from './repoResult';

export interface NrfCodeCell {
  sizeTypeCode: number;
  rowLabel: number;
  /** 1-based column position within the size type. */
  columnPosition: number;
  /** The 5-digit NRF code. */
  nrfCode: number;
}

export interface NrfLookupParams {
  sizeTypeCode: number;
  rowLabel?: number;
  columnPosition?: number;
}

export const NrfCodeRepository = {
  async listForSizeType(_sizeTypeCode: number): Promise<Result<NrfCodeCell[]>> {
    return Ok([]);
  },

  async lookup(_params: NrfLookupParams): Promise<Result<NrfCodeCell[]>> {
    return Ok([]);
  },
};
