const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.cleanerProfile.updateMany({
    where: { stripeAccountId: 'acct_1TKrzNCNgTXEeYxc' },
    data: { stripeAccountId: null }
  });
  console.log('Wiped successfully!');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
