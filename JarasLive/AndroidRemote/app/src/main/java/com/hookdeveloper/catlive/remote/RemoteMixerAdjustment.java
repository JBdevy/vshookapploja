package com.hookdeveloper.catlive.remote;

import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

final class RemoteMixerAdjustment {
    private final MainActivity activity;
    private final Runnable dismiss = this::dismiss;
    private LinearLayout card;
    private TextView value;
    private String displayed = "";

    RemoteMixerAdjustment(MainActivity activity) {
        this.activity = activity;
    }

    void showPan(String track, double adjustment) {
        if (track == null || activity.state == null || !activity.remote.connected) return;
        if (!track.equals(displayed) || card == null) {
            dismiss();
            displayed = track;
            card = column(activity);
            card.setBackground(surface(0xff292929,0xff181818,0xff515151,8));
            pad(card,8,8);
            LinearLayout header = row(activity);
            org.json.JSONObject source = RemoteModel.find(RemoteModel.array(activity.state,"tracks"),track);
            TextView title = label(activity,source == null ? "" : source.optString("name"),12,TEXT);
            title.setSingleLine();
            header.addView(title,new LinearLayout.LayoutParams(0,dp(25),1));
            value = label(activity,"",12,TEXT);
            value.setTypeface(bold);
            header.addView(value);
            card.addView(header,new LinearLayout.LayoutParams(-1,dp(26)));
            FrameLayout.LayoutParams bounds = new FrameLayout.LayoutParams(dp(218),-2,Gravity.TOP|Gravity.END);
            bounds.topMargin = dp(76);
            bounds.rightMargin = dp(12);
            activity.root.addView(card,bounds);
        }
        value.setText(panText(adjustment));
        activity.handler.removeCallbacks(dismiss);
        activity.handler.postDelayed(dismiss,2000);
    }

    private static String panText(double pan) {
        long percent = Math.round(Math.abs(pan) * 100);
        return percent == 0 ? "Center" : percent + (pan < 0 ? "%L" : "%R");
    }

    void dismiss() {
        activity.handler.removeCallbacks(dismiss);
        if (card != null) activity.root.removeView(card);
        card = null;
        displayed = "";
    }
}
