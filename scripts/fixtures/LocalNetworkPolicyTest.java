package com.hookdeveloper.vshook.localnetwork;

public final class LocalNetworkPolicyTest {
    private static void check(String name, boolean pointToPoint, boolean expected) {
        if (LocalNetworkPolicy.isLocalInterface(name, pointToPoint) != expected) {
            throw new AssertionError("Interface " + name + ", pointToPoint=" + pointToPoint);
        }
    }

    public static void main(String[] args) {
        for (String name : new String[] {"wlan0", "wlan1", "ap0", "swlan0", "softap0", "br0", "bridge0", "eth0", "rndis0", "bnep0"}) {
            check(name, false, true);
        }
        for (String name : new String[] {"lo", "rmnet_data0", "v4-rmnet_data0", "rev_rmnet0", "ccmni0", "pdp0", "wwan0", "tun0", "tap0", "ipsec0", "ppp0", "wg0", "clat4", "p2p0", "aware0", "nan0"}) {
            check(name, false, false);
        }
        check("wlan0", true, false);
        check("unknownVpn", true, false);
        check(null, false, false);
        check("", false, false);
        System.out.println("LOCAL_NETWORK_NATIVE_POLICY_OK: hotspot/bridge incluídos; celular/VPN excluídos.");
    }
}
