import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { InvitationCenterOverlay } from "../../src/components/InvitationCenterOverlay";
import { HouseholdInvitationInbox, InvitationInboxButton } from "../../src/components/HouseholdInvitationInbox";
import { HouseholdInvitationReview } from "../../src/components/HouseholdInvitationReview";
import { useHouseholdDirectory } from "../../src/hooks/useHouseholdDirectory";
import { useHouseholdInvitations } from "../../src/hooks/useHouseholdInvitations";
import type { Household, HouseholdInvitation } from "../../src/lib/plantieRepository";

const verifiedUser = { id: "fixture-user", email: "guest@example.invalid", email_confirmed_at: "2026-10-07T10:00:00Z" } as User;
// Match production's seven-day lifetime without overflowing browser timers.
const fixtureExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const makeInvitation = (index = 1): HouseholdInvitation => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  householdId: `family-${index}`, householdName: index === 1 ? "Fern family" : `Garden family ${index}`,
  invitedEmail: verifiedUser.email!, inviterEmail: "owner@example.invalid", role: "viewer",
  status: "pending", expiresAt: fixtureExpiresAt, activeMemberCount: 2, maxSlots: 3, isMember: false,
});
const makeHousehold = (id: string, name: string): Household => ({
  id, name, legacyPublicToken: null, createdBy: verifiedUser.id,
  createdAt: "2026-10-07T10:00:00Z", updatedAt: "2026-10-07T10:00:00Z",
});

// Only repository/auth boundaries are substitutes. All mounted UI, hook state,
// focus listeners, actionable filtering and CSS come from production modules.
let repositoryRows = [makeInvitation()];
let nextLookup: Promise<HouseholdInvitation[]> | null = null;
let failNextLookup = false;
let repositoryHouseholds = [makeHousehold("original-home", "Original household")];
let nextDirectoryLookup: Promise<Household[]> | null = null;
let failNextDirectoryLookup = false;
let acceptCalls = 0;
let declineCalls = 0;
const listInvitations = async () => {
  if (nextLookup) { const response = nextLookup; nextLookup = null; return response; }
  if (failNextLookup) { failNextLookup = false; throw new Error("Fixture repository unavailable"); }
  return [...repositoryRows];
};
const listHouseholds = async () => {
  if (nextDirectoryLookup) { const response = nextDirectoryLookup; nextDirectoryLookup = null; return response; }
  if (failNextDirectoryLookup) { failNextDirectoryLookup = false; throw new Error("Fixture directory unavailable"); }
  return [...repositoryHouseholds];
};
const acceptInvitation = async (invitation: HouseholdInvitation) => {
  acceptCalls += 1;
  repositoryRows = repositoryRows.filter((row) => row.id !== invitation.id);
  const household = makeHousehold(invitation.householdId, invitation.householdName);
  repositoryHouseholds = [...repositoryHouseholds.filter((row) => row.id !== household.id), household];
  return household;
};
const declineInvitation = async (invitation: HouseholdInvitation) => {
  declineCalls += 1;
  repositoryRows = repositoryRows.filter((row) => row.id !== invitation.id);
};
let controls: {
  refresh: (force?: boolean) => Promise<void>;
  refreshDirectory: (force?: boolean) => Promise<Household[] | null>;
  includeConfirmedHousehold: (household: Household) => void;
  setUser: (user: User) => void;
} | null = null;

const Fixture = () => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [user, setUser] = useState(verifiedUser);
  const inbox = useHouseholdInvitations(user, listInvitations);
  const directory = useHouseholdDirectory(user.id, listHouseholds);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HouseholdInvitation | null>(null);
  const [accepted, setAccepted] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [activeHousehold, setActiveHousehold] = useState("original-home");
  controls = { refresh: inbox.refresh, refreshDirectory: directory.refresh, includeConfirmedHousehold: directory.includeConfirmedHousehold, setUser };
  const close = () => { setOpen(false); setSelected(null); setAccepted(null); };
  return <main className="fixture-shell">
    <header className="hero" data-fixture-header><h1>My plants</h1><InvitationInboxButton buttonRef={anchorRef} count={inbox.invitations.length} loading={inbox.loading} expanded={open} language="en" onClick={() => { setSelected(null); setAccepted(null); setOpen((value) => !value); }} /></header>
    <section className="fixture-content" data-fixture-outside><h2>Your household garden</h2><p>Invitation center fixture using the production components and stylesheet.</p><output id="fixture-active-household">{activeHousehold}</output><span id="fixture-household-directory" data-error={directory.error} data-user={user.id} style={{ display: "none" }}>{JSON.stringify(directory.households)}</span></section>
    {open ? <InvitationCenterOverlay anchorRef={anchorRef} mode={selected ? "details" : "inbox"} title={accepted ? "Membership confirmed" : selected ? `Join ${selected.householdName}` : "Household invitations"} busy={Boolean(busy)} onClose={close} onBack={selected && !accepted ? () => setSelected(null) : undefined}>
      {selected ? <HouseholdInvitationReview key={selected.id} invitation={selected} user={user} language="en" loading={false} error={false} accepting={busy === "accept"} declining={busy === "decline"} acceptedHousehold={accepted}
        onAccept={(invitation) => { setBusy("accept"); void acceptInvitation(invitation).then((household) => { inbox.removeInvitation(invitation.id); directory.includeConfirmedHousehold(household); setAccepted(household); }).finally(() => setBusy(null)); }}
        onDecline={(invitation) => { setBusy("decline"); void declineInvitation(invitation).then(() => { inbox.removeInvitation(invitation.id); setSelected(null); }).finally(() => setBusy(null)); }}
        onUseAnotherAccount={() => undefined} onCancel={close} onStay={close} onSwitch={(householdId) => { if (directory.households.some((household) => household.id === householdId)) { setActiveHousehold(householdId); close(); } }} onRetry={() => { void inbox.refresh(true); }} />
        : <HouseholdInvitationInbox invitations={inbox.invitations} loading={inbox.loading} error={inbox.error} language="en" onView={setSelected} onClose={close} onRetry={() => { void inbox.refresh(true); }} />}
    </InvitationCenterOverlay> : null}
  </main>;
};

const requestedScene = new URLSearchParams(location.search).get("scene") ?? "inbox";
type Result = { checks: string[]; failures: string[]; scene: string; mobile: boolean; viewport: { width: number; height: number }; limitations: string[] };
const result: Result = { checks: [], failures: [], scene: requestedScene, mobile: matchMedia("(max-width: 780px)").matches, viewport: { width: innerWidth, height: innerHeight }, limitations: ["Programmatic DOM events, not trusted physical keyboard/pointer input.", "Repository-boundary fixture, not the full App or live authentication/backend flow.", "Fixture decline handler returns to the inbox; it does not validate the App's terminal decline handler."] };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const check = (message: string, assertion: () => void) => { assertion(); result.checks.push(message); };
const waitFor = async (condition: () => unknown, label: string) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const value = document.querySelector<T>(selector);
  assert(value, `Missing element ${selector}`);
  return value!;
};
const buttonNamed = (name: string, scope: ParentNode = document): HTMLButtonElement => {
  const value = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === name || button.getAttribute("aria-label") === name);
  assert(value, `Missing button ${name}`);
  return value!;
};
const dialog = () => document.querySelector<HTMLElement>(".invitation-center-dialog");
const trigger = () => element<HTMLButtonElement>(".invitation-inbox-trigger");
const directoryRows = (): Household[] => JSON.parse(element("#fixture-household-directory").textContent!);
const openCenter = async () => {
  trigger().focus(); trigger().click();
  await waitFor(() => dialog() && document.activeElement === dialog(), "center opening and focus");
};
const closeWithEscape = async () => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await waitFor(() => !dialog() && document.activeElement === trigger(), "Escape close and focus return");
};
const reloadRows = async (rows: HouseholdInvitation[]) => {
  repositoryRows = rows;
  assert(controls, "Hook controls are available");
  await controls!.refresh(true);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const expectedBadge = rows.length > 9 ? "9+" : String(rows.length);
  await waitFor(() => trigger().getAttribute("aria-busy") === "false" && (rows.length === 0
    ? !document.querySelector(".invitation-inbox-badge")
    : document.querySelector(".invitation-inbox-badge")?.textContent === expectedBadge), "repository refresh render");
};
const focusables = () => Array.from(dialog()!.querySelectorAll<HTMLElement>("button,[href],input,select,textarea,[tabindex]"))
  .filter((target) => target.tabIndex >= 0 && !target.matches(":disabled") && target.getClientRects().length > 0);

const run = async () => {
  await waitFor(() => controls && document.querySelector(".invitation-inbox-badge")?.textContent === "1" && directoryRows().some((household) => household.id === "original-home"), "initial invitation and directory queries");
  check("mail trigger is a semantic dialog button with one pending invitation", () => {
    assert(trigger().getAttribute("aria-haspopup") === "dialog", "Missing dialog popup semantics");
    assert(trigger().getAttribute("aria-expanded") === "false", "Initially closed");
    assert(trigger().getAttribute("aria-label")?.includes("1"), "Accessible pending count");
  });
  await openCenter();
  await waitFor(() => dialog()!.style.getPropertyValue("--invitation-top"), "positioning effect");
  check("click mounts a body portal outside the clipped header", () => {
    assert(element(".invitation-center-overlay").parentElement === document.body, "Overlay must portal to body");
    assert(!element("[data-fixture-header]").contains(dialog()), "Header must not contain dialog");
    assert(getComputedStyle(element("[data-fixture-header]")).overflow === "hidden", "Fixture reproduces clipped header");
    assert(document.body.style.overflow === "hidden", "Open modal locks scrolling");
  });
  check("real stylesheet keeps the inbox within the viewport", () => {
    const panel = dialog()!.getBoundingClientRect();
    assert(panel.width > 250 && panel.height > 80, "Inbox must have visible dimensions");
    assert(panel.left >= -1 && panel.right <= innerWidth + 1 && panel.top >= -1 && panel.bottom <= innerHeight + 1, `Panel outside viewport: ${JSON.stringify(panel.toJSON())}`);
    if (result.mobile) {
      assert(Math.abs(panel.bottom - innerHeight) <= 2, "Mobile inbox must be a bottom sheet");
    } else {
      assert(panel.bottom > element("[data-fixture-header]").getBoundingClientRect().bottom, "Desktop inbox must extend beyond clipped header");
      assert(panel.top >= trigger().getBoundingClientRect().bottom + 10, "Desktop inbox must appear below its anchor");
      assert(Math.abs(panel.right - trigger().getBoundingClientRect().right) <= 2, "Desktop inbox must align to its anchor");
    }
  });
  check("opening focuses the dialog and traps forward Tab at the last control", () => {
    const buttons = focusables(); const first = buttons[0]; const last = buttons.at(-1)!;
    last.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    assert(tab.defaultPrevented && document.activeElement === first, "Forward boundary must wrap to first control");
  });
  check("Shift Tab at the first control wraps and outside focus is recovered", () => {
    const buttons = focusables(); buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert(document.activeElement === buttons.at(-1), "Backward boundary must wrap to last control");
    trigger().focus();
    assert(document.activeElement === dialog(), "External focus must return to dialog while open");
  });
  element("[data-fixture-outside]").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await waitFor(() => !dialog() && document.activeElement === trigger(), "outside pointer dismissal");
  check("outside pointer closes and restores trigger focus and scrolling", () => assert(document.body.style.overflow !== "hidden", "Scroll lock must be removed"));
  await openCenter(); await closeWithEscape();
  check("Escape closes without removing pending invitations", () => assert(element(".invitation-inbox-badge").textContent === "1", "Closing must preserve the badge"));

  await reloadRows([]);
  check("zero pending invitations render no badge", () => assert(!document.querySelector(".invitation-inbox-badge"), "Zero badge must be absent"));
  await openCenter();
  check("empty inbox has an actionable empty state", () => assert(element(".invitation-inbox-empty").textContent?.includes("no pending"), "Missing empty state"));
  await closeWithEscape();
  await reloadRows(Array.from({ length: 12 }, (_, index) => makeInvitation(index + 1)));
  check("large badge is compact 9+ while its accessible name keeps the full count", () => {
    assert(element(".invitation-inbox-badge").textContent === "9+", "Expected compact count");
    assert(trigger().getAttribute("aria-label")?.includes("12"), "Accessible name must retain exact count");
  });

  await reloadRows([]);
  let resolveLoading!: (rows: HouseholdInvitation[]) => void;
  nextLookup = new Promise((resolve) => { resolveLoading = resolve; });
  const loadingRequest = controls!.refresh(true);
  await openCenter();
  await waitFor(() => document.querySelector(".invitation-inbox-skeleton"), "loading skeleton");
  check("loading query renders production skeleton rows", () => assert(element(".household-invitation-inbox").getAttribute("aria-busy") === "true", "Inbox marks loading"));
  repositoryRows = [makeInvitation()];
  resolveLoading([...repositoryRows]); await loadingRequest;
  await waitFor(() => document.querySelector(".invitation-inbox-view"), "resolved inbox row");
  failNextLookup = true; await controls!.refresh(true);
  await waitFor(() => document.querySelector(".invitation-inbox-error"), "repository error state");
  check("repository failure hides stale actionable rows and offers Retry", () => assert(!document.querySelector(".invitation-inbox-row") && buttonNamed("Retry"), "Error must fail closed"));
  buttonNamed("Retry").click();
  await waitFor(() => document.querySelector(".invitation-inbox-view"), "Retry success");
  check("Retry loads current repository results", () => assert(!document.querySelector(".invitation-inbox-error"), "Error clears after Retry"));

  element<HTMLButtonElement>(".invitation-inbox-view").click();
  await waitFor(() => element(".invitation-center-overlay").dataset.mode === "details", "details dialog");
  check("View invitation opens an in-place review without route navigation", () => {
    assert(!location.hash, "Fixture route must stay unchanged");
    assert(element(".household-invitation-review").textContent?.includes("existing household will not be removed"), "Review preserves membership scope copy");
    assert(buttonNamed("Join household"), "Explicit accept action must remain available");
  });
  check("details layout fits the viewport and can scroll when its content is taller", () => {
    const panel = dialog()!.getBoundingClientRect();
    assert(panel.left >= -1 && panel.right <= innerWidth + 1 && panel.top >= -1 && panel.bottom <= innerHeight + 1, "Details panel must stay within the viewport");
    assert(getComputedStyle(dialog()!).overflowY === "auto", "Long details must remain scrollable");
    if (result.mobile) assert(Math.abs(panel.bottom - innerHeight) <= 2, "Mobile details must stay attached to the bottom");
  });
  buttonNamed("Decline invitation").click();
  await waitFor(() => document.querySelector(".invitation-decline-confirmation"), "decline confirmation");
  check("declining requires a confirmation and does not call the repository immediately", () => {
    assert(declineCalls === 0, "First decline click cannot mutate repository");
    assert(buttonNamed("Keep invitation"), "Confirmation offers Keep invitation");
  });
  buttonNamed("Keep invitation").click();
  await waitFor(() => !document.querySelector(".invitation-decline-confirmation"), "keep invitation");
  check("Keep invitation returns to review without changing the pending badge", () => assert(element(".invitation-inbox-badge").textContent === "1" && declineCalls === 0, "Keeping must preserve invitation"));
  buttonNamed("Decline invitation").click();
  await waitFor(() => document.querySelector(".invitation-decline-confirmation"), "confirmation reopen");
  buttonNamed("Decline invitation", element(".invitation-decline-confirmation")).click();
  await waitFor(() => !document.querySelector(".invitation-inbox-badge") && element(".invitation-center-overlay").dataset.mode === "inbox", "confirmed decline removal");
  check("confirmed decline removes the badge immediately and preserves the active household", () => {
    assert(declineCalls === 1, "Repository decline occurs once");
    assert(element("#fixture-active-household").textContent === "original-home", "Declining cannot switch households");
  });
  await closeWithEscape();

  await reloadRows([makeInvitation()]); await openCenter();
  element<HTMLButtonElement>(".invitation-inbox-view").click();
  await waitFor(() => document.querySelector(".household-invitation-review"), "accept review");
  let resolveStale!: (rows: HouseholdInvitation[]) => void;
  nextLookup = new Promise((resolve) => { resolveStale = resolve; });
  const staleRequest = controls!.refresh(true);
  let resolveStaleDirectory!: (rows: Household[]) => void;
  nextDirectoryLookup = new Promise((resolve) => { resolveStaleDirectory = resolve; });
  const staleDirectoryRequest = controls!.refreshDirectory(true);
  buttonNamed("Join household").focus(); buttonNamed("Join household").click();
  await waitFor(() => document.querySelector(".invitation-joined") && !document.querySelector(".invitation-inbox-badge") && document.activeElement === dialog(), "accepted state, focus and immediate removal");
  check("confirmed acceptance updates the badge without switching the active household", () => {
    assert(acceptCalls === 1, "Repository accept occurs once");
    assert(element("#fixture-active-household").textContent === "original-home", "Accepted membership must preserve current selection");
    assert(!Array.from(dialog()!.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Join household"), "Joined state cannot resubmit");
  });
  check("accepted success restores dialog focus after replacing its focused submit control", () => {
    assert(dialog()!.getAttribute("aria-label") === "Membership confirmed", "Success has its own dialog title");
    assert(document.activeElement === dialog(), "Focus must stay inside the changed dialog");
  });
  check("a confirmed accepted household enters the real directory immediately", () => {
    assert(directoryRows().some((household) => household.id === "family-1"), "Confirmed joined household must be selectable before a refresh");
    assert(directoryRows().some((household) => household.id === "original-home"), "Original directory entry must remain available");
  });
  resolveStale([makeInvitation()]);
  resolveStaleDirectory([makeHousehold("original-home", "Original household")]);
  await Promise.all([staleRequest, staleDirectoryRequest]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  check("a pre-mutation query cannot resurrect an accepted invitation badge", () => assert(!document.querySelector(".invitation-inbox-badge"), "Stale response must remain superseded"));
  check("a pre-acceptance directory query cannot remove the confirmed membership", () => assert(directoryRows().some((household) => household.id === "family-1"), "Obsolete directory response must be superseded"));
  failNextDirectoryLookup = true; await controls!.refreshDirectory(true);
  await waitFor(() => element("#fixture-household-directory").dataset.error === "true", "directory refresh failure");
  check("a failed directory refresh preserves confirmed and existing households", () => {
    assert(directoryRows().some((household) => household.id === "family-1") && directoryRows().some((household) => household.id === "original-home"), "Refresh failure must preserve confirmed membership");
  });
  controls!.includeConfirmedHousehold(makeHousehold("family-1", "Updated Fern family"));
  await waitFor(() => directoryRows().some((household) => household.name === "Updated Fern family"), "duplicate confirmed household update");
  check("confirming the same household replaces data without duplicate directory entries", () => assert(directoryRows().filter((household) => household.id === "family-1").length === 1, "Confirmed membership must remain unique"));
  buttonNamed("Stay in current household").click();
  await waitFor(() => !dialog(), "stay action");
  check("Stay closes success without altering active selection", () => assert(element("#fixture-active-household").textContent === "original-home", "Stay preserves the original household"));
  await reloadRows([makeInvitation(2)]); await openCenter();
  element<HTMLButtonElement>(".invitation-inbox-view").click();
  await waitFor(() => document.querySelector(".household-invitation-review"), "second acceptance review");
  buttonNamed("Join household").click();
  await waitFor(() => document.querySelector(".invitation-joined"), "second accepted state");
  failNextDirectoryLookup = true; await controls!.refreshDirectory(true);
  await waitFor(() => element("#fixture-household-directory").dataset.error === "true", "failed refresh before explicit switch");
  buttonNamed("Switch to Garden family 2").click();
  await waitFor(() => !dialog() && element("#fixture-active-household").textContent === "family-2", "explicit switch");
  check("the explicit Switch action can select confirmed membership after a directory refresh failure", () => assert(acceptCalls === 2, "Two distinct invitations accepted"));
  const oldUserInclude = controls!.includeConfirmedHousehold;
  repositoryHouseholds = [makeHousehold("second-user-home", "Second account household")];
  controls!.setUser({ ...verifiedUser, id: "second-fixture-user" });
  await waitFor(() => element("#fixture-household-directory").dataset.user === "second-fixture-user" && directoryRows().some((household) => household.id === "second-user-home"), "changed authentication identity");
  oldUserInclude(makeHousehold("old-user-private-home", "Old account household"));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  check("an old account inclusion callback cannot mutate the new account directory", () => {
    assert(!directoryRows().some((household) => household.id === "old-user-private-home" || household.id === "original-home"), "Account-scoped inclusion must fail closed");
  });
  repositoryHouseholds = [makeHousehold("original-home", "Original household"), makeHousehold("family-1", "Fern family"), makeHousehold("family-2", "Garden family 2")];
  controls!.setUser(verifiedUser);
  await waitFor(() => element("#fixture-household-directory").dataset.user === verifiedUser.id && directoryRows().some((household) => household.id === "original-home"), "restored fixture account");

  // Each isolated execution leaves one requested production UI scene visible.
  // These screenshots validate presentation, not the App's mutation handlers.
  if (requestedScene === "inbox") {
    await reloadRows([makeInvitation(), makeInvitation(2)]); await openCenter();
  } else {
    assert(requestedScene === "details" || requestedScene === "accepted", "Unknown screenshot scene");
    await reloadRows([makeInvitation()]); await openCenter();
    element<HTMLButtonElement>(".invitation-inbox-view").click();
    await waitFor(() => document.querySelector(".household-invitation-review"), "screenshot review scene");
    if (requestedScene === "accepted") {
      buttonNamed("Join household").click();
      await waitFor(() => document.querySelector(".invitation-joined"), "screenshot accepted scene");
    }
  }
};

const mount = document.getElementById("root");
if (!mount) throw new Error("Missing fixture mount");
createRoot(mount).render(<Fixture />);
void run().catch((error: unknown) => { result.failures.push(error instanceof Error ? error.message : String(error)); }).finally(() => {
  element("#invitation-center-browser-results").textContent = JSON.stringify(result);
});
