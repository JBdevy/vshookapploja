package com.hookdeveloper.catlive.remote;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class RemoteFadeoutTest {
    private JSONObject state(String project,String run,double remaining,String ack)throws Exception {
        return new JSONObject().put("project",project).put("fadeout",new JSONObject()
            .put("runID",run).put("duration",3).put("remaining",remaining).put("lastCommandID",ack));
    }
    private JSONObject command(String id,boolean enabled)throws Exception {
        return new JSONObject().put("id",id).put("enabled",enabled);
    }
    @Test public void startAndCancelStayImmediateUntilTheirOwnAcknowledgement()throws Exception {
        RemoteFadeout model=new RemoteFadeout();
        model.receive(state("project","",0,""),100);
        model.command(command("start",true),200);
        assertTrue(model.active(200));
        model.receive(state("project","",0,"old"),220);
        assertTrue(model.active(220));
        model.receive(state("project","run",3,"start"),250);
        assertTrue(model.active(250));
        assertEquals("",model.pending);
        model.command(command("cancel",false),300);
        assertFalse(model.active(300));
        model.receive(state("project","run",2.9,"start"),350);
        assertFalse(model.active(350));
        model.receive(state("project","",0,"cancel"),400);
        assertFalse(model.active(400));
        assertEquals("",model.pending);
    }
    @Test public void countdownUsesElapsedTimeAndNeverBecomesNegative()throws Exception {
        RemoteFadeout model=new RemoteFadeout();model.receive(state("project","run",2.5,""),1000);
        assertEquals(2,model.value(1500),0.0001);
        assertEquals(2.5,model.value(900),0.0001);
        assertEquals(0,model.value(5000),0);
    }
    @Test public void switchingProjectsDiscardsPendingCommand()throws Exception {
        RemoteFadeout model=new RemoteFadeout();model.receive(state("a","run",3,""),100);
        model.command(command("cancel",false),150);
        model.receive(state("b","other-run",3,""),200);
        assertEquals("",model.pending);assertTrue(model.active(200));
        assertEquals("other-run",model.run);
    }
    @Test public void absentOrInvalidStateCannotLeaveAStuckOverlay()throws Exception {
        RemoteFadeout model=new RemoteFadeout();model.receive(state("project","run",3,""),100);
        model.receive(state("project","run",9,""),200);
        assertFalse(model.supported);assertFalse(model.active(200));assertEquals(0,model.value(200),0);
        model.receive(state("project","run",3,""),300);
        model.command(command("cancel",false),350);
        model.receive(new JSONObject().put("project","project"),400);
        assertFalse(model.supported);assertFalse(model.active(400));assertEquals("",model.pending);
    }
    @Test public void unacknowledgedCommandExpiresBackToHostState()throws Exception {
        RemoteFadeout model=new RemoteFadeout();model.receive(state("project","",0,""),100);
        model.command(command("start",true),200);
        assertTrue(model.active(2199));assertFalse(model.active(2200));
        model.receive(state("project","",0,""),2200);
        assertEquals("",model.pending);
    }
}
