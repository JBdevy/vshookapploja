package com.hookdeveloper.catlive.remote;

import org.json.JSONObject;

/** Relative host countdown with immediate, acknowledged start/cancel feedback. */
final class RemoteFadeout {
    String project="",run="",pending="";
    Boolean desired;
    double duration=3,remaining;
    long receivedAt,sentAt;
    boolean supported;
    void receive(JSONObject state,long now){
        String scope=state==null?"":state.optString("project");
        if(!project.equals(scope)){project=scope;run="";pending="";desired=null;remaining=0;}
        JSONObject value=state==null?null:state.optJSONObject("fadeout");supported=value!=null;
        if(value==null){run="";desired=null;pending="";remaining=0;return;}
        double seconds=value.optDouble("duration",3),left=value.optDouble("remaining",0);
        if(!Double.isFinite(seconds)||seconds<1||seconds>5||!Double.isFinite(left)||left<0||left>seconds){supported=false;run="";pending="";desired=null;remaining=0;return;}
        duration=seconds;remaining=left;receivedAt=now;
        run=value.isNull("runID")?"":value.optString("runID");
        if(!pending.isEmpty()&&(pending.equals(value.optString("lastCommandID"))||now-sentAt>=2000)){pending="";desired=null;}
    }
    void command(JSONObject command,long now){pending=command.optString("id");desired=command.optBoolean("enabled");sentAt=now;}
    boolean active(long now){return desired!=null&&now-sentAt<2000?desired:!run.isEmpty();}
    double value(long now){return Math.max(0,remaining-Math.max(0,now-receivedAt)/1000.0);}
}
