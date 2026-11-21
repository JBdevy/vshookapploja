package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ScrollView;

/** One finger scrolls. A pinch that starts in the track number column resizes the rows. */
final class RemoteTrackScrollView extends ScrollView {
    private static final int NUMBER_AREA_WIDTH = 98;
    final MainActivity app;
    final ScaleGestureDetector pinch;
    boolean twoFingers=false;
    private boolean canResize;
    double initialScale=1,factor=1;
    RemoteTrackScrollView(Context context,MainActivity app){
        super(context);this.app=app;
        setVerticalScrollBarEnabled(false);
        pinch=new ScaleGestureDetector(context,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
            @Override public boolean onScaleBegin(ScaleGestureDetector detector){initialScale=app.layout.heightScale;factor=1;return true;}
            @Override public boolean onScale(ScaleGestureDetector detector){factor*=detector.getScaleFactor();app.resizeTrackHeight(initialScale*factor);return true;}
            @Override public void onScaleEnd(ScaleGestureDetector detector){app.finishTrackHeightResize();}
        });
        pinch.setQuickScaleEnabled(false);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN){
            twoFingers=false;
            canResize=event.getX()<=RemoteWidgets.dp(NUMBER_AREA_WIDTH)&&getChildCount()>0
                    &&event.getY()+getScrollY()<getChildAt(0).getHeight();
        }
        if(canResize&&action==MotionEvent.ACTION_POINTER_DOWN&&!twoFingers){
            canResize=event.getX(event.getActionIndex())<=RemoteWidgets.dp(NUMBER_AREA_WIDTH);
        }
        if(canResize&&event.getPointerCount()>1&&!twoFingers){
            twoFingers=true;
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);
            super.dispatchTouchEvent(cancel);cancel.recycle();
            if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);
        }
        if(canResize)pinch.onTouchEvent(event);
        if(twoFingers){
            if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
                twoFingers=false;if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);
            }
            return true;
        }
        return super.dispatchTouchEvent(event);
    }
}
