const fs=require('fs'),path=require('path');
let engine='babel',parse;
try{const p=require('@babel/parser');parse=(s)=>p.parse(s,{sourceType:'module',plugins:['typescript','jsx'],errorRecovery:false});}
catch(e){const ts=require('typescript');engine='typescript';parse=(s,f)=>{const sf=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true,/tsx$/.test(f)?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(sf.parseDiagnostics&&sf.parseDiagnostics.length)throw new Error(String(sf.parseDiagnostics[0].messageText));};}
const roots=process.argv.slice(2);let files=[];
(function walk(ds){for(const d of ds){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name==='node_modules'||e.name==='dist')continue;walk([p]);}else if(/\.(ts|tsx)$/.test(e.name))files.push(p);}}})(roots);
let fail=0;for(const f of files){try{parse(fs.readFileSync(f,'utf8'),f);}catch(e){fail++;console.log('PARSE FAIL '+f+' :: '+String(e.message).split('\n')[0]);}}
console.log('\nENGINE='+engine+'  FILES='+files.length+'  FAILURES='+fail);
