import {describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyProfile,readProfile,saveProfile,clearProfile,safeAvatar,safeVanity} from '../src/profile-cache.js';
describe('public profile persistence',()=>{
  it('restores identity without saving credentials and clears it on logout',()=>{
    const dir=mkdtempSync(join(tmpdir(),'hourforge-profile-'));
    try{
      const profile={steamId:'76561198827403098',displayName:'Player',avatarUrl:'https://avatars.steamstatic.com/test.jpg',vanityUrl:'yuu55uuf'};
      saveProfile(dir,'../account',{...profile,password:'must-not-save',refreshToken:'must-not-save'} as any);
      expect(readProfile(dir,'../account')).toEqual(profile);
      expect(readFileSync(join(dir,'profiles',readdirSync(join(dir,'profiles'))[0]!),'utf8')).not.toContain('must-not-save');
      clearProfile(dir,'../account');expect(readProfile(dir,'../account')).toEqual(emptyProfile());
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('rejects unsafe avatars and vanity strings',()=>{
    expect(safeAvatar('https://avatars.steamstatic.com.evil.test/a.png')).toBeNull();
    expect(safeAvatar('https://user:secret@avatars.steamstatic.com/a.png')).toBeNull();
    expect(safeVanity('<script>')).toBeNull();expect(safeVanity('yuu55uuf')).toBe('yuu55uuf');
  });
});
