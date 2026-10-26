package com.hookdeveloper.catlive.remote;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

final class RemoteWire {
    static byte[] readFrame(InputStream input) throws Exception {
        DataInputStream in=new DataInputStream(input);
        int size=in.readInt(); RemoteCipher.check(size>0 && size<=RemoteCipher.MAX_FRAME);
        byte[] packet=new byte[size];in.readFully(packet);return packet;
    }
    static void writeFrame(OutputStream output, byte[] packet) throws Exception {
        RemoteCipher.check(packet.length>0 && packet.length<=RemoteCipher.MAX_FRAME);
        DataOutputStream out=new DataOutputStream(output);out.writeInt(packet.length);out.write(packet);out.flush();
    }
    static byte[] packet(int kind,Object value) throws Exception {
        byte[] json=String.valueOf(value).getBytes(StandardCharsets.UTF_8);
        RemoteCipher.check(json.length+4<=RemoteCipher.MAX_PACKET);
        return RemoteCipher.join(new byte[]{0x4a,0x4c,2,(byte)kind},json);
    }
    static JSONObject command(JSONObject state,String action,String target,double value,String text,String playlist,Boolean enabled) throws JSONException {
        if(state==null||!Double.isFinite(value))return null;
        JSONObject command=new JSONObject().put("id",UUID.randomUUID().toString()).put("project",state.getString("project")).put("action",action).put("value",value);
        if(!state.isNull("song"))command.put("song",state.getString("song"));
        if(target!=null)command.put("target",target);
        if(text!=null)command.put("text",text);
        if(playlist!=null)command.put("playlist",playlist);
        if(enabled!=null)command.put("enabled",enabled);
        return command;
    }
    static boolean allowed(String action,String mode,double value) {
        if("director".equals(mode))return true;
        if("observer".equals(mode))return action.equals("requestImage") || (action.equals("remotePanel") && value>=0 && value<=2);
        if("notices".equals(mode))return action.startsWith("notice") || (action.equals("remotePanel") && (value==0 || value==3));
        return false;
    }
}
