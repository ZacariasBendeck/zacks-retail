import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const counts = await prisma.$queryRawUnsafe<{ table_name: string; row_count: bigint }[]>(`
    SELECT 'sales_history_ticket' AS table_name, COUNT(*)::bigint AS row_count FROM app.sales_history_ticket
    UNION ALL SELECT 'sales_history_ticket_line', COUNT(*)::bigint FROM app.sales_history_ticket_line
    UNION ALL SELECT 'User (employees)', COUNT(*)::bigint FROM public."User" WHERE "isEmployee" = true
    UNION ALL SELECT 'User w/ salespersonCode', COUNT(*)::bigint FROM public."User" WHERE "salespersonCode" IS NOT NULL
  `)
  for (const c of counts) console.log(`${c.table_name}: ${c.row_count}`)

  console.log('\nsales_history_ticket columns:')
  const cols1 = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='app' AND table_name='sales_history_ticket' ORDER BY ordinal_position`,
  )
  for (const c of cols1) console.log(`  ${c.column_name}: ${c.data_type}`)

  console.log('\nsales_history_ticket_line columns:')
  const cols2 = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='app' AND table_name='sales_history_ticket_line' ORDER BY ordinal_position`,
  )
  for (const c of cols2) console.log(`  ${c.column_name}: ${c.data_type}`)

  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
