const fs = require('fs'), path = require('path'), ts = require('typescript');
function load(rel){const src=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');const js=ts.transpileModule(src,{compilerOptions:{module:'commonjs',target:'es2019'}}).outputText;const m={exports:{}};new Function('module','exports','require',js)(m,m.exports,require);return m.exports;}
const P = load('src/data/backup/tierPolicy.ts');
let fail=0; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fail++;};
console.log('TICKET-094 tier policy:');
ok(P.syncsToServer({is_paid:true})===true, 'Pro → server sync');
ok(P.isLocalFirst({is_paid:true})===false, 'Pro → not local-first');
ok(P.syncsToServer({is_paid:false})===false, 'Free → no server sync');
ok(P.isLocalFirst({is_paid:false})===true, 'Free → local-first');
ok(P.isLocalFirst(null)===true && P.isLocalFirst(undefined)===true, 'no user → local-first (safe default)');
ok(P.usesBlobBackup({is_paid:false})===true, 'Free → uses blob backup');
ok(P.usesBlobBackup({is_paid:true})===false, 'Pro → covered by server sync');
console.log(fail===0?'\nALL TIER-POLICY TESTS PASS':`\n${fail} FAILED`);
process.exit(fail?1:0);
