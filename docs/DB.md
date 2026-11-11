# DB.md — Šema baze podataka

Izvor istine za strukturu baze. Pre kreiranja ili izmene bilo koje tabele, pročitaj ovaj dokument.
Ako promena nije opisana ovde, prvo se dopunjuje dokument, pa onda piše migracija.

Povezano: [`PRD.md`](./PRD.md) (šta proizvod radi), [`Tech.md`](./Tech.md) (kako je aplikacija
sastavljena).

Stara šema jedne ordinacije i jednog administratora više ne važi. Ovaj dokument je nova šema.

---

## 1. Osnovne odluke

| Odluka | Vrednost |
| --- | --- |
| Baza | PostgreSQL (Supabase) |
| Šema | `public` |
| Jezik imenovanja | **isključivo engleski** — tabele, kolone, ograničenja, indeksi, funkcije |
| Jezik vrednosti | **isključivo engleski kodovi**; srpski nazivi se mapiraju u aplikaciji |
| Imena tabela | množina, `snake_case` |
| Primarni ključevi | `uuid`, `default gen_random_uuid()`, osim gde piše drugačije |
| Vreme | `timestamptz`, uvek u UTC; prikaz i unos u `Europe/Belgrade` radi aplikacija |
| Datum bez vremena | `date` |
| Nabrajanja | `text` + `CHECK`, ne Postgres `ENUM` |
| Meke izmene | svaka tabela ima `created_at` i `updated_at`, osim dnevnika i jednokratnih tokena |
| Izolacija | svaki klinički red nosi `clinic_id` |
| Brisanje kartona | pacijent se ne briše; strani ključevi ka `patients` koriste `ON DELETE RESTRICT` |
| Evidencija | `audit_log` pune okidači, ne aplikacija |
| Binarni fajlovi | bucket `patient-files`; metapodaci u `patient_files` |
| Javni ključ | `anon` ne čita tabele; javni tok ide kroz funkcije iz odeljka 8 |

---

## 2. Pregled

```
platform_admins
clinic_invites
clinic_access_requests

clinics
  ├── clinic_members ── clinic_devices (PIN sesija je u aplikaciji; uređaj je ovde)
  ├── staff_invites
  ├── appointment_types
  ├── working_hours          po stomatologu
  ├── blocked_periods        po stomatologu
  ├── patients
  │     ├── patient_contacts
  │     ├── patient_anamnesis
  │     ├── patient_alerts
  │     ├── tooth_states ── tooth_state_changes
  │     ├── appointments ── visits
  │     │                └── appointment_offers
  │     └── patient_files
  ├── booking_requests       dok zahtev čeka; drži identitet pre kartona
  ├── booking_links
  └── appointment_reminders

patient_accounts             nisu član ordinacije
  ├── patient_dependents
  ├── patient_email_challenges
  └── patient_chart_links
patient_link_invites

audit_log
```

Jedan `auth.users` red ima najviše jedan red u `clinic_members` (`user_id` je jedinstven).
Isti red sme da ima i `patient_accounts`. Platforma nema red u `clinic_members`.

---

## 3. Platforma i ordinacija

### 3.1 `platform_admins`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `user_id` | `uuid` PK | `auth.users.id` |
| `created_at` | `timestamptz` | |

Nema politike za `authenticated` čitanje tuđih kartona. Red se dodaje ručno, van aplikacije.

### 3.2 `clinics`

| Kolona | Tip | Null | Opis |
| --- | --- | --- | --- |
| `id` | `uuid` | ne | PK |
| `name` | `text` | ne | |
| `slug` | `text` | ne | jedinstven, stabilan, javni URL |
| `city` | `text` | ne | grad u Srbiji |
| `address` | `text` | ne | |
| `latitude`, `longitude` | `double precision` | da | pin na mapi, iz adrese |
| `phone` | `text` | ne | javni telefon |
| `logo_path` | `text` | da | putanja u bucketu `clinic-logos` |
| `description` | `text` | da | kratak tekst, do 500 znakova |
| `tax_id` | `text` | da | PIB, nije javan |
| `registration_number` | `text` | da | matični broj, nije javan |
| `license_number` | `text` | da | broj rešenja, nije javan |
| `slot_minutes` | `smallint` | ne | `15` ili `30` |
| `buffer_minutes` | `smallint` | ne | `0`, `5`, `10` ili `15` |
| `default_duration_min` | `smallint` | ne | umnožak koraka, 15–120 |
| `min_notice_minutes` | `int` | ne | najmanja najava |
| `max_ahead_days` | `int` | ne | koliko dana unapred |
| `online_booking_enabled` | `boolean` | ne | prekidač za celu ordinaciju, podrazumevano `false` dok podešavanje nije gotovo |
| `default_appointment_type_id` | `uuid` | da | aktivni tip te ordinacije; null dok tip ne postoji |
| `setup_completed_at` | `timestamptz` | da | kad sme u imenik |
| `terms_accepted_at` | `timestamptz` | da | |
| `status` | `text` | ne | `active` ili `disabled` |
| `created_at`, `updated_at` | `timestamptz` | ne | |

`slug` se ne menja. U imeniku je ordinacija kojoj je `status = active`, `setup_completed_at`
popunjen i `online_booking_enabled = true`.

### 3.3 `clinic_members`

| Kolona | Tip | Null | Opis |
| --- | --- | --- | --- |
| `id` | `uuid` | ne | PK |
| `clinic_id` | `uuid` | ne | FK |
| `user_id` | `uuid` | ne | jedinstven u celoj tabeli |
| `role` | `text` | ne | `owner`, `dentist`, `reception` |
| `sees_patients` | `boolean` | ne | vlasnik koji prima pacijente; kod stomatologa uvek `true` |
| `listed_online` | `boolean` | ne | `false` sakriva stomatologa sa javne strane |
| `first_name`, `last_name` | `text` | ne | |
| `unavailable` | `boolean` | ne | podrazumevano `false` |
| `pin_hash` | `text` | da | otisak PIN-a od 6 cifara |
| `created_at`, `updated_at` | `timestamptz` | ne | |

Jedinstven par `(clinic_id, user_id)` je suvišan uz jedinstven `user_id`, ali ostaje da se
članstvo čita po ordinaciji. Stomatolog na javnoj strani je član kome je
`sees_patients` i `listed_online` i nije `unavailable`. Recepcija ima `sees_patients = false`.

Poslednji `owner` u ordinaciji ne može da se obriše ni da promeni ulogu dok drugi član
nije `owner`. To radi aplikacija u transakciji, ne jedan `CHECK`.

### 3.4 `clinic_devices`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `clinic_id` | `uuid` | |
| `label` | `text` | npr. recepcija |
| `enrolled_by` | `uuid` | član |
| `secret_hash` | `text` | HMAC-SHA-256 tajne iz kolačića `clinic_device` |
| `revoked_at` | `timestamptz` | null dok važi |
| `created_at` | `timestamptz` | |

### 3.5 `clinic_invites` i `staff_invites`

Obe čuvaju samo otisak tokena i Argon2id otisak koda. Sirow token i sirov kod se ne upisuju.

`clinic_invites`: `id`, `email`, `token_hash`, `code_hash`, `attempt_count`, `send_count`,
`last_sent_at`, `expires_at`, `used_at`, `clinic_id` null dok se ne iskoristi,
`created_by` platform admin, `created_at`.

`staff_invites`: `id`, `clinic_id`, `email`, `role` (`dentist` ili `reception`), `first_name`,
`last_name`, `token_hash`, `code_hash`, `attempt_count`, `send_count`, `last_sent_at`,
`expires_at`, `used_at`, `created_by`, `created_at`.

Rok je 7 dana. Pet pogrešnih kodova gasi pozivnicu. Ponovno slanje sa stranice ide najviše
tri puta na sat. Iskorišćen token ne važi drugi put. Grad za vodič čita se sa zahteva koji
pokaže na ovu pozivnicu, ne sa pozivnice.

### 3.6 `appointment_types`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `id` | `uuid` | |
| `clinic_id` | `uuid` | |
| `name` | `text` | naziv koji je vlasnik uneo |
| `sort_order` | `int` | |
| `active` | `boolean` | ugašen tip se ne nudi, stari termini ga zadržavaju |
| `created_at`, `updated_at` | `timestamptz` | |

`clinics.default_appointment_type_id` pokazuje na aktivan tip te ordinacije i sme biti null
dok prvi tip nije dodat.

### 3.7 `working_hours`

Jedan red po stomatologu i danu (`iso_dow` 1–7, ponedeljak je 1). Jedinstven
`(clinic_member_id, iso_dow)`.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `clinic_id` | `uuid` | mora da se poklopi sa članom |
| `clinic_member_id` | `uuid` | stomatolog |
| `iso_dow` | `smallint` | |
| `is_closed` | `boolean` | |
| `opens_at`, `closes_at` | `time` | null kad je zatvoreno |
| `break_starts_at`, `break_ends_at` | `time` | oba null ili oba set; pauza unutar radnog vremena |

### 3.8 `blocked_periods`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `clinic_id` | `uuid` | |
| `clinic_member_id` | `uuid` | |
| `starts_at`, `ends_at` | `timestamptz` | |
| `reason` | `text` | interno, opciono |

Online ih preskače. Osoblje sme da zakaže preko blokade. Nedostupnost člana nije blokada:
dok je `unavailable`, novi termin se ne upisuje ni iz aplikacije ni sa javne strane.

### 3.9 `clinic_access_requests`

Zahtev sa `/za-ordinacije`, pre pozivnice. Nema `clinic_id`: ordinacija još ne postoji.

| Kolona | Tip | Null | Opis |
| --- | --- | --- | --- |
| `id` | `uuid` | ne | PK |
| `email` | `text` | ne | |
| `city` | `text` | ne | ukucan grad, nije strani ključ |
| `status` | `text` | ne | `pending`, `invited`, `dismissed` |
| `clinic_invite_id` | `uuid` | da | popunjen kad platforma pošalje pozivnicu |
| `dismissed_at` | `timestamptz` | da | |
| `created_at`, `updated_at` | `timestamptz` | ne | |

Jedinstven je `lower(email)` gde je `status = pending`. Dok postoji neiskorišćena i
neistekla pozivnica za taj mejl, novi red se ne upisuje. `anon` nema `SELECT`. Upis ide
kroz `request_clinic_access(email, city, ip_hash)`. `ip_hash` je HMAC-SHA-256, ne sirova
adresa. Čita i menja samo platforma.

---

## 4. Pacijenti i karton

### 4.1 `patients`

| Kolona | Tip | Null | Opis |
| --- | --- | --- | --- |
| `id` | `uuid` | ne | |
| `clinic_id` | `uuid` | ne | |
| `first_name`, `last_name` | `text` | ne | |
| `slug` | `text` | ne | jedinstven u ordinaciji, ne menja se |
| `email` | `text` | da | mejl **pacijenta**, ne roditelja |
| `email_declined` | `boolean` | ne | `Nema mejl` posle 15. rođendana |
| `phone` | `text` | da | |
| `date_of_birth` | `date` | da | obavezan za javni unos; telefonski unos odraslog sme bez njega |
| `sex` | `text` | da | `male` ili `female` |
| `address` | `text` | da | |
| `jmbg` | `text` | da | opciono, nije u pretrazi |
| `note` | `text` | da | |
| `merged_into_id` | `uuid` | da | karton koji je progutan; izlazi iz pretrage |
| `created_at`, `updated_at` | `timestamptz` | ne | |

Jedinstven `(id, clinic_id)`. Jedinstven `(clinic_id, slug)`.
Jedinstven `(clinic_id, lower(email))` gde mejl nije null: dva odrasla u istoj ordinaciji
ne dele mejl pacijenta. Mejl roditelja nije u ovoj koloni, pa više dece sme da ima
istog roditelja.

JMBG, ako je unet, ima 13 cifara. Ne pravi se jedinstven indeks: isti broj ne sme da se
nađe pretragom, a ispravku duplog unosa radi vlasnik spajanjem.

### 4.2 `patient_contacts`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `patient_id`, `clinic_id` | `uuid` | složeni FK na pacijenta |
| `relationship` | `text` | `mother`, `father`, `guardian`, `grandmother`, `grandfather`, `other_relative` |
| `first_name`, `last_name` | `text` | |
| `phone` | `text` | |
| `email` | `text` | |
| `confirmed_at` | `timestamptz` | null dok se na dolasku ne potvrdi novi kontakt |

### 4.3 `patient_email_claims`

Mejl koji čeka potvrdu na dolasku. Ne upisuje se u `patients.email` dok status ne postane
`confirmed`.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `patient_id`, `clinic_id` | `uuid` | |
| `appointment_id` | `uuid` | |
| `email` | `text` | |
| `status` | `text` | `pending`, `confirmed`, `rejected` |
| `resolved_by` | `uuid` | član |
| `resolved_at` | `timestamptz` | |

### 4.4 `patient_anamnesis`

Najviše jedan red po pacijentu. `chronic_conditions`, `medications`, `allergies`,
`pregnancy`, svi `text` i nullable. `clinic_id` se poklapa sa pacijentom.

### 4.5 `patient_alerts`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `code` | `text` | `drug_allergy`, `pregnancy`, `coagulation`, `other` |
| `note` | `text` | kratak tekst, obavezan |
| `patient_id`, `clinic_id` | `uuid` | |

### 4.6 `tooth_states` i `tooth_state_changes`

`tooth_states` je trenutno stanje. Jedinstven `(patient_id, fdi_code)`.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `fdi_code` | `text` | `11`–`18`, `21`–`28`, `31`–`38`, `41`–`48`, `51`–`55`, `61`–`65`, `71`–`75`, `81`–`85` |
| `status` | `text` | `healthy`, `unerupted`, `caries`, `filling`, `crown`, `root_canal`, `missing`, `implant`, `to_extract`, `fracture` |
| `surfaces` | `jsonb` | null, ili skup od `occlusal`, `lingual`, `vestibular`, `mesial`, `distal`; dozvoljeno samo za `caries` i `filling` |

`tooth_state_changes`: `tooth_state_id`, `clinic_id`, `old_status`, `new_status`,
`old_surfaces`, `new_surfaces`, `visit_id` null, `changed_by`, `changed_at`.
Okidač na `tooth_states` piše ovu istoriju. Aplikacija ne insertuje istoriju ručno
pri čuvanju statusa/površina. Brisanje poslednje izmene ide kroz
`revert_tooth_change(p_change_id)`: vraća `tooth_states` na `old_status` /
`old_surfaces` (ako je `old_status` null → `healthy` i surfaces null), briše taj
history red, i ne dodaje novi (`app.skip_tooth_history`). Samo najnoviji red po
zubu; vlasnik/stomatolog. `authenticated` nema direktan `DELETE` na
`tooth_state_changes`.

### 4.7 `patient_files`

Isto kao ranije (naslov, kategorija, datum snimanja, putanja, MIME, veličina do 10 MB),
plus obavezan `clinic_id`. Putanja u skladištu: `{clinic_id}/{patient_id}/{file_id}.{ext}`.
Kategorije: `xray`, `photo`, `report`, `other`. MIME: JPEG, PNG, WebP, PDF.
Izmena naslova, kategorije i datuma, i brisanje, odbijaju se 24 sata posle `created_at`.
To radi baza. Sadržaj fajla se ne menja.

### 4.8 Nalog pacijenta

Nalog nije član ordinacije i nema `clinic_id`. `anon` nema `SELECT` ni ovde.

`patient_accounts`: `id`, `user_id` jedinstven, `first_name`, `last_name`, `email`,
`phone` null dok se prvi put ne sačuva, `date_of_birth` null dok se prvi put ne sačuva,
`email_confirmed_at` null dok kod ne prođe, `created_at`, `updated_at`. Jedinstven je
`lower(email)`.

`patient_dependents`: `id`, `account_id`, `first_name`, `last_name`, `date_of_birth`,
`relationship` kao na kontaktu, `created_at`, `updated_at`.

`patient_chart_links`: `id`, `clinic_id`, `patient_id`, `account_id`, `dependent_id`
null kad je veza odrasli lično, `confirmed_at`, `created_at`. Jedinstven par
`(clinic_id, patient_id)`.

`patient_link_invites`: `id`, `clinic_id`, `patient_id`, `email`, `token_hash`,
`expires_at` 7 dana, `confirmed_at`, `created_by`, `created_at`. Sirow token se ne čuva.

`patient_email_challenges`: kod za potvrdu mejla pri registraciji, ne pri svakom terminu.
`id`, `email`, `code_hash` Argon2id, `expires_at` 10 minuta, `attempt_count`,
`ip_hash`, `consumed_at`, `created_at`. Red se nađe po mejlu, pa se kod proveri.
Posle pet pogrešnih više ne važi.

---

## 5. Termini i zahtevi

### 5.1 Kod za termin

Kod se ne traži pri zakazivanju. Zahtev nastaje samo za ulogovan nalog kome je
`email_confirmed_at` popunjen. Potvrda mejla je `patient_email_challenges` u 4.8.

### 5.2 `booking_requests`

Identitet dok karton ne postoji ili dok se poklapanje ne potvrdi. Posle prihvatanja
pokazuje na pacijenta i termin.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `clinic_id` | `uuid` | |
| `dentist_id` | `uuid` | član |
| `account_id` | `uuid` | nalog pacijenta; obavezan za online zahtev |
| `booker_email` | `text` | mejl tog naloga |
| `for_child` | `boolean` | |
| `patient_first_name`, `patient_last_name` | `text` | |
| `patient_date_of_birth` | `date` | |
| `patient_phone` | `text` | telefon odraslog; za dete je null, telefon je na kontakt poljima |
| `contact_relationship` | `text` | null kad je termin za sebe |
| `contact_first_name`, `contact_last_name`, `contact_phone` | `text` | |
| `reason` | `text` | |
| `suggested_patient_id` | `uuid` | predlog poklapanja, sme biti null |
| `patient_id` | `uuid` | popunjava se pri prihvatanju |
| `appointment_id` | `uuid` | termin koji drži traženi slot |
| `status` | `text` | `pending`, `accepted`, `rejected`, `expired`, `declined_by_patient` |
| `patient_note` | `text` | opciona poruka ordinacije pri odbijanju |
| `expires_at` | `timestamptz` | ranije od 24 radna sata stomatologa i početka |
| `pii_purged_at` | `timestamptz` | posle 90 dana identitet se briše, status ostaje |

### 5.3 `appointments`

| Kolona | Tip | Null | Opis |
| --- | --- | --- | --- |
| `id` | `uuid` | ne | |
| `clinic_id` | `uuid` | ne | |
| `dentist_id` | `uuid` | ne | član koji vidi pacijente |
| `patient_id` | `uuid` | da | obavezan čim status nije `pending_confirmation` ni `offered` ni `cancelled` |
| `booking_request_id` | `uuid` | da | |
| `starts_at`, `ends_at` | `timestamptz` | ne | |
| `appointment_type_id` | `uuid` | ne | |
| `status` | `text` | ne | `pending_confirmation`, `offered`, `scheduled`, `completed`, `no_show`, `cancelled` |
| `source` | `text` | ne | `patient` ili `staff` |
| `note` | `text` | da | |
| `cancelled_by` | `text` | da | `patient`, `staff`, `system` |
| `cancellation_note` | `text` | da | obavezna kad osoblje otkaže `scheduled` |
| `patient_reschedule_count` | `smallint` | ne | 0 ili 1 |
| `confirmed_at` | `timestamptz` | da | |
| `confirmed_by` | `uuid` | da | |
| `created_at`, `updated_at` | `timestamptz` | ne | |

Trajanje je između koraka ordinacije i 120 minuta, i deljivo je korakom. Početak je
poravnat na korak u zoni Beograda. Pošto `CHECK` ne ume da pročita korak druge tabele
bez funkcije, poravnanje i korak proverava funkcija `assert_slot_grid()` koju zovu
upis termina i javne funkcije. Preklapanje je ograničenje:

```sql
exclude using gist (
  dentist_id with =,
  tstzrange(starts_at, ends_at) with &&
) where (status <> 'cancelled')
```

`pending_confirmation`, `offered`, `scheduled`, `completed` i `no_show` drže slot.
Razmak između termina nije deo ovog ograničenja: javni predlog početka ga uračuna,
osoblje sme da zakaže bez razmaka.

Jedinstven `(id, clinic_id, patient_id)` gde pacijent nije null, radi složenog ključa iz
`visits`.

### 5.4 `appointment_offers`

Do tri reda po zahtevu. Svaki ima svoj `appointment_id` u statusu `offered`.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `booking_request_id` | `uuid` | |
| `appointment_id` | `uuid` | slot koji se drži |
| `position` | `smallint` | 1–3 |

### 5.5 `visits`

Najviše jedan po terminu. Kolone ostaju: `procedure_description`, `recommendations`,
`treatment_plan`, `internal_notes`, `recorded_at`. Obavezni su `clinic_id` i uslov da
se `patient_id` poklopi sa terminom, istim složenim stranim ključem kao ranije.
Upis ide kroz `save_visit`, samo kad je status `completed`. Funkcija odbija izmenu
24 sata posle `ends_at` termina. Vlasnik taj rok ne otvara.

### 5.6 `booking_links`

Jedan aktivan link po svrsi i zahtevu. Novi mejl iste svrhe gasi prethodni link.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `clinic_id` | `uuid` | |
| `booking_request_id` | `uuid` | |
| `purpose` | `text` | `offer` ili `manage` |
| `token_hash` | `text` | HMAC-SHA-256, jedinstven |
| `expires_at` | `timestamptz` | |
| `revoked_at` | `timestamptz` | null dok važi |
| `created_at` | `timestamptz` | |

Delimično jedinstven `(booking_request_id, purpose)` gde je `revoked_at` null.
`offer` važi dok pacijent ne izabere, ne odbije ili rok ne istekne. `manage` nastaje
kad termin postane `scheduled` i služi za pomeranje i otkaz. Sirow token ima 32 bajta
i ne čuva se.

### 5.7 `appointment_reminders`

| Kolona | Tip | Opis |
| --- | --- | --- |
| `appointment_id` | `uuid` | |
| `clinic_id` | `uuid` | |
| `kind` | `text` | `24h` ili `2h` |
| `sent_at` | `timestamptz` | |

Primarni ključ je `(appointment_id, kind)`. Isti podsetnik ne ide dvaput.

### 5.8 `appointment_reviews`

Jedan red po terminu. Pacijent ocenjuje ordinaciju od 1 do 5, a stomatologa može
opciono da oceni posebno.

| Kolona | Tip | Opis |
| --- | --- | --- |
| `appointment_id` | `uuid` | primarni ključ i termin |
| `clinic_id` | `uuid` | ordinacija termina |
| `dentist_id` | `uuid` | stomatolog termina |
| `patient_user_id` | `uuid` | potvrđen nalog pacijenta; nije javan |
| `clinic_rating` | `smallint` | obavezno, 1–5 |
| `dentist_rating` | `smallint` | opciono, 1–5 |
| `created_at`, `updated_at` | `timestamptz` | |

Tabela nema javni `SELECT`. `submit_appointment_review` proverava potvrđen nalog,
vlasništvo nad terminom po mejlu, status `completed` i da je termin prošao. Isti
nalog može da izmeni svoju ocenu, ali tuđi red ne može. Prosek i broj ocena računaju
se pri čitanju; ne čuvaju se kao kolone. `get_clinic_rating_details(clinic_id,
dentist_id)` vraća ime naloga koji je ocenio, ocene i datum termina isključivo
vlasniku te ordinacije; ne vraća mejl, komentar niti druge kontakt podatke.

### 5.9 Prelazi zahteva

Traženi termin ostaje zauzet kad se pošalje ponuda. Ponuda ne menja `expires_at`.

| Događaj | Traženi termin | Ponude | Zahtev |
| --- | --- | --- | --- |
| `create_booking` | `pending_confirmation` | nema | `pending` |
| Prihvati | `scheduled` | postojeće `cancelled` | `accepted`; upis `patient_chart_links` za nalog i karton te osobe u toj ordinaciji |
| Odbij | `cancelled` | `cancelled` | `rejected` |
| Pošalji ponudu | ostaje zauzet | do tri `offered` | `pending`, isti rok |
| `choose_offer` | `cancelled` | izabrani `scheduled`, ostali `cancelled` | `accepted` |
| `decline_offers` | `cancelled` | svi `cancelled` | `declined_by_patient` |
| Istek | `cancelled` | svi `cancelled` | `expired` |

`create_booking` odbija poziv bez ulogovanog naloga, bez potvrđenog mejla, preko
nedostupnosti i kad mejl ili vezani karton već drže dva zahteva u statusu `pending`
u toj ordinaciji. Ako je slot uzet, ne pravi red. Pacijent zove funkciju ponovo sa
drugim početkom. Prihvat upisuje `patient_chart_links` za nalog zahteva i karton te
osobe u toj ordinaciji. Isti upis radi i `choose_offer`, jer i tada karton nastaje.
Odbijanje i istek vezu ne prave.

---

## 6. Evidencija

`audit_log` dobija `clinic_id`. Okidači beleže `patients`, `patient_contacts`,
`patient_anamnesis`, `patient_alerts`, `tooth_states`, `appointments`, `visits`,
`patient_files`. Zahtev za termin ulazi takođe, da bi odbijanje imalo trag i posle
brisanja identiteta.

Recepcija sme da čita evidenciju termina i kontakata. Ne sme da čita `old_data` i
`new_data` za anamnezu, upozorenja, zube, zapise, dokumente i kolonu `jmbg`. To radi
pogled `audit_log_for_member`, ne kopija tabele.

---

## 7. Pristup

`is_platform_admin()`, `current_clinic_id()`, `current_member_role()`, `is_owner()`,
`is_dentist()`, `is_reception()` su `security definer` i čitaju samo redove članstva.

| Ko | Tabele |
| --- | --- |
| Platforma | `clinics` (bez kliničkih join-ova), `clinic_members` bez `pin_hash`, pozivnice, `clinic_access_requests`. Bez pacijenata, termina, kartona, fajlova i evidencije. |
| Vlasnik | sve u svojoj ordinaciji |
| Stomatolog | sve u svojoj ordinaciji, osim gašenja ordinacije, pozivnica, pravnih podataka, izvoza i tuđeg prihvatanja zahteva. Tuđe prihvatanje odbija baza: `dentist_id` mora biti taj član, osim ako je vlasnik. |
| Recepcija | `patients` bez `jmbg` (pogled), `patient_contacts`, `appointments`, `working_hours`, `blocked_periods`. Bez zapisa, anamneze, upozorenja, zuba, fajlova. Status sme da pređe u `cancelled` i `no_show`, ne u `completed`. |
| Pacijent | svoj `patient_accounts` i svoja deca. Bez `SELECT` nad `patients`, terminima, kartonom, fajlovima i ocenama. Termine i mogućnost ocenjivanja dobija samo kroz proverene funkcije. |
| `anon` | nema `SELECT`. Imenik, javna strana ordinacije i agregatne ocene idu kroz funkcije iz odeljka 8. Slobodne termine i zahtev ne sme. |

`service_role` se ne koristi za čitanje kartona. Serverski izuzeci su kreiranje
`auth.users` kad neko prihvati pozivnicu, izdavanje recovery linka za novu lozinku
(`generateLink`, bez čitanja tabela), i cron poziv `expire_booking_requests()`,
`purge_booking_request_pii()` i `due_reminders()`. Javna registracija u Supabase konzoli
ostaje isključena. Nalog pacijenta pravi aplikacija čim registracija sačuva lozinku,
istim izuzetkom za `auth.users`, i odmah prestane. Lozinka ne ide u izazov.
`email_confirmed_at` ostaje prazan dok kod ne prođe.

Spajanje kartona je funkcija `merge_patients(target_id, source_id)`. Sme je samo vlasnik
iste ordinacije. Prebacuje zavisne redove, upisuje `merged_into_id`, ne briše izvor.
Ako oba imaju anamnezu, ostaje anamneza cilja. Upozorenja i kontakti prelaze. Ako oba
imaju mapu, trenutna ostaje mapa cilja, a mapa izvora ide u istoriju.

`updated_at` održava okidač `set_updated_at()`, ne aplikacija. Dnevnik i jednokratni
tokeni nemaju `updated_at`.

Prihvatanje tuđeg zahteva odbija i baza: stomatolog sme samo gde je `dentist_id` njegov
član, vlasnik sme za svakog u svojoj ordinaciji.

---

## 8. Javne funkcije

`security definer`, `search_path = public`, `EXECUTE` samo za `anon` i `authenticated`
gde piše. Vraćaju samo ono što sme napolje.

| Funkcija | Ko je zove | Šta radi |
| --- | --- | --- |
| `request_clinic_access(email, city, ip_hash)` | `anon` | upis zahteva; odbija dupli `pending` i neiskorišćenu pozivnicu |
| `list_cities()` | `anon` | gradovi u kojima ima vidljivu ordinaciju |
| `search_clinics(city, name, lat, lng, max_distance_km)` | `anon` | naziv, adresa, grad, telefon, slug, udaljenost; bez termina |
| `get_clinic_public(slug)` | `anon` | javna strana i imena stomatologa koji su online |
| `get_public_rating_summaries(slugs)` | `anon` | prosek i broj ocena vidljivih ordinacija i online stomatologa; bez identiteta pacijenta |
| `get_available_slots(slug, dentist_id, day)` | ulogovan nalog | početci; računa radno vreme, pauzu, blokadu, nedostupnost, razmak, najavu, horizont i zauzete statuse. `anon` je ne zove |
| `create_booking(slug, dentist_id, starts_at, for_child, dependent_id, phone, date_of_birth, contact, reason)` | ulogovan pacijent | termin `pending_confirmation` i zahtev, ili greška ako slot nije slobodan; traži potvrđen mejl |
| `list_my_appointments(slug)` | ulogovan pacijent | vreme, stomatolog i status samo za mejl tog naloga u toj ordinaciji |
| `list_my_appointments_all()` | ulogovan pacijent | njegovi termini kroz ordinacije i njegove sačuvane ocene |
| `submit_appointment_review(appointment_id, clinic_rating, dentist_rating)` | potvrđen pacijent | ocena 1–5 za ordinaciju i opciono stomatologa, samo za njegov završen termin |
| `get_clinic_rating_details(clinic_id, dentist_id)` | vlasnik te ordinacije | pojedinačna ocena, ime naloga pacijenta i datum termina; bez kontakta i komentara |
| `choose_offer(token, offer_id)` | ulogovan pacijent, mejl se poklapa | izabrani postaje `scheduled`, traženi i ostale ponude `cancelled` |
| `decline_offers(token)` | isti uslov | traženi, sve ponude i zahtev otkazani |
| `reschedule_by_token(token, starts_at)` | isti uslov | samo ako je brojač 0 i do početka ima više od 24 sata |
| `cancel_by_token(token)` | isti uslov | dok je do početka više od 24 sata |
| `booking_dependent_id(request_id)` | vlasnik ili stomatolog tog zahteva | id deteta za prihvat; recepcija, tuđa ordinacija i odrasli zahtev vraćaju null; ime se ne vraća |

`create_booking` ne zove `anon`. Imena pacijenta i odnos deteta čitaju se sa naloga i
`patient_dependents`, ne iz slobodnog teksta pozivaoca, osim telefona i datuma koji se
pri prvom slanju upisuju na nalog. Razlog je jedini slobodan tekst. Ako je `for_child`,
`dependent_id` mora pripadati tom nalogu.

Posao po satu zove `expire_booking_requests()` i `purge_booking_request_pii()` (90 dana).
Podsetnike (24 sata i 2 sata) bira `due_reminders()` i šalje aplikacija, pa beleži
`appointment_reminders (appointment_id, kind)` da se isti ne pošalje dvaput.

---

## 9. Šta se računa, a nije tabela

- Zadatak „Unesite mejl pacijenta“: postoji kontakt, `date_of_birth` je navršio 15 godina,
  `email` je null i `email_declined` je false.
- Slobodan slot: radno vreme stomatologa, bez pauze, bez blokade, bez nedostupnosti,
  bez zauzetog opsega, plus razmak, unutar najave i horizonta, na koraku ordinacije.
- Rok zahteva: 24 sata dodata samo preko dana kad taj stomatolog nije `is_closed` i nema
  blokadu celog dana, ali ne posle `starts_at`. Blokada celog dana je red u
  `blocked_periods` koji pokriva `opens_at` do `closes_at` tog lokalnog dana.
- Dva aktivna zahteva: broje se redovi `booking_requests` u statusu `pending` za isti
  `lower(booker_email)` i `clinic_id`, i posebno za isti `patient_id` kad nije null.

---

## 10. Migracije i backup

Ostaju pravila iz prethodne šeme: fajl
`supabase/migrations/<YYYYMMDDHHMMSS>_<opis>.sql`, primenjena migracija se ne menja,
`schema_migrations`, backup pre `db:migrate`, seed samo na test bazi.

Ova šema je početna. Ako u bazi još nema pravih pacijenata, piše se jedna početna
migracija umesto lanja izmena stare jedne ordinacije. Čim postoji pravi karton, dalje
ide samo nova migracija.

`pg_dump` i dalje ne obuhvata bucket `patient-files`.
