package com.hookdeveloper.catlive.remote;
import android.graphics.*;import android.text.Layout;import android.view.View;import java.nio.charset.StandardCharsets;import java.util.*;import org.json.*;import org.junit.*;import static org.junit.Assert.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class) @Config(sdk=31,qualifiers="w393dp-h851dp-port")
public class RemoteTeleprompterTest {
 ActivityController<MainActivity> controller;MainActivity app;JSONObject settings,tp;Probe view;
 @Before public void start()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();app.entering=true;app.remote.connected=true;app.remote.mode="director";app.remote.state=new JSONObject(new String(getClass().getResourceAsStream("/remote-state.json").readAllBytes(),StandardCharsets.UTF_8));app.onChanged();settings=new JSONObject().put("clockEnabled",false).put("localClockEnabled",false).put("windowBorderEnabled",false).put("textCase","original");tp=new JSONObject().put("index",1).put("text","Letra recebida").put("chords","C G Am").put("song","Música atual").put("queued","Próxima música").put("progress",.6).put("settings",settings).put("style",new JSONObject());app.state.put("teleprompters",new JSONArray().put(tp));view=new Probe(1);view.layout(0,0,393,700);}
 @Test public void coloredWordsPreserveUnicodeAndFallBackOnInvalidPayload()throws Exception{
  view.settings=settings;view.style=new JSONObject();settings.put("textCase","uppercase");
  tp.put("textStyled","\u001eCatLiveText/1\n"+new JSONArray().put(new JSONObject().put("text","olá ")).put(new JSONObject().put("text","straße 🎵").put("color",0xff4040)));
  CharSequence rendered=view.styledText(tp,"text");assertEquals("OLÁ STRASSE 🎵",rendered.toString());
  android.text.Spanned spans=(android.text.Spanned)rendered;android.text.style.ForegroundColorSpan[] colors=spans.getSpans(0,spans.length(),android.text.style.ForegroundColorSpan.class);
  assertEquals(1,colors.length);assertEquals(4,spans.getSpanStart(colors[0]));assertEquals(rendered.length(),spans.getSpanEnd(colors[0]));assertEquals(0xffff4040,colors[0].getForegroundColor());
  view.render(new RecordingCanvas());assertTrue(view.find("STRASSE").styled instanceof android.text.Spanned);
  tp.put("textStyled","\u001eCatLiveText/1\n[{\"text\":\"bad\",\"color\":-1}]");assertEquals("LETRA RECEBIDA",view.styledText(tp,"text").toString());
  tp.remove("textStyled");assertEquals("LETRA RECEBIDA",view.styledText(tp,"text").toString());
  tp.put("chordsStyled","\u001eCatLiveText/1\n[{\"text\":\"Am G\",\"color\":5894}]");assertEquals("AM G",view.styledText(tp,"chords").toString());
 }
 @Test public void twoColumnsKeepTheirTextAndFollowDisplayOrientation()throws Exception{
  String first="\u001eCatLiveText/1\n"+new JSONArray().put(new JSONObject().put("text","Primeira").put("color",0xff4040));
  tp.put("textStyled","\u001eCatLiveColumns/1\n"+new JSONArray().put(first).put("Segunda"));
  assertArrayEquals(new String[]{first,"Segunda"},RemoteTeleprompter.lyricColumns(tp));
  view.render(new RecordingCanvas());assertTrue(view.find("Primeira").area.bottom<view.find("Segunda").area.top);
  assertTrue(view.find("Primeira").styled instanceof android.text.Spanned);
  view.layout(0,0,900,500);view.render(new RecordingCanvas());assertTrue(view.find("Primeira").area.right<view.find("Segunda").area.left);
  tp.put("textStyled","\u001eCatLiveColumns/1\n"+new JSONArray().put("Primeira").put(""));view.render(new RecordingCanvas());assertArrayEquals(new String[]{"Primeira",""},RemoteTeleprompter.lyricColumns(tp));
 }
 @After public void close(){controller.pause().stop().destroy();}
 static class Text {CharSequence styled;String value;RectF area;float font;int color;boolean strike;Text(String v,RectF a,float f,int c,boolean s){value=v;area=new RectF(a);font=f;color=c;strike=s;}}
 class Probe extends RemoteTeleprompter {List<RectF> clockBoxes=new ArrayList<>();List<Float> clockWidths=new ArrayList<>();void clockText(Canvas c,String value,RectF area,float font,int color,boolean border,int borderColor,float width,boolean timer){clockBoxes.add(new RectF(area));clockWidths.add(width);super.clockText(c,value,area,font,color,border,borderColor,width,timer);}List<Text> drawn=new ArrayList<>();List<Integer> borders=new ArrayList<>();Probe(int index){super(RemoteTeleprompterTest.this.app,RemoteTeleprompterTest.this.app,index);}void drawText(Canvas c,CharSequence value,RectF a,float size,int color,boolean strong,Layout.Alignment align,int max){Text entry=new Text(value.toString(),a,size,color,text.isStrikeThruText());entry.styled=value;drawn.add(entry);}void stroke(Canvas c,RectF r,int color,float size){borders.add(color);}void render(Canvas canvas){drawn.clear();borders.clear();onDraw(canvas);}Text find(String value){for(Text t:drawn)if(t.value.contains(value))return t;return null;}}
 static class RecordingCanvas extends Canvas {int images;List<String> struck=new ArrayList<>();@Override public void drawBitmap(Bitmap b,Rect src,RectF dst,Paint p){images++;}@Override public void drawText(String value,float x,float y,Paint p){if(p.isStrikeThruText())struck.add(value);}}
 JSONObject row(String name,boolean played)throws Exception{return new JSONObject().put("id",UUID.randomUUID().toString()).put("name",name).put("duration",30).put("color",0x123456).put("liveExecuted",played);}
 JSONObject block(JSONObject...rows)throws Exception{JSONArray list=new JSONArray();for(JSONObject row:rows)list.put(row);return new JSONObject().put("id",UUID.randomUUID().toString()).put("name","Bloco").put("nameColor",0xabcdef).put("color",0x112233).put("rows",list);}
 @Test public void clocksHaveEqualBordersAndInsetFromWindowInBothModes()throws Exception{
  settings.put("clockEnabled",true).put("localClockEnabled",true).put("clockPosition","left-top").put("windowBorderEnabled",true);
  for(boolean full:new boolean[]{false,true}){app.fullscreen=full;view.clockBoxes.clear();view.clockWidths.clear();view.render(new RecordingCanvas());assertEquals(2,view.clockBoxes.size());assertEquals(view.clockWidths.get(0),view.clockWidths.get(1));for(RectF box:view.clockBoxes)assertTrue(box.top>=RemoteWidgets.dp(6));}
 }
 @Test public void previewUsesLiveStrikeAndUniformTypeAndHidesLyricsMediaNoticesAndGeneralProgress()throws Exception{
  JSONObject done=row("Executada",true),playing=row("Tocando",false).put("playing",true).put("playbackProgress",.6),queued=row("Fila",false).put("queued",true).put("playbackProgress",.4);
  tp.put("preview",true).put("imageID",UUID.randomUUID().toString()).put("blocks",new JSONArray().put(block(done,playing,queued)));
  settings.put("progressEnabled",true);app.state.getJSONObject("notices").put("active",true).put("message","Não mostrar");
  view.render(new RecordingCanvas());assertNull(view.find("Letra"));assertNull(view.find("Não mostrar"));assertTrue(app.remote.requestedImages.isEmpty());assertTrue(view.find("Executada").strike);assertEquals(0xffff4040,view.find("Executada").color);assertFalse(view.find("Tocando").strike);assertEquals(Color.WHITE,view.find("Tocando").color);assertEquals(0xffabcdef,view.find("Bloco").color);assertEquals(view.find("Bloco").font,view.find("Fila").font,0);assertTrue(view.decorations(tp,true).isEmpty());assertTrue(view.decorations(tp,false).isEmpty());
  done.put("liveExecuted",false);view.render(new RecordingCanvas());assertFalse(view.find("Executada").strike);assertEquals(0xff123456,view.find("Executada").color);
 }
 @Test public void liveStrikeFollowsHostAndSourceRegionForPlaylistCopies()throws Exception{
  JSONObject region=app.state.getJSONArray("regions").getJSONObject(0);String source=region.getString("id");region.put("sourceRegionId",source).put("id",UUID.randomUUID().toString());
  MainActivity.SongRow row=app.new SongRow(region,1,false);row.layout(0,0,393,40);app.state.put("playedLiveRegionIDs",new JSONArray().put(source.toUpperCase(Locale.ROOT)));RecordingCanvas canvas=new RecordingCanvas();row.onDraw(canvas);assertTrue(canvas.struck.contains("Abertura"));
  app.state.put("playedLiveRegionIDs",new JSONArray());canvas=new RecordingCanvas();row.onDraw(canvas);assertTrue(canvas.struck.isEmpty());
 }
 @Test public void imageNoticesRequestAndDrawTheImageOnlyOnTheirDestination()throws Exception{
  String id=UUID.randomUUID().toString();app.state.getJSONObject("notices").put("active",true).put("imageID",id).put("message","Fallback não deve aparecer").put("window1",true).put("window2",false);
  RecordingCanvas canvas=new RecordingCanvas();view.render(canvas);assertTrue(app.remote.requestedImages.contains(id));assertNull(view.find("Fallback"));assertEquals(0,canvas.images);
  app.remote.images.put(id,Bitmap.createBitmap(8,8,Bitmap.Config.ARGB_8888));view.render(canvas);assertEquals(1,canvas.images);
  Probe second=new Probe(2);second.layout(0,0,393,700);JSONObject other=new JSONObject(tp.toString()).put("index",2);app.state.getJSONArray("teleprompters").put(other);second.render(canvas);assertEquals(1,canvas.images);
  settings.put("clearMode",true);view.render(canvas);assertEquals(1,canvas.images);assertTrue(view.drawn.isEmpty());
 }
 @Test public void bottomDecorationsKeepTheSameOrderAsIphone()throws Exception{
  settings.put("clockEnabled",true).put("clockPosition","left-bottom").put("localClockEnabled",true).put("songNameEnabled",true).put("songNamePosition","bottom").put("queueNamePosition","bottom").put("chordPosition","bottom").put("progressEnabled",true).put("progressPosition","bottom");view.render(new RecordingCanvas());
  List<RemoteTeleprompter.Decoration> list=view.decorations(tp,false);assertEquals(Arrays.asList("clock","song","queued","chords","progress"),Arrays.asList(list.get(0).kind,list.get(1).kind,list.get(2).kind,list.get(3).kind,list.get(4).kind));
  assertTrue(view.find("Música atual").area.top<view.find("Próxima música").area.top);assertTrue(view.find("Próxima música").area.top<view.find("C G Am").area.top);
 }
 @Test public void clocksShareScaleAndSingleClockIsCentered()throws Exception{
  settings.put("clockEnabled",true).put("localClockEnabled",true).put("clockPosition","left-top");view.render(new RecordingCanvas());float before=view.timerFontSize();settings.put("clockScale",150);view.render(new RecordingCanvas());assertEquals(before*1.5,view.timerFontSize(),1);
  List<RemoteTeleprompter.Decoration> top=view.decorations(tp,true);assertEquals("clock",top.get(0).kind);assertTrue(top.get(0).clock&&top.get(0).local);
  settings.put("clockEnabled",false);view.render(new RecordingCanvas());Text clock=view.drawn.get(0);assertEquals(393/2f,clock.area.centerX(),1);
 }
 @Test public void rgbBordersAndFontSettingsAreApplied()throws Exception{
  settings.put("windowBorderEnabled",true).put("rgbWindowBorderEnabled",true).put("rgbTextBoxBorderEnabled",true).put("fontFamily","mono");view.render(new RecordingCanvas());assertTrue(view.borders.size()>=2);float[] hsv=new float[3];Color.colorToHSV(view.borders.get(view.borders.size()-1),hsv);assertEquals(.9f,hsv[1],.01f);assertEquals(1,hsv[2],.01f);assertEquals(Typeface.create("monospace",Typeface.BOLD),view.fontFace);
 }
 @Test public void previewPageAndTpSwitchReplaceContentWithoutLeakingOldRows()throws Exception{
  tp.put("preview",true).put("blocks",new JSONArray().put(block(row("Página um",false))));view.render(new RecordingCanvas());assertNotNull(view.find("Página um"));
  tp.put("blocks",new JSONArray().put(block(row("Página dois",false))));view.render(new RecordingCanvas());assertNull(view.find("Página um"));assertNotNull(view.find("Página dois"));
  JSONObject second=new JSONObject(tp.toString()).put("index",2).put("preview",false).put("text","Letra TP2");app.state.getJSONArray("teleprompters").put(second);Probe view2=new Probe(2);view2.layout(0,0,393,700);view2.render(new RecordingCanvas());assertNotNull(view2.find("Letra TP2"));assertNull(view2.find("Página dois"));
 }
 @Test public void narrowTimerKeepsAllDigitsInsteadOfEllipsizing(){
  view.fontFace=Typeface.create("sans-serif",Typeface.BOLD);String value="00 : 00 : 00";
  for(float width:new float[]{50.2f,116.3f,183.6f,250.9f}){
   float size=view.fit(value,width,80,60);view.text.setTypeface(view.fontFace);view.text.setTextSize(size);
   android.text.StaticLayout layout=android.text.StaticLayout.Builder.obtain(value,0,value.length(),view.text,(int)width).setMaxLines(1).setEllipsize(android.text.TextUtils.TruncateAt.END).build();
   assertEquals("timer at width "+width,0,layout.getEllipsisCount(0));
  }
 }

 @Test public void centeredTimerKeepsLocalClockScaleIndependentOnPhoneAndTablet()throws Exception{
  settings.put("clockEnabled",true).put("localClockEnabled",true);
  for(String position:new String[]{"center-top","center-bottom"})for(int width:new int[]{393,1024}){
   view.layout(0,0,width,900);settings.put("clockPosition",position).put("clockScale",100).put("localClockScale",100);view.render(new RecordingCanvas());
   float local=view.localFontForPosition(position,true),timer=view.timerFontSize();assertTrue(local<timer);
   settings.put("clockScale",180);view.render(new RecordingCanvas());assertEquals(local,view.localFontForPosition(position,true),0);assertTrue(view.timerFontSize()>timer);
   settings.put("localClockScale",130);view.render(new RecordingCanvas());assertEquals(local*1.3,view.localFontForPosition(position,true),.01);
  }
  settings.put("clockPosition","left-top");view.render(new RecordingCanvas());assertEquals(view.timerFontSize(),view.localFontForPosition("left-top",true),0);
 }
}
