package com.hookdeveloper.catlive.remote;

import android.content.*;
import android.net.*;
import android.net.nsd.*;
import android.net.wifi.WifiManager;
import android.os.*;
import android.graphics.*;
import android.util.LruCache;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

final class RemoteSession {
    interface Listener { void onChanged(); default void onLocalChanged(){onChanged();} default void onLocalCommand(JSONObject command){} void onMessage(String message); }
    static final class Peer { final String name,host; final int port; Peer(String name,String host,int port){this.name=name;this.host=host;this.port=port;} }
    final Handler main=new Handler(Looper.getMainLooper());
    final List<Peer> peers=new ArrayList<>();
    final LruCache<String,Bitmap> images=new LruCache<String,Bitmap>(24*1024*1024){protected int sizeOf(String key,Bitmap b){return b.getAllocationByteCount();}};
    final Set<String> requestedImages=new HashSet<>();
    private final NsdManager nsd;
    private final WifiManager.MulticastLock multicast;
    private final ExecutorService reader=Executors.newSingleThreadExecutor();
    private final ThreadPoolExecutor writer=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(128));
    private final ConnectivityManager connectivity;
    private final ConnectivityManager.NetworkCallback networkCallback;
    private final AtomicReference<JSONObject> nextState=new AtomicReference<>();
    private NsdManager.DiscoveryListener discovery;
    private final ArrayDeque<NsdServiceInfo> resolves=new ArrayDeque<>();
    private boolean resolving=false,active=false,closed=false,connecting=false;
    private volatile int generation=0;
    private int discoveryGeneration=0;
    volatile JSONObject state;
    JSONObject confirmedState;final RemoteFeedback feedback=new RemoteFeedback();
    final RemoteProjectOpening projectOpening=new RemoteProjectOpening();
    volatile String mode="";
    String status="",peerName="",lastError="";
    boolean connected=false,requiresPin=false,noticesPin=false;
    private Peer selected;
    private String resumeMode="",resumePin="";
    private volatile Socket socket;
    private volatile RemoteCipher cipher;
    private long sequence=0;
    private int subscription=0;
    Listener listener;
    private final Map<String,Long> noticeRequests=new HashMap<>();
    RemoteSession(Context context){
        nsd=(NsdManager)context.getSystemService(Context.NSD_SERVICE);
        connectivity=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        WifiManager wifi=(WifiManager)context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        multicast=wifi.createMulticastLock("CatLive Remote discovery");multicast.setReferenceCounted(false);
        networkCallback=new ConnectivityManager.NetworkCallback(){public void onAvailable(Network n){main.post(()->{if(active&&!connected)browse();});}};
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }
    void changed(){if(listener!=null)listener.onChanged();}
    void message(String text){main.post(()->{if(listener!=null)listener.onMessage(text);});}
    void resume(){if(closed||(active&&(connected||connecting)))return;active=true;if(selected!=null)connect(selected);else browse();}
    void suspend(){feedback.clear();if(confirmedState!=null)state=confirmedState;active=false;generation++;disconnectSocket();connected=false;connecting=false;stopDiscovery();changed();}
    void close(){closed=true;suspend();connectivity.unregisterNetworkCallback(networkCallback);reader.shutdownNow();writer.shutdownNow();images.evictAll();}
    void exit(){projectOpening.clear();feedback.clear();confirmedState=null;selected=null;resumeMode="";resumePin="";mode="";state=null;sequence=0;subscription=0;noticeRequests.clear();generation++;disconnectSocket();connected=false;connecting=false;status="";browse();changed();}
    void browse(){
        if(!active||closed)return;stopDiscovery();peers.clear();status="Procurando PCs…";changed();
        final int token=++discoveryGeneration;
        try{multicast.acquire();}catch(RuntimeException ignored){}
        discovery=new NsdManager.DiscoveryListener(){
            public void onDiscoveryStarted(String t){}
            public void onDiscoveryStopped(String t){}
            public void onStartDiscoveryFailed(String t,int error){main.post(()->{if(token==discoveryGeneration){status="Falha ao buscar na rede. Verifique o Wi-Fi e tente novamente.";changed();}});}
            public void onStopDiscoveryFailed(String t,int error){}
            public void onServiceFound(NsdServiceInfo service){main.post(()->{if(token!=discoveryGeneration)return;resolves.add(service);resolveNext(token);});}
            public void onServiceLost(NsdServiceInfo service){main.post(()->{if(token!=discoveryGeneration)return;peers.removeIf(p->p.name.equals(service.getServiceName()));changed();});}
        };
        try{nsd.discoverServices("_jaras-live._tcp.",NsdManager.PROTOCOL_DNS_SD,discovery);}catch(RuntimeException e){status="Não foi possível buscar dispositivos nesta rede.";changed();}
        main.postDelayed(()->{if(token==discoveryGeneration&&active&&!connected&&!connecting)browse();},20000);
    }
    private void resolveNext(int token){
        if(resolving||resolves.isEmpty()||token!=discoveryGeneration)return;
        resolving=true;NsdServiceInfo service=resolves.removeFirst();
        nsd.resolveService(service,new NsdManager.ResolveListener(){
            public void onResolveFailed(NsdServiceInfo s,int error){main.post(()->{resolving=false;resolveNext(token);});}
            public void onServiceResolved(NsdServiceInfo s){main.post(()->{
                resolving=false;if(token!=discoveryGeneration)return;
                if(s.getHost()!=null)resolvedPeer(new Peer(s.getServiceName(),s.getHost().getHostAddress(),s.getPort()));
                resolveNext(token);
            });}
        });
    }
    void resolvedPeer(Peer peer){
        peers.removeIf(p->p.name.equals(peer.name));peers.add(peer);
        if(!connected&&!connecting)status="Escolha o computador";
        if(active&&!closed&&!connected&&selected!=null&&selected.name.equals(peer.name)){
            // A restarted host publishes a new port. Cancel only the stale
            // pending attempt to that same service; keep live sessions intact.
            if(connecting&&selected.port!=peer.port){generation++;disconnectSocket();connecting=false;}
            if(!connecting)connect(peer);
        }
        changed();
    }
    private void stopDiscovery(){discoveryGeneration++;if(discovery!=null){try{nsd.stopServiceDiscovery(discovery);}catch(RuntimeException ignored){}discovery=null;}resolves.clear();resolving=false;if(multicast.isHeld())multicast.release();}
    void connect(Peer peer){
        if(!active||closed||connecting)return;
        selected=peer;peerName=peer.name;generation++;int token=generation;
        disconnectSocket();connecting=true;connected=false;mode="";sequence=0;status="Conectando…";lastError="";changed();
        reader.execute(()->run(peer,token));
    }
    private void run(Peer peer,int token){
        Socket connection=new Socket();
        try{
            synchronized(this){if(token!=generation)return;socket=connection;}
            connection.setTcpNoDelay(true);connection.setKeepAlive(true);connection.connect(new InetSocketAddress(peer.host,peer.port),8000);connection.setSoTimeout(15000);
            RemoteCipher keys=new RemoteCipher(Build.MODEL);cipher=keys;
            OutputStream out=connection.getOutputStream();InputStream in=connection.getInputStream();
            RemoteWire.writeFrame(out,keys.hello());String name=keys.accept(RemoteWire.readFrame(in));
            RemoteWire.writeFrame(out,keys.seal(new byte[]{0}));RemoteCipher.check(Arrays.equals(keys.open(RemoteWire.readFrame(in)),new byte[]{0}));
            connection.setSoTimeout(0);
            main.post(()->{if(token!=generation)return;connected=true;connecting=false;peerName=name;status="Conectado";stopDiscovery();changed();});
            while(!connection.isClosed()&&token==generation){byte[] payload=keys.open(RemoteWire.readFrame(in));RemoteCipher.check(payload.length>5&&payload[0]==1&&payload[1]==0x4a&&payload[2]==0x4c&&payload[3]==2);int kind=payload[4]&255;
                if(kind==4){RemoteCipher.check(payload.length>=37);java.nio.ByteBuffer b=java.nio.ByteBuffer.wrap(payload,5,32);String project=new UUID(b.getLong(),b.getLong()).toString(),id=new UUID(b.getLong(),b.getLong()).toString();byte[] bytes=Arrays.copyOfRange(payload,37,payload.length);RemoteCipher.check(bytes.length<=1572864);BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(options.outWidth>0&&options.outHeight>0){options.inJustDecodeBounds=false;options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>2048)options.inSampleSize*=2;Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);main.post(()->{if(token==generation&&RemoteModel.same(project,RemoteModel.id(state,"project"))&&bitmap!=null){images.put(id.toLowerCase(Locale.ROOT),bitmap);changed();}});}continue;}
                String json=new String(payload,5,payload.length-5,java.nio.charset.StandardCharsets.UTF_8);
                if(kind==2){JSONObject value=new JSONObject(json);long seq=value.getLong("sequence");if(seq>sequence){sequence=seq;nextState.set(value);main.post(()->publishNext(token));}sendPacket(3,seq,token);}
                else if(kind==6){JSONObject value=new JSONObject(json);main.post(()->accessStatus(value,token));}
                else if(kind==7){JSONObject value=new JSONObject(json);main.post(()->{if(token==generation&&noticeRequests.remove(value.optString("commandID"))!=null)message(value.optBoolean("accepted")?"Recado enviado":"O computador recusou o recado");});}
            }
        }catch(Exception e){if(token==generation)main.post(()->{lastError=e.getMessage()==null?"Conexão interrompida":e.getMessage();});}
        finally{try{connection.close();}catch(IOException ignored){}main.post(()->lost(token));}
    }
    private void publishNext(int token){
        if(token!=generation)return;JSONObject value=nextState.getAndSet(null);if(value==null)return;
        if(!RemoteModel.same(RemoteModel.id(value,"project"),RemoteModel.id(state,"project"))){images.evictAll();requestedImages.clear();}
        projectOpening.receive(value);confirmedState=value;state=feedback.receive(value,SystemClock.elapsedRealtime());changed();
    }
    private void accessStatus(JSONObject value,int token){
        if(token!=generation)return;requiresPin=value.optBoolean("requiresPIN");noticesPin=value.optBoolean("noticesRequiresPIN");mode=RemoteModel.id(value,"mode");lastError=value.optString("error","");
        if(!mode.isEmpty()){status="Conectado";if(subscription!=0)subscribe(subscription);}
        else if(!resumeMode.isEmpty()&&lastError.isEmpty())requestAccess(resumeMode,resumePin);
        else if(!lastError.isEmpty()){resumeMode="";resumePin="";}
        changed();
    }
    private void lost(int token){if(token!=generation||closed)return;feedback.clear();if(confirmedState!=null)state=confirmedState;connected=false;connecting=false;mode="";status=selected==null?"Desconectado":"Reconectando a "+selected.name+"…";noticeRequests.clear();requestedImages.clear();nextState.set(null);changed();if(active){browse();main.postDelayed(()->{if(token==generation&&selected!=null&&!connected&&!connecting&&active)connect(selected);},2500);}}
    private synchronized void disconnectSocket(){Socket s=socket;socket=null;if(s!=null)try{s.close();}catch(IOException ignored){}nextState.set(null);}
    void requestAccess(String mode,String pin){resumeMode=mode;resumePin=pin;try{sendPacket(5,new JSONObject().put("mode",mode).put("pin",pin),generation);}catch(JSONException e){message(e.getMessage());}}
    void subscribe(int panel){subscription=panel;if(state!=null&&!mode.isEmpty())command("remotePanel",null,panel,null,null,null);}
    void action(String action){command(action,null,0,null,null,null);}
    void action(String action,String target,double value){command(action,target,value,null,null,null);}
    void command(String action,String target,double value,String text,String playlist,Boolean enabled){
        if(!connected||mode.isEmpty()||!RemoteWire.allowed(action,mode,value))return;
        if(RemoteProjectOpening.isOpen(action)&&projectOpening.active())return;
        try{JSONObject command=RemoteWire.command(state,action,target,value,text,playlist,enabled);if(command==null)return;
            if(RemoteProjectOpening.isOpen(action))projectOpening.begin(command,state,SystemClock.elapsedRealtime());
            if(action.equals("noticeSend")){command.put("noticeReceiptRequested",true);String id=command.getString("id");noticeRequests.put(id,SystemClock.elapsedRealtime());main.postDelayed(()->{if(noticeRequests.remove(id)!=null)message("O computador não confirmou o recado. Confira a conexão.");},5000);}
            if(listener!=null)listener.onLocalCommand(command);
            sendPacket(1,command,generation);
            if(feedback.record(state,action,target,value,enabled,SystemClock.elapsedRealtime())){
                if(confirmedState==null)confirmedState=state;state=feedback.overlay(confirmedState);if(listener!=null)listener.onLocalChanged();
                int feedbackGeneration=generation;main.postDelayed(()->{if(feedbackGeneration==generation&&confirmedState!=null){state=feedback.receive(confirmedState,SystemClock.elapsedRealtime());if(listener!=null)listener.onLocalChanged();}},RemoteFeedback.TIMEOUT+1);
            }
        }catch(Exception e){message("Não foi possível enviar o comando");}
    }
    JSONObject vinhetasDown(int preset,int pad){
        if(!connected||!mode.equals("director")||state==null||state.optJSONObject("vinhetas")==null)return null;
        try{JSONObject command=RemoteWire.command(state,"vinhetasDown",UUID.randomUUID().toString(),0,null,null,null);
            command.put("preset",preset).put("pad",pad);sendPacket(1,command,generation);return command;
        }catch(Exception e){return null;}
    }
    void vinhetasUp(JSONObject press){
        if(press==null||!connected||!mode.equals("director"))return;
        try{JSONObject command=new JSONObject(press.toString());command.put("id",UUID.randomUUID().toString()).put("action","vinhetasUp");command.remove("pad");command.remove("preset");sendPacket(1,command,generation);}catch(Exception ignored){}
    }
    void vinhetasControl(String action,int preset,int pad,double value,Boolean enabled){
        if(!connected||!mode.equals("director")||state==null||state.optJSONObject("vinhetas")==null||preset<0||preset>=6||pad<0||pad>=16)return;
        try{JSONObject command=RemoteWire.command(state,action,null,value,null,null,enabled);command.put("preset",preset).put("pad",pad);sendPacket(1,command,generation);}catch(Exception ignored){}
    }
    void requestImage(String id){if(state==null||id.isEmpty()||images.get(id.toLowerCase(Locale.ROOT))!=null||!requestedImages.add(id.toLowerCase(Locale.ROOT)))return;action("requestImage",id,0);}
    private void sendPacket(int kind,Object json,int token){
        try{writer.execute(()->{if(token!=generation)return;try{Socket s=socket;RemoteCipher keys=cipher;if(s==null||keys==null)return;RemoteWire.writeFrame(s.getOutputStream(),keys.seal(RemoteCipher.join(new byte[]{1},RemoteWire.packet(kind,json))));}catch(Exception e){Socket s=socket;if(s!=null)try{s.close();}catch(IOException ignored){}}});}catch(RejectedExecutionException e){disconnectSocket();}
    }
}
