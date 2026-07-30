/* Browser tests for the Sushi Counter, run with: node sushi.test.mjs [baseURL] */
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
const page = await browser.newPage();

console.log(`Testing ${BASE}`);
const resp = await page.goto(BASE, { waitUntil: "load" });
check("page loads with HTTP 200", resp.status() === 200, `got ${resp.status()}`);
check("title is set", (await page.title()).includes("Sushi"));

const text = (sel) => page.locator(sel).innerText();

// --- counter ---
check("counter starts at 0", (await text("#count")) === "0");
for (let i = 0; i < 5; i++) await page.click("#sushi-btn");
check("counter reaches 5 after 5 taps", (await text("#count")) === "5");

// --- timer auto-start ---
check("timer auto-started on first sushi", (await text("#timer-toggle")).includes("Pause"));
await page.waitForTimeout(1500);
check("timer is ticking", (await text("#timer-display")) !== "00:00");

// --- SPM ---
const spm = parseFloat(await text("#spm"));
check("SPM is a positive number", spm > 0, `got ${spm}`);

// --- timer pause / reset ---
await page.click("#timer-toggle");
check("timer pauses", (await text("#timer-toggle")).includes("Start"));
const frozen = await text("#timer-display");
await page.waitForTimeout(700);
check("paused timer does not tick", (await text("#timer-display")) === frozen);
await page.click("#timer-reset");
check("timer resets to 00:00", (await text("#timer-display")) === "00:00");

// --- goal ---
await page.fill("#goal-input", "5");
await page.locator("#goal-input").dispatchEvent("change");
check("goal status shows 5 / 5", (await text("#goal-status")) === "5 / 5");
check("goal cheer visible at goal", await page.locator("#goal-cheer").isVisible());
const width = await page.locator("#progress-bar").evaluate((el) => el.style.width);
check("progress bar is full at goal", width === "100%", `got ${width}`);
await page.click("#goal-plus");
check("goal + button works", (await text("#goal-status")) === "5 / 6");
check("goal cheer hidden below goal", !(await page.locator("#goal-cheer").isVisible()));
await page.click("#goal-minus");
check("goal − button works", (await text("#goal-status")) === "5 / 5");

// --- persistence across reload ---
await page.reload({ waitUntil: "load" });
check("count survives reload", (await text("#count")) === "5");
check("goal survives reload", (await text("#goal-status")) === "5 / 5");
check("all-time total survives reload", (await text("#total-all-time")) === "5");
check("timer stays paused after reload", (await text("#timer-toggle")).includes("Start"));

// --- stats ---
check("best session is 5", (await text("#best-session")) === "5");

// --- new session ---
await page.click("#new-session");
check("new session resets count", (await text("#count")) === "0");
check("new session resets timer", (await text("#timer-display")) === "00:00");
check("sessions count is 1", (await text("#sessions-count")) === "1");
check("all-time total kept after new session", (await text("#total-all-time")) === "5");
check("best session kept after new session", (await text("#best-session")) === "5");

// --- fresh device (empty localStorage) ---
const page2 = await browser.newContext().then((c) => c.newPage());
await page2.goto(BASE, { waitUntil: "load" });
check("fresh visitor starts at 0", (await page2.locator("#count").innerText()) === "0");
check(
  "fresh visitor has default goal 20",
  (await page2.locator("#goal-status").innerText()) === "0 / 20"
);

// --- no console errors during the whole run ---
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.click("#sushi-btn");
check("no page errors", errors.length === 0, errors.join("; "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
