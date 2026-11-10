export type ChartAnamnesis = {
  chronicConditions: string;
  medications: string;
  allergies: string;
  pregnancy: string;
};

export const EMPTY_ANAMNESIS: ChartAnamnesis = {
  chronicConditions: "",
  medications: "",
  allergies: "",
  pregnancy: "",
};

export function normalizeAnamnesis(value: Partial<ChartAnamnesis> | null | undefined): ChartAnamnesis {
  return {
    chronicConditions: textValue(value?.chronicConditions),
    medications: textValue(value?.medications),
    allergies: textValue(value?.allergies),
    pregnancy: textValue(value?.pregnancy),
  };
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
