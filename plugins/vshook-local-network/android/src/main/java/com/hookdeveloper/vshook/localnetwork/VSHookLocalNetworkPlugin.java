package com.hookdeveloper.vshook.localnetwork;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.Set;

@CapacitorPlugin(name = "VSHookLocalNetwork")
public class VSHookLocalNetworkPlugin extends Plugin {

    @PluginMethod
    public void getAddresses(PluginCall call) {
        Set<String> found = new LinkedHashSet<>();

        // A rede realmente usada pelo aparelho vem primeiro.
        try {
            ConnectivityManager manager =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network activeNetwork = manager != null ? manager.getActiveNetwork() : null;
            LinkProperties properties =
                manager != null && activeNetwork != null ? manager.getLinkProperties(activeNetwork) : null;
            if (properties != null) {
                for (LinkAddress linkAddress : properties.getLinkAddresses()) {
                    addPrivateIpv4(found, linkAddress.getAddress());
                }
            }
        } catch (Exception ignored) {
        }

        // Reserva para aparelhos/ROMs que não entregam LinkProperties completas
        // e para Ethernet/Wi-Fi por baixo de uma VPN.
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback() || network.isVirtual()) continue;

                Enumeration<InetAddress> addresses = network.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    addPrivateIpv4(found, addresses.nextElement());
                }
            }
        } catch (Exception ignored) {
        }

        JSArray addresses = new JSArray();
        for (String address : found) addresses.put(address);
        JSObject result = new JSObject();
        result.put("addresses", addresses);
        call.resolve(result);
    }

    private void addPrivateIpv4(Set<String> found, InetAddress address) {
        if (!(address instanceof Inet4Address)) return;
        if (address.isLoopbackAddress() || !address.isSiteLocalAddress()) return;
        found.add(address.getHostAddress());
    }
}
