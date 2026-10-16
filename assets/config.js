// Go-live settings. Leave a value blank and that part of the flow runs in demo mode:
// leads log to the browser console instead of posting, and checkout skips Stripe.
// Everything here is public by design (the repo is public), so no secrets belong in this file.
window.MM_CONFIG = {
  // Formspree form endpoint, e.g. "https://formspree.io/f/abcdwxyz". Receives every lead as JSON.
  formEndpoint: "https://formspree.io/f/mbgdqagy",

  // Stripe Payment Link for the $1,500 first-month deposit homepage visitors pay, e.g. "https://buy.stripe.com/xxxxxxxx".
  standardPaymentLink: "https://buy.stripe.com/test_eVq4grePvgn58sS5HvcMM01",

  // Stripe Payment Link for the $1,000 workshop deposit.
  workshopPaymentLink: "https://buy.stripe.com/test_4gMdR14aR7QzgZofi5cMM00",

  // Monthly sales needed to qualify for the money-back guarantee.
  guaranteeMinMonthly: 5000,
};
