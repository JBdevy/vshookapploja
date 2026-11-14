package com.hookdeveloper.catlive.remote;
import org.junit.Test;
import static org.junit.Assert.*;
public class LiveTempoEditGateTest {
 @Test public void noQueueAndNoDeadlineExtension(){
  LiveTempoEditGate gate=new LiveTempoEditGate();
  assertTrue(gate.accept(true,1000));
  for(long now:new long[]{1001,1200,1499})assertFalse(gate.accept(true,now));
  assertTrue(gate.accept(true,1500));
  assertTrue(gate.accept(false,1501));assertTrue(gate.accept(false,1501));
  assertTrue(gate.accept(true,1501));
 }
}
