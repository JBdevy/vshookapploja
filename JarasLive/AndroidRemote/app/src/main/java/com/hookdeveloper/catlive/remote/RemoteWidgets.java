package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import java.util.Locale;

final class RemoteWidgets {
    static final int GREEN=0xff69ed91,YELLOW=0xffffdc52,RED=0xffff3030,SECONDARY=0xffb9b9b9,TEXT=Color.WHITE,BLUE=0xff409cff;
    static float density=1;static Typeface regular=Typeface.DEFAULT,bold=Typeface.DEFAULT_BOLD;static boolean tablet;
    static void init(Context c){RemoteText.init(c);density=c.getResources().getDisplayMetrics().density;tablet=c.getResources().getConfiguration().smallestScreenWidthDp>=600;regular=Typeface.createFromAsset(c.getAssets(),"fonts/Inter-Regular.ttf");bold=Typeface.createFromAsset(c.getAssets(),"fonts/Inter-SemiBold.ttf");}
    static int dp(float v){return Math.round(v*density);}
    static GradientDrawable surface(int top,int bottom,int edge,float radius){GradientDrawable d=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{top,bottom});d.setCornerRadius(dp(radius));d.setStroke(dp(0.5f),edge);return d;}
    static GradientDrawable panel(float radius){float b=tablet?.72f:1;return surface(gray(.16f*b),gray(.105f*b),0x2affffff,radius);}
    static GradientDrawable background(float radius){float b=tablet?.72f:1;return surface(gray(.12f*b),gray(.075f*b),Color.TRANSPARENT,radius);}
    static GradientDrawable display(float radius){float b=tablet?.72f:1;return surface(gray(.08f*b),gray(.05f*b),Color.TRANSPARENT,radius);}
    static class Icon extends View {
        String key;final int color;final float size;
        Icon(Context c,String key,int color,float size){super(c);this.key=key;this.color=color;this.size=size;setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);}
        @Override protected void onDraw(Canvas c){if(key.equals("folder.nested")){drawIcon(c,"folder",getWidth()/2f-dp(8),getHeight()/2f,dp(8),color);drawIcon(c,"folder",getWidth()/2f+dp(4),getHeight()/2f,dp(12),color);Paint mark=new Paint(Paint.ANTI_ALIAS_FLAG);mark.setColor(Color.BLACK);mark.setStrokeWidth(dp(1));c.drawLine(getWidth()/2f+dp(1),getHeight()/2f+dp(1),getWidth()/2f+dp(7),getHeight()/2f+dp(1),mark);}else drawIcon(c,key,getWidth()/2f,getHeight()/2f,dp(size),color);}
    }
    static class SongDisplay extends LinearLayout {
        final TextView title,value;
        SongDisplay(Context c,String name){super(c);setGravity(Gravity.CENTER_VERTICAL);pad(this,8,0);title=label(c,name,10,SECONDARY);title.setTypeface(Typeface.create(bold,Typeface.BOLD_ITALIC));addView(title);TextView arrow=label(c,"›",12,SECONDARY);pad(arrow,5,0);addView(arrow);value=label(c,"—",12,YELLOW);value.setTypeface(bold);value.setMaxLines(1);value.setAutoSizeTextTypeUniformWithConfiguration(7,12,1,android.util.TypedValue.COMPLEX_UNIT_SP);addView(value,new LinearLayout.LayoutParams(0,-1,1));}
        void update(String name,String song,Double bpm){title.setText(RemoteText.ui(name));value.setText(songText(song,bpm));}
        static String songText(String song,Double bpm){String name=song==null||song.isEmpty()?"—":song;return name+(bpm==null||!Double.isFinite(bpm)?"":" - "+new java.text.DecimalFormat("0.###",java.text.DecimalFormatSymbols.getInstance(Locale.US)).format(bpm)+" bpm");}
    }
    static int gray(float v){int c=(int)(v*255);return Color.rgb(c,c,c);}
    static int rgb(long value){return 0xff000000|(int)value;}
    static int blend(int a,int b,float t){return Color.rgb((int)(Color.red(a)*(1-t)+Color.red(b)*t),(int)(Color.green(a)*(1-t)+Color.green(b)*t),(int)(Color.blue(a)*(1-t)+Color.blue(b)*t));}
    static TextView label(Context c,String text,int size,int color){TextView v=new TextView(c);v.setText(RemoteText.ui(text));v.setTextColor(color);v.setTextSize(size);v.setTypeface(regular);v.setIncludeFontPadding(false);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    static LinearLayout column(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.VERTICAL);return v;}
    static LinearLayout row(Context c){LinearLayout v=new LinearLayout(c);v.setOrientation(LinearLayout.HORIZONTAL);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    static void pad(View v,int x,int y){v.setPadding(dp(x),dp(y),dp(x),dp(y));}
    static class Button extends TextView {
        int tint=TEXT;boolean active=false;String icon="",caption="",leadingIcon="",trailingIcon="";
        Button(Context c,String text,Runnable run){super(c);setText(RemoteText.ui(text));setTextColor(TEXT);setTextSize(13);setTypeface(bold);setGravity(Gravity.CENTER);setIncludeFontPadding(false);setMinHeight(dp(32));setPadding(dp(8),dp(4),dp(8),dp(4));setFocusable(true);setClickable(true);setOnClickListener(v->run.run());setBackground(panel(5));}
        void style(int color,boolean on){tint=color;active=on;setTextColor(color);setBackground(on?surface(blend(0xff282828,color,.35f),blend(0xff1b1b1b,color,.35f),0x3affffff,5):panel(5));invalidate();}
        void trackStyle(int color,boolean on){tint=color;active=on;setTextColor(on?Color.BLACK:Color.WHITE);setPadding(0,0,0,0);setBackground(new InsetDrawable(on?surface(blend(color,Color.WHITE,.08f),blend(color,Color.BLACK,.08f),0x2affffff,3):surface(0xff414141,0xff353535,0x2affffff,3),dp(3),dp(3),dp(3),dp(3)));invalidate();}
        void solid(int color){setTextColor(Color.BLACK);setBackground(surface(blend(color,Color.WHITE,.10f),blend(color,Color.BLACK,.12f),color,5));}
        void icon(String key,String accessible){icon=key;setContentDescription(accessible);setText("");invalidate();}
        void leadingIcon(String key){leadingIcon=key;setPadding(dp(34),dp(4),dp(12),dp(4));}
        void trailingIcon(String key){trailingIcon=key;setPadding(dp(9),dp(4),dp(27),dp(4));setSingleLine(true);setEllipsize(android.text.TextUtils.TruncateAt.END);}
        @Override public void setEnabled(boolean on){super.setEnabled(on);setAlpha(on?1:.35f);}
        @Override protected void onDraw(Canvas c){if(isPressed()){Paint p=new Paint();p.setColor(0x25ffffff);c.drawRoundRect(0,0,getWidth(),getHeight(),dp(5),dp(5),p);}super.onDraw(c);if(!leadingIcon.isEmpty())drawIcon(c,leadingIcon,dp(17),getHeight()/2f,dp(17),getCurrentTextColor());if(!trailingIcon.isEmpty())drawIcon(c,trailingIcon,getWidth()-dp(14),getHeight()/2f,dp(12),getCurrentTextColor());if(!icon.isEmpty()){float size=dp(caption.isEmpty()?21:14);drawIcon(c,icon,getWidth()/2f,getHeight()/2f-(caption.isEmpty()?0:dp(6)),size,tint);if(!caption.isEmpty()){Paint p=new Paint(3);p.setColor(tint);p.setTypeface(bold);p.setTextSize(dp(9));p.setTextAlign(Paint.Align.CENTER);c.drawText(RemoteText.ui(caption),getWidth()/2f,getHeight()/2f+dp(12),p);}}}
        @Override public boolean onTouchEvent(MotionEvent e){boolean r=super.onTouchEvent(e);invalidate();return r;}
    }
    static void drawIcon(Canvas canvas,String key,float cx,float cy,float size,int color){
        canvas.save();canvas.translate(cx-size/2,cy-size/2);canvas.scale(size/24,size/24);Paint p=new Paint(3);p.setColor(color);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.5f);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);
        switch(key){
        case "send":Path plane=new Path();plane.moveTo(2,10);plane.lineTo(22,2);plane.lineTo(15,22);plane.lineTo(11,14);plane.close();p.setStyle(Paint.Style.FILL);canvas.drawPath(plane,p);p.setColor(0xff69ed91);p.setStyle(Paint.Style.STROKE);canvas.drawLine(11,14,18,6,p);break;
        case "pin":canvas.drawLine(8,2,16,2,p);canvas.drawLine(9,2,9,8,p);canvas.drawLine(15,2,15,8,p);Path pin=new Path();pin.moveTo(9,8);pin.lineTo(5,13);pin.lineTo(5,15);pin.lineTo(19,15);pin.lineTo(19,13);pin.lineTo(15,8);canvas.drawPath(pin,p);canvas.drawLine(12,15,12,23,p);break;
        case "refresh":canvas.drawArc(4,5,20,21,-90,300,false,p);canvas.drawLine(12,5,16,5,p);canvas.drawLine(12,1,16,5,p);canvas.drawLine(12,9,16,5,p);break;
        case "observer":Path eye=new Path();eye.moveTo(1,12);eye.cubicTo(7,2,17,2,23,12);eye.cubicTo(17,22,7,22,1,12);canvas.drawPath(eye,p);canvas.drawCircle(12,12,4,p);break;
        case "chevron.down":canvas.drawLine(5,9,12,16,p);canvas.drawLine(12,16,19,9,p);break;
        case "chevron":canvas.drawLine(9,6,15,12,p);canvas.drawLine(15,12,9,18,p);break;
        case "menu":for(int y=5;y<=19;y+=7)canvas.drawLine(3,y,21,y,p);break;
        case "mixer":for(int y=5;y<=19;y+=7){float x=y==12?8:16;canvas.drawLine(2,y,x-3,y,p);canvas.drawLine(x+3,y,22,y,p);canvas.drawRoundRect(x-3,y-2,x+3,y+2,2,2,p);}break;
        case "setlist":for(int y=5;y<=19;y+=7){canvas.drawCircle(3,y,.8f,p);canvas.drawLine(7,y,21,y,p);}break;
        case "vinhetas":p.setStyle(Paint.Style.FILL);for(int x=3;x<=21;x+=6)for(int y=6;y<=18;y+=6)canvas.drawRoundRect(x-1.7f,y-1.7f,x+1.7f,y+1.7f,.5f,.5f,p);break;
        case "folder":p.setStyle(Paint.Style.FILL);Path folder=new Path();folder.moveTo(2,5);folder.lineTo(10,5);folder.lineTo(12,8);folder.lineTo(22,8);folder.lineTo(22,20);folder.lineTo(2,20);folder.close();canvas.drawPath(folder,p);break;
        case "grid":for(int x=3;x<22;x+=7)for(int y=3;y<22;y+=7)canvas.drawRect(x,y,x+4,y+4,p);break;
        case "clock":canvas.drawCircle(12,12,9,p);canvas.drawLine(12,5,12,12,p);canvas.drawLine(12,12,17,15,p);break;
        case "save":canvas.drawLine(12,2,12,15,p);canvas.drawLine(7,10,12,15,p);canvas.drawLine(17,10,12,15,p);canvas.drawLine(3,9,3,21,p);canvas.drawLine(3,21,21,21,p);canvas.drawLine(21,21,21,9,p);break;
        case "parts":p.setStrokeWidth(2);canvas.drawLine(3,6,22,6,p);canvas.drawLine(3,12,16,12,p);canvas.drawLine(3,18,11,18,p);break;
        case "notices":canvas.drawRoundRect(2,3,22,17,3,3,p);canvas.drawLine(6,17,6,22,p);canvas.drawLine(6,22,12,17,p);for(int y=7;y<=13;y+=3)canvas.drawLine(6,y,18,y,p);break;
        case "settings":canvas.drawCircle(12,12,4,p);for(int i=0;i<8;i++){double a=i*Math.PI/4;canvas.drawLine(12+(float)Math.cos(a)*8,12+(float)Math.sin(a)*8,12+(float)Math.cos(a)*11,12+(float)Math.sin(a)*11,p);}canvas.drawCircle(12,12,8,p);break;
        case "hide":canvas.drawLine(15,4,7,12,p);canvas.drawLine(7,12,15,20,p);break;
        case "play":p.setStyle(Paint.Style.FILL);Path path=new Path();path.moveTo(6,3);path.lineTo(21,12);path.lineTo(6,21);path.close();canvas.drawPath(path,p);break;
        case "pause":p.setStyle(Paint.Style.FILL);canvas.drawRoundRect(5,3,10,21,1,1,p);canvas.drawRoundRect(14,3,19,21,1,1,p);break;
        case "stop":p.setStyle(Paint.Style.FILL);canvas.drawRoundRect(4,4,20,20,2,2,p);break;
        case "repeat":canvas.drawRoundRect(3,5,21,19,4,4,p);canvas.drawLine(14,2,19,5,p);canvas.drawLine(14,8,19,5,p);canvas.drawLine(10,16,5,19,p);canvas.drawLine(10,22,5,19,p);break;
        case "search":canvas.drawCircle(10,10,7,p);canvas.drawLine(15,15,22,22,p);break;
        case "computer":canvas.drawRoundRect(2,3,22,17,2,2,p);canvas.drawLine(12,17,12,22,p);canvas.drawLine(7,22,17,22,p);break;
        case "preview":canvas.drawRoundRect(2,5,22,19,2,2,p);canvas.drawLine(7,5,7,19,p);canvas.drawLine(17,5,17,19,p);break;
        default:p.setStyle(Paint.Style.FILL);p.setTypeface(bold);p.setTextSize(10);p.setTextAlign(Paint.Align.CENTER);canvas.drawText(key,12,15,p);
        }canvas.restore();
    }
    /** Double-tap reset and horizontal drag share the same interaction in every fader. */
    static final class FaderTouch extends GestureDetector.SimpleOnGestureListener {
        interface Target {void change(float x,boolean end);void reset();void tracking(boolean active);}
        final View view;final Target target;final GestureDetector detector;boolean dragged;
        FaderTouch(View view,Target target){this.view=view;this.target=target;detector=new GestureDetector(view.getContext(),this);}
        public boolean onDown(MotionEvent event){return true;}
        public boolean onSingleTapConfirmed(MotionEvent event){target.change(event.getX(),true);view.performClick();return true;}
        public boolean onDoubleTap(MotionEvent event){target.reset();return true;}
        public boolean onScroll(MotionEvent first,MotionEvent current,float dx,float dy){dragged=true;target.change(current.getX(),false);return true;}
        boolean touch(MotionEvent event){
            int action=event.getActionMasked();
            if(action==MotionEvent.ACTION_DOWN){dragged=false;target.tracking(true);if(view.getParent()!=null)view.getParent().requestDisallowInterceptTouchEvent(true);}
            detector.onTouchEvent(event);
            if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
                if(dragged&&action==MotionEvent.ACTION_UP)target.change(event.getX(),true);
                target.tracking(false);if(view.getParent()!=null)view.getParent().requestDisallowInterceptTouchEvent(false);
            }
            return true;
        }
    }
    static class Fader extends View {
        interface Changed {void value(double v);}
        double value=1,maximumDB=12;boolean pan=false,dragging=false,readout=true;final Changed changed;final Paint paint=new Paint(3);String label="";long last,pendingUntil;Double confirmed;final FaderTouch touch;
        Fader(Context c,boolean pan,Changed changed){super(c);this.pan=pan;this.changed=changed;setFocusable(true);setContentDescription(pan?"Pan":"Volume");
            touch=new FaderTouch(this,new FaderTouch.Target(){public void change(float x,boolean end){setFromX(x,end);}public void reset(){commit(Fader.this.pan?0:1);}public void tracking(boolean active){dragging=active;}});
        }
        void update(double v){confirmed=v;if(!dragging&&android.os.SystemClock.elapsedRealtime()>=pendingUntil){value=v;invalidate();}}
        void commit(double v){value=v;pendingUntil=android.os.SystemClock.elapsedRealtime()+2000;last=android.os.SystemClock.elapsedRealtime();changed.value(value);invalidate();
            postDelayed(()->{if(!dragging&&android.os.SystemClock.elapsedRealtime()>=pendingUntil&&confirmed!=null){value=confirmed;invalidate();}},2100);
        }
        void setFromX(float x,boolean end){float f=Math.max(0,Math.min(1,(x-dp(6))/Math.max(1,getWidth()-dp(12))));value=pan?f*2-1:RemoteModel.gain(f*(maximumDB+60)-60);invalidate();long now=android.os.SystemClock.elapsedRealtime();if(end||now-last>=25)commit(value);}
        @Override protected void onDraw(Canvas canvas){
            float w=getWidth(),h=getHeight(),left=dp(6),right=w-dp(6),y=pan?dp(8):h*(readout?.4f:.5f);
            paint.setColor(0x38ffffff);canvas.drawRoundRect(left,y-dp(3),right,y+dp(3),dp(3),dp(3),paint);
            double f=pan?(value+1)/2:(Math.min(maximumDB,value>0?20*Math.log10(value):-60)+60)/(maximumDB+60);
            float x=left+(right-left)*(float)Math.max(0,Math.min(1,f));
            paint.setColor(Color.WHITE);paint.setShader(new LinearGradient(0,y-dp(9),0,y+dp(9),new int[]{0xffe3e3e3,0xffe0e0e0,0xffc5c5c5},new float[]{0,.5f,1},Shader.TileMode.CLAMP));
            canvas.drawRoundRect(x-dp(6),y-dp(9),x+dp(6),y+dp(9),dp(2),dp(2),paint);paint.setShader(null);
            paint.setColor(0xff555555);canvas.drawRect(x-dp(.5f),y-dp(6),x+dp(.5f),y+dp(6),paint);
            paint.setTypeface(bold);paint.setColor(TEXT);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(dp(pan?7:10));
            String read=pan?(Math.abs(value)<.005?"Center":String.format(Locale.US,"%s-%d%%",value<0?"L":"R",Math.round(Math.abs(value)*100))):(value==0?"−∞ dB":String.format(Locale.US,"%+.1f dB",20*Math.log10(value)));
            if(readout)canvas.drawText(read,w/2,h-dp(2),paint);
        }
        @Override public boolean onTouchEvent(MotionEvent event){return isEnabled()&&touch.touch(event);}
        @Override public boolean performClick(){super.performClick();return true;}
    }
}
