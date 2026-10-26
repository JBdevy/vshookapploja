package com.hookdeveloper.catlive.remote;

import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import android.view.View;

/** The complete 600 x 280 Apple/desktop startup panel, scaled uniformly to fit. */
final class RemoteStartup extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private final Bitmap logo;
    private final long started=SystemClock.uptimeMillis();
    RemoteStartup(Context context){super(context);logo=BitmapFactory.decodeResource(getResources(),R.drawable.catlive_logo);setContentDescription("CatLive · Version "+BuildConfig.VERSION_NAME);}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float density=getResources().getDisplayMetrics().density;
        float scale=Math.max(.01f,Math.min(density,Math.min((getWidth()-32*density)/600f,(getHeight()-32*density)/280f)));
        canvas.save();canvas.translate((getWidth()-600*scale)/2,(getHeight()-280*scale)/2);canvas.scale(scale,scale);
        paint.setColor(0xff222222);canvas.drawRoundRect(0,0,600,280,12,12,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(0x1fffffff);canvas.drawRoundRect(.5f,.5f,599.5f,279.5f,12,12,paint);paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.WHITE);
        if(logo!=null){float fit=Math.min(192f/logo.getWidth(),232f/logo.getHeight());float w=logo.getWidth()*fit,h=logo.getHeight()*fit;canvas.drawBitmap(logo,null,new RectF((240-w)/2,(280-h)/2,(240+w)/2,(280+h)/2),paint);}
        paint.setColor(0x1fffffff);canvas.drawRect(240,0,241,280,paint);
        paint.setColor(Color.WHITE);paint.setShader(new LinearGradient(265,70,570,130,0xff72ffb3,0xff00cf64,Shader.TileMode.CLAMP));
        float[] bars={10,20,30,38,26,18,8};for(int i=0;i<bars.length;i++)canvas.drawRoundRect(265+i*5,99-bars[i]/2,268+i*5,99+bars[i]/2,1.5f,1.5f,paint);
        paint.setTypeface(RemoteWidgets.bold);paint.setTextSize(54);canvas.drawText("CatLive",308,118,paint);paint.setShader(null);
        paint.setTypeface(RemoteWidgets.regular);paint.setTextSize(12);paint.setColor(RemoteWidgets.SECONDARY);canvas.drawText("Version "+BuildConfig.VERSION_NAME,265,146,paint);
        paint.setColor(0x2469ed91);canvas.drawRoundRect(265,204,576,209,2.5f,2.5f,paint);
        float progress=Math.min(1,(SystemClock.uptimeMillis()-started)/3000f);paint.setColor(RemoteWidgets.GREEN);canvas.drawRoundRect(265,204,265+311*progress,209,2.5f,2.5f,paint);
        paint.setColor(RemoteWidgets.SECONDARY);canvas.drawText(RemoteText.ui("Starting…"),265,231,paint);paint.setTextSize(10);canvas.drawText("© reivsoficial",265,248,paint);
        canvas.restore();if(progress<1)postInvalidateOnAnimation();
    }
}
