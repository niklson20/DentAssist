"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  TOOTH_STATUSES,
  TOOTH_SURFACES,
  toothStatusLabels,
  toothSurfaceLabels,
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

export type ToothRecord = {
  status: ToothStatus;
  surfaces: ToothSurface[];
};

export type ToothChange = {
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

const SURFACE_STATUSES = new Set<ToothStatus>(["caries", "filling"]);

function statusHasSurfaces(status: ToothStatus): boolean {
  return SURFACE_STATUSES.has(status);
}

function isPatientRight(tooth: FdiTooth): boolean {
  const quadrant = Number(tooth[0]);
  return quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;
}

function surfaceArea(tooth: FdiTooth, surface: ToothSurface): string {
  if (surface === "lingual") {
    return "inner";
  }
  if (surface === "vestibular") {
    return "outer";
  }
  if (surface === "occlusal") {
    return "center";
  }
  const mesialOnScreenRight = isPatientRight(tooth);
  if (surface === "mesial") {
    return mesialOnScreenRight ? "screen-right" : "screen-left";
  }
  return mesialOnScreenRight ? "screen-left" : "screen-right";
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("sr-Latn", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

export function toggleSurface(chart: ToothChart, tooth: FdiTooth, surface: ToothSurface): ToothChart {
  const current = chart.teeth[tooth];
  if (!statusHasSurfaces(current.status)) {
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

type OdontogramMapProps = {
  chart: ToothChart;
  selectedTooth: FdiTooth | null;
  onSelect: (tooth: FdiTooth) => void;
  onStatus: (status: ToothStatus) => void;
  onSurface: (surface: ToothSurface) => void;
};

function OdontogramMap({ chart, selectedTooth, onSelect, onStatus, onSurface }: OdontogramMapProps) {
  const selected = selectedTooth ? chart.teeth[selectedTooth] : null;

  return (
    <div className="odontogram">
      <div className="odontogram__arches" role="group" aria-label="Zubna mapa">
        {ARCHES.map((arch) => (
          <div key={arch.id} className="odontogram__arch" data-arch={arch.id}>
            <span className="odontogram__visually-hidden">{arch.label}</span>
            <div className="odontogram__side" data-side="patient-right">
              {arch.patientRight.map((tooth) => (
                <ToothButton
                  key={tooth}
                  tooth={tooth}
                  record={chart.teeth[tooth]}
                  selected={selectedTooth === tooth}
                  onSelect={onSelect}
                />
              ))}
            </div>
            <div className="odontogram__midline" aria-hidden="true" />
            <div className="odontogram__side" data-side="patient-left">
              {arch.patientLeft.map((tooth) => (
                <ToothButton
                  key={tooth}
                  tooth={tooth}
                  record={chart.teeth[tooth]}
                  selected={selectedTooth === tooth}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTooth && selected ? (
        <div className="odontogram__editor">
          <p className="odontogram__selected">Zub {selectedTooth}</p>
          <div className="odontogram__statuses" role="group" aria-label={`Status zuba ${selectedTooth}`}>
            {TOOTH_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="odontogram__status odontogram__mark"
                data-status={status}
                aria-pressed={selected.status === status}
                onClick={() => onStatus(status)}
              >
                {toothStatusLabels[status]}
              </button>
            ))}
          </div>
          {statusHasSurfaces(selected.status) ? (
            <div className="odontogram__surfaces" role="group" aria-label="Površine">
              {TOOTH_SURFACES.map((surface) => (
                <button
                  key={surface}
                  type="button"
                  className="odontogram__surface"
                  data-surface={surface}
                  data-area={surfaceArea(selectedTooth, surface)}
                  aria-pressed={selected.surfaces.includes(surface)}
                  onClick={() => onSurface(surface)}
                >
                  {toothSurfaceLabels[surface]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="odontogram__log" aria-labelledby="odontogram-log-title">
        <h3 id="odontogram-log-title" className="odontogram__log-title">
          Spisak izmena
        </h3>
        {chart.changes.length === 0 ? (
          <p className="odontogram__empty">Nema izmena.</p>
        ) : (
          <ul className="odontogram__changes">
            {chart.changes.map((change, index) => (
              <li key={`${change.at}-${change.tooth}-${change.to}-${index}`} className="odontogram__change">
                <time dateTime={change.at}>{formatWhen(change.at)}</time>
                <span>{change.actor}</span>
                <span>zub {change.tooth}</span>
                <span data-previous-status={change.from}>{toothStatusLabels[change.from]}</span>
                <span aria-hidden="true">→</span>
                <span data-next-status={change.to}>{toothStatusLabels[change.to]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ToothButton({
  tooth,
  record,
  selected,
  onSelect,
}: {
  tooth: FdiTooth;
  record: ToothRecord;
  selected: boolean;
  onSelect: (tooth: FdiTooth) => void;
}) {
  return (
    <button
      type="button"
      className="odontogram__tooth odontogram__mark"
      data-tooth={tooth}
      data-status={record.status}
      data-selected={selected}
      aria-pressed={selected}
      aria-label={`${tooth}, ${toothStatusLabels[record.status]}`}
      onClick={() => onSelect(tooth)}
    >
      {tooth}
    </button>
  );
}

type OdontogramProps = {
  actor: string;
  chart?: ToothChart;
  selectedTooth?: FdiTooth | null;
  panelId?: string;
};

function subscribeToPanel(panelId: string | undefined, onStoreChange: () => void): () => void {
  if (!panelId || typeof document === "undefined") {
    return () => {};
  }
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function readPanel(panelId: string | undefined): HTMLElement | null {
  if (!panelId || typeof document === "undefined") {
    return null;
  }
  return document.getElementById(panelId);
}

function serverPanel(): HTMLElement | null {
  return null;
}

export function Odontogram({
  actor,
  chart: chartProp,
  selectedTooth: selectedProp = null,
  panelId,
}: OdontogramProps) {
  const [chart, setChart] = useState<ToothChart>(() => chartProp ?? createToothChart());
  const [selectedTooth, setSelectedTooth] = useState<FdiTooth | null>(selectedProp);
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToPanel(panelId, onStoreChange),
    [panelId],
  );
  const getSnapshot = useCallback(() => readPanel(panelId), [panelId]);
  const panel = useSyncExternalStore(subscribe, getSnapshot, serverPanel);

  function changeStatus(status: ToothStatus) {
    if (!selectedTooth) {
      return;
    }
    setChart((current) =>
      applyStatusChange(current, {
        tooth: selectedTooth,
        status,
        actor,
        at: new Date().toISOString(),
      }),
    );
  }

  function changeSurface(surface: ToothSurface) {
    if (!selectedTooth) {
      return;
    }
    setChart((current) => toggleSurface(current, selectedTooth, surface));
  }

  if (panelId && !panel) {
    return null;
  }

  const map = (
    <OdontogramMap
      chart={chart}
      selectedTooth={selectedTooth}
      onSelect={setSelectedTooth}
      onStatus={changeStatus}
      onSurface={changeSurface}
    />
  );

  if (panel) {
    return createPortal(map, panel);
  }

  return map;
}
