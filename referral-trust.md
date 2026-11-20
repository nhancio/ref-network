# Ref Network rewards and relationship trust

## The customer flow

A merchant gives the referrer a shareable offer. When a shopper opens it, Ref remembers the source without reserving the offer. The merchant’s bill link shows the eligible discount immediately. The shopper confirms the amount once, and the merchant confirms payment. Ref awards the direct referrer’s points for a qualifying paid sale.

The rewards page shows lifetime points and the spendable balance at each business. One point gives ₹1 off at the issuing business. At checkout, a signed-in referrer can choose to use available points and see the updated total before confirming. This version uses merchant-specific credits in a shared view. A shared balance spendable across independent businesses would need a settlement model and an India-specific regulatory review before a launch. [RBI directions on prepaid payment instruments](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12156)

## What Happenstance shows

Happenstance describes bringing together Gmail, Outlook, Google Calendar, Google Contacts, LinkedIn, X and Instagram into a searchable relationship map. Its public LinkedIn flow asks for a user-provided data export. Its product uses signals such as communication frequency and shared meetings to rank potential introductions. These are useful discovery signals. [Happenstance about](https://happenstance.ai/about) · [LinkedIn flow](https://happenstance.ai/for/linkedin)

LinkedIn provides members with a first-degree connections export. Its official Connections API requires approval, applies LinkedIn’s data restrictions and excludes second-degree browsing. Sign-in identifies the member under that provider. A file upload or social login therefore needs distinct treatment from a confirmed Ref relationship. [LinkedIn export help](https://www.linkedin.com/help/linkedin/answer/a566336/exporting-connections-from-linkedin) · [LinkedIn Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) · [LinkedIn sign-in](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)

## Use different evidence for discovery, offers and points

| Decision | Evidence |
| --- | --- |
| Suggest a possible introduction | An explicitly connected account or user-selected contact can surface a private lead. Label where the signal came from. |
| Link two social accounts to one profile | Ask the signed-in person to verify control of each provider account. Use stable provider IDs and require explicit confirmation for account linking. |
| Unlock a private circle offer | Use a merchant-issued invitation tied to the recipient’s verified account, an opted-in mutual relationship, or merchant approval. Phone verification shows control of a number at the time of verification. |
| Award or spend points | Use a verified merchant’s paid order and its unique reference. Credit points once to the original eligible referrer. Reserve spendable points for one checkout and reconcile payment and refunds. |

Start with invitations and voluntary verification. If members request social discovery, import a user-authorized export or use a permitted API. Give users visibility and removal controls, and expose the introduction route only when the relevant person has agreed to share it.

## Abuse cases and responses

| What could happen | Safer behaviour |
| --- | --- |
| Someone copies a public phone number into contacts or renames it to look familiar. | Keep saved numbers as private leads. Require the other person to opt in or the merchant to approve eligibility. Ask a person to verify possession before using a number as account identity, and handle recycled numbers and account recovery. |
| Users add strangers on LinkedIn, exchange connection requests, edit an export, or claim someone else’s social profile. | Use source-labelled connections for suggestions. Verify ownership of any linked profile through the provider. Require a separate opt-in or merchant permission for a private benefit. |
| A reusable offer leaks into a large group or a personal invite gets forwarded. | Treat a reusable link as intentionally shareable, with a budget, revocation and optional review. Tie personal invites to a verified recipient in the live product. A single-use link in the local demo restricts the number of uses and can be forwarded. |
| Shoppers create multiple accounts, refer themselves or trade referrals. | The demo blocks a known referrer using their own link in the same account. For a live pilot, enforce eligibility per verified customer, limit rewards per customer and merchant, and review repeated activity where payment-provider signals and the merchant’s order records support it. |
| A cashier fabricates bills or a shop and referrer collude. | Verify merchant ownership and staff roles. Keep a staff audit trail, match every eligible order to captured payment in the POS or provider, and hold unusual rewards for merchant review. A local manual “Mark paid” action simulates that event. |
| A real sale is refunded after points have been earned or spent. | Use a merchant-defined return window before earned points become spendable. Reconcile refunds and chargebacks with idempotent reversal entries and restore points from a refunded redemption according to the offer terms. Refund reconciliation is a live integration requirement. |
| A checkout link is replayed or points are spent twice. | The demo binds a confirmed bill to the shopper’s browser, uses one reference per business, expires checkout after 15 minutes, reserves points, and records payment and point entries in one transaction. Live checkout would also bind the offer to an authenticated shopper and the actual POS order. |
| Someone reserves offers and walks away. | A link view reserves nothing. Cancelling or letting checkout expire releases automatic reservations and held points. Explicit approvals stay subject to their campaign terms. A live service can rate-limit repeated reservations and reviews per verified account. |
| A different referral link overwrites attribution. | Show the applied referrer on the checkout screen and keep an approved claim’s original attribution. In the local demo, the latest eligible link for that business is used when no approval exists. For paid campaigns, choose an explicit attribution window and match the first shopper-confirmed referral to the final order. |
| Someone guesses a similarly named business or obtains a forwarded rewards invite. | The demo has one owner and uses business names to partition balances. In a live service, use verified merchant IDs and single-use recipient-bound invites, with session revocation and role-scoped access. |

For India, the practical pilot is a few verified merchants, a modest points budget per merchant, direct purchase-based rewards, and one checkout integration. Preserve attribution when someone moves from a WhatsApp webview to checkout by carrying a signed offer through the merchant flow or by linking it to their verified Ref account. Public and reusable promos can remain simple while higher-value offers require stronger identity and receipt checks.
