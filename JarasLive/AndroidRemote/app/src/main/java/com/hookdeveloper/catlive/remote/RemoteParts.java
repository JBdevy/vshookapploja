package com.hookdeveloper.catlive.remote;

import android.graphics.*;
import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Button;
import org.json.*;
import java.util.*;
import java.util.function.Consumer;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** The same two section banks and controls as the current iOS Parts view. */
final class RemoteParts extends LinearLayout {
    final MainActivity app;
    final Consumer<String> select;
    final Button cancel;
    final Tab currentTab,queuedTab;
    final LinearLayout list;
    final List<SectionRow> sections=new ArrayList<>();
    boolean secondary;
    JSONObject region,playback;
    String signature="",queueKey="";
    double position,end,playbackPosition,trigger=Double.NaN,queueStart;
    boolean showsPosition,running,playbackRunning;
    String queued="",active="";

    RemoteParts(MainActivity app){this(app,id->app.remote.action("queueSection",id,0),()->app.remote.action("cancelSection"));}
    RemoteParts(MainActivity app,Consumer<String> select,Runnable cancelAction){
        super(app);this.app=app;this.select=select;setOrientation(VERTICAL);setBackground(RemoteWidgets.panel(0));
        cancel=new Button(app,"Cancel",cancelAction);cancel.setTextSize(12);cancel.solid(0xffffd600);
        cancel.setContentDescription("Cancelar trecho engatilhado");LayoutParams lp=new LayoutParams(-1,dp(28));lp.setMargins(dp(4),dp(4),dp(4),dp(4));addView(cancel,lp);
        LinearLayout tabs=row(app);pad(tabs,4,4);currentTab=new Tab(false);queuedTab=new Tab(true);
        tabs.addView(currentTab,new LayoutParams(0,dp(42),1));lp=new LayoutParams(0,dp(42),1);lp.leftMargin=dp(3);tabs.addView(queuedTab,lp);addView(tabs);
        ScrollView scroll=new ScrollView(app);scroll.setVerticalScrollBarEnabled(false);list=column(app);pad(list,5,5);scroll.addView(list);addView(scroll,new LayoutParams(-1,0,1));refresh();
    }
    JSONObject bank(boolean second){
        String id=RemoteModel.id(playback,second?"secondaryRegion":"currentRegion");
        if(playback==null)id=RemoteModel.id(app.state,second?"queuedRegion":"currentRegion");
        return RemoteModel.find(RemoteModel.array(app.state,"timelineRegions"),id);
    }
    void refresh(){
        if(app.state==null)return;playback=app.state.optJSONObject("sectionPlayback");
        currentTab.update(bank(false));queuedTab.update(bank(true));
        queued=RemoteModel.id(playback,"queuedMarker");cancel.setEnabled(!queued.isEmpty());cancel.setAlpha(1);
        region=bank(secondary);end=region==null?0:region.optDouble("end");if(!secondary&&playback!=null)end=playback.optDouble("currentEnd",end);
        List<JSONObject> markers=new ArrayList<>();
        if(region!=null){double start=region.optDouble("start"),finish=region.optDouble("end");
            for(JSONObject marker:RemoteModel.list(RemoteModel.array(app.state,"markers")))if(marker.optBoolean("section")&&marker.optDouble("position")>=start&&marker.optDouble("position")<=finish)markers.add(marker);
        }
        markers.sort(Comparator.comparingDouble((JSONObject m)->m.optDouble("position")).thenComparing(m->RemoteModel.id(m,"id"),String.CASE_INSENSITIVE_ORDER));
        StringBuilder next=new StringBuilder(secondary+"|"+RemoteModel.id(region,"id"));
        if(region!=null)next.append('|').append(region.optDouble("start"));
        for(JSONObject marker:markers)next.append('|').append(RemoteModel.id(marker,"id")).append('|').append(marker.optString("name")).append('|').append(marker.optDouble("position"));
        if(!signature.equals(next.toString())){
            signature=next.toString();list.removeAllViews();sections.clear();
            if(region!=null)addSection(RemoteModel.id(region,"id"),RemoteText.ui("Section start"),region.optDouble("start"),true);
            for(JSONObject marker:markers)addSection(RemoteModel.id(marker,"id"),marker.optString("name").toUpperCase(Locale.ROOT),marker.optDouble("position"),false);
        }
        trigger=playback==null?Double.NaN:playback.optDouble("nextTrigger",Double.NaN);
        String key=queued+"|"+trigger;if(!key.equals(queueKey)){queueKey=key;queueStart=app.state.optDouble("position");}
        if(playback!=null)queueStart=playback.optDouble("queueStartedAt",queueStart);
        tick();
    }
    void addSection(String id,String name,double start,boolean first){
        SectionRow section=new SectionRow(id,name,start,first);sections.add(section);LayoutParams lp=new LayoutParams(-1,dp(38));lp.bottomMargin=dp(5);list.addView(section,lp);
    }
    void tick(){
        if(app.state==null)return;
        double elapsed=app.remote.connected?Math.min(.25,Math.max(0,(SystemClock.elapsedRealtime()-app.stateAt)/1000.0)):0;
        playbackRunning=app.state.optBoolean("playing");running=secondary?app.state.optBoolean("subPlaying"):playbackRunning;
        showsPosition=!secondary||app.state.optBoolean("subPlaying");
        position=playback==null?app.state.optDouble("position"):playback.optDouble(secondary?"secondaryPosition":"position",secondary?0:app.state.optDouble("position"));
        if(running)position+=elapsed;
        playbackPosition=app.state.optDouble("position")+(playbackRunning?elapsed:0);
        active="";if(showsPosition&&position<end)for(SectionRow section:sections)if(section.start<=position)active=section.id;
        for(SectionRow section:sections){section.update();section.invalidate();}
    }
    final class Tab extends LinearLayout {
        final boolean second;final TextView title,name;
        Tab(boolean second){super(app);this.second=second;setOrientation(VERTICAL);pad(this,4,4);setClickable(true);setFocusable(true);
            title=label(app,"",13,SECONDARY);title.setTypeface(bold);title.setGravity(Gravity.CENTER);title.setSingleLine();addView(title,new LayoutParams(-1,-1));
            name=label(app,"—",12,TEXT);name.setTypeface(bold);name.setGravity(Gravity.CENTER);name.setMaxLines(3);name.setAutoSizeTextTypeUniformWithConfiguration(6,12,1,android.util.TypedValue.COMPLEX_UNIT_SP);LayoutParams lp=new LayoutParams(-1,0,1);lp.topMargin=dp(3);name.setVisibility(GONE);addView(name,lp);
            setOnClickListener(v->{secondary=second;refresh();});
        }
        void update(JSONObject region){boolean selected=secondary==second;title.setText(RemoteText.ui(second?"Queued":app.state.optBoolean("playing")?"Now playing":"Selected song"));name.setText(region==null?"—":region.optString("name"));
            title.setTextColor(selected?TEXT:SECONDARY);name.setTextColor(selected?TEXT:SECONDARY);setBackground(selected?surface(blend(0xff171717,second?0xffff9500:GREEN,.55f),blend(0xff171717,second?0xffff9500:GREEN,.48f),0x2affffff,5):display(5));setSelected(selected);setContentDescription(title.getText());}
    }
    final class SectionRow extends FrameLayout {
        final String id,name;final double start;final boolean first;final TextView title;final Paint paint=new Paint(3);boolean armed,playing;
        SectionRow(String id,String name,double start,boolean first){super(app);this.id=id;this.name=name;this.start=start;this.first=first;setWillNotDraw(false);setClickable(true);setFocusable(true);setContentDescription(name);
            title=label(app,name,first?16:12,TEXT);title.setTypeface(bold);title.setGravity(Gravity.CENTER);title.setMaxLines(2);title.setAutoSizeTextTypeUniformWithConfiguration(first?9:6,first?16:12,1,android.util.TypedValue.COMPLEX_UNIT_SP);pad(title,3,0);addView(title,new FrameLayout.LayoutParams(-1,-1));setOnClickListener(v->select.accept(id));}
        void update(){armed=RemoteModel.same(id,queued);playing=RemoteModel.same(id,active);title.setText((armed?"↰ ":"")+name);setSelected(armed||(queued.isEmpty()&&playing));}
        double fraction(){
            if(armed&&Double.isFinite(trigger))return Math.max(0,Math.min(1,(trigger-playbackPosition)/Math.max(.001,trigger-queueStart)));
            if(playing&&running){double finish=end;for(SectionRow next:sections)if(next.start>start){finish=Math.min(finish,next.start);break;}return Math.max(0,Math.min(1,(position-start)/Math.max(.001,finish-start)));}
            return -1;
        }
        @Override protected void onDraw(Canvas canvas){float w=getWidth(),h=getHeight();boolean selected=isSelected();int color=selected?blend(0xff171717,GREEN,.35f):first?blend(0xff171717,0xff007aff,.4f):0xff171717;
            paint.setStyle(Paint.Style.FILL);paint.setColor(color);canvas.drawRoundRect(0,0,w,h,dp(5),dp(5),paint);
            double fraction=fraction();if(fraction>=0){paint.setColor(armed?YELLOW:GREEN);canvas.save();Path clip=new Path();clip.addRoundRect(new RectF(0,0,w,h),dp(5),dp(5),Path.Direction.CW);canvas.clipPath(clip);canvas.drawRect(0,h-dp(5),(float)(w*fraction),h,paint);canvas.restore();}
            paint.setStyle(Paint.Style.STROKE);float stroke=dp(selected||first?1.5f:.5f);paint.setStrokeWidth(stroke);paint.setColor(selected?GREEN:first?BLUE:0x2affffff);canvas.drawRoundRect(stroke/2,stroke/2,w-stroke/2,h-stroke/2,dp(5),dp(5),paint);paint.setStyle(Paint.Style.FILL);
        }
    }
}
