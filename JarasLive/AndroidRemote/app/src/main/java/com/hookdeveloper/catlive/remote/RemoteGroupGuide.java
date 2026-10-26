package com.hookdeveloper.catlive.remote;
import android.content.Context;import android.graphics.*;import android.view.*;import org.json.*;import java.util.*;import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

final class RemoteGroupGuide extends View {
 final Paint paint=new Paint(3);int depth;boolean last;
 RemoteGroupGuide(Context context){super(context);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);}
 static List<String> ancestors(JSONArray tracks,String id){List<String> result=new ArrayList<>();Set<String> seen=new HashSet<>();seen.add(id.toLowerCase(Locale.ROOT));JSONObject track=RemoteModel.find(tracks,id);String parent=RemoteModel.id(track,"parentTrack");while(!parent.isEmpty()&&seen.add(parent.toLowerCase(Locale.ROOT))){result.add(parent);parent=RemoteModel.id(RemoteModel.find(tracks,parent),"parentTrack");}Collections.reverse(result);return result;}
 void update(JSONArray tracks,String id){List<String> parents=ancestors(tracks,id);int nextDepth=parents.size();String next="";for(int i=0;i<tracks.length()-1;i++)if(RemoteModel.same(RemoteModel.id(tracks.optJSONObject(i),"id"),id)){next=RemoteModel.id(tracks.optJSONObject(i+1),"id");break;}
  List<String> following=ancestors(tracks,next);boolean continues=false;if(!parents.isEmpty())for(String p:following)if(RemoteModel.same(p,parents.get(parents.size()-1)))continues=true;
  last=!continues;depth=nextDepth;int width=depth==0?0:dp(16+Math.min(4,depth-1)*8);if(getLayoutParams()!=null&&getLayoutParams().width!=width){getLayoutParams().width=width;requestLayout();}invalidate();
 }
 @Override protected void onDraw(Canvas canvas){if(depth==0)return;paint.setColor(0xb369ed91);paint.setStrokeWidth(dp(1));float x=getWidth()-dp(11),y=Math.min(getHeight(),dp(17));canvas.drawLine(x,0,x,last?y:getHeight(),paint);canvas.drawLine(x,y,getWidth()-dp(4),y,paint);}
}
