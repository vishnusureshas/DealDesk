import path from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { ApprovalConfig } from '../dealdesk/src/models/ApprovalConfig';
import { Branch } from '../dealdesk/src/models/Branch';
import { Customer } from '../dealdesk/src/models/Customer';
import { Product } from '../dealdesk/src/models/Product';
import { Role } from '../dealdesk/src/models/Role';
import { User } from '../dealdesk/src/models/User';

dotenv.config({
  path: path.resolve(__dirname, '../dealdesk/.env'),
});
dotenv.config();

const DEMO_PASSWORD = 'Password123!';
const BCRYPT_ROUNDS = 12;
const DEMO_CUSTOMER_ID = '64a1c0000000000000000001';
const DEMO_PRODUCT_ID = '64a1c0000000000000000002';

async function main(): Promise<void> {
  const { env } = await import('../dealdesk/src/config/env');
  const { connectDb, disconnectDb } = await import(
    '../dealdesk/src/config/db'
  );
  const { Types } = await import('mongoose');

  await connectDb(env.MONGO_URI);

  try {
    await mongooseDropDatabase();

    await Promise.all([
      ApprovalConfig.syncIndexes(),
      Branch.syncIndexes(),
      Customer.syncIndexes(),
      Product.syncIndexes(),
      Role.syncIndexes(),
      User.syncIndexes(),
    ]);

    const [branchA, branchB] = await Branch.create([
      { name: 'Branch A' },
      { name: 'Branch B' },
    ]);

    const [salesExec, salesManager, financeRole, adminRole] =
      await Role.create([
        {
          key: 'sales_exec',
          name: 'Sales Executive',
          permissions: [
            { key: 'deal.view', scope: 'own' },
            { key: 'deal.edit', scope: 'own' },
            { key: 'chat.send', scope: 'all' },
          ],
        },
        {
          key: 'sales_manager',
          name: 'Sales Manager',
          permissions: [
            { key: 'deal.view', scope: 'branch' },
            { key: 'deal.edit', scope: 'own' },
            { key: 'discount.approve', scope: 'branch' },
            { key: 'chat.send', scope: 'all' },
          ],
        },
        {
          key: 'finance',
          name: 'Finance',
          permissions: [
            { key: 'deal.view', scope: 'all' },
            { key: 'discount.approve', scope: 'all' },
            { key: 'invoice.issue', scope: 'all' },
            { key: 'invoice.cancel', scope: 'all' },
            { key: 'chat.send', scope: 'all' },
          ],
        },
        {
          key: 'admin',
          name: 'Administrator',
          permissions: [
            { key: 'deal.view', scope: 'all' },
            { key: 'deal.edit', scope: 'all' },
            { key: 'discount.approve', scope: 'all' },
            { key: 'invoice.issue', scope: 'all' },
            { key: 'invoice.cancel', scope: 'all' },
            { key: 'chat.send', scope: 'all' },
            { key: 'admin.manage', scope: 'all' },
          ],
        },
      ]);

    const passwordHash = await bcrypt.hash(
      DEMO_PASSWORD,
      BCRYPT_ROUNDS,
    );

    const managerA = await User.create({
      email: 'managerA@dealdesk.test',
      passwordHash,
      roleId: salesManager._id,
      branchId: branchA._id,
      managerId: null,
    });
    const managerB = await User.create({
      email: 'managerB@dealdesk.test',
      passwordHash,
      roleId: salesManager._id,
      branchId: branchB._id,
      managerId: null,
    });
    const execA = await User.create({
      email: 'execA@dealdesk.test',
      passwordHash,
      roleId: salesExec._id,
      branchId: branchA._id,
      managerId: managerA._id,
    });
    const execB = await User.create({
      email: 'execB@dealdesk.test',
      passwordHash,
      roleId: salesExec._id,
      branchId: branchB._id,
      managerId: managerB._id,
    });
    const finance = await User.create({
      email: 'finance@dealdesk.test',
      passwordHash,
      roleId: financeRole._id,
      branchId: branchA._id,
      managerId: null,
    });
    const admin = await User.create({
      email: 'admin@dealdesk.test',
      passwordHash,
      roleId: adminRole._id,
      branchId: branchA._id,
      managerId: null,
    });

    await Customer.create([
      {
        _id: new Types.ObjectId(DEMO_CUSTOMER_ID),
        name: 'Acme Corp',
        outstandingBalance: 0,
      },
      { name: 'Globex', outstandingBalance: 0 },
      { name: 'Initech', outstandingBalance: 0 },
    ]);

    await Product.create([
      {
        _id: new Types.ObjectId(DEMO_PRODUCT_ID),
        name: 'Starter Plan',
        sku: 'STARTER',
        price: 10000,
      },
      { name: 'Growth Plan', sku: 'GROWTH', price: 25000 },
      { name: 'Enterprise Plan', sku: 'ENTERPRISE', price: 50000 },
    ]);

    await ApprovalConfig.create([
      { minPct: 0, maxPct: 10, chain: [] },
      {
        minPct: 10,
        maxPct: 25,
        chain: ['sales_manager'],
      },
      {
        minPct: 25,
        maxPct: 40,
        chain: ['sales_manager', 'finance'],
      },
      {
        minPct: 40,
        maxPct: 100,
        chain: ['sales_manager', 'finance', 'admin'],
      },
    ]);

    console.log('\nDealDesk demo data seeded.');
    console.log('Branches: Branch A, Branch B');
    console.log(`Demo password: ${DEMO_PASSWORD}\n`);
    console.table(
      [execA, execB, managerA, managerB, finance, admin].map(
        (user) => ({
          email: user.email,
          branch:
            user.branchId.equals(branchA._id)
              ? 'Branch A'
              : 'Branch B',
          manager: user.managerId
            ? user.managerId.equals(managerA._id)
              ? 'managerA'
              : 'managerB'
            : '-',
          password: DEMO_PASSWORD,
        }),
      ),
    );
  } finally {
    await disconnectDb();
  }
}

async function mongooseDropDatabase(): Promise<void> {
  const { default: mongoose } = await import('mongoose');
  await mongoose.connection.dropDatabase();
}

main().catch((error: unknown) => {
  console.error('[seed] Failed to seed demo data:', error);
  process.exitCode = 1;
});
