package com.hookdeveloper.catlive.remote;
import org.json.*;
import org.junit.*;
import static org.junit.Assert.*;
public class RemoteBlockFeedbackTest {
    JSONObject host() throws Exception {return new JSONObject("{\"project\":\"P\",\"song\":\"S\",\"selectedPlaylist\":\"L\",\"playing\":true,\"position\":39,\"playbackEnd\":40,\"currentRegion\":\"A\",\"currentPlaylistEntryId\":\"A\",\"regionAuto\":false,\"regionAutoUntilBlockEnd\":true,\"regions\":[{\"id\":\"A\",\"name\":\"First\",\"start\":30,\"end\":40},{\"id\":\"B\",\"name\":\"Next\",\"start\":4,\"end\":14}],\"setlistBlocks\":[{\"id\":\"block\",\"beforeRegion\":\"B\"}]}");}
    @Test public void completesLocallyWithAutoOffAndRetainsSelectionAcrossLatePackets() throws Exception {
        JSONObject host=host();RemoteBlockFeedback f=new RemoteBlockFeedback();
        assertTrue(f.receive(host,1000).getBoolean("playing"));assertNull(f.advance(1999));
        JSONObject shown=f.advance(2000);assertFalse(shown.getBoolean("playing"));assertEquals("B",shown.getString("focusedRegion"));assertEquals(4,shown.getDouble("position"),1e-9);assertEquals(4,shown.getDouble("editPosition"),1e-9);assertTrue(host.getBoolean("playing"));
        JSONObject late=host().put("position",39.9);assertFalse(f.receive(late,2010).getBoolean("playing"));
        assertTrue(f.receive(host().put("position",35),2020).getBoolean("playing"));
        f.clear();assertNull(f.advance(100000));
    }
    @Test public void loopQueueSubplayChangedPlaylistOrProjectCancelPrediction() throws Exception {
        for(String field:new String[]{"loop","subPlaying","paused"}){RemoteBlockFeedback f=new RemoteBlockFeedback();f.receive(host().put(field,true),0);assertNull(f.advance(100000));}
        RemoteBlockFeedback f=new RemoteBlockFeedback();f.receive(host().put("queuedRegion","B"),0);assertNull(f.advance(100000));
        f.receive(host(),0);f.advance(1000);assertTrue(f.receive(host().put("project","OTHER"),1001).getBoolean("playing"));
        f.advance(2001);assertTrue(f.receive(host().put("selectedPlaylist","OTHER"),2002).getBoolean("playing"));
        f.receive(host().put("regionAutoUntilBlockEnd",false),0);assertNull(f.advance(100000));
    }
    @Test public void repeatedOccurrenceKeepsIdentityAndHostCanOverrideSelection() throws Exception {
        JSONObject host=host();host.getJSONArray("regions").getJSONObject(1).put("sourceRegionId","A").put("start",30).put("end",40);
        RemoteBlockFeedback f=new RemoteBlockFeedback();f.receive(host,0);JSONObject shown=f.advance(1000);
        assertEquals("A",shown.getString("currentRegion"));assertEquals("B",shown.getString("currentPlaylistEntryId"));assertEquals("B",shown.getString("focusedRegion"));
        JSONObject stopped=host().put("playing",false).put("focusedRegion","A");assertSame(stopped,f.receive(stopped,1010));
    }
    @Test public void manualStopPreparesImmediatelyWithLatePacketProtectionAndTimeout() throws Exception {
        RemoteBlockFeedback f=new RemoteBlockFeedback();
        JSONObject shown=f.stop(host(),1000);
        assertFalse(shown.getBoolean("playing"));assertEquals("B",shown.getString("focusedRegion"));assertEquals("B",shown.getString("gridRegion"));assertEquals(4,shown.getDouble("editPosition"),1e-9);
        assertEquals("B",f.receive(host(),1100).getString("focusedRegion"));
        assertSame(shown,f.receive(shown,1200));assertNull(f.stop(shown,1300));
        assertNotNull(f.stop(host().put("playing",false).put("paused",true),1400));
        f.stop(host(),2000);assertTrue(f.advance(3500).getBoolean("playing"));
        assertNull(f.stop(host().put("subPlaying",true),4000));
        assertNull(f.stop(host().put("queuedRegion","C"),4000));
    }
    @Test public void repeatedPositionPacketsDoNotPostponeTheLocalBoundary() throws Exception {
        RemoteBlockFeedback f=new RemoteBlockFeedback();f.receive(host(),0);
        f.receive(host(),300);f.receive(host(),700);f.receive(host(),999);
        assertNull(f.advance(999));
        JSONObject shown=f.advance(1000);
        assertNotNull(shown);assertFalse(shown.getBoolean("playing"));
        assertEquals("B",shown.getString("focusedRegion"));
        assertFalse(f.receive(host(),1100).getBoolean("playing"));
    }
}
