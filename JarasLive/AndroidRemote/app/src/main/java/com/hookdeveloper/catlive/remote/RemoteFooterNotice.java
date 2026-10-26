package com.hookdeveloper.catlive.remote;

/** Repeated state packets must not extend a transient notice. */
final class RemoteFooterNotice {
    static final long DURATION_MS=5000;
    private String scope="",last="";
    private long deadline;
    void receive(String project,String message,long now) {
        message=message==null?"":message.trim();
        if(!scope.equals(project)){scope=project;last="";deadline=0;}
        if(!last.equals(message)){last=message;deadline=message.isEmpty()?0:now+DURATION_MS;}
    }
    String visible(long now){return now<deadline?last:"";}
}
