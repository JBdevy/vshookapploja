package com.hookdeveloper.catlive.remote;
import org.json.*;

/** A local request remains pending until its host receipt, including tab swaps. */
final class RemoteProjectOpening {
    String id="",initialProject="",initialTab="",initialError="",name="",phase="opening",status="Carregando projeto…",error="";
    long startedAt;boolean sawBusy;
    boolean active(){return !id.isEmpty();}
    static boolean isOpen(String action){return action.equals("openRecentProject")||action.equals("openRecentProjectInNewTab");}
    static String tab(JSONObject state){for(JSONObject tab:RemoteModel.list(RemoteModel.array(state,"projectTabs")))if(tab.optBoolean("selected"))return RemoteModel.id(tab,"id");return "";}
    void begin(JSONObject command,JSONObject state,long now){
        clear();id=command.optString("id");initialProject=RemoteModel.id(state,"project");initialTab=tab(state);startedAt=now;
        JSONObject browser=state==null?null:state.optJSONObject("projects");if(browser!=null){initialError=browser.optString("error");JSONObject recent=RemoteModel.find(RemoteModel.array(browser,"recent"),command.optString("target"));if(recent!=null)name=recent.optString("name");}
    }
    void receive(JSONObject state){
        if(!active()||state==null)return;JSONObject browser=state.optJSONObject("projects");if(browser==null)return;
        String receipt=RemoteModel.id(browser,"commandID");
        if(RemoteModel.same(receipt,id)){
            phase=browser.optString("commandState","opening");status=browser.optString("status");if(status.isEmpty())status="Carregando projeto…";error=browser.optString("error");
            if(phase.equals("completed")||phase.equals("cancelled"))clear();return;
        }
        if(receipt.isEmpty()){
            boolean busy=browser.optBoolean("busy");sawBusy|=busy;if(busy&&!browser.optString("status").isEmpty())status=browser.optString("status");
            String failure=browser.optString("error");if(!busy&&!failure.isEmpty()&&!failure.equals(initialError)){phase="failed";error=failure;}
            boolean changed=!RemoteModel.same(initialProject,RemoteModel.id(state,"project"))||!initialTab.equalsIgnoreCase(tab(state));
            if(sawBusy&&!busy&&changed&&failure.isEmpty())clear();
        }
    }
    boolean canDismiss(long now){return phase.equals("waiting")||phase.equals("failed")||now-startedAt>=20000;}
    void clear(){id="";initialProject="";initialTab="";initialError="";name="";phase="opening";status="Carregando projeto…";error="";startedAt=0;sawBusy=false;}
}
