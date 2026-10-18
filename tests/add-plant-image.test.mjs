import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const text = readFileSync("src/App.tsx", "utf8") + "\n" + readFileSync("src/features/plants/components/AddPlantModal.tsx", "utf8");
const app = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pickers = [];
const visit = node => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "ImageSourcePicker") pickers.push(node.getText(app));
  ts.forEachChild(node, visit);
};
visit(app);

// Runtime selection, cancellation, unmount and retry behavior are exercised by
// the real React hook/component in test:image-browser. These assert App wiring.
test("Add Plant and Diagnosis both mount the shared picker and selection hook", () => {
  assert.equal(pickers.length, 2);
  assert.ok(pickers.some(picker => picker.includes("onSelect={newImageSelection.select}")));
  assert.ok(pickers.some(picker => picker.includes("onSelect={handleDiagnosisImageChange}")));
  assert.match(text, /await diagnosisImageSelection\.select\(source, file, pickerLabels\)/);
  assert.equal((text.match(/= useImageSelection\(/g) ?? []).length, 2);
  assert.doesNotMatch(text, /captureImage\(|newImageCaptureRef|diagnosisCaptureRef/);
});

test("both plant workflows use the same modal, preview and status components", () => {
  assert.equal((text.match(/<PlantActionModal /g) ?? []).length, 2);
  assert.equal((text.match(/<PlantImagePreview /g) ?? []).length, 2);
  assert.equal((text.match(/<PlantFormStatus>/g) ?? []).length, 2);
  assert.doesNotMatch(text, /Premium: unlimited plants/);
});

test("plant submission refuses an in-flight selection and resets the form only after saving", () => {
  const handler = text.slice(text.indexOf("const handleAddCustomFlower"), text.indexOf("const handleGenerateCarePreview"));
  assert.match(handler, /plantSubmissionRef\.current \|\| newImageSelection\.isBusy\(\)/);
  assert.ok(handler.indexOf("await addPlantFromPhoto(") < handler.indexOf("newImageSelection.clear()"));
  assert.match(handler, /if \(!customFlower \|\| !isHouseholdOperationCurrent\(\)\) return/);
  assert.match(handler, /save: addFlower/);
  assert.match(text, /newImageSelection\.cancel\(\)/);
});
