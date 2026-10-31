package com.hookdeveloper.catlive.remote;
import android.app.*;import android.content.Context;import android.view.*;import android.view.inputmethod.InputMethodManager;import android.widget.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.atomic.AtomicInteger;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteInteractionTest {
 ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();app.entering=true;app.remote.connected=true;app.remote.mode="director";app.remote.state=new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));app.onChanged();}
 @After public void close(){controller.pause().stop().destroy();}
 void layout(View view){view.measure(View.MeasureSpec.makeMeasureSpec(393,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(851,View.MeasureSpec.EXACTLY));view.layout(0,0,393,851);}
 void tap(Window window,View target,boolean dialog){int[] p=new int[2];target.getLocationOnScreen(p);float x=p[0]+target.getWidth()/2f,y=p[1]+target.getHeight()/2f;for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent e=MotionEvent.obtain(0,1,action,x,y,0);int[] origin=new int[2];window.getDecorView().getLocationOnScreen(origin);e.offsetLocation(-origin[0],-origin[1]);if(dialog)app.activeDialog.dispatchTouchEvent(e);else app.dispatchTouchEvent(e);e.recycle();}Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();}
 EditText firstEdit(View v){if(v instanceof EditText)return (EditText)v;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){EditText f=firstEdit(g.getChildAt(i));if(f!=null)return f;}}return null;}
 @Test public void outsideTouchDismissesSearchKeyboardAndStillActivatesTheButton(){layout(app.getWindow().getDecorView());app.search.requestFocus();InputMethodManager input=(InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE);input.showSoftInput(app.search,0);assertTrue("keyboard shown",Shadows.shadowOf(input).isSoftInputVisible());AtomicInteger clicks=new AtomicInteger();app.playlistButton.setOnClickListener(v->clicks.incrementAndGet());tap(app.getWindow(),app.playlistButton,false);assertEquals("button clicked",1,clicks.get());assertFalse("keyboard hidden",Shadows.shadowOf(input).isSoftInputVisible());assertFalse("focus cleared",app.search.hasFocus());}
 @Test public void tappingInsideFieldKeepsKeyboardAndText(){layout(app.getWindow().getDecorView());app.search.setText("Jesus");app.search.requestFocus();InputMethodManager input=(InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE);input.showSoftInput(app.search,0);tap(app.getWindow(),app.search,false);assertTrue("keyboard shown",Shadows.shadowOf(input).isSoftInputVisible());assertEquals("Jesus",app.search.getText().toString());}
 @Test public void dialogTouchOutsideTheFieldDismissesKeyboardWithoutClosingDialog(){app.input("Keyboard test","Original",false,value->{});Dialog d=app.activeDialog;Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();layout(d.getWindow().getDecorView());EditText field=firstEdit(d.getWindow().getDecorView());field.requestFocus();InputMethodManager input=(InputMethodManager)app.getSystemService(Context.INPUT_METHOD_SERVICE);input.showSoftInput(field,0);View heading=RemotePartsTest.findText(d.getWindow().getDecorView(),"Keyboard test");assertNotNull(heading);tap(d.getWindow(),heading,true);assertTrue("dialog kept",d.isShowing());assertFalse("keyboard hidden",Shadows.shadowOf(input).isSoftInputVisible());assertEquals("Original",field.getText().toString());}
 @Test public void stoppedNoticePinKeepsDraftSelectionAndRespondsBeforeDesktopReply()throws Exception{
  JSONObject notices=app.remote.state.getJSONObject("notices");notices.put("pinWhenStopped",false).put("stoppedNoticeActive",false);app.onChanged();app.choose("notices");layout(app.getWindow().getDecorView());
  assertEquals(View.VISIBLE,app.noticePinStopped.getVisibility());assertFalse(app.noticePinStopped.isEnabled());
  app.selectNoticeSlot(1);app.noticeEditor.setText("Aviso da pausa");assertTrue(app.noticePinStopped.isEnabled());app.noticePinStopped.performClick();
  assertTrue(app.state.getJSONObject("notices").getBoolean("pinWhenStopped"));assertEquals(RemoteWidgets.YELLOW,app.noticePinStopped.getCurrentTextColor());
  assertEquals(1,app.noticeSlot);assertEquals("Aviso da pausa",app.noticeEditor.getText().toString());
  int[] pin=new int[2],stopped=new int[2];app.noticePin.getLocationOnScreen(pin);app.noticePinStopped.getLocationOnScreen(stopped);assertTrue(stopped[0]>=pin[0]+app.noticePin.getWidth());assertEquals(pin[1],stopped[1]);assertTrue(app.noticePinStopped.getWidth()>=44);assertTrue(app.noticePinStopped.getHeight()>=44);
  app.noticeEditor.setText("");assertTrue(app.noticePinStopped.isEnabled());app.noticePinStopped.performClick();assertFalse(app.state.getJSONObject("notices").getBoolean("pinWhenStopped"));
 }
 @Test public void stoppedNoticePinIsHiddenForOlderHosts()throws Exception{
  app.remote.state.getJSONObject("notices").remove("pinWhenStopped");app.onChanged();app.choose("notices");assertEquals(View.GONE,app.noticePinStopped.getVisibility());
 }
 @Test public void muteAndSoloChangeVisuallyBeforeAnyDesktopReply(){app.choose("mixer");MainActivity.TrackRow row=app.trackRows.values().stream().filter(r->r.id!=null).findFirst().get();assertEquals(android.graphics.Color.WHITE,row.mute.getCurrentTextColor());row.mute.performClick();assertTrue(row.mute.active);assertEquals(android.graphics.Color.BLACK,row.mute.getCurrentTextColor());row.solo.performClick();assertTrue(row.solo.active);row.mute.performClick();assertFalse(row.mute.active);assertTrue(row.solo.active);}
 @Test public void hierarchyHandlesNestedAndLastChildrenWithoutRecreatingFaders()throws Exception{
  JSONArray tracks=new JSONArray("[{\"id\":\"A\",\"name\":\"Grupo\"},{\"id\":\"B\",\"name\":\"Subgrupo\",\"parentTrack\":\"A\"},{\"id\":\"C\",\"name\":\"Filho\",\"parentTrack\":\"B\"},{\"id\":\"D\",\"name\":\"Último\",\"parentTrack\":\"A\"}]");app.state.put("tracks",tracks);app.choose("mixer");
  MainActivity.TrackRow b=app.trackRows.get("B"),c=app.trackRows.get("C"),d=app.trackRows.get("D");assertEquals(1,b.groupGuide.depth);assertFalse(b.groupGuide.last);assertEquals(2,c.groupGuide.depth);assertTrue(c.groupGuide.last);assertEquals(1,d.groupGuide.depth);assertTrue(d.groupGuide.last);assertEquals(RemoteWidgets.dp(24),c.groupGuide.getLayoutParams().width);
  assertEquals(View.VISIBLE,app.trackRows.get("A").folderIcon.getVisibility());assertEquals(View.VISIBLE,b.folderIcon.getVisibility());assertEquals(View.GONE,c.folderIcon.getVisibility());assertEquals("folder.nested",b.folderIcon.key);assertEquals("folder",app.trackRows.get("A").folderIcon.key);assertFalse(b.folderIcon.isClickable());assertFalse(b.folderIcon.isFocusable());assertFalse(b.folderIcon.performClick());
  Object fader=c.volume;tracks.getJSONObject(2).remove("parentTrack");app.refresh();assertSame(c,app.trackRows.get("C"));assertSame(fader,c.volume);assertEquals(0,c.groupGuide.getLayoutParams().width);assertEquals(View.GONE,b.folderIcon.getVisibility());
 }
 @Test public void cyclicParentMetadataCannotHangHierarchy()throws Exception{JSONArray tracks=new JSONArray("[{\"id\":\"A\",\"parentTrack\":\"B\"},{\"id\":\"B\",\"parentTrack\":\"A\"}]");assertEquals(Arrays.asList("B"),RemoteGroupGuide.ancestors(tracks,"A"));}

 @Test public void trackAndGridTurnGrayTogetherWithoutDesktopSnapshot()throws Exception{
  app.choose("mixer");MainActivity.TrackRow row=app.trackRows.values().stream().filter(r->r.id!=null).findFirst().get();int color=((android.graphics.drawable.ColorDrawable)row.strip.getBackground()).getColor();
  row.mute.performClick();int gray=((android.graphics.drawable.ColorDrawable)row.strip.getBackground()).getColor();assertEquals(android.graphics.Color.red(gray),android.graphics.Color.green(gray));assertEquals(android.graphics.Color.green(gray),android.graphics.Color.blue(gray));assertTrue(app.layout.entries.get(row.id).track.getBoolean("silenced"));
  row.mute.performClick();assertEquals(color,((android.graphics.drawable.ColorDrawable)row.strip.getBackground()).getColor());assertFalse(app.layout.entries.get(row.id).track.getBoolean("silenced"));
 }
 @Test public void tappingBelowRulerMovesNeedleImmediatelyAndOldSnapshotCannotUndoIt()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,393,600);grid.onDraw(new android.graphics.Canvas());
  long time=android.os.SystemClock.uptimeMillis();for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent e=MotionEvent.obtain(time,time+10,action,196,300,0);grid.onTouchEvent(e);e.recycle();}
  assertEquals(196/393.0*24,app.state.getDouble("editPosition"),.01);assertEquals(app.state.getDouble("editPosition"),app.displayPosition(),.01);
  assertEquals(app.state.getDouble("editPosition"),app.remote.feedback.receive(app.remote.confirmedState,android.os.SystemClock.elapsedRealtime()).getDouble("editPosition"),.01);
 }

 @Test public void seekTargetsSelectedChildWhileGridDisplaysUnifiedParent()throws Exception{
  JSONObject parent=app.state.getJSONArray("timelineRegions").getJSONObject(0);parent.put("end",100);String root=parent.getString("id"),child="00000000-0000-4000-8000-000000000099";
  app.state.getJSONArray("timelineRegions").put(new JSONObject().put("id",child).put("parentRegion",root).put("start",20).put("end",40));app.state.put("focusedRegion",child).put("gridRegion",root);app.visibleRegion=RemoteModel.gridRegion(app.state);app.choose("grid");app.grid.layout(0,0,400,600);app.grid.onDraw(new android.graphics.Canvas());
  assertEquals(child,app.grid.seekTarget());assertEquals(30,app.grid.seekSeconds(120),.01);assertEquals(40,app.grid.seekSeconds(350),.01);
 }
 @Test public void draggingGridScrollsWithoutSendingSeek()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,393,600);grid.onDraw(new android.graphics.Canvas());long t=android.os.SystemClock.uptimeMillis();
  int[] actions={MotionEvent.ACTION_DOWN,MotionEvent.ACTION_MOVE,MotionEvent.ACTION_UP};float[] xs={300,150,150};
  for(int i=0;i<3;i++){MotionEvent e=MotionEvent.obtain(t,t+i*40,actions[i],xs[i],300,0);grid.onTouchEvent(e);e.recycle();}
  assertEquals(0,app.state.getDouble("editPosition"),0);assertTrue(app.remote.feedback.pending.isEmpty());
 }

 @Test public void rulerChangesNeedleOnlyOnReleaseAndCancelledPressDoesNothing()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,393,600);grid.onDraw(new android.graphics.Canvas());long t=android.os.SystemClock.uptimeMillis();float y=RemoteWidgets.dp(RemoteTimeline.RULER_TOP+2);
  for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_MOVE}){MotionEvent e=MotionEvent.obtain(t,t+10,action,196,y,0);grid.onTouchEvent(e);e.recycle();assertTrue(Double.isNaN(grid.needlePreview));assertEquals(0,app.state.getDouble("editPosition"),0);assertTrue(app.remote.feedback.pending.isEmpty());}
  MotionEvent cancel=MotionEvent.obtain(t,t+20,MotionEvent.ACTION_CANCEL,196,y,0);grid.onTouchEvent(cancel);cancel.recycle();assertEquals(0,app.state.getDouble("editPosition"),0);
  for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent e=MotionEvent.obtain(t+30,t+40,action,196,y,0);grid.onTouchEvent(e);e.recycle();}
  assertEquals(196/393.0*24,app.state.getDouble("editPosition"),.01);assertEquals(app.state.getDouble("editPosition"),grid.needlePreview,.01);
 }

 @Test public void itemHeaderMuteTogglesOnReleaseWithoutSeekingAndUpdatesGridImmediately()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,393,600);grid.onDraw(new android.graphics.Canvas());RemoteGrid.Hit hit=grid.hits.get(0);String id=RemoteModel.id(hit.clip,"id");long t=android.os.SystemClock.uptimeMillis();
  MotionEvent down=MotionEvent.obtain(t,t,MotionEvent.ACTION_DOWN,hit.mute.centerX(),hit.mute.centerY(),0);grid.onTouchEvent(down);down.recycle();assertFalse(RemoteFeedback.target(app.state,"clips",id).optBoolean("muted"));
  MotionEvent up=MotionEvent.obtain(t,t+20,MotionEvent.ACTION_UP,hit.mute.centerX(),hit.mute.centerY(),0);grid.onTouchEvent(up);up.recycle();assertTrue(RemoteFeedback.target(app.state,"clips",id).getBoolean("muted"));assertEquals(0,app.state.getDouble("editPosition"),0);assertTrue(app.layout.ordered.get(0).clips.get(0).getBoolean("muted"));
 }
 @Test public void zoomedItemUsesVisibleSliceDuringPlaybackTicks()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,393,600);grid.zoom=4;grid.offset=6;grid.onDraw(new android.graphics.Canvas());assertFalse(grid.hits.isEmpty());RemoteGrid.Hit hit=grid.hits.get(0);assertTrue(hit.rect.left>=0);assertTrue(hit.rect.right<=393);
  for(int i=0;i<20;i++){app.state.put("position",6+i*.01);grid.onDraw(new android.graphics.Canvas());}assertTrue(grid.hits.get(0).rect.left>=0);assertTrue(grid.hits.get(0).rect.right<=393);
 }

 @Test public void remoteMixerHasNoNumericPeakReadout()throws Exception{
  app.state.put("masterPeakDB",-1.23);for(JSONObject track:RemoteModel.list(RemoteModel.array(app.state,"tracks")))track.put("peakDB",-1.23);
  app.choose("mixer");for(MainActivity.TrackRow row:app.trackRows.values())assertEquals("Only volume value and fader belong on this line",2,row.line.getChildCount());
 }
}
