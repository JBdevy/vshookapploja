package com.hookdeveloper.catlive.remote;

import android.media.midi.MidiInputPort;
import android.os.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;

/** Firmware handshake gates the integration. Free mode leaves normal MIDI mappings intact. */
final class RemoteSMK37 {
    final MainActivity app;
    final Handler main=new Handler(Looper.getMainLooper());
    MidiInputPort output;
    String source="",project="",part="",playlist="";
    boolean partSecondary,connected;
    int mode,preset,lastPad=127,serial,requestedPage=-1;
    long response,hello;
    double requestedGain;
    final Map<Integer,JSONObject> held=new HashMap<>();
    final Set<Integer> down=new HashSet<>();
    final LinkedHashMap<String,byte[]> pending=new LinkedHashMap<>();
    final Map<String,byte[]> sent=new HashMap<>();
    String awaiting="";boolean expected;long actionAt;
    RemoteSMK37(MainActivity app){this.app=app;}
    static boolean device(String name){return name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]","").contains("SMK37");}
    void attach(String id,MidiInputPort port){if(output!=null){try{port.close();}catch(IOException ignored){}return;}source=id;output=port;hello=0;main.post(pulse);}
    void detach(String id){if(source.equals(id))close();}
    void release(){for(JSONObject press:held.values())app.remote.vinhetasUp(press);held.clear();down.clear();}
    void close(){main.removeCallbacks(pulse);if(output!=null){send(frame(2));try{output.close();}catch(IOException ignored){}}release();output=null;source="";connected=false;sent.clear();pending.clear();part="";awaiting="";}
    static byte[] frame(int command,int... payload){byte[] out=new byte[payload.length+9];int[] sig={240,125,67,76,83,1,command};for(int i=0;i<7;i++)out[i]=(byte)sig[i];for(int i=0;i<payload.length;i++)out[i+7]=(byte)payload[i];int sum=0;for(int i=1;i<out.length-2;i++)sum+=out[i]&255;out[out.length-2]=(byte)((128-sum%128)%128);out[out.length-1]=(byte)247;return out;}
    static boolean valid(byte[] b){if(b.length<9||b.length>96||b[0]!=(byte)240||b[1]!=125||b[2]!=67||b[3]!=76||b[4]!=83||b[5]!=1||b[b.length-1]!=(byte)247)return false;int sum=0;for(int i=1;i<b.length-1;i++){int value=b[i]&255;if(value>127)return false;sum+=value;}return sum%128==0;}
    void receive(String id,byte[] b){if(!id.startsWith(source+":")||output==null||!valid(b))return;int c=b[6]&127,n=b.length-9;
        if(c==65&&n==3&&(b[7]&127)<6&&(b[8]&127)<16&&(b[9]&127)<3){if(mode!=b[9])release();if(!connected){sent.clear();pending.clear();}connected=true;mode=b[9];preset=b[7];response=SystemClock.elapsedRealtime();return;}
        if(!connected)return;
        if(c==34&&n==3&&b[7]<3&&b[8]<6&&b[9]<16){release();mode=b[7];preset=b[8];part="";awaiting="";return;}
        if(mode==2||!app.canNavigateSetlist()||app.midi.learning!=null)return;
        if(c==32&&n==2&&b[7]<6&&b[8]<16){preset=b[7];app.remote.action("vinhetasPreset",null,preset);}
        if(mode!=1)return;
        if((c==35||c==36)&&n==1&&b[7]>0&&b[7]!=64){int step=b[7]-64;if(c==35){requestedPage=Math.max(0,Math.min(5,(requestedPage<0?app.state.optInt("previewPage"):requestedPage)+step));waitFor("page",true);app.remote.action("selectPreviewPage",null,requestedPage);}else stepPlaylist(step);}
        if(c==37&&n==1&&b[7]<2){boolean active=fadeActive(app.state.optJSONObject("fadeout"));if(!app.state.optBoolean("playing")||active==(b[7]==1))return;waitFor("fadeout",b[7]==1);app.remote.command("transportFadeout",null,0,null,null,b[7]==1);}
    }
    boolean midi(String id,int status,int number,int value){if(!connected||mode==2||!id.startsWith(source+":")||(status&240)!=176||!((number>=102&&number<=117)||(mode==0&&number==23)))return false;
        if(mode==0&&number==23){if(app.canNavigateSetlist()&&app.midi.learning==null)for(JSONObject track:RemoteModel.list(RemoteModel.array(app.state,"tracks")))if(track.optString("role").equals("vinhetas")){requestedGain=padBusGain(value);waitFor("padBus",true);app.remote.action("volume",RemoteModel.id(track,"id"),requestedGain);break;}return true;}
        int key=(status&15)*16+number-102;
        if(value==0){down.remove(key);JSONObject press=held.remove(key);if(press!=null)app.remote.vinhetasUp(press);return true;}
        if(!down.add(key)||!app.canNavigateSetlist()||app.midi.learning!=null)return true;
        int pad=number-102;if(mode==0){JSONObject press=app.remote.vinhetasDown(preset,pad);if(press!=null){held.put(key,press);lastPad=pad;serial=(serial+1)&127;}}
        else action(pad);return true;
    }
    static double padBusGain(int value){return value<=0?0:Math.pow(10,(-60+Math.min(127,value)/127.0*60)/20);}
    void waitFor(String key,boolean wanted){awaiting=key;expected=wanted;actionAt=SystemClock.elapsedRealtime();}
    void action(int pad){JSONObject s=app.state;switch(pad){
        case 0:waitFor("recording",!s.optBoolean("recording"));app.remote.action("toggleRecord");break;
        case 2:waitFor("previewActive",!s.optBoolean("previewActive"));app.remote.action("togglePreview");break;
        case 3:case 4:if(app.mixerScroll!=null)app.mixerScroll.smoothScrollBy(0,RemoteWidgets.dp(pad==3?-72:72));feedback(pad==3?"TRACK MIXER ACIMA":"TRACK MIXER ABAIXO",0xeeeeee);break;
        case 5:case 6:case 13:case 14:stepParts(pad<8,pad==5||pad==13?-1:1);break;
        case 7:waitFor("regionAuto",!s.optBoolean("regionAuto"));app.remote.action("toggleRegionAuto");break;
        case 8:waitFor("play",!(s.optBoolean("playing")||s.optBoolean("paused")));app.remote.action(expected?"play":"stop");break;
        case 9:waitFor("paused",!s.optBoolean("paused"));app.remote.action("pause");break;
        case 10:waitFor("loop",!s.optBoolean("loop"));app.remote.action("toggleLoop");break;
        case 11:case 12:part="";app.navigateSong(pad==11?-1:1);List<JSONObject> songs=app.visibleSetlistRegions();List<String> names=new ArrayList<>();int selected=-1;for(JSONObject song:songs){if(RemoteModel.same(RemoteModel.id(song,"id"),app.setlistBrowseID))selected=names.size();names.add(song.optString("name"));}navigation(1,names,selected);break;
        case 15:if(part.isEmpty())app.activateSetlistSelection();else app.remote.action("queueSection",part,0);break;
        default:break;
    }}
    void stepPlaylist(int delta){List<JSONObject> lists=RemoteModel.list(RemoteModel.array(app.state,"playlists"));if(lists.isEmpty())return;String current=playlist.isEmpty()?RemoteModel.id(app.state,"selectedPlaylist"):playlist;int at=-1;for(int i=0;i<lists.size();i++)if(RemoteModel.same(current,RemoteModel.id(lists.get(i),"id")))at=i;int next=at<0?(delta>0?0:lists.size()-1):Math.floorMod(at+delta,lists.size());playlist=RemoteModel.id(lists.get(next),"id");part="";app.resetSetlistBrowsing();waitFor("playlist",true);app.remote.action("selectPlaylist",playlist,0);}
    void stepParts(boolean queued,int delta){if(app.parts==null||!app.parts.isShown())return;app.parts.selectTab(queued);List<RemoteParts.SectionRow> rows=app.parts.sections;if(rows.isEmpty())return;int at=-1;if(partSecondary==queued)for(int i=0;i<rows.size();i++)if(RemoteModel.same(part,rows.get(i).id))at=i;int next=at<0?(delta>0?0:rows.size()-1):Math.max(0,Math.min(rows.size()-1,at+delta));selectPart(rows.get(next).id,queued);List<String> names=new ArrayList<>();for(RemoteParts.SectionRow row:rows)names.add(row.name);navigation(queued?3:2,names,next);rows.get(next).requestRectangleOnScreen(new android.graphics.Rect(0,0,rows.get(next).getWidth(),rows.get(next).getHeight()),false);}
    void selectPart(String id,boolean queued){part=id;partSecondary=queued;app.cancelSetlistCommit();for(MainActivity.SongRow row:app.songRows)row.invalidate();if(app.parts!=null)app.parts.tick();}
    void feedback(String text,int rgb){pending.remove("navigation");queue("action",named(19,new int[0],text,rgb),true);}
    static byte[] navigationFrame(int kind,List<String> names,int selected){
        if(kind<1||kind>3||selected<0||selected>=names.size())return new byte[0];
        List<Integer> data=new ArrayList<>();data.add(kind);
        for(int row=0;row<5;row++){int index=selected+row-2,limit=row==2?24:14;
            String value=index>=0&&index<names.size()?Normalizer.normalize(names.get(index),Normalizer.Form.NFD).replaceAll("\\p{M}","").replaceAll("[^ -~]"," "):"";
            if(value.length()>limit)value=value.substring(0,limit-3)+"...";data.add(value.length());for(int c=0;c<value.length();c++)data.add((int)value.charAt(c));}
        int[] bytes=new int[data.size()];for(int i=0;i<bytes.length;i++)bytes[i]=data.get(i);return frame(23,bytes);
    }
    void navigation(int kind,List<String> names,int selected){byte[] bytes=navigationFrame(kind,names,selected);if(bytes.length==0)return;pending.remove("action");queue("navigation",bytes,true);}
    static byte[] playlistFrame(String name){
        String value=Normalizer.normalize(name,Normalizer.Form.NFD).replaceAll("\\p{M}","").replaceAll("[^ -~]"," ");
        if(value.length()>36)value=value.substring(0,33)+"...";
        int[] bytes=new int[value.length()];for(int i=0;i<bytes.length;i++)bytes[i]=value.charAt(i);
        return frame(25,bytes);
    }
    static byte[] playbackFrame(double position,double start,double end){
        if(!Double.isFinite(position)||!Double.isFinite(start)||!Double.isFinite(end)||end<=start)return frame(24,0,0,0,0,0,0,0,0);
        double duration=end-start,elapsed=Math.max(0,Math.min(duration,position-start));int progress=(int)Math.round(elapsed/duration*200),seconds=(int)Math.min(2097151,elapsed),total=(int)Math.min(2097151,duration);
        return frame(24,progress&127,progress>>7,seconds&127,(seconds>>7)&127,(seconds>>14)&127,total&127,(total>>7)&127,(total>>14)&127);
    }
    static byte[] named(int command,int[] prefix,String label,int rgb){String text=Normalizer.normalize(label,Normalizer.Form.NFD).replaceAll("\\p{M}","").replaceAll("[^ -~]"," ");if(text.length()>64)text=text.substring(0,64);byte[] ascii=text.getBytes(StandardCharsets.US_ASCII);int[] data=new int[prefix.length+6+ascii.length];System.arraycopy(prefix,0,data,0,prefix.length);for(int i=0;i<6;i++)data[prefix.length+i]=(rgb>>(20-i*4))&15;for(int i=0;i<ascii.length;i++)data[prefix.length+6+i]=ascii[i];return frame(command,data);}
    void queue(String key,byte[] bytes,boolean force){if(!connected)return;if(force||!Arrays.equals(sent.get(key),bytes))pending.put(key,bytes);else pending.remove(key);}
    void send(byte[] bytes){if(output!=null)try{output.send(bytes,0,bytes.length);}catch(IOException ignored){}}
    void update(){JSONObject s=app.state;if(s==null||!app.remote.connected){release();queue("transport",frame(20,0),false);return;}String nextProject=RemoteModel.id(s,"project");if(!nextProject.equals(project)){release();part="";playlist="";project=nextProject;awaiting="";}
        JSONObject activePlaylist=RemoteModel.find(RemoteModel.array(s,"playlists"),RemoteModel.id(s,"selectedPlaylist"));
        queue("playlist",playlistFrame(activePlaylist==null?"All regions":activePlaylist.optString("name","All regions")),false);
        int flags=(s.optBoolean("paused")?1:0)|(s.optBoolean("recording")?2:0)|(s.optBoolean("loop")?4:0)|(s.optBoolean("regionAuto")?8:0)|(s.optBoolean("previewActive")?16:0)|(s.optBoolean("playing")?32:0)|(!RemoteModel.id(s,"queuedRegion").isEmpty()?64:0);
        queue("transport",frame(20,flags),false);queue("loop",named(21,new int[0],s.optString("smkLoopName",""),s.optInt("smkLoopColor",0xffb347)),false);
        JSONObject pads=s.optJSONObject("vinhetas");JSONArray banks=RemoteModel.array(pads,"presets");if(banks.length()==6){int selected=pads.optInt("selectedPreset");if(selected>=0&&selected<6){if(preset!=selected){preset=selected;lastPad=127;}int active=0;for(int p=0;p<6;p++){JSONObject bank=banks.optJSONObject(p);queue("bank"+p,named(16,new int[]{p},bank.optString("name"),bank.optInt("color")),false);if(p!=preset)continue;JSONArray values=RemoteModel.array(bank,"pads");for(int i=0;i<Math.min(16,values.length());i++){JSONObject value=values.optJSONObject(i);queue("pad"+p+":"+i,named(17,new int[]{p,i},value.optString("name"),value.optInt("color")),false);if(value.optBoolean("active"))active|=1<<i;}}queue("selection",frame(18,preset,lastPad,serial,active&127,(active>>7)&127,(active>>14)&3),false);}}
        JSONObject region=RemoteModel.find(RemoteModel.array(s,"timelineRegions"),RemoteModel.id(s,"currentRegion"));
        queue("playback",playbackFrame(s.optDouble("position"),region==null?0:region.optDouble("start"),region==null?s.optDouble("duration"):region.optDouble("end")),false);
        queue("fadeout",fadeProgress(s.optJSONObject("fadeout")),false);
        finishFeedback(s);
    }
    static boolean fadeActive(JSONObject fade){return fade!=null&&!fade.isNull("runID")&&!fade.optString("runID").isEmpty();}
    static byte[] fadeProgress(JSONObject fade){
        if(!fadeActive(fade))return frame(22,0,0,0);
        double remaining=fade.optDouble("remaining",0),duration=fade.optDouble("duration",0);
        if(!Double.isFinite(remaining)||!Double.isFinite(duration)||duration<=0)return frame(22,0,0,0);
        return frame(22,1,(int)Math.ceil(Math.max(0,Math.min(5,remaining))*10-.000001),(int)Math.round(Math.max(0,Math.min(1,remaining/duration))*127));
    }
    void finishFeedback(JSONObject s){if(awaiting.isEmpty())return;if(SystemClock.elapsedRealtime()-actionAt>3000){awaiting="";requestedPage=-1;playlist="";return;}String text=null;
        if(awaiting.equals("padBus")){JSONObject found=null;for(JSONObject track:RemoteModel.list(RemoteModel.array(s,"tracks")))if(track.optString("role").equals("vinhetas")){found=track;break;}if(found==null||Math.abs(found.optDouble("volume")-requestedGain)>=.0001)return;text="VINHETAS FX "+(requestedGain<=0?"-INF":String.format(Locale.US,"%.1f",Math.min(0,20*Math.log10(requestedGain))))+" dB";}
        else if(awaiting.equals("page")){if(s.optInt("previewPage")!=requestedPage)return;int first=requestedPage*4+1;text="BLOCO "+first+"-"+(first+3);requestedPage=-1;}
        else if(awaiting.equals("playlist")){if(!RemoteModel.same(playlist,RemoteModel.id(s,"selectedPlaylist")))return;JSONObject list=RemoteModel.find(RemoteModel.array(s,"playlists"),playlist);text=list==null?null:list.optString("name");playlist="";}
        else {boolean actual=awaiting.equals("play")?(s.optBoolean("playing")||s.optBoolean("paused")):awaiting.equals("fadeout")?fadeActive(s.optJSONObject("fadeout")):s.optBoolean(awaiting);if(actual!=expected)return;switch(awaiting){case "play":text=actual?"PLAY":"STOP";break;case "paused":if(!actual)text=s.optBoolean("playing")?"PLAY":"STOP";break;case "recording":if(!actual)text="REC DESATIVADO";break;case "loop":if(!actual)text="LOOP DESATIVADO";break;case "regionAuto":text=actual?"AUTO ATIVO":"AUTO DESATIVADO";break;case "previewActive":text=actual?"PREVIEW ATIVADO":"PREVIEW DESATIVADO";break;case "fadeout":text=actual?null:"FADE OUT CANCELADO";break;}}
        awaiting="";if(text!=null)feedback(text,0xeeeeee);
    }
    final Runnable pulse=new Runnable(){public void run(){if(output==null)return;long now=SystemClock.elapsedRealtime();if(connected&&now-response>=3000){release();connected=false;sent.clear();pending.clear();}if(now-hello>=1000){send(frame(1));hello=now;}if(connected){update();int count=0;for(String key:new String[]{"action","navigation","transport","fadeout","playback","loop","selection"}){byte[] b=pending.remove(key);if(b!=null){send(b);sent.put(key,b);count++;}}while(count++<4&&!pending.isEmpty()){String key=pending.keySet().iterator().next();byte[] b=pending.remove(key);send(b);sent.put(key,b);}}main.postDelayed(this,50);}};
}
