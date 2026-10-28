package com.hookdeveloper.catlive.remote;
import android.view.*;import android.widget.*;import java.nio.charset.StandardCharsets;import java.util.*;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemotePartsTest {
 ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();app.entering=true;app.remote.connected=true;app.remote.mode="director";app.remote.state=new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));app.onChanged();}
 @After public void close(){controller.pause().stop().destroy();}
 @Test public void currentAndQueuedBanksUseHostSectionRegionsAndIncludeStart()throws Exception{
  JSONObject state=app.state,playback=state.getJSONObject("sectionPlayback");JSONArray regions=state.getJSONArray("timelineRegions");String first=regions.getJSONObject(0).getString("id"),second=regions.getJSONObject(1).getString("id");
  playback.put("secondaryRegion",second);state.getJSONArray("markers").put(new JSONObject().put("id","QUEUED-MARKER").put("name","Solo").put("position",30).put("section",true));
  // The grid can show the other region. Parts must still use the transport bank.
  state.put("gridRegion",second);RemoteParts parts=new RemoteParts(app);assertEquals(2,parts.sections.size());assertEquals(first,parts.sections.get(0).id);assertEquals(0,parts.sections.get(0).start,0);assertEquals("REFRÃO",parts.sections.get(1).name);
  parts.queuedTab.performClick();assertTrue(parts.secondary);assertEquals(2,parts.sections.size());assertEquals(second,parts.sections.get(0).id);assertEquals(24,parts.sections.get(0).start,0);assertEquals("SOLO",parts.sections.get(1).name);
  state.put("subPlaying",true);parts.refresh();assertEquals(RemoteText.ui("Queued"),parts.queuedTab.title.getText().toString());
  state.put("playing",false);parts.refresh();assertEquals(RemoteText.ui("Selected song"),parts.currentTab.title.getText().toString());
  state.put("playing",true);parts.refresh();assertEquals(RemoteText.ui("Now playing"),parts.currentTab.title.getText().toString());assertEquals(View.GONE,parts.currentTab.name.getVisibility());parts.currentTab.performClick();assertFalse(parts.secondary);assertEquals(first,parts.sections.get(0).id);
 }
 @Test public void startMarkerAndCancelSendCorrectCommandsAndCancelFollowsHost()throws Exception{
  List<String> sent=new ArrayList<>();RemoteParts parts=new RemoteParts(app,sent::add,()->sent.add("cancelSection"));assertFalse(parts.cancel.isEnabled());assertEquals(1,parts.cancel.getAlpha(),0);
  parts.sections.get(0).performClick();parts.sections.get(1).performClick();assertEquals(app.state.getJSONArray("timelineRegions").getJSONObject(0).getString("id"),sent.get(0));assertEquals(app.state.getJSONArray("markers").getJSONObject(0).getString("id"),sent.get(1));
  app.state.getJSONObject("sectionPlayback").put("queuedMarker",sent.get(1));parts.refresh();assertTrue(parts.cancel.isEnabled());assertTrue(parts.sections.get(1).armed);parts.cancel.performClick();assertEquals("cancelSection",sent.get(2));
  app.state.getJSONObject("sectionPlayback").remove("queuedMarker");parts.refresh();assertFalse(parts.cancel.isEnabled());assertEquals(1,parts.cancel.getAlpha(),0);
 }
 @Test public void countdownAndPlayingProgressAdvanceWithoutRecreatingRows()throws Exception{
  app.remote.connected=false;JSONObject state=app.state,playback=state.getJSONObject("sectionPlayback");String marker=state.getJSONArray("markers").getJSONObject(0).getString("id");state.put("playing",true).put("position",12);playback.put("position",12).put("queuedMarker",marker).put("nextTrigger",14).put("queueStartedAt",10);
  RemoteParts parts=new RemoteParts(app);RemoteParts.SectionRow row=parts.sections.get(1);assertEquals(.5,row.fraction(),.00001);
  state.put("position",13);playback.put("position",13);parts.refresh();assertSame(row,parts.sections.get(1));assertEquals(.25,row.fraction(),.00001);
  playback.remove("queuedMarker");parts.refresh();assertTrue(row.playing);assertEquals(3.0/14,row.fraction(),.00001);
  playback.remove("currentRegion");parts.refresh();assertTrue(parts.sections.isEmpty());
 }
 @Test public void sidebarAndSetlistPartsButtonOpenTheSameControls(){
  app.railButtons.get("parts").performClick();assertNotNull(app.parts);assertNotNull(app.parts.cancel);assertNotNull(app.parts.currentTab);assertNotNull(app.parts.queuedTab);
  app.choose("setlist");View partsButton=findText(app.setlistColumn,"Parts");assertNotNull(partsButton);partsButton.performClick();assertNotNull(app.parts);assertEquals(2,app.parts.sections.size());
 }
 @Test public void phonePartsKeepsFooterFromBothEntryPointsAndFooterReturnsToSetlist(){
  for(boolean sidebar:new boolean[]{true,false}){
   if(!app.panel.equals("setlist"))app.choose("setlist");
   if(sidebar)app.railButtons.get("parts").performClick();else findText(app.setlistColumn,"Parts").performClick();
   assertEquals("parts",app.panel);assertNotNull(app.parts);assertNotNull(app.bypass);assertNotNull(app.live);
   assertNotNull(app.bypass.getParent());assertNotNull(app.live.getParent());
   View footerButton=findText(app.column,"Parts");assertNotNull(footerButton);footerButton.performClick();
   assertEquals("setlist",app.panel);assertNull(app.parts);assertNotNull(app.setlistColumn);
  }
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletSidebarAndSetlistButtonShareThePartsPanel(){
  app.railButtons.get("parts").performClick();assertTrue(app.partsShown);assertNotNull(app.parts);assertNotNull(app.parts.cancel);
  View button=findText(app.setlistColumn,"Parts");assertNotNull(button);button.performClick();assertFalse(app.partsShown);assertNull(app.parts);
  button=findText(app.setlistColumn,"Parts");button.performClick();assertTrue(app.partsShown);assertNotNull(app.parts);assertEquals(2,app.parts.sections.size());
 }
 static View findText(View view,String text){if(view instanceof TextView&&((TextView)view).getText().toString().equals(text))return view;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++){View child=findText(group.getChildAt(i),text);if(child!=null)return child;}}return null;}
}
