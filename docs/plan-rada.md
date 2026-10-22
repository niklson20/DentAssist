# Plan rada

Isti tekst ide u svaki novi chat. Agent uzme prvi neštikliran red tabele, uradi samo njega i štiklira ga. Jedan chat u jednom trenutku, odozgo nadole.

Izvor istine za proizvod ostaju [PRD.md](./PRD.md), [Tech.md](./Tech.md) i [DB.md](./DB.md). Agent ne dopunjuje ta tri dokumenta i ne uvodi biblioteku ni sloj koji u njima ne piše.

## Status

Tabela je red rada, odozgo nadole. Taj red već poštuje zavisnosti, pa agent ne bira zadatak po stazi. Svi redovi počinju prazni. Agent sme da izmeni samo ćeliju Gotovo u redu koji radi, iz `[ ]` u `[x]`. Ako treba ponovo da se radi već štikliran zadatak, štikl se skida ručno pre novog chata. Za Opus na ponovljenom zadatku isto tako: skini štikl i u Cursoru izaberi Opus, iako u koloni i dalje piše Sonnet.

| ID | Zadatak | Model | Gotovo |
| --- | --- | --- | --- |
| 0.1 | Skela | Composer 2.5 Fast | [x] |
| 0.2 | Dizajn | Composer 2.5 Fast | [x] |
| 0.3 | Domen | Claude Sonnet thinking | [x] |
| 0.4 | Ugovori | Composer 2.5 Fast | [x] |
| 1.1 | Klinika | Claude Sonnet thinking | [x] |
| 1.2 | Pozivnice | Claude Sonnet thinking | [x] |
| 1.3 | Pacijent | Claude Sonnet thinking | [x] |
| 1.4 | Karton u bazi | Claude Sonnet thinking | [x] |
| 1.5 | Termini | Claude Sonnet thinking | [x] |
| 1.12 | Nalozi pacijenata | Claude Sonnet thinking | [x] |
| 1.6 | Zahtev | Claude Sonnet thinking | [x] |
| 1.7 | Javno čitanje | Claude Sonnet thinking | [x] |
| 1.8 | Slotovi | Claude Sonnet thinking | [x] |
| 1.9 | Javni upis | Claude Sonnet thinking | [x] |
| 1.10 | Token i poslovi | Claude Sonnet thinking | [x] |
| 1.11 | Seed i fajlovi | Claude Sonnet thinking | [x] |
| 2.A0 | Dva ulaza | Composer 2.5 Fast | [x] |
| 2.A1 | Prijava | Claude Sonnet thinking | [x] |
| 2.A1b | Osvežavanje sesije | Claude Sonnet thinking | [x] |
| 2.A2 | Nova lozinka | Claude Sonnet thinking | [x] |
| 2.A3 | Pozivnica ordinacije | Claude Sonnet thinking | [x] |
| 2.A4 | Pozivnica kolege | Claude Sonnet thinking | [x] |
| 2.A5 | PIN | Claude Sonnet thinking | [x] |
| 2.B1 | Zahtev za pristup | Composer 2.5 Fast | [x] |
| 2.B2 | Pozivnica platforme | Composer 2.5 Fast | [x] |
| 2.B3 | Gašenje | Composer 2.5 Fast | [x] |
| 2.C1 | Školjka podešavanja | Composer 2.5 Fast | [x] |
| 2.C9 | Nalog osoblja | Composer 2.5 Fast | [x] |
| 2.C2 | Profil ordinacije | Composer 2.5 Fast | [x] |
| 2.C3 | Osoblje | Composer 2.5 Fast | [x] |
| 2.C4 | Radno vreme | Composer 2.5 Fast | [x] |
| 2.C5 | Tipovi | Composer 2.5 Fast | [x] |
| 2.C6 | Uređaji | Composer 2.5 Fast | [x] |
| 2.C7 | Pravni podaci | Composer 2.5 Fast | [x] |
| 2.C8 | Vodič | Composer 2.5 Fast | [x] |
| 2.C10 | PIN kapija | Claude Sonnet thinking | [x] |
| 2.D1 | Imenik | Composer 2.5 Fast | [x] |
| 2.D2 | Mapa | Composer 2.5 Fast | [ ] |
| 2.D3 | Profil ordinacije | Composer 2.5 Fast | [ ] |
| 2.D4 | Slobodni počeci | Composer 2.5 Fast | [ ] |
| 2.D11 | Prijava pacijenta | Claude Sonnet thinking | [ ] |
| 2.D12 | Deca i povezivanje | Claude Sonnet thinking | [ ] |
| 2.D13 | Termini pacijenta | Composer 2.5 Fast | [ ] |
| 2.D5 | Zakazivanje za sebe | Claude Sonnet thinking | [ ] |
| 2.D6 | Zakazivanje za dete | Claude Sonnet thinking | [ ] |
| 2.D7 | Zahtev | Claude Sonnet thinking | [ ] |
| 2.D8 | Ponuda | Claude Sonnet thinking | [ ] |
| 2.D9 | Pomeranje i otkaz | Claude Sonnet thinking | [ ] |
| 2.D10 | Mejlovi pacijentu | Composer 2.5 Fast | [ ] |
| 2.E1 | Školjka kalendara | Composer 2.5 Fast | [ ] |
| 2.E2 | Dnevni prikaz | Claude Sonnet thinking | [ ] |
| 2.E3 | Nedelja i mesec | Composer 2.5 Fast | [ ] |
| 2.E4 | Unos termina | Claude Sonnet thinking | [ ] |
| 2.E11 | Blokade | Claude Sonnet thinking | [ ] |
| 2.E5 | Statusi | Claude Sonnet thinking | [ ] |
| 2.E12 | Izmena termina | Claude Sonnet thinking | [ ] |
| 2.E6 | Zahtevi | Claude Sonnet thinking | [ ] |
| 2.E7 | Ponuda iz kalendara | Claude Sonnet thinking | [ ] |
| 2.E9 | Mejlovi osoblja | Claude Sonnet thinking | [ ] |
| 2.E8 | Telefon | Composer 2.5 Fast | [ ] |
| 2.F1 | Lista pacijenata | Composer 2.5 Fast | [ ] |
| 2.F2 | Pregled kartona | Composer 2.5 Fast | [ ] |
| 2.F3 | Istorija | Composer 2.5 Fast | [ ] |
| 2.F4 | Anamneza i upozorenje | Claude Sonnet thinking | [ ] |
| 2.F5 | Zapis posete | Claude Sonnet thinking | [ ] |
| 2.F6 | Zubna mapa | Claude Sonnet thinking | [ ] |
| 2.F7 | Dokumenti | Claude Sonnet thinking | [ ] |
| 2.F8 | Spajanje | Claude Sonnet thinking | [ ] |
| 2.F9 | Mejl na dolasku | Claude Sonnet thinking | [ ] |
| 3.1 | Istek zahteva | Claude Sonnet thinking | [ ] |
| 3.2 | Podsetnici | Claude Sonnet thinking | [ ] |
| 3.3 | Statistika | Composer 2.5 Fast | [ ] |
| 3.4 | Izvoz | Composer 2.5 Fast | [ ] |
| 3.E1 | Izolacija dve ordinacije | Claude Sonnet thinking | [ ] |
| 3.E2 | Zahtev i ponude | Claude Sonnet thinking | [ ] |
| 3.E3 | Dete i 15. rođendan | Claude Sonnet thinking | [ ] |
| 3.E4 | Recepcija | Claude Sonnet thinking | [ ] |
| 3.E5 | Preklapanje | Claude Sonnet thinking | [ ] |
| 3.E6 | Nalog i vrata | Claude Sonnet thinking | [ ] |

## Pravilo jednog chata

Tekst koji se lepi u svaki novi chat:

```
Uradi prvi neštikliran zadatak iz docs/plan-rada.md: prvi red odozgo čija je kolona Gotovo još [ ].
Ako takvog reda nema, reci da je plan gotov i stani.
Otvori samo odeljke navedene uz taj zadatak. Ako odgovor već piše u njima, ne pitaj.
Pre koda napiši šta fali od naloga, ključeva, fajlova i odluka. Ako fali, stani. Ne izmišljaj ključeve i ne traži da se tajna lepi u chat: traži da stoji u .env.local.
Ako ništa ne fali, reci to u jednoj rečenici i kreni.
Diraj samo fajlove navedene uz taj red. Tuđu migraciju ne menjaj. Ne prelazi na sledeći red.
Kod na engleskom, interfejs na srpskom (latinica). Zod, ActionResult, stranica bez Supabase-a, komponenta bez Supabase-a, boje iz tokena teme.
Gotovo je tek kad je „gotovo kad“ zaista ispunjeno. npm run lint i npm test moraju da prođu.
Tada štikliraj samo taj red, iz [ ] u [x]. Druge redove ne dira.
Zatim jedan commit i jedan push na main: https://github.com/niklson20/DentAssist
Poruka je na engleskom, sa ID-em zadatka, na primer feat: scaffold next.js app (0.1).
U isti commit idu fajlovi tog zadatka i štikl u docs/plan-rada.md. Ne commituj .env.local, backups/ ni tajne.
Ako push ne prođe, stani i reci. Štikl nije na remote-u dok push ne prođe, jer je u istom commitu.
```

- Čita samo odeljak naveden uz zadatak, ne cele dokumente.
- Dira samo navedene fajlove. Tuđu migraciju ne menja. Ako šema ne pokriva slučaj, staje i prijavi.
- Pre bilo kog koda otvori tabelu statusa. Zadatak je prvi red odozgo čija je kolona Gotovo još `[ ]`. Ako takvog reda nema, reci da je plan gotov i stani.
- Gotov je kad piše „gotovo kad“ za taj red. Tada promeni samo taj `[ ]` u `[x]`. Druge redove ne dira. Ne prelazi na sledeći red. Štikl ide u isti commit kao fajlovi zadatka, pre pusha.
- Kod na engleskom, interfejs na srpskom (latinica). Zod, `ActionResult`, stranica bez Supabase-a, komponenta bez Supabase-a, boje iz tokena teme.
- U Cursoru, pre slanja, izaberi model iz kolone Model prvog reda koji je još `[ ]`. Jedan chat u jednom trenutku: sačekaj štikl, pa pošalji isti tekst ponovo.
- Jedan commit i jedan `git push` na `main` repozitorijuma [niklson20/DentAssist](https://github.com/niklson20/DentAssist). Poruka je engleski conventional commit sa ID-em, na primer `feat: scaffold next.js app (0.1)`. U commit idu fajlovi zadatka i štikl u `docs/plan-rada.md`. Ne idu `.env.local`, `backups/` ni tajne. Ako push ne prođe, štikl ostaje samo lokalno, u tom commitu.

Napomene u zadacima da neki poslovi smeju uporedo ne važe za ovaj tekst. Chat i dalje uzima samo prvi prazan red.

## Talas 0 — temelj

### 0.1 Skela

Čita: [Tech.md](./Tech.md) odeljke 1 i 2.

Next.js 16.2, React 19, TypeScript `strict`, prazne rute iz Tech odeljka 2, `.env.example`, `.gitignore` (`backups/`, `.env.local`), skripte `lint` i `test`. Fajlovi: koren projekta, prazni `app/**/page.tsx`. Ne uvodi šemu ni poslovnu logiku.

Gotovo kad `npm run dev` otvori prazan imenik.

### 0.2 Dizajn

Čita: [Tech.md](./Tech.md) odeljak 4.

shadcn preset `b37t58d3x`, tokeni u `app/globals.css`, školjka menija bez podataka. Fajlovi: `app/globals.css`, `app/layout.tsx`, `components/ui/**`.

Gotovo kad stranica koristi Zinc/Teal/Inter, bez heksa u komponenti.

Meni iz ovog zadatka obavija sve strane. To je privremena školjka. 2.D1 je skida sa javnih strana, 2.E1 je ostavlja uz kalendar ordinacije. Ovaj red se ne ponavlja.

### 0.3 Domen

Čita: [Tech.md](./Tech.md) odeljak 5, [PRD.md](./PRD.md) odeljke 6.3 i 8.2, [DB.md](./DB.md) odeljak 9.

Čiste funkcije i Vitest, bez baze: `lib/calendar-dates.ts`, `lib/slots.ts`, `lib/booking-deadline.ts`, `lib/labels.ts` (svi kodovi iz baze), `lib/slug.ts` i `lib/phone.ts` po Tech odeljku 12. Zona `Europe/Belgrade`, korak, razmak, preklapanje, 15. rođendan, rok koji preskače zatvoren dan.

Gotovo kad `npm test` prolazi i ne zavisi od današnjeg datuma.

### 0.4 Ugovori

Čita: [Tech.md](./Tech.md) odeljke 3 i 6.

`lib/action-result.ts`, potpisi `requireMember` / `requireOwner` / `requirePlatformAdmin` u `lib/auth.ts`, `lib/mail.ts` (`sendMail`), prazan `lib/schemas/`, `proxy.ts` sa matcherom. Skripte `db:migrate`, `db:backup`, `db:reset` koja odbija ref `iirzzaykgskjouzzvdrd`.

Gotovo kad zaštićene putanje iz Tech odeljka 6 ne puštaju anonimnog korisnika, a javne puštaju.

## Talas 1 — šema

Svaki chat piše jednu novu migraciju `supabase/migrations/<timestamp>_<opis>.sql` i politike samo za tabele koje sam doda. Ne otvara `app`. Gotovo za svaki chat kad se ta migracija primeni na test projekat `hmkxuvwpjvzekpvpmsuk`. Cela šema je gotova tek posle `1.11`.

### 1.1 Klinika

Čita: [DB.md](./DB.md) odeljke 3.1–3.4, 3.6–3.8 i pomoćne funkcije uloga iz odeljka 7 (`current_clinic_id`, `is_owner`, `is_dentist`, `is_reception`, `is_platform_admin`).

Tabele: `platform_admins`, `clinics`, `clinic_members`, `clinic_devices`, `appointment_types`, `working_hours`, `blocked_periods`. `clinics.default_appointment_type_id` sme biti null. `clinic_devices.secret_hash` je HMAC-SHA-256. Okidač `set_updated_at()` na tabelama koje imaju `updated_at`.

Gotovo kad je migracija primenjena na test projekat i anon nema `SELECT`.

### 1.2 Pozivnice

Čita: [DB.md](./DB.md) odeljke 3.5 i 3.9.

`clinic_invites`, `staff_invites`, `clinic_access_requests`. Mejl, `code_hash`, broj pokušaja i broj slanja na obe pozivnice. `ip_hash` na zahtevu. Jedinstven pending mejl. `anon` nema `SELECT`.

Gotovo kad je migracija primenjena na test projekat.

### 1.3 Pacijent

Čita: [DB.md](./DB.md) odeljke 4.1–4.5.

`patients`, `patient_contacts`, `patient_email_claims`, `patient_anamnesis`, `patient_alerts`. Pogled za recepciju bez `jmbg`.

### 1.4 Karton u bazi

Čita: [DB.md](./DB.md) odeljke 4.6, 4.7 i 6.

`tooth_states`, `tooth_state_changes`, `patient_files`, `audit_log`, okidači, pogled `audit_log_for_member`.

### 1.5 Termini

Čita: [DB.md](./DB.md) odeljke 5.3–5.5.

`appointments`, `appointment_offers`, `visits`, GiST isključenje, `assert_slot_grid()`.

### 1.6 Zahtev

Čita: [DB.md](./DB.md) odeljke 5.1, 5.2, 5.6 i 5.7.

`booking_requests` sa obaveznim `account_id` za online zahtev, `booking_links` (`offer`, `manage`) i `appointment_reminders` (`24h`, `2h`). Koda za termin nema.

Gotovo kad je migracija primenjena na test projekat.

### 1.7 Javno čitanje

Čita: [DB.md](./DB.md) odeljak 8, prve četiri funkcije.

`list_cities`, `search_clinics`, `get_clinic_public`. Bez slobodnih početaka.

### 1.8 Slotovi

Čita: [DB.md](./DB.md) odeljak 8 za `get_available_slots` i odeljak 9, stavka o slobodnom slotu.

Samo `get_available_slots`, i samo za ulogovan nalog. `anon` je ne zove. Radno vreme, pauza, blokada, nedostupnost, razmak, najava, horizont, zauzeti statusi.

Gotovo kad anon poziv ne vrati nijedan početak.

### 1.9 Javni upis

Čita: [DB.md](./DB.md) odeljak 8 za `request_clinic_access` i `create_booking`, i odeljak 5.8.

`request_clinic_access(email, city, ip_hash)` i `create_booking` iz DB odeljka 8. `create_booking` odbija anon, nepotvrđen mejl, zauzet slot i treći pending zahtev istog mejla ili kartona. Slot se drži kao `pending_confirmation`.

Gotovo kad anon poziv `create_booking` ne pravi red, a ulogovan potvrđen nalog pravi zahtev na test projektu.

### 1.10 Token i poslovi

Čita: [DB.md](./DB.md) odeljak 8, ostatak funkcija, i odeljak 7 za `merge_patients` i `save_visit`.

`choose_offer`, `decline_offers`, `reschedule_by_token`, `cancel_by_token`, `expire_booking_requests`, `purge_booking_request_pii`, `due_reminders`, `merge_patients`, `save_visit`. Prelazi su tabela u DB odeljku 5.8. `choose_offer` upisuje istu vezu naloga i kartona kao prihvat. Ponuda ne produžava rok i ne oslobađa traženi sat. Izbor jednog oslobađa traženi i ostale ponude. `save_visit` odbija izmenu posle 24 sata. Spajanje ostavlja anamnezu cilja.

Gotovo kad funkcije na test projektu prate tu tabelu i anon ne bira ponudu.

### 1.11 Seed i fajlovi

Čita: [Tech.md](./Tech.md) odeljke 8 i 10.

Bucketi `patient-files` i `clinic-logos`. Seed za test: dve ordinacije, vlasnik, stomatolog, recepcija, platform admin. Provera da `db:reset` odbija produkciju. Politike skladišta: recepcija ne dobija URL kartona, logo čita svako, piše ga vlasnik.

Gotovo kad bucketi postoje na test projektu i `db:reset` odbija produkcioni ref.

### 1.12 Nalozi pacijenata

Čita: [DB.md](./DB.md) odeljak 4.8.

`patient_accounts`, `patient_dependents`, `patient_chart_links`, `patient_link_invites`, `patient_email_challenges`. Nalog nema `clinic_id`. `anon` nema `SELECT`.

Gotovo kad je migracija primenjena na test projekat. Ovaj red u tabeli stoji pre `1.6`, jer zahtev nosi `account_id`.

## Talas 2

Zajednički dodir, da se ne čeka tuđi chat:

- Kalendar, dok Karton nije došao do `2.F5`, uvozi prazan tipiziran `VisitForm` iz svog foldera. Posle `2.F5` spajanje zameni uvoz.
- Javni tok piše kroz SQL funkcije. Osoblje piše kroz `app/actions/appointments.ts`.
- Samo Kalendar dopisuje blok `/* calendar-grid */` u `app/globals.css`. Samo Karton dopisuje `/* odontogram */`.

### 2.A0 Dva ulaza

Čita: [PRD.md](./PRD.md) pasus o dva ulaza u odeljku 1 i [Tech.md](./Tech.md) odeljak 6, tačku 1.

Fajlovi: `proxy.ts`, `proxy.test.ts`. Javni host služi imenik, `/ordinacije` i `/zakazivanje`. Host `dent.` služi `/prijava`, `/za-ordinacije`, `/danas`, `/pacijenti`, `/podesavanja`, `/statistika`, `/platforma` i `/poziv`. `/prijava`, `/za-ordinacije` i `/poziv` ne traže nalog, ali sa javnog hosta prelaze na `dent.`. Na `dent.` putanja `/` otvara prijavu samo dok niko nije prijavljen. Prijavljeno osoblje ide na `/danas`, platforma na `/platforma`, nalog koji je samo pacijent ostaje na prijavi. Strana osoblja na javnom hostu prelazi na `dent.`. Prijavljeno osoblje ili platforma koji otvore javni `/` idu na `dent.` i `/danas`, odnosno `/platforma`. Pacijent koji nije osoblje ostaje na imeniku. `/ordinacije` i `/zakazivanje` na `dent.` prelaze na javni host. `/lozinka` se ne preusmerava. `localhost` se ne preusmerava. Kolačić sesije važi na oba imena.

Gotovo kad test pokaže prelaz `/danas` sa javnog hosta na `dent.`, prelaz prijavljenog osoblja sa javnog `/` na `dent.` i `/danas`, prelaz `/ordinacije/slug` sa `dent.` na javni host, da `dent.` na `/` bez sesije nije imenik, i da `localhost` ostaje na istom originu.

### 2.A1 Prijava

Čita: [PRD.md](./PRD.md) odeljak 5, prva dva pasusa.

Fajlovi: `app/prijava`, `app/actions/auth.ts`, tela `requireMember`, `requireOwner`, `requirePlatformAdmin` u `lib/auth.ts`. Mejl, lozinka, „Zapamti me“ 90 dana, inače sesija do zatvaranja. Ne dira `proxy.ts`. Forma i „Zatražite pristup“ važe samo dok niko nije prijavljen. Ako je osoblje već prijavljeno, stranica ide na `/danas`. Platforma ide na `/platforma`. Nalog koji je samo pacijent vidi formu i ne ulazi u kalendar.

### 2.A1b Osvežavanje sesije

Čita: [Tech.md](./Tech.md) odeljak 6, tačka 1, prva rečenica.

Fajlovi: `proxy.ts`, `proxy.test.ts`, `lib/hosts.ts`, `lib/supabase/cookies.ts`. `proxy` je asinhron i pre rutiranja zove `getClaims()`. Osvežene kolačiće upisuje i na zahtev i na odgovor, uključujući svaki `redirect`. Domen i „Zapamti me“ ostaju isti kao pri prijavi. `/api/cron` se ne osvežava. Postojeći testovi preusmerenja ostaju bez mreže.

Gotovo kad zahtev sa isteklim pristupnim tokenom i važećim refresh tokenom dobije nove kolačiće, a zaštićena putanja bez refresh tokena i dalje ide na `/prijava`.

### 2.A2 Nova lozinka

Čita: [PRD.md](./PRD.md) odeljak 4.1, mejl „Nova lozinka“.

Fajlovi: `app/lozinka/[token]`, `app/actions/auth.ts`. Link važi sat. Osoblju link ide na `STAFF_URL`, pacijentu na `APP_URL`.

### 2.A3 Pozivnica ordinacije

Čita: [PRD.md](./PRD.md) odeljak 4.1, koraci 2–3.

Fajlovi: `app/poziv/[token]`, `app/actions/auth.ts`. Kod od 6 cifara, 7 dana, pet pokušaja, lozinka, vlasnik. `service_role` samo da napravi `auth.users`. Link u mejlu je na `STAFF_URL`.

### 2.A4 Pozivnica kolege

Čita: [PRD.md](./PRD.md) odeljak 4.1, pasus o pozivnici za kolegu.

Isti ekran `app/poziv/[token]`. Uloga stomatolog ili recepcija. Mejl „Poziv u {ordinacija}“.

### 2.A5 PIN

Čita: [PRD.md](./PRD.md) odeljak 5, recepcijski računar.

Fajlovi: `app/prijava`, `app/actions/pin.ts`. HttpOnly kolačić `clinic_device`, šest cifara, pet grešaka pa lozinka, posle 2 minuta povratak na imena, opozvan uređaj ne nudi imena. „Zapamti me“ ovde ne važi.

Gotovo kad opozvan uređaj ne nudi imena, a tačan PIN otvara sesiju tog člana.

### 2.B1 Zahtev za pristup

Čita: [PRD.md](./PRD.md) odeljak 4.1 korak 1 i kraj odeljka 11.1.

Fajlovi: `app/za-ordinacije`, `app/actions/platform.ts`. Mejl i grad, tri na sat, Turnstile posle previše slanja, poruka „Zahtev sa ove adrese već čeka.“

### 2.B2 Pozivnica platforme

Čita: [PRD.md](./PRD.md) odeljak 11.3, lista zahteva.

Fajlovi: `app/platforma`, `app/actions/platform.ts`, `lib/queries/platform.ts`. „Pošalji pozivnicu“ šalje mejl. „Odbaci“ ne šalje mejl.

### 2.B3 Gašenje

Čita: [PRD.md](./PRD.md) odeljak 10.

Fajlovi: `app/platforma`, `app/actions/platform.ts`. Lista ordinacija: firma, grad, status, nalozi. Gašenje skida imenik. Prijava javlja tekst iz odeljka 10. Bez kartona i bez broja termina.

### 2.C1 Školjka podešavanja

Čita: [PRD.md](./PRD.md) odeljak 11.2, tabela adresa.

Fajlovi: `app/podesavanja/page.tsx` i raspored. Recepcija vidi samo nalog. Stranicu naloga radi `2.C9`. PIN kapiju radi `2.C10`.

Gotovo kad recepcija vidi samo nalog, a vlasnik vidi spisak odeljaka.

### 2.C2 Profil ordinacije

Čita: [PRD.md](./PRD.md) odeljak 4.2 i red `/podesavanja/ordinacija` u 11.2.

Fajlovi: `app/podesavanja/ordinacija`, `app/actions/settings.ts`. Naziv, adresa, telefon, tekst, logo do 1 MB, javni link, prekidač online, korak, razmak, trajanje, najava i horizont. Nominatim jednom pri čuvanju adrese.

Gotovo kad se korak i horizont sačuvaju i javni link pokazuje `APP_URL` plus `/ordinacije/[slug]`.

### 2.C3 Osoblje

Čita: [PRD.md](./PRD.md) odeljke 3 i 4.1 o pozivnici kolege, i red `/podesavanja/osoblje`.

Fajlovi: `app/podesavanja/osoblje`. Poziv, nedostupnost, ko je na javnoj strani. Poslednji vlasnik ne izlazi dok ulogu ne preda. Prva pozivnica ne ide dok vlasnik nema PIN.

### 2.C4 Radno vreme

Čita: [PRD.md](./PRD.md) odeljak 4.4.

Fajlovi: `app/podesavanja/radno-vreme`. Vlasnik svačije, stomatolog svoje. Dani, sati, pauza.

### 2.C5 Tipovi

Čita: [PRD.md](./PRD.md) odeljak 4.5.

Fajlovi: `app/podesavanja/tipovi`. Dodavanje, preimenovanje, gašenje. Podrazumevani tip.

### 2.C6 Uređaji

Čita: [PRD.md](./PRD.md) odeljak 5, povezivanje uređaja, i red `/podesavanja/uredjaji`.

Fajlovi: `app/podesavanja/uredjaji`. Povezivanje i isključivanje recepcijskog računara. Bez PIN logike (`2.A5`).

### 2.C7 Pravni podaci

Čita: [PRD.md](./PRD.md) odeljak 4.1, pasus o PIB-u.

Fajlovi: `app/podesavanja/pravni-podaci`. PIB, matični broj, broj rešenja. Nisu javni.

### 2.C8 Vodič

Čita: [PRD.md](./PRD.md) odeljak 4.1, korak 4.

Fajlovi: `app/podesavanja`, vodič. Jedan korak po ekranu, podrazumevane vrednosti, tekst uslova. Korak „Pozovi stomatologa“ koristi akciju iz `2.C3`. Poslednji korak ostaje isključen dok niko ne prima pacijente. Prva pozivnica traži da vlasnik već ima PIN. Posle poslednjeg koraka ide `/danas`.

Gotovo kad vlasnik koji ne prima pacijente ne završi vodič dok ne pozove stomatologa, a završen vodič otvori `/danas`.

### 2.C9 Nalog osoblja

Čita: [PRD.md](./PRD.md) red `/podesavanja/nalog` u 11.2.

Fajlovi: `app/podesavanja/nalog`. Lozinka i prvo postavljanje PIN-a, za sve uloge. Ovde se PIN ne traži ponovo.

Gotovo kad član sačuva PIN i promeni lozinku.

### 2.C10 PIN kapija

Čita: [PRD.md](./PRD.md) odeljak 5, pasus o PIN-u na podešavanjima, i [Tech.md](./Tech.md) odeljak 6.

Fajlovi: `app/podesavanja`. Dok je vlasnik jedini član i nema neiskorišćenu pozivnicu, podešavanja se otvaraju bez PIN-a. Inače svaki ulazak osim `/podesavanja/nalog` traži PIN vlasnika, važi do odjave. Stomatolog i dalje otvara samo svoje radno vreme, bez tog PIN-a.

Gotovo kad drugi član natera vlasnika da unese PIN, a jedini vlasnik uđe bez njega.

### 2.D1 Imenik

Čita: [PRD.md](./PRD.md) odeljke 4.3 i 11.1, bez mape.

Fajlovi: `app/page.tsx`, `lib/queries/public.ts`, `app/layout.tsx`, `components/ui/app-menu.tsx`. Grad, pretraga naziva, kartice, prazan grad. Imenik nema prijavu, registraciju ni meni osoblja. Link „Za ordinacije“ vodi na `STAFF_URL`. Javne putanje `/`, `/ordinacije` i `/zakazivanje` nemaju meni osoblja. `/prijava` i `/za-ordinacije` takođe nemaju taj meni. Komponenta menija ostaje za `/danas`, `/pacijenti`, `/podesavanja`, `/statistika` i `/platforma`, dok 2.E1 ne stavi pravi meni ordinacije.

Gotovo kad `/` nema stavke Danas, Pacijenti, Podešavanja i Statistika, a `/danas` i dalje ima školjku menija.

### 2.D2 Mapa

Čita: [PRD.md](./PRD.md) odeljak 4.3, mapa, i [Tech.md](./Tech.md) odeljak 7, pasus o Leafletu.

Fajlovi: `app/page.tsx`. Leaflet, OpenStreetMap, „blizu mene“, lista i mapa jedna pored druge na širokom ekranu. Pin nije uslov za listu.

### 2.D3 Profil ordinacije

Čita: [PRD.md](./PRD.md) odeljke 4.2 i 11.1, ruta `/ordinacije/[slug]`.

Fajlovi: `app/ordinacije/[slug]`. Naziv, logo, adresa, telefon, tekst, stomatolozi. Nazad u imenik nema. Jedan je već izabran: poslednji na uređaju, inače prvi. Dok pacijent nije prijavljen, „Prijava“ i „Registracija“ stoje u gornjem desnom uglu. Na imeniku tih dugmadi nema.

Gotovo kad stranica nema put u imenik, pamti poslednjeg stomatologa na uređaju, i prijava je u uglu samo na ovoj strani.

### 2.D4 Slobodni počeci

Čita: [PRD.md](./PRD.md) odeljak 11.1, ista ruta, traka dana.

Fajlovi: `app/ordinacije/[slug]`. Traka dana do horizonta, samo slobodni počeci, „Nastavi“, samo za ulogovanog pacijenta. Dan bez termina: „Nema slobodnih termina ovog dana.“ Bez prijave umesto trake stoji „Prijavite se da vidite slobodne termine“.

Gotovo kad neprijavljen posetilac ne vidi nijedan početak, a ulogovan vidi traku dana.

### 2.D11 Prijava pacijenta

Čita: [PRD.md](./PRD.md) odeljak 7.7 i rute prijave u 11.1.

Fajlovi: `app/ordinacije/[slug]/prijava`, `app/ordinacije/[slug]/registracija`, `app/actions/patient-auth.ts`, telo `requirePatient` u `lib/auth.ts`. Mejl i lozinka odmah prave `auth.users`. `service_role` samo za taj red, pa prestane. Kod od 6 cifara, 10 minuta, pet pokušaja, tri slanja na sat, potvrđuje mejl. Posle prijave povratak na istu ordinaciju ili na sačuvani `stomatolog` i `pocetak`.

Gotovo kad nepotvrđen mejl ne prođe `requirePatient` za zahtev, a tačan kod potvrdi nalog.

### 2.D12 Deca i povezivanje

Čita: [PRD.md](./PRD.md) odeljak 7.7.

Fajlovi: `app/ordinacije/[slug]/deca`, `app/ordinacije/[slug]/povezi/[token]`, `app/actions/patient-account.ts`, dugme na kartonu deteta. Roditelj dodaje dete. Stomatolog ili vlasnik šalje „Poveži sa roditeljem“. Ime deteta se vidi na nalogu tek posle potvrde.

Gotovo kad nepotvrđen poziv ne pokaže ime deteta, a potvrđen doda dete na nalog.

### 2.D13 Termini pacijenta

Čita: [PRD.md](./PRD.md) rutu `/ordinacije/[slug]/termini` u 11.1 i [DB.md](./DB.md) funkciju `list_my_appointments`.

Fajlovi: `app/ordinacije/[slug]/termini`. Vreme, stomatolog i status. Bez razloga, zapisa i dokumenata. Tuđa ordinacija se ne lista.

Gotovo kad nalog vidi samo svoje termine ove ordinacije.

### 2.D5 Zakazivanje za sebe

Čita: [PRD.md](./PRD.md) odeljak 7.1 i korake 4–5 u odeljku 7.

Fajlovi: `app/ordinacije/[slug]/zakazivanje`, `app/actions/booking.ts`. Stranica zove `requirePatient()` i traži potvrđen mejl. Ako je nalog već vezan za karton te osobe u ovoj ordinaciji, polja identiteta se ne prikazuju. Inače polja redom, saglasnost, dugme „Pošalji zahtev“, forma puna iz naloga gde podaci već postoje. Ako nema 15 godina, prelazak na put za dete. Prvi zahtev uvek ima formu, jer karton nastaje tek kad ordinacija prihvati.

Gotovo kad neprijavljen i nepotvrđen mejl ne vide formu, ulogovan nalog bez kartona u ovoj ordinaciji vidi svoja polja, a nalog sa već vezanim kartonom ne vidi unos identiteta.

### 2.D6 Zakazivanje za dete

Čita: [PRD.md](./PRD.md) odeljak 7.2.

Isti fajlovi. Poseban pacijent, mejl ostaje na kontaktu, izjava staratelja. Ako je to dete već vezano za karton u ovoj ordinaciji, unos identiteta se preskače.

### 2.D7 Zahtev

Čita: [PRD.md](./PRD.md) odeljak 7, koraci 5–7, i [DB.md](./DB.md) odeljak 5.8.

Fajlovi: `app/ordinacije/[slug]/zakazivanje`, `app/actions/booking.ts`. „Pošalji zahtev“ zove `create_booking`. Zahtev postaje „Čeka potvrdu“. Ako je slot uzet, drugi početak bez novog koda. Kod se na ovom ekranu ne traži.

Gotovo kad ulogovan potvrđen nalog napravi zahtev, anon ne napravi, a zauzet slot vrati na slobodne početke.

### 2.D8 Ponuda

Čita: [PRD.md](./PRD.md) odeljke 7.3 i 7.4, stranica iz linka.

Fajlovi: `app/zakazivanje/[token]`. Traži ulogovan nalog čiji je mejl mejl zahteva. Do tri sata, „Potvrdi“, „Nijedan ne odgovara“.

Gotovo kad tuđi nalog i neprijavljen posetilac ne biraju ponudu.

### 2.D9 Pomeranje i otkaz

Čita: [PRD.md](./PRD.md) odeljak 7.4.

Isti fajl `app/zakazivanje/[token]`. Isti uslov prijave kao ponuda. Jedno pomeranje, otkaz do 24 sata. Posle toga samo telefon. Nevažeći link: tekstovi iz odeljka 7.4.

Gotovo kad pomeranje i otkaz rade samo ulogovanom mejlu tog zahteva, najkasnije 24 sata pre početka.

### 2.D10 Mejlovi pacijentu

Čita: [PRD.md](./PRD.md) odeljak 7.5, red „Primljen“. Podsetnike šalje zadatak `3.2`. Ostale naslove šalju `2.D11` i `2.E9`.

Fajlovi: `lib/mail.ts` i pozivi iz `app/actions/booking.ts`. Mejl „Zahtev je primljen“. Kod za registraciju šalje `2.D11`. Mejlove koje šalje osoblje šalje `2.E9`. Ordinacija ne dobija mejl.

Gotovo kad posle zahteva pacijent dobije mejl „Zahtev je primljen“.

### 2.E1 Školjka kalendara

Čita: [PRD.md](./PRD.md) odeljak 11.2, `/danas`.

Fajlovi: `app/danas/**`, školjka menija za `/danas`, `/pacijenti`, `/podesavanja` i `/statistika`. Meni iz PRD odeljka 11.2: Danas, Pacijenti, Podešavanja, Statistika (samo vlasnik) i odjava. Imenik, stranica ordinacije i `/platforma` nemaju ovaj meni. Datum, Dan/Nedelja/Mesec, URL (`prikaz`, `datum`, `stomatolog`, `sakrijOtkazane`). Otkazani sakriveni čim se ekran otvori.

### 2.E2 Dnevni prikaz

Čita: [PRD.md](./PRD.md) odeljak 6 i opis dana u 11.2.

Fajlovi: `app/danas/**`, blok `/* calendar-grid */` u `app/globals.css`. Kolone stomatologa, vreme vertikalno, osa sati ostaje pri pomeranju. Boje statusa iz tokena.

### 2.E3 Nedelja i mesec

Čita: [PRD.md](./PRD.md) odeljak 6, nedeljni i mesečni pregled, i 11.2.

Fajlovi: `app/danas/**`. Nedelja od ponedeljka, jedan stomatolog. Mesec je broj termina; klik otvara taj dan.

### 2.E4 Unos termina

Čita: [PRD.md](./PRD.md) odeljke 6.1 i 11.2, traka i novi termin.

Fajlovi: `app/danas/**`, `app/actions/appointments.ts`, `lib/queries/appointments.ts`. Novi: stomatolog, pacijent, početak, trajanje, tip, napomena. Ako pacijent nema 15 godina, forma traži kontakt. Van radnog vremena sme. Preko nedostupnosti i preko tuđeg termina ne sme. Raniji dan ne može.

Gotovo kad termin mlađi od 15 godina ne može da se sačuva bez kontakta, a odrasli može.

### 2.E5 Statusi

Čita: [PRD.md](./PRD.md) odeljak 6.2.

Fajlovi: `app/actions/appointments.ts`. Recepcija: nije došao i otkaz. Otkaz zakazanog termina traži poruku do 300 znakova. Završen: samo taj stomatolog i vlasnik. Završen otvara zapis. Optimistična promena statusa.

Gotovo kad otkaz zakazanog termina bez poruke ne prođe, a „nije došao“ prođe recepciji.

### 2.E6 Zahtevi

Čita: [PRD.md](./PRD.md) odeljak 7.3, prva dva izlaza, odeljak 7.6, i kolona na `/danas` u 11.2.

Fajlovi: `app/danas/**`, `app/actions/appointments.ts`. Kolona „Čeka potvrdu“. Vlasnik sve, stomatolog svoje, recepcija bez Prihvati, Odbij i Ponudi. Prihvati i odbij po pravilima iz 7.6, poruka do 300 znakova. „Isti karton“ i „Drugi pacijent“ kad pravilo tako kaže. Prihvat upisuje vezu naloga i kartona u toj ordinaciji (`patient_chart_links`). Tu vezu 2.D5 čita da preskoči unos identiteta. Odbijanje vezu ne pravi. Baza odbija tuđi zahtev stomatologu.

Gotovo kad prihvat bez poklapanja otvori karton i veže nalog, a tuđi mejl stane na izbor kartona i ne pokaže tuđe ime pacijentu.

### 2.E7 Ponuda iz kalendara

Čita: [PRD.md](./PRD.md) odeljak 7.3, dugme Ponudi.

Fajlovi: `app/danas/**`. Do tri slobodna početka, redosled dodavanja, „Pošalji ponudu“. Povratak bez slanja ne menja zahtev. Traženi sat ostaje zauzet.

Gotovo kad ponuda drži traženi sat i do tri nova, a povratak bez slanja ne menja zahtev.

### 2.E9 Mejlovi osoblja

Čita: [PRD.md](./PRD.md) odeljak 7.5, naslove Potvrđen, Odbijen, Otkazan, Ponuda i Novi sat.

Fajlovi: `lib/mail.ts` i pozivi iz `app/actions/appointments.ts`. Ordinacija ne dobija mejl. Podsetnike i istek šalje talas 3.

Gotovo kad prihvat, odbijanje, ponuda, otkaz osoblja i promena sata pošalju tačan naslov.

### 2.E11 Blokade

Čita: [PRD.md](./PRD.md) odeljak 4.4, pojedinačna blokada.

Fajlovi: `app/danas/**`, `app/actions/appointments.ts`. Blokada za stomatologa i dan koji se gledaju. Online je ne vidi. Osoblje sme preko nje. Preko nedostupnosti ne sme.

Gotovo kad blokada skloni početak sa javne strane, a osoblje i dalje sačuva termin preko nje.

### 2.E12 Izmena termina

Čita: [PRD.md](./PRD.md) odeljak 6, pasus o izmeni, i 7.4.

Fajlovi: `app/danas/**`, `app/actions/appointments.ts`. Ista forma kao unos. Promena sata šalje mejl. Sama promena stomatologa ne šalje. Promena oba šalje jer se menjao sat.

Gotovo kad promena sata pravi mejl, a sama promena stomatologa ne pravi.

### 2.E8 Telefon

Čita: [PRD.md](./PRD.md) odeljak 11.2, pasus o telefonu.

Fajlovi: `app/danas/**`. Zahtevi prvi tab. Kalendar: jedan dan, jedan stomatolog, lista. Donja traka: Zahtevi, Kalendar, Pacijenti, Još.

### 2.F1 Lista pacijenata

Čita: [PRD.md](./PRD.md) odeljak 8, pretraga.

Fajlovi: `app/pacijenti`, `lib/queries/patients.ts`. Pretraga po imenu, prezimenu i telefonu. JMBG nije u pretrazi. Isti ime i prezime traže potvrdu, unos nije zabranjen.

### 2.F2 Pregled kartona

Čita: [PRD.md](./PRD.md) odeljak 8, zaglavlje, i 8.1.

Fajlovi: `app/pacijenti/[slug]`. Zaglavlje: ime, uzrast, telefon, upozorenje. Kartice Pregled, Istorija, Anamneza, Zubi. Recepcija vidi Pregled i Istoriju, bez upozorenja i JMBG-a. Pol, adresa, beleška.

### 2.F3 Istorija

Čita: [PRD.md](./PRD.md) odeljak 8.3.

Fajlovi: `app/pacijenti/[slug]`. Termini po godinama, najnoviji prvi. Status, stomatolog, datum.

### 2.F4 Anamneza i upozorenje

Čita: [PRD.md](./PRD.md) odeljak 8.1.

Fajlovi: `app/actions/patients.ts`. Jedan red anamneze. Upozorenje: šifra i kratak tekst, vidi se i u traci termina.

### 2.F5 Zapis posete

Čita: [PRD.md](./PRD.md) odeljak 8.4.

Fajlovi: `app/actions/visits.ts` i `VisitForm`. Jedan po terminu. Četiri polja, nijedno obavezno. Zaključan 24 sata od kraja. Vlasnik rok ne otvara. Završen bez zapisa je označen.

### 2.F6 Zubna mapa

Čita: [PRD.md](./PRD.md) odeljak 8.5.

Fajlovi: `app/pacijenti/[slug]`, blok `/* odontogram */` u `app/globals.css`. FDI, obe vilice, statusi, površine samo za karijes i plombu, istorija ispod mape.

### 2.F7 Dokumenti

Čita: [PRD.md](./PRD.md) odeljak 8.7 i [Tech.md](./Tech.md) odeljak 8.

Fajlovi: `app/actions/files.ts`. Dijalog, ne stranica. JPEG, PNG, WebP, PDF, 10 MB, potpisani URL. Izmena i brisanje 24 sata od uploada. Recepcija ne dobija URL.

### 2.F8 Spajanje

Čita: [PRD.md](./PRD.md) odeljak 8.6.

Fajlovi: `app/actions/patients.ts`. Samo vlasnik. Ostaje karton na kome je radnja krenula. Izvor izlazi iz pretrage i ne briše se.

### 2.F9 Mejl na dolasku

Čita: [PRD.md](./PRD.md) odeljak 8.2 i 7.6, pasus o dolasku.

Fajlovi: `app/pacijenti/[slug]`, `app/danas`. Zadatak „Unesite mejl pacijenta“ na 15. rođendan, na kartonu i na `/danas`. Potvrda mejla i kontakta pre zapisa. „Nema mejl“ gasi zadatak. Mejl roditelja se ne upisuje u mejl deteta.

Gotovo kad karton sa kontaktom i praznim mejlom, na dan 15. rođendana, pokaže zadatak i na kartonu i na `/danas`.

## Talas 3

### 3.1 Istek zahteva

Čita: [Tech.md](./Tech.md) odeljak 7, cron.

Fajlovi: `app/api/cron`. Zahtev bez `Authorization: Bearer <CRON_SECRET>` dobija 401. Zove `expire_booking_requests()` i `purge_booking_request_pii()`.

### 3.2 Podsetnici

Čita: [Tech.md](./Tech.md) odeljak 7, podsetnici, i [PRD.md](./PRD.md) odeljak 7.5, poslednja dva reda tabele mejlova.

Fajlovi: ista cron ruta, `lib/mail.ts`. `due_reminders()`, zapis u `appointment_reminders`, ne šalje dvaput, ne šalje ako je trenutak prošao u času potvrde. Mejlovi „24 sata pre“ i „2 sata pre“.

### 3.3 Statistika

Čita: [PRD.md](./PRD.md) odeljak 9.

Fajlovi: `app/statistika`. Samo vlasnik. Mesec u zoni Beograda, tabela po stomatologu. Platforma upit nema.

### 3.4 Izvoz

Čita: [PRD.md](./PRD.md) odeljak 9 i [Tech.md](./Tech.md) odeljak 9.

Fajlovi: `app/actions/export.ts`. ZIP sa CSV: pacijenti, kontakti, termini, zapisi, anamneza, mapa. Bez RTG i PDF.

### 3.E1 Izolacija dve ordinacije

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 1.

Playwright na test bazi, nikad na produkciji. Član prve ordinacije ne vidi pacijenta druge. Platforma ne vidi karton. Test ne zavisi od današnjeg datuma.

### 3.E2 Zahtev i ponude

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 2.

Playwright. Pregled bez prijave ne pokazuje slobodne termine i ne šalje zahtev. Potvrda mejla, zahtev, prihvat, odbijanje, tri ponude, „nijedan ne odgovara“.

### 3.E3 Dete i 15. rođendan

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 3.

Playwright. Karton deteta, mejl na kontaktu, zadatak na 15. rođendan.

### 3.E4 Recepcija

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 4.

Playwright. Recepcija ne otvara zapis ni dokument i ne završava termin.

### 3.E5 Preklapanje

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 5.

Playwright. Preklapanje istog stomatologa se odbija. Dva stomatologa u isti sat prolaze.

### 3.E6 Nalog i vrata

Čita: [Tech.md](./Tech.md) odeljak 11, tačka 6.

Playwright na test bazi. Neprijavljen posetilac ne vidi slobodan početak i ne pošalje zahtev. Ulogovan roditelj zakaže sačuvano dete. Stranica ordinacije nema put u imenik. `/termini` ne pokazuje termin druge ordinacije.
