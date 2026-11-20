# Ref Network

## Product proposal

Ref Network helps you find someone you trust who can introduce you to a person or business. The first use case is dining in one neighbourhood. A diner can ask for a table at a place they already have in mind or search for places that someone in their circle can introduce them to.

**Pilot assumption.** Start in Indiranagar, Bengaluru, using a few overlapping circles and 8–12 independent restaurants. The best first neighbourhood is where the team can personally recruit both connectors and owners. The locality, price and pilot thresholds below are working assumptions.

[Open the mobile web concept](./ref-network-concept.png)

## Two ways to get an introduction

1. **I already know the place.** Ananya opens Mango Yard from a shared link or finds it by name. She sees “Via Nithin” because he has agreed to accept intro requests for this venue and share that connection with this circle. She sends Nithin the party size, requested time and an optional note. The screen shows “Waiting for Nithin.” For a same-day visit, Ananya can also call the restaurant’s public line while the referral is pending.
2. **I know what I want.** Ananya searches “Good dinner under ₹800 per person in Indiranagar, with an offer.” Ref filters participating venues by area, meal, estimated price and any current merchant-confirmed perk. It ranks eligible intro paths by connector willingness and venue fit. Each card shows the venue, why it fits, and who can introduce her. If nobody in her circle has a path, she can post a request to that circle. Participating venues without a path can show up under “Browse nearby,” with their ordinary booking route. Price estimates and offers have explicit sources and update dates.

### The handoff

- **Connector.** Nithin gets a private link to the request. He can vouch and share, decline, or let the request expire. After approval he can forward the prefilled message himself on WhatsApp. The preview shows exactly what the restaurant will see. A saved contact can help Nithin choose the recipient on his device.
- **Restaurant.** The participating restaurant opens the request, sees who vouched, and can confirm, suggest a time or decline. A counteroffer needs the diner’s acceptance. The venue may offer a fixed perk with its terms. A booking or discount appears as confirmed only after the relevant approval.
- **Diner.** The request timeline shows who needs to act next. On arrival the venue redeems a one-time code. The diner receives the redemption receipt and can flag an incorrect redemption.

Request transitions are awaiting connector → ready to share → awaiting venue → confirmed → redeemed. Move to “Awaiting venue” when the connector marks the link as shared or authorised venue staff open it. Label the former “Shared by Nithin” and record the venue open separately. Decline, expiry and cancellation are terminal states. A suggested time pauses confirmation until accepted. Retries reuse the existing request, forwards and redemption are idempotent, and a stale request cannot confirm or redeem. Revocation stops new requests and invalidates pending ones while preserving confirmed bookings. The event log records who vouched and who confirmed. A pending request may expire before the desired arrival time.

## The interface

- **Explore.** A simple search followed by list and map views. Show a clear line from the diner through the connector to the venue, with other eligible relationships faded back. On mobile the result list is the default, and a selected card expands its route. On desktop a map and detail pane can sit side by side. All map actions have keyboard-accessible list equivalents.
- **Request detail.** Show the venue, party size, date and time, optional note, and the next action. Show cancellation, expiry and confirmation inline. The connector sees “Vouch & share” and “Decline.” Restaurant staff see “Confirm table,” “Suggest another time,” and “Decline.”
- **My circle.** Invite someone through a private link and add a connection under “I can introduce you.” Pick the venue, relationship and who can ask. Pause or revoke the relationship at any time.
- **Venue setup.** A small operator screen for staff access, venue profile, inventory or fixed slots if needed, current perk terms, request handling, redemption and a monthly summary.

The visual reference is Pancake’s interactive map. Ref’s design uses a smaller private graph, illustrated portraits, warm ivory surfaces and a highlighted introduction path. The people and restaurant in the mockup are illustrative. [GTM Brain](https://gtmbrain.si/)

## How the graph works

The minimum data model is users, circle memberships, venues, venue staff, connector-to-venue relationships, perks and introduction requests. Two indexed joins in PostgreSQL can resolve diner → visible connector → venue. A merchant pilot can begin with a curated catalogue and manual verification of a venue’s manager. The venue staff record establishes authority over the listing and over booking and redemption actions.

Model three distinct signals. An address-book entry is a private lead. “I can introduce you” is a connector’s affirmative relationship and visibility choice. A venue-confirmed affiliation means that a merchant verified the connection, where useful. Confirming an introduction is still a new action on each request. A saved number alone cannot infer ownership, current employment, quality, price or willingness to help.

For the web pilot use link invitations and manual venue links. Where supported, offer the web contact picker after an explicit user action. It selects entries and has limited browser availability. Google People API supports a separately consented contacts scope. A native OS contact picker becomes worth testing when adding contacts is a proven onboarding bottleneck. Use selected entries only for the specific action, and only surface a connector to the people they chose. [Web Contact Picker](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API) · [Google People API](https://developers.google.com/people/api/rest/v1/people.connections/list/) · [Apple Contacts](https://developer.apple.com/documentation/contacts/accessing-the-contact-store)

LinkedIn sign-in supplies identity fields. Its Connections API requires LinkedIn approval. Facebook’s friends scope covers eligible users of the same app. Instagram’s documented API focuses on professional accounts. Treat social links as optional profile context and base discovery on explicit Ref relationships. [LinkedIn sign-in](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) · [LinkedIn Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) · [Meta friends reference](https://developers.facebook.com/docs/graph-api/reference/user/friends/) · [Instagram API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)

Store request details and relationship data only for their stated purpose, with retention limits and user controls for removal and visibility. Address book permission and permission to publish a third party’s details are distinct. Keep personal numbers out of search, previews and shared URLs. Use a short-lived link for the handoff and require authentication as a venue staff member for booking or redeeming. Give users control over who can ask, with rate limits and blocking. Have Indian privacy counsel review the data flow and phased DPDP implementation before a real pilot. [DPDP commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) · [DPDP Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)

## How it makes money

Swiggy Dineout and District already market dining discounts. Ref’s offer to a merchant is a traceable introduction from someone who can vouch, with a perk where the economics work. Start with a discretionary benefit such as a complimentary dessert on a quiet evening or priority confirmation for a group table. Show any discount or perk only once merchant terms are recorded. [Swiggy Dineout](https://www.swiggy.com/swiggy-diners) · [District dining](https://www.district.in/blog/district-dining-carnival-delhi-ncr)

**First paid test.** Agree upfront on ₹99 per completed referred table for at least three merchants. Settle confirmed redemptions at the end of the pilot, then monthly for merchants who continue. The diner pays the restaurant directly, and Ref bills the restaurant. At 20 eligible tables per paying venue per month, that yields ₹1,980 per venue or ₹19,800 across 10 paying venues before operating costs, sales effort, disputes and applicable taxes. These are scenario numbers. Track new versus repeat guests where the venue can confirm it with minimal data, and ask whether the visit was incremental. A venue with ₹99 in referral fees plus a perk that costs it ₹100 needs more than ₹199 in incremental contribution per table to gain from the arrangement.

An independent restaurant pilot gives the product a tangible outcome and short feedback cycles. A broad social launch needs dense coverage across many categories. The other plausible paid path is private directory and intro workflow software for a founder or alumni community. Team buyers can name a budget owner, and there are established tools in that category. Test whether the local concept has repeat use before expanding, or pilot within one existing community if merchants get too few eligible requests. [The Swarm intro paths](https://help.theswarm.com/en/articles/8142016-find-intro-paths-to-a-list-of-target-accounts-or-people)

## Build and validate in this order

| Stage | Work | Evidence |
| --- | --- | --- |
| Days 1–3 | Recruit 3 overlapping circles, 15–20 connectors and 8–12 nearby venues. Pre-agree a price with 3 merchants. Record real links, availability and offer terms. | Each circle has enough discoverable venues to make the first search worth trying. |
| Days 4–7 | Run the flow manually with a private directory, introductions and WhatsApp. Log only essential booking and outcome information. | First completed visits and a clear read on where users and owners stall. |
| Days 8–14 | Continue the concierge test and collect on the first completed referrals. Use observed wait times, search language and decline reasons to design the first web build. | Target 30 qualified requests, half with a usable path, 10 visits and 3 merchants who pay and agree to continue. |
| First web build | Mobile-first web app backed by PostgreSQL. Deliver venue search and list view, relationship permissions, requests, merchant confirmation and redemption in one working vertical slice. Add the interactive map as a second view on the same authorised data. | Verify the full flow across three accounts, including declined or expired requests, revoked relationships, unavailable offers and duplicate redemption attempts. |

Track requests with a usable path, connector response time, venue confirmation rate, redeemed visits, diners who return to search, and paid merchant renewal. Keep raw volume alongside conversion percentages. Measure cohort density and how much work connectors are doing. If venue coverage is low, recruit locally. If coverage is healthy and requests stall before approval, improve connector routing and timing. If merchants see visits and decline to pay, price and incrementality are the next questions.

For later categories, reuse circles, explicit relationships and approvals. A job referral adds role and company data and a distinct application workflow. Local services can use quote requests. Expand one category at a time so each circle has enough useful relationships.

## Mockup provenance

Created with the built-in image generation tool. The mockup illustrates the core path. The design above specifies consent, statuses, counteroffers and redemption in more detail.

<details>
<summary>Image generation prompt</summary>

Use case: ui-mockup. Generate one polished landscape product design board for an original India-first mobile web product named Ref Network. This is a high-fidelity product concept, clean flat front-facing cropped app screens on a deep aubergine presentation surface, no hardware and no angled perspective. Compose three equal tall screen cards, all fully visible, with legible large type and very little text. Visual direction: warm ivory #faf7ef, near-black plum #23192d, burnt orange #b94731 for key actions, soft lilac and olive accents. Editorial serif headlines, readable modern sans serif UI. Motif: illustrated portrait circles joined by dotted or solid lines, like an intimate neighborhood relationship map. Warm, crisp, airy, sophisticated, clean contrast. The screens form one continuous example with fictional people and business. Left screen header ‘Ref Network’, heading ‘Find a warm intro’, search field ‘Dinner in Indiranagar’, subheading ‘Via your circle’. Main focal point is a clear left-to-right relationship map of three portrait or storefront nodes correctly labeled ‘Ananya’, ‘Nithin’, ‘Mango Yard’ with warm orange edges between them. Small pale branching circles support the map without extra labels. Under the map, show ‘Mango Yard’, ‘Via Nithin’, and button ‘Ask for an intro’. Middle screen header ‘Requests’, heading ‘Ananya asked for an intro’, body ‘Table for 4 at Mango Yard’, secondary ‘Friday · 7:30 pm’, three-node avatar strip with the same three identities, large orange button ‘Vouch & share’, quiet text button ‘Decline’. Right screen header ‘Ref Network’, heading ‘Nithin referred Ananya’, show venue name ‘Mango Yard’, request ‘Table for 4’, secondary ‘Friday · 7:30 pm’, a small realistic cinematic dining photo of a contemporary Bengaluru bistro, primary button ‘Confirm table’, text link ‘Suggest another time’. Use only the words specified. No random text, logos of other brands, grid labels, captions, filler badges, gradients or glass effects. Prioritize typography, clean geometry, legibility, generous breathing room, and separating the three screens.

</details>

