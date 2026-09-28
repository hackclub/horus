# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: a Hack Club support helper on shift.** They are working a queue, usually with Horus on a second monitor or a second tab beside Slack, scanning for what to pick up next. Their session is short, repeated, and interruption-driven — they come back to Horus between threads, not once a day. Speed of orientation and glanceability matter more to them than depth.

**Secondary: team leads and instance sponsors.** They read the same surfaces for support-ops health — backlog depth, response times, who is carrying load. They are a real audience, but they are not the design driver; helpers come first.

**Super admins** (global `admin` role) additionally manage instances, organizations, and user accounts. This is an operator audience, not a daily one.

Every user authenticates through Hack Club OAuth and is identified by a Slack ID. There is no anonymous account tier, but the instance directory and per-instance dashboards are readable signed out.

## Product Purpose

Horus centralizes Hack Club's support channels into one unified view of support operations. Support at Hack Club is spread across many independent Nephthys instances, each bound to its own Slack channel; there is no single place to see the whole surface. Horus is that place.

Success is a helper opening Horus, knowing within seconds what needs them next, and getting into the right Slack thread — repeatedly, across a shift, without having to check each channel by hand.

## Positioning

**Horus is the cross-instance lens.** Nephthys stays the source of truth for its own instance; Horus's irreducible value is seeing every support channel at once, which no single Nephthys can do. Aggregation is the moat.

The consequence is directional: anything a single Nephthys instance already shows well is not, by itself, a reason for Horus to exist. Work that spans instances — comparison, roll-up, cross-channel ranking, "where is the pressure right now" — is the defensible center.

## Operating Context

- **Slack (Hack Club enterprise grid)** is where support work actually happens. Horus links out to channels and threads, with deeplinking into the Slack desktop/mobile app as the default and web archive links as the fallback.
- **Nephthys** is the per-instance ticket system. Each Horus instance maps to exactly one Nephthys host plus one Slack channel. Horus reads its `/api/tickets`, `/api/ticket` and `/api/stats_v2` endpoints. Ticket message text (`description`) is only returned for requests carrying a Nephthys API key (made in each instance's `/lobby`; a key only works on the host it was made on), and falls under the Hack Club Slack Scraping Use Policy: never public, never used for training.
- **Hack Club AI** (`ai.hackclub.com`) is an OpenAI-compatible proxy over OpenRouter. Users bring their own key; Horus has no server-wide AI key.
- **Cachet** supplies Slack identity — display names, pronouns, avatars — resolved by Slack ID.
- **Jelly / Marmalade** is the email-support side. Marmalade brokers mailbox access via per-user, per-instance API keys that users paste into Horus themselves. This integration is partial and gated behind a PostHog feature flag.
- **A scheduled job** (`scripts/run-cron.py` → `POST /api/cron`) snapshots per-instance ticket counts into Redis so the public directory can render counts without fanning out to every Nephthys host on each request.
- The product is in **open beta** and says so in a persistent site banner.

## Capabilities and Constraints

**Confirmed capabilities**

- Public instance directory with per-instance open / in-progress / resolved counts, image banners, and a deprecation marker.
- Per-instance dashboard: unassigned queue, tickets assigned to a chosen helper, oldest unanswered ticket, time-to-resolution distribution, status breakdown, and a helper leaderboard.
- "Open random" from the unassigned queue, as a triage-fairness device.
- Instance settings for members: identity, Nephthys host and Slack channel, Jelly mailbox, member roles, and instance transfer/deletion.
- Super-admin panel: instance/organization CRUD, global user list, role assignment, bans, and impersonation.
- Per-user preferences: default instance, analytics opt-out, Slack deeplinking.
- Marmalade API keys stored encrypted (AES-256-GCM) per user per instance.
- One Nephthys API key per instance, set by an instance admin (`general:write`) in Settings, stored the same way and pinned to the host it was validated on (if the instance is repointed, the key isn't sent to the new host). With it, signed-in **members** of that instance see full ticket messages; signed-out visitors and non-members never do, since dashboards are public. Keyed fetches are uncached so they never land in a shared cache, and every surface showing message or AI text is marked `ph-no-capture` so PostHog autocapture and replay skip it.
- Ticket peek (dialog) from the queue tables and the Review page, plus queue search.
- AI with the user's own Hack Club AI key: per-ticket summary and reply draft (streamed; for members of an instance with a Nephthys key, since it reads the message) and a queue brief of the unassigned queue (works on titles alone, reads messages when a key is present). Requests ask OpenRouter for `data_collection: deny` providers; nothing is sent until the user presses a button, and outputs aren't stored.
- PostHog analytics with a genuine opt-out, plus in-product feedback surveys.

**Roles.** Global: `user`, `admin` (super admin). Per-instance: `helper` (read), `admin` (read + general/member writes), `sponsor` (everything, including danger zone). An instance always needs a sponsor.

**Terminology.** *Instance* = one support channel's presence in Horus, backed one-to-one by an organization. *Sponsor* = instance owner. Ticket statuses come from Nephthys as `OPEN`, `IN_PROGRESS`, `CLOSED`; `OPEN` is surfaced to users as **Waiting**.

**Constraints**

- **Read-only for now.** Horus does not write tickets, replies, emails, or conversations. AI reply drafts are copied to the clipboard for the helper to post themselves. This is a deliberate current-phase constraint rather than a permanent product principle — ticket actions are plausible later, so design must not foreclose them. Configuration writes (instances, members, roles, preferences, API keys) exist today and are not covered by this constraint.
- Freshness is bounded by upstream: Nephthys fetches use short revalidate windows, and directory counts are only as current as the last cron snapshot. Horus cannot be more live than the systems it reads.
- Nephthys exposes no aggregate endpoint for resolution-time distribution, so Horus derives it by pulling a year of closed tickets. This is a known upstream gap, not a chosen design.
- Authentication is Hack Club OAuth only. A Slack ID is mandatory; there are no local accounts and no email/password path.
- Instance visibility is currently all-public. Hiding instances from the public directory is an intended capability that is **not implemented**.

**Explicitly undecided**

- Whether the Jelly/Marmalade integration becomes a first-class surface or stays a flagged side channel.
- What the "Ticket Check Up" widget is supposed to surface; it is a named placeholder with no defined behavior.

## Brand Commitments

- **Name and mark:** Horus, with existing eye-of-Horus wordmark and icon assets in `public/`. Written as "Horus Dashboard" in full.
- **Voice:** first-person, warm, and personal — the product speaks as its author rather than as a company. Existing copy uses casual register, occasional emoji and `<3`, and self-deprecating honesty ("Open-beta software, bugs commonly appear"). That candor about the product's own maturity is a commitment, not a placeholder.
- **Incumbent visual system:** emerald/teal primary, full light and dark themes, Lora for headings, Space Grotesk for body, Geist Mono for mono. Present and coherent in `app/globals.css`.
- **Author and contact:** Simon K (`@lazyllama` on GitHub, Slack `@Simon K`, me@lazyllama.xyz). Open source at `github.com/lazylllama/horus-dashboard`, conventional commits.

## Evidence on Hand

- **Live production data** from real Nephthys instances, Cachet, and Marmalade. Every number in the product is real; nothing is seeded or demo content.
- **Product screenshot** embedded at the top of `README.md`.
- **Public repository** with full commit history.

**Absences that must not be fabricated:** Horus has no testimonials, no published user counts or adoption figures, no case studies, no press, no pricing, and no SLA. It is a free internal tool for the Hack Club community. Future work must not invent social proof, usage statistics, or performance claims for it. The README's "blazing speeds" is existing author voice, not a benchmarked claim to build on.

## Product Principles

1. **Aggregation is the product.** Anything a single Nephthys instance already answers well is not why Horus exists. Cross-instance visibility is the thing to protect and extend.
2. **Design for the helper mid-shift.** The default reader is interrupted, returning, and looking for one thing: what needs me next. Every surface should answer that before it answers anything else.
3. **Getting the user out of Horus is a success, not a leak.** The shortest path from a signal to the right Slack thread is a core feature.
4. **Read-only is a phase, not an identity.** Don't ship writes against support content now; don't architect as though writes will never come.
5. **Be honest about freshness and maturity.** Data that is cached, stale, or partial should say so. The open-beta candor already in the product is the standard, not an embarrassment to design around.
