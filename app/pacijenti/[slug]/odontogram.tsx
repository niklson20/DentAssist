"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { TrashSimple } from "@phosphor-icons/react";

import { saveToothStatus, saveToothSurfaces, undoToothChange } from "@/app/actions/teeth";
import {
  TOOTH_STATUSES,
  TOOTH_SURFACES,
  toothStatusAllowsSurfaces,
  toothStatusLabels,
  toothSurfaceLabels,
  type ToothStatus,
  type ToothSurface,
} from "@/lib/labels";

import {
  ARCHES,
  applyStatusChange,
  createToothChart,
  nextSelectedTooth,
  removeChange,
  toggleSurface,
  type FdiTooth,
  type ToothChart,
  type ToothChange,
  type ToothRecord,
} from "./tooth-chart";

export type { FdiTooth, ToothChart, ToothChange, ToothRecord };
export {
  applyStatusChange,
  createToothChart,
  nextSelectedTooth,
  removeChange,
  toggleSurface,
};

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

type OdontogramMapProps = {
  chart: ToothChart;
  selectedTooth: FdiTooth | null;
  busy: boolean;
  error: string | null;
  onSelect: (tooth: FdiTooth) => void;
  onStatus: (status: ToothStatus) => void;
  onSurface: (surface: ToothSurface) => void;
  onRemoveChange: (index: number) => void;
};

function OdontogramMap({
  chart,
  selectedTooth,
  busy,
  error,
  onSelect,
  onStatus,
  onSurface,
  onRemoveChange,
}: OdontogramMapProps) {
  const selected = selectedTooth ? chart.teeth[selectedTooth] : null;
  const latestIndexByTooth = new Map<FdiTooth, number>();
  chart.changes.forEach((change, index) => {
    if (!latestIndexByTooth.has(change.tooth)) {
      latestIndexByTooth.set(change.tooth, index);
    }
  });

  return (
    <div className="odontogram" aria-busy={busy}>
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
                disabled={busy}
                onClick={() => onStatus(status)}
              >
                {toothStatusLabels[status]}
              </button>
            ))}
          </div>
          {toothStatusAllowsSurfaces(selected.status) ? (
            <div className="odontogram__surfaces" role="group" aria-label="Površine">
              {TOOTH_SURFACES.map((surface) => (
                <button
                  key={surface}
                  type="button"
                  className="odontogram__surface"
                  data-surface={surface}
                  data-area={surfaceArea(selectedTooth, surface)}
                  aria-pressed={selected.surfaces.includes(surface)}
                  disabled={busy}
                  onClick={() => onSurface(surface)}
                >
                  {toothSurfaceLabels[surface]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="odontogram__error text-sm text-destructive">{error}</p> : null}

      <section className="odontogram__log" aria-labelledby="odontogram-log-title">
        <h3 id="odontogram-log-title" className="odontogram__log-title">
          Spisak izmena
        </h3>
        {chart.changes.length === 0 ? (
          <p className="odontogram__empty">Nema izmena.</p>
        ) : (
          <div className="odontogram__changes-wrap">
            <div className="odontogram__change odontogram__change-head" role="row">
              <span className="odontogram__change-label">Datum</span>
              <span className="odontogram__change-label">Ko</span>
              <span className="odontogram__change-label">Zub</span>
              <span className="odontogram__change-label">Izmena</span>
              <span className="odontogram__change-actions" aria-hidden="true" />
            </div>
            <ul className="odontogram__changes">
              {chart.changes.map((change, index) => {
                const canUndo = latestIndexByTooth.get(change.tooth) === index;
                return (
                  <li
                    key={change.id ?? `${change.at}-${change.tooth}-${change.to}-${index}`}
                    className="odontogram__change"
                  >
                    <time dateTime={change.at}>{formatWhen(change.at)}</time>
                    <span>{change.actor}</span>
                    <span>{change.tooth}</span>
                    <span className="odontogram__change-status">
                      <span data-previous-status={change.from}>{toothStatusLabels[change.from]}</span>
                      <span aria-hidden="true"> → </span>
                      <span data-next-status={change.to}>{toothStatusLabels[change.to]}</span>
                    </span>
                    <span className="odontogram__change-actions">
                      {canUndo ? (
                        <button
                          type="button"
                          className="odontogram__change-delete"
                          aria-label={`Obriši izmenu zuba ${change.tooth}`}
                          disabled={busy}
                          onClick={() => onRemoveChange(index)}
                        >
                          <TrashSimple aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
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
  patientId?: string;
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
  patientId,
  chart: chartProp,
  selectedTooth: selectedProp = null,
  panelId,
}: OdontogramProps) {
  const [chart, setChart] = useState<ToothChart>(() => chartProp ?? createToothChart());
  const [selectedTooth, setSelectedTooth] = useState<FdiTooth | null>(selectedProp);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToPanel(panelId, onStoreChange),
    [panelId],
  );
  const getSnapshot = useCallback(() => readPanel(panelId), [panelId]);
  const panel = useSyncExternalStore(subscribe, getSnapshot, serverPanel);

  useEffect(() => {
    if (chartProp) {
      setChart(chartProp);
    }
  }, [chartProp]);

  useEffect(() => {
    if (!selectedTooth) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".odontogram__editor") || target.closest(".odontogram__tooth")) {
        return;
      }
      setSelectedTooth(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedTooth]);

  function selectTooth(tooth: FdiTooth) {
    setSelectedTooth((current) => nextSelectedTooth(current, tooth));
  }

  function changeStatus(status: ToothStatus) {
    if (!selectedTooth) {
      return;
    }
    const tooth = selectedTooth;
    const previous = chart;
    const next = applyStatusChange(previous, {
      tooth,
      status,
      actor,
      at: new Date().toISOString(),
    });
    if (next === previous) {
      return;
    }
    setChart(next);
    setError(null);
    if (!patientId) {
      return;
    }
    startTransition(async () => {
      const result = await saveToothStatus({ patientId, fdiCode: tooth, status });
      if (!result.ok) {
        setChart(previous);
        setError(result.error);
        return;
      }
      setChart(result.data.chart);
    });
  }

  function changeSurface(surface: ToothSurface) {
    if (!selectedTooth) {
      return;
    }
    const tooth = selectedTooth;
    const previous = chart;
    const next = toggleSurface(previous, tooth, surface);
    if (next === previous) {
      return;
    }
    setChart(next);
    setError(null);
    if (!patientId) {
      return;
    }
    startTransition(async () => {
      const result = await saveToothSurfaces({
        patientId,
        fdiCode: tooth,
        surfaces: next.teeth[tooth].surfaces,
      });
      if (!result.ok) {
        setChart(previous);
        setError(result.error);
        return;
      }
      setChart(result.data.chart);
    });
  }

  function deleteChange(index: number) {
    const change = chart.changes[index];
    if (!change) {
      return;
    }
    const previous = chart;
    const next = removeChange(previous, index);
    setChart(next);
    setError(null);
    if (!patientId) {
      return;
    }
    if (!change.id) {
      setChart(previous);
      setError("Izmena nije pronađena.");
      return;
    }
    startTransition(async () => {
      const result = await undoToothChange({
        patientId,
        fdiCode: change.tooth,
        changeId: change.id,
      });
      if (!result.ok) {
        setChart(previous);
        setError(result.error);
        return;
      }
      setChart(result.data.chart);
    });
  }

  if (panelId && !panel) {
    return null;
  }

  const map = (
    <OdontogramMap
      chart={chart}
      selectedTooth={selectedTooth}
      busy={pending}
      error={error}
      onSelect={selectTooth}
      onStatus={changeStatus}
      onSurface={changeSurface}
      onRemoveChange={deleteChange}
    />
  );

  if (panel) {
    return createPortal(map, panel);
  }

  return map;
}
