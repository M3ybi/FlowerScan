import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell, navigationPageForRoute } from "../src/components/AppShell";
import { PlantPagination } from "../src/components/PlantPagination";
import { BackLink } from "../src/components/BackLink";
import { MobileBottomNav } from "../src/components/AppNavigation";
import { parseHashRoute } from "../src/app/routes";
import { clampPage, pageCountForItems } from "../src/hooks/usePagination";
import { createTranslator } from "../src/lib/i18n";

const t = createTranslator("sk");

test("compact mobile labels preserve the full action's accessible name", () => {
  const german = createTranslator("de");
  const html = renderToStaticMarkup(<MobileBottomNav currentPage="plants" onAddPlant={() => {}} t={german} />);
  assert.ok(html.includes(german("nav.mobileAddPlant")));
  assert.ok(html.includes(`aria-label="${german("dashboard.addPlant")}"`));
  assert.ok(html.includes(`aria-label="${german("nav.diagnose")}"`));
  assert.ok(html.includes("Menü"));
  assert.equal(t("nav.mobileAddPlant"), "Pridať rastlinu");
  assert.equal(t("nav.mobileDiagnose"), "Diagnóza");
});

test("the shared back control preserves each explicit parent destination", () => {
  for (const href of ["#/", "#/menu"] as const) {
    const label = href === "#/menu" ? t("nav.backToMenu") : t("nav.back");
    const html = renderToStaticMarkup(<BackLink href={href} label={label} />);
    assert.equal(html.match(/<a /g)?.length, 1);
    assert.match(html, /class="icon-link floating-back-link"/);
    assert.ok(html.includes(`href="${href}"`));
    assert.ok(html.includes(`aria-label="${label}"`));
    assert.equal(html.match(/<svg /g)?.length, 1);
  }
});

test("pagination labels retain Slovak diacritics", () => {
  assert.equal(t("pagination.first"), "Prvá stránka");
  assert.equal(t("pagination.previous"), "Predchádzajúca stránka");
  assert.equal(t("pagination.next"), "Nasledujúca stránka");
  assert.equal(t("pagination.last"), "Posledná stránka");
});

test("nested plant and menu routes retain their parent navigation destination", () => {
  for (const [hash, expected] of [
    ["#/", "plants"], ["#/flower/test?panel=diagnostics&scan=1", "plants"],
    ["#/diagnose", "diagnose"], ["#/qr", "qr"], ["#/menu?section=household", "menu"],
    ["#/account?section=subscription", "menu"], ["#/terms", "menu"], ["#/join?invite=test", "menu"],
  ]) assert.equal(navigationPageForRoute(parseHashRoute(hash)), expected, hash);
});

test("the authenticated shell renders exactly one navigation and the established modal slot", () => {
  const render = (enabled: boolean) => renderToStaticMarkup(
    <AppShell enabled={enabled} route={parseHashRoute("#/flower/test?panel=diagnostics")}
      t={t} onAddPlant={() => {}} addPlantModal={<section role="dialog">Add plant</section>}>
      <main>Plant details</main>
    </AppShell>,
  );
  const html = render(true);
  assert.equal(html.match(/class="mobile-bottom-nav"/g)?.length, 1);
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /aria-current="page" class="active" href="#\/"/);
  assert.equal(html.match(/<a /g)?.length, 4);
  assert.equal(html.match(/<button /g)?.length, 1);
  assert.equal(html.match(/role="dialog"/g)?.length, 1);
  assert.equal(render(false), "<main>Plant details</main>");
});

test("pagination bounds empty, single and changing collections while preserving valid pages", () => {
  for (const [count, pages] of [[0, 1], [1, 1], [10, 1], [11, 2], [23, 3]]) {
    assert.equal(pageCountForItems(count, 10), pages);
  }
  assert.equal(clampPage(3, pageCountForItems(20, 10)), 2);
  assert.equal(clampPage(2, pageCountForItems(19, 10)), 2);
  assert.equal(clampPage(2, pageCountForItems(21, 10)), 2);
  assert.equal(clampPage(3, pageCountForItems(0, 10)), 1);
  assert.equal(clampPage(0, 3), 1);
});

test("pagination uses four SVG controls with localized status and native boundary semantics", () => {
  const render = (page: number, pageCount = 3) => renderToStaticMarkup(<PlantPagination page={page} pageCount={pageCount} setPage={() => {}} t={t} />);
  for (const page of [1, 2, 3, 99]) {
    const html = render(page);
    const buttons = html.match(/<button[^>]*>/g)!;
    assert.equal(buttons.length, 4);
    assert.equal(html.match(/<svg /g)?.length, 4);
    assert.ok(html.includes(`aria-label="${t("pagination.status", { page: Math.min(page, 3), total: 3 })}"`));
    assert.match(html, new RegExp(`<strong>${Math.min(page, 3)}</strong>`));
    assert.equal(html.match(/role="status"/g)?.length, 1);
    assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.equal(buttons[0].includes("disabled="), page === 1);
    assert.equal(buttons[1].includes("disabled="), page === 1);
    assert.equal(buttons[2].includes("disabled="), page >= 3);
    assert.equal(buttons[3].includes("disabled="), page >= 3);
    for (const key of ["first", "previous", "next", "last"]) assert.ok(html.includes(t(`pagination.${key}`)));
  }
  assert.equal(render(1, 1), "");
  assert.equal(render(1, 0), "");
});
