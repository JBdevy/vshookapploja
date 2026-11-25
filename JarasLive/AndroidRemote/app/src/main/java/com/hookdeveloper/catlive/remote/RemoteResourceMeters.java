package com.hookdeveloper.catlive.remote;

import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Debug;
import android.os.Process;
import android.os.SystemClock;
import android.view.View;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

final class RemoteResourceMeters extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private ScheduledExecutorService worker;
    private double cpu;
    private double ram;

    RemoteResourceMeters(Context context) { super(context); }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        ScheduledExecutorService sampling = Executors.newSingleThreadScheduledExecutor();
        worker = sampling;
        sampling.scheduleAtFixedRate(new Runnable() {
            long previousTime = SystemClock.elapsedRealtime();
            long previousCPU = Process.getElapsedCpuTime();
            long physical;
            final int processors = Math.max(1, Runtime.getRuntime().availableProcessors());

            @Override public void run() {
                if (physical == 0) {
                    ActivityManager manager = (ActivityManager)getContext().getSystemService(Context.ACTIVITY_SERVICE);
                    if (manager != null) {
                        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
                        manager.getMemoryInfo(memory);
                        physical = memory.totalMem;
                    }
                }
                long time = SystemClock.elapsedRealtime(), processCPU = Process.getElapsedCpuTime();
                double cpuLoad = (double)(processCPU - previousCPU) / Math.max(1, time - previousTime) / processors;
                previousTime = time;
                previousCPU = processCPU;
                double ramLoad = physical > 0 ? Debug.getPss() * 1024.0 / physical : 0;
                post(() -> {
                    if (worker != sampling) return;
                    cpu = Math.max(0, Math.min(1, cpuLoad));
                    ram = Math.max(0, Math.min(1, ramLoad));
                    setContentDescription("CPU " + Math.round(cpu*100) + "%, RAM " + Math.round(ram*100) + "%");
                    invalidate();
                });
            }
        }, 1, 1, TimeUnit.SECONDS);
    }

    @Override protected void onDetachedFromWindow() {
        if (worker != null) worker.shutdownNow();
        worker = null;
        super.onDetachedFromWindow();
    }

    @Override protected void onDraw(Canvas canvas) {
        float half = getWidth()/2f;
        meter(canvas, "CPU", cpu, 0, half);
        meter(canvas, "RAM", ram, half, half);
    }

    private void meter(Canvas canvas, String title, double value, float x, float width) {
        float y = getHeight()/2f, start = x+dp(24), end = x+width-dp(4);
        paint.setTypeface(bold);
        paint.setTextSize(dp(8));
        paint.setColor(SECONDARY);
        canvas.drawText(title,x,y-(paint.ascent()+paint.descent())/2,paint);
        paint.setColor(0x26ffffff);
        canvas.drawRoundRect(start,y-dp(2),end,y+dp(2),dp(2),dp(2),paint);
        paint.setColor(GREEN);
        canvas.drawRoundRect(start,y-dp(2),start+(end-start)*(float)value,y+dp(2),dp(2),dp(2),paint);
    }
}
