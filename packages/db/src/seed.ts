import { db, products } from './index.ts';

async function main() {
  await db.insert(products).values([
    {
      url: 'https://example.com/product/seed-1',
      sourceSite: 'example.com',
      title: 'Seed Product 1',
      currentPrice: '99.00',
      currency: 'CNY',
      stockStatus: 'in_stock',
    },
  ]).onConflictDoNothing();
  console.log('Seed completed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
