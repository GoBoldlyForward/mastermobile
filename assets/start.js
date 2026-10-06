// Fill these in to go live. Left blank, the flow runs in demo mode and submits nowhere.
const CONFIG = {
  formEndpoint: "",          // e.g. https://formspree.io/f/xxxxxxx (receives the lead before payment)
  stripePaymentLink: "",     // e.g. https://buy.stripe.com/xxxxxxx ($450, success URL -> start.html?paid=1)
  guaranteeMinMonthly: 5000, // monthly sales needed to qualify for the money-back guarantee
};

// Each path is an ordered list of step names matching <section data-step="...">.
const PATHS = {
  no: ["fork", "locations", "launch", "services", "vans", "goal", "sat-marketing", "sat-booking", "sat-support", "contact", "offer", "extras"],
  yes: ["fork", "website", "capacity", "revenue", "booking_tool", "sat-marketing", "sat-booking", "sat-support", "contact", "offer", "extras"],
};

const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
const STATE_ABBR = { "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY" };
const SERVICES = ["Full detail", "Interior detail", "Exterior wash and wax", "Paint correction", "Ceramic coating", "Paint protection film", "Window tint", "Headlight restoration", "Engine bay cleaning", "Pet hair removal", "Odor removal", "Fleet washing", "Boat and RV detailing"];

const form = document.getElementById("onboarding");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const errorBox = document.getElementById("formError");
const params = new URLSearchParams(location.search);

// All answers live here and are sent as one payload.
const answers = {
  has_website: null,
  locations: [],   // [{ city, state }]
  services: [],
  interests: [], // optional add-ons picked on the extras step
  reference: "MM-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
  stage: params.get("stage") || "", // set by the enhanced landing page's stage switcher
  entry_cta: params.get("from") || "", // which landing page button they used, e.g. "calculator"
};
let history = []; // step names visited, for the back button
let current = "fork";

// ---------- Setup ----------

const stateSelect = document.getElementById("stateSelect");
STATES.forEach((s) => stateSelect.add(new Option(s, s)));

const serviceChips = document.getElementById("serviceChips");
SERVICES.forEach((name) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = name;
  chip.addEventListener("click", () => {
    chip.classList.toggle("on");
    answers.services = [...serviceChips.querySelectorAll(".chip.on")].map((c) => c.textContent);
  });
  serviceChips.appendChild(chip);
});

// ---------- Rendering ----------

function path() { return PATHS[answers.has_website || "no"]; }

function show(step) {
  current = step;
  document.querySelectorAll(".ob-step").forEach((s) => s.classList.toggle("d-none", s.dataset.step !== step));
  errorBox.classList.add("d-none");

  const steps = path();
  const index = steps.indexOf(step);
  const done = step === "done";
  // The fork is step 1 only before a path is chosen; progress counts the real questions.
  document.getElementById("progressBar").style.width = done ? "100%" : `${((index + 1) / steps.length) * 100}%`;
  document.getElementById("stepLabel").textContent = done ? "" : `Step ${index + 1} of ${steps.length}`;

  backBtn.classList.toggle("d-none", history.length === 0 || done);
  // Single-choice steps advance on tap, so the action bar only shows when it has a job to do.
  const autoStep = !!document.querySelector(`[data-step="${step}"] .choice-auto`);
  document.getElementById("actions").classList.toggle("d-none", done || (autoStep && step !== "offer"));

  const label = nextBtn.querySelector("span");
  if (step === "contact") label.textContent = "See my plan";
  else if (step === "offer") label.textContent = "Lock in $450 founding price";
  else if (step === "extras") label.textContent = "Continue to secure checkout";
  else label.textContent = "Continue";

  if (step === "offer") renderOffer();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const firstInput = document.querySelector(`[data-step="${step}"] input:not([type=hidden]), [data-step="${step}"] select`);
  if (firstInput && window.matchMedia("(min-width: 768px)").matches) firstInput.focus();
}

function go(step) { history.push(current); show(step); }
function nextStep() { const s = path(); return s[s.indexOf(current) + 1]; }

function fail(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("d-none");
}

// ---------- Single-choice cards (auto advance) ----------

document.querySelectorAll(".choice-auto").forEach((btn) => {
  btn.addEventListener("click", () => {
    const field = btn.dataset.field;
    btn.parentElement.querySelectorAll(".choice").forEach((b) => b.classList.toggle("on", b === btn));
    answers[field] = btn.dataset.value;
    if (field === "monthly_revenue") answers.monthly_revenue_min = Number(btn.dataset.min);
    // Short pause so the selection registers visually before the screen changes.
    setTimeout(() => go(nextStep()), 180);
  });
});

// ---------- Locations: state first, then cities ----------

const cityWrap = document.getElementById("cityWrap");
const cityInput = document.getElementById("cityInput");
const cityChips = document.getElementById("cityChips");

stateSelect.addEventListener("change", () => {
  cityWrap.classList.toggle("d-none", !stateSelect.value);
  if (stateSelect.value) cityInput.focus();
});

function addCity() {
  const city = cityInput.value.trim().replace(/\s+/g, " ");
  if (!city || !stateSelect.value) return false;
  const state = STATE_ABBR[stateSelect.value];
  const exists = answers.locations.some((l) => l.city.toLowerCase() === city.toLowerCase() && l.state === state);
  if (!exists) answers.locations.push({ city, state });
  cityInput.value = "";
  renderCities();
  return true;
}

function renderCities() {
  cityChips.innerHTML = "";
  answers.locations.forEach((loc, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip on";
    chip.innerHTML = `${loc.city}, ${loc.state}<span class="x" aria-label="Remove">✕</span>`;
    chip.addEventListener("click", () => { answers.locations.splice(i, 1); renderCities(); });
    cityChips.appendChild(chip);
  });
}

document.getElementById("addCity").addEventListener("click", () => { addCity(); cityInput.focus(); });
cityInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } });

// ---------- Website ----------

const websiteInput = document.getElementById("websiteInput");
const websiteNote = document.getElementById("websiteNote");

function normalizeUrl(raw) {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  try {
    const url = new URL(value);
    return url.hostname.includes(".") ? url : null;
  } catch (e) { return null; }
}

websiteInput.addEventListener("input", () => {
  const url = normalizeUrl(websiteInput.value);
  websiteNote.classList.toggle("d-none", !url);
  if (url) websiteNote.querySelector("span").textContent = `We'll pull your services, prices and service area from ${url.hostname.replace(/^www\./, "")}.`;
});

// ---------- Contact ----------

const phoneInput = document.getElementById("phone");
phoneInput.addEventListener("input", () => {
  const d = phoneInput.value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  phoneInput.value = d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d;
});

// ---------- Offer ----------

function renderOffer() {
  const first = (answers.name || "").split(" ")[0];
  document.getElementById("offerTitle").textContent = first ? `Your founding offer, ${first}` : "Your founding offer";

  // The guarantee is conditional (Hormozi): show qualified detailers that they're covered.
  const qualifies = answers.has_website === "yes" && answers.monthly_revenue_min >= CONFIG.guaranteeMinMonthly;
  const min = "$" + CONFIG.guaranteeMinMonthly.toLocaleString();
  document.getElementById("guaranteeText").innerHTML = qualifies
    ? `<strong>You qualify for our guarantee.</strong><br>If MasterMobile doesn't pay for itself in your first month, you get your money back.`
    : `<strong>Pays for itself in month one, or your money back.</strong><br>For businesses doing ${min}+ a month in sales.`;
}

// ---------- Extras (multi-select add-on interest) ----------

document.querySelectorAll(".choice-multi").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("on");
    answers.interests = [...document.querySelectorAll(".choice-multi.on")].map((b) => b.dataset.interest);
  });
});

// ---------- Validation per step ----------

function validate() {
  switch (current) {
    case "locations":
      if (cityInput.value.trim()) addCity(); // typed a city but didn't tap Add
      if (!stateSelect.value) return fail("Choose a state to start."), false;
      if (!answers.locations.length) return fail("Add at least one city."), false;
      return true;
    case "services":
      if (!answers.services.length) return fail("Pick at least one service."), false;
      return true;
    case "website": {
      const url = normalizeUrl(websiteInput.value);
      if (!url) return fail("Enter your website, like yourdetailing.com."), false;
      answers.website_url = url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
      return true;
    }
    case "contact": {
      const fields = ["name", "email", "phone"].map((id) => document.getElementById(id));
      const bad = fields.find((el) => !el.checkValidity() || (el.id === "phone" && el.value.replace(/\D/g, "").length < 10));
      if (bad) {
        bad.focus();
        return fail({ name: "Add your name.", email: "Enter a valid email.", phone: "Add a 10 digit mobile number." }[bad.id]), false;
      }
      fields.forEach((el) => { answers[el.id] = el.value.trim(); });
      return true;
    }
    default:
      return true;
  }
}

// ---------- Submit ----------

// Earnings calculator numbers from the landing page, if they moved the sliders.
function calculatorFields() {
  let calc = null;
  try { calc = JSON.parse(sessionStorage.getItem("mm_calculator") || "null"); } catch (e) {}
  if (!calc) return { calc_used: false };
  // Flat keys so each value is its own column in the form inbox or a spreadsheet.
  return Object.fromEntries([["calc_used", true], ...Object.entries(calc).map(([k, v]) => [`calc_${k}`, v])]);
}

function payload(intent) {
  return {
    ...answers,
    intent, // "lead" when contact is saved, "checkout" when they continue to pay, "later" when they defer
    locations: answers.locations.map((l) => `${l.city}, ${l.state}`).join("; "),
    services: answers.services.join(", "),
    interests: answers.interests.join(", "),
    ...calculatorFields(),
    attribution: window.mmAttribution || {},
    submitted_at: new Date().toISOString(),
    _gotcha: form._gotcha.value,
  };
}

async function send(intent) {
  if (!CONFIG.formEndpoint) { console.info("[demo] would submit", payload(intent)); return true; }
  try {
    const res = await fetch(CONFIG.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload(intent)),
    });
    return res.ok;
  } catch (e) { return false; }
}

function busy(on, text) {
  nextBtn.disabled = on;
  if (text) nextBtn.querySelector("span").textContent = text;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  if (current === "contact") {
    // Capture the lead before showing the price, so a detailer who stops at the offer is still reachable.
    busy(true, "Saving");
    const ok = await send("lead");
    busy(false);
    if (!ok) return fail("Something went wrong. Please try again.");
    return go("offer");
  }

  if (current === "extras") {
    busy(true, "Opening secure checkout");
    await send("checkout");
    if (CONFIG.stripePaymentLink) {
      const url = new URL(CONFIG.stripePaymentLink);
      url.searchParams.set("prefilled_email", answers.email);
      url.searchParams.set("client_reference_id", answers.reference);
      location.href = url.toString();
      return;
    }
    location.href = "start.html?paid=1&demo=1"; // demo mode: skip Stripe
    return;
  }

  go(nextStep());
});

backBtn.addEventListener("click", () => { if (history.length) show(history.pop()); });

document.getElementById("decideLater").addEventListener("click", async (e) => {
  e.preventDefault();
  await send("later");
  go("done");
});

// Fork answers set the path. The hero links pass ?website=yes|no so detailers skip straight in.
document.querySelectorAll('[data-field="has_website"]').forEach((btn) => {
  btn.addEventListener("click", () => { answers.has_website = btn.dataset.value; });
});

// ---------- Entry ----------

if (params.get("paid")) {
  document.getElementById("doneTitle").textContent = "You're in. Your founding spot is locked.";
  document.getElementById("doneText").textContent = "Check your email for your receipt. We'll text you within one business day to start building your booking site.";
  show("done");
} else if (["yes", "no"].includes(params.get("website"))) {
  answers.has_website = params.get("website");
  document.querySelector(`[data-field="has_website"][data-value="${answers.has_website}"]`).classList.add("on");
  history = ["fork"];
  show(path()[1]);
} else {
  show("fork");
}
