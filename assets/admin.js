// Admin dashboard: the booking funnel with time between stages, and the data performance loop
// (source -> leads -> bookings -> revenue). Every number comes from a seeded model so month-over-month
// comparisons stay consistent between loads. Nothing here is live data.
(function () {
  const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((m) => ({ short: m, label: `${m} 2026` }));
  // The screens of the Mint booking flow, in order. The second-car screen only shows for some customers,
  // so it's folded into Add-ons rather than counted as a stage.
  const STAGES = ["Where", "When", "Vehicles", "Contact", "Services", "Add-ons", "Address", "Pay", "Booked"];
  const STEPS = STAGES.slice(1).map((s, i) => `${STAGES[i]} to ${s}`);
  const STAGE_COLORS = STAGES.map((_, i) => (i === STAGES.length - 1 ? "#2f6300" : "#52921c"));

  // August base, all sources: share continuing past each screen, and seconds spent on it.
  const CONV = [0.90, 0.92, 0.92, 0.94, 0.95, 0.93, 0.92, 0.88];
  const TIME = [18, 55, 48, 50, 70, 45, 60, 110];
  // Share of people reaching a screen who skip it instead of filling it in. Skippers still continue; they
  // just spend no time on the step. Zero means the screen can't be skipped. Only Add-ons is optional today.
  const SKIP = [0, 0, 0, 0, 0, 0.34, 0, 0];
  const SKIP_CURVE = [0.88, 0.90, 0.93, 0.96, 1.00, 1.06];

  // Each source shifts the base: paid traffic is newer to the brand, so it's slower and leakier; repeat customers fly through.
  const SOURCES = [
    { id: "search", name: "Google search", kind: "Organic", color: "#3f7f00", starts: 150, convShift: 0.00, timeFactor: 1.00, spend: 0, ticket: 262 },
    { id: "gads", name: "Google Ads", kind: "Paid", color: "#2a78d6", starts: 110, convShift: -0.02, timeFactor: 1.12, spend: 1240, ticket: 288 },
    { id: "meta", name: "Meta ads", kind: "Paid", color: "#eb6834", starts: 70, convShift: -0.04, timeFactor: 1.22, spend: 860, ticket: 243 },
    { id: "partners", name: "Partner referrals", kind: "Referral", color: "#4a3aa7", starts: 32, convShift: 0.02, timeFactor: 0.92, spend: 270, ticket: 290 },
    { id: "repeat", name: "Repeat and direct", kind: "Direct", color: "#eda100", starts: 50, convShift: 0.035, timeFactor: 0.78, spend: 0, ticket: 265 },
  ];

  const GROWTH = [0.78, 0.82, 0.86, 0.90, 0.95, 1.00];
  const SPEND_CURVE = [0.80, 0.85, 0.90, 0.95, 1.00, 1.00];
  // Per screen, by month, as a multiple of August. Most screens got quicker over the summer; the When screen
  // got slower and leakier in September after the week view shipped.
  const TIME_CURVE = STEPS.map((_, i) => {
    if (i === 1) return [1.00, 1.00, 0.98, 0.97, 1.00, 1.18];
    if (i === 7) return [1.30, 1.28, 1.22, 1.08, 1.00, 0.88];
    return [1.12, 1.10, 1.07, 1.03, 1.00, 0.94];
  });
  const CONV_CURVE = STEPS.map((_, i) => {
    if (i === 1) return [-0.02, -0.02, -0.01, 0, 0, -0.035];
    if (i === 7) return [-0.06, -0.05, -0.04, -0.02, 0, 0.02];
    return [-0.03, -0.025, -0.02, -0.01, 0, 0.01];
  });

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const wobble = (seed, amp) => 1 + (mulberry32(seed)() - 0.5) * 2 * amp;

  // DATA[source][month] = { counts[5], times[4], spend, ticket, revenue }
  const DATA = SOURCES.map((src, si) => MONTHS.map((_, mi) => {
    const seed = (f) => (si + 1) * 1000 + mi * 50 + f;
    const counts = [Math.round(src.starts * GROWTH[mi] * wobble(seed(0), 0.06))];
    const times = [];
    const skipped = [];
    CONV.forEach((c, i) => {
      const rate = Math.min(0.98, c + src.convShift + CONV_CURVE[i][mi] + (wobble(seed(1 + i), 0.02) - 1));
      counts.push(Math.round(counts[i] * rate));
      times.push(Math.round(TIME[i] * src.timeFactor * TIME_CURVE[i][mi] * wobble(seed(20 + i), 0.05)));
      skipped.push(SKIP[i] ? Math.min(counts[i + 1], Math.round(counts[i] * SKIP[i] * SKIP_CURVE[mi] * wobble(seed(30 + i), 0.08))) : 0);
    });
    const spend = src.spend ? Math.round(src.spend * SPEND_CURVE[mi] * wobble(seed(40), 0.05)) : 0;
    const ticket = Math.round(src.ticket * (0.97 + mi * 0.006) * wobble(seed(41), 0.02));
    return { counts, times, skipped, spend, ticket, revenue: counts[STAGES.length - 1] * ticket };
  }));

  // One month of the funnel for one source or all of them. Step times are averaged over the people who made that step.
  function slice(sourceId, mi) {
    const rows = sourceId === "all" ? DATA.map((m) => m[mi]) : [DATA[SOURCES.findIndex((s) => s.id === sourceId)][mi]];
    const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
    const counts = STAGES.map((_, i) => sum((r) => r.counts[i]));
    const times = STEPS.map((_, i) => {
      const n = sum((r) => r.counts[i + 1]);
      return n ? Math.round(sum((r) => r.times[i] * r.counts[i + 1]) / n) : 0;
    });
    const skipped = STEPS.map((_, i) => sum((r) => r.skipped[i]));
    const spend = sum((r) => r.spend);
    const revenue = sum((r) => r.revenue);
    const booked = counts[STAGES.length - 1];
    return {
      counts, times, skipped, spend, revenue, booked,
      skipRate: STEPS.map((_, i) => (counts[i] ? skipped[i] / counts[i] : 0)),
      starts: counts[0],
      conv: STEPS.map((_, i) => (counts[i] ? counts[i + 1] / counts[i] : 0)),
      bookedRate: counts[0] ? booked / counts[0] : 0,
      totalTime: times.reduce((a, b) => a + b, 0),
      ticket: booked ? revenue / booked : 0,
      ret: spend ? revenue / spend : null,
    };
  }

  // Revenue per dollar spent, counting only sources that had spend that month, so organic traffic doesn't inflate it.
  function paidReturn(sourceId, mi) {
    const rows = (sourceId === "all" ? DATA.map((m) => m[mi]) : [DATA[SOURCES.findIndex((s) => s.id === sourceId)][mi]]).filter((r) => r.spend);
    const spend = rows.reduce((t, r) => t + r.spend, 0);
    return spend ? rows.reduce((t, r) => t + r.revenue, 0) / spend : null;
  }

  // ---------- Formatting ----------

  const fmt = {
    num: (n) => Math.round(n).toLocaleString(),
    money: (n) => "$" + Math.round(n).toLocaleString(),
    pct: (r) => Math.round(r * 100) + "%",
    time: (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`),
    x: (r) => (r == null ? "No spend" : r.toFixed(1) + "x"),
  };

  // Signed change against the previous month. kind decides the unit; "time" and "lost" are better when lower.
  function delta(cur, prev, kind, vs, { bare = false, neutral = false } = {}) {
    if (prev == null || cur == null) return `<span class="delta flat">No prior month</span>`;
    const diff = cur - prev;
    const lowerIsBetter = kind === "time" || kind === "lost";
    let text;
    if (kind === "time") {
      text = (diff < 0 ? "−" : "+") + fmt.time(Math.abs(diff));
    } else if (kind === "rate") {
      const pts = diff * 100;
      text = (pts < 0 ? "−" : "+") + Math.abs(pts).toFixed(1) + " pts";
    } else if (kind === "x") {
      text = (diff < 0 ? "−" : "+") + Math.abs(diff).toFixed(1) + "x";
    } else {
      if (!prev) return `<span class="delta flat">New vs ${vs}</span>`;
      const pct = (diff / prev) * 100;
      text = (pct < 0 ? "−" : "+") + Math.abs(pct).toFixed(Math.abs(pct) > 10 ? 0 : 1) + "%";
    }
    const flat = Math.abs(diff) < (kind === "rate" ? 0.0005 : 0.5);
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    const cls = flat ? "flat" : neutral ? "neutral" : good ? "good" : "bad";
    const icon = flat ? "fa-minus" : diff > 0 ? "fa-arrow-up" : "fa-arrow-down";
    return `<span class="delta ${cls}"><i class="fa-solid ${icon}"></i>${flat ? "No change" : text}${bare ? "" : ` vs ${vs}`}</span>`;
  }

  function sparkline(values, highlight) {
    const w = 96, h = 28, pad = 5;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = (i) => (values.length > 1 ? pad + (i * (w - 2 * pad)) / (values.length - 1) : w / 2);
    const y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
    const pts = values.map((v, i) => [x(i), y(v)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const hits = values.map((v, i) => `<rect x="${x(i) - 8}" y="0" width="16" height="${h}" fill="transparent" tabindex="0" data-tip="${highlight(v, i)}"></rect>`).join("");
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Six month trend"><path d="${d}" fill="none" stroke="#b9c2d0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#3f7f00" stroke="#fff" stroke-width="2"/>${hits}</svg>`;
  }

  // ---------- State ----------

  const state = {
    view: location.hash === "#loop" ? "loop" : "funnel",
    month: MONTHS.length - 1,
    source: "all",
    openRow: null,
    revenueAsTable: false,
  };
  const $ = (id) => document.getElementById(id);
  const vs = () => (state.month ? MONTHS[state.month - 1].short : "");

  // ---------- Funnel view ----------

  function funnelBars(cur, prev, compact) {
    const room = compact ? 72 : 96;
    const rows = [];
    STAGES.forEach((stage, i) => {
      const n = cur.counts[i];
      const frac = cur.counts[0] ? n / cur.counts[0] : 0;
      const skipped = i < STEPS.length ? cur.skipped[i] : 0;
      const tip = [
        `${fmt.num(n)} reached ${stage}`,
        i ? `${fmt.pct(frac)} of started · ${fmt.pct(cur.conv[i - 1])} of previous step` : "100% of started",
        skipped ? `${fmt.num(skipped)} skipped it (${fmt.pct(cur.skipRate[i])})` : "",
        prev ? `${vs()}: ${fmt.num(prev.counts[i])}` : "",
      ].filter(Boolean).join("|");
      const segments = skipped
        ? `<span class="seg-done" style="flex:${n - skipped};background:${STAGE_COLORS[i]}"></span><span class="seg-skip" style="flex:${skipped}"></span>`
        : `<span class="seg-done" style="flex:1;background:${STAGE_COLORS[i]}"></span>`;
      rows.push(`<div class="stage"><span class="stage-lbl">${stage}</span><div class="bar-row"><div class="bar" tabindex="0" data-tip="${tip}" style="width:calc((100% - ${room}px) * ${frac.toFixed(3)})">${segments}</div><span class="bar-val">${fmt.num(n)}${i ? `<small>${fmt.pct(frac)}</small>` : ""}</span></div></div>`);
      if (i < STEPS.length) {
        const skip = SKIP[i]
          ? `<span class="m"><i class="fa-regular fa-forward"></i><strong>${fmt.pct(cur.skipRate[i])} skipped</strong>${delta(cur.skipRate[i], prev && prev.skipRate[i], "rate", vs(), { neutral: true })}</span>`
          : "";
        rows.push(`<div class="between"><span class="m"><i class="fa-regular fa-clock"></i><strong>${fmt.time(cur.times[i])}</strong>${delta(cur.times[i], prev && prev.times[i], "time", vs())}</span><span class="m"><i class="fa-regular fa-arrow-turn-down-right"></i><strong>${fmt.pct(cur.conv[i])} continue</strong>${delta(cur.conv[i], prev && prev.conv[i], "rate", vs())}</span>${skip}</div>`);
      }
    });
    return `<div class="fun${compact ? " compact" : ""}">${rows.join("")}</div>`;
  }

  function renderFunnel() {
    const cur = slice(state.source, state.month);
    const prev = state.month ? slice(state.source, state.month - 1) : null;
    const month = MONTHS[state.month].label;

    const worst = cur.conv.reduce((w, r, i) => (r < cur.conv[w] ? i : w), 0);
    const lost = cur.counts[worst] - cur.counts[worst + 1];
    const prevLost = prev ? prev.counts[worst] - prev.counts[worst + 1] : null;

    $("kpis").innerHTML = [
      ["Bookings", fmt.num(cur.booked), delta(cur.booked, prev && prev.booked, "count", vs())],
      ["Booked rate", fmt.pct(cur.bookedRate), delta(cur.bookedRate, prev && prev.bookedRate, "rate", vs())],
      ["Time to book", fmt.time(cur.totalTime), delta(cur.totalTime, prev && prev.totalTime, "time", vs())],
      ["Biggest drop-off", STEPS[worst], `<span class="muted">${fmt.num(lost)} lost</span> ${delta(lost, prevLost, "lost", vs())}`, "text"],
    ].map(([l, v, s, cls]) => `<div class="kpi"><div class="lbl">${l}</div><div class="val${cls ? " " + cls : ""}">${v}</div><div class="sub">${s}</div></div>`).join("");

    $("funnelSub").textContent = `${month} · ${state.source === "all" ? "all sources" : SOURCES.find((s) => s.id === state.source).name}`;
    $("funnel").innerHTML = funnelBars(cur, prev, false);

    $("stepRows").innerHTML = STEPS.map((step, i) => {
      const history = MONTHS.slice(0, state.month + 1).map((_, mi) => slice(state.source, mi).times[i]);
      return `<tr>
        <th scope="row">${step}</th>
        <td class="num">${fmt.pct(cur.conv[i])}<div class="cell-sub">${delta(cur.conv[i], prev && prev.conv[i], "rate", vs(), { bare: true })}</div></td>
        <td class="num">${SKIP[i] ? `${fmt.pct(cur.skipRate[i])}<div class="cell-sub">${delta(cur.skipRate[i], prev && prev.skipRate[i], "rate", vs(), { bare: true, neutral: true })}</div>` : `<span class="muted">—</span>`}</td>
        <td class="num"><strong>${fmt.time(cur.times[i])}</strong></td>
        <td class="num">${prev ? fmt.time(prev.times[i]) : "—"}</td>
        <td>${delta(cur.times[i], prev && prev.times[i], "time", vs(), { bare: true })}</td>
        <td>${sparkline(history, (v, mi) => `${fmt.time(v)}|${MONTHS[mi].label}`)}</td>
      </tr>`;
    }).join("") + `<tr class="total"><th scope="row">Start to booked</th><td class="num">${fmt.pct(cur.bookedRate)}</td><td class="num"><span class="muted">—</span></td><td class="num"><strong>${fmt.time(cur.totalTime)}</strong></td><td class="num">${prev ? fmt.time(prev.totalTime) : "—"}</td><td>${delta(cur.totalTime, prev && prev.totalTime, "time", vs(), { bare: true })}</td><td>${sparkline(MONTHS.slice(0, state.month + 1).map((_, mi) => slice(state.source, mi).totalTime), (v, mi) => `${fmt.time(v)}|${MONTHS[mi].label}`)}</td></tr>`;
  }

  // ---------- Performance loop view ----------

  // Value and its change in two aligned columns, so values line up down the table even when the change is missing.
  function metric(value, change) {
    return `<span class="metric"><strong>${value}</strong><span class="chg">${change || ""}</span></span>`;
  }

  function renderLoop() {
    const cur = slice(state.source, state.month);
    const prev = state.month ? slice(state.source, state.month - 1) : null;
    const month = MONTHS[state.month].label;

    const ret = paidReturn(state.source, state.month);
    const prevRet = state.month ? paidReturn(state.source, state.month - 1) : null;
    $("loopSub").textContent = `${month} · ${state.source === "all" ? "all sources" : SOURCES.find((s) => s.id === state.source).name}`;
    $("loop").innerHTML = [
      ["Spend", fmt.money(cur.spend), delta(cur.spend, prev && prev.spend, "count", vs()), "fa-bullhorn"],
      ["Leads", fmt.num(cur.starts), delta(cur.starts, prev && prev.starts, "count", vs()), "fa-magnet"],
      ["Bookings", `${fmt.num(cur.booked)} <small>${fmt.pct(cur.bookedRate)}</small>`, delta(cur.bookedRate, prev && prev.bookedRate, "rate", vs()), "fa-calendar-check"],
      ["Revenue", fmt.money(cur.revenue), delta(cur.revenue, prev && prev.revenue, "count", vs()), "fa-sack-dollar"],
      ["Return on spend", fmt.x(ret), ret == null ? `<span class="delta flat">Organic only</span>` : delta(ret, prevRet, "x", vs()), "fa-rotate-right"],
    ].map(([l, v, s, ic], i, all) => `${i ? '<span class="loop-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>' : ""}<div class="kpi loop-tile${i === all.length - 1 ? " spotlight" : ""}"><div class="lbl"><i class="fa-solid ${ic}"></i>${l}</div><div class="val">${v}</div><div class="sub">${s}</div></div>`).join("");

    const ids = state.source === "all" ? SOURCES.map((s) => s.id) : [state.source];
    const rows = ids.map((id) => ({ src: SOURCES.find((s) => s.id === id), cur: slice(id, state.month), prev: state.month ? slice(id, state.month - 1) : null }))
      .sort((a, b) => b.cur.revenue - a.cur.revenue);
    $("sourceRows").innerHTML = rows.map(({ src, cur: c, prev: p }) => {
      const open = state.openRow === src.id;
      const d = (kind, a, b) => delta(a, b, kind, vs(), { bare: true });
      const facts = [
        [src.kind, ""],
        ["Spend", c.spend ? `${fmt.money(c.spend)} ${d("count", c.spend, p && p.spend)}` : "None"],
        ["Avg ticket", `${fmt.money(c.ticket)} ${d("count", c.ticket, p && p.ticket)}`],
        ["Time to book", `${fmt.time(c.totalTime)} ${d("time", c.totalTime, p && p.totalTime)}`],
      ];
      return `<tr class="src-row${open ? " open" : ""}" data-source="${src.id}" tabindex="0" aria-expanded="${open}">
        <th scope="row"><span class="swatch" style="background:${src.color}"></span>${src.name}<i class="fa-solid fa-chevron-down caret"></i></th>
        <td class="num">${metric(fmt.num(c.starts), d("count", c.starts, p && p.starts))}</td>
        <td class="num">${metric(`${fmt.num(c.booked)} <small>${fmt.pct(c.bookedRate)}</small>`, d("rate", c.bookedRate, p && p.bookedRate))}</td>
        <td class="num">${metric(fmt.money(c.revenue), d("count", c.revenue, p && p.revenue))}</td>
        <td class="num">${c.ret == null ? metric(`<span class="muted">—</span>`, "") : metric(fmt.x(c.ret), d("x", c.ret, p && p.ret))}</td>
      </tr>
      <tr class="src-detail${open ? "" : " d-none"}"><td colspan="5">
        <div class="detail-facts">${facts.map(([k, v]) => `<span>${v ? `<small>${k}</small>${v}` : `<em>${k}</em>`}</span>`).join("")}</div>
        ${funnelBars(c, p, true)}
      </td></tr>`;
    }).join("");

    renderRevenueBySource(ids);
  }

  function renderRevenueBySource(ids) {
    const sources = ids.map((id) => SOURCES.find((s) => s.id === id));
    const months = MONTHS.slice(0, state.month + 1);
    const totals = months.map((_, mi) => sources.reduce((t, s) => t + slice(s.id, mi).revenue, 0));
    const max = Math.max(...totals);
    const ink = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#0b1220" : "#fff";
    };

    $("revLegend").innerHTML = sources.length > 1 ? sources.map((s) => `<span><i class="sw" style="background:${s.color}"></i>${s.name}</span>`).join("") : "";
    $("revTableBtn").textContent = state.revenueAsTable ? "Show bars" : "Show table";

    if (state.revenueAsTable) {
      $("revChart").innerHTML = `<div class="table-responsive"><table class="ad-table"><thead><tr><th>Month</th>${sources.map((s) => `<th class="num">${s.name}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>${months.map((m, mi) => `<tr><th scope="row">${m.label}</th>${sources.map((s) => `<td class="num">${fmt.money(slice(s.id, mi).revenue)}</td>`).join("")}<td class="num"><strong>${fmt.money(totals[mi])}</strong></td></tr>`).join("")}</tbody></table></div>`;
      return;
    }

    $("revChart").innerHTML = months.map((m, mi) => {
      const segs = sources.map((s) => {
        const v = slice(s.id, mi).revenue;
        const share = totals[mi] ? v / totals[mi] : 0;
        return `<div class="seg" tabindex="0" data-tip="${fmt.money(v)}|${s.name} · ${fmt.pct(share)} of ${m.label}" style="flex-basis:${(share * 100).toFixed(2)}%;background:${s.color}"><span style="color:${ink(s.color)}">${s.name}</span></div>`;
      }).join("");
      return `<div class="stack-row${mi === state.month ? " current" : ""}"><span class="lbl">${m.short}</span><div class="stack-track"><div class="rev-stack" style="width:${((totals[mi] / max) * 100).toFixed(1)}%">${segs}</div></div><span class="stack-total">${fmt.money(totals[mi])}</span></div>`;
    }).join("");

    // Only keep a segment label when it fits with room on both sides; the legend and tooltip carry the rest.
    requestAnimationFrame(() => {
      $("revChart").querySelectorAll(".seg").forEach((seg) => {
        const label = seg.firstElementChild;
        label.style.visibility = label.scrollWidth + 12 <= seg.clientWidth ? "visible" : "hidden";
      });
    });
  }

  // ---------- Tooltip (hover and keyboard focus show the same thing) ----------

  const tip = $("tip");
  function showTip(el, x, y) {
    const [head, ...rest] = el.dataset.tip.split("|");
    tip.innerHTML = `<strong>${head}</strong>${rest.map((r) => `<div>${r}</div>`).join("")}`;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x + 14, window.innerWidth - w - 8) + "px";
    tip.style.top = (y + h + 24 > window.innerHeight ? y - h - 10 : y + 14) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) showTip(el, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener("pointerleave", hideTip);
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return hideTip();
    const r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.addEventListener("focusout", hideTip);

  // ---------- Wiring ----------

  function render() {
    document.querySelectorAll("[data-view]").forEach((el) => el.classList.toggle("d-none", el.dataset.view !== state.view));
    document.querySelectorAll(".ad-tab").forEach((t) => {
      const on = t.dataset.tab === state.view;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on);
    });
    if (state.view === "funnel") renderFunnel(); else renderLoop();
  }

  const monthSelect = $("monthSelect");
  MONTHS.forEach((m, i) => monthSelect.add(new Option(m.label, i)));
  monthSelect.value = state.month;
  monthSelect.addEventListener("change", () => { state.month = Number(monthSelect.value); render(); });

  const sourceSelect = $("sourceSelect");
  SOURCES.forEach((s) => sourceSelect.add(new Option(s.name, s.id)));
  sourceSelect.addEventListener("change", () => { state.source = sourceSelect.value; state.openRow = null; render(); });

  document.querySelectorAll(".ad-tab").forEach((t) => t.addEventListener("click", () => {
    state.view = t.dataset.tab;
    history.replaceState(null, "", "#" + state.view);
    render();
  }));
  window.addEventListener("hashchange", () => { state.view = location.hash === "#loop" ? "loop" : "funnel"; render(); });

  $("sourceRows").addEventListener("click", (e) => {
    const row = e.target.closest(".src-row");
    if (!row) return;
    state.openRow = state.openRow === row.dataset.source ? null : row.dataset.source;
    renderLoop();
  });
  $("sourceRows").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("src-row")) { e.preventDefault(); e.target.click(); }
  });
  $("revTableBtn").addEventListener("click", () => { state.revenueAsTable = !state.revenueAsTable; renderLoop(); });

  window.mmAdmin = { slice, MONTHS, STAGES };
  render();
})();
