package com.hookdeveloper.catlive.remote;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.HandlerThread;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;

/** Receives stereo PCM with a quarter-second pre-roll. The network never waits for playback. */
final class RemoteMainAudioPlayer {
    private final ArrayDeque<byte[]> pending = new ArrayDeque<>();
    private HandlerThread thread;
    private Handler worker;
    private boolean enabled;
    private boolean scheduled;
    private int rate;
    private int bufferedBytes;
    private int cursor;
    private boolean reconfigure;
    private AudioTrack track;
    private long writtenFrames;

    synchronized void setEnabled(boolean enabled) {
        if (this.enabled == enabled) return;
        this.enabled = enabled;
        if (!enabled) {
            pending.clear();
            bufferedBytes = 0;
            reconfigure = true;
            wake(0);
        }
    }

    synchronized void enqueue(byte[] message) {
        int bytes = message.length - 9;
        if (!enabled || bytes < 4 || bytes > 8192 || bytes % 4 != 0) return;
        int newRate = ByteBuffer.wrap(message, 5, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
        if (newRate < 8000 || newRate > 192000) return;
        if (newRate != rate || bufferedBytes + bytes > newRate * 6 || pending.size() >= 512) {
            pending.clear();
            bufferedBytes = 0;
            rate = newRate;
            reconfigure = true;
        }
        pending.add(message);
        bufferedBytes += bytes;
        if (worker == null) {
            thread = new HandlerThread("CatLive Main Audio", android.os.Process.THREAD_PRIORITY_AUDIO);
            thread.start();
            worker = new Handler(thread.getLooper());
        }
        wake(0);
    }

    synchronized void close() {
        setEnabled(false);
        if (thread != null) {
            worker.post(this::pump);
            thread.quitSafely();
        }
    }

    private void wake(int delayMillis) {
        if (worker == null || scheduled) return;
        scheduled = worker.postDelayed(this::pump, delayMillis);
    }

    private synchronized void pump() {
        scheduled = false;
        if (reconfigure) {
            releaseTrack();
            reconfigure = false;
        }
        if (!enabled) return;
        try {
            if (track == null) {
                if (rate == 0 || bufferedBytes < rate) return;
                int minimum = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_STEREO,
                        AudioFormat.ENCODING_PCM_16BIT);
                if (minimum <= 0) { pending.clear(); bufferedBytes = 0; return; }
                track = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                        .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                        .setBufferSizeInBytes(Math.max(minimum * 2, rate))
                        .setTransferMode(AudioTrack.MODE_STREAM).build();
                if (track.getState() != AudioTrack.STATE_INITIALIZED) { releaseTrack(); return; }
                track.play();
            }
            for (int batch = 0; batch < 24 && !pending.isEmpty(); ++batch) {
                byte[] message = pending.peek();
                int size = track.write(message, 9 + cursor, message.length - 9 - cursor, AudioTrack.WRITE_NON_BLOCKING);
                if (size < 0) { releaseTrack(); pending.clear(); bufferedBytes = 0; return; }
                if (size == 0) break;
                cursor += size;
                bufferedBytes -= size;
                writtenFrames += size / 4;
                if (9 + cursor == message.length) { pending.remove(); cursor = 0; }
            }
            if (pending.isEmpty() && Integer.toUnsignedLong(track.getPlaybackHeadPosition()) >= writtenFrames) {
                releaseTrack();
            } else {
                wake(10);
            }
        } catch (RuntimeException error) {
            releaseTrack();
            pending.clear();
            bufferedBytes = 0;
        }
    }

    private void releaseTrack() {
        if (track != null) {
            track.release();
            track = null;
        }
        cursor = 0;
        writtenFrames = 0;
    }
}
