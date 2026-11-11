import {
  TOOTH_STATUSES,
  TOOTH_SURFACES,
  toothStatusAllowsSurfaces,
  type ToothStatus,
  type ToothSurface,
} from "@/lib/labels";

const ARCHES = [
  {
    id: "permanent-upper",
    label: "Stalni gornji",
    patientRight: ["18", "17", "16", "15", "14", "13", "12", "11"],
    patientLeft: ["21", "22", "23", "24", "25", "26", "27", "28"],
  },
  {
    id: "primary-upper",
    label: "Mlečni gornji",
    patientRight: ["55", "54", "53", "52", "51"],
    patientLeft: ["61", "62", "63", "64", "65"],
  },
  {
    id: "primary-lower",
    label: "Mlečni donji",
    patientRight: ["85", "84", "83", "82", "81"],
    patientLeft: ["71", "72", "73", "74", "75"],
  },
  {
    id: "permanent-lower",
    label: "Stalni donji",
    patientRight: ["48", "47", "46", "45", "44", "43", "42", "41"],
    patientLeft: ["31", "32", "33", "34", "35", "36", "37", "38"],
  },
] as const;

type Arch = (typeof ARCHES)[number];
export type FdiTooth = Arch["patientRight"][number] | Arch["patientLeft"][number];

const FDI_CODES = new Set<string>(
  ARCHES.flatMap((arch) => [...arch.patientRight, ...arch.patientLeft]),
);

const STATUS_SET = new Set<string>(TOOTH_STATUSES);
const SURFACE_SET = new Set<string>(TOOTH_SURFACES);

export type ToothRecord = {
  status: ToothStatus;
  surfaces: ToothSurface[];
};

export type ToothChange = {
  id?: string;
  at: string;
  actor: string;
  tooth: FdiTooth;
  from: ToothStatus;
  to: ToothStatus;
};

export type ToothChart = {
  teeth: Record<FdiTooth, ToothRecord>;
  changes: ToothChange[];
};

export type ToothStateRow = {
  id: string;
  fdi_code: string;
  status: string;
  surfaces: unknown;
};

export type ToothChangeRow = {
  id: string;
  tooth_state_id: string;
  old_status: string | null;
  new_status: string;
  old_surfaces: unknown;
  new_surfaces: unknown;
  changed_by: string | null;
  changed_at: string;
};

export type ToothMemberRow = {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
};

export function isFdiTooth(value: string): value is FdiTooth {
  return FDI_CODES.has(value);
}

export function isToothStatus(value: string): value is ToothStatus {
  return STATUS_SET.has(value);
}

export function createToothChart(): ToothChart {
  const teeth = {} as Record<FdiTooth, ToothRecord>;
  for (const arch of ARCHES) {
    for (const tooth of [...arch.patientRight, ...arch.patientLeft]) {
      teeth[tooth] = { status: "healthy", surfaces: [] };
    }
  }
  return { teeth, changes: [] };
}

export function applyStatusChange(
  chart: ToothChart,
  change: { tooth: FdiTooth; status: ToothStatus; actor: string; at: string },
): ToothChart {
  const current = chart.teeth[change.tooth];
  if (current.status === change.status) {
    return chart;
  }
  return {
    teeth: {
      ...chart.teeth,
      [change.tooth]: { status: change.status, surfaces: [] },
    },
    changes: [
      {
        at: change.at,
        actor: change.actor,
        tooth: change.tooth,
        from: current.status,
        to: change.status,
      },
      ...chart.changes,
    ],
  };
}

/** Removes a history row. If it is the newest change for that tooth, restores the previous status. */
export function removeChange(chart: ToothChart, index: number): ToothChart {
  const change = chart.changes[index];
  if (!change) {
    return chart;
  }

  const latestForTooth = chart.changes.findIndex((entry) => entry.tooth === change.tooth);
  const changes = chart.changes.filter((_, entryIndex) => entryIndex !== index);
  if (latestForTooth !== index) {
    return { ...chart, changes };
  }

  return {
    teeth: {
      ...chart.teeth,
      [change.tooth]: { status: change.from, surfaces: [] },
    },
    changes,
  };
}

export function nextSelectedTooth(current: FdiTooth | null, clicked: FdiTooth): FdiTooth | null {
  return current === clicked ? null : clicked;
}

export function toggleSurface(chart: ToothChart, tooth: FdiTooth, surface: ToothSurface): ToothChart {
  const current = chart.teeth[tooth];
  if (!toothStatusAllowsSurfaces(current.status)) {
    return chart;
  }
  const next = new Set(current.surfaces);
  if (next.has(surface)) {
    next.delete(surface);
  } else {
    next.add(surface);
  }
  return {
    ...chart,
    teeth: {
      ...chart.teeth,
      [tooth]: {
        ...current,
        surfaces: TOOTH_SURFACES.filter((item) => next.has(item)),
      },
    },
  };
}

/** Surfaces payload for tooth_states: null when empty or status forbids surfaces. */
export function surfacesForDb(status: ToothStatus, surfaces: ToothSurface[]): ToothSurface[] | null {
  if (!toothStatusAllowsSurfaces(status) || surfaces.length === 0) {
    return null;
  }
  return TOOTH_SURFACES.filter((item) => surfaces.includes(item));
}

export function parseSurfaces(value: unknown): ToothSurface[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const found = new Set<ToothSurface>();
  for (const item of value) {
    if (typeof item === "string" && SURFACE_SET.has(item)) {
      found.add(item as ToothSurface);
    }
  }
  return TOOTH_SURFACES.filter((item) => found.has(item));
}

export function actorLabelForMember(member: ToothMemberRow | undefined): string {
  if (!member) {
    return "—";
  }
  const name = `${member.first_name.trim()} ${member.last_name.trim()}`.trim();
  return name || "—";
}

export function toothChartFromRows(
  states: ToothStateRow[],
  changes: ToothChangeRow[],
  members: ToothMemberRow[],
): ToothChart {
  const chart = createToothChart();
  const fdiByStateId = new Map<string, FdiTooth>();
  const membersById = new Map(members.map((member) => [member.id, member]));

  for (const row of states) {
    if (!isFdiTooth(row.fdi_code) || !isToothStatus(row.status)) {
      continue;
    }
    fdiByStateId.set(row.id, row.fdi_code);
    chart.teeth[row.fdi_code] = {
      status: row.status,
      surfaces: toothStatusAllowsSurfaces(row.status) ? parseSurfaces(row.surfaces) : [],
    };
  }

  const mapped: ToothChange[] = [];
  for (const row of changes) {
    const tooth = fdiByStateId.get(row.tooth_state_id);
    if (!tooth || !isToothStatus(row.new_status)) {
      continue;
    }
    const from = row.old_status && isToothStatus(row.old_status) ? row.old_status : "healthy";
    mapped.push({
      id: row.id,
      at: row.changed_at,
      actor: actorLabelForMember(
        row.changed_by ? membersById.get(row.changed_by) : undefined,
      ),
      tooth,
      from,
      to: row.new_status,
    });
  }

  mapped.sort((left, right) => {
    const time = right.at.localeCompare(left.at);
    if (time !== 0) {
      return time;
    }
    return (right.id ?? "").localeCompare(left.id ?? "");
  });
  chart.changes = mapped;
  return chart;
}

export { ARCHES };
