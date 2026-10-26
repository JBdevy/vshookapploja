package com.hookdeveloper.catlive.remote;
import android.app.Dialog;import android.content.Context;import android.graphics.Rect;import android.view.*;import android.view.inputmethod.InputMethodManager;import android.widget.EditText;

final class RemoteKeyboard {
 private EditText outside;
 void before(Window window,MotionEvent event){
  if(event.getActionMasked()!=MotionEvent.ACTION_DOWN)return;outside=null;
  View focused=window.getCurrentFocus();if(!(focused instanceof EditText))return;
  if(editAt(window.getDecorView(),event.getRawX(),event.getRawY())!=null)return;
  outside=(EditText)focused;
 }
 void after(Window window,MotionEvent event){
  if(event.getActionMasked()==MotionEvent.ACTION_CANCEL){outside=null;return;}
  if(event.getActionMasked()!=MotionEvent.ACTION_UP||outside==null)return;
  EditText field=outside;outside=null;
  View focused=window.getCurrentFocus();if(focused instanceof EditText&&focused!=field)return;
  ((InputMethodManager)field.getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(window.getDecorView().getWindowToken(),0);
  // A focusable decor prevents Android immediately focusing the same field again.
  View decor=window.getDecorView();decor.setFocusableInTouchMode(true);
  if(decor instanceof ViewGroup){ViewGroup group=(ViewGroup)decor;int previous=group.getDescendantFocusability();group.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);decor.requestFocus();field.clearFocus();group.setDescendantFocusability(previous);}else{decor.requestFocus();field.clearFocus();}
 }
 private static EditText editAt(View view,float x,float y){
  if(!view.isShown())return null;int[] location=new int[2];view.getLocationOnScreen(location);Rect r=new Rect(location[0],location[1],location[0]+view.getWidth(),location[1]+view.getHeight());if(!r.contains((int)x,(int)y))return null;
  if(view instanceof EditText)return (EditText)view;
  if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=group.getChildCount()-1;i>=0;i--){EditText field=editAt(group.getChildAt(i),x,y);if(field!=null)return field;}}
  return null;
 }
 static final class KeyboardDialog extends Dialog {
  final RemoteKeyboard keyboard=new RemoteKeyboard();KeyboardDialog(Context context){super(context);}
  @Override public boolean dispatchTouchEvent(MotionEvent event){Window w=getWindow();keyboard.before(w,event);boolean result=super.dispatchTouchEvent(event);keyboard.after(w,event);return result;}
 }
}
