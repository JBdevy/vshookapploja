package com.hookdeveloper.catlive.remote;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.generators.HKDFBytesGenerator;
import org.bouncycastle.crypto.modes.ChaCha20Poly1305;
import org.bouncycastle.crypto.params.*;

/** Wire-compatible with DAWRemoteCipher, without changing Android's global providers. */
final class RemoteCipher {
    static final int MAX_PACKET = 2 * 1024 * 1024, MAX_FRAME = MAX_PACKET + 64;
    private final X25519PrivateKeyParameters key;
    private final byte[] hello;
    private final boolean host;
    private byte[] outgoing, incoming;
    private long sent, received;
    RemoteCipher(String name) { this(name, false, null); }
    RemoteCipher(String name, boolean host, byte[] privateKey) {
        this.host = host;
        key = privateKey == null ? new X25519PrivateKeyParameters(new SecureRandom()) : new X25519PrivateKeyParameters(privateKey, 0);
        StringBuilder clipped=new StringBuilder();
        name.codePoints().forEach(c -> { String s=new String(Character.toChars(c)); if ((clipped.toString()+s).getBytes(StandardCharsets.UTF_8).length<=63) clipped.append(s); });
        if(clipped.length()==0)clipped.append("CatLive Android");
        hello=join(new byte[]{0x4a,0x44,1,2,(byte)(host?1:2)},key.generatePublicKey().getEncoded(),clipped.toString().getBytes(StandardCharsets.UTF_8));
    }
    byte[] hello() { return hello.clone(); }
    String accept(byte[] peer) throws Exception {
        check(incoming==null && peer.length>=38 && peer.length<=197 && peer[0]==0x4a && peer[1]==0x44 && peer[2]==1 && peer[3]==2 && peer[4]==(host?2:1));
        byte[] shared=new byte[32];
        key.generateSecret(new X25519PublicKeyParameters(peer,5),shared,0);
        byte[] salt=MessageDigest.getInstance("SHA-256").digest(join("Jaras Live Direct 1".getBytes(StandardCharsets.UTF_8),host?hello:peer,host?peer:hello));
        outgoing=derive(shared,salt,host?"host-to-client":"client-to-host");
        incoming=derive(shared,salt,host?"client-to-host":"host-to-client");
        Arrays.fill(shared,(byte)0);
        return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(peer,37,peer.length-37)).toString();
    }
    private byte[] derive(byte[] shared, byte[] salt, String info) {
        HKDFBytesGenerator kdf=new HKDFBytesGenerator(new SHA256Digest());
        kdf.init(new HKDFParameters(shared,salt,info.getBytes(StandardCharsets.UTF_8)));
        byte[] output=new byte[32]; kdf.generateBytes(output,0,32);return output;
    }
    synchronized byte[] seal(byte[] payload) throws Exception {
        check(outgoing!=null && sent!=Long.MAX_VALUE && payload.length>0 && payload.length<=MAX_PACKET+1);
        long counter=++sent;
        byte[] header=ByteBuffer.allocate(9).put((byte)2).putLong(counter).array();
        return join(header,crypt(true,outgoing,counter,header,payload));
    }
    byte[] open(byte[] envelope) throws Exception {
        check(incoming!=null && envelope.length>=26 && envelope.length<=MAX_FRAME && envelope[0]==2);
        long counter=ByteBuffer.wrap(envelope,1,8).getLong();
        check(received!=Long.MAX_VALUE && counter==received+1);
        byte[] plain=crypt(false,incoming,counter,Arrays.copyOf(envelope,9),Arrays.copyOfRange(envelope,9,envelope.length));
        received=counter;return plain;
    }
    private byte[] crypt(boolean encrypt, byte[] key, long counter, byte[] aad, byte[] payload) throws Exception {
        byte[] nonce=ByteBuffer.allocate(12).putInt(0).putLong(counter).array();
        ChaCha20Poly1305 cipher=new ChaCha20Poly1305();
        cipher.init(encrypt,new AEADParameters(new KeyParameter(key),128,nonce,aad));
        byte[] result=new byte[cipher.getOutputSize(payload.length)];
        int n=cipher.processBytes(payload,0,payload.length,result,0);n+=cipher.doFinal(result,n);
        return Arrays.copyOf(result,n);
    }
    static byte[] join(byte[]... arrays) {
        int n=0;for(byte[] a:arrays)n+=a.length;
        byte[] result=new byte[n];int at=0;for(byte[] a:arrays){System.arraycopy(a,0,result,at,a.length);at+=a.length;}return result;
    }
    static void check(boolean valid) throws Exception { if(!valid)throw new java.io.IOException("Pacote Remote inválido"); }
}
