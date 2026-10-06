// Earnings calculator: today's revenue and costs, then the improvement sliders (max 30% revenue, 20% costs).
(function () {
  const $ = (id) => document.getElementById(id);
  const inputs = ["calcRevenue", "calcCosts", "calcLift", "calcSavings"].map($);
  if (inputs.some((el) => !el)) return;
  const [revenue, costs, lift, savings] = inputs;
  const money = (n) => "$" + Math.round(n).toLocaleString();

  // Saved only after a visitor moves a slider, so sales never mistakes our defaults for their numbers.
  // start.js reads this and sends it with the lead.
  function save(snapshot) {
    try { sessionStorage.setItem("mm_calculator", JSON.stringify(snapshot)); } catch (e) {}
  }

  let touched = false;

  function render() {
    // Costs can't sensibly exceed revenue, so the costs slider tops out at the current revenue.
    costs.max = revenue.value;
    if (Number(costs.value) > Number(revenue.value)) costs.value = revenue.value;

    const rev = Number(revenue.value);
    const cost = Number(costs.value);
    const liftPct = Number(lift.value) / 100;
    const savePct = Number(savings.value) / 100;

    const profitToday = rev - cost;
    const profitWith = rev * (1 + liftPct) - cost * (1 - savePct);
    const extra = profitWith - profitToday;

    $("calcRevenueOut").textContent = money(rev);
    $("calcCostsOut").textContent = money(cost);
    $("calcLiftOut").textContent = `+${lift.value}%`;
    $("calcSavingsOut").textContent = `-${savings.value}%`;
    $("calcExtraMonth").textContent = "+" + money(extra);
    $("calcExtraYear").textContent = "+" + money(extra * 12);
    $("calcProfitToday").textContent = money(profitToday);
    $("calcProfitWith").textContent = money(profitWith);

    const snapshot = {
      monthly_revenue: rev,
      monthly_costs: cost,
      revenue_lift_pct: Number(lift.value),
      cost_reduction_pct: Number(savings.value),
      extra_per_month: Math.round(extra),
      extra_per_year: Math.round(extra * 12),
    };
    if (touched) save(snapshot);

    // Fill the track up to the thumb so each slider reads at a glance.
    inputs.forEach((el) => {
      const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
      el.style.setProperty("--fill", `${pct}%`);
    });
  }

  inputs.forEach((el) => el.addEventListener("input", () => { touched = true; render(); }));
  render();
})();
