import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("App.tsx", readFileSync("src/App.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (predicate) => {
  let result;
  const visit = (node) => { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); };
  visit(source);
  assert.ok(result, "Production add-plant image flow must exist");
  return result;
};
const handler = find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === "handleNewPlantImageCapture").initializer.getText(source);
const photoInput = find((node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "input"
  && node.getText(source).includes('handleNewPlantImageCapture("gallery"'));
const script = ts.transpileModule(`globalThis.handle = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const fixture = ({ native = false, previous = null, reject = false } = {}) => {
  const calls = [], statuses = [], revoked = [];
  const image = { dataUrl: "fixture-image", previewUrl: "blob:new", name: "plant.jpg" };
  let saved = previous;
  const context = {
    isHouseholdOperationCurrent: () => true, newImageCaptureRef: { current: null }, isAddingPlant: false,
    isNativeImageRuntime: native, newPlantImage: previous, selectedLanguage: "sk", Symbol,
    URL: { revokeObjectURL: (value) => revoked.push(value) },
    t: (key) => key, imageErrorMessage: () => null,
    setIsCapturingNewPlantImage: (value) => calls.push(["busy", value]),
    setNewPlantStatus: (value) => statuses.push(value), setNewPlantImage: (value) => { saved = value; },
    captureImage: async (input) => { calls.push(["capture", input]); if (!input.file && !native) throw new Error("Choose a photo"); return image; },
    validatePlantImageForUpload: async () => { calls.push(["validate"]); if (reject) throw new Error("Validation unavailable"); },
  };
  vm.runInNewContext(script, context);
  return { context, calls, statuses, revoked, image, saved: () => saved, run: context.handle };
};

test("empty browser selections leave the add-plant form and previous photo untouched", async () => {
  for (const previous of [null, { previewUrl: "blob:previous" }]) {
    const state = fixture({ previous });
    await state.run("gallery");
    assert.deepEqual(state.calls, []);
    assert.deepEqual(state.statuses, []);
    assert.equal(state.saved(), previous);
    assert.deepEqual(state.revoked, []);
  }
});

test("selected browser files are processed and validated before replacing the photo", async () => {
  const state = fixture({ previous: { previewUrl: "blob:previous" } });
  const file = new File(["fixture"], "plant.jpg", { type: "image/jpeg" });
  await state.run("gallery", file);
  assert.equal(state.calls.find(([kind]) => kind === "capture")[1].file, file);
  assert.equal(state.calls.filter(([kind]) => kind === "validate").length, 1);
  assert.equal(state.saved(), state.image);
  assert.deepEqual(state.revoked, ["blob:previous"]);
  assert.equal(state.statuses.at(-1), "image.ready");
  assert.equal(state.context.newImageCaptureRef.current, null);
});

test("a failed replacement preserves the existing photo and releases only the rejected preview", async () => {
  const previous = { previewUrl: "blob:previous" }, state = fixture({ previous, reject: true });
  await state.run("gallery", new File(["fixture"], "plant.jpg"));
  assert.equal(state.saved(), previous);
  assert.deepEqual(state.revoked, ["blob:new"]);
  assert.equal(state.context.newImageCaptureRef.current, null);
});

test("native camera and gallery buttons still capture without a browser File", async () => {
  for (const source of ["camera", "gallery"]) {
    const state = fixture({ native: true });
    await state.run(source);
    assert.equal(state.saved(), state.image);
    assert.equal(state.statuses.at(-1), "image.ready");
  }
});

test("the selected File stays attached until processing settles, then can be selected again", async () => {
  const onChange = photoInput.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(source) === "onChange").initializer.expression.getText(source);
  let finish, calls = 0;
  const context = { handleNewPlantImageCapture: async (_source, file) => {
    calls++;
    assert.ok(file instanceof File);
    await new Promise((resolve) => { finish = resolve; });
  } };
  vm.runInNewContext(ts.transpileModule(`globalThis.change = ${onChange}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const input = { files: [new File(["fixture"], "plant.jpg")], value: "selected-photo" };
  context.change({ target: input, currentTarget: input });
  assert.equal(input.value, "selected-photo", "Do not detach Android gallery files while reading them");
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(input.value, "");
  input.files = [];
  context.change({ target: input, currentTarget: input });
  assert.equal(calls, 1, "Cancellation or an empty follow-up event must not start processing");
});

test("add-plant file input has exactly one label ancestor", () => {
  let labels = 0;
  for (let parent = photoInput.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "label") labels++;
  }
  assert.equal(labels, 1, "Nested labels can activate a file picker more than once");
});
