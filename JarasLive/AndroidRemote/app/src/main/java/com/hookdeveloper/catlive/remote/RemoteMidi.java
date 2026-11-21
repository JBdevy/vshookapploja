package com.hookdeveloper.catlive.remote;

import android.content.*;
import android.media.midi.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.function.Consumer;

final class RemoteMidi {
    static final String[] ACTIONS={"setlistUp","setlistDown","partsUp","partsDown","toggleParts","cancelSection","play","stop","playStop","repeatPlayback","bypass","playlistUp","playlistDown"};
    static String title(String key){String[] titles={"Setlist ↑","Setlist ↓","Parts ↑","Parts ↓","Parts","Cancel queued section","Play","Stop","Play / Stop","Repeat","Bypass Multiloops","Playlist anterior","Próxima playlist"};for(int i=0;i<ACTIONS.length;i++)if(key.equals(ACTIONS[i]))return titles[i];return key;}
    private final MidiManager manager;private final Handler main=new Handler(Looper.getMainLooper());private final SharedPreferences prefs;private final Consumer<String> action;
    private final Map<Integer,MidiDevice> devices=new HashMap<>();private final Set<String> held=new HashSet<>();private final List<MidiOutputPort> ports=new ArrayList<>();private JSONObject bindings;boolean started;int generation;String learning;
    private final MidiManager.DeviceCallback callback=new MidiManager.DeviceCallback(){public void onDeviceAdded(MidiDeviceInfo info){open(info);}public void onDeviceRemoved(MidiDeviceInfo info){MidiDevice d=devices.remove(info.getId());if(d!=null)try{d.close();}catch(IOException ignored){}}};
    RemoteMidi(Context c,Consumer<String> action){this.action=action;manager=(MidiManager)c.getSystemService(Context.MIDI_SERVICE);prefs=c.getSharedPreferences("catlive.remote.midi",0);try{bindings=new JSONObject(prefs.getString("bindings","{}"));}catch(Exception e){bindings=new JSONObject();}}
    void start(){if(started||manager==null)return;started=true;manager.registerDeviceCallback(callback,main);for(MidiDeviceInfo d:manager.getDevices())open(d);}
    void stop(){started=false;generation++;if(manager!=null)manager.unregisterDeviceCallback(callback);for(MidiOutputPort p:ports)try{p.close();}catch(IOException ignored){}ports.clear();for(MidiDevice d:devices.values())try{d.close();}catch(IOException ignored){}devices.clear();held.clear();learning=null;}
    void open(MidiDeviceInfo info){if(devices.containsKey(info.getId()))return;int token=generation;manager.openDevice(info,d->{if(d==null)return;if(!started||token!=generation){try{d.close();}catch(IOException ignored){}return;}devices.put(info.getId(),d);String identity=info.getProperties().getString(MidiDeviceInfo.PROPERTY_MANUFACTURER,"")+"/"+info.getProperties().getString(MidiDeviceInfo.PROPERTY_PRODUCT,"")+"/"+info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME,"MIDI");for(int n=0;n<info.getOutputPortCount();n++){MidiOutputPort port=d.openOutputPort(n);if(port!=null){ports.add(port);port.connect(new Parser(identity+":"+n));}}},main);}
    String label(String action){JSONObject b=bindings.optJSONObject(action);return b==null?"Learn MIDI":b.optString("label","MIDI");}
    void clear(String action){bindings.remove(action);persist();}
    void persist(){prefs.edit().putString("bindings",bindings.toString()).apply();}
    void received(String device,int status,int number,int value){int kind=status&0xf0,ch=status&15;if(kind!=0x80&&kind!=0x90&&kind!=0xb0&&kind!=0xc0)return;int normalized=kind==0x80?0x90:kind;String key=device+":"+ch+":"+normalized+":"+number;if(kind==0x80||(kind!=0xc0&&value==0)){held.remove(key);return;}if(kind!=0xc0&&!held.add(key))return;
        if(learning!=null){try{for(String a:ACTIONS){JSONObject old=bindings.optJSONObject(a);if(old!=null&&key.equals(old.optString("key")))bindings.remove(a);}String name=learning;bindings.put(name,new JSONObject().put("key",key).put("label","CH "+(ch+1)+" · "+(kind==0xb0?"CC ":kind==0xc0?"PC ":"Note ")+number));learning=null;persist();action.accept("learn:"+name);}catch(JSONException ignored){}return;}
        for(String a:ACTIONS){JSONObject b=bindings.optJSONObject(a);if(b!=null&&key.equals(b.optString("key"))){action.accept(a);break;}}
    }
    final class Parser extends MidiReceiver {final String device;int status=0,count=0;final int[] data=new int[2];Parser(String device){this.device=device;}
        @Override public void onSend(byte[] bytes,int offset,int length,long timestamp){for(int i=offset;i<offset+length;i++){int value=bytes[i]&255;if(value>=0xf8)continue;if(value>=0x80){if(value>=0xf0){status=0;count=0;}else{status=value;count=0;}continue;}if(status==0)continue;data[count++]=value;int expected=(status&0xf0)==0xc0||(status&0xf0)==0xd0?1:2;if(count==expected){final int s=status,n=data[0],v=expected==1?127:data[1];main.post(()->received(device,s,n,v));count=0;}}}
    }
}
