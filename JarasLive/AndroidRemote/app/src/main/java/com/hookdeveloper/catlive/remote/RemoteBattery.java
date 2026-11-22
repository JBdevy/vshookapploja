package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

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

    static final class Badge extends View {
        private final boolean vertical;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int percent = -1;

        Badge(Context context, boolean vertical) {
            super(context);
            this.vertical = vertical;
            paint.setTypeface(RemoteWidgets.bold);
            paint.setTextSize(dp(10));
            setVisibility(GONE);
        }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = vertical ? dp(27) : dp(26) + (int)Math.ceil(paint.measureText("100%"));
            setMeasuredDimension(resolveSize(width, widthSpec), resolveSize(dp(vertical ? 29 : 18), heightSpec));
        }

        @Override protected void onDraw(Canvas canvas) {
            if (percent < 0 || getWidth() == 0 || getHeight() == 0) return;
            String label = percent + "%";
            paint.setColor(percent <= 20 ? RED : SECONDARY);
            float iconWidth = dp(20), iconHeight = dp(10), gap = dp(vertical ? 2 : 4);
            float textWidth = paint.measureText(label);
            Paint.FontMetrics font = paint.getFontMetrics();
            float textHeight = font.descent - font.ascent;
            float width = vertical ? Math.max(textWidth, iconWidth) : iconWidth + gap + textWidth;
            float height = vertical ? iconHeight + gap + textHeight : Math.max(iconHeight, textHeight);
            float scale = Math.min(1f, Math.min(getWidth() / width, getHeight() / height));
            canvas.save();
            canvas.translate((getWidth() - width * scale) / 2, (getHeight() - height * scale) / 2);
            canvas.scale(scale, scale);
            float x = vertical ? (width - iconWidth) / 2 : 0;
            float y = vertical ? 0 : (height - iconHeight) / 2;
            float right = x + iconWidth - dp(3);
            paint.setStrokeWidth(dp(1));
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawRoundRect(x + dp(1), y + dp(1), right, y + iconHeight - dp(1), dp(2), dp(2), paint);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawRoundRect(right + dp(1), y + dp(3), x + iconWidth, y + iconHeight - dp(3), dp(1), dp(1), paint);
            if (percent > 0) {
                float left = x + dp(3);
                canvas.drawRoundRect(left, y + dp(3), left + (right - dp(2) - left) * percent / 100f,
                    y + iconHeight - dp(3), dp(1), dp(1), paint);
            }
            float textX = vertical ? (width - textWidth) / 2 : iconWidth + gap;
            float textY = vertical ? iconHeight + gap : (height - textHeight) / 2;
            canvas.drawText(label, textX, textY - font.ascent, paint);
            canvas.restore();
        }

        void update(int next) {
            if (percent == next) return;
            percent = next;
            setVisibility(percent < 0 ? GONE : VISIBLE);
            if (percent < 0) return;
            setContentDescription(RemoteText.ui("Desktop battery") + " " + percent + "%");
            invalidate();
        }
    }
}
