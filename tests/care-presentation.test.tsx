import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getCarePillVisual } from "../src/app/carePresentation.js";

test("watering icons follow the translated care-list labels", () => {
  for (const label of ["Watering", "Zálievka", "Bewässerung", "Arrosage", "Riego"]) {
    const markup = renderToStaticMarkup(getCarePillVisual(label, "", 7));
    assert.match(markup, /pill-water-medium/, label);
    assert.doesNotMatch(markup, /pill-pot/, label);
  }
});

test("watering icons preserve low, medium, and high care requirements", () => {
  for (const [interval, level] of [[14, "low"], [7, "medium"], [5, "high"]] as const) {
    const markup = renderToStaticMarkup(getCarePillVisual("Zálievka", "", interval));
    assert.ok(markup.includes(`pill-water-${level}`));
  }
  assert.match(renderToStaticMarkup(getCarePillVisual("Zálievka", "Po úplnom vyschnutí", 7)), /pill-water-low/);
});

test("care icons preserve light, humidity, and difficulty levels", () => {
  const cases = [
    ["Svetlo", "Plné slnko", "sun-full"],
    ["Svetlo", "Rozptýlené svetlo", "sun-half"],
    ["Svetlo", "Polotieň", "sun-low"],
    ["Vlhkosť", "Nízka", "humidity-low"],
    ["Vlhkosť", "Stredná", "humidity-medium"],
    ["Vlhkosť", "Vysoká", "humidity-high"],
    ["Náročnosť", "Nenáročná", "difficulty-easy"],
    ["Náročnosť", "Stredná", "difficulty-medium"],
    ["Náročnosť", "Náročná", "difficulty-hard"],
  ];
  for (const [label, value, level] of cases) {
    assert.ok(renderToStaticMarkup(getCarePillVisual(label, value, 7)).includes(`pill-${level}`));
  }
});

test("every care category uses a bounded decorative SVG, including unknown labels", () => {
  for (const label of ["Svetlo", "Zálievka", "Vlhkosť", "Náročnosť", "Substrát", "", "Unknown"]) {
    const markup = renderToStaticMarkup(getCarePillVisual(label, "", 7));
    assert.match(markup, /^<span[^>]*aria-hidden="true"><svg/);
    assert.match(markup, /viewBox="0 0 24 24"/);
    assert.doesNotMatch(markup, /<span><\/span>/);
  }
});
