import bcrypt from 'bcryptjs';
import type { Child, PrismaClient } from '@prisma/client';
import { dayKey, turkishPublicHolidays } from '@kidora/shared';

export const DEMO_PASSWORD = 'kidora123';

/** Wipes the database and fills it with a demo school. Used by `npm run db:seed` and tests. */
export async function seed(prisma: PrismaClient, { withAttendance = true } = {}) {
  await prisma.auditLog.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.school.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const school = await prisma.school.create({
    data: { name: 'Güneş Çiçeği Kreşi', address: 'Moda, Kadıköy / İstanbul', phone: '0216 555 00 00' },
  });

  // Demo calendar only; tests start with an open school so they pass on any date.
  const year = new Date().getFullYear();
  if (withAttendance) await prisma.holiday.createMany({
    data: [
      ...turkishPublicHolidays(year),
      ...turkishPublicHolidays(year + 1),
      { name: 'Yarıyıl tatili', startDate: `${year + 1}-01-25`, endDate: `${year + 1}-02-05` },
    ].map((h) => ({ ...h, schoolId: school.id })),
  });

  const user = (email: string, firstName: string, lastName: string, role: string, phone?: string) =>
    prisma.user.create({ data: { schoolId: school.id, email, firstName, lastName, role, phone, passwordHash } });

  const admin = await user('yonetici@kidora.app', 'Selin', 'Arslan', 'ADMIN', '0532 000 00 01');
  const ayse = await user('ayse@kidora.app', 'Ayşe', 'Kaya', 'TEACHER', '0532 000 00 02');
  const mehmet = await user('mehmet@kidora.app', 'Mehmet', 'Demir', 'TEACHER', '0532 000 00 03');
  const zeynep = await user('zeynep@kidora.app', 'Zeynep', 'Çelik', 'TEACHER', '0532 000 00 04');

  const rooms = await Promise.all([
    prisma.classroom.create({
      data: { schoolId: school.id, name: 'Tırtıllar', ageGroup: '1-2 yaş', emoji: '🐛', color: '#7BC67E', capacity: 8, ratio: 4 },
    }),
    prisma.classroom.create({
      data: { schoolId: school.id, name: 'Kelebekler', ageGroup: '3-4 yaş', emoji: '🦋', color: '#9B8CFF', capacity: 14, ratio: 7 },
    }),
    prisma.classroom.create({
      data: { schoolId: school.id, name: 'Arılar', ageGroup: '5-6 yaş', emoji: '🐝', color: '#FFB547', capacity: 18, ratio: 9 },
    }),
  ]);
  const [tirtil, kelebek, ari] = rooms as [(typeof rooms)[0], (typeof rooms)[0], (typeof rooms)[0]];
  await prisma.classroomStaff.createMany({
    data: [
      { classroomId: tirtil.id, userId: ayse.id },
      { classroomId: kelebek.id, userId: mehmet.id },
      { classroomId: ari.id, userId: zeynep.id },
    ],
  });

  const kids: Array<[string, string, string, string, string | null, string]> = [
    // firstName, lastName, birthDate, classroom, allergies, gender
    ['Defne', 'Yılmaz', '2024-11-02', tirtil.id, null, 'FEMALE'],
    ['Aras', 'Öztürk', '2024-08-19', tirtil.id, 'Süt ürünleri', 'MALE'],
    ['Elif', 'Şahin', '2025-01-10', tirtil.id, null, 'FEMALE'],
    ['Can', 'Aydın', '2022-06-14', kelebek.id, null, 'MALE'],
    ['Lina', 'Koç', '2022-03-27', kelebek.id, 'Fıstık', 'FEMALE'],
    ['Ege', 'Yıldız', '2022-10-30', kelebek.id, null, 'MALE'],
    ['Mira', 'Kurt', '2021-12-05', kelebek.id, null, 'FEMALE'],
    ['Kerem', 'Polat', '2022-09-11', kelebek.id, 'Yumurta', 'MALE'],
    ['Ada', 'Erdoğan', '2020-05-21', ari.id, null, 'FEMALE'],
    ['Deniz', 'Aksoy', '2020-11-08', ari.id, null, 'OTHER'],
    ['Ömer', 'Güneş', '2020-02-17', ari.id, 'Gluten', 'MALE'],
    ['Nehir', 'Tekin', '2019-12-29', ari.id, null, 'FEMALE'],
  ];

  const children: Child[] = [];
  for (const [firstName, lastName, birthDate, classroomId, allergies, gender] of kids) {
    children.push(
      await prisma.child.create({
        data: { schoolId: school.id, classroomId, firstName, lastName, birthDate: new Date(birthDate), allergies, gender },
      }),
    );
  }

  // Every child gets a parent account; the first one is the demo parent with two children.
  const demoParent = await user('veli@kidora.app', 'Burcu', 'Yılmaz', 'PARENT', '0533 111 11 11');
  for (const [i, child] of children.entries()) {
    const parent =
      i === 0 ? demoParent : await user(`veli${i}@kidora.app`, i % 2 ? 'Ahmet' : 'Fatma', child.lastName, 'PARENT');
    await prisma.childGuardian.create({
      data: { childId: child.id, userId: parent.id, relationship: i % 2 && i ? 'Baba' : 'Anne', isPrimary: true },
    });
    await prisma.emergencyContact.create({
      data: { childId: child.id, fullName: `Nermin ${child.lastName}`, relationship: 'Anneanne', phone: '0534 222 22 22' },
    });
    await prisma.pickupPerson.create({
      data: { childId: child.id, fullName: `Nermin ${child.lastName}`, relationship: 'Anneanne', phone: '0534 222 22 22' },
    });
  }
  // Demo parent's second child
  await prisma.childGuardian.create({
    data: { childId: children[8]!.id, userId: demoParent.id, relationship: 'Anne', isPrimary: false },
  });

  if (withAttendance) {
    const date = dayKey();
    const at = (h: number, m: number) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    };
    const present = [0, 1, 3, 4, 5, 8, 9, 10];
    for (const [n, i] of present.entries()) {
      await prisma.attendance.create({
        data: {
          childId: children[i]!.id,
          date,
          status: 'PRESENT',
          checkInAt: at(8, 5 + n * 4),
          checkInById: [ayse, mehmet, zeynep][n % 3]!.id,
          droppedOffBy: 'Anne',
        },
      });
    }
    await prisma.attendance.create({
      data: { childId: children[6]!.id, date, status: 'ABSENT', absenceNote: 'Ateşi var, evde dinleniyor' },
    });

    // A morning's worth of daily feed for the children who are in.
    const teacherFor = (i: number) => (i < 3 ? ayse : i < 8 ? mehmet : zeynep);
    const log = (i: number, type: string, h: number, m: number, data: object, note?: string) =>
      prisma.activity.create({
        data: {
          schoolId: school.id,
          childId: children[i]!.id,
          date,
          type,
          occurredAt: at(h, m),
          data: JSON.stringify(data),
          note,
          createdById: teacherFor(i).id,
        },
      });
    for (const i of present) {
      await log(i, 'MEAL', 9, 0, { meal: 'BREAKFAST', amount: i % 3 ? 'ALL' : 'MOST', items: 'Peynir, zeytin, tam buğday ekmeği' });
      await log(i, 'MOOD', 9, 30, { mood: i % 4 ? 'HAPPY' : 'CALM' });
      await log(i, 'PLAY', 10, 15, { title: i < 3 ? 'Duyusal oyun: renkli pirinç' : 'Parmak boyası ile sonbahar yaprakları' });
    }
    for (const i of [0, 1]) {
      await log(i, 'TOILET', 10, 45, { kind: i ? 'BM' : 'WET' });
      await log(i, 'NAP', 11, 0, { endedAt: at(12, 20).toISOString() });
    }
    const vitamin = await prisma.medicationPlan.create({
      data: {
        schoolId: school.id,
        childId: children[1]!.id,
        name: 'D vitamini',
        dose: '3 damla',
        times: '09:00,15:00',
        startDate: date,
        endDate: `${new Date().getFullYear() + 1}-01-31`,
        instructions: 'Yemekten sonra verilsin',
        createdRole: 'PARENT',
      },
    });
    await prisma.medicationPlan.create({
      data: {
        schoolId: school.id,
        childId: children[0]!.id,
        name: 'Öksürük şurubu',
        dose: '5 ml',
        times: '13:00',
        startDate: date,
        endDate: date,
        createdById: demoParent.id,
        createdRole: 'PARENT',
      },
    });
    await log(1, 'MEDICATION', 9, 5, { name: 'D vitamini', dose: '3 damla', planId: vitamin.id, slot: '09:00' });
    await log(0, 'INCIDENT', 10, 50, {
      description: 'Oyun alanında koşarken düştü, dizinde hafif sıyrık oldu.',
      actionTaken: 'Yara temizlendi ve yara bandı yapıldı. Kısa sürede oyuna döndü.',
      bodyPart: 'Sağ diz',
    });
    await log(0, 'NOTE', 12, 40, {}, 'Bugün ilk kez "teşekkürler" dedi 💛');

    // A short conversation for the demo parent's first child.
    const say = (senderId: string, senderRole: string, template: string, h: number, m: number, extra: { time?: string; note?: string } = {}) =>
      prisma.message.create({
        data: { schoolId: school.id, childId: children[0]!.id, senderId, senderRole, template, createdAt: at(h, m), ...extra },
      });
    await say(demoParent.id, 'PARENT', 'BAD_NIGHT', 7, 45, { note: 'Diş çıkarıyor, gece birkaç kez uyandı' });
    await say(ayse.id, 'TEACHER', 'NOTED', 8, 10);
    await say(ayse.id, 'TEACHER', 'NEEDS_DIAPERS', 11, 30);
    await say(demoParent.id, 'PARENT', 'EARLY_PICKUP', 12, 5, { time: '15:30' });
    // Another family wrote this morning, so the teacher sees it on the attendance tile.
    await prisma.message.create({
      data: { schoolId: school.id, childId: children[2]!.id, senderRole: 'PARENT', template: 'LATE_TODAY', time: '10:00', createdAt: at(7, 30) },
    });
  }

  return { school, admin, teachers: [ayse, mehmet, zeynep], demoParent, rooms, children };
}
