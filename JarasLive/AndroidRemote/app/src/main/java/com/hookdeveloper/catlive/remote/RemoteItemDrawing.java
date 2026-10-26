package com.hookdeveloper.catlive.remote;

import android.graphics.*;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.LruCache;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** Matches RemoteNativeGridItem's illustrative LAN waveform, not audio peaks. */
final class RemoteItemDrawing {
 final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 final LruCache<String,Path> waves=new LruCache<>(96);
 int builds;
 static int seed(String id){int seed=0;for(byte c:id.toUpperCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8))seed=(seed+(c&255))%997;return seed;}
 static double amplitude(int seed,double fraction){double phase=fraction*300+seed;return .12+.78*Math.abs(Math.sin(phase*.37)*Math.cos(phase*.13));}
 float headerHeight(RectF box){return Math.min(box.height(),36.4f*density);}
 RectF muteRect(RectF box){return new RectF(box.left+3*density,box.top,Math.min(box.right,box.left+39.4f*density),box.top+headerHeight(box));}
 Path waveform(String id,float width,float height,double sourceFraction,double visibleFraction){
  String key=id.toUpperCase(Locale.ROOT)+"|"+width+"|"+height+"|"+density+"|"+sourceFraction+"|"+visibleFraction;
  Path found=waves.get(key);if(found!=null)return found;
  Path path=new Path();int count=Math.max(1,(int)(width/(3*density))),seed=seed(id);
  for(int i=0;i<count;i++){double fraction=sourceFraction+(double)i/count*visibleFraction;float h=(float)(height*amplitude(seed,fraction)),x=i*3*density;path.addRect(x,(height-h)/2,x+1.5f*density,(height+h)/2,Path.Direction.CW);}
  builds++;waves.put(key,path);return path;
 }
 static int alpha(int color,float value){return (color&0xffffff)|(Math.round(255*value)<<24);}
 void draw(Canvas canvas,RectF box,JSONObject track,JSONObject clip,double sourceFraction,double visibleFraction){
  if(box.width()<=0||box.height()<=0)return;
  boolean muted=clip.optBoolean("muted"),silenced=muted||track.optBoolean("silenced");
  int color=silenced?0xff8c8c8c:rgb(track.optLong("color",0x705264)),name=rgb(track.optLong("nameColor",0xffffff));
  float radius=3*density,header=headerHeight(box);Path outline=new Path();outline.addRoundRect(box,radius,radius,Path.Direction.CW);
  canvas.save();canvas.clipPath(outline);
  paint.setStyle(Paint.Style.FILL);paint.setColor(Color.WHITE);paint.setShader(new LinearGradient(0,box.top,0,box.bottom,alpha(color,silenced?.55f:1),alpha(color,silenced?.25f:.78f),Shader.TileMode.CLAMP));canvas.drawRect(box,paint);paint.setShader(null);
  paint.setColor(0x29000000);canvas.drawRect(box.left,box.top,box.right,box.top+header,paint);
  RectF mute=muteRect(box);paint.setColor(muted?0xffff3b30:0x47000000);canvas.drawRoundRect(mute,2*density,2*density,paint);
  paint.setColor(muted?Color.BLACK:Color.WHITE);paint.setTypeface(bold);paint.setTextSize(14.3f*density);paint.setTextAlign(Paint.Align.CENTER);
  canvas.save();canvas.clipRect(mute);canvas.drawText("M",mute.centerX(),mute.centerY()-(paint.ascent()+paint.descent())/2,paint);canvas.restore();
  paint.setTextAlign(Paint.Align.LEFT);paint.setTextSize(13*density);paint.setColor(name);float titleX=mute.right+4*density,available=Math.max(0,box.right-titleX-3*density);
  if(available>0){String title=TextUtils.ellipsize(clip.optString("name"),new TextPaint(paint),available,TextUtils.TruncateAt.END).toString();canvas.drawText(title,titleX,box.top+header/2-(paint.ascent()+paint.descent())/2,paint);}
  float waveHeight=box.height()-header;
  if(waveHeight>0){paint.setColor(silenced?0xff808080:alpha(name,.75f));canvas.save();canvas.translate(box.left,box.top+header);canvas.clipRect(0,0,box.width(),waveHeight);canvas.drawPath(waveform(RemoteModel.id(clip,"id"),box.width(),waveHeight,sourceFraction,visibleFraction),paint);canvas.restore();}
  canvas.restore();paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(.6f*density);paint.setColor(alpha(color,.75f));RectF border=new RectF(box);border.inset(.3f*density,.3f*density);canvas.drawRoundRect(border,radius,radius,paint);paint.setStyle(Paint.Style.FILL);
 }
}
