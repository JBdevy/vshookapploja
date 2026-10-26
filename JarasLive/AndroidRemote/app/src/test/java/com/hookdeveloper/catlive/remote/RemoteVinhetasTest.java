package com.hookdeveloper.catlive.remote;
import android.view.*;import android.widget.*;import java.nio.charset.StandardCharsets;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteVinhetasTest {
 ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();JSONObject state=new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));JSONArray banks=new JSONArray();for(int p=0;p<6;p++){JSONArray pads=new JSONArray();for(int n=0;n<16;n++)pads.put(new JSONObject().put("name","Sample "+(n+1)).put("color",0x123456).put("volume",1).put("gate",false).put("loaded",true).put("active",false));banks.put(new JSONObject().put("name","Bank "+(p+1)).put("color",0x654321).put("pads",pads));}state.put("vinhetas",new JSONObject().put("selectedPreset",0).put("available",true).put("presets",banks));app.entering=true;app.remote.connected=true;app.remote.mode="director";app.remote.state=state;app.onChanged();}
 @After public void close(){controller.pause().stop().destroy();}
 void layout(){app.root.measure(View.MeasureSpec.makeMeasureSpec(393,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(851,View.MeasureSpec.EXACTLY));app.root.layout(0,0,393,851);}
 @Test public void phoneUsesTwoPagesEightPadsNoTransportOrSetupControls(){app.choose("vinhetas");layout();assertNotNull(app.vinhetas);assertEquals(16,app.vinhetas.pads.size());assertEquals(6,app.vinhetas.presets.length);assertNull(app.current);assertNull(app.nextDisplay);assertNull(app.tabScroll.getParent());assertEquals(app.rail.indexOfChild(app.railButtons.get("parts"))-1,app.rail.indexOfChild(app.railButtons.get("vinhetas")));String text=text(app.vinhetas);assertTrue(text.contains("Panic"));assertFalse(text.contains("Create Track"));assertFalse(text.contains("MIDI"));assertNotNull(find(app.vinhetas,RemoteVinhetas.PagedScroll.class));assertTrue((app.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)!=0);}
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletUsesSameNativeEightByTwoLayout(){app.railButtons.get("vinhetas").performClick();assertEquals("grid",app.panel);assertNotNull(app.grid);assertEquals(16,app.vinhetas.pads.size());assertNull(find(app.vinhetas,RemoteVinhetas.PagedScroll.class));LinearLayout pages=(LinearLayout)app.vinhetas.getChildAt(app.vinhetas.getChildCount()-1);assertEquals(2,pages.getChildCount());assertEquals(8,((LinearLayout)pages.getChildAt(0)).getChildCount());}
 @Test public void stateUpdatesSelectedBankLabelsAndActivePads()throws Exception{app.choose("vinhetas");app.state.getJSONObject("vinhetas").put("selectedPreset",3);app.state.getJSONObject("vinhetas").getJSONArray("presets").getJSONObject(3).getJSONArray("pads").getJSONObject(0).put("name","Entrada").put("gate",true).put("active",true);app.refresh();assertEquals(3,app.vinhetas.selected);assertEquals("Entrada",app.vinhetas.pads.get(0).surface.getContentDescription());assertEquals("Gate\nOn",app.vinhetas.pads.get(0).gate.getText().toString());}
 @Test public void padLightsLocallyAndIgnoresOldHostStateUntilTriggerAcknowledged()throws Exception{
  app.choose("vinhetas");RemoteVinhetas.PadSurface pad=app.vinhetas.pads.get(0).surface;
  JSONObject host=app.state.getJSONObject("vinhetas"),item=host.getJSONArray("presets").getJSONObject(0).getJSONArray("pads").getJSONObject(0);
  long now=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,10,10,0),up=MotionEvent.obtain(now,now+10,MotionEvent.ACTION_UP,10,10,0);
  pad.onTouchEvent(down);assertTrue(pad.litBanks.contains(0));String token=pad.press.getString("target");pad.onTouchEvent(up);app.refresh();assertTrue(pad.litBanks.contains(0));
  app.choose("grid");app.choose("vinhetas");pad=app.vinhetas.pads.get(0).surface;assertTrue(pad.litBanks.contains(0));
  host.put("receivedPresses",new JSONArray().put(token));app.refresh();assertFalse(pad.litBanks.contains(0));
  item.put("active",true);app.refresh();assertFalse(pad.litBanks.contains(0));
  item.put("gate",true);app.refresh();pad.onTouchEvent(down);assertTrue(pad.litBanks.contains(0));pad.onTouchEvent(up);assertFalse(pad.litBanks.contains(0));
  down.recycle();up.recycle();
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletMasterIsAboveGridWithPanAndNoDuplicateMixerMaster()throws Exception{
  app.state.put("masterPan",-.5);app.state.getJSONArray("tracks").getJSONObject(0).put("instrumentIcon","piano");app.buildWorkspace();app.refresh();
  MainActivity.TrackRow master=app.trackRows.get("master");assertNotNull(master);assertTrue(isDescendant(master,app.transport));
  assertEquals(RemoteWidgets.dp(220),master.getLayoutParams().width);assertNotNull(master.pan);assertEquals(-.5,master.pan.value,0);
  assertEquals(RemoteWidgets.dp(80),master.pan.getLayoutParams().width);assertEquals("",app.repeat.getText().toString());
  assertNull(master.iconView.getParent());assertEquals("repeat",app.repeat.icon);assertEquals(RemoteWidgets.dp(34),app.railButtons.get("parts").getLayoutParams().width);
 }
 static boolean isDescendant(View child,View ancestor){for(android.view.ViewParent p=child.getParent();p!=null;p=p.getParent())if(p==ancestor)return true;return false;}
 @Test public void phonePadsHaveVisibleHeightOnFirstLayoutAndBothPagesFillViewport(){
  app.choose("vinhetas");layout();
  RemoteVinhetas.PagedScroll scroll=(RemoteVinhetas.PagedScroll)find(app.vinhetas,RemoteVinhetas.PagedScroll.class);
  LinearLayout pages=(LinearLayout)scroll.getChildAt(0);
  assertTrue("Pad viewport must have height",scroll.getHeight()>100);
  assertEquals("First page fills viewport on its first layout",scroll.getHeight(),pages.getChildAt(0).getHeight());
  assertEquals("Second page has the same height",scroll.getHeight(),pages.getChildAt(1).getHeight());
  assertEquals("Second page starts after the first",scroll.getHeight(),pages.getChildAt(1).getTop());
  for(RemoteVinhetas.PadCell pad:app.vinhetas.pads){assertTrue("Pad "+pad.index+" must be visible",pad.surface.getHeight()>RemoteWidgets.dp(40));assertTrue(pad.surface.getWidth()>RemoteWidgets.dp(40));}
  scroll.scrollTo(0,scroll.getHeight());assertEquals(scroll.getHeight(),scroll.getScrollY());
 }
 @Test public void gateUpdatesBeforeHostEchoAndImmediatePadUsesLocalGate()throws Exception{
  app.choose("vinhetas");RemoteVinhetas.PadCell cell=app.vinhetas.pads.get(0);
  cell.gate.performClick();assertEquals("Gate\nOn",cell.gate.getText().toString());
  assertFalse(app.state.getJSONObject("vinhetas").getJSONArray("presets").getJSONObject(0).getJSONArray("pads").getJSONObject(0).getBoolean("gate"));
  app.refresh();assertEquals("Gate\nOn",cell.gate.getText().toString());
  long now=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,10,10,0),up=MotionEvent.obtain(now,now+20,MotionEvent.ACTION_UP,10,10,0);
  cell.surface.onTouchEvent(down);assertTrue(cell.surface.litBanks.contains(0));cell.surface.onTouchEvent(up);assertFalse(cell.surface.litBanks.contains(0));down.recycle();up.recycle();
  app.choose("grid");app.choose("vinhetas");assertEquals("Gate\nOn",app.vinhetas.pads.get(0).gate.getText().toString());
 }
 @Test public void rapidGateTapsIgnoreIntermediateEchoAndLaterDesktopChangesStillApply()throws Exception{
  app.choose("vinhetas");RemoteVinhetas.PadCell cell=app.vinhetas.pads.get(0);JSONObject pad=app.state.getJSONObject("vinhetas").getJSONArray("presets").getJSONObject(0).getJSONArray("pads").getJSONObject(0);
  cell.gate.performClick();cell.gate.performClick();assertEquals("Gate\nOff",cell.gate.getText().toString());
  app.refresh();pad.put("gate",true);app.refresh();assertEquals("Gate\nOff",cell.gate.getText().toString());
  pad.put("gate",false);app.refresh();pad.put("gate",true);app.refresh();assertEquals("Gate\nOn",cell.gate.getText().toString());
 }
 @Test public void padFaderHasLargerTouchAreaDoubleTapUnityAndIgnoresStaleGain(){
  app.choose("vinhetas");layout();RemoteVinhetas.Fader fader=app.vinhetas.pads.get(0).fader;assertTrue(fader.getHeight()>=RemoteWidgets.dp(44));
  fader.confirm(.5);doubleTap(fader,20,fader.getHeight()-1);assertEquals(1,fader.gain,0);
  fader.confirm(.5);assertEquals(1,fader.gain,0);fader.confirm(1);fader.confirm(.8);assertEquals(1,fader.gain,0);
 }
 @Test public void trackFaderDoubleTapUnityAndIgnoresOldSnapshotsAfterRelease(){
  final double[] sent={0};RemoteWidgets.Fader fader=new RemoteWidgets.Fader(app,false,v->sent[0]=v);fader.layout(0,0,240,44);fader.update(.5);
  doubleTap(fader,20,42);assertEquals(1,fader.value,0);assertEquals(1,sent[0],0);
  fader.update(.5);assertEquals(1,fader.value,0);fader.update(1);fader.update(.8);assertEquals(1,fader.value,0);
 }
 @Test public void reorderedRegionSnapshotMustNotReplaceTrackFaderDuringDrag()throws Exception{
  app.choose("mixer");layout();String id=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");MainActivity.TrackRow original=app.trackRows.get(id);assertNotNull(original);
  original.volume.dragging=true;original.volume.commit(.25);
  JSONArray regions=app.state.getJSONArray("regions");JSONObject region=regions.getJSONObject(0);java.util.List<String> keys=new java.util.ArrayList<>();region.keys().forEachRemaining(keys::add);java.util.Collections.reverse(keys);JSONObject reordered=new JSONObject();for(String key:keys)reordered.put(key,region.get(key));regions.put(0,reordered);
  app.refresh();assertSame("Equivalent host snapshots must retain the active fader",original,app.trackRows.get(id));assertEquals(.25,original.volume.value,0);assertTrue(original.volume.dragging);
 }
 @Test public void unrelatedSetlistChangeMustNotResetPendingTrackGain()throws Exception{
  app.choose("mixer");layout();String id=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");MainActivity.TrackRow original=app.trackRows.get(id);original.volume.commit(.25);
  app.state.getJSONArray("regions").getJSONObject(0).put("name","Changed setlist title");app.refresh();
  assertSame("Setlist refresh cannot reconstruct mixer controls",original,app.trackRows.get(id));assertEquals(.25,app.trackRows.get(id).volume.value,0);
 }
 static void doubleTap(View fader,float x,float y){for(int n=0;n<2;n++){long now=android.os.SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+10,MotionEvent.ACTION_UP,x,y,0);fader.onTouchEvent(down);fader.onTouchEvent(up);down.recycle();up.recycle();if(n==0)org.robolectric.shadows.ShadowLooper.idleMainLooper(80,java.util.concurrent.TimeUnit.MILLISECONDS);}}
 static View find(View view,Class<?> type){if(type.isInstance(view))return view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){View found=find(group.getChildAt(i),type);if(found!=null)return found;}}return null;}
 static String text(View view){StringBuilder s=new StringBuilder(view instanceof TextView?((TextView)view).getText():"");if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)s.append('\n').append(text(group.getChildAt(i)));}return s.toString();}

 @Test public void presetAndItsFaderChangeLocallyWithoutLeakingPreviousPresetGain()throws Exception{
  JSONObject host=app.state;host.getJSONObject("vinhetas").getJSONArray("presets").getJSONObject(1).getJSONArray("pads").getJSONObject(0).put("volume",.25);
  app.choose("vinhetas");RemoteVinhetas.Fader fader=app.vinhetas.pads.get(0).fader;fader.commit(1.5);app.vinhetas.presets[1].performClick();assertEquals(1,app.vinhetas.selected);assertEquals(.25,fader.gain,0);
  app.vinhetas.presets[0].performClick();assertEquals(0,app.vinhetas.selected);assertEquals(1.5,fader.gain,0);assertEquals(0,host.getJSONObject("vinhetas").getInt("selectedPreset"));
 }
}
