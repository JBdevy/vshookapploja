package com.hookdeveloper.catlive.remote;

import android.os.Looper;
import android.view.KeyEvent;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.json.*;
import org.junit.*;
import static org.junit.Assert.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteSetlistNavigationTest {
    ActivityController<MainActivity> controller;
    MainActivity app;
    final List<JSONObject> commands=new ArrayList<>();
    final String a=id("a"),b=id("b"),c=id("c"),child=id("child");
    static String id(String text){return UUID.nameUUIDFromBytes(text.getBytes(StandardCharsets.UTF_8)).toString();}
    JSONObject region(String id,String name,int start)throws Exception {
        return new JSONObject().put("id",id).put("name",name).put("start",start).put("end",start+10).put("color",0x69ed91);
    }
    @Before public void start()throws Exception {
        controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();
        app.entering=true;app.remote.connected=true;app.remote.mode="director";
        app.remote.state=new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));
        app.remote.state.put("regions",new JSONArray().put(region(a,"First",0)).put(region(b,"Group",10)).put(region(c,"Last",30)))
            .put("timelineRegions",new JSONArray().put(region(a,"First",0)).put(region(b,"Group",10)).put(region(child,"Child",12).put("parentRegion",b)).put(region(c,"Last",30)))
            .put("focusedRegion",a).put("currentRegion",a).put("queuedRegion",b).put("playing",true).put("subPlaying",false);
        app.onChanged();app.root.setFocusableInTouchMode(true);app.root.requestFocus();
        app.remote.listener=new RemoteSession.Listener(){
            public void onChanged(){app.onChanged();}
            public void onLocalChanged(){app.onLocalChanged();}
            public void onMessage(String message){}
            public void onLocalCommand(JSONObject command){commands.add(command);app.onLocalCommand(command);}
        };
    }
    @After public void close(){controller.pause().stop().destroy();}
    void hostPlayback(boolean playing,boolean sub)throws Exception {
        app.remote.feedback.clear();app.remote.confirmedState=null;
        app.remote.state=new JSONObject(app.state.toString()).put("playing",playing).put("subPlaying",sub);
        app.onChanged();
    }
    void waitMs(int ms){Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms));}
    void key(int code,int repeat){assertTrue(app.onKeyDown(code,new KeyEvent(0,0,KeyEvent.ACTION_DOWN,code,repeat)));}
    List<JSONObject> selections(){List<JSONObject> result=new ArrayList<>();for(JSONObject command:commands)if(command.optString("action").equals("selectRegion"))result.add(command);return result;}

    @Test public void observerFollowsHostDuringPlaybackIgnoringOldDirectorBrowsing()throws Exception {
        app.setlistBrowseID=b;app.query="no match";
        app.remote.mode="observer";app.remote.state.put("focusedRegion",c);app.onChanged();waitMs(100);
        assertTrue(app.isSetlistSelected(c));assertFalse(app.isSetlistSelected(b));assertFalse(app.isSetlistSelected(a));
        assertEquals(a,RemoteModel.activeEntry(app.state));assertEquals(b,RemoteModel.queuedEntry(app.state));
        assertEquals(3,app.visibleSetlistRegions().size());assertEquals(c,app.observerFollowID);
        app.remote.state=new JSONObject(app.state.toString()).put("focusedRegion",b).put("subPlaying",true);app.onChanged();waitMs(100);
        assertTrue(app.isSetlistSelected(b));assertFalse(app.isSetlistSelected(c));assertEquals(b,app.observerFollowID);
        assertEquals(a,RemoteModel.activeEntry(app.state));assertEquals(b,RemoteModel.queuedEntry(app.state));
        for(JSONObject command:commands)assertEquals("remotePanel",command.optString("action"));
    }
    @Test public void observerDrawerFocusIsSingleAndClearsWhenHostClearsIt()throws Exception {
        app.remote.mode="observer";app.remote.state.put("focusedRegion",child);app.onChanged();
        assertTrue(app.isSetlistSelected(b));assertFalse(app.isSetlistSelected(child));
        app.expanded.add(b);app.refresh();
        assertFalse(app.isSetlistSelected(b));assertTrue(app.isSetlistSelected(child));
        app.remote.state.remove("focusedRegion");app.onChanged();
        for(String id:Arrays.asList(a,b,c,child))assertFalse(app.isSetlistSelected(id));
        assertEquals("",app.observerFollowID);for(JSONObject command:commands)assertEquals("remotePanel",command.optString("action"));
    }
    @Test public void previewMIDILearnsPersistsAndTogglesOncePerPress()throws Exception {
        app.state.put("previewActive",false);
        RemoteMidi midi=new RemoteMidi(app,app::midiAction);
        midi.learning="togglePreview";midi.received("controller",0xb0,78,127);
        midi.received("controller",0xb0,78,0);midi.received("controller",0xb0,78,127);midi.received("controller",0xb0,78,90);
        assertEquals(1,commands.size());assertEquals("togglePreview",commands.get(0).getString("action"));
        assertTrue(Arrays.asList(RemoteMidi.ACTIONS).contains("togglePreview"));
        assertEquals(midi.label("togglePreview"),new RemoteMidi(app,app::midiAction).label("togglePreview"));
        app.state.remove("previewActive");midi.received("controller",0xb0,78,0);midi.received("controller",0xb0,78,127);
        assertEquals(1,commands.size());
    }
    @Test public void legacyTransportMappingsMigrateToTogglesAndPersist()throws Exception {
        JSONObject old=new JSONObject().put("key","controller:0:144:60").put("label","Play pad");
        JSONObject sub=new JSONObject().put("key","controller:0:144:61").put("label","Sub pad");
        app.getSharedPreferences("catlive.remote.midi",0).edit().putString("bindings",new JSONObject().put("play",old).put("subPlay",sub).toString()).commit();
        RemoteMidi midi=new RemoteMidi(app,app::midiAction);
        assertFalse(Arrays.asList(RemoteMidi.ACTIONS).contains("play"));assertFalse(Arrays.asList(RemoteMidi.ACTIONS).contains("stop"));
        assertEquals("Play pad",midi.label("playStop"));assertEquals("Sub pad",midi.label("subPlayStop"));
        midi.received("controller",0x90,60,127);midi.received("controller",0x90,60,90);
        hostPlayback(true,false);midi.received("controller",0x90,61,127);
        hostPlayback(true,true);midi.received("controller",0x80,61,0);midi.received("controller",0x90,61,127);
        assertEquals(3,commands.size());assertEquals("stop",commands.get(0).getString("action"));
        assertEquals("subPlay",commands.get(1).getString("action"));assertEquals("subStop",commands.get(2).getString("action"));
        hostPlayback(false,false);midi.received("controller",0x80,60,0);midi.received("controller",0x90,60,127);
        assertEquals("play",commands.get(3).getString("action"));
        JSONObject saved=new JSONObject(app.getSharedPreferences("catlive.remote.midi",0).getString("bindings","{}"));
        assertFalse(saved.has("play"));assertTrue(saved.has("playStop"));assertTrue(saved.has("subPlayStop"));
    }
    @Test public void midiBrowsingSurvivesPlaybackPacketsWithoutReplacingQueue()throws Exception {
        app.midiAction("setlistDown");app.midiAction("setlistDown");
        assertEquals(c,app.setlistBrowseID);assertTrue(app.isSetlistSelected(c));
        for(int i=0;i<10;i++){app.remote.state=new JSONObject(app.state.toString()).put("position",i*.1).put("focusedRegion",a);app.onChanged();}
        waitMs(500);
        assertTrue(selections().isEmpty());assertEquals(b,app.state.getString("queuedRegion"));assertTrue(app.state.getBoolean("playing"));assertTrue(app.isSetlistSelected(c));
        key(KeyEvent.KEYCODE_ENTER,0);key(KeyEvent.KEYCODE_ENTER,1);
        assertEquals(1,selections().size());assertEquals(c,selections().get(0).getString("target"));
    }
    @Test public void heldArrowOnlyCommitsAfterReleaseWhenStopped()throws Exception {
        app.state.put("playing",false);app.state.remove("queuedRegion");
        key(KeyEvent.KEYCODE_DPAD_DOWN,0);waitMs(600);
        assertTrue(selections().isEmpty());assertEquals(b,app.setlistBrowseID);
        key(KeyEvent.KEYCODE_DPAD_DOWN,1);assertEquals(c,app.setlistBrowseID);waitMs(300);
        assertTrue(selections().isEmpty());
        app.onKeyUp(KeyEvent.KEYCODE_DPAD_DOWN,new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_DOWN));
        waitMs(199);assertTrue(selections().isEmpty());waitMs(1);
        assertEquals(1,selections().size());assertEquals(c,selections().get(0).getString("target"));
    }
    @Test public void visibleDrawerAndSearchOrderMatchTheList()throws Exception {
        app.expanded.add(b);app.navigateSong(1);assertEquals(b,app.setlistBrowseID);
        app.navigateSong(1);assertEquals(child,app.setlistBrowseID);
        app.expanded.clear();app.navigateSong(1);assertEquals(c,app.setlistBrowseID);
        app.resetSetlistBrowsing();app.query="Last";app.navigateSong(-1);assertEquals(c,app.setlistBrowseID);
        app.navigateSong(-1);assertEquals(c,app.setlistBrowseID);assertTrue(selections().isEmpty());
    }
    @Test public void changingContextOrStartingPlaybackCancelsDelayedSelection()throws Exception {
        app.state.put("playing",false);app.navigateSong(1);
        app.state.put("playing",true);waitMs(250);assertTrue(selections().isEmpty());
        app.state.put("playing",false);app.navigateSong(1);
        app.remote.state=new JSONObject(app.state.toString()).put("selectedPlaylist",id("another list"));app.onChanged();
        waitMs(250);assertTrue(selections().isEmpty());assertEquals("",app.setlistBrowseID);
    }
    @Test public void textModalObserverAndDisconnectedRemoteDoNotNavigate() {
        controller.visible();
        android.widget.EditText editor=new android.widget.EditText(app);
        app.root.addView(editor);
        android.view.View decor=app.getWindow().getDecorView();
        decor.measure(android.view.View.MeasureSpec.makeMeasureSpec(393,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(851,android.view.View.MeasureSpec.EXACTLY));
        decor.layout(0,0,393,851);
        assertTrue("Editor must be focusable",editor.requestFocus());
        // Robolectric keeps Activity focus separately from the real View tree.
        Shadows.shadowOf(app).setCurrentFocus(editor);
        assertTrue(app.getCurrentFocus() instanceof android.widget.EditText);
        app.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_DOWN));
        assertEquals("",app.setlistBrowseID);
        editor.clearFocus();Shadows.shadowOf(app).setCurrentFocus(null);app.root.removeView(editor);app.remote.mode="observer";app.navigateSong(1);assertEquals("",app.setlistBrowseID);
        app.remote.mode="director";app.remote.connected=false;app.navigateSong(1);assertEquals("",app.setlistBrowseID);
        app.remote.connected=true;app.input("Edit","",false,value->{});app.navigateSong(1);assertEquals("",app.setlistBrowseID);
        assertTrue(selections().isEmpty());
    }
}
