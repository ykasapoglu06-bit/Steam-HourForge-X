const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
if (process.platform !== 'win32') {
  console.log('SAM native bridge is Windows-only; the web dashboard remains available.');
  process.exit(0);
}
const root=path.resolve(__dirname,'..');
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework','v4.0.30319','csc.exe');
if(!existsSync(compiler))throw new Error('.NET Framework C# compiler is required for the SAM bridge.');
execFileSync(compiler,['/nologo','/target:exe','/platform:x86','/optimize+',
  '/out:'+path.join(root,'native','sam','HourForge.Achievements.exe'),
  '/reference:'+path.join(root,'native','sam','SAM.API.dll'),'/reference:System.Web.Extensions.dll',
  path.join(root,'native','AchievementBridge.cs')],{windowsHide:true,stdio:'inherit'});
console.log('SAM achievement bridge built.');
