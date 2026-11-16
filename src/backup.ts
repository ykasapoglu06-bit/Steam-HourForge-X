import {z} from 'zod';
import {AccountSchema,type AccountConfig} from './config.js';
const Entry=AccountSchema.pick({name:true,label:true,games:true,priorityGames:true,rotationMinutes:true,manualGames:true,farmingMode:true,manualPaused:true,hourGoals:true}).extend({name:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).strict();
export const BackupSchema=z.object({format:z.literal('hourforge-settings'),version:z.literal(1),accounts:z.array(Entry).max(20)}).strict().superRefine((data,ctx)=>{
 if(new Set(data.accounts.map(a=>a.name)).size!==data.accounts.length)ctx.addIssue({code:'custom',message:'Duplicate account'});
});
export function exportSettings(accounts:AccountConfig[]){return BackupSchema.parse({format:'hourforge-settings',version:1,accounts:accounts.map(a=>({name:a.name,label:a.label,games:a.games,priorityGames:a.priorityGames,rotationMinutes:a.rotationMinutes,manualGames:a.manualGames,farmingMode:a.farmingMode,manualPaused:a.manualPaused,hourGoals:a.hourGoals}))});}
export function parseBackup(input:unknown){try{return BackupSchema.parse(input);}catch{throw new Error('BACKUP_INVALID');}}
