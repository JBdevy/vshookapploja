package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** Host-owned samples; this screen sends controls, never streams or plays audio. */
final class RemoteVinhetas extends LinearLayout {
    static final class GatePrediction {
        boolean baseline;final List<Boolean> awaiting=new ArrayList<>();long expires;
        GatePrediction(boolean baseline){this.baseline=baseline;}
        boolean value(){return awaiting.get(awaiting.size()-1);}
        boolean receive(boolean host){if(host!=baseline){baseline=host;int at=awaiting.indexOf(host);if(at>=0)awaiting.subList(0,at+1).clear();}return awaiting.isEmpty();}
    }
    static final class GainPrediction {final double value;final long until;GainPrediction(double value,long until){this.value=value;this.until=until;}}
    static final class PadFeedback {
        final Map<Integer,GainPrediction> gains=new HashMap<>();
        final Map<Integer,String> pending=new HashMap<>();
        final Map<Integer,GatePrediction> gates=new HashMap<>();
        final Set<Integer> litBanks=new HashSet<>(),confirmed=new HashSet<>(),held=new HashSet<>();
    }
    static void receiveFeedback(MainActivity activity){
        JSONObject state=activity.state==null?null:activity.state.optJSONObject("vinhetas");if(state==null)return;
        Set<String> received=new HashSet<>();JSONArray ids=RemoteModel.array(state,"receivedPresses");for(int n=0;n<ids.length();n++)received.add(ids.optString(n).toLowerCase(Locale.ROOT));
        for(Map.Entry<Integer,PadFeedback> entry:activity.vinhetasFeedback.entrySet()){
            PadFeedback feedback=entry.getValue();
            for(Integer bank:new ArrayList<>(feedback.gates.keySet())){
                GatePrediction gate=feedback.gates.get(bank);
                JSONObject preset=RemoteModel.array(state,"presets").optJSONObject(bank),pad=RemoteModel.array(preset,"pads").optJSONObject(entry.getKey());
                if(SystemClock.elapsedRealtime()>=gate.expires||gate.receive(pad!=null&&pad.optBoolean("gate")))feedback.gates.remove(bank);
            }
            for(Integer bank:new ArrayList<>(feedback.pending.keySet())){
                if(received.contains(feedback.pending.get(bank)))feedback.confirmed.add(bank);
                JSONObject preset=RemoteModel.array(state,"presets").optJSONObject(bank),pad=RemoteModel.array(preset,"pads").optJSONObject(entry.getKey());
                if(feedback.confirmed.contains(bank)&&!feedback.held.contains(bank)&&(pad==null||!pad.optBoolean("active"))){feedback.pending.remove(bank);feedback.litBanks.remove(bank);feedback.confirmed.remove(bank);}
            }
        }
    }
    final MainActivity activity;
    final RemoteSession remote;
    final List<PadCell> pads=new ArrayList<>();
    final TextView[] presets=new TextView[6];
    final TextView warning;
    JSONObject state;
    int selected;
    boolean available;
    RemoteVinhetas(MainActivity activity){
        super(activity);this.activity=activity;remote=activity.remote;
        setOrientation(VERTICAL);setPadding(dp(10),dp(10),dp(10),dp(10));setBackgroundColor(0xff202020);
        LinearLayout header=row(activity);
        TextView panic=button("Panic",()->{releaseAll();for(PadCell cell:pads){cell.surface.pending.clear();cell.surface.litBanks.clear();cell.surface.feedback.confirmed.clear();cell.surface.feedback.held.clear();cell.surface.invalidate();}remote.action("vinhetasPanic");});
        panic.setBackground(flat(0xff8d2845));
        if(!activity.tabletLayout()){TextView title=label(activity,"Vinhetas",16,TEXT);title.setTypeface(bold);header.addView(title,new LayoutParams(0,dp(30),1));header.addView(panic,new LayoutParams(dp(60),dp(30)));addView(header);space(this,8);}
        for(int row=0;row<(activity.tabletLayout()?1:2);row++){
            LinearLayout bank=row(activity);
            for(int column=0;column<(activity.tabletLayout()?6:3);column++){
                int index=row*(activity.tabletLayout()?6:3)+column;
                TextView button=button("Preset "+(index+1),()->remote.action("vinhetasPreset",null,index));presets[index]=button;
                LayoutParams lp=new LayoutParams(0,dp(30),1);if(column>0)lp.leftMargin=dp(6);bank.addView(button,lp);
            }
            if(activity.tabletLayout()){LayoutParams lp=new LayoutParams(dp(60),dp(30));lp.leftMargin=dp(6);bank.addView(panic,lp);}
            addView(bank,new LayoutParams(-1,dp(30)));space(this,row==0&&!activity.tabletLayout()?6:8);
        }
        warning=label(activity,"",11,YELLOW);warning.setVisibility(GONE);addView(warning,new LayoutParams(-1,-2));
        if(activity.tabletLayout())addView(page(0,8,2),new LayoutParams(-1,0,1));
        else {PagedScroll scroll=new PagedScroll(activity);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(true);scroll.setScrollbarFadingEnabled(false);scroll.setScrollBarStyle(SCROLLBARS_INSIDE_OVERLAY);scroll.setHorizontalScrollBarEnabled(false);
            LinearLayout pages=column(activity);pages.addView(page(0,2,4),new LayoutParams(-1,1));pages.addView(page(8,2,4),new LayoutParams(-1,1));scroll.addView(pages,new ScrollView.LayoutParams(-1,-2));addView(scroll,new LayoutParams(-1,0,1));}
        refresh();
    }
    TextView button(String title,Runnable action){TextView b=label(activity,title,12,TEXT);b.setTypeface(bold);b.setGravity(Gravity.CENTER);b.setMaxLines(1);b.setEllipsize(android.text.TextUtils.TruncateAt.END);b.setPadding(dp(3),0,dp(3),0);b.setClickable(true);b.setFocusable(true);b.setOnClickListener(v->action.run());return b;}
    static void space(LinearLayout parent,int height){parent.addView(new View(parent.getContext()),new LinearLayout.LayoutParams(1,dp(height)));}
    static android.graphics.drawable.GradientDrawable flat(int color){android.graphics.drawable.GradientDrawable d=new android.graphics.drawable.GradientDrawable();d.setColor(color);d.setCornerRadius(dp(5));return d;}
    LinearLayout page(int start,int columns,int rows){LinearLayout page=column(activity);page.setPadding(0,0,dp(activity.tabletLayout()?0:6),0);
        for(int r=0;r<rows;r++){LinearLayout line=row(activity);for(int c=0;c<columns;c++){PadCell cell=new PadCell(start+r*columns+c);pads.add(cell);LayoutParams lp=new LayoutParams(0,-1,1);if(c>0)lp.leftMargin=dp(8);line.addView(cell,lp);}LayoutParams lp=new LayoutParams(-1,0,1);if(r>0)lp.topMargin=dp(8);page.addView(line,lp);}return page;}
    void refresh(){JSONObject next=activity.state==null?null:activity.state.optJSONObject("vinhetas");state=next;selected=next==null?0:Math.max(0,Math.min(5,next.optInt("selectedPreset")));available=next!=null&&next.optBoolean("available");JSONArray banks=RemoteModel.array(next,"presets");
        warning.setText(next==null?"Atualize o CatLive no computador para controlar as Vinhetas.":available?"":"Crie a pista VINHETAS-FX no computador para tocar os pads.");warning.setVisibility(next==null||!available?VISIBLE:GONE);
        for(int i=0;i<6;i++){JSONObject bank=banks.optJSONObject(i);presets[i].setText(bank==null?"Preset "+(i+1):bank.optString("name"));int color=bank==null?0xff626262:0xff000000|bank.optInt("color");presets[i].setBackground(flat(i==selected?color:blend(0xff202020,color,.45f)));presets[i].setEnabled(next!=null);}
        for(PadCell cell:pads){cell.surface.confirm();cell.refresh();}
    }
    JSONObject data(int pad){JSONObject bank=RemoteModel.array(state,"presets").optJSONObject(selected);JSONObject value=RemoteModel.array(bank,"pads").optJSONObject(pad);return value==null?new JSONObject():value;}
    boolean gateOn(int index){
        PadFeedback feedback=activity.vinhetasFeedback.get(index);GatePrediction gate=feedback==null?null:feedback.gates.get(selected);
        return gate!=null&&gate.expires>SystemClock.elapsedRealtime()?gate.value():data(index).optBoolean("gate");
    }
    void toggleGate(PadCell cell){
        if(state==null||!remote.connected||!remote.mode.equals("director"))return;
        int bank=selected;boolean desired=!gateOn(cell.index);PadFeedback feedback=cell.surface.feedback;
        GatePrediction gate=feedback.gates.get(bank);
        if(gate==null||gate.expires<=SystemClock.elapsedRealtime()){gate=new GatePrediction(data(cell.index).optBoolean("gate"));feedback.gates.put(bank,gate);}
        gate.awaiting.add(desired);gate.expires=SystemClock.elapsedRealtime()+2000;
        if(desired){cell.surface.release();feedback.litBanks.remove(bank);feedback.pending.remove(bank);feedback.confirmed.remove(bank);feedback.held.remove(bank);}
        cell.refresh(); // Commit the local appearance before sending the command.
        remote.vinhetasControl("vinhetasGate",bank,cell.index,0,desired);
        GatePrediction prediction=gate;
        activity.handler.postDelayed(()->{if(feedback.gates.get(bank)==prediction&&SystemClock.elapsedRealtime()>=prediction.expires){feedback.gates.remove(bank);if(activity.vinhetas!=null)activity.vinhetas.refresh();}},2100);
    }
    void releaseAll(){for(PadCell pad:pads)pad.surface.release();}
    @Override protected void onDetachedFromWindow(){releaseAll();super.onDetachedFromWindow();}
    final class PadCell extends LinearLayout {
        final int index;final TextView gate,db;final PadSurface surface;final Fader fader;
        PadCell(int index){super(activity);this.index=index;setOrientation(VERTICAL);LinearLayout top=row(activity);top.setGravity(Gravity.CENTER_VERTICAL);
            surface=new PadSurface(index);
            gate=button("Gate\nOff",()->toggleGate(this));gate.setMaxLines(2);gate.setTextSize(10);gate.setIncludeFontPadding(false);gate.setPadding(0,0,0,0);top.addView(gate,new LayoutParams(dp(34),dp(40)));
            LayoutParams lp=new LayoutParams(0,-1,1);lp.leftMargin=dp(4);top.addView(surface,lp);addView(top,new LayoutParams(-1,0,1));
            LinearLayout bottom=row(activity);bottom.setGravity(Gravity.CENTER_VERTICAL);db=label(activity,"+0.0",10,TEXT);db.setTypeface(bold);bottom.addView(db,new LayoutParams(dp(34),dp(44)));fader=new Fader(this);lp=new LayoutParams(0,dp(44),1);lp.leftMargin=dp(6);bottom.addView(fader,lp);lp=new LayoutParams(-1,dp(44));lp.topMargin=dp(4);addView(bottom,lp);
        }
        void refresh(){JSONObject pad=data(index);boolean on=gateOn(index);gate.setText(on?"Gate\nOn":"Gate\nOff");gate.setTextColor(on?Color.BLACK:SECONDARY);gate.setBackground(flat(on?YELLOW:Color.TRANSPARENT));gate.setEnabled(state!=null);surface.setContentDescription(pad.optString("name","Pad "+(index+1)));fader.confirm(pad.optDouble("volume",1));surface.invalidate();}
        void db(double value){db.setText(value<=0?"−∞":String.format(Locale.US,"%+.1f",20*Math.log10(value)));}
    }
    final class PadSurface extends View {
        final int index;final Paint paint=new Paint(3);JSONObject press;
        final PadFeedback feedback;final Map<Integer,String> pending;final Set<Integer> litBanks;
        boolean heldGate;int pressBank=-1;
        PadSurface(int index){super(activity);this.index=index;feedback=activity.vinhetasFeedback.computeIfAbsent(index,key->new PadFeedback());pending=feedback.pending;litBanks=feedback.litBanks;setFocusable(true);setClickable(true);}
        void release(){if(press!=null){JSONObject old=press;press=null;if(heldGate)litBanks.remove(pressBank);feedback.held.remove(pressBank);heldGate=false;remote.vinhetasUp(old);invalidate();}}
        void confirm(){receiveFeedback(activity);}
        @Override protected void onDetachedFromWindow(){release();super.onDetachedFromWindow();}
        @Override public boolean onTouchEvent(MotionEvent event){switch(event.getActionMasked()){
            case MotionEvent.ACTION_DOWN:if((event.getButtonState()&MotionEvent.BUTTON_SECONDARY)!=0)return false;if(!available||!data(index).optBoolean("loaded"))return false;press=remote.vinhetasDown(selected,index);if(press!=null){pressBank=selected;heldGate=gateOn(index);feedback.confirmed.remove(selected);if(heldGate)feedback.held.add(selected);litBanks.add(selected);pending.put(selected,press.optString("target").toLowerCase(Locale.ROOT));}invalidate();return true;
            case MotionEvent.ACTION_UP:release();performClick();return true;
            case MotionEvent.ACTION_CANCEL:release();return true;
            default:return press!=null;}}
        @Override public boolean performClick(){super.performClick();return true;}
        @Override protected void onDraw(Canvas canvas){JSONObject pad=data(index);boolean lit=litBanks.contains(selected);int color=0xff000000|pad.optInt("color",0x626262);paint.setColor(lit?blend(color,Color.WHITE,.18f):blend(0xff202020,color,.45f));paint.setStyle(Paint.Style.FILL);canvas.drawRoundRect(0,0,getWidth(),getHeight(),dp(5),dp(5),paint);
            if(lit){paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(2));paint.setColor(blend(color,Color.WHITE,.6f));canvas.drawRoundRect(dp(1),dp(1),getWidth()-dp(1),getHeight()-dp(1),dp(5),dp(5),paint);}
            paint.setStyle(Paint.Style.FILL);paint.setColor(pad.optBoolean("loaded")?TEXT:0xffaaaaaa);paint.setTypeface(bold);paint.setTextSize(dp(11));paint.setTextAlign(Paint.Align.CENTER);String name=pad.optString("name","Pad "+(index+1));name=android.text.TextUtils.ellipsize(name,new android.text.TextPaint(paint),Math.max(1,getWidth()-dp(6)),android.text.TextUtils.TruncateAt.END).toString();canvas.drawText(name,getWidth()/2f,getHeight()/2f-(paint.ascent()+paint.descent())/2,paint);
        }
    }
    final class Fader extends View {
        final PadCell cell;final Paint paint=new Paint(3);double gain=1;Double confirmed;boolean editing;int bank=-1;long sentAt,pendingUntil;final FaderTouch touch;
        Fader(PadCell cell){super(activity);this.cell=cell;setContentDescription("Volume do pad");touch=new FaderTouch(this,new FaderTouch.Target(){public void change(float x,boolean end){update(x,end);}public void reset(){commit(1);}public void tracking(boolean active){editing=active;if(active)sentAt=0;}});}
        void confirm(double value){
            if(bank!=selected){bank=selected;editing=false;pendingUntil=0;}
            confirmed=value;GainPrediction pending=cell.surface.feedback.gains.get(selected);
            if(pending!=null&&SystemClock.elapsedRealtime()>=pending.until){cell.surface.feedback.gains.remove(selected);pending=null;}
            if(!editing)gain=pending!=null?pending.value:value;cell.db(gain);invalidate();
        }
        void commit(double value){gain=value;sentAt=SystemClock.elapsedRealtime();pendingUntil=sentAt+2000;cell.surface.feedback.gains.put(selected,new GainPrediction(gain,pendingUntil));remote.vinhetasControl("vinhetasVolume",selected,cell.index,gain,null);cell.db(gain);invalidate();postDelayed(()->{if(!editing&&SystemClock.elapsedRealtime()>=pendingUntil&&confirmed!=null)confirm(data(cell.index).optDouble("volume",1));},2100);}
        void update(float x,boolean end){gain=Math.max(0,Math.min(2,2*(x-dp(6))/Math.max(1,getWidth()-dp(12))));long now=SystemClock.elapsedRealtime();if(end||now-sentAt>=50){commit(gain);}cell.db(gain);invalidate();}
        @Override public boolean onTouchEvent(MotionEvent event){return isEnabled()&&touch.touch(event);}
        @Override public boolean performClick(){super.performClick();return true;}
        @Override protected void onDraw(Canvas c){float y=getHeight()/2f;paint.setColor(0xff5a5a5a);c.drawRoundRect(dp(6),y-dp(3),getWidth()-dp(6),y+dp(3),dp(3),dp(3),paint);float x=(float)(gain/2)*Math.max(0,getWidth()-dp(12));paint.setColor(0xffe0e0e0);c.drawRoundRect(x,y-dp(9),x+dp(12),y+dp(9),dp(2),dp(2),paint);paint.setColor(0xff555555);c.drawRect(x+dp(5.5f),y-dp(6),x+dp(6.5f),y+dp(6),paint);}
    }
    static final class PagedScroll extends ScrollView {
        boolean didFling;
        PagedScroll(Context c){super(c);}
        @Override protected void onMeasure(int widthSpec,int heightSpec){
            // Size pages before ScrollView measures its content. Updating them
            // from onSizeChanged loses the first layout request on real devices.
            int height=MeasureSpec.getSize(heightSpec)-getPaddingTop()-getPaddingBottom();
            if(getChildCount()>0&&height>0&&MeasureSpec.getMode(heightSpec)!=MeasureSpec.UNSPECIFIED){
                LinearLayout pages=(LinearLayout)getChildAt(0);boolean changed=false;
                for(int n=0;n<pages.getChildCount();n++){View page=pages.getChildAt(n);if(page.getLayoutParams().height!=height){page.getLayoutParams().height=height;page.forceLayout();changed=true;}}
                if(changed)pages.forceLayout();
            }
            super.onMeasure(widthSpec,heightSpec);
        }
        @Override protected void onSizeChanged(int w,int h,int oldw,int oldh){
            super.onSizeChanged(w,h,oldw,oldh);if(h<=0)return;
            int page=oldh>0?Math.round(getScrollY()/(float)oldh):0;
            post(()->scrollTo(0,Math.max(0,Math.min(1,page))*h));
        }
        @Override public void fling(int velocity){didFling=true;int h=Math.max(1,getHeight());int page=Math.round(getScrollY()/(float)h);if(Math.abs(velocity)>500)page=velocity>0?(int)Math.floor(getScrollY()/(double)h)+1:(int)Math.ceil(getScrollY()/(double)h)-1;smoothScrollTo(0,Math.max(0,Math.min(1,page))*h);}
        @Override public boolean onTouchEvent(MotionEvent e){if(e.getActionMasked()==MotionEvent.ACTION_DOWN)didFling=false;boolean result=super.onTouchEvent(e);if((e.getActionMasked()==MotionEvent.ACTION_UP||e.getActionMasked()==MotionEvent.ACTION_CANCEL)&&!didFling){int h=Math.max(1,getHeight());smoothScrollTo(0,Math.max(0,Math.min(1,Math.round(getScrollY()/(float)h)))*h);}return result;}
    }
}
