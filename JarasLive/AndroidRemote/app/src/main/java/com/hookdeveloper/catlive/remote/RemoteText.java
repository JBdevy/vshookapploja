package com.hookdeveloper.catlive.remote;
import android.content.*;import org.json.*;import java.io.*;import java.util.*;
/** UI catalog exported from the current Apple Localizable.strings files. */
final class RemoteText {
 static JSONObject catalog=new JSONObject();static String language="pt-BR";
 static void init(Context c){language=c.getSharedPreferences("catlive.remote.preferences",0).getString("language",Locale.getDefault().getLanguage().equals("pt")?"pt-BR":"en");try(InputStream in=c.getAssets().open("translations.json")){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);catalog=new JSONObject(out.toString("UTF-8"));}catch(Exception ignored){}}
 static String ui(String value){JSONObject map=catalog.optJSONObject(language);return map==null?value:map.optString(value,value);}
 static void choose(Context c,String value){language=value;c.getSharedPreferences("catlive.remote.preferences",0).edit().putString("language",value).apply();}
}
