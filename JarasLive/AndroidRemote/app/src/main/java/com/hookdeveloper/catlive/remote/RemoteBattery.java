package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

final class RemoteBattery {
    private int previous = -1;
    private long lastAlert = -60_000;

    void reset() {
        previous = -1;
        lastAlert = -60_000;
    }

    int warning(int percent, long now) {
        if (percent < 0 || percent > 100) return -1;
        int level = threshold(percent);
        boolean crossed = level >= 0 && (previous < 0 || percent < previous && threshold(previous) != level);
        if (crossed && now - lastAlert < 60_000) return -1;
        previous = percent;
        if (!crossed) return -1;
        lastAlert = now;
        return percent;
    }

    private static int threshold(int percent) {
        if (percent <= 10) return percent;
        if (percent <= 15) return 15;
        if (percent <= 20) return 20;
        return -1;
    }

    static final class Badge extends LinearLayout {
        private final TextView value;
        private final View icon;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int percent = -1;

        Badge(Context context, boolean vertical) {
            super(context);
            setOrientation(vertical ? VERTICAL : HORIZONTAL);
            setGravity(Gravity.CENTER);
            icon = new View(context) {
                @Override protected void onDraw(Canvas canvas) {
                    float left = dp(2), top = getHeight() * 0.5f - dp(4);
                    paint.setColor(percent <= 20 ? RED : SECONDARY);
                    paint.setStyle(Paint.Style.STROKE);
                    paint.setStrokeWidth(dp(1));
                    canvas.drawRoundRect(left, top, left + dp(14), top + dp(8), dp(2), dp(2), paint);
                    paint.setStyle(Paint.Style.FILL);
                    canvas.drawRoundRect(left + dp(15), top + dp(2.5f), left + dp(17), top + dp(5.5f),
                        dp(1), dp(1), paint);
                    if (percent > 0)
                        canvas.drawRoundRect(left + dp(2), top + dp(2), left + dp(2) + dp(10) * percent / 100f,
                            top + dp(6), dp(1), dp(1), paint);
                }
            };
            addView(icon, new LayoutParams(dp(22), dp(12)));
            value = label(context, "", 10, SECONDARY);
            value.setGravity(Gravity.CENTER);
            addView(value, new LayoutParams(-2, -2));
            setVisibility(GONE);
        }

        void update(int next) {
            if (percent == next) return;
            percent = next;
            setVisibility(percent < 0 ? GONE : VISIBLE);
            if (percent < 0) return;
            value.setText(percent + "%");
            value.setTextColor(percent <= 20 ? RED : SECONDARY);
            setContentDescription(RemoteText.ui("Desktop battery") + " " + percent + "%");
            icon.invalidate();
        }
    }
}
