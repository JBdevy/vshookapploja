package com.hookdeveloper.catlive.remote;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.util.*;

public class RemoteTimelineTest {
    @Test public void musicalLabelsRetainAbsolutePositionWhenPanning(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,180,120,4,4));
        List<RemoteTimeline.Tick> all=RemoteTimeline.ticks(sections,0,60,20,4);
        List<RemoteTimeline.Tick> panned=RemoteTimeline.ticks(sections,11,55,20,4);
        assertEquals("1",all.get(0).label);
        assertTrue(all.stream().anyMatch(t->t.time==16&&t.label.equals("9")));
        for(RemoteTimeline.Tick t:panned){RemoteTimeline.Tick original=all.stream().filter(x->x.time==t.time).findFirst().get();assertEquals(original.label,t.label);assertEquals(original.primary,t.primary);}
    }
    @Test public void tempoChangesAndEighthNoteMeterKeepNativeTickPositions(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,8,120,4,4),new RemoteTimeline.Section(8,40,60,3,8));
        List<RemoteTimeline.Tick> ticks=RemoteTimeline.ticks(sections,0,20,100,8);
        assertTrue(ticks.stream().anyMatch(t->t.time==8&&t.primary&&t.label.equals("5")));
        assertTrue(ticks.stream().anyMatch(t->t.time==9.5&&t.primary&&t.label.equals("6")));
        assertTrue(ticks.stream().anyMatch(t->t.time==8.5&&!t.primary));
        List<RemoteTimeline.Tick> close=RemoteTimeline.ticks(sections,0,20,800,16);
        assertTrue(close.stream().anyMatch(t->t.time==8.5&&t.label.equals("5.2")&&t.drawsInGrid));
        assertTrue(close.stream().anyMatch(t->t.time==8.25&&t.label.equals("5.1.2")&&!t.drawsInGrid));
        for(int i=1;i<ticks.size();i++)assertTrue(ticks.get(i).time>ticks.get(i-1).time);
    }
    @Test public void distantRulerLabelsNeverOverlap(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,3600,146,4,4));
        for(double scale:new double[]{.08,1,8,100}){
            double previous=Double.NEGATIVE_INFINITY;
            for(RemoteTimeline.Tick tick:RemoteTimeline.ticks(sections,0,3600,scale,4))if(!tick.label.isEmpty()){assertTrue((tick.time-previous)*scale>=90.499);previous=tick.time;}
        }
    }
    @Test public void legacyHostWithoutTempoMapStillHasRuler()throws Exception{
        List<RemoteTimeline.Section> sections=RemoteTimeline.sections(new JSONObject().put("bpm",120),120);
        assertFalse(RemoteTimeline.ticks(sections,20,60,10,4).isEmpty());
    }
    @Test public void distantZoomShowsFourThenTwoThenEveryBarBeforeBeats(){
        List<RemoteTimeline.Section> sections=Arrays.asList(new RemoteTimeline.Section(0,120,120,4,4));
        for(double scale:new double[]{1,2,4}){
            List<RemoteTimeline.Tick> ticks=RemoteTimeline.ticks(sections,0,60,scale,4);
            assertEquals(8/scale,ticks.get(1).time-ticks.get(0).time,1e-9);
            assertTrue(ticks.stream().allMatch(t->t.primary));
        }
        assertTrue(RemoteTimeline.ticks(sections,0,60,32,4).stream().anyMatch(t->!t.primary));
    }
    @Test public void markerFlagsStopBeforeNextSongAndRegionEnd(){
        assertEquals(27,RemoteTimeline.flagWidth(100,10,13,60,10),0);
        assertEquals(20,RemoteTimeline.flagWidth(100,10,30,12,10),0);
        assertEquals(0,RemoteTimeline.flagWidth(100,10,11,60,10),0);
    }
}
