# DentAssist

DentAssist je veb aplikacija za stomatološke ordinacije. Jedna instalacija služi više ordinacija. Pacijent pregleda imenik i zakazuje, osoblje vodi kalendar i karton, a podaci jedne ordinacije nisu vidljivi drugoj.

Interfejs je na srpskom. Pacijent ulazi na javni domen, ordinacija na `dent.` tog domena. Oba imena idu u istu aplikaciju i istu bazu. Lokalno oba ulaza rade na `localhost`.

## Šta radi

- Imenik i stranica ordinacije bez prijave. Slobodni termini i zahtev traže nalog.
- Zakazivanje za sebe ili za dete mlađe od 15 godina, preko roditelja ili srodnika.
- Kalendar po stomatologu: jedan stomatolog nema preklapanje, dva smeju u isti sat.
- Osoblje prihvata, odbija ili nudi do tri druga termina. Podsetnik ide 24 sata i 2 sata pre termina.
- Karton: istorija dolazaka, zapis posete, anamneza, upozorenje, dokumenti i zubna mapa.
- Vlasnik vodi osoblje, preuzima izvoz i gleda mesečne brojeve. Platforma otvara ordinaciju i ne čita kartone.

Uloge su platforma, vlasnik, stomatolog, recepcija i pacijent. Recepcija zakazuje i vidi ko dolazi. Ne otvara zapis posete, anamnezu, dokumente, JMBG ni upozorenje.

## Stek

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase, Zod, Vitest i Playwright. Aplikacija se hostuje na Vercel-u.

Izolacija ordinacija je `clinic_id` i pravila u bazi, ne poseban projekat po ordinaciji.

## Pokretanje

Potreban je Node.js 20 ili noviji.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Na macOS i Linuxu umesto `copy` ide `cp .env.example .env.local`. Vrednosti ostaju u `.env.local`. Taj fajl ne ide u git.

Aplikacija na `http://localhost:3000` očekuje Supabase projekat. Migracije na povezani projekat šalje:

```bash
npm run db:migrate
```

`npm run db:reset` odbija produkcioni projekat. `npm run db:backup` pravi šemu i podatke u `backups/`, a taj folder je u `.gitignore`.

Mejl inače ide preko Resenda. Dok domen aplikacije nije verifikovan, `mail_test` i `mail_password` u `.env.local` šalju poštu preko Gmaila. Obe vrednosti se uklone kad Resend preuzme slanje.

## Testovi

```bash
npm test
npx playwright test
```

Vitest ne dira bazu. Playwright ide na test projekat i odbija produkciju.

## Dokumentacija

- [docs/PRD.md](docs/PRD.md) opisuje proizvod.
- [docs/Tech.md](docs/Tech.md) opisuje sastav aplikacije.
- [docs/DB.md](docs/DB.md) opisuje šemu baze.
