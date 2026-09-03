# Patiom GTM Plan

Goal: **first 10–30 paying customers within 6 months of public launch.**

## Strategic decisions

- **Closed source.** Repo stays private; revisit open-sourcing only at
  product-market fit. The "SDK sees your GraphQL traffic" trust objection is
  handled with a transparent data page, not a license.
- **Database:** PlanetScale Postgres PS-10 non-HA (arm64, ~$10/mo). CF Queues
  buffer ingestion bursts, so a small fixed instance covers year one. Upgrade
  to HA on revenue. (Revisit Tinybird/ClickHouse only at ~100M+ events/mo.)
- **Payments:** Polar (Merchant of Record) — handles global VAT/sales tax, works
  as UK sole trader, subscriptions + webhooks. Fallback: Lemon Squeezy. No
  entity setup needed. MoR fee ~4–5% vs Stripe ~3% is the right trade now.
- **Free tier is safe because limits are hard, not because volumes are small:**
  ingest-time monthly quota per project + high-volume sampling + retention
  deletion bound the marginal cost of any free account.

## Pricing

| Tier  | Price  | Limits                                             |
| ----- | ------ | -------------------------------------------------- |
| Free  | $0     | 1 project, 7-day retention, 100k requests/mo, hard quota |
| Pro   | $29/mo | 3 projects, 90-day retention, 2M requests/mo       |
| Scale | $99+/mo| Unlimited projects, longer retention, priority support |

Self-serve only. Pre-launch, Free is **invite-gated** (founding members +
hand-picked teams); opens self-serve at public launch.

## Phases

### Phase 0 — Ship prod (blocked on user-side prereqs)
Deploy via GitHub Actions (see `DEPLOY_PLAN.md`): PlanetScale, secrets, zones,
first real deploy. Landing page + data/privacy page on `patiom.dev`.

### Phase 1 — Monetizable product (no deadline, quality over speed)
- Dashboard polish: overview charts (Recharts), schema history diff, slowest
  operations, errors. No new surfaces.
- Onboarding ≤ 10 minutes: signup → create project → copy token + 3-line
  snippet → data appears. Quickstarts for Yoga / Apollo / Mercurius (plugins
  already exist).
- **Quota enforcement** (required before free tier opens):
  - counters table incremented by worker-logs; ingestor checks cached value
  - over quota → reject with 429 + dashboard banner
  - high-volume sampling (e.g. >10 req/min → log 10%)
  - truncate operation text at ingest (size cap)
- Retention-enforcement job (7-day delete for free tier) + usage metering.
- Ping GraphQL Weekly editor early: get sponsor rates, reserve a launch-week
  slot.

### Phase 2 — Private beta (4–6 weeks)
- Target: 10–20 GraphQL teams via cold outreach: GraphQL Slack, The Guild
  Discord, r/graphql, GitHub code search for active `createYoga` /
  `apollo-server` repos → personal DMs.
- Offer: **founding member — free Pro for 12 months** in exchange for feedback
  + a testimonial.
- Iterate weekly. Collect testimonials and permission-to-name.

### Phase 3 — Pre-launch (final 2–3 weeks of beta)
- Polar billing live and **tested with a real checkout** (subscription,
  webhooks, entitlement sync).
- Draft SEO comparison pages early enough to rank when the clock starts:
  "Apollo Studio alternative", "GraphQL Hive alternative",
  "Stellate alternative".
- Competitive note (sourced, see docs/STELLATE_MIGRATION.md): The Guild
  acquired Stellate (Sep 2024) and is merging its Metrics into GraphQL Hive —
  "one-line migration off Stellate" is the wedge. Verified gaps we fill:
  country + **city** geo (Stellate is country/continent only), per-request
  schema-version attribution. Privacy parity: both hash IPs with SHA-256.
- Launch assets: demo GIF/video, HN draft, Product Hunt gallery.

### Phase 4 — Public launch (day 0)
Show HN, r/graphql, GraphQL Weekly paid slot, Product Hunt. Free tier opens
self-serve (safe: hard quotas).

### Phase 5 — Revenue phase (launch → +6 months)
- Free→paid conversion: paywall on retention length is the primary lever
  (7-day free vs 90-day paid); usage-limit nudges in dashboard.
- Docs/SEO content compounding; weekly metrics review.
- Target: first 10–30 paying customers by launch + 6 months.

## KPIs

- Activation: signup → first data visible (target ≤ 10 min)
- Beta: teams onboarded, weekly feedback velocity, testimonials collected
- Launch: signups, activated accounts, HN/PH traffic
- Revenue: free→paid %, MRR, logo churn

## Explicitly deferred

Open source (revisit at PMF) · Hyperdrive · migrations switch (very last) ·
SSO/enterprise · public API · Tinybird/D1 re-architecture.
