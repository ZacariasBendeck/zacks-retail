import {
  parseSkuSuffix,
  resolveColorCode,
  resolveMaterialCode,
} from '../scripts/catalog/assign-sku-suffix-attributes';

describe('SKU suffix attribute assignment parsing', () => {
  it('parses a standard color/material suffix', () => {
    const parsed = parseSkuSuffix('LA87-BEPU');

    expect(parsed).toEqual({
      suffix: 'BEPU',
      parseable: true,
      colorRawCode: 'BE',
      materialRawCode: 'PU',
    });
    expect(resolveColorCode(parsed.colorRawCode)).toMatchObject({
      rawCode: 'BE',
      canonicalCode: 'BE',
      valueCode: '3',
      labelEs: 'Beige',
    });
    expect(resolveMaterialCode(parsed.materialRawCode)).toMatchObject({
      rawCode: 'PU',
      canonicalCode: 'PU',
      valueCode: 'pu',
      labelEs: 'PU (Polyuretano)',
    });
  });

  it('maps material aliases to canonical upper-material values', () => {
    expect(resolveMaterialCode(parseSkuSuffix('BKSP').materialRawCode)).toMatchObject({
      rawCode: 'SP',
      canonicalCode: 'SP',
      valueCode: 'sp',
      labelEs: 'Special Material',
      isAlias: false,
    });
    expect(resolveMaterialCode(parseSkuSuffix('BKNB').materialRawCode)).toMatchObject({
      rawCode: 'NB',
      canonicalCode: 'NU',
      valueCode: 'nu',
      isAlias: true,
    });
    expect(resolveMaterialCode(parseSkuSuffix('BKSD').materialRawCode)).toMatchObject({
      rawCode: 'SD',
      canonicalCode: 'SU',
      valueCode: 'su',
      isAlias: true,
    });
    expect(resolveMaterialCode(parseSkuSuffix('GDMT').materialRawCode)).toMatchObject({
      rawCode: 'MT',
      canonicalCode: 'ME',
      valueCode: 'me',
      isAlias: true,
    });
  });

  it('maps selected observed color aliases', () => {
    const parsed = parseSkuSuffix('RGGL');

    expect(resolveColorCode(parsed.colorRawCode)).toMatchObject({
      rawCode: 'RG',
      canonicalCode: 'RG',
      valueCode: '17',
      labelEs: 'Rose Gold',
      isAlias: false,
    });
    expect(resolveMaterialCode(parsed.materialRawCode)).toMatchObject({
      rawCode: 'GL',
      canonicalCode: 'GL',
      valueCode: 'gl',
    });
    expect(resolveColorCode('TA')).toBeNull();
  });

  it('rejects nonstandard suffixes', () => {
    expect(parseSkuSuffix('A-BK')).toEqual({
      suffix: 'A-BK',
      parseable: false,
      colorRawCode: null,
      materialRawCode: null,
    });
  });
});
