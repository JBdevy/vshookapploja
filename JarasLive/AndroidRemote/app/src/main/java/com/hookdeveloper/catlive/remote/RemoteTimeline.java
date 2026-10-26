package com.hookdeveloper.catlive.remote;

import org.json.JSONObject;
import java.util.*;

/** Native timeline geometry, in logical points (independent of display density). */
final class RemoteTimeline {
    static final int REGION_HEIGHT=16, MARKER_HEIGHT=16, RULER_HEIGHT=16;
    static final int RULER_TOP=REGION_HEIGHT+MARKER_HEIGHT, HEADER_HEIGHT=RULER_TOP+RULER_HEIGHT;
    static final class Tick {
        final double time; final boolean primary; final String label;
        Tick(double time,boolean primary,String label){this.time=time;this.primary=primary;this.label=label;}
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
    static double powerStride(double width){return Math.pow(2,Math.max(0,Math.ceil(Math.log(16/Math.max(.001,width))/Math.log(2))));}
    static int hierarchy(int index){return Integer.lowestOneBit(index);}
    static String timeLabel(double time){
        long ms=Math.round(time*1000),whole=ms/1000;
        String base=String.format(Locale.US,"%02d:%02d:%02d",whole/3600,whole/60%60,whole%60);
        return ms%1000==0?base:base+String.format(Locale.US,".%03d",ms%1000);
    }
    // Matches TimelineTimeRuler.ticks: fixed musical references and elapsed-time
    // labels keep their positions across scrolling, zoom and tempo boundaries.
    static List<Tick> ticks(List<Section> sections,double start,double end,double scale,int divisions){
        List<Tick> result=new ArrayList<>();
        if(!Double.isFinite(start)||!Double.isFinite(end)||!Double.isFinite(scale)||scale<=0||end<start||sections.isEmpty())return result;
        double lastEnd=sections.get(sections.size()-1).end;
        int hoursDigits=Long.toString((long)Math.max(0,(lastEnd+.001)/3600)).length();
        double spacing=Math.max(130+50*Math.min(1,Math.max(0,-Math.log10(scale))), (Math.max(2,hoursDigits)+10)*6+2+14);
        double labelSeconds=spacing/scale,columnSeconds=8/scale;
        double densityStart=Math.floor(Math.max(0,start)/columnSeconds)*columnSeconds,densityEnd=(Math.floor(end/columnSeconds)+1)*columnSeconds;
        if(divisions<=0)divisions=4;
        for(int si=0;si<sections.size();si++){
            Section s=sections.get(si);if(s.end<=densityStart)continue;if(s.start>densityEnd)break;
            double bar=s.bar();int stride=(int)powerStride(bar*scale);
            int first=Math.max(0,(int)Math.floor((densityStart-s.start)/bar)/stride*stride);
            int last=Math.max(first,(int)Math.ceil((Math.min(s.end,densityEnd)-s.start)/bar));
            boolean distant=bar*scale<64;
            double base=bar/s.beats*s.unit/divisions;
            double minor=distant?bar*stride/2:base*powerStride(base*scale);
            double boundaryEnd=si+1<sections.size()?s.end:Double.POSITIVE_INFINITY;
            double boundaryClearance=Double.POSITIVE_INFINITY;
            if(si>0){int step=hierarchy(si);double right=si+step<sections.size()?sections.get(si+step).start:Double.POSITIVE_INFINITY;boundaryClearance=Math.min(s.start-sections.get(si-step).start,right-s.start);}
            for(int index=first;index<=last;index+=stride){
                double time=s.start+index*bar;if(time>=s.end)continue;
                append(result,time,true,index==0?boundaryClearance:Math.min(hierarchy(index)*bar,boundaryEnd-time),s,densityStart,densityEnd,columnSeconds,labelSeconds);
                if(distant)append(result,time+minor,false,0,s,densityStart,densityEnd,columnSeconds,labelSeconds);
                else for(double offset=minor;offset<Math.min(bar,s.end-time)-1e-9;offset+=minor){
                    int subdivision=Math.max(1,(int)Math.round(offset/base));
                    double clearance=Math.min(hierarchy(subdivision)*base,Math.min(bar-offset,boundaryEnd-time-offset));
                    append(result,time+offset,false,clearance,s,densityStart,densityEnd,columnSeconds,labelSeconds);
                }
            }
        }
        result.removeIf(t->t.time<Math.max(0,start)||t.time>end);return result;
    }
    private static void append(List<Tick> ticks,double time,boolean primary,double clearance,Section section,double from,double to,double columnSeconds,double labelSeconds){
        if(time<from||time>to||time>=section.end)return;
        boolean labeled=clearance+1e-9>=labelSeconds;
        if(!ticks.isEmpty()){
            Tick previous=ticks.get(ticks.size()-1);
            if(Math.floor(time/columnSeconds+1e-9)==Math.floor(previous.time/columnSeconds+1e-9)){
                if(!labeled||!previous.label.isEmpty())return;ticks.remove(ticks.size()-1);
            }
        }
        ticks.add(new Tick(time,primary,labeled?timeLabel(time):""));
    }
    static double flagWidth(double measured,double position,double next,double regionEnd,double scale){
        double width=Math.min(measured+10,Math.min((next-position)*scale-3,(regionEnd-position)*scale));
        return width>=18?width:0;
    }
}
