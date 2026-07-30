/* End-to-end tests for the Sushi Counter (Better Auth + SQLite backend).
   Run with: node sushi.test.mjs [baseURL]  — expects a FRESH database. */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:8080";
let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

const browser = await chromium.launch();

async function newVisitor() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(BASE, { waitUntil: "load" });
  return page;
}

async function signUp(page, name, email) {
  await page.click("#tab-signup");
  await page.fill("#auth-name", name);
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "password123");
  await page.click("#auth-submit");
  await page.waitForSelector("#app-screen:not([hidden])", { timeout: 5000 });
}

const text = (page, sel) => page.locator(sel).innerText();

console.log(`Testing ${BASE}`);

// ---------- auth ----------
const alice = await newVisitor();
check("logged-out visitor sees auth screen", await alice.locator("#auth-screen").isVisible());
check("app hidden while logged out", !(await alice.locator("#app-screen").isVisible()));

await signUp(alice, "Alice", "alice@example.com");
check("sign up works and shows the app", await alice.locator("#app-screen").isVisible());
check("user name shown", (await text(alice, "#user-name")).includes("Alice"));
check("first user sees admin link", await alice.locator("#admin-link").isVisible());

// ---------- counter + minus ----------
check("counter starts at 0", (await text(alice, "#count")) === "0");
for (let i = 0; i < 5; i++) await alice.click("#sushi-btn");
check("counter reaches 5 after 5 taps", (await text(alice, "#count")) === "5");

await alice.click("#minus-btn");
check("minus button removes one sushi", (await text(alice, "#count")) === "4");
check("minus also lowers all-time total", (await text(alice, "#total-all-time")) === "4");
for (let i = 0; i < 10; i++) await alice.click("#minus-btn");
check("minus never goes below 0", (await text(alice, "#count")) === "0");
await alice.click("#sushi-btn");
await alice.click("#sushi-btn");
check("counting again after minus works", (await text(alice, "#count")) === "2");

// ---------- timer ----------
check("timer auto-started on first sushi", (await text(alice, "#timer-toggle")).includes("Pause"));
await alice.waitForTimeout(1200);
check("timer is ticking", (await text(alice, "#timer-display")) !== "00:00");
const spm = parseFloat(await text(alice, "#spm"));
check("SPM is a positive number", spm > 0, `got ${spm}`);
await alice.click("#timer-toggle");
check("timer pauses", (await text(alice, "#timer-toggle")).includes("Start"));
await alice.click("#timer-reset");
check("timer resets to 00:00", (await text(alice, "#timer-display")) === "00:00");

// ---------- goal ----------
await alice.fill("#goal-input", "2");
await alice.locator("#goal-input").dispatchEvent("change");
check("goal status shows 2 / 2", (await text(alice, "#goal-status")) === "2 / 2");
check("goal cheer visible at goal", await alice.locator("#goal-cheer").isVisible());
await alice.click("#goal-plus");
check("goal + button works", (await text(alice, "#goal-status")) === "2 / 3");
await alice.click("#goal-minus");
check("goal − button works", (await text(alice, "#goal-status")) === "2 / 2");

// ---------- server persistence ----------
await alice.waitForTimeout(700); // let the debounced save flush
await alice.reload({ waitUntil: "load" });
await alice.waitForSelector("#app-screen:not([hidden])");
check("session survives reload (still signed in)", await alice.locator("#app-screen").isVisible());
check("count survives reload", (await text(alice, "#count")) === "2");
check("goal survives reload", (await text(alice, "#goal-status")) === "2 / 2");

// ---------- new session ----------
await alice.click("#new-session");
check("new session resets count", (await text(alice, "#count")) === "0");
check("sessions count is 1", (await text(alice, "#sessions-count")) === "1");
check("all-time total kept", (await text(alice, "#total-all-time")) === "2");

// ---------- second user is not admin ----------
const bob = await newVisitor();
await signUp(bob, "Bob", "bob@example.com");
check("second user does NOT see admin link", !(await bob.locator("#admin-link").isVisible()));
check("bob starts at 0 (his own data)", (await text(bob, "#count")) === "0");
for (let i = 0; i < 3; i++) await bob.click("#sushi-btn");
await bob.waitForTimeout(700);

// bob cannot open the admin page
await bob.goto(BASE + "/admin.html", { waitUntil: "load" });
await bob.waitForSelector("#admin-denied:not([hidden])");
check("bob is denied on admin page", await bob.locator("#admin-denied").isVisible());
check("admin content stays hidden for bob", !(await bob.locator("#admin-content").isVisible()));
const bobStats = await bob.request.get(BASE + "/api/admin/stats");
check("admin API returns 403 for bob", bobStats.status() === 403, `got ${bobStats.status()}`);

// ---------- admin dashboard ----------
await alice.goto(BASE + "/admin.html", { waitUntil: "load" });
await alice.waitForSelector("#admin-content:not([hidden])");
check("alice can open the admin page", await alice.locator("#admin-content").isVisible());
check("global stats: 2 users", (await text(alice, "#g-users")) === "2");
check("global stats: 5 total sushi (2 + 3)", (await text(alice, "#g-total")) === "5");
const rows = alice.locator("#users-body tr");
check("user table lists 2 users", (await rows.count()) === 2);
check("alice is marked admin in table", (await rows.nth(0).innerText()).includes("admin"));
check("bob listed in table", (await rows.nth(1).innerText()).includes("bob@example.com"));
check("no delete button on own row", (await rows.nth(0).locator(".danger-btn").count()) === 0);

// delete bob
alice.on("dialog", (d) => d.accept());
await rows.nth(1).locator(".danger-btn").click();
await alice.waitForFunction(() => document.querySelectorAll("#users-body tr").length === 1);
check("admin can delete a user", (await rows.count()) === 1);
check("global stats update after delete", (await text(alice, "#g-users")) === "1");

// bob's session is gone with him
await bob.reload({ waitUntil: "load" });
await bob.waitForSelector("#auth-screen:not([hidden])");
check("deleted user is signed out", await bob.locator("#auth-screen").isVisible());

// ---------- sign out / sign in ----------
await alice.goto(BASE, { waitUntil: "load" });
await alice.waitForSelector("#app-screen:not([hidden])");
await alice.click("#sign-out");
await alice.waitForSelector("#auth-screen:not([hidden])");
check("sign out returns to auth screen", await alice.locator("#auth-screen").isVisible());

await alice.fill("#auth-email", "alice@example.com");
await alice.fill("#auth-password", "password123");
await alice.click("#auth-submit");
await alice.waitForSelector("#app-screen:not([hidden])");
check("sign in works again", await alice.locator("#app-screen").isVisible());
check("data still there after re-login", (await text(alice, "#total-all-time")) === "2");

// wrong password
const eve = await newVisitor();
await eve.fill("#auth-email", "alice@example.com");
await eve.fill("#auth-password", "wrong-password");
await eve.click("#auth-submit");
await eve.waitForSelector("#auth-error:not([hidden])");
check("wrong password shows an error", await eve.locator("#auth-error").isVisible());
check("wrong password does not open app", !(await eve.locator("#app-screen").isVisible()));

// unauthenticated API access
const anonState = await eve.request.get(BASE + "/api/state");
check("state API requires auth", anonState.status() === 401, `got ${anonState.status()}`);

// no page errors anywhere
check("no page errors (alice)", alice.errors.length === 0, alice.errors.join("; "));
check("no page errors (bob)", bob.errors.length === 0, bob.errors.join("; "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
