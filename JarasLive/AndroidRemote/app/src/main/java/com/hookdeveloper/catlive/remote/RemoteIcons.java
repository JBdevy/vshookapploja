package com.hookdeveloper.catlive.remote;
import android.content.Context;import android.graphics.*;import android.view.View;import org.json.*;import java.util.*;import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;
/** Generated from the current TrackInstrumentIconView.drawing paths, not substitute glyphs. */
final class RemoteIcons {
 static JSONObject icons;
 static void load(Context c){if(icons!=null)return;try(java.io.InputStream in=c.getAssets().open("track-icons.json")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);icons=new JSONObject(out.toString("UTF-8"));}catch(Exception e){icons=new JSONObject();}}
 static final class IconView extends View {
  String id="";final Paint paint=new Paint(3);final Map<String,Path> cache=new HashMap<>();IconView(Context c){super(c);load(c);}
  void update(String id){if(!this.id.equals(id)){this.id=id;invalidate();}setVisibility(id.isEmpty()?GONE:VISIBLE);}
  protected void onDraw(Canvas c){JSONObject icon=icons.optJSONObject(id);if(icon==null)return;String text=icon.optString("text");float size=Math.min(getWidth(),getHeight());c.save();c.translate((getWidth()-size)/2,(getHeight()-size)/2);c.scale(size/64,size/64);paint.setColor(TEXT);paint.setStrokeWidth(2.2f);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
   if(!text.isEmpty()){paint.setStyle(Paint.Style.FILL);paint.setTypeface(bold);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(text.length()<=3?22:12);c.drawText(text,32,38,paint);}
   else{Path path=cache.get(id);if(path==null){path=new Path();JSONArray ops=icon.optJSONArray("ops");for(int i=0;ops!=null&&i<ops.length();i++){JSONArray a=ops.optJSONArray(i);switch(a.optString(0)){case "M":path.moveTo((float)a.optDouble(1),(float)a.optDouble(2));break;case "L":path.lineTo((float)a.optDouble(1),(float)a.optDouble(2));break;case "Q":path.quadTo((float)a.optDouble(1),(float)a.optDouble(2),(float)a.optDouble(3),(float)a.optDouble(4));break;case "C":path.cubicTo((float)a.optDouble(1),(float)a.optDouble(2),(float)a.optDouble(3),(float)a.optDouble(4),(float)a.optDouble(5),(float)a.optDouble(6));break;case "Z":path.close();break;}}cache.put(id,path);}paint.setStyle(Paint.Style.STROKE);c.drawPath(path,paint);paint.setStyle(Paint.Style.FILL);}c.restore();
  }
 }
}
