# Foothill Cabs

Mobile-first private cab booking for Siliguri, written as a dependency-free Cloudflare Worker with D1. GitHub stores the source. Cloudflare serves the site and handles payment verification.

## Set up your own Cloudflare site

1. Create a new private GitHub repository for the cab business. Upload the source folders and root files from this project. Keep the real estate repositories separate.
2. In Cloudflare, open Storage & databases → D1 and create a database named `foothill-bookings`. Copy its database ID into `wrangler.jsonc` in place of `REPLACE_WITH_YOUR_D1_DATABASE_ID`. Commit that edit in GitHub.
3. Open the database Console. Run the statements from `drizzle/0000_booking.sql` once. If using Wrangler instead, run `npx wrangler d1 migrations apply foothill-bookings --remote`.
4. In Workers & Pages, create a Worker from the GitHub repository. Use the repository root, Worker name `foothill-cabs-siliguri`, build command `npm run build` and deploy command `npx wrangler deploy`. The binding name must be `DB`. The build works with Node 22 or newer.
5. Under Worker Settings → Variables and Secrets, create an encrypted `OWNER_PASSWORD` with a long, unique password, then deploy the change. Open `/admin` to sign in. On your own Cloudflare account use this password. The private Sites preview uses a separate verified ChatGPT identity header. **Never set PREVIEW_OWNER_EMAIL on a directly accessible Cloudflare Worker.**

## Connect Razorpay

1. In Razorpay Test Mode generate an API key pair. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as encrypted Worker secrets. Keep the key secret out of GitHub, browser code and chat.
2. Add a webhook in Razorpay Test Mode at `https://YOUR-WORKER-HOST/api/webhook`. Select `payment.captured` and `order.paid`. Choose a random webhook secret and save the same value as `RAZORPAY_WEBHOOK_SECRET` in the Worker. Configure automatic capture in Razorpay. Redeploy the Worker with its secrets. A private preview cannot receive public Razorpay webhooks.
3. In the owner panel, open Settings. Enter the business name, support number and the actual cancellation/refund terms. In Routes, enter the real fare, vehicle, seat count, duration, and what the fare covers. Explicitly approve the fare.
4. In Departures, release a pickup after arranging the driver and vehicle. Use a consistent vehicle registration across routes. Include return and turnaround time in the block duration. Each release sells one whole vehicle. Times use India Standard Time.
5. On the customer site, select the route and date. Complete a Razorpay test payment. Verify the amount, confirmed receipt, entry in the owner panel and successful webhook delivery in Razorpay. Repeat with a failed or dismissed checkout.
6. When your merchant account and launch details are ready, repeat the key, webhook and capture configuration in Live Mode. Use a separate live database or remove test departures from availability. Verify your first real payment in the Razorpay dashboard.

## Operational details

Starter fares and route durations are illustrative. Hero and route images are AI-generated. The owner can replace route images with an upload or an HTTPS image URL. Preview and production databases are separate.

Bookings are held for ten minutes. A delayed capture goes to operator review if another booking holds the same departure, the departure was closed or pickup has passed. Review these bookings in the panel and contact the passenger to arrange a different trip or refund through Razorpay. Customer receipts can be reopened on the booking device or with the private receipt link. The owner panel is the dispatch queue. SMS and WhatsApp notifications are not configured.

## Run locally

Use Node 24 for the included SQLite preview and tests. Run `npm run build`, `npm run validate`, `npm test` and `npm run preview`. Open `http://127.0.0.1:4173`. Set OWNER_PASSWORD in the local shell before starting to test the owner panel. Local preview data is in memory. Payment tests use a simulated gateway.

Official documentation: [Razorpay Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Razorpay webhooks](https://razorpay.com/docs/webhooks/validate-test/), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).
