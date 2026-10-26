package com.hookdeveloper.catlive.remote;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.os.SystemClock;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Button;
import java.util.Locale;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

/** RemoteNativeTimerView parity: persistent HH/MM/SS, live readout and guarded Stop. */
final class RemoteTimerPanel extends LinearLayout {
    final MainActivity app;
    final Dialog dialog;
    final TextView readout;
    final EditText[] fields = new EditText[3];
    final Button toggle;
    Dialog confirmation;
    private final String project;
    private int lastTarget = -1;
    private long lastRun = -1;
    private final Runnable pulse = new Runnable() {
        @Override public void run() {
            if (!dialog.isShowing()) return;
            refresh();
            app.handler.postDelayed(this, 500);
        }
    };

    static void show(MainActivity app) {
        app.closeDialog();
        Dialog dialog = new RemoteKeyboard.KeyboardDialog(app);
        app.activeDialog = dialog;
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        RemoteTimerPanel panel = new RemoteTimerPanel(app, dialog);
        FrameLayout surface = new FrameLayout(app);
        surface.setBackground(RemoteWidgets.panel(16));
        surface.addView(panel, new FrameLayout.LayoutParams(Math.min(dp(300), app.getResources().getDisplayMetrics().widthPixels - dp(24)), -2, Gravity.CENTER));
        dialog.setContentView(surface);
        dialog.setCanceledOnTouchOutside(true);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            window.setDimAmount(.35f);
        }
        dialog.setOnDismissListener(ignored -> {
            app.handler.removeCallbacks(panel.pulse);
            panel.dismissConfirmation();
            app.hideKeyboard(panel);
            if (app.activeDialog == dialog) app.activeDialog = null;
        });
        dialog.show();
        if (window != null) {
            if (tablet) {
                window.setLayout(dp(300), -2);
                View anchor = app.railButtons.get("clock");
                if (anchor != null && anchor.isAttachedToWindow()) {
                    int[] position = new int[2]; anchor.getLocationOnScreen(position);
                    WindowManager.LayoutParams parameters = window.getAttributes();
                    parameters.gravity = Gravity.TOP | Gravity.LEFT;
                    parameters.x = Math.min(position[0] + anchor.getWidth() + dp(8), app.getResources().getDisplayMetrics().widthPixels - dp(308));
                    parameters.y = Math.max(dp(16), Math.min(position[1] + anchor.getHeight()/2 - dp(115), app.getResources().getDisplayMetrics().heightPixels - dp(246)));
                    window.setAttributes(parameters);
                }
            } else {
                window.setGravity(Gravity.BOTTOM);
                window.setLayout(-1, -2);
            }
        }
        panel.refresh();
        app.handler.postDelayed(panel.pulse, 500);
    }

    RemoteTimerPanel(MainActivity app, Dialog dialog) {
        super(app); this.app = app; this.dialog = dialog;
        project = RemoteModel.id(app.state, "project");
        setOrientation(VERTICAL); pad(this,14,14); setMinimumHeight(dp(230));
        setFocusableInTouchMode(true); setTag("timer-panel");
        LinearLayout header = row(app);
        TextView title = label(app,"Timer",15,TEXT); title.setTypeface(bold);
        header.addView(title, new LinearLayout.LayoutParams(0,dp(30),1));
        Button close = new Button(app,"×",dialog::dismiss);
        close.setTextSize(23); close.setTextColor(SECONDARY); close.setPadding(0,0,0,0);
        close.setMinHeight(0); close.setBackgroundColor(Color.TRANSPARENT); close.setContentDescription(RemoteText.ui("Close"));
        header.addView(close,new LinearLayout.LayoutParams(dp(30),dp(30))); addView(header); gap(12);
        readout = label(app,"00:00:00",26,GREEN); readout.setTypeface(Typeface.create("monospace",Typeface.BOLD));
        readout.setGravity(Gravity.CENTER); readout.setBackground(display(5)); readout.setTag("timer-readout");
        addView(readout,new LinearLayout.LayoutParams(-1,dp(42))); gap(12);
        LinearLayout duration = row(app); String[] labels = {"Hours","Minutes","Seconds"};
        for (int index=0;index<3;index++) {
            if (index>0) { View gap = new View(app); duration.addView(gap,new LinearLayout.LayoutParams(dp(8),1)); }
            LinearLayout column = column(app);
            TextView caption = label(app,labels[index],11,SECONDARY); caption.setGravity(Gravity.CENTER);
            column.addView(caption,new LinearLayout.LayoutParams(-1,dp(14)));
            View gap = new View(app); column.addView(gap,new LinearLayout.LayoutParams(1,dp(5)));
            EditText field = new EditText(app); fields[index] = field;
            field.setTag("timer-component-"+index); field.setContentDescription(RemoteText.ui(labels[index]));
            field.setTextSize(22); field.setTypeface(Typeface.create("monospace",Typeface.BOLD));
            field.setTextColor(TEXT); field.setHintTextColor(SECONDARY); field.setHint("00");
            field.setSingleLine(); field.setGravity(Gravity.CENTER); field.setIncludeFontPadding(false); field.setPadding(0,0,0,0);
            field.setInputType(InputType.TYPE_CLASS_NUMBER); field.setFilters(new InputFilter[]{new InputFilter.LengthFilter(2)});
            field.setSelectAllOnFocus(true); field.setBackground(display(5));
            field.setImeOptions(index<2?EditorInfo.IME_ACTION_NEXT:EditorInfo.IME_ACTION_DONE);
            final int next = index+1;
            field.setOnFocusChangeListener((view,focused)->field.setBackground(surface(gray(.08f*(tablet?.72f:1)),gray(.05f*(tablet?.72f:1)),focused?GREEN:0x20ffffff,5)));
            field.setOnEditorActionListener((view,action,event)->{
                if (action==EditorInfo.IME_ACTION_NEXT && next<fields.length) { fields[next].requestFocus(); return true; }
                if (action==EditorInfo.IME_ACTION_DONE) { app.hideKeyboard(field); requestFocus(); return true; }
                return false;
            });
            column.addView(field,new LinearLayout.LayoutParams(-1,dp(40)));
            duration.addView(column,new LinearLayout.LayoutParams(0,-2,1));
        }
        addView(duration); gap(12);
        toggle = new Button(app,"Start",this::toggle); toggle.setTag("timer-toggle"); toggle.setTextSize(14);
        addView(toggle,new LinearLayout.LayoutParams(-1,dp(38)));
        if (app.state == null || app.state.optJSONObject("timer") == null) {
            gap(12); TextView warning = label(app,"Atualize o CatLive no PC para sincronizar o cronômetro.",12,SECONDARY);
            addView(warning,new LinearLayout.LayoutParams(-1,-2));
        }
        requestFocus();
    }

    private void gap(int height) { View gap = new View(app); addView(gap,new LinearLayout.LayoutParams(1,dp(height))); }
    void synchronizeFields() {
        int seconds = app.localTimer.targetSeconds;
        int[] values = {seconds/3600,seconds/60%60,seconds%60};
        for (int index=0;index<3;index++) fields[index].setText(String.format(Locale.US,"%02d",values[index]));
        lastTarget = seconds;
    }
    void refresh() {
        if (!project.equals(RemoteModel.id(app.state,"project"))) { dialog.dismiss(); return; }
        RemoteTimer timer = app.localTimer;
        if (timer.targetSeconds != lastTarget) synchronizeFields();
        if (timer.runID != lastRun) { lastRun=timer.runID; dismissConfirmation(); }
        double seconds = timer.value(SystemClock.elapsedRealtime());
        boolean expired = timer.running && seconds<=0;
        readout.setText(RemoteTimer.formatted(seconds)); readout.setTextColor(expired?RED:GREEN);
        readout.setAlpha(expired && SystemClock.elapsedRealtime()%1000>=500?.25f:1);
        for (EditText field:fields) { field.setEnabled(!timer.running); field.setAlpha(timer.running?.35f:1); }
        toggle.setText(RemoteText.ui(timer.running?"Stop":"Start"));
        toggle.setTextColor(timer.running?TEXT:GREEN);
        toggle.setBackground(timer.running?surface(0xffa62525,0xffa62525,RED,5):panel(5));
        toggle.setEnabled(app.remote.connected && app.remote.mode.equals("director") && app.state != null && app.state.optJSONObject("timer")!=null);
    }
    void toggle() {
        for (EditText field:fields) if (field.hasFocus()) app.hideKeyboard(field);
        requestFocus();
        if (app.localTimer.running) { confirmStop(); return; }
        app.remote.action("timerStart",null,targetSeconds(fields[0].getText().toString(),fields[1].getText().toString(),fields[2].getText().toString()));
        synchronizeFields(); refresh();
    }
    static int targetSeconds(String hours,String minutes,String seconds) {
        return component(hours,99)*3600+component(minutes,59)*60+component(seconds,59);
    }
    private static int component(String value,int maximum) {
        if (value.isEmpty()) return 0;
        for (int i=0;i<value.length();i++) if (value.charAt(i)<'0'||value.charAt(i)>'9') return 0;
        try { return Math.min(maximum,Integer.parseInt(value)); } catch(NumberFormatException ignored) { return maximum; }
    }
    void confirmStop() {
        if (confirmation!=null) return;
        final long run = app.localTimer.runID;
        Dialog confirm = new RemoteKeyboard.KeyboardDialog(app); confirmation=confirm;
        confirm.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout content = column(app); content.setBackground(panel(14));
        LinearLayout words = column(app); pad(words,18,18);
        TextView title = label(app,"Stop timer?",17,TEXT); title.setGravity(Gravity.CENTER); title.setTypeface(bold); words.addView(title);
        TextView message = label(app,"The timer will stop and the current count will be reset.",13,TEXT); message.setGravity(Gravity.CENTER); message.setPadding(0,dp(8),0,0); words.addView(message); content.addView(words);
        View divider = new View(app); divider.setBackgroundColor(0x33ffffff); content.addView(divider,new LinearLayout.LayoutParams(-1,dp(1)));
        LinearLayout actions = row(app);
        Button cancel = new Button(app,"Cancel",confirm::dismiss); cancel.setTextColor(BLUE); cancel.setBackgroundColor(Color.TRANSPARENT);
        actions.addView(cancel,new LinearLayout.LayoutParams(0,dp(44),1));
        View vertical = new View(app); vertical.setBackgroundColor(0x33ffffff); actions.addView(vertical,new LinearLayout.LayoutParams(dp(1),-1));
        Button stop = new Button(app,"Stop timer",()->{
            confirm.dismiss();
            if (project.equals(RemoteModel.id(app.state,"project")) && app.localTimer.running && app.localTimer.runID==run) app.remote.action("timerStop");
            synchronizeFields(); refresh();
        }); stop.setTextColor(RED); stop.setBackgroundColor(Color.TRANSPARENT); stop.setTag("timer-confirm-stop");
        actions.addView(stop,new LinearLayout.LayoutParams(0,dp(44),1)); content.addView(actions);
        confirm.setContentView(content); confirm.setCanceledOnTouchOutside(true);
        confirm.setOnDismissListener(ignored->{if(confirmation==confirm)confirmation=null;});
        if (confirm.getWindow()!=null) confirm.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        confirm.show(); if (confirm.getWindow()!=null) confirm.getWindow().setLayout(Math.min(dp(280),app.getResources().getDisplayMetrics().widthPixels-dp(32)),-2);
    }
    private void dismissConfirmation() { if(confirmation!=null){confirmation.dismiss();confirmation=null;} }
}
