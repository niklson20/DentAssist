# PRD — Aplikacija za stomatološke ordinacije

**Status:** Dogovoren raspored prve verzije
**Jezik interfejsa:** srpski, latinica
**Tip proizvoda:** web aplikacija za više ordinacija, sa javnim zakazivanjem
**Tehnologije:** Next.js i Supabase
**Poslednja izmena:** oktobar 2026.

> Ovaj dokument opisuje **željeno stanje** proizvoda. Tehničku realizaciju vidi u
> [`Tech.md`](./Tech.md), a šemu baze u [`DB.md`](./DB.md). Ako se implementacija razlikuje
> od ovog dokumenta, dokument je merodavan.

---

## 1. Svrha

Aplikacija služi stomatološkim ordinacijama u Srbiji da vode kalendar, zahteve za termine
i kartone pacijenata. Ista instalacija služi više ordinacija. Podaci jedne ordinacije
nisu vidljivi drugoj.

Bez prijave pacijent pregleda imenik i stranicu ordinacije: naziv, adresu, telefon,
tekst i stomatologe. Slobodne termine ne vidi. Zakazivanje radi samo ulogovan i
registrovan pacijent. Nalog ima mejl i lozinku, služi da izabere dete
i vidi svoje termine u ordinaciji kroz koju je ušao, i ne otvara karton. Ordinacija u
aplikaciji prihvata, odbija ili nudi druga vremena.

Vlasnik platforme otvara ordinaciju pozivnicom. Ne čita kartone, termine ni dokumente.

---

## 2. Ciljevi prve verzije

- Više ordinacija na jednoj aplikaciji, sa potpunom izolacijom kartona.
- Pregled imenika i stranice ordinacije bez prijave. Slobodni termini i zahtev samo
  sa ulogovanog naloga. Zahtev traži i mejl potvrđen kodom pri registraciji.
- Link i QR jedne ordinacije vode samo u tu ordinaciju, bez puta u imenik.
- Kalendar po stomatologu: jedan stomatolog nema preklapanje, dva stomatologa smeju
  u isto vreme.
- Karton sa istorijom dolazaka, zapisom posete, anamnezom, upozorenjem, dokumentima
  i zubnom mapom.
- Zakazivanje deteta mlađeg od 15 godina preko roditelja ili srodnika, sa posebnim
  kartonom deteta.
- Ordinacija radi prvenstveno na računaru. Na telefonu može da uradi sve, a put koji
  mora da bude lak je rešavanje pristiglih zahteva.

---

## 3. Uloge

Jedna osoba ima jedan nalog i pripada tačno jednoj ordinaciji. Vlasnik ordinacije ima
jedan nalog. Na tom nalogu može i sam da prima pacijente. Pacijent ima poseban nalog
za zakazivanje i ne pripada osoblju ordinacije.

| Uloga | Šta radi |
| --- | --- |
| **Platforma** | Šalje pozivnicu za novu ordinaciju i gasi joj pristup. Vidi firmu, grad, status i naloge zaposlenih. Ne vidi kartone, termine, dokumente ni broj termina. |
| **Vlasnik ordinacije** | Podešava ordinaciju, poziva i vraća kolege, spaja kartone, preuzima izvoz i vidi mesečne brojeve. Vidi i menja sve kalendare i kartone. Prihvata online zahteve za svakog stomatologa. Ako prima pacijente, ima svoj kalendar. |
| **Stomatolog** | Ima svoj kalendar i svoje radno vreme. Vidi ostale kalendare. Piše u bilo koji karton te ordinacije. Prihvata, odbija i nudi termine samo za sebe. Termin označava završenim samo ako je njegov. |
| **Recepcija** | Zakazuje i otkazuje telefonom i na licu mesta, vidi kontakte, označava da pacijent nije došao. Ne otvara zapis posete, anamnezu, zubnu mapu, dokumente, JMBG ni upozorenje. Ne odgovara na online zahtev. |
| **Pacijent** | Bez prijave bira grad, ordinaciju i vidi stomatologe. Slobodne termine vidi tek kad je ulogovan. Tada zakazuje za sebe ili za sačuvano dete, bira ponuđeni termin, jednom pomera termin i otkazuje ga do 24 sata pre početka. Vidi samo svoje termine u ordinaciji kroz koju je ušao. |

Recepcija vidi online zahtev da bi znala ko dolazi, bez dugmadi Prihvati, Odbij i Ponudi.

Osoblje se ne briše. Vlasnik označava osobu nedostupnom. Prijava i dalje radi. Dok je
stomatolog nedostupan, novi termini kod njega ne mogu da se zakažu, ni online ni telefonom.
Već zakazani ostaju, a vlasnik ih pomeri ili otkaže. Nedostupna osoba nestaje sa spiska
za PIN na recepcijskom računaru. Vlasnik je vraća jednom radnjom.

Poslednji vlasnik ne može da izađe dok ulogu vlasnika ne preda drugom članu.

Na prvom ulasku vlasnik prihvata uslove korišćenja i to da je ordinacija odgovorna za
medicinske podatke svojih pacijenata.

---

## 4. Ordinacija

### 4.1 Otvaranje

1. Na `/za-ordinacije` ordinacija ostavi mejl i grad. Grad se kuca. Dok sa tog mejla
   postoji zahtev koji čeka, ili pozivnica koja nije iskorišćena ni istekla, novi zahtev
   se ne prima. Poruka je: „Zahtev sa ove adrese već čeka.“ Isti mejl sme najviše tri
   zahteva na sat. Posle 10 slanja u satu sa iste mreže traži se provera da korisnik nije robot.
2. Platforma u aplikaciji pošalje jednokratni link ili zahtev odbaci. Odbacivanje ne šalje
   mejl. Odbijen mejl sme ponovo da traži. Link važi 7 dana. Isti mejl nosi i šestocifreni
   kod. Kod važi dok važi link, pet pogrešnih unosa ga gasi, ponovno slanje sa stranice ide
   najviše tri puta na sat.
3. Osoba potvrdi kod, postavi lozinku i postane vlasnik.
4. Vodič ide jedan korak po ekranu: uslovi; naziv, adresa, grad i telefon; pitanje da li
   vlasnik prima pacijente, pa radno vreme samo ako prima; tip, trajanje i korak; najava
   i horizont; poziv stomatologa; uključivanje online zakazivanja. Grad je već upisan iz
   zahteva i sme da se promeni. Grad se kuca. Korak „Pozovi stomatologa“ koristi istu
   akciju kao kasnije osoblje. Poslednji korak ostaje isključen dok niko ne prima
   pacijente. Uključeno znači da se ordinacija vidi u imeniku.
   Dok je vlasnik jedini član i nema neiskorišćenu pozivnicu, PIN se ne traži. Prva
   pozivnica kolegi prvo traži da vlasnik postavi PIN na `/podesavanja/nalog`.
5. Posle poslednjeg koraka podešavanje je gotovo i vlasnik dolazi na današnji kalendar.
   Ordinacija ulazi u imenik samo ako je online zakazivanje uključeno.

Tekst uslova: „Prihvatam uslove korišćenja. Ordinacija je odgovorna za medicinske podatke
svojih pacijenata. Platforma te podatke ne čita. Gašenje pristupa ne briše kartone.
Zakazivanje nije pristanak na zahvat.“ To je tekst u aplikaciji. Pre prve prave ordinacije
treba da ga pregleda pravnik.

Vodič nudi, a vlasnik sme da promeni: korak 30 minuta, razmak 0, trajanje 30 minuta,
najava 2 sata, horizont 30 dana, ponedeljak–petak 09–17, subota i nedelja zatvoreni,
bez pauze, tip „Pregled“.

Kod od 6 cifara proverava sanduče pri prvom nalogu. Zaboravljena lozinka je link i važi
sat vremena. Svaka sledeća prijava je mejl i lozinka.

Pozivnica za kolegu važi 7 dana. Vlasnik unese ime, prezime, mejl i ulogu
(stomatolog ili recepcija). Isti mejl nosi link i kod, istim pravilima kao pozivnica
ordinacije. Kolega potvrdi kod i postavi lozinku.

Mejl pozivnice ordinacije: naslov „Otvorite ordinaciju“, tekst „Link važi 7 dana: {link}.
Kod: {kod}. Na stranici potvrdite mejl i postavite lozinku.“ Mejl kolegi: naslov
„Poziv u {ordinacija}“, tekst „{ime} vas poziva kao {uloga}. Link važi 7 dana: {link}.
Kod: {kod}.“ Mejl nove lozinke: naslov „Nova lozinka“, tekst „Link važi sat vremena:
{link}. Ako niste tražili promenu, zanemarite poruku.“

PIB, matični broj i broj rešenja čuvaju se u podešavanjima. Nisu uslov da zakazivanje
krene i ne izlaze na javnu stranu. Vidi ih vlasnik i platforma.

### 4.2 Javna strana ordinacije

Pacijent vidi naziv, logo ako je unet, adresu, telefon i kratak tekst koji ordinacija
napiše. Stomatolog je samo ime i prezime. Nema titule, fotografije ni biografije.
Logo je JPEG, PNG ili WebP, do 1 MB.

Vlasnik može da sakrije stomatologa sa javne strane. Kalendar i telefonski unos i dalje rade.

Jedan prekidač gasi online zakazivanje za celu ordinaciju. Osoblje i dalje radi u aplikaciji.
Ordinacija tada nestaje iz imenika.

Jedna ordinacija ima jednu adresu i jedan grad. Javni link je
`/ordinacije/[slug]`. Vlasnik ga vidi u podešavanjima ordinacije i može da ga stavi
na vrata kao QR. Ko uđe tim linkom vidi samo tu ordinaciju.

### 4.3 Imenik

Pacijent bira grad u Srbiji i vidi ordinacije iz tog grada koje su završile podešavanje
i primaju online. Prikaz je lista i mapa. Može „blizu mene“ ako dozvoli lokaciju telefona:
tada su ordinacije poređane po udaljenosti. Može i da traži naziv u celoj zemlji.

Na kartici su naziv, adresa i telefon. Nema tuđih termina ni imena pacijenata.
Spisak gradova čine samo gradovi u kojima već ima vidljivu ordinaciju. Pretraga naziva
ide kroz celu zemlju i ne zavisi od izabranog grada. Pin na mapi dolazi iz adrese;
ordinacija bez pina ostaje na listi.

Imenik je ulaz za prvi pronalazak. Stranica jedne ordinacije nema link ka imeniku
ni ka drugim ordinacijama. Stomatolog se bira samo unutar te ordinacije. Poslednji
izabrani stomatolog ostaje upamćen na tom uređaju.

### 4.4 Radno vreme

Svaki stomatolog ima svoje dane, sate, ponavljajuću pauzu i pojedinačne blokade
(praznik, slobodan dan). Državne praznike sistem ne zatvara sam.

Stomatolog menja svoje vreme, pauze i odsustva. Vlasnik menja svačije vreme i podešavanja
cele ordinacije: korak, razmak, podrazumevano trajanje, najavu, horizont, tipove,
online zakazivanje, pravne podatke i pozivnice. Korak, razmak, trajanje, najava i
horizont menjaju se i posle vodiča, na `/podesavanja/ordinacija`. Nedeljno vreme i
pauza su u podešavanjima. Pojedinačna blokada unosi se sa kalendara, na dan i
stomatologa koji se gledaju.

Korak je 15 ili 30 minuta, za online i za ordinaciju. Razmak između dva termina istog
stomatologa je 0, 5, 10 ili 15 minuta. Pacijent taj razmak ne vidi kao slobodan početak.
Sledeći slobodan početak je prva crta koraka koja pada na kraj termina plus razmak,
ili posle nje.

Trajanje termina je umnožak koraka, od jednog koraka do 120 minuta.

Osoblje sme da zakaže van objavljenog radnog vremena i preko pauze. Online to ne vidi.
Osoblje sme da zakaže i preko ručne blokade. Ne sme preko nedostupnosti stomatologa
i ne sme preko drugog njegovog termina.

### 4.5 Tipovi termina

Vlasnik dodaje, preimenuje i gasi tipove. Online zakazivanje uvek koristi podrazumevani
tip i podrazumevano trajanje ordinacije. Osoblje posle može da promeni tip i trajanje
na konkretnom terminu.

---

## 5. Prijava osoblja

Na kućnom računaru i telefonu prijava je mejl i lozinka. „Zapamti me“ drži sesiju 90 dana.
Bez kvačice sesija traje dok se prozor ne zatvori.

Na recepcijskom računaru vlasnik jednom poveže uređaj. Može da poveže više računara i da
isključi pojedini. Računar pamti HttpOnly kolačić sa tajnom uređaja. U bazi je samo
otisak te tajne. Kolačić traje dok vlasnik ne opozove uređaj. Posle toga ceo ekran je
izbor imena: gore naziv ordinacije, ispod dugmad osoba koje nisu nedostupne. Dodir
imena otvara unos od 6 cifara, krupnim ciframa. Svako je samo postavilo PIN na
`/podesavanja/nalog`. Unos tačnog PIN-a odmah zatvara prethodnu sesiju. „Zapamti me“
od 90 dana ne važi na ovom računaru. Pogrešan PIN javlja koliko pokušaja ostaje. Posle
pet pogrešnih traži se lozinka te osobe. Posle 2 minuta bez dodira ekran se vraća na
imena i briše uneti PIN. Lični računar i telefon nemaju ovaj povratak. U evidenciji
ostaje ta osoba.

Podešavanja cele ordinacije traže još jedan PIN vlasnika, da tuđa sesija na zajedničkom
računaru ne menja ordinaciju. To važi za sve pod `/podesavanja` osim `/podesavanja/nalog`,
gde se PIN prvi put postavlja. Uneti PIN važi do odjave. Dok je vlasnik jedini član i
nema neiskorišćenu pozivnicu, taj PIN se ne traži. Čim postoji drugi član ili
neiskorišćena pozivnica, svaki ulazak traži PIN. Stomatolog i dalje otvara samo svoje
radno vreme i svoj nalog, bez PIN-a vlasnika. Recepcija vidi samo nalog.

---

## 6. Kalendar

Podrazumevani pogled je današnji dan, stomatolozi jedan pored drugog. Nedeljni i mesečni
pregled postoje. Nedelja počinje ponedeljkom. Otkazani termini mogu da se sakriju.
Termin se menja kroz formu, bez prevlačenja.

Ulogovan pacijent vidi samo slobodne početke izabranog stomatologa. Ne vidi
tuđa imena, zauzete termine ni razlog blokade. Bez prijave ne vidi ni slobodne početke.
Ordinacija vidi ceo kalendar: zauzeto,
čekanje, ponuđene termine, blokade i odsustva.

Termin se menja istom formom kojom se unosi. Promena sata šalje mejl pacijentu.
Prebacivanje na drugog stomatologa, bez promene sata, ne šalje mejl. Ako se menjaju
i sat i stomatolog, mejl ide jer se menjao sat. Otkaz već zakazanog termina traži
poruku ordinacije, do 300 znakova.

Početni ekran osoblja je taj kalendar i zahtevi koji čekaju potvrdu.
Otkazani su sakriveni čim se ekran otvori. Prekidač „Sakrij otkazane“ može da ih vrati.

Boja statusa ide iz tokena teme, bez heksa u komponenti. Čeka potvrdu je upozorenje,
ponuđen je akcenat, zakazan je puna neutralna površina, završen je prigušen, nije došao
je prigušeno crven, otkazan je precrtan i najslabiji.

### 6.1 Podaci termina

| Polje | Obavezno | Napomena |
| --- | --- | --- |
| Stomatolog | da | |
| Pacijent | da kad je termin zakazan, završen ili nije došao | dok čeka potvrdu, identitet je na zahtevu |
| Početak | da | na koraku ordinacije |
| Trajanje | da | umnožak koraka, najviše 120 minuta |
| Tip | da | online: podrazumevani tip |
| Status | da | vidi 6.2 |
| Napomena | ne | razlog dolaska |
| Izvor | da | pacijent ili osoblje |

### 6.2 Statusi

| Status | Značenje |
| --- | --- |
| Čeka potvrdu | pacijent je potvrdio kod, ordinacija još nije odgovorila; slot je zauzet |
| Ponuđen | jedno od do tri vremena koja stomatolog drži dok pacijent ne izabere |
| Zakazan | potvrđen ili unet od strane osoblja |
| Završen | poseta obavljena |
| Nije došao | ostaje u istoriji; slot ostaje zauzet tim terminom |
| Otkazan | ne ulazi u proveru preklapanja |

Nema statusa „stigao“. Nema oznake „hitno“.

Recepcija sme da označi Nije došao i da otkaže. Završen smeju stomatolog tog termina
i vlasnik. Čim je termin završen, otvara se zapis posete.

Osoblje može da unese termin ranije danas, dok se taj dan ne završi, ako poseta nije
prošla kroz kalendar. Raniji dan ne može.

### 6.3 Preklapanje

Preklapanje se gleda po stomatologu. U računicu ulaze statusi Čeka potvrdu, Ponuđen,
Zakazan, Završen i Nije došao. Otkazan ne ulazi.

---

## 7. Javno zakazivanje

Pacijent zakazuje na telefonu i na računaru. To mu je glavni posao u aplikaciji.
Imenik i stranica ordinacije rade bez prijave. Traka dana i slobodni početci ne.
Zahtev ne nastaje dok pacijent nije ulogovan i dok mejl naloga nije potvrđen.

1. Bira grad, pa ordinaciju na listi, mapi ili pretragom. Vidi stomatologe.
2. Bez prijave, umesto slobodnih termina, stoji poziv da se prijavi ili registruje.
   Posle prijave vraća se na istu ordinaciju.
3. Bira stomatologa, dan i slobodan početak.
4. Bira da li je termin za njega ili za dete koje još nema 15 godina. Nepotvrđen mejl
   ostaje na unosu koda i ne pušta ovu formu.
5. Popuni podatke i prihvati: „Slažem se da ordinacija {naziv} obradi ime, prezime, datum
   rođenja, telefon i mejl radi zakazivanja termina.“ Dugme je „Pošalji zahtev“.
6. Sistem ponovo proveri slot. Ako je zauzet, bira se drugi početak. Novi kod se ne traži.
7. Nastaje zahtev **Čeka potvrdu**. Javna poruka je uvek ista: zahtev je primljen i
   ordinacija treba da ga potvrdi. Ne piše da li karton već postoji.

Jedan mejl sme da drži najviše dva zahteva koja čekaju u jednoj ordinaciji. Isto važi
za jedan karton.

### 7.1 Za sebe

Obavezni su ime, prezime, datum rođenja, telefon i mejl, tim redom. Razlog dolaska je
poslednje polje i nije obavezan. Ako osoba još nije navršila 15 godina, forma prelazi na
put za dete i zadržava uneti datum. Petnaesti rođendan računa se u zoni Beograda: tog
dana osoba ima 15 godina.

### 7.2 Za dete

Redosled: ime, prezime i datum rođenja deteta; odnos; ime, prezime, telefon i mejl
odraslog; razlog, koji nije obavezan. Odnos je majka, otac, staratelj, baba, deda ili
drugi srodnik. Obavezna je izjava: „Zakazujem kao roditelj ili zakonski staratelj.“
Mejl odraslog je mejl ulogovanog naloga.

Dete je poseban pacijent. Mejl roditelja stoji na kontaktu, ne u polju mejla pacijenta.
Majka i otac mogu oboje da zakazuju isto dete. Svako dobija mejl samo za termin koji
je sam zakazao. Drugi roditelj, njegov telefon i deca vezana samo za njegov mejl ne
prikazuju se na tuđem nalogu.

Osoba od 15 godina zakazuje sama. Roditelj je online ne zakazuje.

Zakazivanje nije pristanak na zahvat. Pisani pristanak i dalje daje pacijent ili
zakonski zastupnik u ordinaciji.

Dvoje dece zakazuju se u dva prolaza. Isti dan smeju dva termina ako se kod istog
stomatologa ne preklapaju, na primer ujutru odrasli i posle podne dete.

### 7.3 Odgovor ordinacije

Rok je ono što prvo stigne: 24 sata radnog vremena tog stomatologa, ili početak termina.
Zatvoren dan stomatologa ne troši rok. Ponuda tri termina ne produžava rok.

Tri izlaza, samo za vlasnika i stomatologa kome je termin tražen:

- **Prihvati** — termin postaje Zakazan.
- **Odbij** — stomatolog ne prima tog pacijenta. Poruka nije obavezna i ima najviše
  300 znakova. Slot se oslobađa.
- **Ponudi** — do tri slobodna termina, koliko ih ima, uvek kod istog stomatologa.
  Sva tri se drže do izbora ili do isteka istog roka. Izbor jednog taj termin čini
  Zakazanim i oslobađa ostale. „Nijedan ne odgovara“ odmah oslobađa sva tri i zahtev
  je odbijen.

Dugme Ponudi u traci termina otvara slobodne početke tog stomatologa, istim pravilima
kao javni kalendar. Traženi sat je već zauzet i nije u listi. Dodir dodaje početak,
drugi dodir ga skida. Izabrani stoje kao 1, 2 i 3, redom dodavanja. „Pošalji ponudu“
radi kad je izabran bar jedan. Povratak bez slanja ne menja zahtev.

| Događaj | Traženi termin | Ponuđeni termini | Zahtev |
| --- | --- | --- | --- |
| Ulogovan pacijent pošalje zahtev | `pending_confirmation`, drži slot | nema | `pending` |
| Prihvati | `scheduled`, karton se veže | nema ih, ili se postojeći otkazuju | `accepted` |
| Odbij | `cancelled` | `cancelled` | `rejected` |
| Pošalji ponudu | ostaje zauzet | do tri u statusu `offered` | i dalje `pending`, isti rok |
| Izbor jednog | `cancelled` | izabrani `scheduled`, ostali `cancelled` | `accepted` |
| Nijedan ne odgovara | `cancelled` | svi `cancelled` | `declined_by_patient` |
| Istek | `cancelled` | svi `cancelled` | `expired` |

Prihvati posle poslate ponude i dalje potvrđuje traženi sat i oslobađa ponuđene.
Ponuda ne produžava rok.

Ako niko ne odgovori, zahtev se otkazuje i slotovi se oslobađaju.

Telefonski i lični unos odmah prave status Zakazan, bez koda. Ako je pacijent mlađi
od 15 godina, unos traži i kontakt roditelja ili srodnika.

### 7.4 Otkaz i pomeranje

Pacijent otkazuje preko linka iz mejla dok je termin u statusu Čeka potvrdu ili Zakazan,
najkasnije 24 sata pre početka. Posle toga zove ordinaciju.

Jednom sme sam da pomeri potvrđen termin na drugi slobodan slot stomatologa koji taj
termin trenutno drži, takođe najkasnije 24 sata pre početka.

Kad ordinacija promeni sat, pacijent dobija mejl sa novim vremenom i imenom stomatologa.
To ne troši njegovo jedno pomeranje.

Osoblje može da prebaci termin na drugog stomatologa bez mejla. Ako se tom prilikom
menja i sat, mejl ide jer se menjao sat.

Kad ordinacija otkaže već potvrđen termin, poruka pacijentu je obavezna, do 300 znakova,
uz telefon.

Stranica iz linka traži ulogovan nalog čiji je mejl isti kao na zahtevu. Bez prijave
prvo ide prijava, pa povratak na isti link. Tuđi nalog vidi tekst da link ne važi.
Kad do početka ima manje od 24 sata, umesto pomeranja i otkaza
stoji telefon ordinacije. Ako link ne važi, a ordinacija se zna: „Ovaj link više ne važi.
Ako termin još nije prošao, zovite ordinaciju: {telefon}.“ Ako se ordinacija ne zna:
„Ovaj link više ne važi.“

### 7.5 Mejl pacijentu

Mejl šalje platforma, preko Resenda, sa jednog domena aplikacije. Ime pošiljaoca je naziv
ordinacije. Adresa je `ne-odgovaraj@<domen-aplikacije>`. Na mejl se ne odgovara. U poruci
je telefon ordinacije. Isti kanal ide i osoblju (pozivnica i nova lozinka). Detalji su u
[`Tech.md`](./Tech.md#7-mejl-i-rokovi).
Potvrda je samo tekst: ko, gde, kada, stomatolog, telefon. Nema fajla za kalendar ni
linka ka mapi.

Pacijent dobija: kod za potvrdu mejla pri registraciji, zahtev primljen, potvrđen, odbijen, rok istekao, otkazan, ponuda
termina, promenu sata. Podsetnik ide 24 sata pre i 2 sata pre, samo za potvrđen termin,
samo ako je taj trenutak još u budućnosti u času potvrde. U podsetniku dva sata pre piše
da se promena radi telefonom.

Ordinacija mejlom ne dobija ništa. Sve rešava u aplikaciji. Zahtev za otvaranje naloga
ne šalje mejl dok platforma ne pošalje pozivnicu.

| Mejl | Naslov | Tekst |
| --- | --- | --- |
| Kod | Potvrdite mejl | Kod za potvrdu mejla je {kod}. Važi 10 minuta. Ako niste vi otvorili nalog, zanemarite poruku. |
| Primljen | Zahtev je primljen | Zahtev za termin je primljen. {ordinacija} treba da ga potvrdi. {pacijent}, {datum i vreme}, {stomatolog}, {adresa}. Telefon: {telefon}. |
| Potvrđen | Termin je potvrđen | Termin je potvrđen. {pacijent}, {datum i vreme}, {stomatolog}, {adresa}. Otkaz i pomeranje mogući su najkasnije 24 sata pre početka: {link}. Telefon: {telefon}. |
| Odbijen | Zahtev nije prihvaćen | {ordinacija} ne može da primi ovaj termin. {poruka, ako postoji}. Telefon: {telefon}. |
| Istekao | Zahtev je istekao | Ordinacija nije odgovorila na vreme, pa je zahtev otkazan. Možete poslati novi. Telefon: {telefon}. |
| Otkazan | Termin je otkazan | Termin {datum i vreme} je otkazan. {poruka, kad otkazuje ordinacija}. Telefon: {telefon}. |
| Ponuda | Ponuđeni termini | {ordinacija} nudi druga vremena kod {stomatolog}. Izaberite jedan, ili javite da nijedan ne odgovara: {link}. Rok za izbor: {rok}. Telefon: {telefon}. |
| Novi sat | Termin je pomeren | Novi termin: {datum i vreme}, {stomatolog}, {adresa}. Telefon: {telefon}. |
| 24 sata pre | Podsetnik za sutra | Sutra: {vreme}, {stomatolog}, {adresa}. Telefon: {telefon}. |
| 2 sata pre | Termin je za dva sata | Termin je u {vreme}, {stomatolog}. Promena se radi telefonom: {telefon}. |

### 7.6 Prepoznavanje iste osobe

Uparivanje radi samo u toj ordinaciji, posle zahteva ulogovanog pacijenta, i vidi ga samo osoblje. Mejl je mejl naloga.

| Situacija | Šta se dešava |
| --- | --- |
| Za sebe, i mejl, ime, prezime i datum rođenja već jesu na jednom kartonu | termin ide na taj karton |
| Za sebe, ime i datum rođenja postoje, a mejl na kartonu je prazan | termin može na taj karton; mejl čeka potvrdu na dolasku |
| Za sebe, taj mejl je već na kartonu drugog imena | zahtev staje na ručnu proveru; javna strana ne otkriva tuđe ime |
| Za dete, isto ime i datum rođenja već imaju karton, a ovaj mejl je već potvrđen kontakt | termin ide na dete |
| Za dete, karton postoji, a ovaj mejl još nije kontakt | pri prihvatanju osoblje bira postojeći karton ili kaže da je to drugi pacijent; novi kontakt postaje pun tek kad ga na dolasku potvrde |
| Nema poklapanja | karton se otvara tek kad ordinacija prihvati zahtev |

Na dolasku, u prozoru termina, pre zapisa posete, stomatolog ili vlasnik odgovara da li
mejl pripada tom pacijentu. Dok odgovor nije da, mejl stoji uz termin. Kod deteta se
na dolasku potvrđuje da je odrasla osoba roditelj ili srodnik.

Slično ime ili drugačiji datum ne spajaju se sami. Osoblje vidi „sličan karton“ i bira.
Poređenje imena skida razmake na krajevima i ne gleda velika i mala slova. Slova č, ć,
š, ž i đ ostaju različita. Sličan zapis nije isto ime.

Odbijen ili istekao zahtev čuva ime, telefon, mejl i datum rođenja 90 dana, zatim se to
briše. Ostaje da je zahtev postojao, bez identiteta. Karton od odbijenog zahteva ne nastaje.

---

## 7.7 Nalog pacijenta

Bez naloga pacijent pregleda ordinacije, bez slobodnih termina. Zakazivanje, ponuda,
pomeranje i otkaz traže ulogovan nalog. Nalog ima mejl i lozinku. Ne otvara karton,
anamnezu, zube, dokumente ni razlog dolaska. Mejl se potvrđuje kodom od 6 cifara pre
prvog zahteva. Kod važi 10 minuta, pet pogrešnih unosa ga gasi, isto slanje ide najviše
tri puta na sat. Posle 10 slanja u satu sa iste mreže traži se provera da korisnik nije
robot.

Prijava i registracija su na stranici ordinacije: `/ordinacije/[slug]/prijava` i
`/ordinacije/[slug]/registracija`. Posle prijave pacijent ostaje u toj ordinaciji.
Isti nalog ne otvara `/danas`, `/pacijenti`, `/podesavanja`, `/statistika` ni
`/platforma`.

Na nalogu stoje ime, prezime, telefon i datum rođenja odraslog, da sledeća forma bude
puna. Deca su ime, prezime, datum rođenja i odnos. Spisak je
`/ordinacije/[slug]/deca`. `/ordinacije/[slug]/termini` pokazuje samo termine ovog
mejla u toj ordinaciji: vreme, stomatolog i status.

Potvrđen mejl se pri zakazivanju ne proverava ponovo. Zahtev i dalje čeka potvrdu
ordinacije. Nepotvrđen mejl ne šalje zahtev.

Stomatolog ili vlasnik na kartonu deteta šalje „Poveži sa roditeljem“. Dete se
pojavljuje na nalogu tek kad roditelj otvori `/ordinacije/[slug]/povezi/[token]` i
potvrdi. Dok potvrde nema, na nalogu nema ni imena deteta. Mejl roditelja ostaje na
kontaktu, ne u polju mejla deteta. Isti mejl u dve ordinacije ima dva kartona.

Roditelj može i sam da doda dete, pre nego što karton u ordinaciji postoji. Pri
prihvatanju važe pravila iz 7.6. Na 15. rođendan i dalje važi zadatak „Unesite mejl
pacijenta“.

Jedan nalog za prijavu može pripadati i osoblju i pacijentu. To su dva reda u dve
tabele. Prijava osoblja i dalje vodi u kalendar te ordinacije.

## 8. Karton

Karton se ne briše i ne arhivira. Adresa kartona je slug u okviru ordinacije, stabilan
i kad se ime promeni. Dva pacijenta smeju imati isto ime i prezime. Pri unosu istog
imena i prezimena sistem traži potvrdu. Unos nije zabranjen.

Pretraga je po imenu, prezimenu i telefonu. JMBG ne ulazi u pretragu.

Vlasnik i svaki stomatolog smeju da pišu anamnezu, zubnu mapu i zapis u bilo kom kartonu
te ordinacije.

Zaglavlje uvek drži ime, uzrast, telefon i upozorenje. Ispod su kartice: Pregled,
Istorija, Anamneza, Zubi. Dokumenti su dugme i prozor, ne posebna stranica. Recepcija
vidi Pregled i Istoriju, bez upozorenja, JMBG-a, anamneze, zuba i dokumenata. Pregled
drži kontakte, pol, adresu, JMBG i belešku. Zadatak „Unesite mejl pacijenta“ stoji u
zaglavlju dok nije rešen, i na današnjem ekranu.

### 8.1 Podaci

Javna forma ne traži adresu, JMBG, pol ni upozorenje. Osoblje može da ih doda. Sva su
opciona. Pol je muški ili ženski.

Upozorenje stoji na vrhu kartona i u prozoru termina. Šifra je alergija na lek, trudnoća,
zgrušavanje ili ostalo, plus kratak tekst. Recepcija upozorenje ne vidi.

Anamneza se popunjava jednom: hronične bolesti, lekovi, alergije, trudnoća. Vidi se
uz karton. Alergija u anamnezi je opis. Upozorenje je zastavica koja mora da se vidi
na svakom terminu.

### 8.2 Petnaesti rođendan

Na dan kad dete navrši 15 godina, ako karton ima kontakt roditelja ili srodnika, a mejl
pacijenta je prazan, karton dobija zadatak **Unesite mejl pacijenta.** Zadatak vide
vlasnik, stomatolog i recepcija, na kartonu i na početnom ekranu. Stoji dok se mejl ne
upiše ili dok neko ne označi **Nema mejl**. Mejl roditelja se ne menja.

Kad je mejl upisan, osoba zakazuje kao odrasla i kod stiže njoj. Ako zakaže pre nego
što ordinacija upiše mejl, termin se vezuje po imenu i datumu rođenja, a adresa čeka
potvrdu na dolasku.

### 8.3 Istorija dolazaka

Lista termina sa statusom, stomatologom i datumom: čeka potvrdu, zakazan, završen,
nije došao, otkazan. Najnoviji su prvi, grupisani po godinama.

### 8.4 Zapis posete

Jedan termin ima najviše jedan zapis. Polja su opis zahvata, preporuke, plan daljeg
lečenja i interne beleške. Nijedno nije obavezno. Zapis nije blokirajući: forma sme da
se zatvori i dopuni dok važi rok.

Izmena termina i zapisa dozvoljena je 24 sata od kraja termina. Posle toga su zaključani.
Vlasnik taj rok ne otvara. Termin završen bez zapisa vidljivo je označen.

### 8.5 Zubna mapa

Mapa je uvek na kartonu. Stomatolog i vlasnik je menjaju kad hoće. Završetak posete od
nje ne zavisi. Recepcija je ne otvara.

Na kartonu su mlečni i stalni zubi, pa dete može imati obe vilice. Numeracija je FDI.

Zub ima status cele jedinice. Površina se dodaje kad znači, pre svega kod karijesa i
plombe: grizna ili sečna, unutrašnja, spoljna, mezijalna i distalna. Krunica, implantat
ili zub koji nedostaje nemaju površine.

Statusi cele jedinice: zdrav, nije iznikao, karijes, plomba, krunica, lečen kanal,
nedostaje, implantat, za vađenje, prelom.

Trenutno stanje se vidi odmah. Svaka izmena pamti ko je menjao i kada. Iz otvorene
posete vezuje se i za tu posetu. Izmena sa kartona, bez posete, pamti autora i vreme.

Raspored je odontogram. Na ekranu je leva strana pacijentova desna. Odozgo nadole:
stalni gornji, mlečni gornji, mlečni donji, stalni donji. Srednja crta deli desnu i levu
stranu.

```
18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
      55 54 53 52 51 | 61 62 63 64 65
      85 84 83 82 81 | 71 72 73 74 75
48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
```

Svaki status ima svoju boju iz tokena teme, dovoljno različitu da se vidi bez čitanja
naziva. Zdrav je neutralan, nije iznikao je prazan okvir, nedostaje je prigušen.
Dodir na zub otvara listu statusa. Površine su krst od pet zona i izlaze samo za karijes
i plombu. Promena na drugi status skida površine. Izabrani zub ostaje označen na mapi.
Ispod mape je spisak izmena: kada, ko, stari i novi status.

### 8.6 Spajanje

Na pregledu kartona vlasnik traži drugi karton i potvrđuje spajanje. Ostaje karton na kome
je radnja pokrenuta. Termini, zapisi, kontakti, dokumenti i istorija zuba prelaze na
karton koji ostaje. Ako oba imaju anamnezu, ostaje anamneza kartona koji ostaje.
Upozorenja se prebacuju. Ako oba imaju trenutnu mapu, važi mapa kartona koji ostaje,
a druga ulazi u istoriju. Drugi karton više nije u pretrazi i ne briše se.

### 8.7 Dokumenti

Dokument pripada kartonu, ne pojedinačnoj poseti. Vlasnik i stomatolog ga dodaju.
Recepcija ga ne vidi.

| Polje | Obavezno | Napomena |
| --- | --- | --- |
| Fajl | da | jedan fajl |
| Naslov | da | originalno ime sa diska se ne prikazuje |
| Kategorija | da | RTG, Fotografija, Nalaz/PDF, Ostalo |
| Datum snimanja | da | ručni unos, ne može u budućnost |

Formati: JPEG, PNG, WebP, PDF. Najviše 10 MB po fajlu. Kad nema prostora, upload se
odbija jasnom porukom.

Lista, unos, izmena, pregled i preuzimanje rade u dijalogu Dokumenti. Pregled je u tom
dijalogu. Izmena naslova, kategorije i datuma snimanja, i brisanje, rade samo 24 sata
od uploada. Sadržaj fajla se ne zamenjuje.

### 8.8 Evidencija

Baza pamti ko je menjao termine, kontakte, anamnezu, upozorenja, zube, zapise,
dokumente i JMBG. U prvoj verziji nema ekrana za čitanje te evidencije. Recepcija i
dalje ne sme da dobije sadržaj anamneze, upozorenja, zuba, zapisa, dokumenata i JMBG-a
ni kroz kasniji ekran.

---

## 9. Brojevi i izvoz

Vlasnik vidi broj termina, novih pacijenata i nedolazaka, po mesecu i po stomatologu.
Ekran ima izbor meseca, tabelu po stomatologu i dugme „Preuzmi izvoz“.
Recepcija i stomatolog taj ekran ne vide. Platforma ne vidi brojeve.

Vlasnik preuzima pacijente, kontakte, termine, zapise, anamnezu i zubnu mapu. RTG i
PDF ostaju u aplikaciji.

---

## 10. Gašenje ordinacije

Kad platforma ugasi pristup, javno zakazivanje i prijava staju. Kartoni ostaju sačuvani.
Platforma njihov sadržaj ne čita. Ordinacija nestaje sa mape i iz imenika.
Prijava piše: „Pristup ovoj ordinaciji je ugašen. Kartoni su sačuvani. Za povratak
pristupa javite se platformi.“

---

## 11. Ekrani

Raspored je dogovoren. Prijavljeno osoblje koje otvori `/` odlazi na `/danas`. Nalog
platforme odlazi na `/platforma`.

### 11.1 Pacijent

`/` je imenik. Prvo se bira grad. Iznad je pretraga naziva. „Blizu mene“ traži lokaciju
i ređa po udaljenosti. Zatim Lista / Mapa i kartice: naziv, adresa, telefon. Dodir
kartice otvara ordinaciju. Na dnu je link „Za ordinacije“. Prazan grad piše: „U ovom
gradu nema ordinacija sa online zakazivanjem.“ Na širokom ekranu lista i mapa stoje
jedna pored druge.

`/ordinacije/[slug]` drži naziv, logo, adresu, telefon, kratak tekst i stomatologe u jednom redu. Nazad u imenik nema. Bez prijave ispod toga stoji „Prijavite se da vidite slobodne termine“, uz „Prijavite se“ i „Napravite nalog“. Trake dana nema.

Ulogovanom pacijentu jedan stomatolog je već izabran: poslednji na tom uređaju, inače prvi sa javne strane. Ispod je traka dana od danas do horizonta, pa samo slobodni početci, sa krajem po podrazumevanom trajanju. „Nastavi“ stoji pri dnu i radi kad su stomatolog i početak izabrani. Dan bez termina piše: „Nema slobodnih termina ovog dana.“

`/ordinacije/[slug]/prijava` traži mejl i lozinku pacijenta. Posle prijave vraća na istu ordinaciju, ili na zahtev koji je hteo da pošalje. `/ordinacije/[slug]/registracija` traži ime, prezime, mejl i lozinku, pa kod od 6 cifara. Dok kod nije tačan, zahtev se ne šalje. `/ordinacije/[slug]/termini` vidi prijavljen pacijent: samo termini tog mejla u toj ordinaciji. `/ordinacije/[slug]/deca` drži decu na nalogu. `/ordinacije/[slug]/povezi/[token]` je potvrda veze koju je ordinacija poslala.

`/ordinacije/[slug]/zakazivanje` drži stomatologa i početak u adresi, kao `stomatolog` i `pocetak`. Na vrhu je sažetak:
ordinacija, stomatolog, dan i sat. Zatim „Za mene“ ili „Za dete mlađe od 15 godina“.
Prijavljen pacijent bira sebe ili sačuvano dete, a prazna polja dopisuje. Redosled polja je u 7.1 i 7.2. Bez prijave forma se ne otvara: „Nastavi“ vodi na prijavu ili registraciju i vraća na isti `stomatolog` i `pocetak`. Dugme je „Pošalji zahtev“. Posle slanja ekran je samo potvrda iz odeljka 7. Ako je sat zauzet, pacijent se vraća na slobodne početke. Kod se na ovom ekranu ne traži.

`/zakazivanje/[token]` traži ulogovan nalog sa mejlom tog zahteva. Ponuda nudi do tri sata, „Potvrdi“ i „Nijedan ne
odgovara“. Pomeranje pokazuje trenutni sat i slobodne početke istog stomatologa. Otkaz
pokazuje sažetak i „Otkaži termin“.

`/za-ordinacije` traži mejl i grad. Dugme je „Zatražite pristup“. Posle slanja: „Zahtev
je primljen. Kad ga odobrimo, stiže mejl sa linkom.“

### 11.2 Ordinacija

`/prijava` traži mejl, lozinku i „Zapamti me“. Na povezanom računaru umesto toga ide
ekran iz odeljka 5. `/poziv/[token]` traži kod i lozinku. `/lozinka/[token]` traži novu
lozinku i važi i za osoblje i za pacijenta. Pacijent se posle vraća na prijavu svoje
ordinacije.

`/danas` na širokom ekranu ima levo meni: Danas, Pacijenti, Podešavanja, Statistika
(samo vlasnik) i odjavu. Adresa drži `prikaz` (`dan`, `nedelja` ili `mesec`), `datum`,
`stomatolog` i `sakrijOtkazane`. Iznad kalendara su datum, Dan / Nedelja / Mesec i
prekidač otkazanih. Dan su kolone stomatologa; vreme ide vertikalno, a osa sati ostaje
pri pomeranju kolona. Nedelja je jedan stomatolog i sedam dana od ponedeljka. Mesec je
broj termina po danu; klik otvara taj dan. Desno je kolona „Čeka potvrdu“ (sat, ime,
stomatolog, razlog, rok), pa zadaci „Unesite mejl pacijenta“. Vlasnik vidi sve zahteve.
Stomatolog vidi svoje i tu odgovara. Recepcija vidi ko dolazi, bez Prihvati, Odbij i
Ponudi. Klik na termin otvara traku. Na telefonu traka zauzima ceo ekran.

Na telefonu se `/danas` otvara na zahtevima. Kalendar je drugi tab: jedan dan, jedan
stomatolog, lista termina. Donja traka: Zahtevi, Kalendar, Pacijenti, Još. U „Još“ su
podešavanja i odjava.

Traka, odozgo: status, upozorenje ako postoji, vreme, trajanje, stomatolog, tip, pacijent,
telefon, razlog. Novi termin ide redom: stomatolog, postojeći pacijent ili novi, početak,
trajanje, tip, napomena. Ako je pacijent mlađi od 15 godina, forma traži i kontakt
roditelja ili srodnika. Vreme van radnog vremena sme da se sačuva. Izmena postojećeg
termina koristi istu formu. Ako sistem predlaže sličan karton, pre prihvatanja stoje
„Isti karton“ i „Drugi pacijent“.

`/pacijenti` je pretraga. `/pacijenti/[slug]` je karton iz odeljka 8.

`/podesavanja` je vodič dok podešavanje nije gotovo, posle toga spisak odeljaka.
Recepcija vidi samo nalog. Vlasnik, čim nije jedini u ordinaciji, pre odeljaka unosi PIN
iz odeljka 5. `/podesavanja/nalog` taj PIN ne traži.

| Adresa | Ko |
| --- | --- |
| `/podesavanja/ordinacija` | vlasnik: naziv, adresa, telefon, tekst, logo, javni link, online zakazivanje, korak, razmak, trajanje, najava, horizont |
| `/podesavanja/osoblje` | vlasnik: pozivnice, nedostupnost, ko je na javnoj strani |
| `/podesavanja/radno-vreme` | vlasnik svačije, stomatolog svoje |
| `/podesavanja/tipovi` | vlasnik |
| `/podesavanja/uredjaji` | vlasnik: recepcijski računari |
| `/podesavanja/pravni-podaci` | vlasnik |
| `/podesavanja/nalog` | svi: lozinka i PIN |

`/statistika` je u odeljku 9.

### 11.3 Platforma

`/platforma` ima dve liste. Zahtevi: mejl, grad, vreme, „Pošalji pozivnicu“ i „Odbaci“.
Ordinacije: firma, grad, status, nalozi i gašenje pristupa. Bez kartona i bez broja termina.

---

## 12. Nefunkcionalni zahtevi

- Vremenska zona cele aplikacije je `Europe/Belgrade`.
- Podaci jedne ordinacije ne smeju da se vrate drugoj, ni platformi.
- Lozinke su šifrovane. PIN se čuva samo kao otisak.
- Kod iz mejla i tokeni iz linkova čuvaju se samo kao otisak.
- U logove ne ide sadržaj kartona.
- Promena statusa u interfejsu deluje odmah, pre odgovora servera.
- Podaci pacijenata moraju da mogu da se vrate iz backup-a. Detalji su u
  [`Tech.md`](./Tech.md).

---

## 13. Van prve verzije

- Naplata pacijenata, cenovnik i računi.
- Pretplata ordinacija i plaćanje karticom.
- SMS, WhatsApp i odgovaranje na mejl unutar aplikacije.
- Uvid pacijenta u karton, anamnezu, zube i dokumente. Nalog za zakazivanje jeste u ovoj verziji.
- Ocene, lista čekanja i javni imenik van Srbije.
- Više adresa jedne ordinacije.
- Isti nalog osoblja u dve ordinacije. Nalog pacijenta sme da zakazuje u više ordinacija, sa posebnim kartonom u svakoj.
- Google kalendar i drugi spoljni kalendari.
- Prevlačenje termina i ponavljajući termini.
- Fajl za kalendar telefona i link ka mapi u mejlu.
- Obaveštenja browsera.
- Izvoz RTG i PDF fajlova.
- Backup fajlova u skladištu. Metapodaci ulaze u backup baze. Sami fajlovi nisu u
  `pg_dump` kopiji. Prihvaćen je rizik do posebne procedure, vidi
  [`Tech.md`](./Tech.md).

---

## 14. Kriterijumi prihvatanja

Prva verzija je spremna kad važi sve ovo:

- Javni zahtev ne otvara ordinaciju. Nalog osoblja nastaje kad platforma pošalje pozivnicu, a osoba potvrdi kod i postavi lozinku.
- Link ordinacije ne vodi u imenik. Neprijavljen posetilac vidi ordinaciju i ne vidi slobodne termine. Ulogovan roditelj zakaže sačuvano dete i na `/termini` ne vidi termin druge ordinacije.
- Vlasnik koji nije sam u ordinaciji ne otvara podešavanja bez PIN-a. Jedini vlasnik otvara ih bez PIN-a.
- Platforma otvori ordinaciju pozivnicom, a tuđa ordinacija i anonimni poziv ne vide karton.
- Ordinacija koja nije završila podešavanje nije u imeniku.
- Pacijent iz grada vidi ordinaciju na listi i mapi. Slobodne termine bira tek pošto se uloguje, i vidi samo njih, ne zauzete.
- Zahtev bez ulogovanog i potvrđenog naloga ne nastaje. Posle zahteva slot se drži dok ordinacija ne odgovori ili rok ne istekne. Ponuda ne oslobađa traženi sat. Izbor jednog oslobađa ostale, uključujući traženi.
- Dva termina istog stomatologa ne mogu da se preklapaju. Dva stomatologa smeju u isto vreme.
- Dete mlađe od 15 godina dobija svoj karton, a mejl ostaje na kontaktu odrasle osobe.
- Na 15. rođendan karton traži mejl pacijenta.
- Recepcija ne otvara zapis, mapu, dokumente, JMBG ni upozorenje i ne prihvata online zahtev.
- Završen termin otvara zapis. Posle 24 sata zapis je zaključan.
- Zubna mapa pamti trenutno stanje i istoriju izmene.
- Vlasnik preuzima podatke bez fajlova. Platforma taj sadržaj ne vidi.
