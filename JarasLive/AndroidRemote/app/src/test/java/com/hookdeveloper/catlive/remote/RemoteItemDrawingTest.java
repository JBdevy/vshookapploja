package com.hookdeveloper.catlive.remote;
import android.graphics.*;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteItemDrawingTest {
 RemoteItemDrawing drawing;
 @Before public void start(){RemoteWidgets.init(org.robolectric.RuntimeEnvironment.getApplication());drawing=new RemoteItemDrawing();}
 @Test public void usesTheSameIllustrativeSamplesAsIphoneWithCanonicalUUIDCase(){
  int seed=RemoteItemDrawing.seed("00000000-0000-4000-8000-000000000007");assertEquals(738,seed);
  assertEquals(.14415708790947687,RemoteItemDrawing.amplitude(seed,0),1e-12);assertEquals(.35763816297597795,RemoteItemDrawing.amplitude(seed,.25),1e-12);assertEquals(.7906433472779038,RemoteItemDrawing.amplitude(seed,.75),1e-12);
  assertEquals(RemoteItemDrawing.seed("ABCDEF00-0000-4000-8000-000000000007"),RemoteItemDrawing.seed("abcdef00-0000-4000-8000-000000000007"));
 }
 @Test public void waveformHasVisibleGeometryAndCachesAcrossTransportTicks(){
  Path path=drawing.waveform("A",300,60,0,1);RectF bounds=new RectF();path.computeBounds(bounds,true);assertFalse(path.isEmpty());assertTrue(bounds.width()>290);assertTrue(bounds.height()>40);assertTrue(bounds.top>=0);assertTrue(bounds.bottom<=60);
  for(int i=0;i<100;i++)assertSame(path,drawing.waveform("a",300,60,0,1));assertEquals(1,drawing.builds);
  assertNotSame(path,drawing.waveform("A",300,60,.25,.5));assertEquals(2,drawing.builds);
 }
 static class CanvasProbe extends Canvas {int waveColor,paths;RectF bounds=new RectF();@Override public void drawPath(Path path,Paint paint){paths++;waveColor=paint.getColor();path.computeBounds(bounds,true);}}
 @Test public void muteAndTrackSoloSilenceGrayTheWaveWithoutRegeneratingIt()throws Exception{
  JSONObject clip=new JSONObject().put("id","A").put("name","Audio"),track=new JSONObject().put("color",0x00ff00).put("nameColor",0xffffff);CanvasProbe canvas=new CanvasProbe();RectF box=new RectF(0,0,300,86);
  drawing.draw(canvas,box,track,clip,0,1);assertEquals(0xbfffffff,canvas.waveColor);assertEquals(1,drawing.builds);assertEquals(1,canvas.paths);
  track.put("silenced",true);drawing.draw(canvas,box,track,clip,0,1);assertEquals(0xff808080,canvas.waveColor);assertEquals(1,drawing.builds);
  track.put("silenced",false);clip.put("muted",true);drawing.draw(canvas,box,track,clip,0,1);assertEquals(0xff808080,canvas.waveColor);
  clip.put("muted",false);drawing.draw(canvas,box,track,clip,0,1);assertEquals(0xbfffffff,canvas.waveColor);assertEquals(1,drawing.builds);
 }
 @Test public void compactItemsDoNotDrawWaveOverTheirHeader()throws Exception{
  CanvasProbe canvas=new CanvasProbe();drawing.draw(canvas,new RectF(0,0,100,20),new JSONObject(),new JSONObject().put("id","A"),0,1);assertEquals(0,canvas.paths);assertEquals(0,drawing.builds);
 }
 @Test public void zoomCacheIsBounded(){for(int i=0;i<300;i++)drawing.waveform("A",100+i,60,0,1);assertEquals(96,drawing.waves.size());}
}
