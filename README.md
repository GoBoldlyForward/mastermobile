# MasterMobile

Better bookings for your auto detailing business.

Landing page and early access onboarding for [mastermobilecleaning.com](https://www.mastermobilecleaning.com). Plain HTML, CSS and JavaScript with no build step, served by GitHub Pages.

- `index.html`: landing page
- `start.html`: early access onboarding
- `admin.html`: admin dashboard (booking funnel with time between stages, and the performance loop by source)
- `assets/`: styles and scripts

## Go live

All go-live values live in `assets/config.js`. Leave a value blank and that part of the flow runs in demo mode: leads log to the browser console and checkout skips Stripe. Nothing in that file is secret; Formspree ids and Stripe Payment Links are public by design.

### 1. Leads: Formspree

1. Create a form at [formspree.io](https://formspree.io) and copy its endpoint (`https://formspree.io/f/xxxxxxxx`) into `formEndpoint`.
2. In the form's settings, turn reCAPTCHA off. The page posts JSON from JavaScript with no captcha widget, so a captcha requirement rejects every submission. The hidden `_gotcha` honeypot handles bots.
3. Optional: turn on the Google Sheets integration for a live spreadsheet.

Each person produces up to four rows that share one `reference` (`MM-XXXXXX`). The newest `intent` is their status:

| `intent`   | When it is sent                                      |
| ---------- | ---------------------------------------------------- |
| `lead`     | Contact details saved, before the price is shown     |
| `checkout` | They clicked through to Stripe                       |
| `later`    | They tapped "Not ready today" on the offer           |
| `paid`     | Stripe sent them back to the confirmation page       |

The `paid` row carries `stripe_session_id`, and every row carries the UTM parameters, click ids, landing page and referrer as their own columns. Budget roughly three submissions per person against the Formspree plan limit.

### 2. Payments: Stripe Payment Links

Create three products in the [Stripe Dashboard](https://dashboard.stripe.com/products):

| Product                 | Price             | Used by                                  |
| ----------------------- | ----------------- | ---------------------------------------- |
| Early access deposit    | $1,500 one-time   | `standardPaymentLink` (homepage visitors; counts as their first month) |
| Workshop deposit        | $1,000 one-time   | `workshopPaymentLink` (workshop attendees)  |
| MasterMobile            | $1,500 / month    | Subscriptions you create at launch (step 3) |

Create a Payment Link for each one-time product with these settings:

- **Advanced options → Save payment details for future use: on.** This makes Checkout create a Stripe Customer, attach the card to it, and charge the deposit, so the card can be charged again later without the customer re-entering it. Without it Stripe records a guest payment and keeps no card.
- **After the payment → Redirect customers to your website:**
  - Workshop: `https://www.mastermobilecleaning.com/start.html?paid=1&offer=workshop&session_id={CHECKOUT_SESSION_ID}`
  - Early access: `https://www.mastermobilecleaning.com/start.html?paid=1&session_id={CHECKOUT_SESSION_ID}`
- Leave name, phone, address and custom fields off. The onboarding flow already collected them, and the page passes the email in as `prefilled_email`.
- Turn on receipts for successful payments under Settings → Emails. The confirmation page tells them to check their email for a receipt.

Paste each link's `https://buy.stripe.com/...` URL into `assets/config.js`. Build the links in a sandbox first and run the flow with card `4242 4242 4242 4242`, then recreate them in live mode and swap the URLs.

The page appends `client_reference_id=MM-XXXXXX` to every checkout, so a payment in Stripe (Payments → the payment → Checkout session) and its row in Formspree match on the reference.

### 3. At launch: start monthly billing

When a customer is onboarded, in Stripe go to Customers, open them by email, and create a subscription on the $1,500 / month price using the card saved at checkout.

- Early access customers already paid their first month as the deposit, so set the subscription's first billing date one month after their onboarding date (a free trial ending on that date does this).
- Workshop customers paid a $1,000 deposit. Bill from the onboarding date, and if the deposit should count against the first month, add a $1,000 credit to the customer balance before creating the subscription.
