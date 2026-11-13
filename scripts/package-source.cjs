const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const destination=path.resolve(process.argv[2]||path.join(root,'artifacts','steam-hourforge-x-source'));
if(destination===root||root.startsWith(destination+path.sep))throw new Error('Choose a new output directory.');
if(fs.existsSync(destination))throw new Error('Output already exists; use a new directory.');
const directories=['src','ui','tests','scripts','docs','.github'];
const files=['package.json','package-lock.json','README.md','README.tr.md','LICENSE','THIRD_PARTY_NOTICES.md','SECURITY.md','CONTRIBUTING.md','.gitignore','.dockerignore','.editorconfig','.npmrc','.prettierrc','.env.example','config.example.json','Dockerfile','docker-compose.yml','tsconfig.json','vitest.config.ts','start.bat','start-ui.vbs','native/AchievementBridge.cs','native/sam/SAM.API.dll','native/sam/LICENSE.txt'];
const manifest=[];
function copy(relative){
  const source=path.join(root,relative),target=path.join(destination,relative);
  if(fs.lstatSync(source).isSymbolicLink())throw new Error('Symlinks are not included: '+relative);
  if(fs.statSync(source).isDirectory()){
    for(const child of fs.readdirSync(source))copy(path.join(relative,child));return;
  }
  const data=fs.readFileSync(source);
  if(!['.dll','.png','.ico'].includes(path.extname(source))){
    const text=data.toString('utf8');
    if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|gh[pousr]_[A-Za-z0-9]{30,}/.test(text))throw new Error('Potential credential in '+relative);
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
  manifest.push({path:relative.split(path.sep).join('/'),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
}
for(const relative of [...directories,...files])copy(relative);
manifest.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(destination,'SOURCE_MANIFEST.json'),JSON.stringify({name:'steam-hourforge-x',version:require(path.join(root,'package.json')).version,files:manifest},null,2)+'\n');
console.log('Created clean source package: '+destination+' ('+manifest.length+' files)');
