package com.hookdeveloper.catlive.remote;
/** Admission only; rejected controls are never scheduled for later. */
final class LiveTempoEditGate {
    private Long last;
    void reset(){last=null;}
    boolean accept(boolean running,long now){
        if(!running){reset();return true;}
        if(last!=null&&now>=last&&now-last<500)return false;
        last=now;return true;
    }
}
