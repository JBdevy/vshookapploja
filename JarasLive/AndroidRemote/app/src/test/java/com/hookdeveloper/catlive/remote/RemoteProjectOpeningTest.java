package com.hookdeveloper.catlive.remote;
import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.RobolectricTestRunner;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31)
public class RemoteProjectOpeningTest {
 RemoteProjectOpening opening=new RemoteProjectOpening();JSONObject state,command;
 @Before public void start()throws Exception{state=new JSONObject().put("project","P1").put("projects",new JSONObject().put("busy",false).put("error","").put("recent",new JSONArray().put(new JSONObject().put("id","R").put("name","Projeto"))));command=new JSONObject().put("id","C").put("target","R");opening.begin(command,state,100);}
 void receipt(String id,String phase)throws Exception{state.getJSONObject("projects").put("commandID",id).put("commandState",phase);opening.receive(state);}
 @Test public void idleAndUnrelatedReceiptsNeverFinishLocalRequest()throws Exception{opening.receive(state);assertTrue(opening.active());receipt("OTHER","completed");assertTrue(opening.active());assertEquals("Projeto",opening.name);}
 @Test public void correlatedFastCompletionDoesNotRequireIntermediateBusy()throws Exception{receipt("C","completed");assertFalse(opening.active());}
 @Test public void replacedProjectDoesNotPrematurelyComplete()throws Exception{receipt("C","opening");state.put("project","P2");opening.receive(state);assertTrue(opening.active());receipt("C","completed");assertFalse(opening.active());}
 @Test public void errorsAndConfirmationRemainRecoverable()throws Exception{receipt("C","waiting");assertTrue(opening.active());assertTrue(opening.canDismiss(101));state.getJSONObject("projects").put("error","Arquivo ausente");receipt("C","failed");assertEquals("Arquivo ausente",opening.error);assertTrue(opening.active());opening.clear();assertFalse(opening.active());}
 @Test public void cancelledHostRequestStopsWaiting()throws Exception{receipt("C","cancelled");assertFalse(opening.active());}
 @Test public void elapsedTimeNeverPretendsSuccess(){assertFalse(opening.canDismiss(1000));assertTrue(opening.canDismiss(21000));assertTrue(opening.active());}
 @Test public void legacyCompletionRequiresBusyAndNewProject()throws Exception{state.put("project","P2");opening.receive(state);assertTrue(opening.active());state.getJSONObject("projects").put("busy",true);opening.receive(state);assertTrue(opening.active());state.getJSONObject("projects").put("busy",false);opening.receive(state);assertFalse(opening.active());}
 @Test public void legacyBusyWithoutChangedProjectDoesNotClaimCompletion()throws Exception{state.getJSONObject("projects").put("busy",true);opening.receive(state);state.getJSONObject("projects").put("busy",false);opening.receive(state);assertTrue(opening.active());}
 @Test public void newRequestResetsPreviousFailure()throws Exception{receipt("C","failed");opening.begin(new JSONObject().put("id","D"),state,1000);assertEquals("opening",opening.phase);assertEquals("",opening.error);assertEquals("D",opening.id);}
}
