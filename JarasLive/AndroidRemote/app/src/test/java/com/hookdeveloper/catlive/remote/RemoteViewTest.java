package com.hookdeveloper.catlive.remote;
import android.content.res.Configuration;import android.view.*;import android.widget.*;import java.nio.charset.StandardCharsets;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteViewTest {
 ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start(){controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();}
 @After public void close(){controller.pause().stop().destroy();}
 JSONObject state()throws Exception{return new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));}
 void connect(String mode)throws Exception{app.entering=true;app.remote.connected=true;app.remote.mode=mode;app.remote.state=state();app.onChanged();app.root.measure(View.MeasureSpec.makeMeasureSpec(393,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(851,View.MeasureSpec.EXACTLY));app.root.layout(0,0,393,851);}
 @Test public void footerNoticeExpiresDespiteRepeatedStatePackets()throws Exception{
  connect("director");app.state.put("message","Salvo").put("footerInformation","Ignore Next");app.refresh();assertEquals("Salvo",app.information.getText().toString());
  for(int i=0;i<6;i++){Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(1));app.refresh();}
  assertEquals("Ignore Next",app.information.getText().toString());
  app.state.put("message","Novo aviso");app.refresh();assertEquals("Novo aviso",app.information.getText().toString());
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletFooterAlsoShowsAndExpiresNotices()throws Exception{
  connect("director");assertNotNull(app.tabletInformation);app.state.put("message","Salvo").put("loop",true);app.refresh();assertEquals("Salvo",app.tabletInformation.getText().toString());
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(6));app.tick();assertEquals("Loop Ativo",app.tabletInformation.getText().toString());
 }
 @Test public void connectionLossShowsCenteredModalUntilAccessReturns()throws Exception{
  connect("director");app.remote.peerName="PC real";app.choose("grid");
  app.remote.connected=false;app.remote.mode="";app.remote.lastError="";app.onChanged();
  android.view.View overlay=app.root.findViewWithTag("connection");assertNotNull(overlay);assertTrue(overlay.isClickable());
  android.view.View card=((android.view.ViewGroup)overlay).getChildAt(0);
  assertEquals(android.view.Gravity.CENTER,((android.widget.FrameLayout.LayoutParams)card.getLayoutParams()).gravity);
  assertTrue(allText(card).contains("PC real"));assertEquals("workspace",app.screen);
  app.remote.connected=true;app.onChanged();assertSame(overlay,app.root.findViewWithTag("connection"));
  app.remote.mode="director";app.onChanged();assertNull(app.root.findViewWithTag("connection"));assertEquals("grid",app.panel);
 }
 @Test public void phoneStartsAtSameRemoteHome(){assertEquals("startup",app.screen);assertTrue(app.root.getChildAt(0) instanceof RemoteStartup);Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(3));assertEquals("welcome",app.screen);assertFalse(app.entering);assertNull(app.state);}
 @Test public void startupCompletionDoesNotReplaceConnectedWorkspace()throws Exception{connect("director");Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(3));assertEquals("workspace",app.screen);}
 @Test public void itemVolumeInspectorFollowsHostGainAndClosesWhenItemDisappears()throws Exception{connect("director");app.choose("grid");JSONObject track=app.state.getJSONArray("tracks").getJSONObject(0),clip=track.getJSONArray("clips").getJSONObject(0);app.grid.item(clip);assertTrue(app.activeDialog.isShowing());assertEquals("+0.0 dB",app.grid.itemDecibels.getText().toString());clip.put("gain",0.5);app.refresh();assertEquals("-6.0 dB",app.grid.itemDecibels.getText().toString());clip.put("gain",0);app.refresh();assertEquals("−∞ dB",app.grid.itemDecibels.getText().toString());track.put("clips",new JSONArray());app.refresh();assertNull(app.activeDialog);}
 @Test public void discoveryShowsEveryPeerAndBilingualInstructions(){app.entering=true;app.remote.peers.add(new RemoteSession.Peer("PC palco","192.168.1.2",1234));app.remote.peers.add(new RemoteSession.Peer("PC reserva","192.168.1.3",1234));app.showHome();String text=allText(app.root);assertTrue(text.contains("PC palco"));assertTrue(text.contains("PC reserva"));assertTrue(text.contains("Conecte os aparelhos à mesma rede"));assertTrue(text.contains("Connect both devices to the same network"));assertFalse(text.contains("Conectar por endereço"));}
 String allText(View view){StringBuilder text=new StringBuilder(view instanceof TextView?((TextView)view).getText():"");if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)text.append('\n').append(allText(group.getChildAt(i)));}return text.toString();}
 @Test public void footerUsesAuthoritativeNamesAndTempoAndEmptyPlaceholder()throws Exception{connect("director");assertEquals("Próxima música - 140 bpm",app.nextDisplay.value.getText().toString());assertEquals("—",app.queuedDisplay.value.getText().toString());app.state.getJSONObject("songDisplays").put("queued","Entrada").put("queuedBPM",123.5);app.refresh();assertEquals("Entrada - 123.5 bpm",app.queuedDisplay.value.getText().toString());}
 @Test public void observerQueueIsAboveSetlistWithoutDirectorFooterOrSearch()throws Exception{connect("observer");assertNotNull(app.observerQueue);assertNull(app.nextDisplay);assertNull(app.playlistButton);assertNull(app.search);app.state.getJSONObject("songDisplays").put("queued","Final");app.refresh();assertEquals("Final",app.observerQueue.getText().toString());}
 @Test public void noticeSlotsLoadTemplatesAndPreserveGlobalDraft()throws Exception{connect("notices");assertNull(app.current);assertNull(app.nextDisplay);app.noticeEditor.setText("Recado global");app.selectNoticeSlot(0);assertEquals("Entrada em 5 segundos",app.noticeEditor.getText().toString());app.selectNoticeSlot(-1);assertEquals("Recado global",app.noticeEditor.getText().toString());app.noticeEditor.setText("a".repeat(600));assertEquals(500,app.noticeEditor.length());app.noticeEditor.setText("");assertFalse(app.noticeSend.isEnabled());}
 @Test public void phoneSwitchesPanelsWithoutLosingProject()throws Exception{connect("director");assertEquals("workspace",app.screen);assertEquals("setlist",app.panel);app.choose("grid");assertNotNull(app.grid);app.choose("mixer");assertNotNull(app.trackColumn);assertEquals(2,app.trackRows.size());assertNotNull(app.trackRows.get("00000000-0000-4000-8000-000000000002"));app.choose("setlist");assertEquals(2,app.songRows.size());assertEquals("Abertura",app.songRows.get(0).region.getString("name"));assertEquals(140,app.state.getDouble("bpm"),0);}
 @Test public void observerHasNoTransportControls()throws Exception{connect("observer");assertNull(app.play);assertFalse(app.railButtons.containsKey("mixer"));assertFalse(app.railButtons.containsKey("save"));assertFalse(app.railButtons.containsKey("notices"));app.choose("tp1");assertNotNull(app.tp);}
 @Test public void authoritativeTempoRenderFlagControlsYellow()throws Exception{connect("director");app.state.put("tempoNeedsRender",true);app.refresh();assertEquals(RemoteWidgets.YELLOW,app.bpm.getCurrentTextColor());app.state.put("tempoNeedsRender",false);app.refresh();assertEquals(RemoteWidgets.TEXT,app.bpm.getCurrentTextColor());}
 @Test public void tabsDivideAvailableWidthEqually()throws Exception{connect("director");assertEquals(2,app.tabs.getChildCount());int width=RemoteWidgets.dp(600);app.layoutProjectTabs(width);int a=app.tabs.getChildAt(0).getLayoutParams().width,b=app.tabs.getChildAt(1).getLayoutParams().width;assertTrue(Math.abs(a-b)<=1);assertEquals(width,a+b);}
 @Test public void manyTabsKeepReadableWidthAndScrollHorizontally()throws Exception{connect("director");JSONArray tabs=new JSONArray();for(int i=0;i<8;i++)tabs.put(new JSONObject().put("id","TAB"+i).put("name","Projeto "+i).put("selected",i==0));app.state.put("projectTabs",tabs);app.updateTabs();app.layoutProjectTabs(RemoteWidgets.dp(341));int total=0;for(int i=0;i<8;i++){assertTrue(app.tabs.getChildAt(i).getLayoutParams().width>=RemoteWidgets.dp(120));assertTrue(app.tabs.getChildAt(i).isLongClickable());total+=app.tabs.getChildAt(i).getLayoutParams().width;}assertTrue(total>RemoteWidgets.dp(341));assertSame(app.tabScroll,app.tabs.getParent());}
 @Test public void projectOpeningOverlaySurvivesWorkspaceReplacementAndOnlyReceiptFinishes()throws Exception{connect("director");JSONObject command=new JSONObject().put("id","COMMAND").put("action","openRecentProjectInNewTab");app.remote.projectOpening.begin(command,app.state,0);app.onLocalCommand(command);assertNotNull(app.root.findViewWithTag("project-loading"));assertTrue(app.root.findViewWithTag("project-loading").isClickable());app.buildWorkspace();app.tick();assertNotNull(app.root.findViewWithTag("project-loading"));app.state.put("projects",new JSONObject().put("commandID","COMMAND").put("commandState","completed"));app.remote.projectOpening.receive(app.state);app.tick();assertNull(app.root.findViewWithTag("project-loading"));}
 @Test public void changingPanelDoesNotRetainOldMixerViews()throws Exception{connect("director");app.choose("mixer");assertNotNull(app.trackColumn);app.choose("setlist");assertNull(app.trackColumn);app.choose("tp2");assertNotNull(app.tp);assertNull(app.setlistScroll);}
 @Test @Config(qualifiers="sw800dp-w800dp-h1280dp-port") public void portraitTabletUsesPhoneControlsAndKeepsMasterInMixer()throws Exception{
  connect("director");assertTrue(RemoteWidgets.tablet);assertFalse(app.tabletLayout());assertEquals("setlist",app.panel);
  assertFalse(app.trackRows.containsKey("master"));app.railButtons.get("mixer").performClick();
  assertEquals("mixer",app.panel);assertNotNull(app.trackRows.get("master"));
  MainActivity.TrackRow master=app.trackRows.get("master");master.mute.performClick();assertTrue(app.state.optBoolean("masterMute"));master.mute.performClick();assertFalse(app.state.optBoolean("masterMute"));
  app.railButtons.get("parts").performClick();assertEquals("parts",app.panel);assertNotNull(app.parts);
 }
 @Test public void fullscreenTeleprompterHidesRailAndRestoresItWithoutChangingPreference()throws Exception{
  connect("director");app.choose("tp1");assertTrue(app.rail.getParent().getParent()==app.work);
  app.fullscreen=true;app.buildWorkspace();assertNull(((View)app.rail.getParent()).getParent());assertNull(app.tabScroll.getParent());assertFalse(app.sidebarHidden);
  app.fullscreen=false;app.buildWorkspace();assertSame(app.work,app.rail.getParent().getParent());assertNotNull(app.tabScroll.getParent());
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletHasParallelMixerGridSetlistAndPreview()throws Exception{connect("director");assertTrue(RemoteWidgets.tablet);assertNotNull(app.grid);assertNotNull(app.trackColumn);assertNotNull(app.setlistScroll);assertTrue(app.railButtons.containsKey("preview"));assertEquals(44,((LinearLayout.LayoutParams)app.railButtons.get("mixer").getLayoutParams()).height/RemoteWidgets.density,1);}
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletObserverRotatesPrompterAndSetlistWithoutReplacingThem()throws Exception{
  connect("observer");assertEquals("setlist",app.panel);assertNull(app.grid);assertNotNull(app.setlistScroll);assertEquals(View.GONE,app.tabs.getVisibility());
  app.choose("tp2");assertNotNull(app.tp);assertNotNull(app.setlistScroll);assertNull(app.play);assertNull(app.trackColumn);
  assertEquals(LinearLayout.HORIZONTAL,app.observerPanes.getOrientation());
  RemoteTeleprompter prompter=app.tp;ScrollView repertoire=app.setlistScroll;
  assertEquals(.70f,((LinearLayout.LayoutParams)prompter.getLayoutParams()).weight,.001f);
  Configuration portrait=new Configuration(app.getResources().getConfiguration());portrait.orientation=Configuration.ORIENTATION_PORTRAIT;portrait.screenWidthDp=800;portrait.screenHeightDp=1280;
  controller.configurationChange(portrait);
  assertEquals("tp2",app.panel);assertSame(prompter,app.tp);assertSame(repertoire,app.setlistScroll);
  assertEquals(LinearLayout.VERTICAL,app.observerPanes.getOrientation());assertEquals(LinearLayout.VERTICAL,app.observerHeaderDisplays.getOrientation());
  assertEquals(.60f,((LinearLayout.LayoutParams)prompter.getLayoutParams()).weight,.001f);
  Configuration landscape=new Configuration(portrait);landscape.orientation=Configuration.ORIENTATION_LANDSCAPE;landscape.screenWidthDp=1280;landscape.screenHeightDp=800;
  controller.configurationChange(landscape);
  assertSame(prompter,app.tp);assertSame(repertoire,app.setlistScroll);assertEquals(LinearLayout.HORIZONTAL,app.observerPanes.getOrientation());
  app.railButtons.get("setlist").performClick();assertNotNull(app.tp);assertNull(app.setlistScroll);
  app.railButtons.get("setlist").performClick();assertNotNull(app.tp);assertNotNull(app.setlistScroll);
  app.choose("tp2");assertEquals("setlist",app.panel);assertNull(app.tp);assertNotNull(app.setlistScroll);assertNull(app.grid);
 }

 void railTouch(RemoteTrackRail rail,long down,long elapsed,int action,float firstY,Float secondY){
  int count=secondY==null?1:2;MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[count];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[count];
  for(int i=0;i<count;i++){properties[i]=new MotionEvent.PointerProperties();properties[i].id=i;properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=RemoteWidgets.dp(14);coords[i].y=RemoteWidgets.dp(i==0?firstY:secondY);coords[i].pressure=1;coords[i].size=1;}
  MotionEvent event=MotionEvent.obtain(down,down+elapsed,action,count,properties,coords,0,0,1,1,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);rail.dispatchTouchEvent(event);event.recycle();
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void leftRailPinchResizesMixerAndGridWithoutChangingTimeZoom()throws Exception{
  connect("director");RemoteTrackRail rail=app.trackRail;assertNotNull(rail);rail.layout(0,0,RemoteWidgets.dp(28),RemoteWidgets.dp(600));
  String id=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");double original=app.layout.height(id),zoom=app.grid.zoom;long down=android.os.SystemClock.uptimeMillis();
  railTouch(rail,down,0,MotionEvent.ACTION_DOWN,120,null);
  railTouch(rail,down,20,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),120,360f);
  railTouch(rail,down,40,MotionEvent.ACTION_MOVE,80,400f);
  railTouch(rail,down,60,MotionEvent.ACTION_MOVE,20,460f);
  railTouch(rail,down,80,MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),20,460f);
  railTouch(rail,down,100,MotionEvent.ACTION_UP,20,null);
  assertTrue(app.layout.height(id)>original);assertEquals(zoom,app.grid.zoom,0);assertFalse(rail.twoFingers);
  assertEquals(RemoteWidgets.dp((float)app.layout.height(id)),app.trackRows.get(id).getLayoutParams().height);
  double resized=app.layout.height(id);app.onChanged();assertEquals(resized,app.layout.height(id),.001);
  assertEquals(app.layout.heightScale,app.getPreferences(0).getFloat("trackHeightScale",0),.001);
  app.resizeTrackHeight(.01);assertEquals(.35,app.layout.heightScale,0);assertEquals(View.GONE,app.trackRows.get(id).controls.getVisibility());assertEquals(View.GONE,app.trackRows.get(id).line.getVisibility());assertEquals(View.VISIBLE,app.trackRows.get(id).title.getVisibility());
  app.resizeTrackHeight(100);assertEquals(3,app.layout.heightScale,0);assertEquals(View.VISIBLE,app.trackRows.get(id).controls.getVisibility());
  app.choose("mixer");assertNotNull(app.trackRail);assertEquals(3,app.layout.heightScale,0);
 }

}
