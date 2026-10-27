package com.hookdeveloper.catlive.remote;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;
public class RemoteSongTitleTest {
 @Test public void titleFollowsQueueAndDrawerRegardlessOfSelection()throws Exception {
  JSONObject s=new JSONObject("{\"playing\":true,\"position\":2,\"currentRegion\":\"root\",\"focusedRegion\":\"next\",\"songDisplays\":{\"current\":\"Stale\"},\"timelineRegions\":[{\"id\":\"root\",\"name\":\"Drawer\",\"start\":0,\"end\":10},{\"id\":\"child\",\"parentRegion\":\"root\",\"name\":\"Inside\",\"start\":1,\"end\":5},{\"id\":\"next\",\"name\":\"Next\",\"start\":11,\"end\":20}]}");
  assertEquals("Inside",RemoteModel.currentSongName(s));
  s.put("position",12).put("currentRegion","next").put("focusedRegion","root");
  assertEquals("Next",RemoteModel.currentSongName(s));
 }
}
