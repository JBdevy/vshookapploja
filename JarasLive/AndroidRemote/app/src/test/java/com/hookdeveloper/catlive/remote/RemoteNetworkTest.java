package com.hookdeveloper.catlive.remote;
import android.os.*;import java.io.*;import java.nio.file.*;import java.util.concurrent.*;import java.util.function.BooleanSupplier;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteNetworkTest {
 java.lang.Process host;Path log;ActivityController<MainActivity> controller;MainActivity app;
 @Before public void start()throws Exception{Path script=Paths.get("..","tests","host-fixture.cjs").toAbsolutePath();assertTrue(Files.isRegularFile(script));log=Files.createTempFile("catlive-remote-wire-",".json");ProcessBuilder builder=new ProcessBuilder("node",script.toString(),log.toString());builder.environment().put("CATLIVE_REMOTE_TEST_PORT","18715");builder.redirectErrorStream(true);host=builder.start();BufferedReader output=new BufferedReader(new InputStreamReader(host.getInputStream()));ExecutorService wait=Executors.newSingleThreadExecutor();try{String ready=wait.submit(output::readLine).get(10,TimeUnit.SECONDS);assertNotNull(ready);assertTrue(ready.contains("CatLive Android fixture"));}finally{wait.shutdownNow();}controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();app.entering=true;app.remote.resume();app.remote.connect(new RemoteSession.Peer("Isolated OpenSSL host","127.0.0.1",18715));await(()->app.remote.connected);app.remote.requestAccess("director","");await(()->app.state!=null&&app.remote.mode.equals("director"));}
 @After public void close()throws Exception{if(controller!=null)controller.pause().stop().destroy();if(host!=null){host.destroy();if(!host.waitFor(3,TimeUnit.SECONDS))host.destroyForcibly();}if(log!=null)Files.deleteIfExists(log);}
 void await(BooleanSupplier condition)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(System.nanoTime()<end){Shadows.shadowOf(Looper.getMainLooper()).idle();if(condition.getAsBoolean())return;Thread.sleep(20);}fail("Remote did not reach expected state: "+app.remote.status+" / "+app.remote.lastError);}
 @Test public void realEncryptedTcpControlsAndReconnection()throws Exception{
  assertEquals("Teste Android Remote",app.state.getString("projectName"));assertEquals(2,app.songRows.size());
  app.play.performClick();await(()->app.state.optBoolean("playing"));
  String track=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");
  app.remote.action("volume",track,RemoteModel.gain(-3));await(()->Math.abs(app.state.optJSONArray("tracks").optJSONObject(0).optDouble("volume")-RemoteModel.gain(-3))<1e-9);
  // BPM updates optimistically; the render flag arrives with the host acknowledgement.
  app.remote.action("tempo",null,141);await(()->app.state.optDouble("bpm")==141&&app.state.optBoolean("tempoNeedsRender"));assertEquals(RemoteWidgets.YELLOW,app.bpm.getCurrentTextColor());
  app.remote.action("tempo",null,140);await(()->app.state.optDouble("bpm")==140&&!app.state.optBoolean("tempoNeedsRender"));assertEquals(RemoteWidgets.TEXT,app.bpm.getCurrentTextColor());
  String second=app.state.getJSONArray("regions").getJSONObject(1).getString("id");app.remote.action("selectRegion",second,0);await(()->RemoteModel.same(second,RemoteModel.id(app.state,"queuedRegion")));
  app.choose("tp1");await(()->RemoteModel.array(app.state,"teleprompters").length()==1);assertNotNull(app.tp);
  app.remote.action("stop");await(()->!app.state.optBoolean("playing"));
  app.remote.suspend();assertFalse(app.remote.connected);app.remote.resume();await(()->app.remote.connected&&app.remote.mode.equals("director")&&app.state!=null);
  app.remote.requestAccess("observer","");await(()->app.remote.mode.equals("observer"));assertNull(app.play);assertFalse(app.railButtons.containsKey("mixer"));
  JSONArray before=new JSONArray(new String(Files.readAllBytes(log),java.nio.charset.StandardCharsets.UTF_8));long commands=java.util.stream.IntStream.range(0,before.length()).filter(i->before.optJSONObject(i).has("command")).count();app.remote.action("play");Thread.sleep(250);Shadows.shadowOf(Looper.getMainLooper()).idle();JSONArray after=new JSONArray(new String(Files.readAllBytes(log),java.nio.charset.StandardCharsets.UTF_8));assertEquals(commands,java.util.stream.IntStream.range(0,after.length()).filter(i->after.optJSONObject(i).has("command")).count());
 }
 @Test public void backgroundResumeKeepsPanelAndOnlyShowsReconnectingModal()throws Exception{
  for(String panel:new String[]{"grid","tp1"}){
   app.choose(panel);android.view.View original=panel.equals("grid")?app.grid:app.tp;
   String project=RemoteModel.id(app.state,"project");
   controller.pause().stop();
   assertFalse(app.remote.connected);assertEquals("workspace",app.screen);assertEquals(panel,app.panel);
   assertNotNull(app.root.findViewWithTag("connection"));
   controller.restart().start().resume();
   assertEquals("workspace",app.screen);assertNotNull(app.root.findViewWithTag("connection"));
   await(()->app.remote.connected&&app.remote.mode.equals("director")&&app.root.findViewWithTag("connection")==null);
   assertEquals(project,RemoteModel.id(app.state,"project"));assertEquals(panel,app.panel);
   assertSame(original,panel.equals("grid")?app.grid:app.tp);
   app.remote.resume();assertTrue(app.remote.connected);assertEquals("director",app.remote.mode);
   assertNull(app.root.findViewWithTag("connection"));
  }
 }
 void touch(RemoteGrid grid,long down,int action,float x,float y){android.view.MotionEvent event=android.view.MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),action,x,y,0);grid.onTouchEvent(event);event.recycle();}
 @Test public void gridNeedleCommitsOnlyOnReleaseAndCancelSafely()throws Exception{
  app.choose("grid");RemoteGrid grid=app.grid;grid.layout(0,0,600,400);
  android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(600,400,android.graphics.Bitmap.Config.ARGB_8888);grid.draw(new android.graphics.Canvas(bitmap));
  float ruler=RemoteWidgets.dp(RemoteTimeline.RULER_TOP+8);long down=android.os.SystemClock.uptimeMillis();
  touch(grid,down,android.view.MotionEvent.ACTION_DOWN,100,ruler);touch(grid,down,android.view.MotionEvent.ACTION_MOVE,300,ruler);
  assertTrue(grid.needleDragging);assertEquals(12,grid.needleCandidate,.001);assertTrue(Double.isNaN(grid.needlePreview));assertEquals(0,app.state.optDouble("editPosition"),.001);
  touch(grid,down,android.view.MotionEvent.ACTION_UP,500,ruler);await(()->Math.abs(app.state.optDouble("editPosition")-20)<.001);assertFalse(grid.needleDragging);
  down=android.os.SystemClock.uptimeMillis();float head=RemoteWidgets.dp(RemoteTimeline.RULER_TOP-2);
  touch(grid,down,android.view.MotionEvent.ACTION_DOWN,grid.x(20),head);assertTrue(grid.needleDragging);touch(grid,down,android.view.MotionEvent.ACTION_MOVE,grid.x(10),head);assertEquals(10,grid.needleCandidate,.001);assertTrue(Double.isNaN(grid.needlePreview)||Math.abs(grid.needlePreview-20)<.001);assertEquals(20,app.state.optDouble("editPosition"),.001);
  touch(grid,down,android.view.MotionEvent.ACTION_CANCEL,250,head);assertFalse(grid.needleDragging);assertTrue(Double.isNaN(grid.needlePreview));assertEquals(20,app.state.optDouble("editPosition"),.001);
  app.remote.action("play");await(()->app.state.optBoolean("playing"));
  touch(grid,down,android.view.MotionEvent.ACTION_DOWN,100,ruler);assertFalse(grid.needleDragging);touch(grid,down,android.view.MotionEvent.ACTION_CANCEL,100,ruler);
  bitmap.recycle();
 }


 @Test public void newPortForSameServiceReplacesStalledHandshakeWithoutWaitingForTimeout()throws Exception{
  try(java.net.ServerSocket stalled=new java.net.ServerSocket(0,1,java.net.InetAddress.getLoopbackAddress())){
   stalled.setSoTimeout(5000);app.remote.exit();app.remote.connect(new RemoteSession.Peer("Restarted host","127.0.0.1",stalled.getLocalPort()));
   try(java.net.Socket accepted=stalled.accept()){
    Object original=org.robolectric.util.ReflectionHelpers.getField(app.remote,"socket");
    app.remote.resolvedPeer(new RemoteSession.Peer("Different host","127.0.0.1",18715));assertSame(original,org.robolectric.util.ReflectionHelpers.getField(app.remote,"socket"));assertFalse(app.remote.connected);
    app.remote.resolvedPeer(new RemoteSession.Peer("Restarted host","127.0.0.1",stalled.getLocalPort()));assertSame(original,org.robolectric.util.ReflectionHelpers.getField(app.remote,"socket"));
    long began=System.nanoTime();app.remote.resolvedPeer(new RemoteSession.Peer("Restarted host","127.0.0.1",18715));await(()->app.remote.connected);
    assertTrue("Should not wait for the old 15-second handshake",System.nanoTime()-began<TimeUnit.SECONDS.toNanos(5));
    app.remote.requestAccess("director","");await(()->app.remote.state!=null&&app.remote.mode.equals("director"));assertEquals("Teste Android Remote",app.remote.state.getString("projectName"));
   }
  }
 }
 @Test public void rediscoveredPortNeverInterruptsEstablishedSession()throws Exception{
  Object original=org.robolectric.util.ReflectionHelpers.getField(app.remote,"socket");app.remote.resolvedPeer(new RemoteSession.Peer("Isolated OpenSSL host","127.0.0.1",18716));assertTrue(app.remote.connected);assertSame(original,org.robolectric.util.ReflectionHelpers.getField(app.remote,"socket"));
  String track=app.state.getJSONArray("tracks").getJSONObject(0).getString("id");app.remote.action("volume",track,.8);await(()->Math.abs(app.remote.state.optJSONArray("tracks").optJSONObject(0).optDouble("volume")-.8)<1e-9);
 }
}
