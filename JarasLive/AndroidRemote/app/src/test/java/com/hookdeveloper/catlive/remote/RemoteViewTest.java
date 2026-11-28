package com.hookdeveloper.catlive.remote;
import android.content.res.Configuration;import android.view.*;import android.widget.*;import java.nio.charset.StandardCharsets;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteViewTest {
 ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start(){controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();}
 @After public void close(){controller.pause().stop().destroy();}
 JSONObject state()throws Exception{return new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));}
 void connect(String mode)throws Exception{app.entering=true;app.remote.connected=true;app.remote.mode=mode;app.remote.state=state();app.onChanged();app.root.measure(View.MeasureSpec.makeMeasureSpec(393,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(851,View.MeasureSpec.EXACTLY));app.root.layout(0,0,393,851);}
 @Test public void phoneBpmTapsAndLongPressAreIndependent() throws Exception { checkTempoGestures(); }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land")
 public void tabletBpmTapsAndLongPressAreIndependent() throws Exception { checkTempoGestures(); }
 private void checkTempoGestures() throws Exception {
  connect("director");
  java.util.List<JSONObject> commands = new java.util.ArrayList<>();
  app.remote.listener = new RemoteSession.Listener() {
   public void onChanged() {}
   public void onMessage(String message) {}
   public void onLocalCommand(JSONObject command) { commands.add(command); }
  };
  app.state.put("playing", false).put("paused", false).put("subPlaying", false).put("recording", false);
  app.bpm.performClick();
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(500));
  app.state.put("paused", true);
  double beforeTap = android.os.SystemClock.elapsedRealtimeNanos() / 1_000_000_000.0;
  app.bpm.performClick();
  double afterTap = android.os.SystemClock.elapsedRealtimeNanos() / 1_000_000_000.0;
  assertEquals(2, commands.size());
  assertEquals("tapTempo", commands.get(0).getString("action"));
  String source = commands.get(0).getString("target");
  assertEquals(source, java.util.UUID.fromString(source).toString());
  assertEquals(source, commands.get(1).getString("target"));
  double timestamp = commands.get(1).getDouble("value");
  assertTrue(timestamp >= beforeTap && timestamp <= afterTap);
  assertTrue(timestamp > commands.get(0).getDouble("value"));
  for (String field : new String[]{"playing", "subPlaying", "recording"}) {
   app.state.put(field, true);
   app.bpm.performClick();
   app.state.put(field, false);
  }
  assertTrue(app.bpm.performLongClick());
  assertTrue(app.activeDialog.isShowing());
  app.activeDialog.dismiss();
  assertEquals(2, commands.size());
  ViewGroup group = (ViewGroup) app.bpm.getParent();
  int middle = group.indexOfChild(app.bpm);
  group.getChildAt(middle - 1).performClick();
  group.getChildAt(middle + 1).performClick();
  assertEquals(4, commands.size());
  assertEquals("tempo", commands.get(2).getString("action"));
  assertEquals("tempo", commands.get(3).getString("action"));
 }
 @Test public void pauseKeepsWhiteBarsOnYellowOnlyWhilePaused()throws Exception{
  connect("director");
  for (boolean playing : new boolean[]{false,true}) {
   app.state.put("playing",playing).put("paused",false);app.refresh();
   assertEquals(0xff454545,((android.graphics.drawable.GradientDrawable)app.pause.getBackground()).getColors()[0]);
  }
  app.state.put("playing",false).put("paused",true);app.refresh();
  assertEquals(RemoteWidgets.YELLOW,((android.graphics.drawable.GradientDrawable)app.pause.getBackground()).getColors()[0]);
  assertEquals("pause",app.pause.icon);
  assertEquals(android.graphics.Color.WHITE,app.pause.tint);
 }
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
 @Test public void phoneTransportFitsAllButtonsAboveBpmAndTuner()throws Exception{
  connect("director");
  ViewGroup buttons=(ViewGroup)app.play.getParent();
  for(View button:new View[]{app.play,app.fadeoutControl,app.pause,app.repeat}){
   assertSame(buttons,button.getParent());
   assertEquals(RemoteWidgets.dp(44),button.getHeight());
   assertTrue(button.getTop()>=0&&button.getBottom()<=buttons.getHeight());
  }
  View tempoRow=(View)((View)app.bpm.getParent()).getParent();
  assertSame(tempoRow,((View)app.pitch.getParent()).getParent());
  assertTrue(tempoRow.getTop()>=buttons.getBottom()+RemoteWidgets.dp(6));
  assertTrue(tempoRow.getBottom()<=app.transport.getHeight());
 }
 @Test public void mixerFaderRequiresSelectionThenDragAndClearsOnOutsideTouch()throws Exception {
  connect("director");app.choose("mixer");
  RemoteWidgets.Fader fader=app.trackRows.get("master").volume;
  fader.layout(0,0,200,24);
  double original=fader.value;
  faderGesture(fader,100,55);
  assertEquals(original,fader.value,0);
  assertFalse(fader.isSelected());
  faderGesture(fader,60,60);
  assertTrue(fader.isSelected());
  assertEquals(original,fader.value,0);
  faderGesture(fader,100,60);
  assertTrue(fader.value<original);
  double adjusted=fader.value;
  long now=android.os.SystemClock.uptimeMillis();
  MotionEvent outside=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,0,0,0);
  app.dispatchTouchEvent(outside);outside.recycle();
  assertFalse(fader.isSelected());
  faderGesture(fader,100,60);
  assertEquals(adjusted,fader.value,0);
 }
 private void faderGesture(RemoteWidgets.Fader fader,int start,int end) {
  long time=android.os.SystemClock.uptimeMillis();
  int[] actions=start==end?new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}:
   new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_MOVE,MotionEvent.ACTION_UP};
  for(int action:actions){
   MotionEvent event=MotionEvent.obtain(time,time+20,action,action==MotionEvent.ACTION_DOWN?start:end,10,0);
   fader.onTouchEvent(event);event.recycle();
  }
 }
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
 @Test @Config(qualifiers="sw800dp-w800dp-h1280dp-port") public void tabletDirectorRequestsLandscapeAndKeepsTheMasterInMixer()throws Exception{
  connect("director");assertTrue(RemoteWidgets.tablet);
  assertEquals(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE,app.getRequestedOrientation());
  Configuration landscape=new Configuration(app.getResources().getConfiguration());
  landscape.orientation=Configuration.ORIENTATION_LANDSCAPE;landscape.screenWidthDp=1280;landscape.screenHeightDp=800;
  controller.configurationChange(landscape);
  assertTrue(app.tabletLayout());assertEquals("grid",app.panel);
  assertNotNull(app.grid);assertNotNull(app.trackColumn);assertNotNull(app.trackRows.get("master"));
  MainActivity.TrackRow master=app.trackRows.get("master");
  master.mute.performClick();assertTrue(app.state.optBoolean("masterMute"));
  master.mute.performClick();assertFalse(app.state.optBoolean("masterMute"));
  assertSame(master,((LinearLayout)app.mixerScroll.getParent()).getChildAt(0));
  assertSame(app.current.getParent(),app.railButtons.get("menu").getParent());
  LinearLayout transportPanel=(LinearLayout)((View)app.save.getParent()).getParent();
  assertSame(transportPanel,((View)app.current.getParent()).getParent());
  assertSame(transportPanel,app.transport.getChildAt(0));
  assertEquals("Abertura",app.current.getText().toString());
  assertSame(app.fadeoutControl,((LinearLayout)app.play.getParent()).getChildAt(1));
  assertFalse(app.fadeoutControl.isEnabled());
  assertEquals(1,app.fadeoutControl.getAlpha(),0);
  assertEquals(android.graphics.Color.BLACK,app.fadeoutControl.getCurrentTextColor());
  assertEquals("",app.pause.getText().toString());
  master.mono.performClick();
  assertTrue(app.activeDialog.isShowing());
  assertFalse(app.state.optBoolean("masterMono"));
  app.activeDialog.dismiss();
 }
 @Test public void fullscreenTeleprompterHidesRailAndRestoresItWithoutChangingPreference()throws Exception{
  connect("director");app.choose("tp1");assertTrue(app.rail.getParent().getParent()==app.work);
  app.fullscreen=true;app.buildWorkspace();assertNull(((View)app.rail.getParent()).getParent());assertNull(app.tabScroll.getParent());assertFalse(app.sidebarHidden);
  app.fullscreen=false;app.buildWorkspace();assertSame(app.work,app.rail.getParent().getParent());assertNotNull(app.tabScroll.getParent());
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletHasParallelMixerGridSetlistAndPreview()throws Exception{connect("director");assertTrue(RemoteWidgets.tablet);assertNotNull(app.grid);assertNotNull(app.trackColumn);assertNotNull(app.setlistScroll);assertTrue(app.railButtons.containsKey("preview"));assertEquals(32,((LinearLayout.LayoutParams)app.railButtons.get("mixer").getLayoutParams()).height/RemoteWidgets.density,1);}
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

 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void tabletToolbarIsBelowTransportWithLabeledPanelControls()throws Exception{
  connect("director");assertEquals(LinearLayout.HORIZONTAL,app.rail.getOrientation());
  assertSame(app.column,app.rail.getParent());
  assertEquals(app.column.indexOfChild(app.transport)+1,app.column.indexOfChild(app.rail));
  assertSame(app.railButtons.get("mixer"),app.rail.getChildAt(0));
  assertSame(app.railButtons.get("parts"),app.rail.getChildAt(1));
  assertSame(app.railButtons.get("vinhetas"),app.rail.getChildAt(2));
  assertEquals("Track Mixer",app.railButtons.get("mixer").getText().toString());
  assertEquals("Parts",app.railButtons.get("parts").getText().toString());
  assertEquals("Pads",app.railButtons.get("vinhetas").getText().toString());
  assertEquals("mixer",app.railButtons.get("mixer").leadingIcon);
  assertSame(app.batteryBadge.getParent(),app.railButtons.get("settings").getParent());
  assertSame(app.current.getParent(),((View)app.batteryBadge.getParent().getParent()).getParent());
  RemoteWidgets.Button preview=app.railButtons.get("preview");
  assertEquals("preview",preview.leadingIcon);assertEquals("PRW",preview.getText().toString());
  app.state.put("previewActive",false);app.refresh();assertEquals(RemoteWidgets.RED,preview.tint);
  app.state.put("previewActive",true);app.refresh();assertEquals(RemoteWidgets.GREEN,preview.tint);
  app.choose("tp1");app.railButtons.get("mixer").performClick();assertEquals("grid",app.panel);assertTrue(app.mixerShown);
 }
 @Test @Config(qualifiers="sw600dp-w960dp-h600dp-land")
 public void tabletPlaybackLeavesSpaceForTempoAndTuner() throws Exception {
  connect("director");
  int width=RemoteWidgets.dp(960),height=RemoteWidgets.dp(600);
  app.root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));
  app.root.layout(0,0,width,height);
  app.root.forceLayout();
  app.root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));
  app.root.layout(0,0,width,height);
  View tempo=(View)app.bpm.getParent();
  View tuner=(View)app.pitch.getParent();
  int space=((View)tempo.getParent()).getWidth()-RemoteWidgets.dp(288+18+76);
  int normalTempoWidth=Math.max(RemoteWidgets.dp(88),Math.round((space-RemoteWidgets.dp(26))*.325f));
  assertEquals(2*normalTempoWidth,tempo.getWidth(),2);
  assertEquals(Math.max(RemoteWidgets.dp(118),Math.round((space+RemoteWidgets.dp(26))*.325f)),tuner.getWidth(),2);
  assertEquals(RemoteWidgets.dp(44),((ViewGroup)tempo).getChildAt(0).getWidth());
  assertEquals(RemoteWidgets.dp(44),((ViewGroup)tempo).getChildAt(2).getWidth());
  assertTrue(app.bpm.getWidth()>=RemoteWidgets.dp(70));
  assertTrue(tempo.getRight()<=tuner.getLeft());
  assertTrue(app.play.getWidth()>=RemoteWidgets.dp(44));
  View file=app.railButtons.get("menu");
  assertTrue(file.isShown());
  assertEquals("File",file.getContentDescription());
  assertTrue(file.performClick());
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
  org.robolectric.shadows.ShadowWindowManagerImpl windows =
      org.robolectric.shadow.api.Shadow.extract(app.getWindowManager());
  assertTrue(windows.getViews().stream().anyMatch(view ->
      RemotePartsTest.findText(view,RemoteText.ui("Projetos"))!=null &&
      RemotePartsTest.findText(view,RemoteText.ui("Sair do Remote"))!=null));
 }

 @Test @Config(qualifiers="sw600dp-w960dp-h600dp-land")
 public void tabletObserverShowsTheActivePlaylistWithoutThePlaylistCollection() throws Exception {
  connect("observer");
  app.state.remove("playlists");
  app.state.put("selectedPlaylist","playlist").put("selectedPlaylistName","Repertório principal");
  app.refresh();
  assertEquals("Repertório principal",app.observerPlaylist.getText().toString());
  assertEquals(1,app.transport.indexOfChild((View)app.observerPlaylist.getParent()));
  app.state.remove("selectedPlaylistName");
  app.state.remove("selectedPlaylist");
  app.refresh();
  assertEquals(RemoteText.ui("Todas as regiões"),app.observerPlaylist.getText().toString());
 }

 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void manualGridScrollRevealsHeadersAndExtendsFollowPause()throws Exception{
  connect("director");RemoteGrid grid=app.grid;grid.layout(0,0,800,600);
  android.graphics.Canvas canvas=new android.graphics.Canvas(android.graphics.Bitmap.createBitmap(800,600,android.graphics.Bitmap.Config.ARGB_8888));
  grid.draw(canvas);grid.zoom=4;app.state.put("playing",true);app.anchorPosition=10;app.stateAt=android.os.SystemClock.elapsedRealtime();
  grid.draw(canvas);assertTrue(grid.itemHeadersHidden);assertFalse(grid.hits.isEmpty());assertTrue(grid.hits.get(0).mute.isEmpty());
  grid.pauseFollow();double offset=grid.offset;app.anchorPosition=11;grid.draw(canvas);assertFalse(grid.itemHeadersHidden);assertFalse(grid.hits.get(0).mute.isEmpty());assertEquals(offset,grid.offset,0);
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(1000));grid.pauseFollow();
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(1000));grid.draw(canvas);assertFalse(grid.itemHeadersHidden);assertEquals(offset,grid.offset,0);
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(501));grid.draw(canvas);assertTrue(grid.itemHeadersHidden);assertTrue(grid.offset>offset);
 }
 void mixerTouch(RemoteTrackScrollView mixer,long down,long elapsed,int action,float firstY,Float secondY){
  int count=secondY==null?1:2;MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[count];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[count];
  for(int i=0;i<count;i++){properties[i]=new MotionEvent.PointerProperties();properties[i].id=i;properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=RemoteWidgets.dp(14);coords[i].y=RemoteWidgets.dp(i==0?firstY:secondY);coords[i].pressure=1;coords[i].size=1;}
  MotionEvent event=MotionEvent.obtain(down,down+elapsed,action,count,properties,coords,0,0,1,1,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);mixer.dispatchTouchEvent(event);event.recycle();
 }
 @Test @Config(qualifiers="sw800dp-w1280dp-h800dp-land") public void trackNumberPinchResizesMixerAndGridWithoutChangingTimeZoom()throws Exception{
  connect("director");RemoteTrackScrollView mixer=(RemoteTrackScrollView)app.mixerScroll;assertNotNull(mixer);
  String id=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");double original=app.layout.height(id),zoom=app.grid.zoom;long down=android.os.SystemClock.uptimeMillis();
  mixerTouch(mixer,down,0,MotionEvent.ACTION_DOWN,40,null);
  mixerTouch(mixer,down,20,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),40,240f);
  mixerTouch(mixer,down,40,MotionEvent.ACTION_MOVE,25,280f);
  mixerTouch(mixer,down,60,MotionEvent.ACTION_MOVE,10,320f);
  mixerTouch(mixer,down,80,MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),10,320f);
  mixerTouch(mixer,down,100,MotionEvent.ACTION_UP,10,null);
  assertTrue(app.layout.height(id)>original);assertEquals(zoom,app.grid.zoom,0);assertFalse(mixer.twoFingers);
  assertEquals(RemoteWidgets.dp((float)app.layout.height(id)),app.trackRows.get(id).getLayoutParams().height);
  double resized=app.layout.height(id);app.onChanged();assertEquals(resized,app.layout.height(id),.001);
  assertEquals(app.layout.heightScale,app.getPreferences(0).getFloat("trackHeightScale",0),.001);
  app.resizeTrackHeight(.01);assertEquals(76,app.layout.height(id),0);assertEquals(View.VISIBLE,app.trackRows.get(id).controls.getVisibility());assertEquals(View.VISIBLE,app.trackRows.get(id).line.getVisibility());assertEquals(View.VISIBLE,app.trackRows.get(id).title.getVisibility());
  assertSame(app.trackRows.get(id).pan,app.trackRows.get(id).controls.getChildAt(0));
  assertSame(app.trackRows.get(id).mute,app.trackRows.get(id).controls.getChildAt(1));
  app.resizeTrackHeight(100);assertEquals(3,app.layout.heightScale,0);assertEquals(View.VISIBLE,app.trackRows.get(id).controls.getVisibility());
  app.choose("mixer");assertTrue(app.mixerScroll instanceof RemoteTrackScrollView);assertEquals(3,app.layout.heightScale,0);
 }

}
