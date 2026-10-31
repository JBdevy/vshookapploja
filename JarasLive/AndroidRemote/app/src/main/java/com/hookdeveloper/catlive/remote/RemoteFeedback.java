package com.hookdeveloper.catlive.remote;
import org.json.*;import java.util.*;

/** Immediate control feedback, reconciled against ordered host snapshots. */
final class RemoteFeedback {
 static final long TIMEOUT=2000;
 static final class Change {
  final String scope,id,field;final Object original;final ArrayDeque<Object> expected=new ArrayDeque<>();long deadline;
  Change(String s,String id,String f,Object original){scope=s;this.id=id;field=f;this.original=original;}
 }
 final Map<String,Change> pending=new LinkedHashMap<>();String project="",song="",localAutoQueue="";
 void clear(){pending.clear();project="";song="";localAutoQueue="";}
 boolean record(JSONObject state,String action,String target,double value,Boolean enabled,long now){
  if(state==null)return false;scope(state);
  if(action.equals("play")||action.equals("stop")||action.equals("pause")){
   set(state,"","","playing",action.equals("play"),now);set(state,"","","paused",action.equals("pause"),now);
   if(action.equals("stop"))set(state,"","","subPlaying",false,now);return true;
  }
  if(action.equals("selectRegion"))return selectRegion(state,target,now);
  if(action.equals("toggleRegionAuto"))return toggleAuto(state,now);
  if(action.equals("seek")){
   if(state.optBoolean("playing"))return false;
   JSONObject region=RemoteModel.region(state,target);if(region==null)return false;
   double position=Math.max(region.optDouble("start"),Math.min(region.optDouble("end"),value));
   set(state,"","","editPosition",position,now);set(state,"","","position",position,now);return true;
  }
  String s="",id=target==null?"":target,f=null;Object desired=null;
  switch(action){
   case "mute":case "solo":s=id.isEmpty()?"":"tracks";f=id.isEmpty()?(action.equals("mute")?"masterMute":"masterSolo"):action;break;
   case "volume":case "pan":
    s=id.isEmpty()?"":"tracks";f=id.isEmpty()?(action.equals("volume")?"masterVolume":"masterPan"):action;
    desired=action.equals("pan")?Math.max(-1,Math.min(1,value)):Math.max(0,Math.min(Math.pow(10,12.0/20),value));
    JSONObject track=target(state,s,id);String linked=RemoteModel.id(track,"linkedTrack");JSONObject partner=target(state,"tracks",linked);
    if(!id.isEmpty()&&partner!=null&&RemoteModel.same(RemoteModel.id(partner,"linkedTrack"),id))set(state,"tracks",linked,action,action.equals("pan")?-((Number)desired).doubleValue():desired,now);
    break;
   case "clipGain":s="clips";f="gain";desired=Math.max(0,Math.min(Math.pow(10,24.0/20),value));break;
   case "pitch":if(!RemoteModel.same(id,RemoteModel.id(state,"pitchRegion")))return false;f="pitchSemitones";desired=(int)value;break;
   case "vinhetasPreset":s="vinhetas";id="";f="selectedPreset";desired=Math.max(0,Math.min(5,(int)value));break;
   case "resetMeterPeak":s=id.isEmpty()?"":"tracks";f=id.isEmpty()?"masterPeakDB":"peakDB";desired=-100;break;
   case "masterMono":f="masterMono";break;
   case "subPlay":case "subStop":f="subPlaying";desired=action.equals("subPlay");break;
   case "noticeClear":s="notices";f="active";desired=false;break;
   case "toggleLoop":f="loop";break;

   case "toggleMultiLoopBypass":f="multiLoopsBypassed";break;
   case "toggleSetlistLive":f="setlistLiveEnabled";break;
   case "togglePreview":f="previewActive";break;
   case "selectPreviewPage":f="previewPage";desired=(int)value;break;
   case "tempo":f="bpm";desired=value;break;
   case "clipMute":s="clips";f="muted";break;
   case "noticePin":s="notices";f="pinned";desired=enabled;break;
   case "noticePinStopped":
    JSONObject notices=state.optJSONObject("notices");if(enabled==null||notices==null||!notices.has("pinWhenStopped"))return false;
    s="notices";f="pinWhenStopped";desired=enabled;break;
   case "noticeDestination":s="notices";f="window"+(int)value;desired=enabled;break;
   case "cancelSection":s="sectionPlayback";f="queuedMarker";desired=JSONObject.NULL;break;
   case "queueSection":s="sectionPlayback";f="queuedMarker";desired=id;id="";break;
   default:return false;
  }
  JSONObject object=target(state,s,id);if(object==null)return false;
  if(desired==null)desired=!object.optBoolean(f);
  return set(state,s,id,f,desired,now);
 }
 boolean set(JSONObject state,String s,String id,String f,Object desired,long now){
  JSONObject object=target(state,s,id);if(object==null)return false;
  String key=s+"|"+id.toLowerCase(Locale.ROOT)+"|"+f;
  Change change=pending.get(key);if(change==null){change=new Change(s,id,f,object.opt(f));pending.put(key,change);}
  if(change.expected.isEmpty()||!equal(change.expected.peekLast(),desired))change.expected.addLast(desired);while(change.expected.size()>128)change.expected.removeFirst();change.deadline=now+TIMEOUT;return true;
 }
 void scope(JSONObject state){String p=RemoteModel.id(state,"project"),s=RemoteModel.id(state,"song");if(!RemoteModel.same(p,project)||!Objects.equals(s,song)){pending.clear();project=p;song=s;localAutoQueue="";}}
 JSONObject receive(JSONObject host,long now){
  if(host==null)return null;scope(host);
  Iterator<Change> iterator=pending.values().iterator();while(iterator.hasNext()){
   Change c=iterator.next();JSONObject target=target(host,c.scope,c.id);
   if(now>=c.deadline||target==null){iterator.remove();continue;}
   Object actual=target.opt(c.field);
   if(equal(actual,c.expected.peekFirst()))c.expected.removeFirst();
   else if(!equal(actual,c.original)&&equal(actual,c.expected.peekLast()))c.expected.clear();
   if(c.expected.isEmpty())iterator.remove();
  }
  if(!pending.containsKey("||queuedRegion")&&!RemoteModel.same(localAutoQueue,RemoteModel.id(host,"queuedRegion")))localAutoQueue="";
  return overlay(host);
 }
 JSONObject overlay(JSONObject host){
  if(host==null||pending.isEmpty())return host;
  try{JSONObject display=copy(host);for(Change c:pending.values()){JSONObject target=mutableTarget(display,c.scope,c.id);if(target!=null)target.put(c.field,c.expected.peekLast());}deriveAudibility(host,display);deriveLiveAndPreview(display);return display;}catch(JSONException e){return host;}
 }


 boolean selectRegion(JSONObject state,String id,long now){
  JSONObject region=RemoteModel.region(state,id);if(region==null||!RemoteModel.canQueue(state,region))return false;
  String source=RemoteModel.id(region,"sourceRegionId");if(source.isEmpty())source=id;
  boolean playing=state.optBoolean("playing");String current=RemoteModel.id(state,"currentRegion");
  if(playing){
   JSONObject active=RemoteModel.region(state,current);String parent=RemoteModel.id(region,"parentRegion");
   if(!parent.isEmpty()&&(RemoteModel.same(parent,current)||RemoteModel.same(parent,RemoteModel.id(active,"parentRegion"))))return false;
   String queued=RemoteModel.id(state,"queuedRegion"),queuedEntry=RemoteModel.id(state,"queuedPlaylistEntryId");
   JSONObject queuedPart=RemoteModel.region(state,queued);
   if((RemoteModel.same(source,queued)||RemoteModel.same(source,RemoteModel.id(queuedPart,"parentRegion")))&&(queuedEntry.isEmpty()||RemoteModel.same(queuedEntry,id))){
    localAutoQueue="";setQueue(state,null,now);set(state,"","","focusedRegion",JSONObject.NULL,now);set(state,"","","regionAuto",false,now);return true;
   }
   set(state,"","","focusedRegion",id,now);
   if(RemoteModel.same(source,current)||RemoteModel.same(source,RemoteModel.id(RemoteModel.root(state,active),"id")))return true;
   localAutoQueue="";setQueue(state,region,now);
  }else{
   set(state,"","","focusedRegion",id,now);set(state,"","","currentRegion",source,now);
   set(state,"","","gridRegion",RemoteModel.id(RemoteModel.root(state,region),"id"),now);
   set(state,"","","editPosition",region.optDouble("start"),now);set(state,"","","position",region.optDouble("start"),now);
   set(state,"songDisplays","","current",region.optString("name"),now);
   set(state,"sectionPlayback","","currentRegion",source,now);set(state,"sectionPlayback","","position",region.optDouble("start"),now);
  }
  return true;
 }
 boolean toggleAuto(JSONObject state,long now){
  boolean enabled=!state.optBoolean("regionAuto");set(state,"","","regionAuto",enabled,now);
  if(enabled&&state.optBoolean("playing")&&RemoteModel.id(state,"queuedRegion").isEmpty()){
   JSONObject next=RemoteModel.automaticQueueTarget(state);if(next!=null){setQueue(state,next,now);localAutoQueue=RemoteModel.id(next,"sourceRegionId");if(localAutoQueue.isEmpty())localAutoQueue=RemoteModel.id(next,"id");}
  }else if(!enabled&&RemoteModel.same(localAutoQueue,RemoteModel.id(state,"queuedRegion"))){
   setQueue(state,null,now);localAutoQueue="";
  }
  return true;
 }
 void setQueue(JSONObject state,JSONObject region,long now){
  String source=RemoteModel.id(region,"sourceRegionId");if(source.isEmpty())source=RemoteModel.id(region,"id");
  Object target=region==null?JSONObject.NULL:source;
  set(state,"","","queuedRegion",target,now);
  set(state,"","","queuedPlaylistEntryId",region==null||RemoteModel.id(state,"selectedPlaylist").isEmpty()?JSONObject.NULL:RemoteModel.id(region,"id"),now);
  set(state,"songDisplays","","queued",region==null?JSONObject.NULL:region.optString("name"),now);
  set(state,"sectionPlayback","","secondaryRegion",target,now);
 }
 void deriveLiveAndPreview(JSONObject display)throws JSONException{
  boolean clearLive=false,preview=false;
  for(Change c:pending.values())if(c.scope.isEmpty()){
   if(c.field.equals("setlistLiveEnabled")&&c.expected.contains(false))clearLive=true;
   if(c.field.equals("previewActive"))preview=true;
  }
  if(clearLive)display.put("playedLiveRegionIDs",new JSONArray());
  if(!clearLive&&!preview)return;
  JSONArray tps=RemoteModel.array(display,"teleprompters"),result=new JSONArray();
  for(JSONObject original:RemoteModel.list(tps)){
   JSONObject tp=copy(original);if(preview)tp.put("preview",display.optBoolean("previewActive"));
   if(clearLive){JSONArray blocks=new JSONArray();for(JSONObject b:RemoteModel.list(RemoteModel.array(tp,"blocks"))){JSONObject block=copy(b);JSONArray rows=new JSONArray();for(JSONObject r:RemoteModel.list(RemoteModel.array(b,"rows")))rows.put(copy(r).put("liveExecuted",false));block.put("rows",rows);blocks.put(block);}tp.put("blocks",blocks);}
   result.put(tp);
  }
  if(display.has("teleprompters"))display.put("teleprompters",result);
 }
 // The host's silenced flag is derived from mute and the complete solo hierarchy.
 // Recalculate its visual effect while mixer edits are awaiting acknowledgement.
 void deriveAudibility(JSONObject host,JSONObject display)throws JSONException{
  boolean mute=false,solo=false;Set<String> changedMute=new HashSet<>();
  for(Change c:pending.values())if(c.scope.equals("tracks")){if(c.field.equals("mute")){mute=true;changedMute.add(c.id.toLowerCase(Locale.ROOT));}if(c.field.equals("solo"))solo=true;}
  if(!mute&&!solo)return;
  JSONArray tracks=RemoteModel.array(display,"tracks");Set<String> audible=audible(tracks),hostAudible=audible(RemoteModel.array(host,"tracks"));
  boolean hasSolo=false,hostHasSolo=false;for(JSONObject t:RemoteModel.list(tracks))hasSolo|=t.optBoolean("solo");for(JSONObject t:RemoteModel.list(RemoteModel.array(host,"tracks")))hostHasSolo|=t.optBoolean("solo");
  for(JSONObject track:RemoteModel.list(tracks)){
   String id=RemoteModel.id(track,"id"),key=id.toLowerCase(Locale.ROOT);JSONObject original=target(host,"tracks",id);
   if(!solo&&!changedMute.contains(key))continue;
   boolean knownHostSilence=original!=null&&(original.optBoolean("mute")||(hostHasSolo&&!hostAudible.contains(key)));
   // A special solo source may be absent from the remote track list. Keep that
   // host-only silence; do not make it audible by toggling an unrelated mute.
   boolean external=original!=null&&original.optBoolean("silenced")&&!knownHostSilence;
   boolean silent=track.optBoolean("mute")||(hasSolo&&!audible.contains(key))||external;
   mutableTarget(display,"tracks",id).put("silenced",silent);
  }
 }
 static Set<String> audible(JSONArray tracks){
  Set<String> solos=new HashSet<>(),result=new HashSet<>();Map<String,JSONObject> indexed=new HashMap<>();
  for(JSONObject t:RemoteModel.list(tracks)){String id=RemoteModel.id(t,"id").toLowerCase(Locale.ROOT);indexed.put(id,t);if(t.optBoolean("solo"))solos.add(id);}
  result.addAll(solos);
  for(String solo:solos)result.addAll(ancestors(indexed,solo));
  for(String id:indexed.keySet())for(String parent:ancestors(indexed,id))if(solos.contains(parent)){result.add(id);break;}
  return result;
 }
 static Set<String> ancestors(Map<String,JSONObject> tracks,String id){Set<String> result=new HashSet<>(),seen=new HashSet<>();seen.add(id);String parent=RemoteModel.id(tracks.get(id),"parentTrack").toLowerCase(Locale.ROOT);while(!parent.isEmpty()&&seen.add(parent)){result.add(parent);parent=RemoteModel.id(tracks.get(parent),"parentTrack").toLowerCase(Locale.ROOT);}return result;}
 static boolean equal(Object a,Object b){if(a==JSONObject.NULL)a=null;if(b==JSONObject.NULL)b=null;if(a instanceof Number&&b instanceof Number)return Math.abs(((Number)a).doubleValue()-((Number)b).doubleValue())<.000001;return Objects.equals(a,b);}
 static JSONObject target(JSONObject state,String scope,String id){
  if(scope.isEmpty())return state;if(scope.equals("tracks"))return RemoteModel.find(RemoteModel.array(state,"tracks"),id);
  if(scope.equals("clips")){for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"tracks"))){JSONObject clip=RemoteModel.find(RemoteModel.array(t,"clips"),id);if(clip!=null)return clip;}return null;}
  return state.optJSONObject(scope);
 }
 static JSONObject copy(JSONObject object)throws JSONException{JSONObject result=new JSONObject();Iterator<String> keys=object.keys();while(keys.hasNext()){String k=keys.next();result.put(k,object.get(k));}return result;}
 static JSONArray copy(JSONArray a){JSONArray b=new JSONArray();for(int i=0;i<a.length();i++)b.put(a.opt(i));return b;}
 static JSONObject mutableTarget(JSONObject state,String scope,String id)throws JSONException{
  if(scope.isEmpty())return state;
  if(scope.equals("tracks")||scope.equals("clips")){
   JSONArray tracks=copy(RemoteModel.array(state,"tracks"));state.put("tracks",tracks);
   for(int i=0;i<tracks.length();i++){JSONObject t=tracks.getJSONObject(i);
    if(scope.equals("tracks")&&RemoteModel.same(RemoteModel.id(t,"id"),id)){t=copy(t);tracks.put(i,t);return t;}
    if(scope.equals("clips")){JSONArray clips=RemoteModel.array(t,"clips");for(int j=0;j<clips.length();j++)if(RemoteModel.same(RemoteModel.id(clips.optJSONObject(j),"id"),id)){t=copy(t);tracks.put(i,t);clips=copy(clips);t.put("clips",clips);JSONObject clip=copy(clips.getJSONObject(j));clips.put(j,clip);return clip;}}
   }return null;
  }
  JSONObject target=state.optJSONObject(scope);if(target!=null){target=copy(target);state.put(scope,target);}return target;
 }
}
