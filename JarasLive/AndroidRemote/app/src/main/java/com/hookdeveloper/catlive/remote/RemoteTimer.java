package com.hookdeveloper.catlive.remote;
import org.json.JSONObject;
import java.util.Locale;

/** Same command-ID reconciliation and remembered duration as iOS RemoteLocalTimer. */
final class RemoteTimer {
 static final int MAXIMUM_TARGET=99*3600+59*60+59;
 String revision="",pending="",project="";long deadline,anchor,runID;double remaining;boolean running;int targetSeconds;
 void scope(String value){if(!project.equals(value)){project=value;revision="";pending="";remaining=0;targetSeconds=0;running=false;runID++;}}
 void command(JSONObject command,long now){String action=command.optString("action");if(!action.equals("timerStart")&&!action.equals("timerStop"))return;
  pending=command.optString("id");deadline=now+3000;running=action.equals("timerStart");if(running)targetSeconds=clamp(command.optInt("value"));remaining=running?targetSeconds:0;anchor=now;runID++;
 }
 void receive(JSONObject snapshot,long now){if(snapshot==null)return;
  double next=snapshot.optDouble("remainingSeconds",0);if(!Double.isFinite(next))return;
  if(!pending.isEmpty()){if(!RemoteModel.same(pending,RemoteModel.id(snapshot,"commandID"))&&now<deadline)return;pending="";}
  else if(revision.equals(RemoteModel.id(snapshot,"revision")))return;
  revision=RemoteModel.id(snapshot,"revision");remaining=next;running=snapshot.optBoolean("running");targetSeconds=clamp(snapshot.optInt("targetSeconds",targetSeconds));anchor=now;runID++;
 }
 double value(long now){return remaining-(running?Math.max(0,now-anchor)/1000.0:0);}
 private static int clamp(int seconds){return Math.min(MAXIMUM_TARGET,Math.max(0,seconds));}
 static String formatted(double seconds){long value=(long)Math.ceil(Double.isFinite(seconds)?Math.max(-359999999,Math.min(359999999,seconds)):0),absolute=Math.abs(value);return(value<0?"−":"")+String.format(Locale.US,"%02d:%02d:%02d",absolute/3600,absolute/60%60,absolute%60);}
}
