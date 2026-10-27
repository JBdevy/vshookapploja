package com.hookdeveloper.catlive.remote;

import java.util.*;
import org.json.*;

final class RemoteModel {
    static JSONArray array(JSONObject o,String key) { JSONArray a=o==null?null:o.optJSONArray(key);return a==null?new JSONArray():a; }
    static String id(JSONObject o,String key) { return o==null||o.isNull(key)?"":o.optString(key,""); }
    static boolean same(String a,String b){return a!=null&&b!=null&&a.equalsIgnoreCase(b)&&!a.isEmpty();}
    static JSONObject find(JSONArray a,String id){for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&same(id(o,"id"),id))return o;}return null;}
    static List<JSONObject> list(JSONArray a){List<JSONObject> out=new ArrayList<>();for(int i=0;i<a.length();i++)if(a.optJSONObject(i)!=null)out.add(a.optJSONObject(i));return out;}
    static JSONObject region(JSONObject s,String id){JSONObject r=find(array(s,"timelineRegions"),id);return r!=null?r:find(array(s,"regions"),id);}
    static JSONObject root(JSONObject s,JSONObject r){if(r==null)return null;JSONObject p=region(s,id(r,"parentRegion"));return p==null?r:p;}
    static boolean gridTempoMarker(JSONObject state,JSONObject marker){
        if(!marker.isNull("tempoBPM")||marker.optBoolean("isTempo"))return true;
        if(!id(marker,"unifiedRegionID").isEmpty()||!id(marker,"sourceRegionID").isEmpty()||marker.optBoolean("section"))return false;
        // Older hosts send BPM markers under the reserved name TEMPO, without type metadata.
        if(!marker.optString("name").trim().equalsIgnoreCase("TEMPO"))return false;
        for(JSONObject child:list(array(state,"timelineRegions")))if(!id(child,"parentRegion").isEmpty()&&child.optString("name").equalsIgnoreCase(marker.optString("name"))&&Math.abs(child.optDouble("start")-marker.optDouble("position"))<.001)return false;
        return true;
    }
    static JSONObject gridRegion(JSONObject s){
        if(s==null)return null;
        if(s.optBoolean("subPlaying")){JSONObject section=s.optJSONObject("sectionPlayback");double pos=s.optDouble("subPlayPosition",section==null?-1:section.optDouble("secondaryPosition",-1));
            JSONObject r=region(s,id(section,"secondaryRegion"));if(r!=null&&pos>=r.optDouble("start")&&pos<r.optDouble("end"))return root(s,r);
            for(JSONObject x:list(array(s,"timelineRegions")))if(pos>=x.optDouble("start")&&pos<x.optDouble("end"))return root(s,x);
        }
        JSONObject r=region(s,id(s,"gridRegion"));if(r!=null)return root(s,r);
        r=region(s,id(s,s.optBoolean("playing")?"currentRegion":"focusedRegion"));return root(s,r==null?region(s,id(s,"currentRegion")):r);
    }
    static String currentSongName(JSONObject s) {
        if(s==null)return "";
        if(s.optBoolean("playing")) {
            double position=s.optDouble("position");JSONObject section=s.optJSONObject("sectionPlayback");
            JSONObject current=region(s,id(section,"currentRegion"));
            if(current!=null&&position>=current.optDouble("start")&&position<(section==null?current.optDouble("end"):section.optDouble("currentEnd",current.optDouble("end"))))return current.optString("name");
            JSONArray regions=array(s,"timelineRegions");if(regions.length()==0)regions=array(s,"regions");
            JSONObject active=null;
            for(JSONObject part:list(regions))if(position>=part.optDouble("start")&&position<part.optDouble("end")&&(active==null||part.optDouble("end")-part.optDouble("start")<active.optDouble("end")-active.optDouble("start")))active=part;
            if(active!=null)return active.optString("name");
            current=region(s,id(s,"currentRegion"));if(current!=null)return current.optString("name");
        }
        JSONObject displays=s.optJSONObject("songDisplays");
        if(displays!=null&&!displays.isNull("current"))return displays.optString("current");
        JSONObject selected=region(s,id(s,"focusedRegion"));if(selected==null)selected=region(s,id(s,"currentRegion"));
        return selected==null?s.optString("songName"):selected.optString("name");
    }
    static boolean showsSetlistSelection(JSONObject s){return !s.optBoolean("playing")&&!s.optBoolean("subPlaying");}
    static String queuedSongName(JSONObject s){
        JSONObject displays=s.optJSONObject("songDisplays");
        if(displays!=null&&!displays.isNull("queued"))return displays.optString("queued",null);
        JSONObject queued=region(s,queuedEntry(s));if(queued==null)queued=region(s,id(s,"queuedRegion"));
        return queued==null?null:queued.optString("name");
    }
    // The wire regions follow playlist occurrence order; drawer children are not
    // independent AUTO entries. Respect block boundaries before skipping aliases.
    static JSONObject automaticQueueTarget(JSONObject s){
        JSONObject current=root(s,region(s,id(s,"currentRegion")));if(current==null)return null;
        String rootID=id(current,"id"),entry=id(s,"currentPlaylistEntryId");
        List<JSONObject> entries=new ArrayList<>();
        for(JSONObject r:list(array(s,"regions")))if(id(r,"parentRegion").isEmpty())entries.add(r);
        if(entries.isEmpty()){for(JSONObject r:list(array(s,"timelineRegions")))if(id(r,"parentRegion").isEmpty())entries.add(r);entries.sort(Comparator.comparingDouble(r->r.optDouble("start")));}
        int index=-1;for(int i=0;i<entries.size();i++)if(same(id(entries.get(i),"id"),entry)){index=i;break;}
        if(index<0)for(int i=0;i<entries.size();i++)if(same(id(entries.get(i),"id"),rootID)){index=i;break;}
        if(index<0)return null;
        for(int i=index+1;i<entries.size();i++){
            JSONObject candidate=entries.get(i);String candidateID=id(candidate,"id");
            if(s.optBoolean("regionAutoUntilBlockEnd"))for(JSONObject block:list(array(s,"setlistBlocks")))if(same(id(block,"beforeRegion"),candidateID))return null;
            String source=id(candidate,"sourceRegionId");if(source.isEmpty())source=candidateID;
            if(!same(source,rootID))return candidate;
        }
        return null;
    }
    static double db(double gain){return gain<=0?-60:Math.min(12,Math.max(-59.9,20*Math.log10(gain)));}
    static double gain(double db){return db<=-60?0:Math.pow(10,Math.min(24,db)/20);}
    static String time(double seconds){int n=(int)Math.max(0,seconds);return String.format(Locale.US,"%02d:%02d:%02d",n/3600,(n/60)%60,n%60);}
    static String duration(double seconds){int n=(int)Math.max(0,seconds);return String.format(Locale.US,"%dm %02ds",n/60,n%60);}
    static List<JSONObject> children(JSONObject s,String parent){List<JSONObject> out=new ArrayList<>();for(JSONObject r:list(array(s,"timelineRegions")))if(same(id(r,"parentRegion"),parent))out.add(r);out.sort(Comparator.comparingDouble(a->a.optDouble("start")));return out;}
    static String activeEntry(JSONObject s){String entry=id(s,"currentPlaylistEntryId");JSONObject r=find(array(s,"regions"),entry);return r!=null&&!id(r,"sourceRegionId").isEmpty()?entry:id(s,"currentRegion");}
    static String queuedEntry(JSONObject s){String entry=id(s,"queuedPlaylistEntryId");return entry.isEmpty()?id(s,"queuedRegion"):entry;}
    static boolean canQueue(JSONObject s,JSONObject r){
        String source=id(r,"sourceRegionId");if(source.isEmpty())return true;
        JSONObject current=root(s,region(s,id(s,"currentRegion")));JSONObject section=s.optJSONObject("sectionPlayback");
        JSONObject secondary=root(s,region(s,id(section,"secondaryRegion").isEmpty()?id(s,"queuedRegion"):id(section,"secondaryRegion")));
        return !(s.optBoolean("playing")&&same(source,id(current,"id")))&&!(s.optBoolean("subPlaying")&&same(source,id(secondary,"id")));
    }
    static final class TrackLayout {
        JSONObject track;final List<JSONObject> clips=new ArrayList<>();final Map<String,Integer> lanes=new HashMap<>();int count=1;double height=86;String source="";
    }
    static final class LayoutCache {
        double heightScale=1;
        static double boundedScale(double value){return Double.isFinite(value)?Math.max(.35,Math.min(3,value)):1;}
        void resize(double value){heightScale=boundedScale(value);for(TrackLayout entry:ordered)updateHeight(entry);}
        void updateHeight(TrackLayout entry){entry.height=Math.max(28,86*(entry.count>1?.7:1)*heightScale*entry.track.optDouble("heightScale",1))*entry.count;}
        String regionKey="";final Map<String,TrackLayout> entries=new HashMap<>();final List<TrackLayout> ordered=new ArrayList<>();
        void update(JSONObject state,JSONObject region){
            String key=region==null?"none":id(region,"id")+":"+region.optDouble("start")+":"+region.optDouble("end");if(!key.equals(regionKey)){entries.clear();regionKey=key;}
            ordered.clear();Set<String> keep=new HashSet<>();
            for(JSONObject track:list(array(state,"tracks"))){String id=id(track,"id");keep.add(id);String source=array(track,"clips").toString();TrackLayout entry=entries.get(id);
                if(entry==null||!source.equals(entry.source)){entry=new TrackLayout();entry.source=source;
                    if(region!=null)for(JSONObject clip:list(array(track,"clips")))if(clip.optDouble("duration")>0&&clip.optDouble("start")<region.optDouble("end")&&clip.optDouble("start")+clip.optDouble("duration")>region.optDouble("start"))entry.clips.add(clip);
                    entry.clips.sort(Comparator.comparingDouble(clip->clip.optDouble("start")));List<Double> ends=new ArrayList<>();
                    for(JSONObject clip:entry.clips){double start=clip.optDouble("start");int lane=0;while(lane<ends.size()&&ends.get(lane)>start)lane++;if(lane==ends.size())ends.add(start+clip.optDouble("duration"));else ends.set(lane,start+clip.optDouble("duration"));entry.lanes.put(id(clip,"id"),lane);}
                    entry.count=Math.max(1,ends.size());entries.put(id,entry);
                }
                entry.track=track;updateHeight(entry);ordered.add(entry);
            }entries.keySet().retainAll(keep);
        }
        double height(String id){TrackLayout e=entries.get(id);return e==null?86:e.height;}
    }
    static final class Cue {
        int seconds;boolean armed;
        String update(JSONObject s,long now){
            if(s==null||!s.optBoolean("playing")||s.optBoolean("paused"))return "";
            JSONObject playback=s.optJSONObject("sectionPlayback");
            double position=playback==null?s.optDouble("position"):playback.optDouble("position",s.optDouble("position"));
            String queued=id(playback,"queuedMarker");JSONObject marker=null;double boundary=0;armed=!queued.isEmpty();
            if(armed){marker=find(array(s,"markers"),queued);if(marker==null||playback==null||playback.isNull("nextTrigger"))return "";boundary=playback.optDouble("nextTrigger");}
            else {
                JSONObject region=region(s,id(playback,"currentRegion"));
                if(region==null){for(JSONObject r:list(array(s,"timelineRegions"))){if(position<r.optDouble("start")||position>=r.optDouble("end"))continue;if(region==null||(!id(r,"parentRegion").isEmpty()&&id(region,"parentRegion").isEmpty())||r.optDouble("end")-r.optDouble("start")<region.optDouble("end")-region.optDouble("start"))region=r;}}
                if(region==null)return "";
                double end=playback==null?region.optDouble("end"):playback.optDouble("currentEnd",region.optDouble("end"));boundary=Double.MAX_VALUE;
                for(JSONObject m:list(array(s,"markers"))){double p=m.optDouble("position");if(m.optBoolean("section")&&p>position&&p>=region.optDouble("start")&&p<end&&p<boundary){marker=m;boundary=p;}}
                if(marker==null||(s.optBoolean("loop")&&!s.isNull("loopEnd")&&boundary>=s.optDouble("loopEnd")))return "";
            }
            double remaining=boundary-position;if(!Double.isFinite(remaining)||remaining<=0||remaining>5)return "";
            seconds=(int)Math.ceil(remaining);return marker.optString("name");
        }
        void clear(){}
    }
}
