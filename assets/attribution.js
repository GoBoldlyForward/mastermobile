// Captures ad click ids and UTMs on any page so the onboarding form can send them with the lead.
// The site practices what it sells: every signup is attributable to a campaign or partner.
(function () {
  const TRACKED = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "msclkid", "fbclid", "ref"];
  const params = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem("mm_attribution") || "{}"); } catch (e) {}

  // First touch wins for landing page and referrer; later params (e.g. a second ad click) overwrite.
  if (!saved.landing_page) saved.landing_page = location.pathname;
  if (!saved.referrer && document.referrer && !document.referrer.includes(location.host)) saved.referrer = document.referrer;
  TRACKED.forEach((key) => { if (params.get(key)) saved[key] = params.get(key); });

  try { sessionStorage.setItem("mm_attribution", JSON.stringify(saved)); } catch (e) {}
  window.mmAttribution = saved;
})();
