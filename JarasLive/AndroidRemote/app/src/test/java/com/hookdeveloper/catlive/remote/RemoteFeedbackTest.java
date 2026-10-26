package com.hookdeveloper.catlive.remote;
import org.json.*;import org.junit.*;import static org.junit.Assert.*;
public class RemoteFeedbackTest {
 JSONObject host()throws Exception{return new JSONObject("{\"project\":\"P\",\"song\":\"S\",\"tracks\":[{\"id\":\"T\",\"mute\":false,\"solo\":false,\"clips\":[{\"id\":\"C\",\"muted\":false}]}],\"masterMono\":false,\"loop\":false,\"regionAuto\":false,\"multiLoopsBypassed\":false,\"setlistLiveEnabled\":false,\"previewActive\":false,\"bpm\":140}");}
 @Test public void trackTogglesAreImmediateAndDoNotMutateHost()throws Exception{JSONObject host=host();RemoteFeedback f=new RemoteFeedback();assertTrue(f.record(host,"mute","T",0,null,0));JSONObject shown=f.overlay(host);assertTrue(shown.getJSONArray("tracks").getJSONObject(0).getBoolean("mute"));assertFalse(host.getJSONArray("tracks").getJSONObject(0).getBoolean("mute"));assertTrue(f.receive(host,100).getJSONArray("tracks").getJSONObject(0).getBoolean("mute"));host.getJSONArray("tracks").getJSONObject(0).put("mute",true);assertSame(host,f.receive(host,200));assertTrue(f.pending.isEmpty());}
 @Test public void rapidOppositeClicksIgnoreInitialAndIntermediateEchoes()throws Exception{JSONObject host=host();RemoteFeedback f=new RemoteFeedback();f.record(host,"solo","T",0,null,0);f.record(f.overlay(host),"solo","T",0,null,10);assertFalse(f.receive(host,20).getJSONArray("tracks").getJSONObject(0).getBoolean("solo"));assertFalse(f.pending.isEmpty());host.getJSONArray("tracks").getJSONObject(0).put("solo",true);assertFalse(f.receive(host,30).getJSONArray("tracks").getJSONObject(0).getBoolean("solo"));host.getJSONArray("tracks").getJSONObject(0).put("solo",false);assertSame(host,f.receive(host,40));assertTrue(f.pending.isEmpty());}
 @Test public void unconfirmedControlsExpireAndProjectChangesClearPending()throws Exception{JSONObject host=host();RemoteFeedback f=new RemoteFeedback();f.record(host,"toggleLoop",null,0,null,0);assertTrue(f.receive(host,1999).getBoolean("loop"));assertFalse(f.receive(host,2001).getBoolean("loop"));f.record(host,"masterMono",null,0,null,2010);host.put("project","OTHER");assertFalse(f.receive(host,2011).getBoolean("masterMono"));assertTrue(f.pending.isEmpty());}
 @Test public void independentControlsAndClipMuteFollowLocalValues()throws Exception{JSONObject host=host();RemoteFeedback f=new RemoteFeedback();String[] actions={"toggleRegionAuto","toggleMultiLoopBypass","toggleSetlistLive","togglePreview"};String[] fields={"regionAuto","multiLoopsBypassed","setlistLiveEnabled","previewActive"};for(String action:actions)assertTrue(f.record(f.overlay(host),action,null,0,null,0));assertTrue(f.record(f.overlay(host),"clipMute","C",0,null,0));JSONObject shown=f.receive(host,100);for(String field:fields){assertTrue(shown.getBoolean(field));assertFalse(host.getBoolean(field));}assertTrue(shown.getJSONArray("tracks").getJSONObject(0).getJSONArray("clips").getJSONObject(0).getBoolean("muted"));assertFalse(host.getJSONArray("tracks").getJSONObject(0).getJSONArray("clips").getJSONObject(0).getBoolean("muted"));}
 @Test public void numericFeedbackKeepsLatestValueAcrossOlderResponses()throws Exception{JSONObject host=host();RemoteFeedback f=new RemoteFeedback();f.record(host,"tempo",null,141,null,0);f.record(f.overlay(host),"tempo",null,142,null,10);host.put("bpm",141);assertEquals(142,f.receive(host,20).getDouble("bpm"),0);host.put("bpm",142);assertSame(host,f.receive(host,30));assertTrue(f.pending.isEmpty());}
 @Test public void transportControlsRespondLocallyButRevertIfHostRejects()throws Exception{JSONObject host=host().put("playing",false).put("paused",false).put("subPlaying",false);RemoteFeedback f=new RemoteFeedback();f.record(host,"play",null,0,null,0);assertTrue(f.overlay(host).getBoolean("playing"));assertFalse(host.getBoolean("playing"));f.record(f.overlay(host),"pause",null,0,null,10);assertFalse(f.overlay(host).getBoolean("playing"));assertTrue(f.overlay(host).getBoolean("paused"));assertFalse(f.receive(host,2011).getBoolean("paused"));assertTrue(f.pending.isEmpty());}

 @Test public void muteChangesDerivedGrayStateAndUnmuteRestoresItBeforeReplies()throws Exception{
  JSONObject host=host();RemoteFeedback f=new RemoteFeedback();f.record(host,"mute","T",0,null,0);
  assertTrue(f.overlay(host).getJSONArray("tracks").getJSONObject(0).getBoolean("silenced"));assertFalse(host.getJSONArray("tracks").getJSONObject(0).optBoolean("silenced"));
  f.record(f.overlay(host),"mute","T",0,null,10);assertFalse(f.receive(host,20).getJSONArray("tracks").getJSONObject(0).getBoolean("silenced"));
  host.getJSONArray("tracks").getJSONObject(0).put("mute",true).put("silenced",true);
  assertFalse(f.receive(host,30).getJSONArray("tracks").getJSONObject(0).getBoolean("silenced"));
 }
 @Test public void soloUsesIphoneAncestryWithoutMakingSiblingsAudible()throws Exception{
  JSONObject host=host().put("tracks",new JSONArray("[{\"id\":\"G\"},{\"id\":\"N\",\"parentTrack\":\"G\"},{\"id\":\"A\",\"parentTrack\":\"N\"},{\"id\":\"B\",\"parentTrack\":\"G\"},{\"id\":\"X\"}]"));
  RemoteFeedback f=new RemoteFeedback();f.record(host,"solo","A",0,null,0);JSONObject shown=f.overlay(host);
  for(String id:new String[]{"G","N","A"})assertFalse(RemoteFeedback.target(shown,"tracks",id).getBoolean("silenced"));
  for(String id:new String[]{"B","X"})assertTrue(RemoteFeedback.target(shown,"tracks",id).getBoolean("silenced"));
  f.record(shown,"solo","G",0,null,1);shown=f.overlay(host);assertFalse(RemoteFeedback.target(shown,"tracks","B").getBoolean("silenced"));assertTrue(RemoteFeedback.target(shown,"tracks","X").getBoolean("silenced"));
  f.record(shown,"mute","B",0,null,2);assertTrue(RemoteFeedback.target(f.overlay(host),"tracks","B").getBoolean("silenced"));
 }
 @Test public void linkedGainAndMirroredPanChangeTogetherAndIgnoreOldPackets()throws Exception{
  JSONObject host=host().put("tracks",new JSONArray("[{\"id\":\"L\",\"linkedTrack\":\"R\",\"volume\":1,\"pan\":0},{\"id\":\"R\",\"linkedTrack\":\"L\",\"volume\":1,\"pan\":0}]"));
  RemoteFeedback f=new RemoteFeedback();f.record(host,"volume","L",.4,null,0);f.record(f.overlay(host),"pan","L",-.8,null,1);JSONObject shown=f.receive(host,10);
  assertEquals(.4,RemoteFeedback.target(shown,"tracks","R").getDouble("volume"),0);assertEquals(.8,RemoteFeedback.target(shown,"tracks","R").getDouble("pan"),0);assertEquals(1,RemoteFeedback.target(host,"tracks","R").getDouble("volume"),0);
 }
 @Test public void tunerAndVinhetasPresetAreLocalAndKeepTheirLatestValue()throws Exception{
  JSONObject host=host().put("pitchRegion","REGION").put("pitchSemitones",0).put("vinhetas",new JSONObject().put("selectedPreset",0));RemoteFeedback f=new RemoteFeedback();f.record(host,"pitch","REGION",2,null,0);f.record(f.overlay(host),"vinhetasPreset",null,3,null,1);
  JSONObject shown=f.receive(host,10);assertEquals(2,shown.getInt("pitchSemitones"));assertEquals(3,shown.getJSONObject("vinhetas").getInt("selectedPreset"));assertFalse(f.record(shown,"pitch","OTHER",3,null,11));
 }
 @Test public void seekMovesBothNeedlesLocallyButNeverSeeksRunningTransport()throws Exception{
  JSONObject host=host().put("playing",false).put("position",0).put("editPosition",0).put("timelineRegions",new JSONArray("[{\"id\":\"R\",\"start\":10,\"end\":30}]"));RemoteFeedback f=new RemoteFeedback();assertTrue(f.record(host,"seek","R",20,null,0));JSONObject shown=f.receive(host,20);assertEquals(20,shown.getDouble("editPosition"),0);assertEquals(20,shown.getDouble("position"),0);
  assertFalse(f.record(new JSONObject(host.toString()).put("playing",true),"seek","R",24,null,21));
 }
 @Test public void selectingSongUpdatesHighlightAndQueueWithoutWaitingForServer()throws Exception{
  JSONObject host=host().put("playing",true).put("currentRegion","A").put("focusedRegion","A").put("songDisplays",new JSONObject()).put("sectionPlayback",new JSONObject()).put("timelineRegions",new JSONArray("[{\"id\":\"A\",\"name\":\"Atual\",\"start\":0,\"end\":30},{\"id\":\"B\",\"name\":\"Fila\",\"start\":30,\"end\":60}]"));RemoteFeedback f=new RemoteFeedback();assertTrue(f.record(host,"selectRegion","B",0,null,0));JSONObject shown=f.receive(host,1);assertEquals("B",shown.getString("focusedRegion"));assertEquals("B",shown.getString("queuedRegion"));assertEquals("Fila",shown.getJSONObject("songDisplays").getString("queued"));assertEquals("A",shown.getString("currentRegion"));
 }
 @Test public void turningLiveOffClearsStrikesAndPreviewToggleChangesProjectionLocally()throws Exception{
  JSONObject host=host().put("setlistLiveEnabled",true).put("playedLiveRegionIDs",new JSONArray().put("R")).put("teleprompters",new JSONArray("[{\"index\":1,\"preview\":false,\"blocks\":[{\"rows\":[{\"liveExecuted\":true}]}]}]"));RemoteFeedback f=new RemoteFeedback();f.record(host,"toggleSetlistLive",null,0,null,0);f.record(f.overlay(host),"togglePreview",null,0,null,1);JSONObject shown=f.overlay(host);
  assertEquals(0,shown.getJSONArray("playedLiveRegionIDs").length());JSONObject tp=shown.getJSONArray("teleprompters").getJSONObject(0);assertTrue(tp.getBoolean("preview"));assertFalse(tp.getJSONArray("blocks").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getBoolean("liveExecuted"));assertEquals(1,host.getJSONArray("playedLiveRegionIDs").length());assertFalse(host.getJSONArray("teleprompters").getJSONObject(0).getBoolean("preview"));
 }
}
