package com.hookdeveloper.catlive.remote;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.util.*;

public class RemoteTimelineTest {
    @Test public void elapsedTimeLabelsRetainAbsolutePositionWhenPanning(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,180,120,4,4));
        List<RemoteTimeline.Tick> all=RemoteTimeline.ticks(sections,0,60,20,4);
        List<RemoteTimeline.Tick> panned=RemoteTimeline.ticks(sections,11,55,20,4);
        assertEquals("00:00:00",all.get(0).label);
        assertTrue(all.stream().anyMatch(t->t.label.equals("00:00:16")));
        for(RemoteTimeline.Tick t:panned){RemoteTimeline.Tick original=all.stream().filter(x->x.time==t.time).findFirst().get();assertEquals(original.label,t.label);assertEquals(original.primary,t.primary);}
    }
    @Test public void tempoChangesAndEighthNoteMeterKeepNativeTickPositions(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,8,120,4,4),new RemoteTimeline.Section(8,40,60,3,8));
        List<RemoteTimeline.Tick> ticks=RemoteTimeline.ticks(sections,0,20,100,8);
        assertTrue(ticks.stream().anyMatch(t->t.time==8&&t.primary));
        assertTrue(ticks.stream().anyMatch(t->t.time==9.5&&t.primary));
        assertTrue(ticks.stream().anyMatch(t->t.time==8.5&&!t.primary));
        assertEquals("00:00:09.500",RemoteTimeline.timeLabel(9.5));
        for(int i=1;i<ticks.size();i++)assertTrue(ticks.get(i).time>ticks.get(i-1).time);
    }
    @Test public void distantRulerLabelsNeverOverlap(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,3600,146,4,4));
        for(double scale:new double[]{.08,1,8,100}){
            double previous=Double.NEGATIVE_INFINITY;
            for(RemoteTimeline.Tick tick:RemoteTimeline.ticks(sections,0,3600,scale,4))if(!tick.label.isEmpty()){assertTrue((tick.time-previous)*scale>=129.999);previous=tick.time;}
        }
    }
    @Test public void legacyHostWithoutTempoMapStillHasRuler()throws Exception{
        List<RemoteTimeline.Section> sections=RemoteTimeline.sections(new JSONObject().put("bpm",120),120);
        assertFalse(RemoteTimeline.ticks(sections,20,60,10,4).isEmpty());
    }
    @Test public void markerFlagsStopBeforeNextSongAndRegionEnd(){
        assertEquals(27,RemoteTimeline.flagWidth(100,10,13,60,10),0);
        assertEquals(20,RemoteTimeline.flagWidth(100,10,30,12,10),0);
        assertEquals(0,RemoteTimeline.flagWidth(100,10,11,60,10),0);
    }
}
