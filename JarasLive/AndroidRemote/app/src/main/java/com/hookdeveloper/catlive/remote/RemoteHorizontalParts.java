package com.hookdeveloper.catlive.remote;

import android.graphics.Color;
import android.view.*;
import android.widget.*;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Button;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** Two independent Parts banks, docked beneath the workspace. */
final class RemoteHorizontalParts extends LinearLayout {
    private static final String HEIGHT = "horizontalPartsHeightScale";
    final RemoteParts current, queued;
    final Button cancel;
    private final MainActivity app;
    private final int baseHeight;
    private float startY;
    private int startHeight;

    RemoteHorizontalParts(MainActivity app, int defaultHeightDp){
        super(app);
        this.app = app;
        baseHeight = dp(defaultHeightDp);
        setOrientation(VERTICAL);
        setBackground(panel(0));

        FrameLayout handle = new FrameLayout(app);
        View grip = new View(app);
        grip.setBackground(surface(SECONDARY, SECONDARY, Color.TRANSPARENT, 2));
        handle.addView(grip,new FrameLayout.LayoutParams(dp(40), dp(3), Gravity.CENTER));
        handle.setContentDescription("Altura do Hoz-Parts");
        handle.setPointerIcon(PointerIcon.getSystemIcon(app, PointerIcon.TYPE_VERTICAL_DOUBLE_ARROW));
        handle.setOnTouchListener((view,event)->resize(event));
        addView(handle,new LayoutParams(-1,dp(18)));

        cancel = new Button(app,"Cancel",()->app.remote.action("cancelSection"));
        cancel.setTextSize(12);
        cancel.solid(0xffffd600);
        LayoutParams cancelLayout = new LayoutParams(-1,dp(28));
        cancelLayout.setMargins(dp(4),0,dp(4),dp(4));
        addView(cancel,cancelLayout);

        LinearLayout banks = row(app);
        current = new RemoteParts(app,id->app.remote.action("queueSection",id,0),()->{},false);
        queued = new RemoteParts(app,id->app.remote.action("queueSection",id,0),()->{},true);
        banks.addView(current,new LayoutParams(0,-1,1));
        View separator = new View(app);
        separator.setBackgroundColor(0xff444444);
        banks.addView(separator,new LayoutParams(dp(1),-1));
        banks.addView(queued,new LayoutParams(0,-1,1));
        addView(banks,new LayoutParams(-1,0,1));
        refresh();
    }

    int preferredHeight(){
        float scale = app.getPreferences(0).getFloat(HEIGHT,1f);
        return Math.round(baseHeight*Math.max(1f,Math.min(1.5f,scale)));
    }

    private boolean resize(MotionEvent event){
        switch(event.getActionMasked()){
            case MotionEvent.ACTION_DOWN:
                startY = event.getRawY();
                startHeight = getHeight();
                return true;
            case MotionEvent.ACTION_MOVE:
            case MotionEvent.ACTION_UP:
                int height = Math.max(baseHeight,Math.min(Math.round(baseHeight*1.5f),
                    startHeight+Math.round(startY-event.getRawY())));
                if(getLayoutParams().height != height){
                    getLayoutParams().height = height;
                    requestLayout();
                }
                if(event.getActionMasked()==MotionEvent.ACTION_UP)
                    app.getPreferences(0).edit().putFloat(HEIGHT,(float)height/baseHeight).apply();
                return true;
            case MotionEvent.ACTION_CANCEL:
                getLayoutParams().height = preferredHeight();
                requestLayout();
                return true;
            default:
                return false;
        }
    }

    void refresh(){
        current.refresh();
        queued.refresh();
        cancel.setEnabled(current.cancel.isEnabled());
        cancel.setAlpha(1);
    }

    void tick(){
        current.tick();
        queued.tick();
    }
}
