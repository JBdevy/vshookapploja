package com.hookdeveloper.catlive.remote;
import org.junit.Test;
import org.json.JSONObject;
import static org.junit.Assert.*;
public class RemoteSMK37ProtocolTest {
 @Test public void playingAndQueuedTitlesHaveMatchingBoundedWireFormat(){
  assertArrayEquals(RemoteSMK37.frame(26,4,'S','o','n','g',4,'N','e','x','t'),RemoteSMK37.songTitlesFrame("Song","Next"));
  assertArrayEquals(RemoteSMK37.frame(26,0,0),RemoteSMK37.songTitlesFrame("",""));
  byte[] bounded=RemoteSMK37.songTitlesFrame("A".repeat(100),"B".repeat(100));
  assertTrue(RemoteSMK37.valid(bounded));assertEquals(83,bounded.length);
 }

 @Test public void playlistHeaderHasBoundedTextAndChecksum(){
  byte[] all=RemoteSMK37.playlistFrame("All regions");
  assertTrue(RemoteSMK37.valid(all));assertEquals(25,all[6]);
  byte[] longName=RemoteSMK37.playlistFrame("A".repeat(70));
  assertTrue(RemoteSMK37.valid(longName));assertEquals(45,longName.length);
  assertEquals('.',longName[40]);assertEquals('.',longName[41]);assertEquals('.',longName[42]);
 }

 @Test public void navigationKeepsEdgesAndRepeatedNames(){
  byte[] wire=RemoteSMK37.navigationFrame(1,java.util.Arrays.asList("A","B","B","C"),2);
  assertTrue(RemoteSMK37.valid(wire));assertArrayEquals(RemoteSMK37.frame(23,1,1,'A',1,'B',1,'B',1,'C',0),wire);
  byte[] longest=RemoteSMK37.navigationFrame(3,java.util.Collections.nCopies(5,"A".repeat(100)),2);
  assertTrue(RemoteSMK37.valid(longest));assertEquals(95,longest.length);
 }
 @Test public void progressMatchesAppleAndWindows(){
  assertArrayEquals(RemoteSMK37.frame(24,100,0,30,0,0,60,0,0),RemoteSMK37.playbackFrame(130,100,160));
  assertArrayEquals(RemoteSMK37.frame(24,72,1,60,0,0,60,0,0),RemoteSMK37.playbackFrame(200,100,160));
  assertArrayEquals(RemoteSMK37.frame(24,0,0,0,0,0,0,0,0),RemoteSMK37.playbackFrame(Double.NaN,0,1));
 }

 @Test public void checksumAndWireMatchApple() throws Exception {
  byte[] wire=RemoteSMK37.frame(22,1,25,64);
  assertTrue(RemoteSMK37.valid(wire));assertEquals(12,wire.length);
  wire[8]^=1;assertFalse(RemoteSMK37.valid(wire));
  assertFalse(RemoteSMK37.valid(new byte[100]));
 }
 @Test public void fadeUsesRunIDAndAuthoritativeRemaining() throws Exception {
  JSONObject fade=new JSONObject().put("runID","running").put("remaining",2.5).put("duration",5);
  assertTrue(RemoteSMK37.fadeActive(fade));
  assertArrayEquals(RemoteSMK37.frame(22,1,25,64),RemoteSMK37.fadeProgress(fade));
  fade.put("remaining",0);assertArrayEquals(RemoteSMK37.frame(22,1,0,0),RemoteSMK37.fadeProgress(fade));
  fade.remove("runID");assertFalse(RemoteSMK37.fadeActive(fade));
  assertArrayEquals(RemoteSMK37.frame(22,0,0,0),RemoteSMK37.fadeProgress(fade));
 }
 @Test public void faderNeverExceedsZeroDB(){
  assertEquals(0,RemoteSMK37.padBusGain(0),0);assertEquals(1,RemoteSMK37.padBusGain(127),0);
  double previous=0;for(int value=0;value<=127;value++){double gain=RemoteSMK37.padBusGain(value);assertTrue(gain>=previous&&gain<=1);previous=gain;}
 }
}
