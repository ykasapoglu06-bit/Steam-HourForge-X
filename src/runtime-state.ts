import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
const Event=z.object({at:z.number(),kind:z.string().max(80),detail:z.string().max(200)});
const Snapshot=z.object({group:z.number().int().nonnegative(),remainingMs:z.number().min(0).max(14400000),manualPaused:z.boolean(),events:z.array(Event).max(100)});
export type RuntimeSnapshot=z.infer<typeof Snapshot>;
function path(dir:string,name:string){return join(dir,'runtime',createHash('sha256').update(name).digest('hex')+'.json');}
export function readRuntime(dir:string,name:string):RuntimeSnapshot|null{try{return Snapshot.parse(JSON.parse(readFileSync(path(dir,name),'utf8')));}catch{return null;}}
export function saveRuntime(dir:string,name:string,value:RuntimeSnapshot){const file=path(dir,name);mkdirSync(join(dir,'runtime'),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(Snapshot.parse(value)));renameSync(file+'.tmp',file);}
