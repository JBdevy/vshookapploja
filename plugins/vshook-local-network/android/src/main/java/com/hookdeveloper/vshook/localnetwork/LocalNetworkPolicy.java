package com.hookdeveloper.vshook.localnetwork;

import java.util.Locale;

/** Filtro de interfaces locais, incluindo bridges e SoftAP do hotspot. */
final class LocalNetworkPolicy {
    private LocalNetworkPolicy() {}

    static boolean isLocalInterface(String name, boolean pointToPoint) {
        if (name == null || name.isEmpty() || pointToPoint) return false;
        String normalized = name.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("v4-")) normalized = normalized.substring(3);
        String[] excluded = {
            "lo", "rmnet", "ccmni", "pdp", "wwan", "cell", "rev_rmnet",
            "tun", "tap", "utun", "ipsec", "ppp", "wg", "clat", "dummy",
            "p2p", "aware", "nan"
        };
        for (String prefix : excluded) {
            if (normalized.startsWith(prefix)) return false;
        }
        return true;
    }
}
