import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync(path.join(process.cwd(), "app/danas/appointment-card.tsx"), "utf8");
const formSource = readFileSync(path.join(process.cwd(), "app/danas/visit-form.tsx"), "utf8");

describe("appointment card status actions", () => {
  it("offers no-show separately from cancel for scheduled appointments", () => {
    expect(cardSource).toContain('status === "scheduled"');
    expect(cardSource).toContain("Nije došao");
    expect(cardSource).toContain('value="no_show"');
    expect(cardSource).toContain("Označavam…");
    expect(cardSource).toContain("Otkaži termin");
    expect(cardSource).toContain('value="cancelled"');
    expect(cardSource).toContain('name="poruka"');
    expect(cardSource).toContain("required");

    const noShowFormStart = cardSource.indexOf('value="no_show"');
    const cancelReasonRequired = cardSource.indexOf("required");
    const cancelFormStatus = cardSource.indexOf('value="cancelled"');
    expect(noShowFormStart).toBeGreaterThan(-1);
    expect(cancelFormStatus).toBeGreaterThan(-1);
    expect(cancelReasonRequired).toBeGreaterThan(-1);

    const noShowFormSlice = cardSource.slice(
      cardSource.lastIndexOf("<form", noShowFormStart),
      cardSource.indexOf("</form>", noShowFormStart) + "</form>".length,
    );
    expect(noShowFormSlice).toContain('value="no_show"');
    expect(noShowFormSlice).toContain("Potvrdi");
    expect(noShowFormSlice).not.toContain('name="poruka"');
    expect(noShowFormSlice).not.toContain("required");
  });

  it("asks for confirmation before no-show only", () => {
    expect(cardSource).toContain("Jeste li sigurni?");
    expect(cardSource).toContain("Odustani");
    expect(cardSource).toContain("setConfirmNoShow(true)");
    expect(cardSource).toContain("Termin će biti označen kao „Nije došao“.");
    expect(cardSource).not.toContain("Termin će biti označen kao završen.");
    expect(cardSource).not.toContain('setConfirmStatus("completed")');
    expect(cardSource).not.toContain('value="completed"');
  });

  it("opens the visit form from Završen without completing the appointment first", () => {
    expect(cardSource).toContain("canComplete");
    expect(cardSource).toContain("Završen");
    expect(cardSource).toContain('variant="default"');
    expect(cardSource).toContain("ml-auto");
    expect(cardSource).toContain("VisitForm");
    expect(cardSource).toContain("Zapis posete");
    expect(cardSource).toContain("openVisitDialog");
    expect(cardSource).toContain("onComplete={onComplete}");
    expect(cardSource).toContain("onClick={onComplete}");
    expect(cardSource).toContain("completeOnSave={visitTarget.status === \"scheduled\"}");
    expect(cardSource).toContain("status: visitTarget.status");
    expect(cardSource).toContain("visit={null}");
    expect(cardSource).toContain("embedded");
    expect(cardSource).toContain("onSaved={() => setVisitTarget(null)}");
    expect(formSource).toContain("completeOnSave");
    expect(formSource).toContain("onSaved");
    expect(formSource).toContain("result?.ok");

    const completeGate = cardSource.indexOf("{canComplete ? (");
    expect(completeGate).toBeGreaterThan(-1);
    const completeBlock = cardSource.slice(completeGate, cardSource.indexOf(") : null}", completeGate) + ") : null}".length);
    expect(completeBlock).toContain("Završen");
    expect(completeBlock).toContain("ml-auto");
    expect(completeBlock).toContain('variant="default"');
    expect(completeBlock).toContain("onClick={onComplete}");
    expect(completeBlock).not.toContain("Završavam…");
  });
});
