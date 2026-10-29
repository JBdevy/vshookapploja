package com.hookdeveloper.catlive.remote;

import android.content.*;
import android.app.Dialog;
import android.graphics.*;
import android.graphics.drawable.ColorDrawable;
import android.view.*;
import android.widget.*;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Button;
import org.json.*;
import java.util.*;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;
import static com.hookdeveloper.catlive.remote.RemoteTimeline.*;

final class RemoteGrid extends View {
    final MainActivity app;final Paint paint=new Paint(3);final DashPathEffect gridDots;final GestureDetector gesture;final ScaleGestureDetector scale;
    float vertical=0;double zoom=1,offset=0;String regionID="";JSONObject region;float left=0;boolean dragging=false;
    boolean needleDragging=false;double needleCandidate=Double.NaN,needlePreview=Double.NaN;long needlePreviewUntil=0;String needleRegion="";
    final List<Hit> hits=new ArrayList<>();final RemoteItemDrawing items=new RemoteItemDrawing();String pressedMute="";
    String editingClip="";TextView itemName,itemDecibels;Fader itemFader;Button itemMute;
    static final class Hit {final RectF rect,mute;final JSONObject clip;Hit(RectF r,RectF m,JSONObject c){rect=r;mute=m;clip=c;}}
    RemoteGrid(Context c,MainActivity app){super(c);this.app=app;gridDots=new DashPathEffect(new float[]{density,3*density},0);setContentDescription("Grid de itens");setFocusable(true);
        scale=new ScaleGestureDetector(c,new ScaleGestureDetector.SimpleOnScaleGestureListener(){public boolean onScale(ScaleGestureDetector detector){double before=seconds(detector.getFocusX());zoom=Math.max(1,Math.min(128,zoom*detector.getScaleFactor()));offset=before-start()-detector.getFocusX()/pixelsPerSecond();clamp();invalidate();return true;}});
        gesture=new GestureDetector(c,new GestureDetector.SimpleOnGestureListener(){
            public boolean onDown(MotionEvent e){pressedMute="";for(Hit h:hits)if(h.mute.contains(e.getX(),e.getY())&&e.getY()>=dp(HEADER_HEIGHT)){pressedMute=RemoteModel.id(h.clip,"id");break;}return true;}
            public boolean onScroll(MotionEvent a,MotionEvent b,float dx,float dy){pressedMute="";if(scale.isInProgress())return true;offset+=dx/pixelsPerSecond();vertical=Math.max(0,vertical+dy);if(app.mixerScroll!=null&&tablet)app.mixerScroll.scrollTo(0,(int)vertical);clamp();invalidate();return true;}
            public boolean onSingleTapUp(MotionEvent e){if(toggleItemMute(e))return true;if(canMoveNeedle()){needleRegion=seekTarget();needlePreview=seekSeconds(e.getX());needlePreviewUntil=android.os.SystemClock.uptimeMillis()+2000;app.remote.action("seek",needleRegion,needlePreview);invalidate();performClick();}return true;}
            public void onLongPress(MotionEvent e){if(!app.remote.mode.equals("director"))return;for(Hit h:hits)if(h.rect.contains(e.getX(),e.getY())){item(h.clip);return;}}
            public boolean onDoubleTap(MotionEvent e){if(toggleItemMute(e))return true;if(e.getY()<dp(HEADER_HEIGHT)){zoom=1;offset=0;invalidate();}return true;}
        });
    }
    boolean toggleItemMute(MotionEvent e){
        if(!app.remote.mode.equals("director")||pressedMute.isEmpty())return false;
        for(Hit h:hits)if(RemoteModel.same(RemoteModel.id(h.clip,"id"),pressedMute)&&h.mute.contains(e.getX(),e.getY())&&e.getY()>=dp(HEADER_HEIGHT)){
            app.remote.action("clipMute",pressedMute,0);performClick();return true;
        }
        return false;
    }
    double start(){return region==null?0:region.optDouble("start");}
    double duration(){return Math.max(1,region==null?app.state.optDouble("duration",60):region.optDouble("end")-start());}
    double pixelsPerSecond(){return Math.max(1,getWidth())/duration()*zoom;}
    double seconds(float x){return Math.max(start(),Math.min(start()+duration(),start()+offset+x/pixelsPerSecond()));}
    float x(double seconds){return (float)((seconds-start()-offset)*pixelsPerSecond());}
    void clamp(){offset=Math.max(0,Math.min(duration()-duration()/zoom,offset));}
    @Override protected void onDraw(Canvas canvas){
        JSONObject s=app.state;if(s==null)return;region=app.visibleRegion;String id=RemoteModel.id(region,"id");if(!id.equals(regionID)){regionID=id;zoom=1;offset=0;cancelNeedle();}
        if(s.optBoolean("playing")||!app.remote.connected)cancelNeedle();
        if(!needleDragging&&Double.isFinite(needlePreview)&&(android.os.SystemClock.uptimeMillis()>needlePreviewUntil||Math.abs(s.optDouble("editPosition",s.optDouble("position"))-needlePreview)<.001))needlePreview=Double.NaN;
        canvas.drawColor(rgb(s.optLong("gridBackgroundColor",0x161616)));hits.clear();float width=getWidth(),height=getHeight();
        android.graphics.drawable.GradientDrawable header=panel(0);header.setBounds(0,0,(int)width,dp(HEADER_HEIGHT));header.draw(canvas);
        paint.setColor(region==null?0xff282828:rgb(region.optLong("color",0x705264)));canvas.drawRect(0,0,width,dp(REGION_HEIGHT),paint);
        paint.setTypeface(bold);paint.setTextSize(9*density);paint.setColor(region==null?SECONDARY:rgb(region.optLong("nameColor",0xffffff)));
        String name=region==null?"":region.optString("name");canvas.save();canvas.clipRect(dp(4),0,width-dp(4),dp(REGION_HEIGHT));canvas.drawText(name,dp(4),dp(REGION_HEIGHT)/2f-(paint.ascent()+paint.descent())/2,paint);canvas.restore();
        for(Tick tick:ticks(sections(s,start()+duration()),start()+offset,start()+offset+duration()/zoom,pixelsPerSecond()/density,s.optInt("gridDivisions",4))){
            float at=x(tick.time);paint.setStrokeWidth(1);
            if(s.optBoolean("gridLines",true)){paint.setColor(rgb(s.optLong(tick.primary?"gridPrimaryColor":"gridSecondaryColor",tick.primary?0x3c3c3c:0x282828)));paint.setStrokeWidth(.75f);paint.setPathEffect(gridDots);canvas.drawLine(at,dp(HEADER_HEIGHT),at,height,paint);paint.setPathEffect(null);paint.setStrokeWidth(1);}
            paint.setColor(0xff54ff93);canvas.drawLine(at,dp(RULER_TOP+1),at,dp(RULER_TOP+(tick.primary?7:4)),paint);
            if(!tick.label.isEmpty()){paint.setTextSize(9*density);paint.setTypeface(Typeface.MONOSPACE);canvas.save();canvas.clipRect(0,dp(RULER_TOP),width,dp(HEADER_HEIGHT));canvas.drawText(tick.label,at+dp(3),dp(RULER_TOP+2)-paint.ascent(),paint);canvas.restore();}
        }
        float y=dp(HEADER_HEIGHT)-vertical;
        for(RemoteModel.TrackLayout layout:app.layout.ordered){
            JSONObject track=layout.track;List<JSONObject> clips=layout.clips;Map<String,Integer> lanes=layout.lanes;
            float row=dp((float)layout.height),laneH=row/layout.count;if(y+row<dp(HEADER_HEIGHT)){y+=row;continue;}if(y>height)break;
            canvas.save();canvas.clipRect(0,dp(HEADER_HEIGHT),width,height);paint.setColor(0xff3e3e3e);canvas.drawLine(0,y+row,width,y+row,paint);
            for(JSONObject clip:clips){
                double clipStart=clip.optDouble("start"),clipDuration=clip.optDouble("duration"),visibleStart=Math.max(start()+offset,clipStart),visibleEnd=Math.min(start()+offset+duration()/zoom,clipStart+clipDuration);
                if(clipDuration<=0||visibleEnd<=visibleStart)continue;
                int lane=lanes.get(RemoteModel.id(clip,"id"));float top=y+lane*laneH+dp(3);
                RectF box=new RectF(x(visibleStart)+dp(1),top,x(visibleEnd)-dp(1),top+laneH-dp(5));if(box.width()<=0)continue;
                items.draw(canvas,box,track,clip,(visibleStart-clipStart)/clipDuration,(visibleEnd-visibleStart)/clipDuration);
                hits.add(new Hit(box,items.muteRect(box),clip));
            }
            canvas.restore();y+=row;
        }
        markers(canvas,s,width,height);
        paint.setColor(0xff444444);paint.setStrokeWidth(dp(1));for(int edge:new int[]{0,REGION_HEIGHT,RULER_TOP,HEADER_HEIGHT})canvas.drawLine(0,dp(edge)+(edge==HEADER_HEIGHT?-.5f:.5f)*density,width,dp(edge)+(edge==HEADER_HEIGHT?-.5f:.5f)*density,paint);
        double pos=app.displayPosition();if(s.optBoolean("playing")&&zoom>1){float cursor=x(pos);if(cursor>width*.9f||cursor<0){offset=pos-start()-duration()/zoom*.2;clamp();}}
        if(s.optBoolean("loop")&&!s.isNull("loopStart")&&!s.isNull("loopEnd"))loopArea(canvas,x(s.optDouble("loopStart")),x(s.optDouble("loopEnd")),height);
        cursor(canvas,Double.isFinite(needlePreview)?needlePreview:s.optDouble("editPosition",pos),rgb(s.optLong("editCursorColor",0x69ed91)),height,RULER_TOP);
        if(s.optBoolean("playing"))cursor(canvas,pos,rgb(s.optLong("playCursorColor",0x69ed91)),height,HEADER_HEIGHT);
        if(s.optBoolean("subPlaying"))cursor(canvas,s.optDouble("subPlayPosition"),rgb(s.optLong("subPlayCursorColor",0xffdc52)),height,HEADER_HEIGHT);
    }
    void markers(Canvas canvas,JSONObject s,float width,float height){
        List<JSONObject> markers=new ArrayList<>();for(JSONObject marker:RemoteModel.list(RemoteModel.array(s,"markers")))if(!RemoteModel.gridTempoMarker(s,marker)&&marker.optDouble("position")>=start()&&marker.optDouble("position")<=start()+duration())markers.add(marker);
        markers.sort(Comparator.comparingDouble(m->m.optDouble("position")));
        paint.setTextSize(9*density);paint.setTypeface(bold);
        for(int i=0;i<markers.size();i++){
            JSONObject marker=markers.get(i);double time=marker.optDouble("position");float at=x(time);
            boolean section=marker.optBoolean("section"),song=!RemoteModel.id(marker,"sourceRegionID").isEmpty()||!RemoteModel.id(marker,"unifiedRegionID").isEmpty();
            int color=rgb(marker.optLong("color",0xffdc52));paint.setColor(color);paint.setAlpha(song?255:115);paint.setStrokeWidth(dp(1));canvas.drawLine(at,dp(RULER_TOP),at,height,paint);paint.setAlpha(255);
            double next=i+1<markers.size()?markers.get(i+1).optDouble("position"):Double.POSITIVE_INFINITY;
            float flag=(float)flagWidth(paint.measureText(marker.optString("name"))/density,time,next,start()+duration(),pixelsPerSecond()/density)*density;
            if(flag<=0||at+flag<0||at>width)continue;
            RectF box=new RectF(at,dp(REGION_HEIGHT+1),at+flag,dp(RULER_TOP-1));
            canvas.save();canvas.clipRect(0,dp(REGION_HEIGHT),width,dp(RULER_TOP));paint.setColor(color);
            if(section){Path shape=new Path();float tip=Math.min(dp(7),flag/2);shape.moveTo(box.left,box.centerY());shape.lineTo(box.left+tip,box.top);shape.lineTo(box.right,box.top);shape.lineTo(box.right,box.bottom);shape.lineTo(box.left+tip,box.bottom);shape.close();canvas.drawPath(shape,paint);}
            else if(song){RectF rounded=new RectF(box);rounded.inset(.6f*density,.6f*density);canvas.drawRoundRect(rounded,dp(3),dp(3),paint);paint.setStyle(Paint.Style.STROKE);paint.setColor(YELLOW);paint.setStrokeWidth(1.2f*density);canvas.drawRoundRect(rounded,dp(3),dp(3),paint);paint.setStyle(Paint.Style.FILL);}
            else canvas.drawRect(box,paint);
            float inset=dp(section?7:3);canvas.clipRect(box.left+inset,box.top,box.right-inset,box.bottom);paint.setColor(Color.BLACK);canvas.drawText(marker.optString("name"),box.left+inset,box.centerY()-(paint.ascent()+paint.descent())/2,paint);canvas.restore();
        }
    }
    void loopArea(Canvas canvas,float a,float b,float height){
        if(!Float.isFinite(a)||!Float.isFinite(b)||b<=a)return;float top=dp(RULER_TOP),head=Math.min(12*density,(b-a)/2);
        paint.setColor(0x1fffffff);canvas.drawRect(a,top,b,height,paint);
        Path outline=new Path();outline.moveTo(a,top);outline.lineTo(a,height);outline.moveTo(b,top);outline.lineTo(b,height);
        outline.moveTo(a,top+10*density);outline.lineTo(b,top+10*density);
        outline.moveTo(a,top);outline.lineTo(a+head,top);outline.lineTo(a,top+12*density);outline.close();
        outline.moveTo(b,top);outline.lineTo(b-head,top);outline.lineTo(b,top+12*density);outline.close();
        paint.setColor(YELLOW);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);canvas.drawPath(outline,paint);paint.setStyle(Paint.Style.FILL);
    }
    void cursor(Canvas c,double time,int color,float h,int top){
        float at=x(time);if(!Float.isFinite(at)||at<0||at>getWidth())return;
        boolean glowing=top==HEADER_HEIGHT;float line=(glowing?3:2)*density,y=dp(top);at=Math.max(0,Math.min(getWidth()-line,at));
        if(glowing){float trail=Math.min(at,38*density);if(trail>0){paint.setColor(Color.WHITE);paint.setShader(new LinearGradient(at-trail,0,at,0,new int[]{RemoteItemDrawing.alpha(color,0),RemoteItemDrawing.alpha(color,.16f),RemoteItemDrawing.alpha(color,.65f)},new float[]{0,.5f,1},Shader.TileMode.CLAMP));c.drawRect(at-trail,y,at,h,paint);paint.setShader(null);}}
        paint.setColor(RemoteItemDrawing.alpha(color,glowing?.18f:.08f));c.drawRect(at-2*density,y,at+line+2*density,h,paint);
        paint.setColor(color);c.drawRect(at,y,at+line,h,paint);
        if(glowing){paint.setColor(0xccffffff);c.drawRect(at+density,y,at+2*density,h,paint);}
        paint.setColor(color);Path head=new Path();float center=at+line/2;head.moveTo(center-7*density,y);head.lineTo(center+7*density,y);head.lineTo(center,y+9*density);head.close();c.drawPath(head,paint);
    }
    void cancelNeedle(){needleDragging=false;needleCandidate=Double.NaN;needlePreview=Double.NaN;if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);}
    String seekTarget(){String target=RemoteModel.id(app.state,"focusedRegion");if(target.isEmpty())target=RemoteModel.id(app.state,"currentRegion");return RemoteModel.region(app.state,target)!=null?target:RemoteModel.id(region,"id");}
    double seekSeconds(float x){JSONObject target=RemoteModel.region(app.state,seekTarget());return target==null?seconds(x):Math.max(target.optDouble("start"),Math.min(target.optDouble("end"),seconds(x)));}
    boolean canMoveNeedle(){return app.state!=null&&app.remote.connected&&app.remote.mode.equals("director")&&!app.state.optBoolean("playing")&&region!=null;}
    @Override public boolean onTouchEvent(MotionEvent e){
        scale.onTouchEvent(e);int action=e.getActionMasked();
        if(e.getPointerCount()>1){cancelNeedle();gesture.onTouchEvent(e);return true;}
        if(action==MotionEvent.ACTION_DOWN&&canMoveNeedle()){
            double current=Double.isFinite(needlePreview)?needlePreview:app.state.optDouble("editPosition",app.displayPosition());
            boolean ruler=e.getY()>=dp(RULER_TOP)&&e.getY()<dp(HEADER_HEIGHT);
            boolean head=e.getY()>=dp(RULER_TOP-4)&&e.getY()<=dp(RULER_TOP+16)&&Math.abs(e.getX()-x(current))<=dp(18);
            if(ruler||head){
                MotionEvent cancel=MotionEvent.obtain(e);cancel.setAction(MotionEvent.ACTION_CANCEL);gesture.onTouchEvent(cancel);cancel.recycle();
                needleDragging=true;needleRegion=seekTarget();needleCandidate=seekSeconds(e.getX());
                if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);invalidate();return true;
            }
        }
        if(needleDragging){
            if(action==MotionEvent.ACTION_CANCEL||!canMoveNeedle()||!needleRegion.equals(seekTarget())){cancelNeedle();invalidate();return true;}
            needleCandidate=seekSeconds(e.getX());
            if(action==MotionEvent.ACTION_UP){
                needlePreview=needleCandidate;needleCandidate=Double.NaN;needleDragging=false;needlePreviewUntil=android.os.SystemClock.uptimeMillis()+2000;
                if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);
                app.remote.action("seek",needleRegion,needlePreview);performClick();
            }
            invalidate();return true;
        }
        gesture.onTouchEvent(e);return true;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    @Override public boolean onGenericMotionEvent(MotionEvent e){if(e.getAction()==MotionEvent.ACTION_SCROLL){if((e.getMetaState() & KeyEvent.META_SHIFT_ON)!=0){offset-=e.getAxisValue(MotionEvent.AXIS_VSCROLL)*dp(28)/pixelsPerSecond();}else{zoom=Math.max(1,Math.min(128,zoom*Math.pow(1.12,e.getAxisValue(MotionEvent.AXIS_VSCROLL))));}clamp();invalidate();return true;}return super.onGenericMotionEvent(e);}
    void item(JSONObject clip){
        app.closeDialog();editingClip=RemoteModel.id(clip,"id");Dialog dialog=new Dialog(getContext());app.activeDialog=dialog;dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout body=column(getContext());pad(body,14,14);body.setBackground(panel(0));LinearLayout header=row(getContext());
        int color=YELLOW;for(JSONObject track:RemoteModel.list(RemoteModel.array(app.state,"tracks")))if(RemoteModel.find(RemoteModel.array(track,"clips"),editingClip)!=null){color=rgb(track.optLong("color",0xffdc52));break;}
        View stripe=new View(getContext());stripe.setBackground(surface(color,color,Color.TRANSPARENT,2));header.addView(stripe,new LinearLayout.LayoutParams(dp(3),dp(32)));
        LinearLayout names=column(getContext());TextView title=label(getContext(),"Volume do item",10,SECONDARY);names.addView(title);app.space(names,3);itemName=label(getContext(),clip.optString("name"),13,TEXT);itemName.setTypeface(bold);itemName.setMaxLines(2);itemName.setEllipsize(android.text.TextUtils.TruncateAt.END);names.addView(itemName);LinearLayout.LayoutParams namesLp=new LinearLayout.LayoutParams(0,-2,1);namesLp.setMargins(dp(9),0,dp(4),0);header.addView(names,namesLp);
        Button close=new Button(getContext(),"×",dialog::dismiss);close.setTextSize(20);close.setTextColor(SECONDARY);close.setContentDescription("Fechar");close.setPadding(0,0,0,0);close.setMinHeight(0);close.setBackground(display(5));header.addView(close,new LinearLayout.LayoutParams(dp(28),dp(28)));body.addView(header);app.space(body,14);
        LinearLayout controls=row(getContext());itemDecibels=label(getContext(),"",11,GREEN);itemDecibels.setTypeface(Typeface.MONOSPACE,Typeface.BOLD);itemDecibels.setGravity(Gravity.CENTER);itemDecibels.setBackground(display(5));controls.addView(itemDecibels,new LinearLayout.LayoutParams(dp(67),dp(34)));
        itemFader=new Fader(getContext(),false,gain->{itemDecibels.setText(gainText(gain));app.remote.action("clipGain",editingClip,gain);});itemFader.maximumDB=24;itemFader.readout=false;itemFader.setContentDescription("Volume do item "+clip.optString("name"));LinearLayout.LayoutParams sliderLp=new LinearLayout.LayoutParams(0,dp(36),1);sliderLp.setMargins(dp(10),0,dp(10),0);controls.addView(itemFader,sliderLp);
        itemMute=new Button(getContext(),"M",()->app.remote.action("clipMute",editingClip,0));itemMute.setContentDescription("Mute do item "+clip.optString("name"));controls.addView(itemMute,new LinearLayout.LayoutParams(dp(38),dp(34)));body.addView(controls);
        dialog.setContentView(body);dialog.setOnDismissListener(v->{editingClip="";itemFader=null;if(app.activeDialog==dialog)app.activeDialog=null;});dialog.show();Window window=dialog.getWindow();window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));window.setDimAmount(.65f);window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window.setLayout(Math.min(dp(330),getResources().getDisplayMetrics().widthPixels-dp(32)),WindowManager.LayoutParams.WRAP_CONTENT);refreshItemEditor();
    }
    static String gainText(double gain){return gain<=0?"−∞ dB":String.format(Locale.US,"%+.1f dB",20*Math.log10(gain));}
    void refreshItemEditor(){
        if(itemFader==null||editingClip.isEmpty())return;
        for(JSONObject track:RemoteModel.list(RemoteModel.array(app.state,"tracks"))){JSONObject clip=RemoteModel.find(RemoteModel.array(track,"clips"),editingClip);if(clip==null)continue;itemName.setText(clip.optString("name"));double gain=clip.optDouble("gain",1);itemFader.update(gain);if(!itemFader.dragging)itemDecibels.setText(gainText(gain));itemMute.style(TEXT,false);if(clip.optBoolean("muted")){itemMute.setBackground(surface(0xffd52d2d,0xffab2424,RED,5));}return;}
        app.closeDialog();
    }
}
