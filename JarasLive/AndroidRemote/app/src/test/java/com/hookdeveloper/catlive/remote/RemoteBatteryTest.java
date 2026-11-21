package com.hookdeveloper.catlive.remote;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public final class RemoteBatteryTest {
    @Test public void reportsFivePointThresholdsThenEachPointBelowTen() {
        RemoteBattery battery = new RemoteBattery();
        assertEquals(-1, battery.warning(21, 0));
        assertEquals(20, battery.warning(20, 60_000));
        assertEquals(-1, battery.warning(18, 120_000));
        assertEquals(15, battery.warning(15, 180_000));
        assertEquals(10, battery.warning(10, 240_000));
        assertEquals(-1, battery.warning(9, 249_000));
        assertEquals(-1, battery.warning(8, 250_000));
        assertEquals(8, battery.warning(8, 300_000));
        assertEquals(-1, battery.warning(8, 360_000));
        battery.reset();
        assertEquals(8, battery.warning(8, 420_000));
    }
}
