import { PresetBackupPlanner, type MissingUserSoundfont, type PresetBackupPlan } from './PresetBackupPlanner';
import {
  SoundLibraryEngine,
  type SoundInstallProgress,
} from './SoundLibraryEngine';

export interface BackupRestoreProgress {
  currentSound: number;
  totalSounds: number;
  download: SoundInstallProgress;
}

export interface BackupRestoreResult {
  downloadedFixedSounds: number;
  missingFixedSoundIds: string[];
  missingUserSoundfonts: MissingUserSoundfont[];
}

export class PresetBackupRestoreEngine {
  constructor(
    private readonly planner: PresetBackupPlanner,
    private readonly library: SoundLibraryEngine,
  ) {}

  async restore(
    savedPlayerState: unknown,
    onProgress?: (progress: BackupRestoreProgress) => void,
    signal?: AbortSignal,
  ): Promise<BackupRestoreResult> {
    const plan = await this.planner.createPlan(savedPlayerState);
    let downloadedFixedSounds = 0;
    for (const [index, sound] of plan.fixedSoundsToDownload.entries()) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelado', 'AbortError');
      await this.library.install(sound.id, (download) => {
        onProgress?.({
          currentSound: index + 1,
          totalSounds: plan.fixedSoundsToDownload.length,
          download,
        });
      }, signal);
      downloadedFixedSounds += 1;
    }
    return createRestoreResult(plan, downloadedFixedSounds);
  }
}

function createRestoreResult(
  plan: PresetBackupPlan,
  downloadedFixedSounds: number,
): BackupRestoreResult {
  return {
    downloadedFixedSounds,
    missingFixedSoundIds: plan.missingFixedSoundIds,
    missingUserSoundfonts: plan.missingUserSoundfonts,
  };
}
