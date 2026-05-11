import { scoreQuoteLineSimilarity } from '../src/services/supplierQuotationService';

describe('supplier quotation similarity scoring', () => {
  it('requires the same product family for quote-line auto matches', () => {
    const signals = scoreQuoteLineSimilarity(
      {
        familyCode: 'zapatos',
        categoryNumber: 10,
        supplierStyle: 'LFR-100',
        supplierColorCode: 'BLK',
        supplierColorName: 'Black',
        materialCode: 'leather',
        styleElementCode: 'loafer',
        keywords: 'dress loafer',
        season: '26',
      },
      {
        familyCode: 'tops',
        categoryNumber: 10,
        supplierStyle: 'LFR-100',
        supplierColorCode: 'BLK',
        supplierColorName: 'Black',
        materialCode: 'leather',
        styleElementCode: 'loafer',
        keywords: 'dress loafer',
        season: '26',
      },
    );

    expect(signals).toEqual([]);
  });

  it('identifies shared fashion buying signals', () => {
    const signals = scoreQuoteLineSimilarity(
      {
        familyCode: 'zapatos',
        categoryNumber: 10,
        supplierStyle: 'LFR-100',
        supplierColorCode: 'BLK',
        supplierColorName: 'Black',
        materialCode: 'leather',
        styleElementCode: 'loafer',
        keywords: 'dress loafer',
        season: '26',
      },
      {
        familyCode: 'zapatos',
        categoryNumber: 10,
        supplierStyle: 'LFR-100-B',
        supplierColorCode: 'BLK',
        supplierColorName: 'Black',
        materialCode: 'leather',
        styleElementCode: 'loafer',
        keywords: 'office loafer',
        season: '26',
      },
    );

    expect(signals).toEqual(expect.arrayContaining([
      'category',
      'vendor-style',
      'color',
      'material',
      'style-element',
      'season',
      'keywords',
    ]));
  });
});
