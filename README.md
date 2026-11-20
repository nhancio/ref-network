# Ref Network

Ref Network is a local web MVP for referral campaigns. A merchant publishes an offer and gives each referrer a link. Ref applies eligible offers when the shopper opens the business’s checkout link. Referrers earn points from qualifying purchases and spend them at the issuing business.

## Run locally

Use Node.js 24 or later.

```sh
npm ci
npm start
```

Open the **owner link** printed in the terminal. It signs this browser into the local workspace. Keep the owner link private. The server binds to `127.0.0.1:4173` and stores campaigns and activity in `.ref-network.sqlite`.

The [public landing page](http://127.0.0.1:4173/landing) includes a Three.js explorer with a sample network. Visitors can rotate the scene, pick a shopper, referrer or business and see the corresponding path. Browsers without WebGL show an interactive flat view. The explorer uses illustrative data and works without signing in.

## Try a personal network

1. Open [My network](http://127.0.0.1:4173/network) and create a local profile. Generate an invitation and have your contact open it in another browser or profile. After they accept, confirm their name under **Requests**.
2. To make a business reachable, the referrer opens their private **Rewards invite** from the merchant workspace and links their rewards profile in **My network**. For a reusable offer, choose **Show offer** or **Ask me first**. Each offer starts private.
3. The connected shopper can select the person or business in the graph or the list. **View offer** opens the existing checkout offer flow. **Request a referral** creates a private item under the referrer's **Requests**. Once they select **Share offer**, the shopper can refresh and open it.

The graph uses mutually confirmed connections and merchant-issued offers chosen by the referrer. The public sample has its own fixed data. This local version stores network sessions in each browser and delivers requests inside Ref. Disconnection or hiding an offer removes discovery and cancels outstanding approvals. Reusable offer links already shared are governed by the merchant's campaign and can be revoked there.

1. Open Nithin’s offer under **Friends of Mango Yard**. Under **Checkout**, create a bill with a reference and subtotal of at least ₹700. Open that checkout link in the same browser as the offer to see the automatic discount.
2. Confirm the checkout as the shopper. In the merchant tab, the bill becomes ready to pay. **Mark bill paid** records demo payment and credits the referrer. The refresh button updates the checkout list if needed.
3. Open **Rewards invite** on Nithin’s link and use the one-time private invite. The rewards page shows points available at each business. Create a second bill at Mango Yard and open the link in the browser with Nithin’s rewards account to use the points.

To start a separate database without demo offers, run `REF_DB=./pilot.sqlite REF_PORT=4174 node server.mjs --empty`. Use fictional names and orders in the local workspace.

## Campaign rules

- Offers support a percentage or fixed rupee discount, optional minimum subtotal, an end date in India time, and a limit on offers. A campaign can require requests to be approved under **Activity**.
- A reusable link attributes eligible sales to its referrer. A single-use link has one successful claimant. The latest eligible link opened for a business in the past seven days provides attribution, with an existing approval for that campaign retaining its original referrer. Each eligible offer is limited to one use per campaign and browser.
- A referrer can have one rewards profile linked to several businesses. One point gives ₹1 off at the business that issued it. A referrer already signed into that profile cannot use their own referral offer. Points count after staff record payment, and spending is reserved while checkout is active.
- Checkout links expire after 15 minutes. Checkout creation is keyed to the business and its bill reference. Payment attempts against an already-paid checkout return the same status. Old manual-code redemptions keep their original accounting.

The demo runs in one local workspace and groups balances by the normalized business name. An actual rollout needs distinct verified merchant accounts, shopper identity that works across devices and app browsers, payment confirmation from a POS or payment provider, and refund handling. [Relationship verification and abuse cases](./referral-trust.md)

## Verify

```sh
node --test referral.test.mjs
```

The request-level tests cover automatic and reviewed offers, attribution, minimum spend, known self-referrals, duplicate bills and payments, points across two merchants, private rewards access, merchant-specific spending and double-spend protection.

## Landing page illustration

`public/landing-hero.jpg` is an illustrative scene generated with the built-in image tool.

<details>
<summary>Image generation prompt</summary>

Use case: photorealistic-natural. Asset type: single hero photograph for the landing page of Ref Network, a referral offer tool for Indian neighbourhood businesses. Wide 3:2 editorial photograph, with the main scene kept in the central area so it crops well to a tall 5:4 hero. A natural checkout moment in a contemporary independent Bengaluru home-and-pantry shop with fading sage green painted woodwork, warm off-white plaster, Indian ceramic wares and jars, warm terracotta touches and sunlight coming in from the shopfront. A woman shopper in her early 30s in a softly rust-coloured cotton kurta on the left is showing her smartphone (phone screen faces the shopkeeper, no visible UI) to a friendly man shopkeeper in his mid-30s with dark short hair and a simple cream collared linen shirt on the right, both looking at it with a natural warm expression. They are approximately the same distance from camera with relaxed postures, completely candid independent magazine reportage, everyday urban India with authentic contemporary clothing. A low wooden checkout counter and brown paper shopping bag are visible. Both faces have a good view and are comfortably within the inner 70% horizontally, subjects are at medium distance, heads and hands all in the frame, broad sense of shop environment. Earthy colours, soft film grain, refined composition, realistic skin textures, natural late afternoon light, detailed but not busy. No logos, no legible lettering, no floating graphics, no layout, no borders, no illustration, no advertisement posing, no handshakes.

</details>
