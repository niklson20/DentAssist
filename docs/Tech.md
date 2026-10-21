# Tech.md — Arhitektura i tehničke konvencije

Izvor istine za način na koji je aplikacija sastavljena. Pre uvođenja novog obrasca, biblioteke
ili strukture foldera, pročitaj ovaj dokument. Ako promena nije opisana ovde, prvo se dopunjuje
dokument, pa onda piše kod.

Povezano: [`PRD.md`](./PRD.md) (šta proizvod radi, uključujući ekrane), [`DB.md`](./DB.md) (šema baze).

Raspored ekrana na računaru i telefonu živi u PRD-u. Ovde su tehnologije, slojevi i pravila
koja kod mora da poštuje.

---

## 1. Tehnološki stek

| Sloj | Izbor | Verzija |
| --- | --- | --- |
| Framework | Next.js, App Router | 16.4.x |
| UI biblioteka | React | 19.2.x |
| Jezik | TypeScript, `strict` | 5.x |
| Stilovi | Tailwind CSS v4 (konfiguracija u CSS-u) | 4.x |
| Komponente | shadcn/ui, preset `b37t58d3x` | najnovije |
| Baza i auth | Supabase, `@supabase/ssr` | 0.12.x |
| Validacija | Zod | 4.x |
| Mejl | Resend; jedan domen aplikacije, ime pošiljaoca je ordinacija | — |
| Mapa | Leaflet, pločice OpenStreetMap, pin preko Nominatim | — |
| Robot | Cloudflare Turnstile | — |
| Unit testovi | Vitest | najnovije |
| E2E testovi | Playwright | najnovije |
| Hosting | Vercel | — |

**Next.js 16:** presretanje zahteva je `proxy.ts` u korenu (`proxy` + `config.matcher`).
`cookies()`, `headers()` i `searchParams` su asinhroni. Tailwind konfiguracija je u
`app/globals.css` kroz `@theme`. Pre manje poznatog API-ja proveri
`node_modules/next/dist/docs/`.

Jedna baza drži sve ordinacije. Izolacija je `clinic_id` i RLS, ne poseban Supabase
projekat po ordinaciji.

---

## 2. Struktura

```
app/
  actions/                 izmene podataka
  components/
  page.tsx                 imenik na /
  prijava/
  poziv/[token]/           prihvat pozivnice
  lozinka/[token]/         nova lozinka
  danas/                   kalendar i zahtevi koji čekaju
  pacijenti/
  podesavanja/
  statistika/              samo vlasnik
  platforma/               zahtevi, pozivnice i ordinacije
  za-ordinacije/           zahtev za nalog
  ordinacije/[slug]/       profil, stomatolog, dan, slobodni početci
    prijava/               nalog pacijenta, povratak u istu ordinaciju
    registracija/
    termini/               samo termini ovog mejla u ovoj ordinaciji
    deca/
    povezi/[token]/        potvrda veze kartona deteta
    zakazivanje/
  zakazivanje/[token]/     izbor ponude, pomeranje, otkaz iz mejla
  api/cron/                Vercel cron, nije stranica
  globals.css
components/ui/             shadcn, naše kopije
lib/
  supabase/
  queries/
  schemas/
  labels.ts
  auth.ts
  calendar-dates.ts
  action-result.ts
supabase/migrations/
scripts/
docs/
```

Javne stranice ne uvoze server klijent u klijentske komponente. Čitaju preko upita i
javnih funkcija iz [`DB.md`](./DB.md#8-javne-funkcije).

Meni osoblja nije u korenskom rasporedu. Javno ime `<domen-aplikacije>` služi pacijenta:
`/`, `/ordinacije`, `/zakazivanje`. Ime `dent.<domen-aplikacije>` služi ordinaciju:
`/prijava`, `/za-ordinacije`, `/danas`, `/pacijenti`, `/podesavanja`, `/statistika`,
`/platforma`, `/poziv`. Na `dent.` adresa `/` je ulaz dok niko nije prijavljen, ne imenik.
Prijavljeno osoblje sa te adrese ide na `/danas`, nalog platforme na `/platforma`.
Javne strane nemaju stavke Danas, Pacijenti, Podešavanja i Statistika. `/lozinka` važi na
oba imena; mejl bira ime. Sesija osoblja i platforme važi na oba imena. Na `localhost`
nema preusmerenja: putanje stoje na istom originu. Imenik nema prijavu ni registraciju.
Ta dugmad su u gornjem desnom uglu `/ordinacije/[slug]`, dok pacijent nije prijavljen.

Zakazivanje drži `stomatolog` i `pocetak` u adresi. Kalendar drži `prikaz`
(`dan`, `nedelja`, `mesec`), `datum`, `stomatolog` i `sakrijOtkazane`.

---

## 3. Slojevi

| Sloj | Gde | Sme | Ne sme |
| --- | --- | --- | --- |
| Čitanje | `lib/queries` | Supabase, domenski tipovi | pisati, `revalidatePath` |
| Pisanje | `app/actions` | validacija, izmene, revalidacija | vraćati sirov red baze |
| Stranice | `app/**/page.tsx` | upiti i komponente | direktan Supabase |
| Komponente | `app/**`, `components/ui` | prikaz, poziv akcija | znati da Supabase postoji |
| Domen | `lib/*.ts` | čista logika | baza i React |

Nazivi kolona ne izlaze iz `lib/queries`. Napolje ide `camelCase`.

Svaki ulaz prolazi kroz Zod šemu u `lib/schemas`. Poruke su na srpskom. Server akcija
vraća `ActionResult`: `{ ok: true, data }` ili `{ ok: false, error, fieldErrors? }`.
Ne baca izuzetak ka korisniku. Tehnički detalj Supabase-a ide u serverski log, bez
sadržaja kartona.

Podrazumevana je serverska komponenta. `"use client"` ide samo zbog stanja, događaja
ili browsera, što niže u stablu.

---

## 4. Dizajn sistem

Vizuelni sistem je shadcn preset **`b37t58d3x`**:

| Stavka | Vrednost |
| --- | --- |
| Stil | Vega |
| Osnovna boja | Zinc |
| Akcenat | Teal |
| Grafikon | Indigo |
| Ikonice | Phosphor |
| Font | Inter |
| Naslov | isti font |
| Zaobljenje | podrazumevano |
| Meni | obrnute boje, blag akcenat |

Pregled: <https://ui.shadcn.com/create?preset=b37t58d3x>

```bash
npx shadcn@latest init --preset b37t58d3x
```

Stara zelena paleta (`#176b4d` i prateći tokeni) se ne koristi.

Pravila:

- Ako shadcn komponenta postoji, koristi se ona. Nova CSS klasa se ne piše bez razloga.
- Boje idu iz tokena teme, ne kao heks u komponenti.
- Kalendarska mreža i zubna mapa ostaju poseban CSS. Nijedna gotova komponenta ne pokriva
  kolone stomatologa ni odontogram. Oba su u `globals.css`, uz komentar zašto. Raspored
  mape je u [`PRD.md`](./PRD.md#85-zubna-mapa).
- Javne stranice moraju da se završe na uskom ekranu. Ordinacija je složena za širok
  ekran; na telefonu prvi završen put je lista zahteva i odgovor na jedan zahtev.
- Imenik i stranica ordinacije nemaju meni osoblja. Meni iz PRD odeljka 11.2 pripada
  stranama `/danas`, `/pacijenti`, `/podesavanja` i `/statistika`.

Kod je na engleskom, interfejs na srpskom, latinicom. Prevodi kodova su samo u
`lib/labels.ts`.

---

## 5. Vreme

Sve u `lib/calendar-dates.ts`.

- Baza čuva `timestamptz` u UTC.
- Zona je `Europe/Belgrade`, lokalizacija `sr-Latn-RS`.
- Lokalno vreme u ISO ide kroz `belgradeLocalToISO()`. `new Date("2026-10-17T09:00")`
  se ne koristi.
- Nedelja počinje ponedeljkom.
- Korak i razmak čitaju se iz ordinacije, nisu konstante.
- Stanje kalendara je u URL-u (`prikaz`, `datum`, `stomatolog`, `sakrijOtkazane`).
- Zaključavanje zapisa: 24 sata od `ends_at`. Zaključavanje dokumenta: 24 sata od
  `created_at`.

---

## 6. Pristup

Četiri sloja.

1. `proxy.ts` osvežava sesiju i deli dva imena. Štiti `/danas`, `/pacijenti`, `/podesavanja`,
   `/statistika`, `/platforma`. Bez naloga prolaze `/`, `/prijava`, `/za-ordinacije`,
   `/ordinacije`, `/zakazivanje`, `/poziv` i `/lozinka`.
   `/prijava`, `/za-ordinacije` i `/poziv` ne traže nalog, ali sa javnog imena prelaze
   na isto putanje na `dent.`. Javni host je `<domen-aplikacije>`: `/` je imenik, bez
   menija osoblja i bez prijave pacijenta. Prijavljeno osoblje ili platforma koji otvore
   taj `/` idu na `dent.` i `/danas`, odnosno `/platforma`. Pacijent koji nije osoblje
   ostaje na imeniku. Host `dent.<domen-aplikacije>` drži ulaz ordinacije i strane
   osoblja. Na tom hostu `/` otvara prijavu dok niko nije prijavljen. Prijavljeno osoblje
   ide na `/danas`, nalog platforme na `/platforma`. Nalog koji je samo pacijent ostaje
   na prijavi. Strane osoblja na javnom hostu prelaze na isto putanje na `dent.`.
   `/ordinacije` i `/zakazivanje` na `dent.` prelaze na javni host. `/lozinka` ostaje na
   hostu iz linka. `localhost` ne preusmerava. Kolačić sesije važi na oba imena, na
   roditeljskom domenu, da javni host vidi prijavu osoblja. Prijava pacijenta je na
   `/ordinacije/[slug]`.
2. Stranica sama zove `requireMember()`, `requireOwner()` ili `requirePlatformAdmin()`.
3. RLS iz [`DB.md`](./DB.md#7-pristup).
4. Javne funkcije su jedini ulaz bez naloga. Ne vraćaju tuđe ime, zauzet termin ni razlog blokade.

`service_role` ne čita karton. Serverski kod sme da ga upotrebi samo da napravi
`auth.users` red kad pozivnica bude prihvaćena, i da sa cron rute pozove
`expire_booking_requests()`, `purge_booking_request_pii()` i `due_reminders()`.
Te tri funkcije ne vraćaju zapis, anamnezu, zube ni dokument.

PIN na povezanom uređaju menja sesiju na člana te ordinacije. Pogrešan PIN pet puta
traži lozinku. Posle 2 minuta bez dodira povezani računar se vraća na izbor imena.
Uređaj koji je vlasnik opozvao više ne nudi imena. „Zapamti me“ na
ličnom uređaju drži kolačić 90 dana i ne važi za povezani recepcijski računar.

Povezani računar drži HttpOnly kolačić `clinic_device`. Vrednost je tajna od 32 bajta.
U `clinic_devices.secret_hash` stoji HMAC-SHA-256 te tajne. Kolačić traje dok vlasnik
ne opozove uređaj. `Secure` i `SameSite=Lax`. Opoziv briše prijavu na tom računaru.

Nalog pacijenta i nalog osoblja mogu deliti jedan `auth.users` red. `requireMember()`
traži red u `clinic_members`. `requirePatient()` traži red u `patient_accounts`.
`requireOwner()` i dalje traži vlasnika. Pacijent ne prolazi u zaštićene putanje osoblja.
Stranice `/ordinacije/[slug]/termini`, `/deca`, `/povezi/[token]`, `/zakazivanje` i
`/zakazivanje/[token]` same zovu `requirePatient()`. Zahtev nastaje samo ako nalog ima
potvrđen mejl i, na linku iz mejla, ako je taj mejl mejl zahteva. Pregled imenika
i stranice ordinacije prolazi bez naloga. Slobodni početci traže prijavu:
`get_available_slots` ne zove `anon`. `/api/cron` nije javna
stranica: traži `CRON_SECRET`.

Podešavanja cele ordinacije, osim `/podesavanja/nalog`, traže PIN vlasnika čim u
ordinaciji postoji drugi član ili neiskorišćena pozivnica. Dok je vlasnik jedini i
pozivnice nema, PIN se ne traži. Uneti PIN važi do odjave. Stomatolog na
`/podesavanja/radno-vreme` menja samo svoje vreme i PIN vlasnika ne unosi. Prva
pozivnica kolegi ne ide dok vlasnik nije postavio PIN.

Podešavanja cele ordinacije, pozivnice, spajanje, izvoz, brojevi i pravni podaci proveravaju
ulogu vlasnika i u akciji i u bazi. Prihvatanje tuđeg zahteva proverava da je pozivalac
vlasnik ili taj stomatolog.

---

## 7. Mejl i rokovi

Svi mejlovi idu preko **Resenda**, iz `lib/mail.ts`: i pacijentu i osoblju (pozivnica,
nova lozinka, kod, potvrda, odbijanje, ponuda, otkaz, promena sata, podsetnik).
Supabase čuva nalog i lozinku. Ne šalje mejl.

Domen mejla je jedan, domen aplikacije. Svaka ordinacija nema svoj DNS ni svoj Gmail.
Sajt ima dva imena: javno `<domen-aplikacije>` i `dent.<domen-aplikacije>` za ordinaciju.
Oba pokazuju na istu aplikaciju. Mejl i dalje ide sa javnog imena.

| Stavka | Vrednost |
| --- | --- |
| Servis | Resend |
| Adresa | `ne-odgovaraj@<domen-aplikacije>` |
| Ime koje vidi primalac | naziv ordinacije za termine; DentAssist za potvrdu mejla i novu lozinku pacijenta |
| Odgovor | ne prima se; u telu je telefon ordinacije |

Slanje je samo sa servera: server akcija ili cron. Klijent ne zove Resend. Omotač je
`lib/mail.ts`. Ključ `RESEND_API_KEY` stoji na Vercel-u i u lokalnom `.env.local`, nikad u git-u.

Pre prvog pravog slanja na domenu stoje SPF, DKIM i DMARC. Bez toga kodovi završavaju u spamu.

Šalje se: kod za potvrdu mejla pri registraciji, zahtev primljen, potvrđen, odbijen, istekao, otkazan, ponuda, promena sata,
podsetnik 24 sata pre i 2 sata pre. Podsetnik se ne šalje ako je taj trenutak već prošao
u času potvrde. Isti podsetnik ne ide dvaput (`appointment_reminders`).

Ordinacija ne dobija mejl. Novi zahtev vidi se na početnom ekranu.

Posao je ruta `/api/cron`. Vercel je zove jednom na sat. Zahtev bez
`Authorization: Bearer <CRON_SECRET>` dobija 401. Podsetnik „2 sata pre“ stiže u tom
satu, ne u tačan minut.

- `expire_booking_requests()`
- `purge_booking_request_pii()` posle 90 dana
- slanje podsetnika iz `due_reminders()`

Rok od 24 radna sata računa `lib/booking-deadline.ts` iz radnog vremena **tog**
stomatologa. Zatvoren dan i blokada celog dana ne troše rok. Početak termina seče rok
ako stigne ranije.

Kod za potvrdu mejla je 6 cifara, važi 10 minuta, pet pokušaja, tri slanja na sat po mejlu.
Zakazivanje taj kod ne traži ponovo. Posle 10 slanja u satu sa iste mreže uključuje se
Cloudflare Turnstile, na registraciji i na `/za-ordinacije`. Javni ključ je `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
Tajni ključ `TURNSTILE_SECRET_KEY` proverava odgovor na serveru. Mreža se pamti kao
`ip_hash`, HMAC-SHA-256 adrese i `TOKEN_PEPPER`. Sirova IP adresa se ne upisuje.

Otisci:

| Šta | Kako | Zašto tako |
| --- | --- | --- |
| Lozinka | Supabase Auth | aplikacija je ne hešira ponovo |
| PIN i šestocifreni kod | Argon2id | kratki su; red se prvo nađe po osobi ili izazovu, pa se kod proveri |
| Token iz linka, tajna uređaja | HMAC-SHA-256 sa `TOKEN_PEPPER` | token ima 32 bajta; otisak mora da se traži bez čitanja svih redova |

`TOKEN_PEPPER` stoji u `.env.local` i na Vercel-u, nikad u git-u.

Mapa u imeniku je Leaflet i pločice OpenStreetMap. Pin puni Nominatim, jednom, kad
vlasnik sačuva adresu. Zahtev nosi identifikaciju aplikacije. Ako rezultata nema,
`latitude` i `longitude` ostaju prazni, a ordinacija ostaje na listi.

---

## 8. Dokumenti

Bucket `patient-files` je privatan. Putanja `{clinic_id}/{patient_id}/{file_id}.{ext}`.
Najviše 10 MB. Upload ne ide kroz serversku akciju zbog limita tela na Vercel-u:
priprema potpisanog URL-a, `PUT` sa klijenta, pa potvrda reda u `patient_files`.
Pregled i preuzimanje su kratki potpisani URL-ovi. Recepcija ne dobija URL.

`pg_dump` ne obuhvata fajlove. Backup bucketa nije u prvoj verziji. Poseban prostor po
ordinaciji ne postoji. Jedina granica je 10 MB po fajlu. Poruka o prostoru ide samo
kad skladište samo odbije upis.

Potpisani URL za `patient-files` dobijaju vlasnik i stomatolog te ordinacije, i samo
za putanju koja počinje njihovim `clinic_id`. Recepcija ga ne dobija. Izmena metapodataka
i brisanje rade 24 sata od `created_at`, i to odbija baza, ne samo ekran. `clinic-logos`
je javan za čitanje. Piše ga vlasnik, u `{clinic_id}/logo.{ext}`.

Bucket `clinic-logos` je javan za čitanje. Putanja `{clinic_id}/logo.{ext}`. JPEG, PNG
ili WebP, do 1 MB. Putanja stoji u `clinics.logo_path`.

---

## 9. Izvoz i brojevi

Izvoz vlasnika je ZIP sa CSV fajlovima: pacijenti, kontakti, termini, zapisi, anamneza,
trenutna mapa i istorija mape. Bez RTG i PDF. Akcija proverava vlasnika i da redovi
nose samo njegov `clinic_id`.

Brojevi na `/statistika` su upit vlasnika: termini, novi pacijenti, nedolasci, po mesecu
u zoni Beograda i po stomatologu. Platforma taj upit nema.

---

## 10. Okruženja i backup

Dva Supabase projekta: jedan za rad svih ordinacija, jedan za razvoj. Besplatan plan
dozvoljava dva projekta. Lozinke ne idu u git ni u ovaj dokument.

| Uloga | Projekat | Gde stoje ključevi |
| --- | --- | --- |
| Produkcija | `iirzzaykgskjouzzvdrd` | Vercel Production, GitHub secret `SUPABASE_DB_URL` |
| Test | `hmkxuvwpjvzekpvpmsuk` | `.env.local` |

| Promenljiva | Tajna |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ne |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ne, podleže RLS-u |
| `SUPABASE_DB_URL` | da; samo migracije i backup, nije na Vercel-u |
| `RESEND_API_KEY` | da; Vercel i `.env.local` |
| `MAIL_FROM` | ne; `ne-odgovaraj@<domen-aplikacije>` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ne |
| `TURNSTILE_SECRET_KEY` | da; Vercel i `.env.local` |
| `APP_URL` | ne; javni origin, pun link pacijentu u mejlu, bez kose crte na kraju |
| `STAFF_URL` | ne; `https://dent.<domen-aplikacije>`, link osoblju u mejlu, bez kose crte na kraju |
| `CRON_SECRET` | da; Vercel i `.env.local` |
| `TOKEN_PEPPER` | da; Vercel i `.env.local` |

Dok `STAFF_URL` nije postavljen, link „Za ordinacije“ i linkovi osoblju ostaju na trenutnom originu. Tako `localhost` radi bez drugog imena.

`SUPABASE_DB_URL` je Session pooler (port 5432, IPv4). `service_role` nije u
`NEXT_PUBLIC_` promenljivoj. Javna registracija u konzoli je isključena.

`db:reset` i seed ne smeju na produkciju. Skripta poredi konekciju sa refom produkcije
i odbija reset. Jedini izuzetak je `CONFIRM_RESET_PROD=1` i `--yes`. Pre `db:migrate`
na produkciji ide `npm run db:backup`. `backups/` je u `.gitignore`.

Tri nivoa čuvanja:

1. Ručni `pg_dump` pre migracije.
2. Šifrovani dnevni posao van git-a. Kopija na GitHub-u nije dugoročni arhiv kartona.
3. Supabase Pro sa povratom na tačan minut, pre prvog pravog kartona.

`pg_dump` ne obuhvata fajlove u Storage-u. Proba vraćanja radi se pre prvog pravog kartona.

---

## 11. Testovi

Vitest, bez baze: zona i letnje vreme, korak i razmak, preklapanje po stomatologu,
rok koji preskače zatvoren dan i staje na početak termina, 15. rođendan, Zod šeme,
prevodi u `labels.ts`, slug.

Playwright, na test bazi, nikad na produkciji:

1. Dve ordinacije: član prve ne vidi pacijenta druge; platforma ne vidi karton.
2. Javni tok: pregled bez prijave ne pokazuje slobodne termine i ne šalje zahtev; potvrda mejla, zahtev, prihvat, odbijanje, tri ponude, „nijedan ne odgovara“.
3. Dete: karton deteta, mejl na kontaktu, zadatak na 15. rođendan.
4. Recepcija ne otvara zapis ni dokument; ne završava termin.
5. Preklapanje istog stomatologa se odbija; dva stomatologa u isti sat prolaze.
6. Neprijavljen posetilac ne vidi slobodne početke i ne šalje zahtev. Prijavljen roditelj
   zakazuje sačuvano dete. Stranica ordinacije nema put u imenik. `/termini` te
   ordinacije ne pokazuje termin druge.

Svaka ispravljena greška dobija test koji bi je uhvatio. Testovi ne zavise od današnjeg
datuma ni od seed podataka.

---

## 12. Konvencije

- TypeScript `strict`. Nema `any`.
- Fajlovi `kebab-case`, komponente `PascalCase`, funkcije `camelCase`.
- Imenovani izvozi. Podrazumevani samo gde Next.js traži.
- Uvoz preko `@/`.
- Komentar samo za ograničenje koje se iz koda ne vidi.
- `npm run lint` prolazi pre commit-a.
- Slug je u `lib/slug.ts`. Latinica, mala slova. č i ć idu u `c`, š u `s`, ž u `z`,
  đ u `dj`, dž u `dz`. Ostala slova van `a–z` i cifara postaju `-`. Uzastopne crtice
  se slažu u jednu, crtice na krajevima otpadaju. Slug se ne menja kad se ime promeni.
  Sudar u istoj ordinaciji dobija `-2`, `-3`, i tako redom. Prazan rezultat postaje `karton`
  za pacijenta i `ordinacija` za ordinaciju, pa isti sufiks ako treba.
- Telefon je u `lib/phone.ts`. Razmaci, crtice i kose crte otpadaju. `00` na početku
  postaje `+`. Vodeća `0` postaje `+381`. Ostaje `+381` i 8 do 10 cifara, prva posle
  pozivnog broja nije 0. U bazi stoji taj oblik.
- JMBG, ako je unet, ima tačno 13 cifara. Kontrolna cifra se ne računa.
- Poslednji izabrani stomatolog na javnoj strani pamti se na uređaju, po slug-u
  ordinacije, ne na nalogu.

---

## 13. Van ovog dokumenta

Raspored ekrana, tekstovi mejlova i tačan redosled forme su u [`PRD.md`](./PRD.md).
Šema nije ovde. To je [`DB.md`](./DB.md).
