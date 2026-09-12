package com.hookdeveloper.vshook.localnetwork;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "VSHookLocalNetwork")
public class VSHookLocalNetworkPlugin extends Plugin {

    @PluginMethod
    public void getFirebaseConfiguration(PluginCall call) {
        try {
            FirebaseApp app = FirebaseApp.getInstance();
            JSObject result = new JSObject();
            result.put("projectId", app.getOptions().getProjectId());
            result.put("senderId", app.getOptions().getGcmSenderId());
            result.put("applicationId", app.getOptions().getApplicationId());
            result.put("packageName", getContext().getPackageName());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Firebase Android não inicializado.", error);
        }
    }

    @PluginMethod
    public void renewFirebasePushToken(PluginCall call) {
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(false);
        messaging.deleteToken().addOnCompleteListener(deleteTask -> {
            if (!deleteTask.isSuccessful()) {
                String message = deleteTask.getException() != null
                    ? deleteTask.getException().getLocalizedMessage()
                    : "Não foi possível apagar o token anterior.";
                call.reject(message);
                return;
            }
            messaging.setAutoInitEnabled(true);
            messaging.getToken().addOnCompleteListener(tokenTask -> {
                if (!tokenTask.isSuccessful() || tokenTask.getResult() == null || tokenTask.getResult().isEmpty()) {
                    String message = tokenTask.getException() != null
                        ? tokenTask.getException().getLocalizedMessage()
                        : "O Firebase não gerou um novo token.";
                    call.reject(message);
                    return;
                }
                JSObject result = new JSObject();
                result.put("token", tokenTask.getResult());
                call.resolve(result);
            });
        });
    }

    @PluginMethod
    public void getAddresses(PluginCall call) {
        Map<String, JSObject> found = new LinkedHashMap<>();

        // A rede realmente usada pelo aparelho vem primeiro.
        try {
            ConnectivityManager manager =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            Network activeNetwork = manager != null ? manager.getActiveNetwork() : null;
            if (manager != null) {
                addLocalNetwork(found, manager, activeNetwork);
                // Inclui Wi-Fi/Ethernet mesmo quando dados móveis ou VPN são
                // a conexão padrão. Dados móveis nunca entram na varredura.
                for (Network network : manager.getAllNetworks()) {
                    addLocalNetwork(found, manager, network);
                }
            }
        } catch (Exception ignored) {
        }

        // O hotspot criado pelo próprio celular é uma interface downstream:
        // ele pode não aparecer no ConnectivityManager. Enumeramos também as
        // interfaces locais UP, sem descartar bridges/interfaces virtuais AP.
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                try {
                    if (!network.isUp() || network.isLoopback() ||
                        !LocalNetworkPolicy.isLocalInterface(network.getName(), network.isPointToPoint())) continue;
                    for (InterfaceAddress address : network.getInterfaceAddresses()) {
                        addLocalIpv4(found, address.getAddress(), address.getNetworkPrefixLength(), network.getName());
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }

        JSArray addresses = new JSArray();
        JSArray networks = new JSArray();
        Set<String> seenAddresses = new LinkedHashSet<>();
        for (JSObject network : found.values()) {
            networks.put(network);
            String address = network.getString("address");
            if (seenAddresses.add(address)) addresses.put(address);
        }
        JSObject result = new JSObject();
        result.put("addresses", addresses);
        result.put("networks", networks);
        call.resolve(result);
    }

    private void addLocalNetwork(Map<String, JSObject> found, ConnectivityManager manager, Network network) {
        if (network == null) return;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        if (capabilities == null || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return;
        if (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
            !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) &&
            !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) return;
        LinkProperties properties = manager.getLinkProperties(network);
        if (properties == null || !LocalNetworkPolicy.isLocalInterface(properties.getInterfaceName(), false)) return;
        for (LinkAddress address : properties.getLinkAddresses()) {
            addLocalIpv4(found, address.getAddress(), address.getPrefixLength(), properties.getInterfaceName());
        }
    }

    private void addLocalIpv4(Map<String, JSObject> found, InetAddress address, int prefixLength, String interfaceName) {
        if (!(address instanceof Inet4Address)) return;
        if (address.isLoopbackAddress() || !address.isSiteLocalAddress()) return;
        if (prefixLength < 1 || prefixLength > 32 || !LocalNetworkPolicy.isLocalInterface(interfaceName, false)) return;
        String host = address.getHostAddress();
        JSObject network = new JSObject();
        network.put("address", host);
        network.put("prefixLength", prefixLength);
        network.put("interfaceName", interfaceName);
        found.putIfAbsent(host + "/" + prefixLength, network);
    }
}
