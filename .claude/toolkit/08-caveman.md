# Caveman (JuliusBrussee)

**What it does:** Forces Claude to answer like a caveman — telegraphic, no filler, no pleasantries — while keeping full technical accuracy. Cuts roughly 65–75% of output tokens, so you read less fluff and spend fewer tokens.

**Maintainer:** Community (Julius Brussee). Not endorsed or banned by Anthropic.

## Install

In the Claude Code prompt:

```
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

(From a terminal you can also use `claude plugin marketplace add JuliusBrussee/caveman` then `claude plugin install caveman@caveman`.)

Then **restart Claude Code** — it loads at the start of every session.

## Use

Trigger by typing `/caveman` or saying "talk like caveman." Three levels:

```
/caveman lite     # just drops filler words
/caveman full     # fragment-style responses
/caveman ultra     # maximum terse
```

## Notes

- A SKILL.md drop-in version also works in Cursor, Cline, Copilot, Gemini CLI, and 40+ other agents — copy the file into that agent's skills folder.

**Source:** https://github.com/JuliusBrussee/caveman
