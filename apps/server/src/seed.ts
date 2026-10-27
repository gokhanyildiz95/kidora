import 'dotenv/config';
import { prisma } from './lib/prisma';
import { DEMO_PASSWORD, seed } from './seed-data';

const { school } = await seed(prisma);
console.log(`✓ "${school.name}" oluşturuldu`);
console.log(`  Yönetici: yonetici@kidora.app / ${DEMO_PASSWORD}`);
console.log(`  Öğretmen: ayse@kidora.app / ${DEMO_PASSWORD}`);
console.log(`  Veli:     veli@kidora.app / ${DEMO_PASSWORD}`);
await prisma.$disconnect();
