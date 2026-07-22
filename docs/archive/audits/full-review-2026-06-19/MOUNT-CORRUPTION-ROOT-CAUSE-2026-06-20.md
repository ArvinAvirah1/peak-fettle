# Mount Write/Edit corruption — root cause (2026-06-20)

**Verdict: the agent mount does NOT honor file truncation. The Write/Edit tools
resize a file by writing new bytes then setting the new end-of-file; the mount
silently drops the "set end-of-file" step, so a file's on-disk length stays
pinned at whatever it was when first created. Bash redirection is safe because it
truncates-to-zero on open and grows naturally. → Write all repo files via bash.**

## How it was reproduced (3 controlled tests on `C:\Users\aavir\dev\Peak Fettle`)

1. **New small file via Write tool (1456 B):** intact. (A brand-new file is
   created at size 0 and grown — no pre-existing extent to cap against.)
2. **Growing Edit on a 59 KB file** (replacement 3 bytes longer than the match):
   file ended at the EXACT original byte count; the **last 3 bytes of EOF were
   chopped** (`";` + newline lost on the final line). The +3 from the edit was
   masked by −3 lost at EOF, so a naive `wc -c` looks unchanged.
3. **Same-length Edit** (`aaa`→`bbb`): perfect — head/tail md5 and byte count all
   unchanged. (No resize needed → no corruption.)
4. **Shrinking Edit** (22-char match → 3 chars, −19 B): file stayed at the
   original length; the trailing **19 bytes became NUL (`\x00`) padding**.

Tests 2 + 4 are the smoking gun: the file length never changes from its original,
regardless of how much content is written. Growing edits truncate the overflow;
shrinking edits leave stale/NUL bytes.

## Why this exactly matches the historical incidents
- "**truncated mid-token**" (CLAUDE.md 2026-05-21) = a *growing* edit chopping EOF.
- "**duplicated `StyleSheet.create` block with a stray premature `});`**" = a
  *shrinking* edit leaving the old tail behind (stale bytes the new content was
  shorter than).
- A *same-length* edit is invisible — which is why corruption seemed intermittent
  and why "it worked after moving off OneDrive" reports were inconsistent: it
  depends entirely on whether the specific edit grew, shrank, or kept size.

## Mechanism
The tools almost certainly do `open(file) → write(newContent) → ftruncate(newLen)`
(or the Windows `SetEndOfFile` equivalent). This mount honors `write()` into the
existing byte extent but **drops the `ftruncate`/`SetEndOfFile`**, so the file is
never resized. Bash `>` / `cat` / `python open('w')` all use `O_TRUNC` on *open*
(length → 0, then grow), which this mount DOES honor — hence bash is reliable.
`rm`/`mv`/`ftruncate`-to-larger all fail (`Operation not permitted`), consistent
with a sync/redirector layer that allows in-place writes but not metadata resize
or unlink.

## Operating rule (unchanged from the founder's instruction — now justified)
- **Write every repo file via bash** (heredoc / `cat` / `python open('w')`), then
  verify byte/line counts. Never use the Write/Edit tools on existing repo files.
- This also means **subagents must not edit mount files** (they use Write/Edit) —
  use them only for read-only review.
- Commits: the stuck `.git/index.lock` (0 B, un-removable) forces the temp-index +
  `commit-tree` + hand-written loose-ref plumbing (see CLAUDE.md "Committing on
  this mount"). `unable to unlink tmp_obj_*` warnings are expected, not failures.

## Suggested permanent fixes (founder)
1. Run agent sessions against a path the resize/unlink syscalls work on (a plain
   local dir that is NOT behind the sync/redirector layer that currently backs
   this mount). Verify with the 4 tests above before trusting Write/Edit.
2. Until then, keep the bash-only rule and the commit plumbing.
