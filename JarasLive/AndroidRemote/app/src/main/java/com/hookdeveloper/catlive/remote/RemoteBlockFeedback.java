package com.hookdeveloper.catlive.remote;

import org.json.*;
import java.util.*;

/** Local stopped selection only. Never sends transport commands to the host. */
final class RemoteBlockFeedback {
    JSONObject confirmed, destination;
    String key="";
    long deadline=-1, manualStopUntil=-1;
    boolean completed;
    void clear(){confirmed=null;destination=null;key="";deadline=-1;manualStopUntil=-1;completed=false;}
    JSONObject stop(JSONObject state,long now){
        clear();receive(state,now,true);
        if(destination==null){clear();return null;}
        completed=true;manualStopUntil=now+1500;deadline=manualStopUntil;
        return project();
    }
    JSONObject receive(JSONObject state,long now){return receive(state,now,false);}
    private JSONObject receive(JSONObject state,long now,boolean stopping){
        boolean manual=stopping||manualStopUntil>=0;
        JSONObject target=null;double end=0;
        if((state.optBoolean("playing")||manual&&state.optBoolean("paused"))&&!state.optBoolean("subPlaying")&&(manual||!state.optBoolean("paused")&&!state.optBoolean("loop"))&&state.optBoolean("regionAutoUntilBlockEnd")&&RemoteModel.id(state,"queuedRegion").isEmpty()&&(manual||RemoteModel.id(state.optJSONObject("sectionPlayback"),"queuedMarker").isEmpty())){
            JSONObject current=RemoteModel.root(state,RemoteModel.region(state,RemoteModel.id(state,"currentRegion")));
            if(current!=null){
                List<JSONObject> rows=new ArrayList<>();
                for(JSONObject r:RemoteModel.list(RemoteModel.array(state,"regions")))if(RemoteModel.id(r,"parentRegion").isEmpty())rows.add(r);
                if(RemoteModel.id(state,"selectedPlaylist").isEmpty())rows.sort(Comparator.<JSONObject>comparingDouble(r->r.optDouble("start")).thenComparing(r->RemoteModel.id(r,"id")));
                String entry=RemoteModel.id(state,"currentPlaylistEntryId");if(entry.isEmpty())entry=RemoteModel.id(current,"id");
                for(int i=0;i+1<rows.size();i++)if(RemoteModel.same(RemoteModel.id(rows.get(i),"id"),entry)){
                    JSONObject next=rows.get(i+1);
                    for(JSONObject block:RemoteModel.list(RemoteModel.array(state,"setlistBlocks")))if(RemoteModel.same(RemoteModel.id(block,"beforeRegion"),RemoteModel.id(next,"id")))target=next;
                    break;
                }
                end=current.optDouble("end");
                if(!Double.isFinite(end)||!manual&&(end<=state.optDouble("position")||Math.abs(state.optDouble("playbackEnd",end)-end)>1e-6))target=null;
            }
        }
        String nextKey=target==null?"":RemoteModel.id(state,"project")+"/"+RemoteModel.id(state,"song")+"/"+RemoteModel.id(state,"selectedPlaylist")+"/"+RemoteModel.id(state,"currentRegion")+"/"+RemoteModel.id(state,"currentPlaylistEntryId")+"/"+target.toString()+"/"+end;
        if(manualStopUntil>=0){
            if(now<manualStopUntil&&nextKey.equals(key)&&state.optDouble("position")+1e-6>=confirmed.optDouble("position")){confirmed=state;return project();}
            clear();return receive(state,now,false);
        }
        boolean samePosition=nextKey.equals(key)&&confirmed!=null&&state.optDouble("position")==confirmed.optDouble("position");long previousDeadline=deadline;
        if(!nextKey.equals(key)||confirmed!=null&&state.optDouble("position")+1e-6<confirmed.optDouble("position"))completed=false;
        key=nextKey;destination=target;confirmed=state;
        deadline=target==null||completed?-1:samePosition&&previousDeadline>=0?previousDeadline:now+Math.max(1,Math.round((end-state.optDouble("position"))*1000));
        return completed?project():state;
    }
    JSONObject advance(long now){if(deadline<0||now<deadline||destination==null)return null;if(manualStopUntil>=0){JSONObject host=confirmed;clear();return host;}completed=true;deadline=-1;return project();}
    private JSONObject project(){
        try{
            // Copy only the envelope; do not clone every waveform/mixer item.
            JSONObject next=new JSONObject();for(Iterator<String> it=confirmed.keys();it.hasNext();){String k=it.next();next.put(k,confirmed.get(k));}
            String target=RemoteModel.id(destination,"id"),source=RemoteModel.id(destination,"sourceRegionId");if(source.isEmpty())source=target;
            next.put("playing",false).put("paused",false).put("currentRegion",source).put("focusedRegion",target).put("gridRegion",source)
                .put("position",destination.optDouble("start")).put("editPosition",destination.optDouble("start")).put("playbackEnd",destination.optDouble("end"));
            next.put("currentPlaylistEntryId",RemoteModel.id(confirmed,"selectedPlaylist").isEmpty()?JSONObject.NULL:target);
            for(String field:new String[]{"queuedRegion","queuedPlaylistEntryId","queueStartedAt","sectionPlayback","songDisplays"})next.remove(field);
            return next;
        }catch(JSONException e){return confirmed;}
    }
}
