import { durationOptionsForSlot } from "./schema";

export function nearestDuration(current: number, slotMinutes: 15 | 30): number {
  const options = durationOptionsForSlot(slotMinutes);
  return options.reduce((best, option) => {
    const bestDistance = Math.abs(best - current);
    const nextDistance = Math.abs(option - current);
    if (nextDistance < bestDistance || (nextDistance === bestDistance && option < best)) {
      return option;
    }
    return best;
  });
}

export function slotHint(slotMinutes: 15 | 30): string {
  return `Termini počinju na svakih ${slotMinutes} minuta.`;
}

export function bufferHint(bufferMinutes: 0 | 5 | 10 | 15): string {
  if (bufferMinutes === 0) {
    return "Nema pauze posle termina.";
  }
  return `Pauza posle svakog termina je ${bufferMinutes} minuta.`;
}

export function noticeReading(minutes: number): string {
  if (minutes === 0) {
    return "odmah";
  }
  return `za ${spanWords(minutes)}`;
}

export function minuteUnit(minutes: number): string {
  return plural(minutes, "minut", "minuta", "minuta");
}

export function dayUnit(days: number): string {
  return plural(days, "dan", "dana", "dana");
}

export function bookingSummary(durationMin: number, noticeMinutes: number, aheadDays: number): string {
  const horizon = aheadDays === 0 ? "danas" : `${countPhrase(aheadDays, "dan", "dana", "dana")} unapred`;
  return `Pacijent bira termin od ${countPhrase(durationMin, "minut", "minuta", "minuta")}, najranije ${noticeReading(noticeMinutes)} i najdalje ${horizon}.`;
}

function spanWords(totalMinutes: number): string {
  if (totalMinutes % 1440 === 0) {
    return countPhrase(totalMinutes / 1440, "dan", "dana", "dana");
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return countPhrase(minutes, "minut", "minuta", "minuta");
  }
  if (minutes === 0) {
    return countPhrase(hours, "sat", "sata", "sati");
  }
  return `${countPhrase(hours, "sat", "sata", "sati")} i ${countPhrase(minutes, "minut", "minuta", "minuta")}`;
}

function countPhrase(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}
