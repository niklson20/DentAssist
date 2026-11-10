import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync(path.join(process.cwd(), "app/danas/appointment-card.tsx"), "utf8");

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

  it("asks for confirmation before no-show and complete", () => {
    expect(cardSource).toContain("Jeste li sigurni?");
    expect(cardSource).toContain("Odustani");
    expect(cardSource).toContain('setConfirmStatus("no_show")');
    expect(cardSource).toContain('setConfirmStatus("completed")');
    expect(cardSource).toContain("Termin će biti označen kao „Nije došao“.");
    expect(cardSource).toContain("Termin će biti označen kao završen.");
  });

  it("offers complete on the right for canComplete and opens the visit form after success", () => {
    expect(cardSource).toContain("canComplete");
    expect(cardSource).toContain("Završen");
    expect(cardSource).toContain("Završavam…");
    expect(cardSource).toContain('value="completed"');
    expect(cardSource).toContain('variant="default"');
    expect(cardSource).toContain("ml-auto");
    expect(cardSource).toContain("VisitForm");
    expect(cardSource).toContain("Zapis posete");
    expect(cardSource).toContain("openVisitDialog");
    expect(cardSource).toContain('status: "completed"');
    expect(cardSource).toContain("visit={null}");
    expect(cardSource).toContain("embedded");

    const completeGate = cardSource.indexOf("{canComplete ? (");
    expect(completeGate).toBeGreaterThan(-1);
    const completeBlock = cardSource.slice(completeGate, cardSource.indexOf(") : null}", completeGate) + ") : null}".length);
    expect(completeBlock).toContain("Završen");
    expect(completeBlock).toContain("ml-auto");
    expect(completeBlock).toContain('variant="default"');
    expect(completeBlock).toContain('setConfirmStatus("completed")');
    expect(completeBlock).toContain(": null");

    const completeFormStart = cardSource.indexOf('value="completed"');
    const completeFormSlice = cardSource.slice(
      cardSource.lastIndexOf("<form", completeFormStart),
      cardSource.indexOf("</form>", completeFormStart) + "</form>".length,
    );
    expect(completeFormSlice).toContain('value="completed"');
    expect(completeFormSlice).toContain("Potvrdi");
  });
});
