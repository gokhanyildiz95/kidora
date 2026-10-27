# Kidora 🌞

Kreşler ve anaokulları için veli odaklı yönetim platformu. brightwheel, Lillio, Procare, Famly,
Kinderpedia ve ParentZone'un özelliklerini tek bir sıcak ve renkli uygulamada toplamayı hedefler.

## Teknoloji

| Katman   | Seçim                                                                 |
| -------- | --------------------------------------------------------------------- |
| Arayüz   | React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query, i18next    |
| API      | Node.js, Express 5, TypeScript, Prisma, Zod, JWT (httpOnly çerez)      |
| Veritabanı | Geliştirmede SQLite, production için PostgreSQL                     |
| Ortak    | `packages/shared`: zod şemaları, roller ve tipler (API ve arayüz ortak kullanır) |
| Test     | Vitest + Supertest                                                     |

```
apps/
  server/   Express API (modules/<alan>/routes.ts yapısı)
  web/      React uygulaması
packages/
  shared/   Doğrulama şemaları ve ortak tipler
docs/
  roadmap.md  Aşama aşama özellik planı
```

## Çalıştırma

```bash
npm install
cp apps/server/.env.example apps/server/.env
npm run db:setup      # veritabanını oluşturur ve demo kreşi yükler
npm run dev           # API :4610, arayüz :5173
```

Demo hesaplar (şifre `kidora123`):

| Rol      | E-posta               |
| -------- | --------------------- |
| Yönetici | yonetici@kidora.app   |
| Öğretmen | ayse@kidora.app       |
| Veli     | veli@kidora.app       |

Diğer komutlar: `npm test`, `npm run typecheck`, `npm run build`.

## Yetki modeli

- **Yönetici** tüm okulu görür ve yönetir.
- **Öğretmen** yalnızca atandığı sınıfların çocuklarını görür, yoklama alır.
- **Veli** yalnızca kendi çocuklarını görür, gelmeyecek bildirebilir, teslim alma ve acil durum kişilerini düzenleyebilir.

Kapsam kuralları tek bir yerde, `apps/server/src/lib/scope.ts` içinde tanımlıdır. Yetkisiz bir
kayda erişim 403 değil 404 döner, böylece başka okulların kayıt kimlikleri sızmaz.

## Production için PostgreSQL

`apps/server/prisma/schema.prisma` içinde `provider = "postgresql"` yapıp `DATABASE_URL`'i
Postgres adresine çevirmek yeterli. Şema SQLite ile uyumlu kalsın diye durum alanları enum yerine
string tutulur ve zod ile doğrulanır.

## Anlık bildirimler

Mesajlar, günlük kayıtlar, yoklama ve ilaç olayları sayfa yenilemeden gelir. Her sekme
`GET /api/events` üzerinden tek bir Server-Sent Events bağlantısı açar. Bağlantı boştayken
neredeyse hiç kaynak harcamaz; sunucu yalnızca bir şey olduğunda, o çocuğu görebilen kişilere
küçük bir olay yollar (`apps/server/src/lib/live.ts`). Arayüz olayı alınca ilgili verileri
yeniden çeker, köşede kısa bir uyarı gösterir, sekme başlığına okunmamış sayısını yazar ve sekme
arka plandaysa (izin verildiyse) tarayıcı bildirimi açar. Bağlantı koparsa tarayıcı 5 saniyede
yeniden bağlanır; 2 dakikalık yavaş sorgulama yalnızca yedek olarak çalışır.

## Sonraki planlar

Özellik sırası [docs/roadmap.md](docs/roadmap.md) içinde. Teknik olarak bekleyenler:

- **Telefon tarzı push bildirimi (Web Push):** tarayıcı kapalıyken de bildirim. HTTPS ve canlı
  ortam gerektirdiği için yayına çıkarken eklenecek (service worker + VAPID anahtarları).
- **Birden fazla API sunucusu:** anlık bildirimler şu an tek sunucunun belleğinden dağıtılıyor.
  Yatayda ölçeklerken `publish` fonksiyonunun arkasına Redis pub/sub konacak.
- **Sekmelerin bağlantıyı paylaşması:** tarayıcılar HTTP/1.1'de aynı adrese en fazla 6 bağlantı
  açar. Canlıda HTTP/2 bu sınırı kaldırır; gerekirse sekmeler `BroadcastChannel` ile tek bağlantıyı
  paylaşacak.
- **Günlük öğretmen ataması:** müdürün o güne özel sınıf-öğretmen ataması (şimdilik sonraya kaldı).
- **PostgreSQL'e geçiş:** canlı ortam için; yukarıdaki "Production için PostgreSQL" bölümüne bakın.
- **Online ödeme:** ilk aşamada fatura + "ödendi" işaretleme, online ödeme sonra.
- **Denetim kaydı ekranı:** kayıtlar veritabanında tutuluyor, görüntüleme ekranı eklenecek.
