---
name: peak-fettle-verify
description: The mandatory Peak Fettle definition-of-done. Run before declaring ANY ticket or backlog complete, and any time a build fails with a syntax/ENOENT error. Parse-sweeps the whole JS/TS surface (mobile/app, mobile/src, peak-fettle-agents/server) with @babel/parser and node --check to catch OneDrive truncation, duplicated StyleSheet blocks, null bytes, and committed-but-broken blobs that a prose "reviewed manually" claim misses. Use when finishing a ticket, verifying a roadmap's "clean" claim, or diagnosing a Metro/require crash.
---

# Peak Fettle — Verify (definition of done)

A roadmap that says "reviewed manually / no defects remain" is **not** verification (L-014). CORRUPT-001 and PUSH-002 both sat inside HEAD while a roadmap declared the code clean. This sweep is cheap and is the real DOD.

## When to run
- Before marking any ticket or backlog complete (every model, every lane).
- Any time a build fails with a syntax or ENOENT error — Metro stops at the first broken file and hides the rest, so never trust the single named file.
- Before any EAS build or launch.

## Steps

1. **Parse-sweep the JS/TS surface** with `@babel/parser` (`jsx` + `typescript` plugins) across `mobile/app`, `mobile/src`, AND `peak-fettle-agents/server`. Report every file that fails to parse — not just the first.
2. **`node --check`** every server `.js` under `peak-fettle-agents/server` and `peak-fettle-agents/cron`.
3. **Scan for null bytes** (OneDrive injects them after writes — L-026): flag any tracked source file containing a `\0`.
4. **Recover broken files from git** only after verifying the blob parses: `git show HEAD:<path>` — and if HEAD is itself corrupt (CORRUPT-001), walk `git log --format=%h -- <path>` and parse each blob to find the newest one that compiles.
5. **Migration cross-check**: for any `RETURNING`/`SELECT` touched this pass, confirm every referenced column exists in an *applied* migration (L-017, L-024). An undeployed column = always-500 on the whole tab.
6. **Push pipeline (if touched)**: confirm client token type and server send transport agree — Expo token => Expo Push API, never FCM legacy (L-013 / PUSH-001).

## Reference sweep script
```bash
node -e '
const {parse}=require("@babel/parser"),fs=require("fs"),p=require("path");
const roots=["mobile/app","mobile/src","peak-fettle-agents/server"];
let bad=0;
(function walk(d){ if(!fs.existsSync(d))return;
  for(const f of fs.readdirSync(d)){const fp=p.join(d,f);const s=fs.statSync(fp);
    if(s.isDirectory()){ if(f!=="node_modules") walk(fp); continue; }
    if(!/\.(t|j)sx?$/.test(f))continue;
    const src=fs.readFileSync(fp,"utf8");
    if(src.includes("\0")){console.log("NULL BYTES:",fp);bad++;continue;}
    try{parse(src,{sourceType:"module",plugins:["jsx","typescript"]});}
    catch(e){console.log("PARSE FAIL:",fp,"-",e.message);bad++;}
  }
})(".".replace(".","")||".");
roots.forEach(r=>walk(r));
console.log(bad? `\n${bad} broken file(s).` : "\nAll files parse.");
process.exit(bad?1:0);'
```

## Done means
Sweep exits clean, `node --check` passes on all server JS, no null bytes, migrations reconciled. Only then update the ticket/roadmap status.
