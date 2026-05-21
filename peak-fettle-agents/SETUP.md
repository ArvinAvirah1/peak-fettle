# Peak Fettle Agent System — Setup Guide

This folder contains the full multi-agent system for Peak Fettle development.

## Agent Teams

| Agent | Role |
|---|---|
| `dev-lead` | Breaks down features, delegates to specialists, integrates output |
| `dev-frontend` | React Native UI, screens, components, data visualization |
| `dev-backend` | Express API, business logic, AI plan generation, auth |
| `dev-database` | PostgreSQL schema, migrations, queries, indexes |
| `beta-casual-gymgoer` | Jamie — recreational user, free tier, low fitness knowledge |
| `beta-competitive-lifter` | Marcus — experienced powerlifter, data-driven, paid tier |
| `beta-runner` | Priya — dedicated runner, Strava user, cardio-first |
| `beta-beginner` | Derek — complete beginner, needs encouragement and clarity |
| `exec-product-manager` | Prioritizes features, synthesizes feedback, owns roadmap |
| `exec-cto` | Reviews architecture, security, and technical decisions |
| `exec-ceo` | Strategy, positioning, monetization, north star |
| `reporter-teacher` | Explains dev changes to Arvin + interactive quiz-based teaching |
| `workflow-optimizer` | Audits context load, enforces 11 workflow rules, preps new sessions |
| `context-auditor` | Fast single-file audits for prompt bloat and excess context |

### Context Slices (load these instead of full source documents)

Each team has a lean context file containing only what that team needs. **Always load the slice, not the full source document.**

| Slice | For |
|---|---|
| `../workflow-optimization/context-slices/dev-context.md` | dev-lead, dev-frontend, dev-backend, dev-database |
| `../workflow-optimization/context-slices/beta-context.md` | All 4 beta agents |
| `../workflow-optimization/context-slices/exec-context.md` | exec-ceo, exec-cto, exec-product-manager |
| `../workflow-optimization/context-slices/marketing-context.md` | Any marketing-focused session |

Full rules and context map: `../workflow-optimization/WORKFLOW_RULES.md` and `../workflow-optimization/CONTEXT_MAP.md`

## Setup Steps

### 1. Prerequisites
- Node.js v18 or higher installed
- An Anthropic API key (get one at https://console.anthropic.com)

### 2. Install dependencies
```bash
cd peak-fettle-agents
npm install
```

### 3. Set up your API key
```bash
cp .env.example .env
# Open .env and paste in your ANTHROPIC_API_KEY
```

### 4. Run a task

**Dev workflow** (build a feature):
```bash
node orchestrator/orchestrator.js --task "implement workout logging screen"
```

**Beta test workflow** (test a feature with mock users):
```bash
node orchestrator/orchestrator.js --task "beta test the habit streak system"
```

**Executive workflow** (strategy/prioritization):
```bash
node orchestrator/orchestrator.js --task "executive review: should we build wearable integration now or later"
```

**Teaching session** (learn the tech):
```bash
node orchestrator/orchestrator.js --teach "how does JWT authentication work"
node orchestrator/orchestrator.js --teach "explain the database schema for workout tracking"
node orchestrator/orchestrator.js --teach "how does a REST API route work end to end"
```

## How the Routing Works

The orchestrator reads your `--task` text and auto-routes:
- Mentions "beta" or "test" → beta testing workflow
- Mentions "exec", "strategy", or "priorit" → executive workflow  
- Mentions "teach", "explain", or "learn" → teaching session
- Everything else → dev workflow

## Learning Path (Recommended Order)

If you want to fully understand the system Arvin, work through these teach commands in order:

1. `--teach "what is a relational database and why do we use PostgreSQL"`
2. `--teach "explain the Peak Fettle database schema table by table"`
3. `--teach "how does a REST API work and what is Express.js"`
4. `--teach "how does JWT authentication work from login to protected route"`
5. `--teach "how does the frontend talk to the backend using axios"`
6. `--teach "explain the full data flow when a user logs a workout"`
7. `--teach "how does the Claude API get called to generate a fitness plan"`
8. `--teach "what are environment variables and how do we use them safely"`
