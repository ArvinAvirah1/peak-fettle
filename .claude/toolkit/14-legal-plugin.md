# Legal Plugin (Anthropic-associated)

**What it does:** A plugin for legal workflows — contract review, NDA triage, compliance checks, legal risk assessment, vendor checks, signature routing, and legal briefings. (Note: this is not legal advice; it assists with legal-adjacent work.)

**Maintainer:** Anthropic / partner. Browse it in the directory.

## Install

```
/plugin
```

Open the **Discover** tab and look for the **Legal** plugin, then install. If it's in the official directory it installs as:

```
/plugin install <legal-plugin-name>@claude-plugins-official
```

> The exact plugin name can change — confirm it in `/plugin` → Discover before installing.

## Already active in your Cowork session

You currently have a **legal** plugin loaded in this Cowork session. Its skills are available right now (no install needed):

- `legal:review-contract` — clause-by-clause review against a playbook, redlines, business impact
- `legal:triage-nda` — classify an incoming NDA GREEN / YELLOW / RED
- `legal:compliance-check` — applicable regulations, required approvals, risk areas
- `legal:legal-risk-assessment` — severity × likelihood with escalation criteria
- `legal:vendor-check` — agreement status across systems, gap analysis, deadlines
- `legal:signature-request` — pre-signature checklist + e-sign routing
- `legal:legal-response` — templated replies for common legal inquiries
- `legal:meeting-briefing` and `legal:brief` — meeting prep and daily/topic legal briefings

Just ask, e.g. "triage this NDA" or "review this contract."
