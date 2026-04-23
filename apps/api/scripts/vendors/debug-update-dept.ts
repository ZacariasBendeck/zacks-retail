import { DepartmentRepository } from '../src/repositories/rics/DepartmentRepository';
process.env.RICS_DB_DIR = require('path').resolve(__dirname, '../../../.tmp/test-mdbs');

(async () => {
  await DepartmentRepository.delete(97);
  const c = await DepartmentRepository.create({ number: 97, description: 'ZTEST', begCateg: 900, endCateg: 910 });
  console.log('create:', JSON.stringify(c));
  const u = await DepartmentRepository.update(97, { description: 'ZTEST 2', endCateg: 920 });
  console.log('update:', JSON.stringify(u));
  await DepartmentRepository.delete(97);
})();
