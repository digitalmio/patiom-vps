# Patiom - GraphQL Analytics SaaS

## Project Overview
Patiom is a GraphQL analytics platform that helps developers understand and optimize their GraphQL API performance. Similar to Stellate's analytics offering but targeting the underserved mid-market (500K-10M requests/month).

## The Problem We're Solving
GraphQL APIs are complex and developers struggle with:
- Understanding which operations are slow
- Identifying N+1 query problems
- Tracking field-level usage and performance
- Monitoring error patterns
- Optimizing resolver performance

## Target Market
- **Primary:** Small to medium teams using GraphQL (Apollo Server, GraphQL Yoga)
- **Sweet spot:** Companies outgrowing free tiers but not ready for $249/month enterprise tools
- **Pricing:** Starting at $9/month with usage-based pricing (~$10 per million requests)

## Core Value Proposition
"Enterprise-grade GraphQL analytics without enterprise pricing" - providing deep insights into GraphQL API performance at a price point accessible to growing teams.

## Product Structure

### Multi-Project Architecture
- Users can monitor multiple GraphQL APIs from one account
- Each project has its own API token for data collection
- Dashboard is scoped per-project with easy project switching

### Main Dashboard Sections

#### Overview
High-level metrics dashboard showing:
- Total requests over time
- Average response time trends
- Error rates
- Top operations by volume
- Performance distribution (P50, P95, P99)

#### Operations
List and analyze GraphQL operations (queries/mutations):
- Request volume per operation
- Average and percentile latency
- Error rates by operation
- Performance trends over time
- Operation complexity analysis

#### Fields
Field-level analytics showing:
- Most frequently requested fields
- Fields correlated with slow queries
- Field usage patterns
- Unused schema fields

#### Types
Schema type usage statistics:
- Which types are queried most
- Type-level performance metrics
- Schema evolution tracking

#### Errors
Error tracking and analysis:
- Error rates over time
- Most common error types
- Operations with highest error rates
- GraphQL-specific error patterns

### Supporting Features

#### Project Management
- Create/delete projects
- Generate API tokens per project
- Configure project settings
- Invite team members (future)

#### Settings
- User account management
- Billing and subscription
- API token management

## User Journey

### New User Flow
1. Sign up / Log in
2. Land on empty projects page with clear CTA
3. Click "Create Project" 
4. Enter project name, get API token
5. Follow integration guide to add plugin to their GraphQL server
6. See data start flowing into dashboard within minutes

### Returning User Flow
1. Log in
2. Land on projects list (or last viewed project)
3. Select project from list or dropdown
4. View analytics in main dashboard sections
5. Switch between projects easily via sidebar selector

### Integration Experience
Simple GraphQL plugin installation:
```javascript
// For Apollo Server
import { patiomPlugin } from '@patiom/apollo-plugin'

const server = new ApolloServer({
  plugins: [patiomPlugin({ token: 'your-api-token' })]
})
```

Data collection should be:
- Non-invasive (minimal performance impact)
- Easy to set up (under 5 minutes)
- Works with popular GraphQL servers (Apollo, Yoga initially)

## Marketing & Positioning

### Key Differentiators
1. **Price point:** 10x cheaper than Stellate for mid-market segment
2. **Simplicity:** Focus on core analytics, not caching/CDN complexity
3. **Developer experience:** Built by developers, for developers
4. **Field-level insights:** Deep visibility into schema usage

### Demo/Test API: SWQL (swql.dev)
Public Star Wars GraphQL API that:
- Demonstrates Patiom's analytics capabilities
- Provides marketing/SEO value
- Generates real traffic for testing
- Shows "Powered by Patiom" attribution

### Target Channels
- Product Hunt launch
- Dev.to / Hashnode articles about GraphQL performance
- Twitter/X developer community
- GraphQL conference sponsorships (future)
- Direct outreach to GraphQL communities

## Success Metrics

### MVP Validation
- 10 teams trying Patiom
- 3 paying customers
- Positive feedback on core analytics features
- Proof that integration is simple enough

### Growth Targets
- 100 projects within 6 months
- 1000 projects for $600K ARR (long-term goal)
- High retention (>90% month-over-month for paying customers)

## Design Principles

### Dashboard UX
- **Clean & minimal:** Focus on data, not decoration
- **Familiar patterns:** Follow conventions from Vercel, GitHub, Linear
- **Fast & responsive:** Analytics should load quickly
- **Developer-focused:** Technical accuracy over simplified metrics

### Visual Design
- Modern, professional aesthetic
- Black & white foundation, add color strategically
- Hexagon logo motif for brand recognition
- Tailwind + shadcn/ui for consistency

## Navigation Structure

### Sidebar Layout
```
[Patiom Logo]

[Project Selector Dropdown]
+ New Project

📊 Overview
⚡ Operations  
📋 Fields
📦 Types
⚠️  Errors

---
📁 All Projects
⚙️  Settings

[User Profile Menu]
```

### Information Architecture
- Everything scoped per-project
- Easy project switching without losing context
- Clear hierarchy: Projects → Analytics Views
- Quick access to common actions (create project, settings)

## Content & Messaging

### Value Props for Landing Page
- "Understand your GraphQL API performance"
- "Find bottlenecks before your users do"  
- "Enterprise insights at startup prices"
- "5-minute setup, instant visibility"

### Developer-Focused Copy
- Technical but accessible
- Show actual code examples
- Real metrics, no vanity numbers
- Honest about limitations

## Competitive Positioning

### vs Stellate
- **Price:** $9 vs $249 minimum
- **Focus:** Pure analytics vs caching + analytics
- **Target:** Growing teams vs enterprise

### vs Building In-House
- **Time to value:** 5 minutes vs weeks of development
- **Maintenance:** Zero vs ongoing engineering cost
- **Features:** Full analytics vs basic logging

## Future Considerations (Post-MVP)

### Potential Features
- Real-time request monitoring
- Performance alerts and notifications  
- Team collaboration features
- Custom reports and dashboards
- Schema change tracking
- Cost analysis (correlate requests with infrastructure costs)
- Integration with APM tools

### Scaling Strategy
- Start with monolithic architecture
- Split services only when necessary
- Focus on horizontal scaling for data ingestion
- Keep database performance optimized

## Timeline & Milestones

### Immediate Focus
- Complete dashboard UI with real data
- Test ingestion pipeline thoroughly
- Deploy SWQL demo API
- Create plugin for Apollo Server

### Short-term (Next 2-4 months)
- Launch publicly
- Get first 10 users
- Iterate based on feedback
- Add GraphQL Yoga plugin support

### Medium-term
- Reach profitability (cover hosting costs)
- Build sustainable growth engine
- Consider investor discussions if traction is strong

---

## Notes for Development

This is a business brief, not technical specification. When implementing:
- Keep things simple - monolithic architecture is fine initially
- Focus on core analytics features before adding bells and whistles
- Optimize for developer experience - easy integration is crucial
- Ship iteratively - better to have working basic analytics than perfect complex features
- Listen to early users - let real feedback drive feature priorities

The goal is to build a sustainable SaaS business that solves a real problem for GraphQL developers, not to build the most technically impressive architecture.