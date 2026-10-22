import type { StaffRole } from "@/lib/auth";

export type SettingsSection = {
  href: string;
  title: string;
  description: string;
  roles: readonly StaffRole[];
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    href: "/podesavanja/ordinacija",
    title: "Ordinacija",
    description: "Naziv, adresa, telefon, tekst, logo, javni link i online zakazivanje.",
    roles: ["owner"],
  },
  {
    href: "/podesavanja/osoblje",
    title: "Osoblje",
    description: "Pozivnice, nedostupnost i ko je na javnoj strani.",
    roles: ["owner"],
  },
  {
    href: "/podesavanja/radno-vreme",
    title: "Radno vreme",
    description: "Dani, sati i pauza.",
    roles: ["owner", "dentist"],
  },
  {
    href: "/podesavanja/tipovi",
    title: "Tipovi",
    description: "Tipovi termina i podrazumevani tip.",
    roles: ["owner"],
  },
  {
    href: "/podesavanja/uredjaji",
    title: "Uređaji",
    description: "Recepcijski računari.",
    roles: ["owner"],
  },
  {
    href: "/podesavanja/pravni-podaci",
    title: "Pravni podaci",
    description: "PIB, matični broj i broj rešenja.",
    roles: ["owner"],
  },
  {
    href: "/podesavanja/nalog",
    title: "Nalog",
    description: "Lozinka i PIN.",
    roles: ["owner", "dentist", "reception"],
  },
];

export function settingsSectionsFor(role: StaffRole): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => section.roles.includes(role));
}
