package com.hookdeveloper.catlive.remote;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.graphics.drawable.*;
import android.text.*;
import android.text.TextPaint;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Button;
import com.hookdeveloper.catlive.remote.RemoteWidgets.Icon;
import org.json.*;
import java.util.*;
import java.util.function.Consumer;
import static com.hookdeveloper.catlive.remote.RemoteWidgets.*;

public final class MainActivity extends Activity implements RemoteSession.Listener {
    RemoteSession remote;
    JSONObject state;JSONObject visibleRegion;final RemoteModel.LayoutCache layout=new RemoteModel.LayoutCache();
    String renderedMode="";String panel="setlist",screen="",structure="",mixerStructure="",project="";
    boolean entering=false;boolean sidebarHidden=false,fullscreen=false,mixerShown=true,setlistShown=true,partsShown=false,vinhetasOpen=false;
    float tabletMixer=.28f,tabletSetlist=.30f;
    FrameLayout root,content;
    LinearLayout work,column,rail,transport,footer,tabs,setlistColumn,trackColumn;
    HorizontalScrollView tabScroll;
    LinearLayout observerPanes,observerHeaderDisplays,observerHeaderButtons;
    View observerPrompterPane,observerListPane;
    TextView statusText,current,selectionTitle,time,bpm,pitch,next,queued,information,playCaption,pauseCaption;
    Button play,pause,sub,repeat,auto,bypass,live,save,playlistButton;
    SongDisplay nextDisplay,queuedDisplay;
    TextView observerQueue,noticeRemaining,noticeCount,tabletInformation;
    EditText noticeEditor;Button noticeSend,noticeClear,noticePin,noticeSave;
    final Button[] noticeSlots=new Button[4],noticeDestinations=new Button[2];
    int noticeSlot=-1;String globalNoticeDraft="";
    final Map<String,Button> railButtons=new HashMap<>();
    final Map<String,TrackRow> trackRows=new LinkedHashMap<>();
    final List<SongRow> songRows=new ArrayList<>();
    final Set<String> expanded=new HashSet<>();
    EditText search;String query="";
    ScrollView mixerScroll,setlistScroll;
    RemoteGrid grid;RemoteTrackRail trackRail;
    RemoteTeleprompter tp;
    RemoteVinhetas vinhetas;
    RemoteParts parts;
    final Map<Integer,RemoteVinhetas.PadFeedback> vinhetasFeedback=new HashMap<>();
    Dialog activeDialog;
    String projectLoadingSignature="";
    final RemoteKeyboard keyboard=new RemoteKeyboard();
    RemoteMidi midi;
    final RemoteModel.Cue cue=new RemoteModel.Cue();
    final RemoteFooterNotice footerNotice=new RemoteFooterNotice();
    final Handler handler=new Handler(Looper.getMainLooper());
    long stateAt;double anchorPosition;final RemoteTimer localTimer=new RemoteTimer();boolean timerRunning;
    TextView cueText;
    final Runnable pulse=new Runnable(){public void run(){if(isFinishing())return;tick();handler.postDelayed(this,33);}};
    @Override public void onCreate(Bundle b){super.onCreate(b);init(this);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root=new FrameLayout(this);root.setBackground(background(0));setContentView(root);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        layout.resize(getPreferences(0).getFloat("trackHeightScale",1));remote=new RemoteSession(this);remote.listener=this;midi=new RemoteMidi(this,action->midiAction(action));
        showStartup();handler.post(pulse);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        // Explicit address is useful for ADB/automated interoperability tests; normal launch uses discovery.
        String host=getIntent().getStringExtra("host");int port=getIntent().getIntExtra("port",0);if(BuildConfig.DEBUG&&host!=null&&port>0){entering=true;handler.postDelayed(()->remote.connect(new RemoteSession.Peer(host,host,port)),600);}
    }
    @Override protected void onResume(){super.onResume();if(remote!=null&&entering)remote.resume();if(midi!=null)midi.start();}
    @Override protected void onStop(){if(vinhetas!=null)vinhetas.releaseAll();if(remote!=null)remote.suspend();if(midi!=null)midi.stop();super.onStop();}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(remote!=null)remote.close();if(midi!=null)midi.stop();super.onDestroy();}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);init(this);if(screen.equals("startup"))return;if(tabletLayout()&&screen.equals("workspace")&&observerPanes!=null){layoutTabletObserver();return;}structure="";if(screen.equals("workspace")&&remote.state!=null&&(!remote.connected||remote.mode.isEmpty())){removeConnectionOverlay();showConnectionOverlay();return;}if(remote.connected&&!remote.mode.isEmpty()&&remote.state!=null)buildWorkspace();else if(entering)showHome();else showWelcome();}
    void handleBack(){if(root.findViewWithTag("connection")!=null||root.findViewWithTag("project-loading")!=null)return;if(!screen.equals("workspace")){if(entering){entering=false;remote.exit();showWelcome();}else finish();return;}if(fullscreen){fullscreen=false;buildWorkspace();return;}if(!panel.equals("grid")&&!panel.equals("setlist")){choose("grid");return;}if(remote.connected){confirm("Sair do Remote?","A reprodução continua no computador.","Sair",()->remote.exit());}else if(entering){entering=false;showWelcome();}else finish();}
    @Override public boolean dispatchTouchEvent(MotionEvent event){keyboard.before(getWindow(),event);boolean result=super.dispatchTouchEvent(event);keyboard.after(getWindow(),event);return result;}
    @Override public void onLocalChanged(){if(remote.state==null||!screen.equals("workspace"))return;state=remote.state;visibleRegion=RemoteModel.gridRegion(state);layout.update(state,visibleRegion);if(!state.optBoolean("playing")){anchorPosition=state.optDouble("position");stateAt=SystemClock.elapsedRealtime();}refresh();}
    @Override public void onLocalCommand(JSONObject command){
        if(RemoteProjectOpening.isOpen(command.optString("action"))){closeDialog();updateProjectOpening();return;}
        if(!command.optString("action").startsWith("timer"))return;
        localTimer.scope(RemoteModel.id(state,"project"));localTimer.command(command,SystemClock.elapsedRealtime());timerRunning=localTimer.running;if(tp!=null)tp.invalidate();
        String id=command.optString("id");handler.postDelayed(()->{if(localTimer.pending.equals(id)){syncTimer();if(tp!=null)tp.invalidate();}},3001);
    }
    void syncTimer(){localTimer.receive(state==null?null:state.optJSONObject("timer"),SystemClock.elapsedRealtime());timerRunning=localTimer.running;}
    @Override public void onChanged(){
        if(screen.equals("workspace")&&remote.state!=null&&(!remote.connected||(remote.mode.isEmpty()&&remote.lastError.isEmpty()))){showConnectionOverlay();return;}
        if(!remote.connected){if(screen.equals("workspace")&&remote.state!=null){showConnectionOverlay();}else if(entering)showHome();return;}
        if(remote.mode.isEmpty()){if(!screen.equals("access"))showAccess();else if(statusText!=null)statusText.setText(remote.lastError);return;}
        if(remote.state==null){if(statusText!=null)statusText.setText("Carregando projeto…");return;}
        JSONObject old=state;state=remote.state;if(old!=null&&!RemoteModel.same(RemoteModel.id(old,"project"),RemoteModel.id(state,"project"))){if(vinhetas!=null)vinhetas.releaseAll();for(RemoteVinhetas.PadFeedback feedback:vinhetasFeedback.values()){feedback.pending.clear();feedback.litBanks.clear();feedback.confirmed.clear();feedback.held.clear();feedback.gates.clear();feedback.gains.clear();}}visibleRegion=RemoteModel.gridRegion(state);layout.update(state,visibleRegion);
        anchorPosition=state.optDouble("position");stateAt=SystemClock.elapsedRealtime();
        localTimer.scope(RemoteModel.id(state,"project"));syncTimer();
        if(!project.equals(RemoteModel.id(state,"project"))){project=RemoteModel.id(state,"project");expanded.clear();query="";cue.clear();structure="";}
        if(!screen.equals("workspace")||!remote.mode.equals(renderedMode)){panel=remote.mode.equals("notices")?"notices":(tabletLayout()&&remote.mode.equals("director")?"grid":"setlist");buildWorkspace();}
        else {removeConnectionOverlay();refresh();}
    }
    @Override public void onMessage(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}
    LinearLayout scrollingPage(int padding,int maxWidth){
        root.removeAllViews();ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setVerticalScrollBarEnabled(false);root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
        FrameLayout frame=new FrameLayout(this);scroll.addView(frame,new ScrollView.LayoutParams(-1,-2));LinearLayout page=column(this);pad(page,padding,padding);
        int width=Math.min(getResources().getDisplayMetrics().widthPixels,dp(maxWidth));frame.addView(page,new FrameLayout.LayoutParams(width,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL));return page;
    }
    TextView centered(String text,int size,int color,boolean strong){TextView v=label(this,text,size,color);v.setGravity(Gravity.CENTER);if(strong)v.setTypeface(bold);return v;}
    void showStartup(){
        screen="startup";root.removeAllViews();root.addView(new RemoteStartup(this),new FrameLayout.LayoutParams(-1,-1));
        handler.postDelayed(()->{if(screen.equals("startup")&&!isFinishing())showWelcome();},3000);
    }
    void showWelcome(){
        screen="welcome";LinearLayout page=scrollingPage(28,420);((FrameLayout.LayoutParams)page.getLayoutParams()).gravity=Gravity.CENTER;page.setGravity(Gravity.CENTER);
        ImageView logo=new ImageView(this);logo.setTag("welcome-logo");logo.setScaleType(ImageView.ScaleType.FIT_CENTER);logo.setAdjustViewBounds(true);logo.setImageResource(R.drawable.catlive_logo);page.addView(logo,new LinearLayout.LayoutParams(dp(180),dp(180)));space(page,24);
        page.addView(centered("Remote",22,GREEN,true));space(page,24);page.addView(centered("Controle ou acompanhe a sessão do seu PC.",17,SECONDARY,false));space(page,24);
        Button connect=new Button(this,"Conectar ao PC",()->{entering=true;showHome();remote.resume();});connect.setTextSize(17);connect.solid(GREEN);connect.setBackground(surface(blend(GREEN,Color.WHITE,.1f),blend(GREEN,Color.BLACK,.12f),0x2affffff,10));page.addView(connect,new LinearLayout.LayoutParams(-1,dp(48)));space(page,24);page.addView(languageSelector());
    }
    void showHome(){
        screen="home";LinearLayout page=scrollingPage(24,568);
        Button back=new Button(this,"‹  Voltar · Back",()->{entering=false;remote.exit();showWelcome();});back.setTextColor(SECONDARY);back.setTextSize(14);back.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);back.setPadding(0,0,0,0);back.setBackgroundColor(Color.TRANSPARENT);page.addView(back,new LinearLayout.LayoutParams(-1,dp(44)));space(page,22);
        LinearLayout card=column(this);pad(card,28,28);card.setGravity(Gravity.CENTER_HORIZONTAL);card.setBackground(RemoteWidgets.panel(18));page.addView(card,new LinearLayout.LayoutParams(-1,-2));
        Icon computer=new Icon(this,"computer",GREEN,42);computer.setBackground(surface(0x1469ed91,0x1469ed91,Color.TRANSPARENT,20));card.addView(computer,new LinearLayout.LayoutParams(dp(80),dp(80)));space(card,22);
        card.addView(centered("Conectar ao PC ou iPad · Connect to PC or iPad",23,TEXT,true));space(card,8);
        card.addView(centered("Conecte os aparelhos à mesma rede. Ative Remote no CatLive do PC ou no modo Nativo do iPad e escolha-o abaixo.\n\nConnect both devices to the same network. Enable Remote in CatLive on your PC or in Native mode on your iPad, then choose it below.",14,SECONDARY,false));space(card,22);
        LinearLayout header=row(this);TextView available=label(this,"Dispositivos disponíveis · Available devices",12,SECONDARY);available.setTypeface(bold);header.addView(available,new LinearLayout.LayoutParams(0,-2,1));Button refresh=new Button(this,"",()->remote.browse());refresh.icon("refresh","Buscar PCs novamente · Refresh PCs");refresh.style(GREEN,false);refresh.setBackgroundColor(Color.TRANSPARENT);header.addView(refresh,new LinearLayout.LayoutParams(dp(44),dp(44)));card.addView(header,new LinearLayout.LayoutParams(-1,-2));space(card,10);
        LinearLayout peers=column(this);card.addView(peers,new LinearLayout.LayoutParams(-1,-2));
        for(RemoteSession.Peer peer:new ArrayList<>(remote.peers)){
            LinearLayout item=row(this);pad(item,16,12);item.setBackground(surface(0xff242424,0xff181818,0xff444444,10));item.setMinimumHeight(dp(58));item.setContentDescription("Conectar a "+peer.name);item.setFocusable(true);item.setOnClickListener(v->remote.connect(peer));
            item.addView(new Icon(this,"computer",GREEN,26),new LinearLayout.LayoutParams(dp(28),dp(32)));TextView name=label(this,peer.name,15,TEXT);name.setText(peer.name);name.setTypeface(bold);name.setMaxLines(2);LinearLayout.LayoutParams nameLp=new LinearLayout.LayoutParams(0,-2,1);nameLp.setMargins(dp(14),0,dp(8),0);item.addView(name,nameLp);item.addView(new Icon(this,"chevron",SECONDARY,16),new LinearLayout.LayoutParams(dp(16),dp(24)));peers.addView(item,new LinearLayout.LayoutParams(-1,-2));space(peers,8);
        }
        if(remote.peers.isEmpty()){LinearLayout empty=row(this);pad(empty,14,12);empty.setBackground(background(10));ProgressBar spinner=new ProgressBar(this);spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(GREEN));empty.addView(spinner,new LinearLayout.LayoutParams(dp(20),dp(20)));TextView finding=label(this,"Procurando PCs… · Searching for PCs…",14,SECONDARY);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.leftMargin=dp(10);empty.addView(finding,lp);peers.addView(empty,new LinearLayout.LayoutParams(-1,dp(76)));}
        boolean connecting=remote.status.equals("Conectando…");statusText=centered(connecting?"Conectando… · Connecting…":remote.lastError,12,YELLOW,false);if(!remote.status.isEmpty()&&!remote.status.equals("Procurando PCs…")&&!remote.status.equals("Escolha o computador")&&!connecting)statusText.setText(RemoteText.ui(remote.status));if(statusText.length()>0){space(card,10);card.addView(statusText);}space(page,40);
    }
    void showAccess(){
        screen="access";LinearLayout page=scrollingPage(20,tabletLayout()?800:568);page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.addView(centered(remote.peerName,23,TEXT,true));space(page,20);page.addView(centered("Escolha como acompanhar esta sessão\nChoose how to join this session",17,SECONDARY,false));space(page,20);
        LinearLayout cards=tabletLayout()?row(this):column(this);cards.setGravity(Gravity.CENTER);page.addView(cards);
        String[] modes={"director","observer","notices"},names={"Diretor · Director","Observador · Observer","Recados · Notices"},details={"Controle o CatLive no PC\nControl CatLive on your PC","Repertório e teleprompters\nRepertoire and teleprompters","Envie recados aos teleprompters\nSend notices to the teleprompters"},icons={"mixer","observer","notices"};
        for(int i=0;i<3;i++){final String mode=modes[i];LinearLayout card=column(this);card.setGravity(Gravity.CENTER);pad(card,10,4);card.setBackground(RemoteWidgets.panel(12));card.setContentDescription(names[i]+". "+details[i]);card.setFocusable(true);card.setOnClickListener(v->authorize(mode));card.addView(new Icon(this,icons[i],GREEN,34),new LinearLayout.LayoutParams(dp(40),dp(34)));space(card,8);card.addView(centered(names[i],20,GREEN,true));space(card,8);card.addView(centered(details[i],12,GREEN,false));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(220),dp(140));lp.setMargins(tabletLayout()?dp(8):0,0,tabletLayout()?dp(8):0,dp(12));cards.addView(card,lp);}
        statusText=centered(remote.lastError,13,RED,false);page.addView(statusText);space(page,8);Button back=new Button(this,"Escolher outro PC · Choose another PC",()->remote.exit());back.setTextSize(17);back.setTextColor(SECONDARY);back.setBackgroundColor(Color.TRANSPARENT);page.addView(back,new LinearLayout.LayoutParams(-1,dp(48)));
    }
    void authorize(String mode){if((mode.equals("director")&&remote.requiresPin)||(mode.equals("notices")&&remote.noticesPin)){input("Senha de quatro dígitos","",true,pin->{if(!pin.matches("[0-9]{4}")){onMessage("Digite os quatro dígitos da senha");return;}remote.requestAccess(mode,pin);});}else remote.requestAccess(mode,"");}

    Button rail(String key,String title,int color,Runnable run){Button b=new Button(this,"",run);if(key.startsWith("TP"))b.setText(key);else b.icon(key,title);b.style(color,false);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(tabletLayout()&&remote.mode.equals("director")?34:44),dp(44));lp.setMargins(dp(4),dp(4),dp(4),dp(4));rail.addView(b,lp);railButtons.put(key,b);return b;}
    boolean tabletLayout(){return RemoteWidgets.tablet&&(remote.mode.equals("observer")||getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE);}
    void buildWorkspace(){
        if(state==null)return;if(vinhetas!=null){vinhetas.releaseAll();vinhetas=null;}observerPanes=null;observerHeaderDisplays=null;observerHeaderButtons=null;observerPrompterPane=null;observerListPane=null;current=null;time=null;observerQueue=null;tabletInformation=null;nextDisplay=null;queuedDisplay=null;noticeEditor=null;noticeSend=null;noticeRemaining=null;grid=null;tp=null;parts=null;selectionTitle=null;playCaption=null;pauseCaption=null;trackColumn=null;trackRail=null;setlistScroll=null;mixerScroll=null;playlistButton=null;auto=null;bypass=null;live=null;save=null;play=null;pause=null;sub=null;repeat=null;bpm=null;pitch=null;next=null;queued=null;information=null;screen="workspace";renderedMode=remote.mode;structure="";mixerStructure="";trackRows.clear();songRows.clear();railButtons.clear();root.removeAllViews();
        work=row(this);work.setGravity(Gravity.TOP);root.addView(work,new FrameLayout.LayoutParams(-1,-1));
        rail=column(this);rail.setBackground(RemoteWidgets.panel(0));rail.setPadding(0,dp(4),0,0);ScrollView sidebar=new ScrollView(this);sidebar.setFillViewport(true);sidebar.setVerticalScrollBarEnabled(false);sidebar.addView(rail);if(!sidebarHidden&&!fullscreen&&!panel.equals("notices"))work.addView(sidebar,new LinearLayout.LayoutParams(dp(tabletLayout()&&remote.mode.equals("director")?42:52),-1));
        rail("menu","Menu",SECONDARY,()->menu(railButtons.get("menu"),new String[]{"Projetos","Sair do Remote"},i->{if(i==0)projects();else remote.exit();}));
        boolean director=remote.mode.equals("director"),notices=remote.mode.equals("notices");
        if(director)rail("mixer","Track Mixer",SECONDARY,()->{if(tabletLayout()){mixerShown=!mixerShown;buildWorkspace();}else choose("mixer");});
        if(!notices)rail("setlist","Setlist",SECONDARY,()->{if(tabletLayout()&&(director||panel.startsWith("tp"))){setlistShown=!setlistShown;buildWorkspace();}else choose("setlist");});
        if(director)rail("grid","Grid",SECONDARY,()->choose("grid"));
        if(!notices){rail("TP1","Teleprompter 1",RED,()->choose("tp1"));rail("TP2","Teleprompter 2",RED,()->choose("tp2"));}
        if(director||notices)rail("notices","Recados",YELLOW,()->choose("notices"));
        if(director){rail("clock","Cronômetro",BLUE,this::timer);save=rail("save","Salvar",GREEN,()->confirm("Deseja salvar este projeto?","","Salvar",()->remote.action("save")));}
        if(tabletLayout()&&director){Button preview=rail("preview","Preview",GREEN,()->remote.action("togglePreview"));preview.icon="";preview.setText("P\nR\nE\nV\nI\nE\nW");preview.setTextSize(10);preview.getLayoutParams().height=dp(108);preview.setOnLongClickListener(v->{menu(v,new String[]{"Preview 1","Preview 2","Preview 3","Preview 4","Preview 5","Preview 6"},i->remote.action("selectPreviewPage",null,i));return true;});}
        View railSpacer=new View(this);rail.addView(railSpacer,new LinearLayout.LayoutParams(1,0,1));if(director)rail("vinhetas","Vinhetas",SECONDARY,()->{if(tabletLayout()){vinhetasOpen=!vinhetasOpen;buildWorkspace();}else choose("vinhetas");});if(director)rail("parts","Parts",SECONDARY,()->{if(tabletLayout()){partsShown=!partsShown;buildWorkspace();}else choose("parts");});
        rail("settings","Configurações",SECONDARY,this::settings);Button hide=rail("hide","Ocultar barra lateral",GREEN,()->{sidebarHidden=true;buildWorkspace();});hide.setBackgroundColor(Color.TRANSPARENT);
        column=column(this);work.addView(column,new LinearLayout.LayoutParams(0,-1,1));tabs=row(this);tabScroll=new HorizontalScrollView(this);tabScroll.setFillViewport(true);tabScroll.setHorizontalScrollBarEnabled(true);tabScroll.addView(tabs,new HorizontalScrollView.LayoutParams(-2,-1));tabScroll.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(r-l!=or-ol)layoutProjectTabs(r-l);});if(!fullscreen&&!panel.equals("vinhetas"))column.addView(tabScroll,new LinearLayout.LayoutParams(-1,dp(tabletLayout()?28:30)));
        transport=column(this);if(!fullscreen&&!panel.equals("notices")&&!panel.equals("vinhetas")){column.addView(transport,new LinearLayout.LayoutParams(-1,-2));buildTransport();}
        content=new FrameLayout(this);column.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        if(panel.equals("vinhetas")&&director){vinhetas=new RemoteVinhetas(this);content.addView(vinhetas);}
        else if(tabletLayout()&&remote.mode.equals("observer")){
            buildTabletObserverContent();
        }else if(tabletLayout()&&panel.equals("grid")&&director){
            LinearLayout panes=row(this);panes.setGravity(Gravity.TOP);content.addView(panes,new FrameLayout.LayoutParams(-1,-1));
            if(mixerShown){View mix=buildMixer();panes.addView(mix,new LinearLayout.LayoutParams(0,-1,tabletMixer));addResize(panes,true);}
            if(partsShown){panes.addView(buildParts(),new LinearLayout.LayoutParams(0,-1,.19f));}
            grid=new RemoteGrid(this,this);panes.addView(grid,new LinearLayout.LayoutParams(0,-1,Math.max(.05f,1-(mixerShown?tabletMixer:0)-(setlistShown?tabletSetlist:0)-(partsShown?.19f:0))));
            if(setlistShown){addResize(panes,false);panes.addView(buildSetlist(),new LinearLayout.LayoutParams(0,-1,tabletSetlist));}
        }else if(panel.equals("mixer")){content.addView(buildMixer());}
        else if(panel.equals("setlist")){content.addView(buildSetlist());}
        else if(panel.equals("parts")){content.addView(buildParts());}
        else if(panel.startsWith("tp")){tp=new RemoteTeleprompter(this,this,panel.equals("tp1")?1:2);content.addView(tp);}
        else if(panel.equals("notices")){content.addView(buildNotices());}
        else {grid=new RemoteGrid(this,this);content.addView(grid);}
        if(tabletLayout()&&director&&vinhetasOpen){
            vinhetas=new RemoteVinhetas(this);column.addView(vinhetas,new LinearLayout.LayoutParams(-1,dp(Math.min(260,getResources().getConfiguration().screenHeightDp*.42f))));
        }
        if(!tabletLayout()&&director&&panel.equals("parts")){View controls=setlistControls();pad(controls,10,3);column.addView(controls,new LinearLayout.LayoutParams(-1,-2));}
        footer=column(this);
        if(!fullscreen&&director&&!panel.equals("notices")&&!panel.equals("vinhetas")){
            column.addView(footer,new LinearLayout.LayoutParams(-1,-2));footer.setBackground(surface(0xff1d1d1d,0xff101010,0xff444444,0));
            nextDisplay=new SongDisplay(this,"Next");queuedDisplay=new SongDisplay(this,"Queued");footer.addView(nextDisplay,new LinearLayout.LayoutParams(-1,dp(25)));divider(footer);footer.addView(queuedDisplay,new LinearLayout.LayoutParams(-1,dp(25)));divider(footer);
            LinearLayout infoRow=row(this);if(sidebarHidden){Button restore=new Button(this,"›",()->{sidebarHidden=false;buildWorkspace();});restore.style(GREEN,false);infoRow.addView(restore,new LinearLayout.LayoutParams(dp(44),dp(25)));}
            information=centered("",10,GREEN,true);information.setMaxLines(2);infoRow.addView(information,new LinearLayout.LayoutParams(0,dp(25),1));footer.addView(infoRow);
        }
        cueText=label(this,"",20,TEXT);cueText.setTypeface(bold);cueText.setGravity(Gravity.CENTER);pad(cueText,18,14);cueText.setBackground(surface(0xf0000000,0xf0000000,YELLOW,16));cueText.setVisibility(View.GONE);FrameLayout.LayoutParams cueLp=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);cueLp.topMargin=dp(50);cueLp.setMargins(dp(16),dp(50),dp(16),0);root.addView(cueText,cueLp);
        remote.subscribe(panel.equals("tp1")?1:panel.equals("tp2")?2:panel.equals("notices")?3:0);refresh();
    }
    void addResize(LinearLayout panes,boolean left){View handle=new View(this);handle.setBackgroundColor(0xff444444);panes.addView(handle,new LinearLayout.LayoutParams(dp(4),-1));handle.setOnTouchListener(new View.OnTouchListener(){float x,start;public boolean onTouch(View v,MotionEvent e){if(e.getAction()==0){x=e.getRawX();start=left?tabletMixer:tabletSetlist;return true;}if(e.getAction()==1){float f=(e.getRawX()-x)/Math.max(1,panes.getWidth());if(left)tabletMixer=Math.max(.15f,Math.min(.50f,start+f));else tabletSetlist=Math.max(.18f,Math.min(.50f,start-f));buildWorkspace();return true;}return true;}});}
    void choose(String target){fullscreen=false;panel=target.equals(panel)&&!target.equals("grid")?"grid":target;if(remote.mode.equals("observer")&&panel.equals("grid"))panel="setlist";grid=null;tp=null;buildWorkspace();}
    void divider(LinearLayout parent){View line=new View(this);line.setBackgroundColor(0x38ffffff);parent.addView(line,new LinearLayout.LayoutParams(-1,dp(1)));}
    void buildTransport(){
        if(state==null)return;if(tabletLayout()&&remote.mode.equals("observer")){buildTabletObserverHeader();return;}if(tabletLayout()&&remote.mode.equals("director")){buildTabletTransport();return;}boolean director=remote.mode.equals("director");pad(transport,6,6);
        LinearLayout display=column(this);pad(display,6,6);display.setBackground(surface(0xff1d1d1d,0xff131313,0xff555555,5));LinearLayout top=row(this);selectionTitle=label(this,"",10,SECONDARY);top.addView(selectionTitle,new LinearLayout.LayoutParams(0,dp(15),1));time=label(this,"",12,SECONDARY);if(director)top.addView(time);else time=null;display.addView(top);current=label(this,"",13,GREEN);current.setTypeface(bold);current.setMaxLines(2);display.addView(current,new LinearLayout.LayoutParams(-1,-2));transport.addView(display,new LinearLayout.LayoutParams(-1,-2));
        if(!director){space(transport,6);LinearLayout queueBox=column(this);pad(queueBox,6,6);queueBox.setBackground(surface(0xff1d1d1d,0xff131313,0xff555555,5));TextView caption=label(this,"Fila de espera",10,SECONDARY);caption.setTypeface(bold);queueBox.addView(caption,new LinearLayout.LayoutParams(-1,dp(15)));observerQueue=label(this,"—",13,YELLOW);observerQueue.setTypeface(bold);queueBox.addView(observerQueue,new LinearLayout.LayoutParams(-1,dp(20)));transport.addView(queueBox,new LinearLayout.LayoutParams(-1,-2));space(transport,6);information=centered("",10,GREEN,true);information.setBackground(surface(0xff101010,0xff101010,0xff444444,0));transport.addView(information,new LinearLayout.LayoutParams(-1,dp(25)));if(sidebarHidden){Button restore=new Button(this,"›",()->{sidebarHidden=false;buildWorkspace();});transport.addView(restore,new LinearLayout.LayoutParams(dp(44),dp(25)));}return;}
        LinearLayout buttons=row(this);String[] labels={"Play","Pause","Sub Play","Repeat"};String[] icons={"play","pause","play","repeat"};
        for(int i=0;i<4;i++){final int at=i;Button b=new Button(this,"",()->{if(at==0)remote.action(state.optBoolean("playing")||state.optBoolean("paused")?"stop":"play");else if(at==1)remote.action(state.optBoolean("paused")?"play":"pause");else if(at==2)remote.action(state.optBoolean("subPlaying")?"subStop":"subPlay");else remote.action("toggleLoop");});b.icon(icons[i],labels[i]);b.caption=i==3?"":labels[i];LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(44),1);lp.setMargins(i==0?0:dp(4),dp(6),0,0);buttons.addView(b,lp);if(i==0)play=b;else if(i==1)pause=b;else if(i==2)sub=b;else repeat=b;}
        transport.addView(buttons);space(transport,6);LinearLayout numbers=row(this),tempo=row(this),tuning=row(this);tempo.setBackground(display(5));tuning.setBackground(display(5));numbers.addView(tempo,new LinearLayout.LayoutParams(0,dp(32),1));LinearLayout.LayoutParams tuningLp=new LinearLayout.LayoutParams(0,dp(32),1);tuningLp.leftMargin=dp(6);numbers.addView(tuning,tuningLp);
        Button minus=new Button(this,"−",()->remote.action("tempo",null,Math.max(20,state.optDouble("bpm")-1))),plus=new Button(this,"+",()->remote.action("tempo",null,Math.min(400,state.optDouble("bpm")+1))),down=new Button(this,"−",()->pitch(-1)),up=new Button(this,"+",()->pitch(1));
        for(Button button:new Button[]{minus,plus,down,up}){button.setTextSize(24);button.setTextColor(GREEN);button.setPadding(0,0,0,0);button.setBackgroundColor(Color.TRANSPARENT);}
        tempo.addView(minus,new LinearLayout.LayoutParams(dp(28),-1));bpm=centered("",15,TEXT,true);bpm.setMaxLines(1);bpm.setAutoSizeTextTypeUniformWithConfiguration(10,15,1,android.util.TypedValue.COMPLEX_UNIT_SP);bpm.setOnClickListener(v->input("BPM",String.format(Locale.US,"%.3f",state.optDouble("bpm")),true,value->{try{double b=Double.parseDouble(value.replace(',','.'));if(b<20||b>400)throw new Exception();remote.action("tempo",null,b);}catch(Exception e){onMessage("BPM entre 20 e 400");}}));tempo.addView(bpm,new LinearLayout.LayoutParams(0,-1,1));tempo.addView(plus,new LinearLayout.LayoutParams(dp(28),-1));
        tuning.addView(down,new LinearLayout.LayoutParams(dp(28),-1));pitch=centered("",12,GREEN,true);tuning.addView(pitch,new LinearLayout.LayoutParams(0,-1,1));tuning.addView(up,new LinearLayout.LayoutParams(dp(28),-1));transport.addView(numbers);
    }
    void buildTabletObserverHeader(){
        pad(transport,8,8);LinearLayout header=row(this);header.setGravity(Gravity.TOP);transport.addView(header,new LinearLayout.LayoutParams(-1,-2));
        observerHeaderDisplays=column(this);header.addView(observerHeaderDisplays,new LinearLayout.LayoutParams(0,-2,1));
        for(int i=0;i<2;i++){
            LinearLayout box=column(this);pad(box,8,6);box.setBackground(display(5));
            TextView title=label(this,i==0?"Selecionada":"Fila de espera",11,SECONDARY);title.setTypeface(bold);box.addView(title);
            TextView value=label(this,"—",16,i==0?GREEN:YELLOW);value.setTypeface(bold);value.setMaxLines(2);box.addView(value);
            if(i==0){selectionTitle=title;current=value;}else observerQueue=value;
            observerHeaderDisplays.addView(box);
        }
        observerHeaderButtons=column(this);LinearLayout.LayoutParams buttonsLp=new LinearLayout.LayoutParams(-2,-2);buttonsLp.leftMargin=dp(8);header.addView(observerHeaderButtons,buttonsLp);
        for(int i=1;i<=2;i++){final String target="tp"+i;Button button=new Button(this,"TP"+i,()->choose(target));button.style(panel.equals(target)?GREEN:RED,panel.equals(target));observerHeaderButtons.addView(button);}
        if(sidebarHidden){Button restore=new Button(this,"›",()->{sidebarHidden=false;buildWorkspace();});transport.addView(restore,new LinearLayout.LayoutParams(dp(44),dp(25)));}
    }
    void buildTabletObserverContent(){
        observerPanes=column(this);observerPanes.setGravity(Gravity.TOP);content.addView(observerPanes,new FrameLayout.LayoutParams(-1,-1));
        if(panel.startsWith("tp")){tp=new RemoteTeleprompter(this,this,panel.equals("tp1")?1:2);observerPrompterPane=tp;observerPanes.addView(tp);}
        if(observerPrompterPane==null||(!fullscreen&&setlistShown)){observerListPane=buildSetlist();observerPanes.addView(observerListPane);}
        layoutTabletObserver();
    }
    void layoutTabletObserver(){
        boolean portrait=getResources().getConfiguration().orientation!=Configuration.ORIENTATION_LANDSCAPE;
        if(observerHeaderDisplays!=null){
            observerHeaderDisplays.setOrientation(portrait?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            observerHeaderButtons.setOrientation(portrait?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            for(int i=0;i<2;i++){
                LinearLayout.LayoutParams displayLp=new LinearLayout.LayoutParams(portrait?-1:0,-2,portrait?0:1);
                if(i>0){if(portrait)displayLp.topMargin=dp(8);else displayLp.leftMargin=dp(8);}
                observerHeaderDisplays.getChildAt(i).setLayoutParams(displayLp);
                LinearLayout.LayoutParams buttonLp=new LinearLayout.LayoutParams(dp(52),dp(portrait?44:25));
                if(i>0){if(portrait)buttonLp.topMargin=dp(8);else buttonLp.leftMargin=dp(8);}
                observerHeaderButtons.getChildAt(i).setLayoutParams(buttonLp);
            }
        }
        if(observerPanes==null)return;
        observerPanes.setOrientation(portrait?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
        boolean shared=observerPrompterPane!=null&&observerListPane!=null;
        for(int i=0;i<observerPanes.getChildCount();i++){
            View child=observerPanes.getChildAt(i);float weight=shared?(child==observerPrompterPane?(portrait?.60f:.70f):(portrait?.40f:.30f)):1;
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(portrait?-1:0,portrait?0:-1,weight);
            if(i>0){if(portrait)lp.topMargin=dp(8);else lp.leftMargin=dp(8);}
            child.setLayoutParams(lp);
        }
    }
    void pitch(int delta){String target=RemoteModel.id(state,"pitchRegion");if(target.isEmpty())return;remote.action("pitch",target,Math.max(-12,Math.min(12,state.optInt("pitchSemitones")+delta)));}
    void resizeTrackHeight(double scale){
        layout.resize(scale);
        for(TrackRow row:trackRows.values())if(row.id!=null&&row.getLayoutParams()!=null){row.getLayoutParams().height=dp((float)layout.height(row.id));row.fitHeight();row.requestLayout();}
        if(grid!=null){double total=0;for(RemoteModel.TrackLayout row:layout.ordered)total+=row.height;grid.vertical=Math.min(grid.vertical,Math.max(0,dp((float)total)+dp(RemoteTimeline.HEADER_HEIGHT)-grid.getHeight()));grid.invalidate();}
    }
    void finishTrackHeightResize(){getPreferences(0).edit().putFloat("trackHeightScale",(float)layout.heightScale).apply();}
    View buildMixer(){LinearLayout all=column(this);if(tabletLayout()&&remote.mode.equals("director")){View blank=new View(this);blank.setBackground(RemoteWidgets.panel(0));all.addView(blank,new LinearLayout.LayoutParams(-1,dp(RemoteTimeline.HEADER_HEIGHT)));}else{TrackRow master=new TrackRow(null,0);trackRows.put("master",master);all.addView(master,new LinearLayout.LayoutParams(-1,dp(80)));}LinearLayout lower=row(this);all.addView(lower,new LinearLayout.LayoutParams(-1,0,1));RemoteTrackRail scrollRail=new RemoteTrackRail(this,this);trackRail=scrollRail;scrollRail.setBackgroundColor(0xff161616);Button up=new Button(this,"⌃",()->mixerScroll.smoothScrollBy(0,-dp(140)));up.style(GREEN,false);up.setBackgroundColor(Color.TRANSPARENT);scrollRail.addView(up,new LinearLayout.LayoutParams(dp(28),dp(36)));View drag=new View(this);scrollRail.addView(drag,new LinearLayout.LayoutParams(dp(28),0,1));drag.setOnTouchListener(new View.OnTouchListener(){float y;int initial;public boolean onTouch(View v,MotionEvent e){if(e.getAction()==0){y=e.getY();initial=mixerScroll.getScrollY();return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){int range=Math.max(0,trackColumn.getHeight()-mixerScroll.getHeight());mixerScroll.scrollTo(0,initial+(int)((e.getY()-y)*range/Math.max(1,v.getHeight())));return true;}return true;}});Button down=new Button(this,"⌄",()->mixerScroll.smoothScrollBy(0,dp(140)));down.style(GREEN,false);down.setBackgroundColor(Color.TRANSPARENT);scrollRail.addView(down,new LinearLayout.LayoutParams(dp(28),dp(36)));lower.addView(scrollRail,new LinearLayout.LayoutParams(dp(28),-1));mixerScroll=new ScrollView(this);mixerScroll.setVerticalScrollBarEnabled(false);trackColumn=column(this);mixerScroll.addView(trackColumn);lower.addView(mixerScroll,new LinearLayout.LayoutParams(0,-1,1));mixerScroll.setOnScrollChangeListener((v,x,y,oldx,oldy)->{if(grid!=null){grid.vertical=y;grid.invalidate();}});return all;}
    View buildSetlist(){setlistColumn=column(this);pad(setlistColumn,10,8);playlistButton=new Button(this,"",this::playlists);playlistButton.setOnLongClickListener(v->{playlistContext(v);return true;});playlistButton.setTextSize(12);playlistButton.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);playlistButton.trailingIcon("chevron.down");playlistButton.setContentDescription("Selecionar playlist");GradientDrawable playlistSurface=RemoteWidgets.panel(4);playlistSurface.setStroke(dp(.5f),0x73ffffff);playlistButton.setBackground(playlistSurface);setlistColumn.addView(playlistButton,new LinearLayout.LayoutParams(-1,dp(30)));space(setlistColumn,8);
        LinearLayout searchLine=row(this);search=new EditText(this);search.setTextColor(TEXT);search.setSingleLine();search.setTextSize(16);search.setTypeface(regular);search.setHintTextColor(0xff666666);search.setHint("Pesquisar músicas");search.setBackground(surface(Color.BLACK,Color.BLACK,Color.TRANSPARENT,5));pad(search,8,6);search.setText(query);search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){query=s.toString();structure="";refreshStructure();}public void afterTextChanged(Editable e){}});searchLine.addView(search,new LinearLayout.LayoutParams(0,dp(36),1));auto=new Button(this,"AUTO",()->remote.action("toggleRegionAuto"));auto.setTextSize(9);auto.setSingleLine();pad(auto,2,0);LinearLayout.LayoutParams autoLp=new LinearLayout.LayoutParams(dp(40),dp(28));autoLp.setMargins(dp(6),0,0,0);if(remote.mode.equals("director"))searchLine.addView(auto,autoLp);setlistColumn.addView(searchLine);space(setlistColumn,8);if(remote.mode.equals("observer")){setlistColumn.removeAllViews();playlistButton=null;auto=null;search=null;}
        setlistScroll=new ScrollView(this);setlistScroll.setVerticalScrollBarEnabled(false);LinearLayout list=column(this);list.setTag("songs");setlistScroll.addView(list);setlistColumn.addView(setlistScroll,new LinearLayout.LayoutParams(-1,0,1));if(remote.mode.equals("director"))setlistColumn.addView(setlistControls());return setlistColumn;}
    View setlistControls(){LinearLayout row=row(this);pad(row,0,3);bypass=new Button(this,"ByPass",()->remote.action("toggleMultiLoopBypass"));live=new Button(this,"Live",()->remote.action("toggleSetlistLive"));Button parts=new Button(this,"Parts",()->{if(tabletLayout()){partsShown=!partsShown;buildWorkspace();}else choose(panel.equals("parts")?"setlist":"parts");});parts.style(GREEN,tabletLayout()?partsShown:panel.equals("parts"));for(Button b:new Button[]{bypass,live,parts}){b.setTextSize(11);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(26),1);lp.setMargins(dp(2),0,dp(2),0);row.addView(b,lp);}Button drawer=new Button(this,"⌄",()->{JSONObject r=visibleRegion;if(r==null)return;String id=RemoteModel.id(r,"id");if(!expanded.add(id))expanded.remove(id);structure="";refreshStructure();});drawer.style(GREEN,false);row.addView(drawer,new LinearLayout.LayoutParams(dp(30),dp(28)));return row;}
    View buildParts(){parts=new RemoteParts(this);return parts;}
    void refresh(){
        if(state==null)return;RemoteVinhetas.receiveFeedback(this);if(vinhetas!=null)vinhetas.refresh();JSONObject displays=state.optJSONObject("songDisplays");String name=RemoteModel.currentSongName(state);
        if(current!=null)current.setText(tabletLayout()?(state.optBoolean("playing")?"Tocando":"Selecionada")+"  ›  "+name:name);if(selectionTitle!=null)selectionTitle.setText(state.optBoolean("playing")?"Tocando":"Selecionada");if(playCaption!=null)playCaption.setText(state.optBoolean("playing")||state.optBoolean("paused")?"Stop":"Play");if(pauseCaption!=null)pauseCaption.setText(state.optBoolean("paused")?"Play":"Pause");
        if(play!=null){play.caption=state.optBoolean("playing")||state.optBoolean("paused")?"Stop":"Play";pause.caption=state.optBoolean("paused")?"Play":"Pause";if(tabletLayout())play.setText(state.optBoolean("playing")||state.optBoolean("paused")?"Stop":"Play");else play.icon(state.optBoolean("playing")||state.optBoolean("paused")?"stop":"play",state.optBoolean("playing")?"Stop":"Play");play.style(GREEN,state.optBoolean("playing"));pause.style(YELLOW,state.optBoolean("paused"));if(tabletLayout())pause.setText(state.optBoolean("paused")?"Play":"Pause");else pause.icon(state.optBoolean("paused")?"play":"pause","Pause");pause.setEnabled(state.optBoolean("playing")||state.optBoolean("paused"));sub.style(YELLOW,state.optBoolean("subPlaying"));sub.setEnabled(state.optBoolean("playing"));repeat.style(state.optBoolean("loop")?YELLOW:RED,state.optBoolean("loop"));}
        if(bpm!=null){bpm.setText(String.format(Locale.US,"%s BPM",number(state.optDouble("bpm"))));bpm.setTextColor(state.optBoolean("tempoNeedsRender")?YELLOW:TEXT);}if(pitch!=null)pitch.setText(String.format(Locale.US,tabletLayout()?"%+d st":"Tuner\n%+dst",state.optInt("pitchSemitones")));
        if(save!=null){save.setEnabled(state.optBoolean("pendingSave")&&!state.optBoolean("saving"));if(tabletLayout())save.setText(state.optBoolean("saving")?"Salvando…":state.optBoolean("pendingSave")?"Salvar":"Salvo");}
        if(auto!=null)auto.style(state.optBoolean("regionAuto")?GREEN:SECONDARY,state.optBoolean("regionAuto"));if(bypass!=null){bypass.solid(state.optBoolean("multiLoopsBypassed")?YELLOW:RED);live.solid(state.optBoolean("setlistLiveEnabled")?GREEN:RED);}
        if(nextDisplay!=null)nextDisplay.update("Next",displays==null?null:displays.optString("next",null),displayBPM(displays,"nextBPM"));
        if(queuedDisplay!=null)queuedDisplay.update(state.optBoolean("subPlaying")?"Sub Play":"Queued",RemoteModel.queuedSongName(state),displayBPM(displays,"queuedBPM"));
        if(observerQueue!=null)observerQueue.setText(SongDisplay.songText(RemoteModel.queuedSongName(state),displayBPM(displays,"queuedBPM")));
        refreshFooterInformation();refreshNotices();
        if(playlistButton!=null){JSONObject selected=RemoteModel.find(RemoteModel.array(state,"playlists"),RemoteModel.id(state,"selectedPlaylist"));playlistButton.setText(selected==null?"All Regions":selected.optString("name"));}
        if(parts!=null)parts.refresh();refreshStructure();for(TrackRow row:trackRows.values())row.refresh();for(SongRow row:songRows)row.invalidate();if(grid!=null){grid.refreshItemEditor();grid.invalidate();}if(tp!=null)tp.invalidate();
        updateTabs();for(Map.Entry<String,Button> entry:railButtons.entrySet()){String key=entry.getKey();boolean selected=key.equals("vinhetas")&&tabletLayout()&&vinhetasOpen||key.equals(panel)||key.equals("TP1")&&panel.equals("tp1")||key.equals("TP2")&&panel.equals("tp2");Button button=entry.getValue();if(selected)button.style(GREEN,true);else if(key.equals("setlist"))button.style(GREEN,false);}
        if(railButtons.containsKey("preview"))railButtons.get("preview").solid(state.optBoolean("previewActive")?GREEN:RED);
    }
    void refreshFooterInformation(){
        if(state==null)return;
        long now=SystemClock.elapsedRealtime();
        footerNotice.receive(RemoteModel.id(state,"project"),state.optString("message",""),now);
        String transientText=footerNotice.visible(now);
        String text=!remote.connected?remote.status:!transientText.isEmpty()?transientText:state.optBoolean("loop")?"Loop Ativo":state.optString("footerInformation","");
        for(TextView target:new TextView[]{information,tabletInformation})if(target!=null&&!text.contentEquals(target.getText()))target.setText(text);
    }
    Double displayBPM(JSONObject displays,String key){return displays==null||displays.isNull(key)?null:displays.optDouble(key);}
    void refreshStructure(){
        if(state==null||content==null)return;
        // Mixer touch views must survive unrelated setlist/marker packets and
        // equivalent JSON objects emitted with a different key order.
        StringBuilder mixerKey=new StringBuilder(project+"|"+panel);
        for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"tracks")))mixerKey.append(t.optString("id")).append(t.optString("name")).append(t.optString("color")).append(t.optString("instrumentIcon")).append(layout.height(RemoteModel.id(t,"id")));
        if(!mixerStructure.equals(mixerKey.toString())&&trackColumn!=null&&trackColumn.isAttachedToWindow()){
            mixerStructure=mixerKey.toString();trackColumn.removeAllViews();trackRows.entrySet().removeIf(e->!e.getKey().equals("master"));int index=0;
            for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"tracks"))){TrackRow row=new TrackRow(RemoteModel.id(t,"id"),++index);trackRows.put(row.id,row);trackColumn.addView(row,new LinearLayout.LayoutParams(-1,dp((float)layout.height(row.id))));}
        }
        StringBuilder key=new StringBuilder(project+"|"+panel+"|"+query+expanded.toString()+"|"+RemoteModel.id(visibleRegion,"id"));
        key.append(mixerKey).append(RemoteModel.array(state,"regions")).append(RemoteModel.array(state,"setlistBlocks")).append(RemoteModel.array(state,"markers"));
        if(structure.equals(key.toString()))return;structure=key.toString();
        if(setlistScroll!=null&&setlistScroll.isAttachedToWindow()){
            LinearLayout list=(LinearLayout)setlistScroll.getChildAt(0);list.removeAllViews();songRows.clear();int index=0;
            for(JSONObject region:RemoteModel.list(RemoteModel.array(state,"regions"))){String id=RemoteModel.id(region,"id");
                for(JSONObject block:RemoteModel.list(RemoteModel.array(state,"setlistBlocks")))if(RemoteModel.same(RemoteModel.id(block,"beforeRegion"),id)){LinearLayout header=row(this);pad(header,8,0);if(block.optBoolean("symbol",true)){TextView arrow=label(this,"⟶",24,YELLOW);header.addView(arrow,new LinearLayout.LayoutParams(dp(48),dp(26)));}TextView nameLabel=label(this,block.optString("name"),13,rgb(block.optLong("nameColor",0x69ed91)));nameLabel.setTypeface(state.optInt("setlistFontStyle")==0?regular:bold);nameLabel.setMaxLines(1);nameLabel.setEllipsize(TextUtils.TruncateAt.END);header.addView(nameLabel,new LinearLayout.LayoutParams(0,-1,1));int color=rgb(block.optLong("color"));header.setBackground(surface(blend(0xff222222,color,.15f),blend(0xff222222,color,.15f),color,3));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(26));lp.setMargins(dp(3),dp(3),dp(3),dp(2));list.addView(header,lp);}
                index++;if(matches(region)){SongRow row=new SongRow(region,index,false);songRows.add(row);list.addView(row,new LinearLayout.LayoutParams(-1,dp(42*listScale())));}
                if(expanded.contains(id)){
                    SongRow previous=null;
                    for(JSONObject child:RemoteModel.children(state,id))if(matches(child)){
                        SongRow row=new SongRow(child,0,true);if(previous!=null)previous.drawerContinues=true;previous=row;
                        songRows.add(row);list.addView(row,new LinearLayout.LayoutParams(-1,dp(42*listScale())));
                    }
                }
            }
        }

    }
    boolean matches(JSONObject r){return query.isEmpty()||java.text.Normalizer.normalize(r.optString("name"),java.text.Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).contains(java.text.Normalizer.normalize(query,java.text.Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT));}
    float listScale(){return remote.mode.equals("observer")?getPreferences(0).getFloat("observerScale",1):1;}
    void updateTabs(){if(remote.mode.equals("observer")){tabs.setVisibility(View.GONE);tabScroll.setVisibility(View.GONE);return;}String signature=panel+RemoteModel.array(state,"projectTabs").toString();if(signature.equals(tabs.getTag()))return;tabs.setTag(signature);tabs.removeAllViews();for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"projectTabs"))){Button b=new Button(this,t.optString("name"),()->remote.action("selectProjectTab",RemoteModel.id(t,"id"),0));b.setOnLongClickListener(v->{menu(v,new String[]{"Fechar aba"},i->remote.action("closeProjectTab",RemoteModel.id(t,"id"),0));return true;});b.setTextSize(13);b.setTextColor(t.optBoolean("selected")?TEXT:0xffa4a4a4);b.setBackgroundColor(t.optBoolean("selected")?0xff333333:0xff191919);if(t.optBoolean("selected")){GradientDrawable fill=new GradientDrawable();fill.setColor(0xff333333);GradientDrawable underline=new GradientDrawable();underline.setColor(GREEN);LayerDrawable layers=new LayerDrawable(new Drawable[]{fill,underline});layers.setLayerGravity(1,Gravity.BOTTOM);layers.setLayerHeight(1,dp(3));b.setBackground(layers);}tabs.addView(b,new LinearLayout.LayoutParams(dp(120),-1));}layoutProjectTabs(tabScroll.getWidth());tabScroll.setVisibility(tabs.getChildCount()>1&&!panel.equals("notices")?View.VISIBLE:View.GONE);}
    void layoutProjectTabs(int available){int count=tabs.getChildCount();if(count==0||available<=0)return;int width=Math.max(dp(120),available/count);for(int i=0;i<count;i++){View tab=tabs.getChildAt(i);LinearLayout.LayoutParams lp=(LinearLayout.LayoutParams)tab.getLayoutParams();int target=width+(width>=dp(120)&&count*dp(120)<=available&&i==count-1?available-width*count:0);if(lp.width!=target||lp.weight!=0){lp.width=target;lp.weight=0;tab.setLayoutParams(lp);}}}
    void tick(){if(!screen.equals("workspace")||state==null)return;refreshFooterInformation();updateProjectOpening();if(parts!=null)parts.tick();if(time!=null)time.setText(RemoteModel.time(displayPosition()));if(grid!=null&&panel.equals("grid"))grid.invalidate();if(tp!=null&&panel.startsWith("tp"))tp.invalidate();if(cueText!=null){String text=remote.connected&&remote.mode.equals("observer")?cue.update(state,SystemClock.elapsedRealtime()):"";cueText.setText(text.isEmpty()?"":(cue.armed?"Trecho engatilhado":"Próximo trecho")+"\n"+text+"    "+cue.seconds+" s");cueText.setVisibility(text.isEmpty()?View.GONE:View.VISIBLE);}}
    double displayPosition(){return anchorPosition+(remote.connected&&state!=null&&state.optBoolean("playing")&&!state.optBoolean("paused")?Math.min(.35,(SystemClock.elapsedRealtime()-stateAt)/1000.0):0);}
    double timerValue(){return localTimer.value(SystemClock.elapsedRealtime());}
    void updateProjectOpening(){
        RemoteProjectOpening opening=remote.projectOpening;View old=root.findViewWithTag("project-loading");
        if(!opening.active()||root.findViewWithTag("connection")!=null){if(old!=null)root.removeView(old);return;}
        boolean dismissible=opening.canDismiss(SystemClock.elapsedRealtime());String signature=opening.id+opening.phase+opening.status+opening.error+opening.name+dismissible;
        if(old!=null&&signature.equals(projectLoadingSignature))return;if(old!=null)root.removeView(old);
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(),0);
        FrameLayout overlay=new FrameLayout(this);overlay.setTag("project-loading");projectLoadingSignature=signature;overlay.setBackgroundColor(0xb3000000);overlay.setClickable(true);overlay.setFocusableInTouchMode(true);
        LinearLayout card=column(this);card.setGravity(Gravity.CENTER_HORIZONTAL);pad(card,24,24);card.setBackground(surface(0xff292929,0xff202020,0x6669ed91,16));
        if(!opening.phase.equals("failed")){ProgressBar spinner=new ProgressBar(this);spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(GREEN));card.addView(spinner,new LinearLayout.LayoutParams(dp(28),dp(28)));space(card,16);}
        card.addView(centered(opening.phase.equals("failed")?"Não foi possível abrir o projeto":"Carregando projeto…",20,TEXT,true));space(card,12);
        if(!opening.name.isEmpty()){card.addView(centered(opening.name,16,GREEN,false));space(card,12);}
        card.addView(centered(opening.error.isEmpty()?opening.status:opening.error,14,SECONDARY,false));
        if(dismissible){space(card,16);if(!opening.phase.equals("failed")){card.addView(centered("Confira no computador se há uma confirmação ou arquivo pendente. Fechar este aviso não cancela a abertura.",13,SECONDARY,false));space(card,16);}Button close=new Button(this,"Fechar aviso",()->{opening.clear();updateProjectOpening();});card.addView(close,new LinearLayout.LayoutParams(-1,dp(40)));}
        overlay.addView(card,new FrameLayout.LayoutParams(Math.min(dp(360),getResources().getDisplayMetrics().widthPixels-dp(32)),-2,Gravity.CENTER));root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));overlay.requestFocus();
    }
    void showConnectionOverlay(){
        if(root.findViewWithTag("connection")!=null)return;
        closeDialog();cue.clear();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(),0);
        for(int i=0;i<root.getChildCount();i++)root.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        FrameLayout overlay=new FrameLayout(this);overlay.setTag("connection");overlay.setBackgroundColor(0xa6000000);overlay.setClickable(true);overlay.setFocusableInTouchMode(true);
        LinearLayout card=column(this);card.setGravity(Gravity.CENTER_HORIZONTAL);pad(card,28,28);float brightness=tabletLayout()?.72f:1;card.setBackground(surface(gray(.16f*brightness),gray(.105f*brightness),0x6669ed91,16));
        ProgressBar spinner=new ProgressBar(this);spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(GREEN));card.addView(spinner,new LinearLayout.LayoutParams(dp(25),dp(25)));space(card,16);
        card.addView(centered("Waiting for reconnection",20,TEXT,true));space(card,16);card.addView(centered(remote.peerName,17,GREEN,false));space(card,16);
        card.addView(centered("Open CatLive and enable Remote on your PC.",16,SECONDARY,false));space(card,16);
        Button exit=new Button(this,"Exit Remote",()->{entering=false;remote.exit();showWelcome();});exit.setContentDescription(RemoteText.ui("Exit Remote"));card.addView(exit,new LinearLayout.LayoutParams(-2,dp(36)));
        overlay.addView(card,new FrameLayout.LayoutParams(Math.min(dp(360),getResources().getDisplayMetrics().widthPixels-dp(40)),-2,Gravity.CENTER));root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));overlay.requestFocus();
    }
    void removeConnectionOverlay(){View v=root.findViewWithTag("connection");if(v!=null)root.removeView(v);for(int i=0;i<root.getChildCount();i++)root.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}
    String number(double value){return value==Math.rint(value)?String.format(Locale.US,"%.0f",value):String.format(Locale.US,"%.3f",value);}
    @Override public boolean onKeyUp(int code,KeyEvent event){if(code==KeyEvent.KEYCODE_BACK&&Build.VERSION.SDK_INT<33){handleBack();return true;}return super.onKeyUp(code,event);}
    void buildTabletTransport(){
        LinearLayout horizontal=row(this);horizontal.setGravity(Gravity.TOP);pad(horizontal,6,6);transport.addView(horizontal,new LinearLayout.LayoutParams(-1,dp(82)));
        TrackRow master=new TrackRow(null,0);trackRows.put("master",master);horizontal.addView(master,new LinearLayout.LayoutParams(dp(220),dp(70)));
        LinearLayout middle=column(this);LinearLayout.LayoutParams middleLp=new LinearLayout.LayoutParams(0,-1,1);middleLp.setMargins(dp(8),0,0,0);horizontal.addView(middle,middleLp);
        LinearLayout display=row(this),songAndInformation=row(this);songAndInformation.setBackground(RemoteWidgets.display(5));
        current=label(this,"",12,TEXT);current.setSingleLine();pad(current,5,0);songAndInformation.addView(current,new LinearLayout.LayoutParams(0,dp(25),3));
        View separator=new View(this);separator.setBackgroundColor(0xff444444);songAndInformation.addView(separator,new LinearLayout.LayoutParams(dp(1),dp(25)));
        tabletInformation=centered("",10,GREEN,true);tabletInformation.setSingleLine();tabletInformation.setAutoSizeTextTypeUniformWithConfiguration(7,10,1,android.util.TypedValue.COMPLEX_UNIT_SP);songAndInformation.addView(tabletInformation,new LinearLayout.LayoutParams(0,dp(25),1));
        display.addView(songAndInformation,new LinearLayout.LayoutParams(0,dp(25),1));time=label(this,"",12,TEXT);time.setGravity(Gravity.CENTER);time.setBackground(RemoteWidgets.display(5));LinearLayout.LayoutParams timeLp=new LinearLayout.LayoutParams(dp(82),dp(25));timeLp.leftMargin=dp(6);display.addView(time,timeLp);
        save=new Button(this,"Salvar",()->confirm("Deseja salvar este projeto?","","Salvar",()->remote.action("save")));save.setTextSize(11);save.style(GREEN,false);LinearLayout.LayoutParams saveLp=new LinearLayout.LayoutParams(dp(72),dp(28));saveLp.leftMargin=dp(6);display.addView(save,saveLp);middle.addView(display);

        LinearLayout controls=row(this);play=new Button(this,"Play",()->remote.action(state.optBoolean("playing")||state.optBoolean("paused")?"stop":"play"));pause=new Button(this,"Pause",()->remote.action(state.optBoolean("paused")?"play":"pause"));sub=new Button(this,"Sub Play",()->remote.action(state.optBoolean("subPlaying")?"subStop":"subPlay"));repeat=new Button(this,"",()->remote.action("toggleLoop"));repeat.icon("repeat","Repeat");for(Button b:new Button[]{play,pause,sub,repeat}){b.setTextSize(11);controls.addView(b,new LinearLayout.LayoutParams(0,dp(28),1));}
        Button minus=new Button(this,"−",()->remote.action("tempo",null,Math.max(20,state.optDouble("bpm")-1)));controls.addView(minus,new LinearLayout.LayoutParams(dp(22),dp(28)));bpm=label(this,"",12,TEXT);bpm.setGravity(Gravity.CENTER);controls.addView(bpm,new LinearLayout.LayoutParams(dp(66),dp(28)));Button plus=new Button(this,"+",()->remote.action("tempo",null,Math.min(400,state.optDouble("bpm")+1)));controls.addView(plus,new LinearLayout.LayoutParams(dp(22),dp(28)));
        Button pitchDown=new Button(this,"−",()->pitch(-1));controls.addView(pitchDown,new LinearLayout.LayoutParams(dp(22),dp(28)));pitch=label(this,"",12,GREEN);pitch.setGravity(Gravity.CENTER);controls.addView(pitch,new LinearLayout.LayoutParams(dp(44),dp(28)));Button pitchUp=new Button(this,"+",()->pitch(1));controls.addView(pitchUp,new LinearLayout.LayoutParams(dp(22),dp(28)));space(middle,5);middle.addView(controls);
        Button setlist=new Button(this,"Setlist",()->{setlistShown=!setlistShown;buildWorkspace();});setlist.style(setlistShown?GREEN:RED,true);LinearLayout.LayoutParams setlistLp=new LinearLayout.LayoutParams(dp(72),dp(28));setlistLp.leftMargin=dp(6);controls.addView(setlist,setlistLp);
    }
    void space(LinearLayout layout,int h){View v=new View(this);layout.addView(v,new LinearLayout.LayoutParams(1,dp(h)));}

    final class TrackRow extends LinearLayout {
        final String id;final int index;final Paint boundaryPaint=new Paint();LinearLayout strip,controls,line;TextView title,volumeReadout;Fader volume,pan;Button mute,solo,mono;RemoteIcons.IconView iconView;RemoteGroupGuide groupGuide;Icon folderIcon;
        TrackRow(String id,int index){super(MainActivity.this);this.id=id;this.index=index;setOrientation(HORIZONTAL);if(id!=null){groupGuide=new RemoteGroupGuide(MainActivity.this);addView(groupGuide,new LinearLayout.LayoutParams(0,-1));}strip=column(MainActivity.this);strip.setGravity(Gravity.CENTER_VERTICAL);pad(strip,6,id==null?2:3);addView(strip,new LinearLayout.LayoutParams(0,-1,1));
            controls=row(MainActivity.this);controls.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
            if(id==null){mono=new Button(MainActivity.this,"Estéreo",()->remote.action("masterMono"));mono.setTextSize(10);controls.addView(mono,new LinearLayout.LayoutParams(dp(58),dp(28)));}
            pan=new Fader(MainActivity.this,true,v->remote.action("pan",id,v));pan.setContentDescription("Pan "+trackName());controls.addView(pan,new LinearLayout.LayoutParams(dp(tabletLayout()?(id==null?80:53):104),dp(28)));
            mute=new Button(MainActivity.this,"M",()->remote.action("mute",id,0));solo=new Button(MainActivity.this,"S",()->remote.action("solo",id,0));for(Button b:new Button[]{mute,solo}){b.setTextSize(10);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(id==null?28:32),dp(28));lp.setMargins(dp(3),0,0,0);controls.addView(b,lp);}strip.addView(controls,new LinearLayout.LayoutParams(-1,dp(28)));
            line=row(MainActivity.this);volumeReadout=label(MainActivity.this,"",10,TEXT);volumeReadout.setTypeface(bold);line.addView(volumeReadout,new LinearLayout.LayoutParams(dp(36),dp(23)));volume=new Fader(MainActivity.this,false,v->{volumeReadout.setText(v<=0?"−∞":String.format(Locale.US,"%+.1f",20*Math.log10(v)));remote.action("volume",id,v);});volume.readout=false;volume.setContentDescription("Volume "+trackName());line.addView(volume,new LinearLayout.LayoutParams(0,dp(23),1));strip.addView(line,new LinearLayout.LayoutParams(-1,dp(23)));
            title=label(MainActivity.this,"",11,TEXT);title.setTypeface(bold);title.setSingleLine();if(id!=null){LinearLayout nameRow=row(MainActivity.this);folderIcon=new Icon(MainActivity.this,"folder",GREEN,14);folderIcon.setClickable(false);folderIcon.setFocusable(false);nameRow.addView(folderIcon,new LinearLayout.LayoutParams(dp(18),dp(18)));nameRow.addView(title,new LinearLayout.LayoutParams(0,dp(18),1));strip.addView(nameRow,new LinearLayout.LayoutParams(-1,dp(18)));}else strip.addView(title,new LinearLayout.LayoutParams(-1,dp(18)));if(id==null){strip.removeView(title);title.setGravity(Gravity.CENTER);strip.addView(title,1,new LinearLayout.LayoutParams(-1,dp(14)));}

            boolean icons=false;for(JSONObject t:RemoteModel.list(RemoteModel.array(state,"tracks")))if(!RemoteModel.id(t,"instrumentIcon").isEmpty())icons=true;
            iconView=new RemoteIcons.IconView(MainActivity.this);if(id!=null&&icons){addView(iconView,new LinearLayout.LayoutParams(dp(40),-1));}
            fitHeight();refresh();
        }
        @Override protected void dispatchDraw(Canvas canvas){
            super.dispatchDraw(canvas);
            // The iOS mixer separates adjacent rows with one point of dark
            // space. Split that boundary between each row's top and bottom,
            // without drawing through the hierarchy gutter or icon column.
            if(id==null||strip.getWidth()==0)return;
            int edge=Math.max(1,Math.round(density*.5f));boundaryPaint.setColor(0xff181818);
            canvas.drawRect(strip.getLeft(),0,strip.getRight(),edge,boundaryPaint);
            canvas.drawRect(strip.getLeft(),getHeight()-edge,strip.getRight(),getHeight(),boundaryPaint);
        }
        void fitHeight(){if(id==null)return;double height=layout.height(id);controls.setVisibility(height>=72?View.VISIBLE:View.GONE);line.setVisibility(height>=48?View.VISIBLE:View.GONE);}
        String trackName(){JSONObject t=id==null?null:RemoteModel.find(RemoteModel.array(state,"tracks"),id);return t==null?"Master":t.optString("name");}
        void refresh(){JSONObject track=id==null?null:RemoteModel.find(RemoteModel.array(state,"tracks"),id);if(id!=null&&track==null)return;
            int color=rgb(id==null?state.optLong("masterColor",0x414141):track.optLong("color",0x414141));if(track!=null&&track.optBoolean("silenced")){int gray=(Color.red(color)+Color.green(color)+Color.blue(color))/3;color=Color.rgb(gray,gray,gray);}int background=blend(0xff1d1d1d,color,track!=null&&track.optBoolean("emphasized")?.65f:.50f);setBackgroundColor(id==null?background:0xff1d1d1d);strip.setBackgroundColor(background);iconView.setBackgroundColor(background);if(groupGuide!=null)groupGuide.update(RemoteModel.array(state,"tracks"),id);
            if(folderIcon!=null){boolean folder=false;for(JSONObject child:RemoteModel.list(RemoteModel.array(state,"tracks")))if(!RemoteModel.same(RemoteModel.id(child,"id"),id)&&RemoteModel.same(RemoteModel.id(child,"parentTrack"),id)){folder=true;break;}folderIcon.key=folder&&!RemoteModel.id(track,"parentTrack").isEmpty()?"folder.nested":"folder";int folderWidth=dp(folderIcon.key.equals("folder.nested")?28:18);if(folderIcon.getLayoutParams().width!=folderWidth){folderIcon.getLayoutParams().width=folderWidth;folderIcon.requestLayout();}folderIcon.invalidate();folderIcon.setVisibility(folder?View.VISIBLE:View.GONE);}
            title.setText(id==null?"Master":String.format(Locale.US,"%02d  %s",index,track.optString("name")));iconView.update(id==null?"":track.optString("instrumentIcon",""));title.setTextColor(rgb(id==null?state.optLong("masterNameColor",0xffffff):track.optLong("nameColor",0xffffff)));
            double gain=id==null?state.optDouble("masterVolume",1):track.optDouble("volume",1);volume.update(gain);volumeReadout.setText(volume.value<=0?"−∞":String.format(Locale.US,"%+.1f",20*Math.log10(volume.value)));if(pan!=null){pan.update(id==null?state.optDouble("masterPan",0):track.optDouble("pan"));pan.setEnabled(id!=null||state.has("masterPan"));}
            mute.trackStyle(0xffff3b30,id==null?state.optBoolean("masterMute"):track.optBoolean("mute"));solo.trackStyle(YELLOW,id==null?state.optBoolean("masterSolo"):track.optBoolean("solo"));if(mono!=null){mono.setText(state.optBoolean("masterMono")?"Mono":"Estéreo");mono.style(GREEN,state.optBoolean("masterMono"));}

        }
    }
    final class SongRow extends View {
        final JSONObject region;final String id;final int index;final boolean child;boolean drawerContinues;final Paint paint=new Paint(3);final GestureDetector gestures;
        SongRow(JSONObject r,int index,boolean child){super(MainActivity.this);region=r;id=RemoteModel.id(r,"id");this.index=index;this.child=child;setContentDescription(r.optString("name"));setFocusable(true);
            gestures=new GestureDetector(MainActivity.this,new GestureDetector.SimpleOnGestureListener(){public boolean onDown(MotionEvent e){return true;}public boolean onSingleTapUp(MotionEvent e){if(remote.mode.equals("director")){if(!RemoteModel.canQueue(state,region)){onMessage("Esta música já está tocando e não pode entrar na fila novamente.");return true;}remote.action("selectRegion",id,0);}return true;}public void onLongPress(MotionEvent e){regionMenu(SongRow.this,region);}});
            setOnGenericMotionListener((v,e)->{if(e.isFromSource(android.view.InputDevice.SOURCE_MOUSE)&&(e.getButtonState()&MotionEvent.BUTTON_SECONDARY)!=0){regionMenu(this,region);return true;}return false;});
        }
        @Override protected void onDraw(Canvas c){
            boolean active=state.optBoolean("playing")&&RemoteModel.same(RemoteModel.activeEntry(state),id),queue=state.optBoolean("playing")&&RemoteModel.same(RemoteModel.queuedEntry(state),id),selected=RemoteModel.showsSetlistSelection(state)&&RemoteModel.same(RemoteModel.id(state,"focusedRegion"),id);
            int top=active?0xff8b2026:queue?0xffa84b13:selected?0xff2457a9:0xff282828,bottom=active?0xff4c171c:queue?0xff572808:selected?0xff152b58:0xff1b1b1b;
            String source=RemoteModel.id(region,"sourceRegionId");if(source.isEmpty())source=id;boolean played=false;for(int i=0;i<RemoteModel.array(state,"playedLiveRegionIDs").length();i++)if(RemoteModel.same(source,RemoteModel.array(state,"playedLiveRegionIDs").optString(i)))played=true;
            if(played&&!active&&!queue&&!selected){top=0xff451010;bottom=0xff300b0b;}
            if(child){paint.setColor(0xb369ed91);paint.setStrokeWidth(dp(1));c.drawLine(dp(8),0,dp(8),drawerContinues?getHeight():getHeight()/2f,paint);c.drawLine(dp(8),getHeight()/2f,dp(19),getHeight()/2f,paint);}
            RectF bounds=new RectF(dp(child?23:3),dp(2),getWidth()-dp(3),getHeight()-dp(2));paint.setColor(Color.WHITE);paint.setShader(new LinearGradient(0,0,0,getHeight(),top,bottom,Shader.TileMode.CLAMP));c.drawRoundRect(bounds,dp(5),dp(5),paint);paint.setShader(null);
            paint.setColor(rgb(region.optLong("color",0x69ed91)));c.drawRect(dp(child?30:10),dp(9),dp(child?33:13),getHeight()-dp(9),paint);
            float x=dp(child?42:22),y=getHeight()/2f;paint.setTypeface(regular);paint.setTextSize(dp(10*listScale()));paint.setColor(SECONDARY);if(index>0){c.drawText(String.format(Locale.US,"%02d",index),x,y+dp(4),paint);x+=dp(27);}
            float right=getWidth()-dp(8);paint.setTypeface(bold);paint.setTextSize(dp(10*listScale()));paint.setColor(TEXT);String dur=RemoteModel.duration(Math.ceil(region.optDouble("end")-(active?state.optDouble("position"):region.optDouble("start"))));float dw=paint.measureText(dur);c.drawText(dur,right-dw,y+dp(4),paint);
            paint.setTextSize(dp(13*listScale()));paint.setTypeface(state.optInt("setlistFontStyle")==0?regular:bold);paint.setColor(rgb(region.optLong("nameColor",child?0xffeb3b:0xffffff)));paint.setStrikeThruText(played);
            String name=region.optString("name");if(!child&&!RemoteModel.children(state,id).isEmpty())name=(expanded.contains(id)?"▾ ":"▸ ")+name;
            float available=right-dw-dp(12)-x;CharSequence text=TextUtils.ellipsize(name,new TextPaint(paint),Math.max(dp(20),available),TextUtils.TruncateAt.END);c.drawText(text.toString(),x,y+dp(4),paint);paint.setStrikeThruText(false);
            if(active||queue){double fraction;if(active){double duration=region.optDouble("end")-region.optDouble("start");fraction=(displayPosition()-region.optDouble("start"))/Math.max(.001,duration);}else{double start=state.optDouble("queueStartedAt",displayPosition()),end=state.optDouble("playbackEnd",start);fraction=(end-displayPosition())/Math.max(.001,end-start);}paint.setColor(active?GREEN:YELLOW);c.drawRect(bounds.left,bounds.bottom-dp(2),bounds.left+(bounds.width()*(float)Math.max(0,Math.min(1,fraction))),bounds.bottom,paint);}
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(selected&&!active&&!queue?1.5f:.5f));paint.setColor(selected&&!active&&!queue?GREEN:0x25ffffff);c.drawRoundRect(bounds,dp(5),dp(5),paint);paint.setStyle(Paint.Style.FILL);
        }
        @Override public boolean onTouchEvent(MotionEvent e){if(e.getActionButton()==MotionEvent.BUTTON_SECONDARY){regionMenu(this,region);return true;}return gestures.onTouchEvent(e);}
    }
    List<String> regionMenuChoices(JSONObject region){
        String id=RemoteModel.id(region,"id");
        if(RemoteModel.children(state,id).isEmpty())return Collections.emptyList();
        return Collections.singletonList(expanded.contains(id)?"Fechar gaveta":"Abrir gaveta");
    }
    void regionMenu(View anchor,JSONObject region){
        if(!remote.mode.equals("director")&&!remote.mode.equals("observer"))return;
        String id=RemoteModel.id(region,"id");List<String> names=regionMenuChoices(region);
        if(names.isEmpty())return;
        menu(anchor,names.toArray(new String[0]),index->{if(!expanded.add(id))expanded.remove(id);structure="";refreshStructure();});
    }
    void editRegion(JSONObject region){LinearLayout body=column(this);EditText name=edit(region.optString("name"),false);body.addView(name);int initial=(int)region.optLong("color",0x69ed91);final int[] color={initial};View sample=new View(this);sample.setBackgroundColor(rgb(initial));body.addView(sample,new LinearLayout.LayoutParams(-1,dp(14)));final SeekBar[] bars=new SeekBar[3];for(int i=0;i<3;i++){final int channel=i;LinearLayout row=row(this);TextView label=label(this,new String[]{"R","G","B"}[i],14,TEXT);row.addView(label,new LinearLayout.LayoutParams(dp(25),dp(40)));SeekBar bar=new SeekBar(this);bars[i]=bar;bar.setMax(255);bar.setProgress((initial>>(16-i*8))&255);bar.setProgressTintList(android.content.res.ColorStateList.valueOf(new int[]{RED,GREEN,BLUE}[i]));row.addView(bar,new LinearLayout.LayoutParams(0,dp(40),1));bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar b,int v,boolean user){if(!user)return;color[0]=(bars[0].getProgress()<<16)|(bars[1].getProgress()<<8)|bars[2].getProgress();sample.setBackgroundColor(rgb(color[0]));}public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}});body.addView(row);}
        LinearLayout colors=row(this);for(int c:new int[]{0xf44336,0xff9800,0xffdc52,0x69ed91,0x2d86ff,0xa128c3,0xffffff}){Button swatch=new Button(this,"",()->{color[0]=c;for(int j=0;j<3;j++)bars[j].setProgress((c>>(16-j*8))&255);sample.setBackgroundColor(rgb(c));});swatch.setBackgroundColor(rgb(c));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(30),1);lp.setMargins(dp(3),dp(8),dp(3),dp(8));colors.addView(swatch,lp);}body.addView(colors);dialog("Editar música",body,"Salvar",()->{String text=name.getText().toString().trim();if(!text.isEmpty())remote.command("editRegion",RemoteModel.id(region,"id"),color[0],text,null,null);});}
    void playlists(){LinearLayout box=column(this);box.setBackground(RemoteWidgets.panel(10));LinearLayout heading=row(this);TextView title=label(this,"☷  Playlists",16,GREEN);pad(title,14,12);heading.addView(title,new LinearLayout.LayoutParams(0,dp(54),1));Button close=new Button(this,"×",()->{});heading.addView(close,new LinearLayout.LayoutParams(dp(40),dp(40)));box.addView(heading);ScrollView scroll=new ScrollView(this);LinearLayout rows=column(this);pad(rows,10,10);scroll.addView(rows);box.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));PopupWindow popup=new PopupWindow(box,Math.min(dp(310),getResources().getDisplayMetrics().widthPixels-dp(24)),dp(Math.min(420,(RemoteModel.array(state,"playlists").length()+1)*47+75)),true);popup.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));popup.setElevation(dp(14));popup.setOutsideTouchable(true);close.setOnClickListener(v->popup.dismiss());List<JSONObject> lists=new ArrayList<>();lists.add(null);lists.addAll(RemoteModel.list(RemoteModel.array(state,"playlists")));for(JSONObject list:lists){String id=RemoteModel.id(list,"id"),name=list==null?"All Regions":list.optString("name");boolean selected=id.equalsIgnoreCase(RemoteModel.id(state,"selectedPlaylist"));Button b=new Button(this,(selected?"▎  ":"    ")+name+(selected?"  ✓":""),()->{popup.dismiss();if(remote.mode.equals("director"))remote.action("selectPlaylist",id.isEmpty()?null:id,0);});b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setTextSize(14);b.style(selected?GREEN:TEXT,selected);b.setOnLongClickListener(v->{if(!id.isEmpty())playlistContext(v,id,name);return true;});rows.addView(b,new LinearLayout.LayoutParams(-1,dp(42)));space(rows,5);}popup.showAsDropDown(playlistButton,0,dp(4));}
    void playlistContext(View v){String id=RemoteModel.id(state,"selectedPlaylist");JSONObject playlist=RemoteModel.find(RemoteModel.array(state,"playlists"),id);if(playlist!=null)playlistContext(v,id,playlist.optString("name"));}
    void playlistContext(View v,String id,String name){if(!remote.mode.equals("director"))return;menu(v,new String[]{"Editar","Apagar playlist"},i->{if(i==0)input("Nome da playlist",name,false,updatedName->remote.command("renamePlaylist",id,0,updatedName,null,null));else confirm("Apagar playlist?","","Apagar",()->remote.action("deletePlaylist",id,0));});}
    void projects(){JSONObject projects=state.optJSONObject("projects");LinearLayout body=column(this);if(projects==null){body.addView(label(this,"Este computador não oferece projetos recentes pelo Remote.",14,SECONDARY));}else{for(JSONObject r:RemoteModel.list(RemoteModel.array(projects,"recent"))){Button b=new Button(this,r.optString("name"),()->{closeDialog();confirm("Abrir outro projeto?","O projeto atual será substituído por "+r.optString("name")+".","Abrir projeto",()->remote.action("openRecentProject",RemoteModel.id(r,"id"),0));});b.setText(r.optString("name"));b.setEnabled(!projects.optBoolean("busy")&&projects.optBoolean("canOpen"));b.setOnLongClickListener(v->{if(projects.optBoolean("canOpenInNewTab"))menu(v,new String[]{"Abrir em nova aba"},i->{closeDialog();remote.action("openRecentProjectInNewTab",RemoteModel.id(r,"id"),0);});return true;});body.addView(b,new LinearLayout.LayoutParams(-1,dp(50)));space(body,6);}String error=projects.optString("error","");if(!error.isEmpty())body.addView(label(this,error,13,RED));}dialog("Projetos recentes — "+remote.peerName,body,"Fechar",()->{});}
    View buildNotices(){
        LinearLayout body=column(this);pad(body,16,12);body.setBackground(RemoteWidgets.panel(0));
        LinearLayout heading=row(this);TextView title=label(this,"Recados",17,TEXT);title.setTypeface(bold);heading.addView(title,new LinearLayout.LayoutParams(0,dp(44),1));noticeRemaining=label(this,"0s",12,SECONDARY);heading.addView(noticeRemaining);Button close=new Button(this,"Fechar",()->{hideKeyboard(body);if(remote.mode.equals("notices"))remote.exit();else choose("setlist");});close.setTextSize(17);close.setBackgroundColor(Color.TRANSPARENT);heading.addView(close,new LinearLayout.LayoutParams(-2,dp(44)));body.addView(heading);space(body,8);
        LinearLayout actions=row(this);noticeSend=new Button(this,"Enviar",()->remote.command("noticeSend",null,noticeSlot,noticeEditor.getText().toString(),null,null));noticeSend.solid(GREEN);noticeSend.leadingIcon("send");noticeClear=new Button(this,"Retirar",()->remote.action("noticeClear"));noticePin=new Button(this,"Fixar",()->{JSONObject n=state.optJSONObject("notices");remote.action("noticePin",null,n!=null&&n.optBoolean("pinned")?0:1);});
        noticePin.leadingIcon("pin");for(Button button:new Button[]{noticeSend,noticeClear,noticePin}){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,dp(44));lp.rightMargin=dp(8);actions.addView(button,lp);}body.addView(actions);space(body,60);
        LinearLayout slots=row(this);slots.setBackground(surface(0xff454548,0xff454548,Color.TRANSPARENT,16));
        for(int i=0;i<4;i++){final int slot=i-1;Button button=new Button(this,i==0?"Global":"Recado "+i,()->selectNoticeSlot(slot));button.setTextSize(13);button.setSingleLine();pad(button,2,0);noticeSlots[i]=button;slots.addView(button,new LinearLayout.LayoutParams(0,dp(32),1));}body.addView(slots);space(body,8);
        noticeEditor=edit(globalNoticeDraft,false);noticeEditor.setSingleLine(false);noticeEditor.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);noticeEditor.setGravity(Gravity.TOP|Gravity.START);noticeEditor.setSelectAllOnFocus(false);noticeEditor.setFilters(new InputFilter[]{(source,start,end,dest,dstart,dend)->{
            String before=dest.subSequence(0,dstart).toString(),after=dest.subSequence(dend,dest.length()).toString(),insert=source.subSequence(start,end).toString();int limit=insert.length();
            while(limit>0&&(before+insert.substring(0,limit)+after).codePointCount(0,(before+insert.substring(0,limit)+after).length())>500)limit=insert.offsetByCodePoints(limit,-1);
            return limit==insert.length()?null:insert.substring(0,limit);
        }});noticeEditor.setBackground(display(6));body.addView(noticeEditor,new LinearLayout.LayoutParams(-1,dp(160)));space(body,8);
        LinearLayout detail=row(this);noticeCount=label(this,"0 / 500",12,SECONDARY);detail.addView(noticeCount,new LinearLayout.LayoutParams(0,dp(24),1));noticeSave=new Button(this,"Salvar recado",()->remote.command("noticeSaveTemplate",null,noticeSlot,noticeEditor.getText().toString(),null,null));noticeSave.setTextColor(GREEN);noticeSave.setBackgroundColor(Color.TRANSPARENT);detail.addView(noticeSave);body.addView(detail);space(body,12);
        LinearLayout destinations=row(this);destinations.setGravity(Gravity.CENTER);for(int i=0;i<2;i++){final int index=i+1;Button button=new Button(this,"TP-"+index,()->{JSONObject n=state.optJSONObject("notices");remote.command("noticeDestination",null,index,null,null,n==null||!n.optBoolean("window"+index));});button.setTextSize(17);noticeDestinations[i]=button;LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(62),dp(34));lp.setMargins(dp(8),0,dp(8),0);destinations.addView(button,lp);}body.addView(destinations);
        noticeEditor.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence t,int a,int c,int f){}public void onTextChanged(CharSequence t,int a,int b,int c){if(noticeSlot<0)globalNoticeDraft=t.toString();refreshNotices();}public void afterTextChanged(Editable e){}});
        noticeSlot=-1;refreshNotices();ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(body);return scroll;
    }
    void selectNoticeSlot(int slot){noticeSlot=slot;JSONObject notices=state.optJSONObject("notices");noticeEditor.setText(slot<0?globalNoticeDraft:RemoteModel.array(notices,"templates").optString(slot,""));noticeEditor.setSelection(noticeEditor.length());refreshNotices();}
    void refreshNotices(){
        if(noticeEditor==null)return;JSONObject notices=state.optJSONObject("notices");boolean pinned=notices!=null&&notices.optBoolean("pinned");noticeRemaining.setText(pinned?"∞":(notices==null?0:notices.optInt("remaining"))+"s");
        String draft=noticeEditor.getText().toString();noticeCount.setText(draft.codePointCount(0,draft.length())+" / 500");noticeSend.setEnabled(!draft.trim().isEmpty()||noticeSlot>=0&&RemoteModel.array(notices,"imageSlots").optBoolean(noticeSlot));noticeSend.setAlpha(1);noticeClear.setEnabled(notices!=null&&notices.optBoolean("active"));noticePin.setTextColor(pinned?YELLOW:TEXT);noticePin.setBackground(surface(0xff4d4d4d,0xff4d4d4d,Color.TRANSPARENT,6));noticeSave.setVisibility(noticeSlot>=0?View.VISIBLE:View.GONE);
        for(int i=0;i<4;i++)noticeSlots[i].setBackground(surface(i==noticeSlot+1?0xff77777b:0xff454548,i==noticeSlot+1?0xff77777b:0xff454548,Color.TRANSPARENT,16));
        for(int i=0;i<2;i++){boolean on=notices!=null&&notices.optBoolean("window"+(i+1));noticeDestinations[i].setBackground(surface(on?0xff37513f:0xff454548,on?0xff37513f:0xff454548,Color.TRANSPARENT,18));}
    }
    void timer(){RemoteTimerPanel.show(this);}
    void settings(){showSettings(false);}
    void showSettings(boolean actions){
        closeDialog();Dialog d=new RemoteKeyboard.KeyboardDialog(this);activeDialog=d;d.requestWindowFeature(Window.FEATURE_NO_TITLE);LinearLayout body=column(this);pad(body,20,20);body.setBackground(RemoteWidgets.panel(16));LinearLayout heading=row(this);TextView name=label(this,"Configurações",17,TEXT);name.setTypeface(bold);heading.addView(name,new LinearLayout.LayoutParams(0,dp(32),1));Button x=new Button(this,"×",d::dismiss);x.setBackgroundColor(Color.TRANSPARENT);heading.addView(x,new LinearLayout.LayoutParams(dp(28),dp(28)));body.addView(heading);space(body,20);
        if(!remote.mode.equals("observer")){LinearLayout tabs=row(this);Button general=new Button(this,"General",()->showSettings(false)),mappings=new Button(this,"Actions",()->showSettings(true));general.style(TEXT,!actions);mappings.style(TEXT,actions);tabs.addView(general,new LinearLayout.LayoutParams(0,dp(32),1));tabs.addView(mappings,new LinearLayout.LayoutParams(0,dp(32),1));body.addView(tabs);space(body,20);}
        if(actions){ScrollView scroll=new ScrollView(this);LinearLayout list=column(this);scroll.addView(list);body.addView(scroll,new LinearLayout.LayoutParams(-1,Math.min(dp(430),(int)(getResources().getDisplayMetrics().heightPixels*.58))));for(String action:RemoteMidi.ACTIONS){LinearLayout card=column(this);pad(card,10,10);card.setBackground(surface(0xff1d1d1d,0xff131313,0x19ffffff,6));card.addView(label(this,RemoteMidi.title(action),14,TEXT));TextView binding=label(this,midi.label(action),12,SECONDARY);card.addView(binding);LinearLayout buttons=row(this);Button learn=new Button(this,"Learn MIDI",()->{midi.learning=action.equals(midi.learning)?null:action;binding.setText(action.equals(midi.learning)?RemoteText.ui("Waiting for MIDI…"):midi.label(action));});buttons.addView(learn,new LinearLayout.LayoutParams(0,dp(34),1));Button clear=new Button(this,"Clear",()->{midi.clear(action);binding.setText("—");});buttons.addView(clear,new LinearLayout.LayoutParams(0,dp(34),1));card.addView(buttons);list.addView(card);space(list,12);}}
        else{body.addView(label(this,"Language",13,TEXT));space(body,10);body.addView(languageSelector());if(remote.mode.equals("observer")){space(body,15);body.addView(label(this,"Escala do setlist",14,TEXT));Fader slider=new Fader(this,true,value->{getPreferences(0).edit().putFloat("observerScale",(float)(1+(value+1)*.75)).apply();structure="";refreshStructure();});slider.value=(listScale()-1)/.75-1;body.addView(slider,new LinearLayout.LayoutParams(-1,dp(42)));}}
        d.setContentView(body);d.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));d.setOnDismissListener(v->{midi.learning=null;if(activeDialog==d)activeDialog=null;});d.show();d.getWindow().setLayout(Math.min(dp(320),getResources().getDisplayMetrics().widthPixels-dp(24)),-2);
    }
    void midiAction(String action){if(!remote.mode.equals("director"))return;if(action.startsWith("learn:")){onMessage("Mapeamento MIDI salvo");return;}switch(action){case "setlistUp":case "setlistDown":navigateSong(action.endsWith("Up")?-1:1);break;case "partsUp":case "partsDown":navigatePart(action.endsWith("Up")?-1:1);break;case "toggleParts":choose("parts");break;case "playStop":remote.action(state.optBoolean("playing")?"stop":"play");break;case "repeatPlayback":remote.action("toggleLoop");break;case "bypass":remote.action("toggleMultiLoopBypass");break;case "playlistUp":case "playlistDown":List<JSONObject> lists=RemoteModel.list(RemoteModel.array(state,"playlists"));int at=-1;for(int i=0;i<lists.size();i++)if(RemoteModel.same(RemoteModel.id(lists.get(i),"id"),RemoteModel.id(state,"selectedPlaylist")))at=i;at=Math.max(-1,Math.min(lists.size()-1,at+(action.endsWith("Up")?-1:1)));remote.action("selectPlaylist",at<0?null:RemoteModel.id(lists.get(at),"id"),0);break;default:remote.action(action);}}
    void navigateSong(int delta){List<JSONObject> songs=RemoteModel.list(RemoteModel.array(state,"regions"));if(songs.isEmpty())return;int at=-1;String id=RemoteModel.id(state,"focusedRegion");for(int i=0;i<songs.size();i++)if(RemoteModel.same(RemoteModel.id(songs.get(i),"id"),id))at=i;at=Math.max(0,Math.min(songs.size()-1,at+delta));remote.action("selectRegion",RemoteModel.id(songs.get(at),"id"),0);}
    void navigatePart(int delta){List<JSONObject> markers=new ArrayList<>();JSONObject r=RemoteModel.gridRegion(state);for(JSONObject m:RemoteModel.list(RemoteModel.array(state,"markers")))if(m.optBoolean("section")&&(r==null||(m.optDouble("position")>=r.optDouble("start")&&m.optDouble("position")<r.optDouble("end"))))markers.add(m);if(markers.isEmpty())return;String current=RemoteModel.id(state.optJSONObject("sectionPlayback"),"queuedMarker");int at=-1;for(int i=0;i<markers.size();i++)if(RemoteModel.same(RemoteModel.id(markers.get(i),"id"),current))at=i;at=Math.max(0,Math.min(markers.size()-1,at+delta));remote.action("queueSection",RemoteModel.id(markers.get(at),"id"),0);}
    @Override public boolean onKeyDown(int code,KeyEvent e){if(getCurrentFocus() instanceof EditText||state==null||!remote.mode.equals("director"))return super.onKeyDown(code,e);if(e.getRepeatCount()>0)return true;if(code==KeyEvent.KEYCODE_SPACE){remote.action(state.optBoolean("playing")?"stop":"play");return true;}if(code==KeyEvent.KEYCODE_TAB){if(!panel.equals("setlist"))choose("setlist");if(search!=null)search.setVisibility(search.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE);return true;}if(code==KeyEvent.KEYCODE_DPAD_UP||code==KeyEvent.KEYCODE_DPAD_DOWN){int delta=code==KeyEvent.KEYCODE_DPAD_UP?-1:1;if(e.isCtrlPressed()||e.isMetaPressed())midiAction(delta<0?"playlistUp":"playlistDown");else if(panel.equals("parts"))navigatePart(delta);else navigateSong(delta);return true;}return super.onKeyDown(code,e);}
    View languageSelector(){LinearLayout languages=row(this);languages.setBackground(surface(0xff454548,0xff454548,Color.TRANSPARENT,8));Button en=new Button(this,"English",()->changeLanguage("en")),pt=new Button(this,"Português",()->changeLanguage("pt-BR"));en.setBackground(surface(RemoteText.language.equals("en")?0xff77777b:0xff454548,RemoteText.language.equals("en")?0xff77777b:0xff454548,Color.TRANSPARENT,8));pt.setBackground(surface(RemoteText.language.equals("pt-BR")?0xff77777b:0xff454548,RemoteText.language.equals("pt-BR")?0xff77777b:0xff454548,Color.TRANSPARENT,8));languages.addView(en,new LinearLayout.LayoutParams(0,dp(36),1));languages.addView(pt,new LinearLayout.LayoutParams(0,dp(36),1));return languages;}
    void changeLanguage(String language){RemoteText.choose(this,language);closeDialog();if(screen.equals("workspace"))buildWorkspace();else if(screen.equals("welcome"))showWelcome();else showHome();}
    void input(String title,String value,boolean number,Consumer<String> save){EditText field=edit(value,number);dialog(title,field,"Aplicar",()->save.accept(field.getText().toString()));field.requestFocus();field.selectAll();handler.postDelayed(()->{if(field.isAttachedToWindow()&&field.hasFocus())((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(field,InputMethodManager.SHOW_IMPLICIT);},180);}
    EditText edit(String value,boolean number){EditText e=new EditText(this);e.setText(value);e.setTypeface(regular);e.setTextColor(TEXT);e.setHintTextColor(SECONDARY);e.setTextSize(18);e.setSingleLine();e.setSelectAllOnFocus(true);pad(e,10,8);e.setBackground(surface(0xff1d1d1d,0xff171717,0xff548942,7));if(number)e.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);return e;}
    void confirm(String title,String message,String yes,Runnable run){TextView text=label(this,message,16,TEXT);dialog(title,text,yes,run);}
    void dialog(String title,View body,String positive,Runnable action){
        closeDialog();Dialog d=new RemoteKeyboard.KeyboardDialog(this);activeDialog=d;d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        // Measure short confirmations at their natural height. The weighted
        // scroll area shrinks only when content or the keyboard needs room.
        LinearLayout box=new LinearLayout(this){@Override protected void onMeasure(int widthSpec,int heightSpec){
            int limit=Math.min(dp(520),Math.round(getResources().getDisplayMetrics().heightPixels*.72f));
            if(MeasureSpec.getMode(heightSpec)!=MeasureSpec.UNSPECIFIED)limit=Math.min(limit,MeasureSpec.getSize(heightSpec));
            super.onMeasure(widthSpec,MeasureSpec.makeMeasureSpec(limit,MeasureSpec.AT_MOST));
        }};
        box.setOrientation(LinearLayout.VERTICAL);pad(box,18,18);box.setBackground(surface(0xff343434,0xff222222,0xff686868,20));
        TextView heading=label(this,title,18,TEXT);heading.setTypeface(bold);box.addView(heading,new LinearLayout.LayoutParams(-1,dp(42)));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.addView(body);box.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout buttons=row(this);Button cancel=new Button(this,"Cancelar",d::dismiss);Button ok=new Button(this,positive,()->{hideKeyboard(body);d.dismiss();action.run();});ok.style(GREEN,true);
        buttons.addView(cancel,new LinearLayout.LayoutParams(0,dp(40),1));View gap=new View(this);buttons.addView(gap,new LinearLayout.LayoutParams(dp(12),1));buttons.addView(ok,new LinearLayout.LayoutParams(0,dp(40),1));box.addView(buttons);space(box,2);
        d.setContentView(box);Window window=d.getWindow();if(window!=null){window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);window.setDimAmount(.35f);}
        d.setOnDismissListener(ignored->{hideKeyboard(body);if(activeDialog==d)activeDialog=null;});d.show();
        if(window!=null)window.setLayout(Math.min(dp(520),getResources().getDisplayMetrics().widthPixels-dp(24)),ViewGroup.LayoutParams.WRAP_CONTENT);
    }
    void closeDialog(){if(activeDialog!=null){activeDialog.dismiss();activeDialog=null;}}
    void hideKeyboard(View v){((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(v.getWindowToken(),0);v.clearFocus();}
    void menu(View anchor,String[] choices,Consumer<Integer> select){LinearLayout list=column(this);pad(list,8,8);list.setBackground(surface(0xff3b3b3b,0xff2b2b2b,0xff666666,14));PopupWindow popup=new PopupWindow(list,Math.min(dp(290),getResources().getDisplayMetrics().widthPixels-dp(24)),-2,true);popup.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));popup.setElevation(dp(14));for(int i=0;i<choices.length;i++){final int index=i;Button b=new Button(this,choices[i],()->{popup.dismiss();select.accept(index);});b.setGravity(Gravity.CENTER_VERTICAL|Gravity.LEFT);b.setTextSize(16);b.setBackgroundColor(Color.TRANSPARENT);list.addView(b,new LinearLayout.LayoutParams(-1,dp(44)));}popup.setOutsideTouchable(true);popup.showAsDropDown(anchor,0,dp(4));}
}
