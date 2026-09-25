#!/usr/bin/env python3
"""Isolated UI fixture: no access to Hook Center, REAPER or real projects."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import copy
import json
import threading
import urllib.parse
import time
import io
import wave

song = dict(id='fixture-song', name='MÚSICA DE TESTE', startPos=0, endPos=100)
tracks, items = [], []
for i, (name, color, ratio, muted) in enumerate([
    ('BATERIA', '#ec4899', .76, False), ('BAIXO', '#22c55e', .38, False),
    ('PIANO', '#38bdf8', 1, False), ('GUITARRA', '#facc15', .76, True),
]):
    tid, iid = f'track-{i}', f'clip-{i}'
    tracks.append(dict(id=tid, guid=tid, name=name, displayColor=color, volumeRatio=.76, trackIndex=i + 1))
    items.append(dict(id=iid, itemId=iid, trackId=tid, trackName=name, name=name + ' TAKE 01', startPos=0, endPos=100, volumeRatio=ratio, mute=muted))
playlist = dict(id='fixture-list', name='REFERÊNCIA TCP', songs=[song], totalDurationSec=100)
project = dict(id='fixture', index=0, name='Referência local', active=True)
initial = dict(connected=True, reaperOnline=True, directorAuthEnabled=False, playing=False,
    playingId='', selectedPlaylistSongId=song['id'], selectedRegionId='', currentPage='playlist',
    currentProjectId='fixture', currentProjectName='Referência local', projects=[project],
    regions=[song], playlists=[playlist], activePlaylistId=playlist['id'], mixerTracks=tracks,
    premix=dict(items=items, timelineItems=items), multiloops=dict(tracks=tracks, songName=song['name']),
    timerDisplaySec=123, timerMode='progressive', timerRunning=False, timerTargetSec=0,
    openDrawerIds=[], tp1=dict(lyricsText='REFERÊNCIA DO TELEPROMPT', songName=song['name']))
state = copy.deepcopy(initial)
commands = []
notice = None
templates = ["RECADO DE TESTE", "", ""]
images = ["", "", ""]
drop_data = b"Drop Hook native transfer fixture\n" * 12000
voice_buffer = io.BytesIO()
with wave.open(voice_buffer, 'wb') as voice:
    voice.setnchannels(1); voice.setsampwidth(2); voice.setframerate(8000)
    voice.writeframes(b'\0\0' * 8000 * 3)
voice_data = voice_buffer.getvalue()
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        with lock:
            if self.path == '/state':
                self.respond(state)
            elif self.path == '/test-voice.wav':
                self.send_response(200); self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(voice_data)))
                self.end_headers(); self.wfile.write(voice_data)
            elif self.path == '/recados-templates':
                self.respond(dict(ok=True, templates=templates, images=images))
            elif self.path == '/technical-notice':
                self.respond(dict(ok=True, notice=notice, now=int(time.time()*1000)))
            elif self.path == '/transfer-hook/share/status':
                self.respond(dict(ok=True, available=True, access='a'*64))
            elif self.path.startswith('/transfer-hook/share/manifest'):
                self.respond(dict(ok=True, files=[dict(id='test-file', relativePath='teste.txt', size=len(drop_data))], totalBytes=len(drop_data)))
            elif self.path.startswith('/transfer-hook/share/file'):
                first, last = self.headers.get('Range', 'bytes=0-').removeprefix('bytes=').split('-')
                first = int(first); last = min(len(drop_data)-1, int(last) if last else len(drop_data)-1)
                self.send_response(206); self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Range', f'bytes {first}-{last}/{len(drop_data)}')
                self.end_headers(); self.wfile.write(drop_data[first:last+1])
            elif self.path == '/commands':
                self.respond(commands)
            elif self.path == '/discovery':
                self.respond(dict(ok=True, app='VS Hook', computerName='Referência local', connected=True, reaperOnline=True, projects=[project]))
            else:
                self.respond(dict(ok=True))

    def do_POST(self):
        global notice
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        with lock:
            if self.path == '/reset':
                state.clear()
                state.update(copy.deepcopy(initial))
                commands.clear()
                notice = None
                templates[:] = ['RECADO DE TESTE', '', '']
            elif self.path == '/technical-notice':
                commands.append(body)
                if body.get('action') == 'cancel': notice = None
                elif body.get('action') in ['pin', 'unpin'] and notice:
                    notice['pinned'] = body['action'] == 'pin'
                else:
                    notice = dict(id=str(time.time_ns()), source=body.get('source'), text=body.get('text'), pinned=body.get('pinned', False), durationMs=20000, expiresAt=int(time.time()*1000)+20000)
                self.respond(dict(ok=True, notice=notice)); return
            elif self.path == '/recados-templates':
                commands.append(body)
                if body.get('updateText'): templates[body['index']] = body['text']
                self.respond(dict(ok=True, templates=templates, images=images)); return
            else:
                commands.append(body)
                kind, payload = body.get('type'), body.get('payload', {})
                if kind == 'set_page':
                    state['currentPage'] = payload.get('page', 'playlist')
                if kind == 'premix_item_set_volume':
                    for item in state['premix']['items']:
                        if item['itemId'] == payload.get('itemId'):
                            item['volumeRatio'] = payload['ratio']
                if kind == 'timer_set_mode':
                    state['timerMode'] = payload['mode']
                if kind == 'timer_set_target':
                    state['timerTargetSec'] = payload['timerTargetSec']
                    state['timerDisplaySec'] = payload['timerTargetSec']
            self.respond(dict(ok=True))

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 58150), Handler).serve_forever()
