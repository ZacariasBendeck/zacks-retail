import { prisma } from '../../../src/db/prisma';
import {
  importCustomerCsv,
  importCustomerCsvFiles,
} from '../../../src/services/customers/customerImportService';
import {
  deriveHonduranIdCandidate,
  normalizeEmail,
} from '../../../src/services/customers/customerImportCsv';

async function cleanupCustomerImportTables(): Promise<void> {
  await prisma.customerImportReject.deleteMany({});
  await prisma.customerIntelligenceCustomer.deleteMany({});
  await prisma.customerImportBatch.deleteMany({});
}

beforeEach(async () => {
  await cleanupCustomerImportTables();
});

afterAll(async () => {
  await cleanupCustomerImportTables();
  await prisma.$disconnect();
});

describe('customer import CSV helpers', () => {
  it('normalizes Honduran IDs by stripping punctuation and keeping digits', () => {
    const candidate = deriveHonduranIdCandidate('0801-1990-12345', null);
    expect(candidate.conflict).toBe(false);
    expect(candidate.raw).toBe('0801-1990-12345');
    expect(candidate.normalized).toBe('0801199012345');
  });

  it('normalizes email addresses to trimmed lowercase', () => {
    expect(normalizeEmail('  CUSTOMER@Example.COM  ')).toBe('customer@example.com');
  });
});

describe('importCustomerCsv', () => {
  it('imports joined Customer.csv and MailListNames.csv rows into app-owned customer tables', async () => {
    const summary = await importCustomerCsv({
      customerCsvText: [
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
        '0801-1990-12345,CUST001,"Lopez, Maria",F,04/01/2026,02/03/1990,CX1,CX2,,,,,ACTIVE,Preferred customer,04/15/2026',
      ].join('\n'),
      mailListNamesCsvText: [
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
        '0801-1990-12345,"Lopez, Maria",Barrio Centro,Apt 2,Tegucigalpa,FM,11101,1250.50,200.25,10.00,ACTIVE,04/01/2026,04/20/2026,1,2,300.00,04/10/2026,50.00,Yes,maria@example.com,MX1,MX2,,,,,1,2,3,4,100.00,200.00,300.00,400.00,Francisco Morazan,Mail comment,NEWCODE,04/18/2026',
      ].join('\n'),
      customerFileName: 'Customer.csv',
      mailListNamesFileName: 'MailListNames.csv',
      source: 'rics_csv_test',
    });

    expect(summary.totalRows).toBe(1);
    expect(summary.createdCount).toBe(1);
    expect(summary.updatedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);

    const customer = await prisma.customerIntelligenceCustomer.findFirstOrThrow({
      where: { source: 'rics_csv_test' },
      include: {
        identities: true,
        contacts: true,
        addresses: true,
        legacyProfile: true,
        financialProfile: true,
        salesSummaryLegacy: true,
      },
    });

    expect(customer.honduranIdNormalized).toBe('0801199012345');
    expect(customer.ricsAccount).toBe('0801-1990-12345');
    expect(customer.ricsCode).toBe('CUST001');
    expect(customer.fullName).toBe('Lopez, Maria');
    expect(customer.status).toBe('active');
    expect(customer.identities.map((row) => row.identityType).sort()).toEqual([
      'email',
      'honduran_id',
      'rics_account',
      'rics_code',
    ]);
    expect(customer.contacts).toHaveLength(1);
    expect(customer.contacts[0].normalizedValue).toBe('maria@example.com');
    expect(customer.addresses).toHaveLength(1);
    expect(customer.addresses[0].country).toBe('HN');
    expect(customer.legacyProfile?.customerExtra01).toBe('CX1');
    expect(customer.legacyProfile?.mailExtra01).toBe('MX1');
    expect(customer.financialProfile?.creditLimit?.toString()).toBe('1250.5');
    expect(customer.financialProfile?.nonTaxable).toBe(true);
    expect(customer.salesSummaryLegacy?.qtySales04).toBe(4);
    expect(customer.salesSummaryLegacy?.dollarSales04?.toString()).toBe('400');
  });

  it('matches an existing imported customer by normalized email and updates instead of duplicating', async () => {
    const first = await importCustomerCsv({
      customerCsvText: [
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
        'ACC-001,CODE-001,"Martinez, Ana",F,04/01/2026,02/03/1990,,,,,,,ACTIVE,,04/15/2026',
      ].join('\n'),
      mailListNamesCsvText: [
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
        'ACC-001,"Martinez, Ana",Old Address,,San Pedro Sula,CR,21101,,,,ACTIVE,04/01/2026,,,,,,,,shared@example.com,,,,,,,,,,,,,,,Cortes,, ,04/18/2026',
      ].join('\n'),
      source: 'rics_csv_test',
    });

    expect(first.createdCount).toBe(1);

    const second = await importCustomerCsv({
      customerCsvText:
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
      mailListNamesCsvText: [
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
        ',"Martinez, Ana",New Address,,San Pedro Sula,CR,21101,,,,ACTIVE,04/01/2026,,,,,,,,shared@example.com,,,,,,,,,,,,,,,Cortes,, ,04/20/2026',
      ].join('\n'),
      source: 'rics_csv_test',
    });

    expect(second.createdCount).toBe(0);
    expect(second.updatedCount).toBe(1);
    expect(second.rejectedCount).toBe(0);

    const customers = await prisma.customerIntelligenceCustomer.findMany({
      where: { source: 'rics_csv_test' },
      include: { addresses: true },
    });
    expect(customers).toHaveLength(1);
    expect(customers[0].addresses[0]?.addr1).toBe('New Address');
  });

  it('rejects rows with no usable identifier', async () => {
    const summary = await importCustomerCsv({
      customerCsvText: [
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
        ',,"Name Only",,,,,,,,,,,ACTIVE,,',
      ].join('\n'),
      mailListNamesCsvText:
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
      source: 'rics_csv_test',
    });

    expect(summary.createdCount).toBe(0);
    expect(summary.rejectedCount).toBe(1);

    const reject = await prisma.customerImportReject.findFirstOrThrow();
    expect(reject.rejectReason).toBe('missing_identifier');
    expect(reject.name).toBe('Name Only');
  });

  it('rejects an unsafe match when the same email points at a different Honduran ID', async () => {
    await importCustomerCsv({
      customerCsvText: [
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
        '0801-1990-12345,CODE-A,"Rivera, Lucia",F,04/01/2026,02/03/1990,,,,,,,ACTIVE,,04/15/2026',
      ].join('\n'),
      mailListNamesCsvText: [
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
        '0801-1990-12345,"Rivera, Lucia",Addr,,City,FM,11101,,,,ACTIVE,04/01/2026,,,,,,,,shared@example.com,,,,,,,,,,,,,,,County,, ,04/18/2026',
      ].join('\n'),
      source: 'rics_csv_test',
    });

    const summary = await importCustomerCsv({
      customerCsvText: [
        'Account,Code,Name,Gender,DateAdded,Birthday,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,Status,Comment,DateLastChanged',
        '0801-1990-99999,CODE-B,"Rivera, Lucia",F,04/01/2026,02/03/1990,,,,,,,ACTIVE,,04/15/2026',
      ].join('\n'),
      mailListNamesCsvText: [
        'Account,Name,Addr1,Addr2,City,State,Zip,CreditLimit,CurrBal,CredSlip,Status,DateAdded,DateLstPurch,PlanNum,PlanCount,PlanDollars,PlanLastCred,PlanCredBal,NonTaxable,EMail,Extra_01,Extra_02,Extra_03,Extra_04,Extra_05,Extra_06,QtySales_01,QtySales_02,QtySales_03,QtySales_04,DollarSales_01,DollarSales_02,DollarSales_03,DollarSales_04,County,Comment,ChangeTo,DateLastChanged',
        '0801-1990-99999,"Rivera, Lucia",Addr,,City,FM,11101,,,,ACTIVE,04/01/2026,,,,,,,,shared@example.com,,,,,,,,,,,,,,,County,, ,04/18/2026',
      ].join('\n'),
      source: 'rics_csv_test',
    });

    expect(summary.createdCount).toBe(0);
    expect(summary.rejectedCount).toBe(1);

    const rejects = await prisma.customerImportReject.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(rejects.at(-1)?.rejectReason).toBe('conflicting_honduran_id');
  });
});
