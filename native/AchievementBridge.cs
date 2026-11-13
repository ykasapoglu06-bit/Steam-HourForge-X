// Steam HourForge X adapter for the unmodified SAM.API 7.0.37 library.
// SAM.API copyright Rick (gibbed); see sam/LICENSE.txt.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using SAM.API;
using SAM.API.Interfaces;
using SAM.API.Wrappers;

public sealed class BridgeRequest {
    public string operation { get; set; }
    public uint appid { get; set; }
    public string steamId { get; set; }
    public string[] ids { get; set; }
}
public sealed class AchievementRow {
    public string id { get; set; }
    public string name { get; set; }
    public bool unlocked { get; set; }
}
public sealed class StatsReader : SteamUserStats013 {
    [UnmanagedFunctionPointer(CallingConvention.ThisCall)] private delegate uint CountCall(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.ThisCall)] private delegate IntPtr NameCall(IntPtr self, uint index);
    public uint Count() { return GetFunction<CountCall>(Functions.GetNumAchievements)(ObjectAddress); }
    public string Id(uint index) {
        IntPtr pointer = GetFunction<NameCall>(Functions.GetAchievementName)(ObjectAddress, index);
        if (pointer == IntPtr.Zero) return null;
        var bytes = new List<byte>();
        for (int i=0;i<1024;i++) { byte value=Marshal.ReadByte(pointer,i);if(value==0)break;bytes.Add(value); }
        return Encoding.UTF8.GetString(bytes.ToArray());
    }
}
[StructLayout(LayoutKind.Sequential, Pack=1)]
public struct StoreResult { public ulong GameId; public int Result; }
public sealed class StoreCallback : Callback<StoreResult> {
    public override int Id { get { return 1102; } }
    public override bool IsServer { get { return false; } }
}

public static class AchievementBridge {
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=4000000 };
    public static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var request=Json.Deserialize<BridgeRequest>(Console.In.ReadToEnd());
            if(request==null || request.appid==0 || request.appid>2147483647 || (request.operation!="inspect" && request.operation!="complete"))throw new Exception("SAM_INVALID_REQUEST");
            ulong expected;
            if(request.steamId==null || request.steamId.Length!=17 || !ulong.TryParse(request.steamId,out expected))throw new Exception("SAM_INVALID_REQUEST");
            using(var client = new Client()) {
                client.Initialize(request.appid);
                var loginTimer=Stopwatch.StartNew();
                while(!client.SteamUser.IsLoggedIn() && loginTimer.ElapsedMilliseconds<5000){client.RunCallbacks(false);Thread.Sleep(50);}
                if(!client.SteamUser.IsLoggedIn())throw new Exception("SAM_STEAM_OFFLINE");
                if(client.SteamUser.GetSteamId()!=expected)throw new Exception("SAM_ACCOUNT_MISMATCH");
                if(!client.SteamApps008.IsSubscribedApp(request.appid))throw new Exception("SAM_NOT_OWNED");
                var reader = new StatsReader();
                var field=typeof(NativeWrapper<ISteamUserStats013>).GetField("ObjectAddress",BindingFlags.Instance|BindingFlags.NonPublic);
                reader.SetupFunctions((IntPtr)field.GetValue(client.SteamUserStats));
                var received=client.CreateAndRegisterCallback<SAM.API.Callbacks.UserStatsReceived>();
                int receivedResult=0;bool ready=false;
                received.OnRun += delegate(SAM.API.Types.UserStatsReceived value) {
                    if(value.GameId==request.appid && value.SteamIdUser==expected){receivedResult=value.Result;ready=true;}
                };
                client.SteamUserStats.RequestUserStats(expected);
                Wait(client,delegate { return ready; });
                if(receivedResult!=1)throw new Exception("SAM_STATS_UNAVAILABLE");
                var before=Read(reader);
                if(request.operation=="inspect") {
                    Console.WriteLine(Json.Serialize(new { steamId=request.steamId,appid=request.appid,unlocked=before.Count(a=>a.unlocked),total=before.Count,achievements=before }));return 0;
                }
                var requested=new HashSet<string>(request.ids??new string[0],StringComparer.Ordinal);
                if(requested.Count==0 || requested.Count>10000 || requested.Any(id=>!before.Any(row=>row.id==id)))throw new Exception("SAM_PREVIEW_CHANGED");
                if(client.SteamUser.GetSteamId()!=expected)throw new Exception("SAM_ACCOUNT_MISMATCH");
                var changed=new List<string>();var rejected=new List<string>();
                foreach(var row in before.Where(row=>!row.unlocked && requested.Contains(row.id))) {
                    if(reader.SetAchievement(row.id,true))changed.Add(row.id);else rejected.Add(row.id);
                }
                bool stored=changed.Count==0;
                if(changed.Count>0) {
                    bool done=false;int result=0;
                    var callback=client.CreateAndRegisterCallback<StoreCallback>();
                    callback.OnRun+=delegate(StoreResult value){if(value.GameId==request.appid){result=value.Result;done=true;}};
                    if(!reader.StoreStats())throw new Exception("SAM_STORE_REJECTED");
                    Wait(client,delegate{return done;});
                    if(result!=1)throw new Exception("SAM_STORE_REJECTED");
                    stored=true;
                }
                ready=false;client.SteamUserStats.RequestUserStats(expected);Wait(client,delegate{return ready;});
                if(receivedResult!=1)throw new Exception("SAM_VERIFY_FAILED");
                var after=Read(reader);
                var verified=changed.Where(id=>after.Any(row=>row.id==id && row.unlocked)).ToArray();
                Console.WriteLine(Json.Serialize(new { steamId=request.steamId,appid=request.appid,unlocked=after.Count(a=>a.unlocked),total=after.Count,completed=verified.Length,rejected=rejected.Count+changed.Count-verified.Length,stored=stored,achievements=after }));
                return 0;
            }
        } catch(Exception error) {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            var known=new HashSet<string>(new[]{"SAM_INVALID_REQUEST","SAM_STEAM_OFFLINE","SAM_ACCOUNT_MISMATCH","SAM_NOT_OWNED","SAM_STATS_UNAVAILABLE","SAM_PREVIEW_CHANGED","SAM_STORE_REJECTED","SAM_VERIFY_FAILED","SAM_TIMEOUT","SAM_SCHEMA_UNAVAILABLE"});
            string code=known.Contains(error.Message)?error.Message:"SAM_UNAVAILABLE";
            Console.WriteLine(Json.Serialize(new {error=code}));return 1;
        }
    }
    private static void Wait(Client client,Func<bool> condition) {
        var timer=Stopwatch.StartNew();
        while(!condition()) { if(timer.ElapsedMilliseconds>20000)throw new Exception("SAM_TIMEOUT");client.RunCallbacks(false);Thread.Sleep(40); }
    }
    private static List<AchievementRow> Read(StatsReader reader) {
        uint count=reader.Count();if(count>10000)throw new Exception("SAM_SCHEMA_UNAVAILABLE");
        var result=new List<AchievementRow>();
        for(uint index=0;index<count;index++) {
            string id=reader.Id(index);bool unlocked;
            if(string.IsNullOrEmpty(id)||!reader.GetAchievement(id,out unlocked))throw new Exception("SAM_SCHEMA_UNAVAILABLE");
            string name=reader.GetAchievementDisplayAttribute(id,"name");
            result.Add(new AchievementRow{id=id,name=string.IsNullOrEmpty(name)?id:name,unlocked=unlocked});
        }
        return result;
    }
}
