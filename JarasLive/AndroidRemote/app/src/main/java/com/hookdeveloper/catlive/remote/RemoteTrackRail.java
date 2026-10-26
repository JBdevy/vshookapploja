package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.LinearLayout;

/** The narrow scroll rail owns the height pinch; the grid keeps its time zoom. */
final class RemoteTrackRail extends LinearLayout {
    final MainActivity app;
    final ScaleGestureDetector pinch;
    boolean twoFingers=false;
    double initialScale=1,factor=1;
    RemoteTrackRail(Context context,MainActivity app){
        super(context);this.app=app;setOrientation(VERTICAL);
        setContentDescription("Área de rolagem do Track Mixer. Use pinça com dois dedos para ajustar a altura das pistas.");
        pinch=new ScaleGestureDetector(context,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
            @Override public boolean onScaleBegin(ScaleGestureDetector detector){initialScale=app.layout.heightScale;factor=1;return true;}
            @Override public boolean onScale(ScaleGestureDetector detector){factor*=detector.getScaleFactor();app.resizeTrackHeight(initialScale*factor);return true;}
            @Override public void onScaleEnd(ScaleGestureDetector detector){app.finishTrackHeightResize();}
        });
        pinch.setQuickScaleEnabled(false);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN)twoFingers=false;
        if(event.getPointerCount()>1&&!twoFingers){
            twoFingers=true;
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);
            super.dispatchTouchEvent(cancel);cancel.recycle();
            if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);
        }
        pinch.onTouchEvent(event);
        if(twoFingers){
            if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
                twoFingers=false;if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);
            }
            return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
