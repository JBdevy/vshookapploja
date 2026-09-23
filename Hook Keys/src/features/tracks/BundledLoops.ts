import type { LocalPlaylist, LocalTrack } from './TrackLibraryStore';

export const FIXED_LOOPS_PLAYLIST_ID = 'fixed:loops';

interface BundledLoopDefinition {
  fileName: string;
  name: string;
  sourceBpm: number;
}

// Todos os loops são finalizados em 120 BPM para acompanhar o tempo do app.
export const BUNDLED_LOOP_FILES: readonly BundledLoopDefinition[] = [
  { fileName: 'Beat 4-4.mp3', name: 'Beat 4/4', sourceBpm: 120 },
  { fileName: 'Beat 4-4 2.mp3', name: 'Beat 4/4 - 2', sourceBpm: 120 },
  { fileName: 'Beat 6-8.mp3', name: 'Beat 6/8', sourceBpm: 120 },
];

export const BUNDLED_LOOP_TRACKS: readonly LocalTrack[] = BUNDLED_LOOP_FILES.map((loop) => ({
  // IDs estáveis e aceitos também pelo armazenamento nativo do iOS.
  id: `fixed-loop-${loop.fileName.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-')}`,
  name: loop.name,
  fileName: loop.fileName,
  mimeType: 'audio/mpeg',
  size: 0,
  addedAt: '2000-01-01T00:00:00.000Z',
  fixedLoop: true,
  loopSourceBpm: loop.sourceBpm,
}));

export const FIXED_LOOPS_PLAYLIST: LocalPlaylist = {
  id: FIXED_LOOPS_PLAYLIST_ID,
  name: 'Loops',
  trackIds: BUNDLED_LOOP_TRACKS.map(({ id }) => id),
  createdAt: '2000-01-01T00:00:00.000Z',
  updatedAt: '2000-01-01T00:00:00.000Z',
  kind: 'loop',
};

export function isFixedLoopsPlaylist(id: string | null | undefined): boolean {
  return id === FIXED_LOOPS_PLAYLIST_ID;
}

export function isBundledLoopTrack(track: LocalTrack | null | undefined): boolean {
  return track?.fixedLoop === true;
}

export function isTempoSyncedLoopTrack(track: LocalTrack | null | undefined): boolean {
  return Number.isFinite(track?.loopSourceBpm) && (track?.loopSourceBpm ?? 0) > 0;
}

export async function bundledLoopBlob(trackId: string): Promise<Blob | null> {
  const track = BUNDLED_LOOP_TRACKS.find(({ id }) => id === trackId);
  if (!track) return null;
  const url = new URL(`assets/loops/${track.fileName}`, document.baseURI).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`bundled_loop_not_found:${response.status}`);
  return response.blob();
}
