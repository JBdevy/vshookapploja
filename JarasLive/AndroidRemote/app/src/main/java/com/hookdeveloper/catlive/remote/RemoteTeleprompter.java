package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.*;
import android.text.*;
import android.text.style.ForegroundColorSpan;
import android.view.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** Same geometry formulas as TeleprompterProjectionLayout / tpPreviewLayout. */
class RemoteTeleprompter extends View {
    final MainActivity app;final int index;final Paint paint=new Paint(3);final TextPaint text=new TextPaint(3);final GestureDetector gestures;
    JSONObject style,settings;Typeface fontFace=bold;float top,bottom;boolean preview;String layoutKey="";float previewFont;float[] previewHeights;
    RemoteTeleprompter(Context c,MainActivity app,int index){super(c);this.app=app;this.index=index;setContentDescription("Teleprompter "+index);gestures=new GestureDetector(c,new GestureDetector.SimpleOnGestureListener(){public boolean onDown(MotionEvent e){return true;}public boolean onDoubleTap(MotionEvent e){app.fullscreen=!app.fullscreen;app.buildWorkspace();return true;}});}
    @Override protected void onDraw(Canvas c){
        c.drawColor(Color.BLACK);JSONObject s=app.state;if(s==null)return;JSONObject tp=null;for(JSONObject t:RemoteModel.list(RemoteModel.array(s,"teleprompters")))if(t.optInt("index")==index)tp=t;
        if(tp==null){drawText(c,"Aguardando teleprompter…",new RectF(dp(10),dp(10),getWidth()-dp(10),getHeight()-dp(10)),dp(18),SECONDARY,false,Layout.Alignment.ALIGN_CENTER,0);return;}
        style=tp.optJSONObject("style");settings=tp.optJSONObject("settings");if(style==null)style=new JSONObject();
        preview=tp.optBoolean("preview")&&flag("previewEnabled","",true)&&!flag("ignorePreview","",false);
        float outer=dp(6);top=outer;bottom=getHeight()-outer;
        String imageID=RemoteModel.id(tp,"imageID");if(!preview&&!imageID.isEmpty()){app.remote.requestImage(imageID);Bitmap image=app.remote.images.get(imageID.toLowerCase(Locale.ROOT));if(image!=null){boolean stretch=flag("mediaStretch","",false);float scale=(float)number("mediaScale",100)/100;float w,h;if(stretch){w=getWidth()*scale;h=(bottom-top)*scale;}else{float fit=Math.min(getWidth()/(float)image.getWidth(),(bottom-top)/image.getHeight())*scale;w=image.getWidth()*fit;h=image.getHeight()*fit;}c.save();c.clipRect(0,0,getWidth(),getHeight());paint.setColor(Color.WHITE);c.drawBitmap(image,null,new RectF((getWidth()-w)/2,(top+bottom-h)/2,(getWidth()+w)/2,(top+bottom+h)/2),paint);c.restore();}}
        if(!preview&&flag("clearMode","",false))return;
        List<Decoration> above=decorations(tp,true),below=decorations(tp,false);
        for(Decoration d:above){d.draw(c,new RectF(outer,top,getWidth()-outer,top+d.height));top+=d.height+dp(3);}
        float reserved=0;for(Decoration d:below)reserved+=d.height+dp(3);
        float lower=bottom-reserved+dp(3);bottom-=reserved;
        for(Decoration d:below){d.draw(c,new RectF(outer,lower,getWidth()-outer,lower+d.height));lower+=d.height+dp(3);}
        if(preview){preview(c,tp,new RectF(outer,top,getWidth()-outer,bottom));windowBorder(c,outer);return;}
        fontFace=family(string("fontFamily","font","system"));
        String[] columns=lyricColumns(tp);
        RectF full=new RectF(outer,top,getWidth()-outer,bottom);
        for(int i=0;i<columns.length;i++){
            RectF area=new RectF(full);
            if(columns.length==2){if(getWidth()>=getHeight()){float width=(full.width()-dp(8))/2;area.left+=i*(width+dp(8));area.right=area.left+width;}else{float height=(full.height()-dp(8))/2;area.top+=i*(height+dp(8));area.bottom=area.top+height;}}
            JSONObject value=new JSONObject();try{value.put("text",columns[i]);value.put("textStyled",columns[i]);}catch(JSONException ignored){}
            CharSequence styledLyrics=columns.length==1?styledText(tp,"text"):styledText(value,"text");String lyrics=styledLyrics.toString();
            if(!lyrics.isEmpty()||columns.length==2){String[] lines=lyrics.split("\\n",-1);int longest=1;for(String line:lines)longest=Math.max(longest,line.length());float font=(float)Math.max(1,Math.min((area.width()-dp(12))/(longest*.64),(area.height()-dp(12))/(Math.max(1,lines.length)*1.2))*number("textScale",100)/100);
                String align=string("textAlignment","textAlignment","center");drawText(c,styledLyrics,inset(area,dp(6)),font,color("textColor","textColor",0xffea00),true,align.equals("left")?Layout.Alignment.ALIGN_NORMAL:align.equals("right")?Layout.Alignment.ALIGN_OPPOSITE:Layout.Alignment.ALIGN_CENTER,0);
                if(flag("textBoxEnabled","textBox",true))stroke(c,area,border("textBoxColor","textBoxColor",0xffea00,"rgbTextBoxBorderEnabled"),2);
            }
        }
        windowBorder(c,outer);
        drawNotice(c,s.optJSONObject("notices"));
    }
    static String[] lyricColumns(JSONObject tp){
        String encoded=tp.optString("textStyled"),prefix="\u001eCatLiveColumns/1\n";
        if(encoded.startsWith(prefix)&&encoded.length()<=262144)try{
            JSONArray values=new JSONArray(encoded.substring(prefix.length()));
            if(values.length()==2&&values.get(0) instanceof String&&values.get(1) instanceof String&&!values.getString(0).startsWith(prefix)&&!values.getString(1).startsWith(prefix))return new String[]{values.getString(0),values.getString(1)};
        }catch(JSONException ignored){}
        return new String[]{tp.optString("text")};
    }
    CharSequence styledText(JSONObject tp,String key){
        String encoded=tp.optString(key+"Styled"),prefix="\u001eCatLiveText/1\n";
        if(encoded.startsWith(prefix)&&encoded.length()<=262144)try{
            JSONArray runs=new JSONArray(encoded.substring(prefix.length()));SpannableStringBuilder result=new SpannableStringBuilder();
            for(int i=0;i<runs.length();i++){
                JSONObject run=runs.getJSONObject(i);if(!(run.get("text") instanceof String))throw new JSONException("Invalid text");
                int start=result.length();result.append(display(run.getString("text")));
                if(!run.isNull("color")){Object raw=run.get("color");if(!(raw instanceof Number))throw new JSONException("Invalid color");double color=((Number)raw).doubleValue();if(color<0||color>0xffffff||color!=Math.floor(color))throw new JSONException("Invalid color");result.setSpan(new ForegroundColorSpan(0xff000000|(int)color),start,result.length(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}
            }
            return result;
        }catch(JSONException ignored){}
        return display(tp.optString(key));
    }
    final class Decoration {
        CharSequence styled;final String kind,value;final float height,size;final int tint;final boolean clock,local;
        Decoration(String kind,String value,float height,float size,int tint,boolean clock,boolean local){this.kind=kind;this.value=value;this.height=height;this.size=size;this.tint=tint;this.clock=clock;this.local=local;}
        void draw(Canvas c,RectF area){
            if(kind.equals("clock")){clocks(c,area,clock,local,string("clockPosition","clockPosition","center-top"));return;}
            if(kind.equals("progress")){paint.setColor(0x19ffffff);c.drawRect(area,paint);paint.setColor(tint);c.drawRect(area.left,area.top,area.left+area.width()*Float.parseFloat(value),area.bottom,paint);return;}
            fontFace=family(string(kind.equals("chords")?"chordFontFamily":kind.equals("song")?"songNameFontFamily":"queueNameFontFamily",kind.equals("chords")?"chordFont":"","system"));
            boolean chord=kind.equals("chords");
            if(chord){text.setTypeface(fontFace);text.setTextSize(size);float width=0;for(String line:value.split("\\n",-1))width=Math.max(width,text.measureText(line));width=Math.min(area.width(),width+dp(12));area=new RectF(area.centerX()-width/2,area.top,area.centerX()+width/2,area.bottom);}
            RectF inside=chord?inset(area,dp(6)):area;
            drawText(c,styled==null?value:styled,inside,chord?size:fit(value,area.width(),height,size),tint,true,Layout.Alignment.ALIGN_CENTER,chord?2:1);
            if(chord)stroke(c,area,border("chordColor","chordColor",0xfb923c,"rgbChordBorderEnabled"),1);
        }
    }
    List<Decoration> decorations(JSONObject tp,boolean atTop){
        List<Decoration> result=new ArrayList<>();String edge=atTop?"top":"bottom",position=string("clockPosition","clockPosition","center-top");
        boolean enabled=flag("clockEnabled","clockEnabled",true),clock=enabled&&position.endsWith(edge),local=flag("localClockEnabled","localClockEnabled",true)&&(enabled?clock:atTop);
        if(clock||local)result.add(new Decoration("clock","",clockHeight(clock,local,position),0,0,clock,local));
        if(preview)return result;
        for(String kind:new String[]{"song","queued","chords"}){
            String prefix=kind.equals("song")?"songName":kind.equals("queued")?"queueName":"chord",old=kind.equals("queued")?"queue":kind.equals("chords")?"chord":"song";
            boolean visible=flag(kind.equals("chords")?"chordsEnabled":prefix+"Enabled",kind.equals("chords")?"chordsEnabled":old+"Enabled",!kind.equals("song"));
            if(!visible||!string(prefix+"Position",old+"Position","top").equals(edge)||tp.optString(kind).isEmpty())continue;
            CharSequence rich=kind.equals("chords")?styledText(tp,kind):display(tp.optString(kind));String value=rich.toString();boolean chord=kind.equals("chords");float size=dp((float)(chord?number("chordScale",50):22*number(prefix+"Scale",100)/100));
            fontFace=family(string(prefix+"FontFamily",chord?"chordFont":"","system"));float h=chord?measureHeight(value,getWidth()-dp(18),size)+dp(12):size+dp(3);
            Decoration decoration=new Decoration(kind,value,h,size,color(prefix+"Color",old+"Color",chord?0xfb923c:kind.equals("song")?0x00ff55:0xffea00),false,false);decoration.styled=rich;result.add(decoration);
        }
        if(flag("progressEnabled","progressEnabled",false)&&string("progressPosition","progressPosition","bottom").equals(edge))result.add(new Decoration("progress",Float.toString((float)Math.max(0,Math.min(1,tp.optDouble("progress")))),dp(5),0,color("progressColor","progressColor",0xffea00),false,false));
        return result;
    }
    void drawNotice(Canvas c,JSONObject notice){
        if(notice==null||!notice.optBoolean("active")||!notice.optBoolean("window"+index))return;
        String imageID=RemoteModel.id(notice,"imageID");Bitmap image=null;
        if(!imageID.isEmpty()){app.remote.requestImage(imageID);image=app.remote.images.get(imageID.toLowerCase(Locale.ROOT));}
        String emoji=notice.optString("emoji"),message=(emoji.isEmpty()?"":emoji+" ")+notice.optString("message").toUpperCase(Locale.getDefault())+(emoji.isEmpty()?"":" "+emoji);
        fontFace=family(notice.optString("font","system"));float size=(float)(Math.min(dp(72),Math.max(dp(24),getWidth()*.078))*notice.optDouble("scale",80)/100);
        float height=notice.optBoolean("cleanDisplay")||!imageID.isEmpty()?getHeight():Math.min(getHeight(),layoutHeight(message,getWidth()-dp(48),size)+dp(48));
        RectF area=new RectF(0,0,getWidth(),height);long elapsed=System.currentTimeMillis()-(long)(notice.optDouble("sentAt")*1000);boolean flash=elapsed>=0&&elapsed<1050&&(elapsed/175)%2==0;
        paint.setColor(rgb(notice.optLong(flash?"flashColor":"backgroundColor",0)));c.drawRect(area,paint);
        RectF inside=inset(area,dp(24));
        if(!imageID.isEmpty()){
            if(image!=null){float scale=Math.min(inside.width()/image.getWidth(),inside.height()/image.getHeight());float w=image.getWidth()*scale,h=image.getHeight()*scale;paint.setColor(Color.WHITE);c.drawBitmap(image,null,new RectF(inside.centerX()-w/2,inside.centerY()-h/2,inside.centerX()+w/2,inside.centerY()+h/2),paint);}
        }else drawText(c,message,inside,size,rgb(notice.optLong("textColor",0xffffff)),true,Layout.Alignment.ALIGN_CENTER,0);
    }
    Typeface family(String value){
        switch(value){case "mono":return Typeface.create("monospace",Typeface.BOLD);case "georgia":return Typeface.create("serif",Typeface.BOLD);case "impact":case "bahnschrift":return Typeface.create("sans-serif-condensed",Typeface.BOLD);case "arial":case "segoe":case "verdana":case "tahoma":case "trebuchet":return Typeface.create("sans-serif",Typeface.BOLD);default:return bold;}
    }
    int border(String key,String old,int fallback,String animated){return flag(animated,"",false)?Color.HSVToColor(new float[]{(System.currentTimeMillis()%6000)/6000f*360,.9f,1}):color(key,old,fallback);}
    float layoutHeight(String value,float width,float font){text.setTypeface(fontFace);text.setTextSize(font);return StaticLayout.Builder.obtain(value,0,value.length(),text,Math.max(1,(int)width)).setIncludePad(false).build().getHeight();}

    float timerFontSize(){
        float width=Math.max(1,getWidth()-dp(16));
        return (float)Math.max(dp(getHeight()>getWidth()?15:18),Math.min(width/11,getHeight()/8f)*number("clockScale",100)/100);
    }
    float localFontSize(){return (float)Math.max(dp(10),Math.min(dp(24),getHeight()/28f)*number("localClockScale",100)/100);}
    float clockHeight(boolean clock,boolean local,String position){return !clock?localFontSize()+dp(10):Math.max(dp(28),timerFontSize()+dp(local&&!position.startsWith("center")?10:18));}
    void clockText(Canvas c,String value,RectF area,float font,int color,boolean border,int borderColor,float borderWidth,boolean timer){
        if(timer&&app.timerRunning&&app.timerValue()<=0&&android.os.SystemClock.elapsedRealtime()%1000>=500)color=(color&0x00ffffff)|0x40000000;
        RectF inside=new RectF(area);inside.inset(dp(timer?10:5),dp(5));
        drawText(c,value,inside,fitClock(value,inside.width(),inside.height(),font),color,true,Layout.Alignment.ALIGN_CENTER,1);
        if(border)stroke(c,area,borderColor,borderWidth);
    }
    float fitClock(String value,float width,float height,float font){
        text.setTypeface(fontFace);text.setTextSize(font);Paint.FontMetrics metrics=text.getFontMetrics();
        return Math.max(1,Math.min(font,Math.min(font*Math.max(1,(float)Math.floor(width)-2)/Math.max(1,text.measureText(value)),font*height/Math.max(1,metrics.descent-metrics.ascent))));
    }
    float localFontForPosition(String position,boolean timer){return timer&&!position.startsWith("center")?timerFontSize():localFontSize();}
    void clocks(Canvas c,RectF area,boolean clock,boolean local,String position){
        fontFace=Typeface.create("sans-serif",Typeface.BOLD);double seconds=Math.ceil(app.timerValue());String timer=(seconds<0?"−":"")+RemoteModel.time(Math.abs(seconds)).replace(":"," : "),now=new SimpleDateFormat("HH:mm:ss",Locale.getDefault()).format(new Date());
        boolean side=!position.startsWith("center"),localRight=string("localClockPosition","","right").equals("right");
        int timerColor=app.timerRunning&&app.timerValue()<=0?color("clockExpiredColor","",0xff3131):color("clockColor","clockColor",0x00ff55),localColor=color("localClockColor","localClockColor",0x00ff55);
        boolean timerBorder=flag("clockBorderEnabled","",true),localBorder=flag("localClockBorderEnabled","",true);
        int timerEdge=border("clockBorderColor","clockColor",0x00ff55,"rgbClockBorderEnabled"),localEdge=border("localClockBorderColor","localClockColor",0x00ff55,"rgbClockBorderEnabled");
        float font=timerFontSize();
        if(clock&&local&&side){
            RectF left=new RectF(area.left+dp(4),area.top,area.centerX()-dp(4),area.bottom),right=new RectF(area.centerX()+dp(4),area.top,area.right-dp(4),area.bottom);
            boolean timerLeft=position.startsWith("left");
            clockText(c,timer,timerLeft?left:right,font,timerColor,timerBorder,timerEdge,1,true);
            clockText(c,now,timerLeft?right:left,localFontForPosition(position,true),localColor,localBorder,localEdge,1,false);
            return;
        }
        RectF timerArea=new RectF(area);
        if(clock){
            float available=Math.max(1,area.width()-dp(8));float limit=!tablet&&local?Math.max(1,available-dp(152)):available;
            float width=Math.min(limit,Math.max(dp(118),textWidth("-00 : 00 : 00",font)+dp(36)));
            timerArea=new RectF(area.centerX()-width/2,area.top,area.centerX()+width/2,area.bottom);
            clockText(c,timer,timerArea,font,timerColor,timerBorder,timerEdge,1,true);
        }
        if(local){
            float localFont=localFontForPosition(position,clock);float available=clock?Math.max(1,(area.width()-timerArea.width())/2-dp(8)):area.width();
            float width=Math.min(available,textWidth(now,localFont)+dp(10)),height=Math.min(area.height(),localFont+dp(10));
            float x=clock?(localRight?area.right-width:area.left):area.centerX()-width/2;
            float y=position.endsWith("bottom")?area.bottom-height:area.top;
            clockText(c,now,new RectF(x,y,x+width,y+height),localFont,localColor,localBorder,localEdge,1,false);
        }
    }
    void preview(Canvas c,JSONObject tp,RectF area){fontFace=family(string("previewFontFamily","","system"));List<JSONObject> blocks=RemoteModel.list(RemoteModel.array(tp,"blocks"));if(blocks.size()>4)blocks=blocks.subList(0,4);if(blocks.isEmpty())return;int columns=Math.min(2,blocks.size()),rowCount=(blocks.size()+columns-1)/columns;float width=Math.max(1,(area.width()-dp(12)-dp((columns-1)*8))/columns),height=Math.max(1,area.height()-dp(12)-dp((rowCount-1)*8));StringBuilder key=new StringBuilder(width+":"+height+":"+string("textCase","","uppercase")+":"+string("previewFontFamily","","system"));for(JSONObject b:blocks){key.append(heading(b));for(JSONObject r:RemoteModel.list(RemoteModel.array(b,"rows")))key.append(rowText(r));}
        if(!key.toString().equals(layoutKey)){layoutKey=key.toString();float low=dp(1),high=dp(96);for(int i=0;i<12;i++){float middle=(low+high)/2;float sum=0;for(float n:rowHeights(blocks,columns,width-dp(18),middle))sum+=n;if(sum<=height)low=middle;else high=middle;}previewFont=Math.max(dp(1),(float)Math.floor(low/density*2)*density/2);previewHeights=rowHeights(blocks,columns,width-dp(18),previewFont);float total=0;for(float h:previewHeights)total+=h;for(int i=0;i<previewHeights.length;i++)previewHeights[i]=Math.max(1,height*previewHeights[i]/Math.max(1,total));}
        float font=(float)(previewFont*number("previewScale",100)/100),y=area.top+dp(6);for(int row=0;row<rowCount;row++){float h=previewHeights[row];for(int col=0;col<columns;col++){int i=row*columns+col;if(i>=blocks.size())break;JSONObject block=blocks.get(i);RectF box=new RectF(area.left+dp(6)+col*(width+dp(8)),y,area.left+dp(6)+col*(width+dp(8))+width,y+h);c.save();c.clipRect(box);float lineY=box.top+dp(6);String heading=heading(block);if(!heading.isEmpty()){float hh=measureHeight(heading,box.width()-dp(12),font);drawText(c,heading,new RectF(box.left+dp(6),lineY,box.right-dp(6),lineY+hh),font,rgb(block.optLong("nameColor",0x69ed91)),true,Layout.Alignment.ALIGN_NORMAL,2);lineY+=hh+dp(6);paint.setColor(rgb(block.optLong("color")));c.drawRect(box.left+dp(6),lineY,box.right-dp(6),lineY+dp(2),paint);lineY+=dp(8);}
            for(JSONObject item:RemoteModel.list(RemoteModel.array(block,"rows"))){String value=rowText(item);float hh=measureHeight(value,box.width()-dp(18),font)+dp(4);RectF line=new RectF(box.left+dp(6),lineY,box.right-dp(6),lineY+hh);boolean active=item.optBoolean("playing"),queue=item.optBoolean("queued"),played=item.optBoolean("liveExecuted");if(active||queue){paint.setColor(active?0xff701818:0xff665000);c.drawRect(line,paint);}text.setStrikeThruText(played);text.setUnderlineText(flag("previewUnderlineEnabled","",true));drawText(c,value,new RectF(line.left+dp(3),line.top,line.right-dp(3),line.bottom-dp(4)),font,played?0xffff4040:active||queue?TEXT:rgb(item.optLong("color",0xffffff)),true,Layout.Alignment.ALIGN_NORMAL,2);text.setStrikeThruText(false);text.setUnderlineText(false);if(active||queue){paint.setColor(active?0xffff4040:0xffffdf40);c.drawRect(line.left,line.bottom-dp(3),line.left+line.width()*(float)Math.max(0,Math.min(1,item.optDouble("playbackProgress"))),line.bottom,paint);}lineY+=hh+dp(4);}
            c.restore();RectF border=inset(box,dp(.6f));stroke(c,border,rgb(block.optLong("color")),1);}
            y+=h+dp(8);
        }
    }
    float[] rowHeights(List<JSONObject> blocks,int columns,float width,float font){float[] heights=new float[(blocks.size()+columns-1)/columns];Arrays.fill(heights,dp(16));for(int i=0;i<blocks.size();i++){JSONObject b=blocks.get(i);String h=heading(b);float needed=(h.isEmpty()?0:measureHeight(h,width,font)+dp(14))+dp(16);for(JSONObject row:RemoteModel.list(RemoteModel.array(b,"rows")))needed+=measureHeight(rowText(row),width,font)+dp(8);heights[i/columns]=Math.max(heights[i/columns],needed);}return heights;}
    String heading(JSONObject block){String name=display(block.optString("name"));double duration=0;for(JSONObject row:RemoteModel.list(RemoteModel.array(block,"rows")))duration+=row.optDouble("duration");return name.isEmpty()?"":name+(flag("previewBlockDurationEnabled","",true)?" • "+RemoteModel.time(Math.ceil(duration)):"");}
    String rowText(JSONObject row){return display(row.optString("name"))+(flag("previewSongDurationEnabled","",true)?" • "+RemoteModel.time(Math.ceil(row.optDouble("duration"))):"");}
    String display(String value){String mode=string("textCase","","uppercase");return mode.equals("uppercase")?value.toUpperCase(Locale.getDefault()):mode.equals("lowercase")?value.toLowerCase(Locale.getDefault()):value;}
    float textWidth(String value,float size){text.setTypeface(fontFace);text.setTextSize(size);return text.measureText(value);}
    float fit(String value,float width,float height,float max){return Math.max(dp(1),Math.min(max,Math.min(max*Math.max(1,(float)Math.floor(width)-2)/Math.max(1,textWidth(value,max)),height*.8f)));}
    float measureHeight(String value,float width,float font){text.setTypeface(fontFace);text.setTextSize(font);StaticLayout layout=StaticLayout.Builder.obtain(value,0,value.length(),text,Math.max(1,(int)width)).setIncludePad(false).build();return (float)Math.ceil(Math.min(layout.getHeight(),font*2.4))+dp(2);}
    void drawText(Canvas c,CharSequence value,RectF area,float size,int color,boolean strong,Layout.Alignment align,int maxLines){if(value.length()==0||area.width()<1||area.height()<1)return;text.setTypeface(strong?fontFace:regular);text.setTextSize(size);text.setColor(color);StaticLayout.Builder builder=StaticLayout.Builder.obtain(value,0,value.length(),text,Math.max(1,(int)area.width())).setAlignment(align).setIncludePad(false);if(maxLines>0)builder.setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END);StaticLayout layout=builder.build();c.save();c.clipRect(area);c.translate(area.left,area.top+Math.max(0,(area.height()-layout.getHeight())/2));layout.draw(c);c.restore();}
    RectF inset(RectF r,float n){RectF copy=new RectF(r);copy.inset(n,n);return copy;}
    void stroke(Canvas c,RectF r,int color,float size){paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(size));paint.setColor(color);c.drawRoundRect(r,dp(6),dp(6),paint);paint.setStyle(Paint.Style.FILL);}
    void windowBorder(Canvas c,float outer){if(flag("windowBorderEnabled","windowBorder",true))stroke(c,new RectF(dp(1),dp(1),getWidth()-dp(1),getHeight()-dp(1)),border("borderColor","borderColor",0x00ff55,"rgbWindowBorderEnabled"),2);}
    boolean flag(String key,String old,boolean fallback){return settings!=null?settings.optBoolean(key,style.optBoolean(old,fallback)):style.optBoolean(old,fallback);}
    int color(String key,String old,int fallback){return rgb(settings!=null?settings.optLong(key,style.optLong(old,fallback)):style.optLong(old,fallback));}
    double number(String key,double fallback){return settings!=null?settings.optDouble(key,style.optDouble(key,fallback)):style.optDouble(key,fallback);}
    String string(String key,String old,String fallback){return settings!=null?settings.optString(key,style.optString(old,fallback)):style.optString(old,fallback);}
    @Override public boolean onTouchEvent(MotionEvent e){return gestures.onTouchEvent(e);}
}
