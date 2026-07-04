const fs = require('fs'), path = require('path');
const parser = require(path.join(process.cwd(),'node_modules','@babel','parser'));
const roots = ['app', 'src'];
let files = [], fail = 0;
function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if(e.isDirectory()){ if(e.name==='node_modules') continue; walk(p);} else if(/\.(ts|tsx)$/.test(e.name)) files.push(p);}}
for(const r of roots) if(fs.existsSync(r)) walk(r);
for(const f of files){ try{ parser.parse(fs.readFileSync(f,'utf8'),{sourceType:'module',plugins:['jsx','typescript']});}catch(err){ console.log('FAIL',f,err.message.split('\n')[0]); fail++; }}
console.log(`\n${files.length} files, ${fail} failures`);
