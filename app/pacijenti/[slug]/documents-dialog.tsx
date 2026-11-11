"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import {
  confirmPatientFile,
  deletePatientFile,
  openPatientFile,
  preparePatientFileUpload,
  type PatientDocument,
} from "@/app/actions/files";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgrade, formatBelgradeDate, isDocumentLocked, isIsoDate, startOfBelgradeDay } from "@/lib/calendar-dates";
import { FILE_CATEGORIES, fileCategoryLabel, type FileCategory } from "@/lib/labels";

const MAX_FILE_BYTES = 10485760;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const SPACE = "Nema dovoljno prostora za ovaj fajl.";
const FILE_REQUIRED = "Izaberite fajl.";
const FILE_TOO_BIG = "Fajl može imati najviše 10 MB.";
const MIME_INVALID = "Dozvoljeni formati su JPEG, PNG, WebP i PDF.";
const TITLE_REQUIRED = "Unesite naslov.";
const CATEGORY_REQUIRED = "Izaberite kategoriju.";
const DATE_REQUIRED = "Unesite datum snimanja.";
const FUTURE = "Datum snimanja ne može biti u budućnosti.";
const LOCKED = "Dokument je zaključan.";
const SAVED = "Dokument je sačuvan.";

const controlClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type DocumentsDialogProps = {
  patientId: string;
  role: "owner" | "dentist" | "reception";
  documents: readonly PatientDocument[];
  now: Date;
  addOpen?: boolean;
};

export function DocumentsDialog({ role, ...props }: DocumentsDialogProps) {
  if (role !== "owner" && role !== "dentist") return null;
  return <ClinicalDocuments {...props} />;
}

function ClinicalDocuments({
  patientId,
  documents,
  now,
  addOpen = false,
}: Omit<DocumentsDialogProps, "role">) {
  const [items, setItems] = useState(documents);
  const [creating, setCreating] = useState(addOpen);
  const today = formatBelgradeDate(now);
  const visible = [...items].sort(byNewest);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Sadržaj fajla se ne zamenjuje.</p>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema dokumenata.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((document) => (
            <li key={document.id} className="rounded-md border border-border p-3">
              <DocumentRow
                document={document}
                now={now}
                onRemoved={(id) => setItems((current) => current.filter((item) => item.id !== id))}
              />
            </li>
          ))}
        </ul>
      )}
      <Button type="button" aria-haspopup="dialog" aria-expanded={creating} onClick={() => setCreating(true)}>
        Dodaj dokument
      </Button>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Novi dokument</DialogTitle>
            <DialogClose render={<Button type="button" variant="outline" />}>Zatvori</DialogClose>
          </div>
          <NewDocumentForm
            patientId={patientId}
            today={today}
            onCreated={(document) => {
              setItems((current) => [...current, document]);
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRow({
  document,
  now,
  onRemoved,
}: {
  document: PatientDocument;
  now: Date;
  onRemoved: (id: string) => void;
}) {
  const createdAt = new Date(document.createdAt);
  const locked = Number.isNaN(createdAt.getTime()) || isDocumentLocked(createdAt, now);
  const [deleteResult, deleteAction, deletePending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    async (previous, formData) => {
      const result = await deletePatientFile(previous, formData);
      if (result.ok) onRemoved(document.id);
      return result;
    },
    null,
  );
  const [accessError, setAccessError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const deleteError = deleteResult && !deleteResult.ok ? deleteResult.error : null;

  async function openFile(intent: "preview" | "download") {
    const data = new FormData();
    data.set("fileId", document.id);
    data.set("intent", intent);
    const result = await openPatientFile(null, data);
    if (!result.ok || !isHttpUrl(result.data.url)) {
      setPreview(null);
      setAccessError(result.ok ? UNAVAILABLE : result.error);
      return;
    }
    if (intent === "download") {
      const anchor = window.document.createElement("a");
      anchor.href = result.data.url;
      anchor.rel = "noopener";
      anchor.click();
      return;
    }
    setAccessError(null);
    setPreview({ url: result.data.url });
  }

  return (
    <article className="flex flex-col gap-3" aria-label={document.title}>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{document.title}</h3>
        <p className="text-sm text-muted-foreground">
          {fileCategoryLabel(document.category)}
          <span aria-hidden="true"> · </span>
          <time dateTime={document.capturedOn}>{captureLabel(document.capturedOn)}</time>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void openFile("preview")}>
          Pregled
        </Button>
        <Button type="button" variant="outline" onClick={() => void openFile("download")}>
          Preuzmi
        </Button>
        {!locked ? (
          <form action={deleteAction} className="ml-auto">
            <input type="hidden" name="fileId" value={document.id} />
            <Button type="submit" variant="destructive" disabled={deletePending}>
              Obriši
            </Button>
          </form>
        ) : null}
      </div>
      {accessError ? (
        <p role="alert" className="text-sm text-destructive">
          {accessError}
        </p>
      ) : null}
      {deleteError ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}
      {preview ? (
        <object
          data={preview.url}
          type={document.mimeType}
          aria-label={document.title}
          className="max-h-96 w-full rounded-md border border-border"
        >
          {document.title}
        </object>
      ) : null}
      {locked ? <p className="text-sm text-muted-foreground">{LOCKED}</p> : null}
    </article>
  );
}

function NewDocumentForm({
  patientId,
  today,
  onCreated,
}: {
  patientId: string;
  today: string;
  onCreated: (document: PatientDocument) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chosenName, setChosenName] = useState<string | null>(null);

  function onFileChange(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setChosenName(file?.name.trim() || null);
    setSaved(false);
    if (!file) {
      setError(null);
      return;
    }
    if (!isAllowedMime(file.type)) {
      setError(MIME_INVALID);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(FILE_TOO_BIG);
      return;
    }
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = selectedFile(form);
    const title = text(new FormData(form).get("title")).trim();
    const category = text(new FormData(form).get("category"));
    const capturedOn = text(new FormData(form).get("capturedOn"));
    if (!file) {
      setError(FILE_REQUIRED);
      setSaved(false);
      return;
    }
    if (!isAllowedMime(file.type)) {
      setError(MIME_INVALID);
      setSaved(false);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(FILE_TOO_BIG);
      setSaved(false);
      return;
    }
    if (!title) {
      setError(TITLE_REQUIRED);
      setSaved(false);
      return;
    }
    if (!isFileCategory(category)) {
      setError(CATEGORY_REQUIRED);
      setSaved(false);
      return;
    }
    if (!isIsoDate(capturedOn)) {
      setError(DATE_REQUIRED);
      setSaved(false);
      return;
    }
    if (capturedOn > today) {
      setError(FUTURE);
      setSaved(false);
      return;
    }

    const payload = new FormData();
    payload.set("patientId", patientId);
    payload.set("title", title);
    payload.set("category", category);
    payload.set("capturedOn", capturedOn);
    payload.set("mimeType", file.type);
    payload.set("sizeBytes", String(file.size));

    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const prepared = await preparePatientFileUpload(null, payload);
      if (!prepared.ok) {
        setError(firstFieldMessage(prepared) ?? prepared.error);
        return;
      }
      if (
        !prepared.data.path.startsWith(`${prepared.data.clinicId}/`) ||
        !isHttpUrl(prepared.data.uploadUrl) ||
        !prepared.data.uploadUrl.includes(prepared.data.clinicId)
      ) {
        setError(UNAVAILABLE);
        return;
      }

      let response: Response;
      try {
        response = await fetch(prepared.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      } catch {
        setError(UNAVAILABLE);
        return;
      }
      if (!response.ok) {
        setError(await storageWriteError(response));
        return;
      }

      payload.set("fileId", prepared.data.fileId);
      const confirmed = await confirmPatientFile(null, payload);
      if (!confirmed.ok) {
        setError(firstFieldMessage(confirmed) ?? confirmed.error);
        return;
      }

      onCreated({
        id: confirmed.data.id,
        title,
        category,
        capturedOn,
        createdAt: new Date().toISOString(),
        mimeType: file.type,
        sizeBytes: file.size,
      });
      form.reset();
      setChosenName(null);
      setSaved(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="novi-dokument" onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
      <Field id="document-title" label="Naslov">
        <Input id="document-title" name="title" maxLength={200} required />
      </Field>
      <Field id="document-category" label="Kategorija">
        <select id="document-category" name="category" defaultValue="" required className={controlClass}>
          <option value="" disabled>
            Izaberite
          </option>
          {FILE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {fileCategoryLabel(category)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="document-captured" label="Datum snimanja">
        <Input id="document-captured" name="capturedOn" type="date" max={today} required />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Fajl</span>
        <Input
          id="document-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={onFileChange}
        />
        <label
          htmlFor="document-file"
          className="inline-flex w-fit rounded-md border border-border bg-background px-2.5 py-2 text-sm font-medium text-foreground"
        >
          Izaberite fajl
        </label>
        {chosenName ? (
          <p className="text-sm text-muted-foreground">Fajl je izabran: {chosenName}</p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-foreground">
          {SAVED}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        Dodaj
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  message,
  children,
}: {
  id: string;
  label: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {message ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function firstFieldMessage(result: ActionResult<unknown>): string | null {
  if (result.ok || !result.fieldErrors) return null;
  for (const messages of Object.values(result.fieldErrors)) {
    const first = messages[0];
    if (first) return first;
  }
  return null;
}

function selectedFile(form: HTMLFormElement): File | null {
  const field = form.elements.namedItem("file");
  if (!(field instanceof HTMLInputElement)) return null;
  const file = field.files?.[0];
  if (!file || file.size <= 0) return null;
  return file;
}

async function storageWriteError(response: Response): Promise<string> {
  if (response.status === 413 || response.status === 507) return SPACE;
  try {
    const body = (await response.text()).toLowerCase();
    if (body.includes("quota") || body.includes("exceeded") || body.includes("payload too large")) return SPACE;
  } catch {
    return UNAVAILABLE;
  }
  return UNAVAILABLE;
}

function captureLabel(isoDate: string): string {
  if (!isIsoDate(isoDate)) return isoDate;
  return formatBelgrade(startOfBelgradeDay(isoDate), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function byNewest(left: PatientDocument, right: PatientDocument): number {
  const byCapture = right.capturedOn.localeCompare(left.capturedOn);
  if (byCapture !== 0) return byCapture;
  return right.createdAt.localeCompare(left.createdAt);
}

function isAllowedMime(value: string): value is PatientDocument["mimeType"] {
  return (ALLOWED_MIMES as readonly string[]).includes(value);
}

function isFileCategory(value: string): value is FileCategory {
  return (FILE_CATEGORIES as readonly string[]).includes(value);
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
