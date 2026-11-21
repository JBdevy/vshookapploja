package com.hookdeveloper.catlive.remote;

import org.json.JSONObject;
import java.util.*;

/** Native timeline geometry, in logical points (independent of display density). */
final class RemoteTimeline {
    static final int REGION_HEIGHT=16, MARKER_HEIGHT=16, NUMBER_HEIGHT=16, TICK_HEIGHT=16;
    static final int RULER_TOP=REGION_HEIGHT+MARKER_HEIGHT, HEADER_HEIGHT=RULER_TOP+NUMBER_HEIGHT+TICK_HEIGHT;
    static final class Tick {
        final double time; final boolean primary,drawsInGrid; final String label;
        Tick(double time,boolean primary,boolean drawsInGrid,String label){
            this.time=time;this.primary=primary;this.drawsInGrid=drawsInGrid;this.label=label;
        }
        int rank(){return !label.isEmpty()?3:drawsInGrid?2:primary?1:0;}
    }
    static final class Section {
        final double start,end,bpm; final int beats,unit;
        Section(double start,double end,double bpm,int beats,int unit){this.start=start;this.end=end;this.bpm=bpm;this.beats=beats;this.unit=unit;}
        double bar(){return 60/bpm*beats*4/unit;}
    }
    static List<Section> sections(JSONObject state,double end){
        List<Section> result=new ArrayList<>();
        for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"gridTempo"))){
            Section s=new Section(t.optDouble("start"),t.optDouble("end"),t.optDouble("bpm"),t.optInt("beats",4),t.optInt("unit",4));
            if(Double.isFinite(s.start)&&Double.isFinite(s.end)&&Double.isFinite(s.bpm)&&s.start>=0&&s.end>s.start&&s.bpm>0&&s.beats>0&&s.beats<=32&&s.unit>0&&s.unit<=64)result.add(s);
        }
        result.sort(Comparator.comparingDouble(s->s.start));
        if(result.isEmpty())result.add(new Section(0,Math.max(.001,end),Math.max(1,state.optDouble("bpm",120)),4,4));
        return result;
    }
    static double powerStride(double spacing,double width){return Math.pow(2,Math.max(0,Math.ceil(Math.log(spacing/Math.max(.001,width))/Math.log(2))));}
    static int hierarchy(int index){return Integer.lowestOneBit(index);}
    // Follow the desktop musical ruler. Numbering accumulates across tempo sections.
    static List<Tick> ticks(List<Section> sections,double start,double end,double scale,int divisions){
        List<Tick> result=new ArrayList<>();
        if(!Double.isFinite(start)||!Double.isFinite(end)||!Double.isFinite(scale)||scale<=0||end<start||sections.isEmpty())return result;
        long firstMeasure=1;
        long[] sectionMeasures=new long[sections.size()];
        for(int i=0;i<sections.size();i++){
            Section section=sections.get(i);
            sectionMeasures[i]=firstMeasure;
            firstMeasure+=Math.max(1,(long)Math.ceil((section.end-section.start)/section.bar()-1e-9));
        }
        double spacing=(Long.toString(firstMeasure).length()+5)*8.5+14;
        double labelSeconds=spacing/scale,columnSeconds=5/scale;
        double densityStart=Math.floor(Math.max(0,start)/columnSeconds)*columnSeconds,densityEnd=(Math.floor(end/columnSeconds)+1)*columnSeconds;
        if(divisions<=0)divisions=4;
        for(int si=0;si<sections.size();si++){
            Section s=sections.get(si);if(s.end<=densityStart)continue;if(s.start>densityEnd)break;
            double bar=s.bar();int stride=(int)powerStride(6,bar*scale);
            int first=Math.max(0,(int)Math.floor((densityStart-s.start)/bar)/stride*stride);
            int last=Math.max(first,(int)Math.ceil((Math.min(s.end,densityEnd)-s.start)/bar));
            double beat=bar/s.beats;
            double base=Math.min(beat,beat*s.unit/divisions);
            double minor=base*powerStride(5,base*scale);
            int divisionsPerBeat=Math.max(1,(int)Math.round(beat/base));
            double boundaryEnd=si+1<sections.size()?s.end:Double.POSITIVE_INFINITY;
            double boundaryClearance=Double.POSITIVE_INFINITY;
            if(si>0){int step=hierarchy(si);double right=si+step<sections.size()?sections.get(si+step).start:Double.POSITIVE_INFINITY;boundaryClearance=Math.min(s.start-sections.get(si-step).start,right-s.start);}
            for(int index=first;index<=last;index+=stride){
                double time=s.start+index*bar;if(time>=s.end)continue;
                long measure=sectionMeasures[si]+index;
                double clearance=index==0?boundaryClearance:Math.min(hierarchy(index)*bar,boundaryEnd-time);
                append(result,time,measure,0,divisionsPerBeat,clearance,true,densityStart,densityEnd,columnSeconds,labelSeconds,scale);
                for(double offset=minor;offset<Math.min(bar,s.end-time)-1e-9;offset+=minor){
                    int subdivision=Math.max(1,(int)Math.round(offset/base));
                    clearance=Math.min(hierarchy(subdivision)*base,Math.min(bar-offset,boundaryEnd-time-offset));
                    append(result,time+offset,measure,subdivision,divisionsPerBeat,clearance,beat*scale>=32,
                            densityStart,densityEnd,columnSeconds,labelSeconds,scale);
                }
            }
        }
        result.removeIf(t->t.time<Math.max(0,start)||t.time>end);return result;
    }
    private static void append(List<Tick> ticks,double time,long measure,int subdivision,int divisionsPerBeat,double clearance,
                               boolean showBeatLines,double from,double to,double columnSeconds,double labelSeconds,double scale){
        if(time<from||time>to)return;
        boolean primary=subdivision==0;
        boolean drawsInGrid=clearance*scale+1e-9>=6&&(primary||(showBeatLines&&subdivision%divisionsPerBeat==0));
        String label="";
        if(clearance+1e-9>=labelSeconds){
            label=Long.toString(measure);
            if(!primary){
                label+="."+(subdivision/divisionsPerBeat+1);
                int withinBeat=subdivision%divisionsPerBeat;
                if(withinBeat!=0)label+="."+(withinBeat+1);
            }
        }
        Tick tick=new Tick(time,primary,drawsInGrid,label);
        if(!ticks.isEmpty()){
            Tick previous=ticks.get(ticks.size()-1);
            if(Math.floor(time/columnSeconds+1e-9)==Math.floor(previous.time/columnSeconds+1e-9)){
                if(tick.rank()<=previous.rank())return;
                ticks.remove(ticks.size()-1);
            }
        }
        ticks.add(tick);
    }
    static double flagWidth(double measured,double position,double next,double regionEnd,double scale){
        double width=Math.min(measured+10,Math.min((next-position)*scale-3,(regionEnd-position)*scale));
        return width>=18?width:0;
    }
}
