#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_config;
mod audio_callback_gate;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    BufferSize, BuildStreamError, Device, SampleFormat, Stream, StreamConfig, SupportedBufferSize,
};
use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    ffi::{c_char, c_void, CString},
    fs::{self, File},
    io::Write,
    path::PathBuf,
    ptr::NonNull,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};

unsafe extern "C" {
    fn hk_runtime_begin_preset_transition(handle: *mut c_void) -> i32;
    fn hk_runtime_commit_preset_transition(handle: *mut c_void) -> i32;
    fn hk_runtime_set_compatibility_mode(handle: *mut c_void, enabled: i32);
    fn hk_runtime_set_seamless_preset_switching(
        handle: *mut c_void,
        enabled: i32,
        cache_budget_bytes: usize,
    );
    fn hk_runtime_set_midi_input_enabled(handle: *mut c_void, enabled: i32);
    fn hk_runtime_set_trance_gate(handle: *mut c_void, module_index: usize, enabled: i32, steps: i32,
        length: i32, beat_multiplier: f32, gate: f32, depth: f32, attack_ms: f32, release_ms: f32, swing: f32) -> i32;
    fn hk_runtime_create(sample_rate: f64, maximum_block_frames: usize) -> *mut c_void;
    fn hk_runtime_destroy(handle: *mut c_void);
    fn hk_runtime_load_soundfont(
        handle: *mut c_void,
        module_index: usize,
        path: *const c_char,
    ) -> i32;
    fn hk_runtime_clone_soundfont(
        handle: *mut c_void,
        source_module_index: usize,
        target_module_index: usize,
    ) -> i32;
    fn hk_runtime_unload_soundfont(handle: *mut c_void, module_index: usize);
    fn hk_runtime_send_midi(
        handle: *mut c_void,
        input_slot: u8,
        status: u8,
        data1: u8,
        data2: u8,
    ) -> i32;
    fn hk_runtime_configure_module(
        handle: *mut c_void,
        module_index: usize,
        enabled: i32,
        input_slot: i32,
        low_note: i32,
        high_note: i32,
        octave: i32,
        sustain: i32,
        modulation: i32,
        volume_db: f32,
        gm_drum_hi_hat_choke: i32,
        polyphony: i32,
        velocity_curve0: i32,
        velocity_curve1: i32,
        velocity_curve2: i32,
        velocity_curve3: i32,
        velocity_curve4: i32,
        output_channel_start: i32,
        output_channel_count: i32,
    ) -> i32;
    fn hk_runtime_set_module_gain(
        handle: *mut c_void,
        module_index: usize,
        db: f32,
    ) -> i32;
    fn hk_runtime_configure_velocity_limits(
        handle: *mut c_void,
        module_index: usize,
        ignore_above: i32,
        ceiling: i32,
        oscillator1_limit: i32,
        oscillator2_limit: i32,
    ) -> i32;
    fn hk_runtime_configure_glide(
        handle: *mut c_void,
        module_index: usize,
        portamento: i32,
        velocity_gate_enabled: i32,
        velocity_gate_inverted: i32,
        velocity_threshold: i32,
    ) -> i32;
    fn hk_runtime_configure_module_modulation(
        handle: *mut c_void,
        module_index: usize,
        mode: i32,
        rate_hz: f32,
    ) -> i32;
    fn hk_runtime_configure_effects(
        handle: *mut c_void,
        module_index: usize,
        cutoff_hz: f32,
        cutoff_velocity: *const i32,
        eq_types: *const i32,
        eq_frequencies: *const f32,
        eq_gains: *const f32,
        eq_qualities: *const f32,
        eq_cut_stages: *const i32,
        compressor_threshold_db: f32,
        compressor_ratio: f32,
        compressor_attack_ms: f32,
        compressor_release_ms: f32,
        compressor_gain_db: f32,
        compressor_mix: f32,
        delay_sync: i32,
        delay_ms: f32,
        delay_beat_multiplier: f32,
        delay_feedback: f32,
        delay_mix: f32,
        reverb_decay: f32,
        reverb_dampen: f32,
        reverb_size: f32,
        reverb_mix: f32,
        rotary_enabled: i32,
        rotary_speed: i32,
        rotary_slow_hz: f32,
        rotary_fast_hz: f32,
        rotary_ramp_seconds: f32,
        rotary_depth: f32,
        rotary_mix: f32,
        rotary_modulation_enabled: i32,
        chorus_enabled: i32,
        chorus_rate_hz: f32,
        chorus_depth: f32,
        chorus_mix: f32,
        auto_fader_enabled: i32,
        auto_fader_beats: f32,
        auto_fader_depth_db: f32,
        input_gain_db: f32,
    ) -> i32;
    fn hk_runtime_configure_envelope(
        handle: *mut c_void,
        module_index: usize,
        attack_ms: f32,
        hold_ms: f32,
        decay_ms: f32,
        release_ms: f32,
        glide_ms: f32,
        sustain_db: f32,
    ) -> i32;
    fn hk_runtime_configure_synth(
        handle: *mut c_void,
        oscillator1: i32,
        oscillator2: i32,
        oscillator1_enabled: i32,
        oscillator2_enabled: i32,
        voice_mode: i32,
        lfo_target: i32,
        oscillator1_volume: f32,
        oscillator2_volume: f32,
        detune_cents: f32,
        attack_ms: f32,
        hold_ms: f32,
        decay_ms: f32,
        sustain: f32,
        release_ms: f32,
        filter_cutoff_hz: f32,
        filter_resonance: f32,
        filter_envelope: f32,
        lfo_rate_hz: f32,
        lfo_depth: f32,
        glide_ms: f32,
        oscillator1_octave: i32,
        oscillator2_octave: i32,
    ) -> i32;
    fn hk_runtime_set_tempo(handle: *mut c_void, bpm: f32) -> i32;
    fn hk_runtime_set_metronome_output(handle: *mut c_void, channel_start: i32, channel_count: i32);
    fn hk_runtime_configure_metronome(
        handle: *mut c_void,
        enabled: i32,
        bpm: f32,
        volume: f32,
        click_sound: i32,
        accent_enabled: i32,
        double_time_enabled: i32,
        numerator: i32,
    );
    fn hk_runtime_set_output_gain(handle: *mut c_void, db: f32, enabled: i32);
    fn hk_runtime_stop_all_notes(handle: *mut c_void);
    fn hk_runtime_render(handle: *mut c_void, output: *mut f32, frames: usize, channels: usize);
    fn hk_runtime_module_peaks(handle: *mut c_void, output: *mut f32);
    fn hk_runtime_audio_load(handle: *mut c_void, output: *mut f32);
    fn hk_runtime_module_analysis(handle: *mut c_void, module_index: usize, output: *mut f32);
}

struct NativeRuntime(NonNull<c_void>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeTranceGateConfig {
    module_index: usize,
    enabled: bool,
    steps: i32,
    length: i32,
    beat_multiplier: f32,
    gate: f32,
    depth: f32,
    attack_ms: f32,
    release_ms: f32,
    swing: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeVelocityLimitsConfig {
    module_index: usize,
    ignore_above: i32,
    ceiling: i32,
    oscillator1_limit: i32,
    oscillator2_limit: i32,
}

#[tauri::command]
fn configure_velocity_limits(config: NativeVelocityLimitsConfig, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let applied = unsafe {
        hk_runtime_configure_velocity_limits(
            engine.pointer(), config.module_index, config.ignore_above, config.ceiling,
            config.oscillator1_limit, config.oscillator2_limit,
        )
    };
    if applied != 0 { Ok(()) } else { Err("Não foi possível configurar os limites de velocity.".into()) }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeGlideConfig {
    module_index: usize,
    portamento: bool,
    velocity_gate_enabled: bool,
    velocity_gate_inverted: bool,
    velocity_threshold: i32,
}

#[tauri::command]
fn configure_glide(config: NativeGlideConfig, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let applied = unsafe {
        hk_runtime_configure_glide(
            engine.pointer(), config.module_index, config.portamento as i32,
            config.velocity_gate_enabled as i32, config.velocity_gate_inverted as i32,
            config.velocity_threshold,
        )
    };
    if applied != 0 { Ok(()) } else { Err("Não foi possível configurar o Glide.".into()) }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeModuleModulationConfig {
    module_index: usize,
    // 0 User, 1 LFO de pitch, 2 Tremolo.
    mode: i32,
    rate_hz: f32,
}

#[tauri::command]
fn configure_module_modulation(
    config: NativeModuleModulationConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = state.engine.current()?;
    let applied = unsafe {
        hk_runtime_configure_module_modulation(
            engine.pointer(), config.module_index, config.mode.clamp(0, 3), config.rate_hz,
        )
    };
    if applied != 0 { Ok(()) } else { Err("Não foi possível configurar a modulação do módulo.".into()) }
}

#[tauri::command]
fn configure_trance_gate(config: NativeTranceGateConfig, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let applied = unsafe { hk_runtime_set_trance_gate(engine.pointer(), config.module_index,
        config.enabled as i32, config.steps, config.length, config.beat_multiplier, config.gate,
        config.depth, config.attack_ms, config.release_ms, config.swing) };
    if applied != 0 { Ok(()) } else { Err("Não foi possível configurar o Trance Gate.".into()) }
}

#[tauri::command]
async fn begin_preset_transition(state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    tauri::async_runtime::spawn_blocking(move || {
        if unsafe { hk_runtime_begin_preset_transition(engine.pointer()) } != 0 {
            Ok(())
        } else {
            Err("Não foi possível preparar o preset sem interromper as notas anteriores.".into())
        }
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
fn commit_preset_transition(state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    if unsafe { hk_runtime_commit_preset_transition(engine.pointer()) } != 0 { Ok(()) }
    else { Err("Não foi possível aplicar o novo preset.".into()) }
}
unsafe impl Send for NativeRuntime {}
unsafe impl Sync for NativeRuntime {}

impl NativeRuntime {
    fn new(sample_rate: f64, block_frames: usize) -> Result<Self, String> {
        if !sample_rate.is_finite()
            || sample_rate < audio_config::MIN_SAMPLE_RATE as f64
            || sample_rate > audio_config::MAX_SAMPLE_RATE as f64
        {
            return Err("A taxa de amostragem da saída não é compatível com o motor de áudio.".into());
        }
        NonNull::new(unsafe { hk_runtime_create(sample_rate, block_frames) })
            .map(Self)
            .ok_or_else(|| "Não foi possível criar o motor de áudio.".to_string())
    }

    fn pointer(&self) -> *mut c_void {
        self.0.as_ptr()
    }
}

impl Drop for NativeRuntime {
    fn drop(&mut self) {
        unsafe { hk_runtime_destroy(self.pointer()) }
    }
}

struct AudioRuntime {
    _stream: Stream,
    _engine: Arc<NativeRuntime>,
    sample_rate: u32,
    failed: Arc<AtomicBool>,
    callback_seen: Arc<AtomicBool>,
    callback_gate: Arc<audio_callback_gate::CallbackGate>,
}

struct EngineHub(RwLock<Option<Arc<NativeRuntime>>>);

impl EngineHub {
    fn current(&self) -> Result<Arc<NativeRuntime>, String> {
        self.0
            .read()
            .map_err(|_| "Motor de áudio indisponível.".to_string())?
            .clone()
            .ok_or_else(|| "O motor ainda não foi inicializado.".to_string())
    }
}

struct UploadSession {
    file: File,
    temporary: PathBuf,
    destination: PathBuf,
}

struct AppState {
    audio_restart: Mutex<()>,
    engine: Arc<EngineHub>,
    audio: Mutex<Option<AudioRuntime>>,
    midi: Mutex<Vec<MidiInputConnection<()>>>,
    uploads: Mutex<HashMap<usize, UploadSession>>,
    compatibility_mode: Arc<AtomicBool>,
    allow_close: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            audio_restart: Mutex::new(()),
            engine: Arc::new(EngineHub(RwLock::new(None))),
            audio: Mutex::new(None),
            midi: Mutex::new(Vec::new()),
            uploads: Mutex::new(HashMap::new()),
            compatibility_mode: Arc::new(AtomicBool::new(false)),
            allow_close: AtomicBool::new(false),
        }
    }
}

#[derive(Serialize)]
struct AudioDevice {
    id: String,
    name: String,
    channels: u16,
}

#[derive(Serialize)]
struct MidiDevice {
    id: String,
    name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MidiNoteEvent {
    channel: u8,
    input_id: String,
    note_number: u8,
    velocity: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MidiControlEvent {
    channel: u8,
    input_id: String,
    controller: u8,
    value: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MidiPitchBendEvent {
    channel: u8,
    input_id: String,
    value: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModuleConfig {
    module_index: usize,
    enabled: bool,
    input_slot: i32,
    low_note: i32,
    high_note: i32,
    octave: i32,
    sustain: bool,
    modulation: bool,
    volume_db: f32,
    gm_drum_hi_hat_choke: bool,
    polyphony: i32,
    velocity_curve0: i32,
    velocity_curve1: i32,
    velocity_curve2: i32,
    velocity_curve3: i32,
    velocity_curve4: i32,
    output_channel_start: i32,
    output_channel_count: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvelopeConfig {
    module_index: usize,
    attack_ms: f32,
    hold_ms: f32,
    decay_ms: f32,
    release_ms: f32,
    #[serde(default)]
    glide_ms: f32,
    #[serde(default)]
    sustain_db: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthConfig {
    oscillator1: i32,
    oscillator2: i32,
    oscillator1_enabled: bool,
    oscillator2_enabled: bool,
    voice_mode: i32,
    lfo_target: i32,
    oscillator1_volume: f32,
    oscillator2_volume: f32,
    detune_cents: f32,
    attack_ms: f32,
    hold_ms: f32,
    decay_ms: f32,
    sustain: f32,
    release_ms: f32,
    filter_cutoff_hz: f32,
    filter_resonance: f32,
    filter_envelope: f32,
    lfo_rate_hz: f32,
    lfo_depth: f32,
    glide_ms: f32,
    #[serde(default)]
    oscillator1_octave: i32,
    #[serde(default)]
    oscillator2_octave: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectsConfig {
    module_index: usize,
    cutoff_hz: f32,
    cutoff_velocity0: i32,
    cutoff_velocity1: i32,
    cutoff_velocity2: i32,
    cutoff_velocity3: i32,
    cutoff_velocity4: i32,
    eq_types: Vec<i32>,
    eq_frequencies: Vec<f32>,
    eq_gains: Vec<f32>,
    eq_qualities: Vec<f32>,
    eq_cut_stages: Vec<i32>,
    compressor_threshold_db: f32,
    compressor_ratio: f32,
    compressor_attack_ms: f32,
    compressor_release_ms: f32,
    compressor_gain_db: f32,
    compressor_mix: f32,
    delay_sync: bool,
    delay_ms: f32,
    delay_beat_multiplier: f32,
    delay_feedback: f32,
    delay_mix: f32,
    reverb_decay: f32,
    reverb_dampen: f32,
    reverb_size: f32,
    reverb_mix: f32,
    rotary_enabled: bool,
    rotary_speed: i32,
    rotary_slow_hz: f32,
    rotary_fast_hz: f32,
    rotary_ramp_seconds: f32,
    rotary_depth: f32,
    rotary_mix: f32,
    #[serde(default)]
    rotary_modulation_enabled: bool,
    #[serde(default)]
    chorus_enabled: bool,
    #[serde(default)]
    chorus_rate_hz: f32,
    #[serde(default)]
    chorus_depth: f32,
    #[serde(default)]
    chorus_mix: f32,
    #[serde(default)]
    auto_fader_enabled: bool,
    #[serde(default)]
    auto_fader_beats: f32,
    #[serde(default)]
    auto_fader_depth_db: f32,
    #[serde(default)]
    input_gain_db: f32,
}

fn audio_devices() -> Vec<(Device, AudioDevice)> {
    cpal::default_host()
        .output_devices()
        .map(|devices| {
            devices
                .enumerate()
                .map(|(index, device)| {
                    // Algumas interfaces USB aparecem no WASAPI antes que a lista
                    // completa de formatos esteja disponível. Elas ainda são saídas
                    // válidas e não podem desaparecer do seletor por causa disso.
                    let description = device.description().ok();
                    // No WASAPI, `name()` pode ser apenas "Alto-falantes" ou
                    // "Line". A linha estendida contém o FriendlyName do Windows
                    // (normalmente com fabricante/modelo) e é o nome útil ao músico.
                    let name = description
                        .as_ref()
                        .and_then(|description| {
                            description
                                .extended()
                                .iter()
                                .filter(|line| !line.trim().is_empty())
                                .max_by_key(|line| line.len())
                                .filter(|line| line.len() > description.name().len())
                                .cloned()
                        })
                        .or_else(|| description.as_ref().map(|description| description.name().to_owned()))
                        .unwrap_or_else(|| format!("Saída de áudio {}", index + 1));
                    let channels = device
                        .supported_output_configs()
                        .ok()
                        .and_then(|configs| configs.map(|config| config.channels()).max())
                        .or_else(|| device.default_output_config().ok().map(|config| config.channels()))
                        .unwrap_or(2)
                        .clamp(1, 32);
                    // O ID do backend permanece estável mesmo que a ordem dos
                    // endpoints mude ao conectar uma interface USB.
                    let id = device
                        .id()
                        .map(|id| id.to_string())
                        .unwrap_or_else(|_| format!("desktop-audio-{index}-{name}"));
                    (device, AudioDevice { id, name, channels })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn list_audio_output_devices() -> Vec<AudioDevice> {
    audio_devices()
        .into_iter()
        .map(|(_, description)| description)
        .collect()
}

#[tauri::command]
fn list_midi_devices() -> Vec<MidiDevice> {
    let Ok(input) = MidiInput::new("Hook Keys") else {
        return vec![];
    };
    input
        .ports()
        .iter()
        .enumerate()
        .map(|(index, port)| MidiDevice {
            id: format!("desktop-midi-{index}"),
            name: input
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI {}", index + 1)),
        })
        .collect()
}

fn select_device(device_id: &str) -> Result<Device, String> {
    if device_id.is_empty() {
        return cpal::default_host()
            .default_output_device()
            .ok_or_else(|| "Nenhuma saída de áudio foi encontrada.".to_string());
    }
    audio_devices()
        .into_iter()
        .find(|(_, description)| description.id == device_id)
        .map(|(device, _)| device)
        .ok_or_else(|| "O dispositivo de áudio selecionado não está mais conectado.".to_string())
}

fn start_audio(
    state: &AppState,
    device_id: &str,
    requested_channels: u16,
    buffer_size: u32,
    sample_rate: u32,
    preserve_engine: bool,
) -> Result<(), String> {
    let _restart = state.audio_restart.lock()
        .map_err(|_| "Falha ao sincronizar a troca da saída de áudio.".to_string())?;
    let device = select_device(device_id)?;
    let buffer_size = buffer_size.clamp(64, 512);
    let requested_channels = requested_channels.clamp(1, 32);
    let system_default = device.default_output_config().ok();
    let selected = audio_config::select_config(
        system_default,
        device.supported_output_configs().map_err(|error| error.to_string())?,
        requested_channels,
        device_id.is_empty(),
        sample_rate,
    ).ok_or_else(|| {
        "A saída selecionada não oferece a taxa e quantidade de canais escolhidas.".to_string()
    })?;

    let channels = selected.channels();
    let sample_rate = selected.sample_rate();
    let sample_format = selected.sample_format();
    let supported_buffer_size = *selected.buffer_size();
    let reusable_engine = if preserve_engine {
        state
            .audio
            .lock()
            .map_err(|_| "Falha ao consultar o motor de áudio.".to_string())?
            .as_ref()
            .filter(|runtime| runtime.sample_rate == sample_rate)
            .map(|runtime| Arc::clone(&runtime._engine))
    } else {
        None
    };
    if preserve_engine && reusable_engine.is_none() {
        return Err("A taxa de amostragem mudou; é necessário recarregar o motor.".to_string());
    }
    let engine = match reusable_engine {
        Some(engine) => engine,
        None => Arc::new(NativeRuntime::new(
            sample_rate as f64,
            buffer_size.max(512) as usize,
        )?),
    };
    if !preserve_engine {
        unsafe { hk_runtime_set_midi_input_enabled(engine.pointer(), 0) };
    }
    let failed = Arc::new(AtomicBool::new(false));
    let callback_seen = Arc::new(AtomicBool::new(false));
    let callback_gate = Arc::new(audio_callback_gate::CallbackGate::default());
    let mut config: StreamConfig = selected.into();
    config.buffer_size = match supported_buffer_size {
        SupportedBufferSize::Range { min, max } if max >= min && max > 0 => {
            BufferSize::Fixed(buffer_size.clamp(min.max(1), max))
        }
        SupportedBufferSize::Range { .. } | SupportedBufferSize::Unknown => BufferSize::Default,
    };

    let stream = build_audio_stream(
        &device,
        &config,
        sample_format,
        Arc::clone(&engine),
        Arc::clone(&failed),
        Arc::clone(&callback_seen),
        Arc::clone(&callback_gate),
        channels,
    )
    .or_else(|_| {
        config.buffer_size = BufferSize::Default;
        build_audio_stream(
            &device,
            &config,
            sample_format,
            Arc::clone(&engine),
            Arc::clone(&failed),
            Arc::clone(&callback_seen),
            Arc::clone(&callback_gate),
            channels,
        )
    })
    .map_err(|error| error.to_string())?;
    // Pause o stream antigo antes de ativar o novo. Quando o motor é
    // preservado, dois callbacks simultâneos consumiriam a mesma fila MIDI.
    let old_audio = {
        let mut audio = state
            .audio
            .lock()
            .map_err(|_| "Falha ao alterar a saída de áudio.".to_string())?;
        let previous = audio.take();
        if let Some(runtime) = previous.as_ref() {
            if !runtime.callback_gate.suspend_and_wait() {
                runtime.callback_gate.resume();
                *audio = previous;
                return Err("A saída anterior ainda está ocupada. Tente novamente.".into());
            }
            let _ = runtime._stream.pause();
        }
        previous
    };
    if let Err(error) = stream.play() {
        if let Some(previous) = old_audio {
            previous.callback_gate.resume();
            let _ = previous._stream.play();
            if let Ok(mut audio) = state.audio.lock() {
                *audio = Some(previous);
            }
        }
        return Err(error.to_string());
    }

    *state
        .engine
        .0
        .write()
        .map_err(|_| "Falha ao ativar o motor de áudio.".to_string())? = Some(Arc::clone(&engine));
    *state
        .audio
        .lock()
        .map_err(|_| "Falha ao registrar a saída de áudio.".to_string())? = Some(AudioRuntime {
        _stream: stream,
        _engine: engine,
        sample_rate,
        failed,
        callback_seen,
        callback_gate,
    });
    Ok(())
}

fn build_audio_stream(
    device: &Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    engine: Arc<NativeRuntime>,
    failed: Arc<AtomicBool>,
    callback_seen: Arc<AtomicBool>,
    callback_gate: Arc<audio_callback_gate::CallbackGate>,
    channels: u16,
) -> Result<Stream, BuildStreamError> {
    let channel_count = channels as usize;
    // Evita a primeira alocação (e eventuais realocações se o WASAPI variar
    // o bloco entregue) dentro do callback de tempo real.
    const MAX_CALLBACK_FRAMES: usize = 8192;
    let scratch_capacity = MAX_CALLBACK_FRAMES.saturating_mul(channel_count);
    match sample_format {
        SampleFormat::F32 => device.build_output_stream(
            config,
            move |output: &mut [f32], _| unsafe {
                let Some(_active) = callback_gate.enter() else { output.fill(0.0); return; };
                callback_seen.store(true, Ordering::Release);
                hk_runtime_render(
                    engine.pointer(),
                    output.as_mut_ptr(),
                    output.len() / channel_count,
                    channel_count,
                )
            },
            move |error| {
                failed.store(true, Ordering::Release);
                eprintln!("Hook Keys audio: {error}");
            },
            None,
        ),
        SampleFormat::F64 => {
            let mut scratch = Vec::<f32>::with_capacity(scratch_capacity);
            let stream_failed = Arc::clone(&failed);
            device.build_output_stream(
                config,
                move |output: &mut [f64], _| {
                    let Some(_active) = callback_gate.enter() else { output.fill(0.0); return; };
                    callback_seen.store(true, Ordering::Release);
                    scratch.resize(output.len(), 0.0);
                    unsafe {
                        hk_runtime_render(
                            engine.pointer(),
                            scratch.as_mut_ptr(),
                            output.len() / channel_count,
                            channel_count,
                        )
                    };
                    for (target, source) in output.iter_mut().zip(&scratch) {
                        *target = source.clamp(-1.0, 1.0) as f64;
                    }
                },
                move |error| {
                    stream_failed.store(true, Ordering::Release);
                    eprintln!("Hook Keys audio: {error}");
                },
                None,
            )
        }
        SampleFormat::I16 => {
            let mut scratch = Vec::<f32>::with_capacity(scratch_capacity);
            let stream_failed = Arc::clone(&failed);
            device.build_output_stream(
                config,
                move |output: &mut [i16], _| {
                    let Some(_active) = callback_gate.enter() else { output.fill(0); return; };
                    callback_seen.store(true, Ordering::Release);
                    scratch.resize(output.len(), 0.0);
                    unsafe {
                        hk_runtime_render(
                            engine.pointer(),
                            scratch.as_mut_ptr(),
                            output.len() / channel_count,
                            channel_count,
                        )
                    };
                    for (target, source) in output.iter_mut().zip(&scratch) {
                        *target = (source.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                    }
                },
                move |error| {
                    stream_failed.store(true, Ordering::Release);
                    eprintln!("Hook Keys audio: {error}");
                },
                None,
            )
        }
        SampleFormat::U16 => {
            let mut scratch = Vec::<f32>::with_capacity(scratch_capacity);
            let stream_failed = Arc::clone(&failed);
            device.build_output_stream(
                config,
                move |output: &mut [u16], _| {
                    let Some(_active) = callback_gate.enter() else { output.fill(32768); return; };
                    callback_seen.store(true, Ordering::Release);
                    scratch.resize(output.len(), 0.0);
                    unsafe {
                        hk_runtime_render(
                            engine.pointer(),
                            scratch.as_mut_ptr(),
                            output.len() / channel_count,
                            channel_count,
                        )
                    };
                    for (target, source) in output.iter_mut().zip(&scratch) {
                        *target = ((source.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32) as u16;
                    }
                },
                move |error| {
                    stream_failed.store(true, Ordering::Release);
                    eprintln!("Hook Keys audio: {error}");
                },
                None,
            )
        }
        _ => Err(BuildStreamError::StreamConfigNotSupported),
    }
}

#[tauri::command]
fn initialize(
    buffer_size: u32,
    sample_rate: u32,
    state: State<'_, AppState>,
) -> Result<HashMap<&'static str, bool>, String> {
    let ready = state
        .audio
        .lock()
        .map_err(|_| "Motor de áudio indisponível.".to_string())?
        .is_some();
    if !ready {
        start_audio(&state, "", 2, buffer_size, sample_rate, false)?;
    }
    Ok(HashMap::from([("ready", true)]))
}

#[tauri::command]
fn set_audio_output_device(
    device_id: String,
    channels: u16,
    buffer_size: u32,
    sample_rate: u32,
    preserve_engine: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    start_audio(&state, &device_id, channels, buffer_size, sample_rate, preserve_engine)
}

#[tauri::command]
fn set_midi_input_enabled(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe { hk_runtime_set_midi_input_enabled(engine.pointer(), i32::from(enabled)) };
    Ok(())
}

#[tauri::command]
fn audio_output_status(state: State<'_, AppState>) -> Result<HashMap<&'static str, bool>, String> {
    let audio = state
        .audio
        .lock()
        .map_err(|_| "Motor de áudio indisponível.".to_string())?;
    let ready = audio.as_ref().is_some_and(|runtime| {
        !runtime.failed.load(Ordering::Acquire)
            && runtime.callback_seen.load(Ordering::Acquire)
    });
    Ok(HashMap::from([("ready", ready), ("failed", !ready)]))
}

#[tauri::command]
fn module_meter_levels(state: State<'_, AppState>) -> Result<[f32; 16], String> {
    let engine = state.engine.current()?;
    let mut peaks = [0.0; 16];
    unsafe { hk_runtime_module_peaks(engine.pointer(), peaks.as_mut_ptr()) };
    Ok(peaks)
}

#[tauri::command]
fn clone_sound_font(
    source_module_index: usize,
    target_module_index: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if source_module_index >= 7 || target_module_index >= 7 ||
        source_module_index == target_module_index {
        return Err("Módulos de timbre inválidos.".into());
    }
    let engine = state.engine.current()?;
    if unsafe {
        hk_runtime_clone_soundfont(
            engine.pointer(), source_module_index, target_module_index)
    } != 0 {
        Ok(())
    } else {
        Err("O timbre compartilhado não pôde ser preparado.".into())
    }
}

#[tauri::command]
fn unload_sound_font(module_index: usize, state: State<'_, AppState>) -> Result<(), String> {
    if module_index >= 7 {
        return Err("Módulo de timbre inválido.".into());
    }
    let engine = state.engine.current()?;
    unsafe { hk_runtime_unload_soundfont(engine.pointer(), module_index) };
    Ok(())
}

#[tauri::command]
fn module_analysis(module_index: usize, state: State<'_, AppState>) -> Result<Vec<f32>, String> {
    if module_index >= 8 {
        return Err("Módulo inválido.".to_string());
    }
    let engine = state.engine.current()?;
    let mut analysis = vec![0.0; 2];
    unsafe { hk_runtime_module_analysis(engine.pointer(), module_index, analysis.as_mut_ptr()) };
    Ok(analysis)
}

#[tauri::command]
fn configure_module(config: ModuleConfig, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let ok = unsafe {
        hk_runtime_configure_module(
            engine.pointer(),
            config.module_index,
            config.enabled as i32,
            config.input_slot,
            config.low_note,
            config.high_note,
            config.octave,
            config.sustain as i32,
            config.modulation as i32,
            config.volume_db,
            config.gm_drum_hi_hat_choke as i32,
            config.polyphony,
            config.velocity_curve0,
            config.velocity_curve1,
            config.velocity_curve2,
            config.velocity_curve3,
            config.velocity_curve4,
            config.output_channel_start,
            config.output_channel_count,
        )
    };
    if ok != 0 {
        Ok(())
    } else {
        Err("Não foi possível configurar o módulo.".into())
    }
}

#[tauri::command]
fn set_module_gain(module_index: usize, db: f32, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let ok = unsafe { hk_runtime_set_module_gain(engine.pointer(), module_index, db) };
    if ok != 0 {
        Ok(())
    } else {
        Err("Não foi possível ajustar o volume do módulo.".into())
    }
}

fn five_f32(values: &[f32], fallback: f32) -> [f32; 5] {
    std::array::from_fn(|index| values.get(index).copied().unwrap_or(fallback))
}

fn five_i32(values: &[i32], fallback: i32) -> [i32; 5] {
    std::array::from_fn(|index| values.get(index).copied().unwrap_or(fallback))
}

#[tauri::command]
fn configure_module_effects(
    config: EffectsConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = state.engine.current()?;
    let types = five_i32(&config.eq_types, 2);
    let frequencies = five_f32(&config.eq_frequencies, 1000.0);
    let gains = five_f32(&config.eq_gains, 0.0);
    let qualities = five_f32(&config.eq_qualities, std::f32::consts::FRAC_1_SQRT_2);
    let stages = five_i32(&config.eq_cut_stages, 1);
    let cutoff_velocity = [config.cutoff_velocity0, config.cutoff_velocity1,
        config.cutoff_velocity2, config.cutoff_velocity3, config.cutoff_velocity4];
    let ok = unsafe {
        hk_runtime_configure_effects(
            engine.pointer(),
            config.module_index,
            config.cutoff_hz,
            cutoff_velocity.as_ptr(),
            types.as_ptr(),
            frequencies.as_ptr(),
            gains.as_ptr(),
            qualities.as_ptr(),
            stages.as_ptr(),
            config.compressor_threshold_db,
            config.compressor_ratio,
            config.compressor_attack_ms,
            config.compressor_release_ms,
            config.compressor_gain_db,
            config.compressor_mix,
            config.delay_sync as i32,
            config.delay_ms,
            config.delay_beat_multiplier,
            config.delay_feedback,
            config.delay_mix,
            config.reverb_decay,
            config.reverb_dampen,
            config.reverb_size,
            config.reverb_mix,
            if config.rotary_enabled { 1 } else { 0 },
            config.rotary_speed,
            config.rotary_slow_hz,
            config.rotary_fast_hz,
            config.rotary_ramp_seconds,
            config.rotary_depth,
            config.rotary_mix,
            if config.rotary_modulation_enabled { 1 } else { 0 },
            if config.chorus_enabled { 1 } else { 0 },
            config.chorus_rate_hz,
            config.chorus_depth,
            config.chorus_mix,
            if config.auto_fader_enabled { 1 } else { 0 },
            config.auto_fader_beats,
            config.auto_fader_depth_db,
            config.input_gain_db,
        )
    };
    if ok != 0 {
        Ok(())
    } else {
        Err("Não foi possível configurar os efeitos.".into())
    }
}

#[tauri::command]
fn configure_module_envelope(
    config: EnvelopeConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = state.engine.current()?;
    let ok = unsafe {
        hk_runtime_configure_envelope(
            engine.pointer(),
            config.module_index,
            config.attack_ms,
            config.hold_ms,
            config.decay_ms,
            config.release_ms,
            config.glide_ms,
            config.sustain_db,
        )
    };
    if ok != 0 {
        Ok(())
    } else {
        Err("Não foi possível configurar o envelope.".into())
    }
}

#[tauri::command]
fn configure_synth(config: SynthConfig, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    let ok = unsafe {
        hk_runtime_configure_synth(
            engine.pointer(),
            config.oscillator1,
            config.oscillator2,
            if config.oscillator1_enabled { 1 } else { 0 },
            if config.oscillator2_enabled { 1 } else { 0 },
            config.voice_mode,
            config.lfo_target,
            config.oscillator1_volume,
            config.oscillator2_volume,
            config.detune_cents,
            config.attack_ms,
            config.hold_ms,
            config.decay_ms,
            config.sustain,
            config.release_ms,
            config.filter_cutoff_hz,
            config.filter_resonance,
            config.filter_envelope,
            config.lfo_rate_hz,
            config.lfo_depth,
            config.glide_ms,
            config.oscillator1_octave,
            config.oscillator2_octave,
        )
    };
    if ok != 0 { Ok(()) } else { Err("Não foi possível configurar o Synth.".into()) }
}

#[tauri::command]
fn send_midi(
    input_slot: u8,
    status: u8,
    data1: u8,
    data2: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = state.engine.current()?;
    if unsafe { hk_runtime_send_midi(engine.pointer(), input_slot, status, data1, data2) } != 0 {
        Ok(())
    } else {
        Err("A fila MIDI está ocupada.".into())
    }
}

#[tauri::command]
fn set_tempo(bpm: f32, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    if unsafe { hk_runtime_set_tempo(engine.pointer(), bpm) } != 0 {
        Ok(())
    } else {
        Err("Não foi possível alterar o tempo.".into())
    }
}

#[tauri::command]
fn set_metronome_output(channel_start: i32, channel_count: i32, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe { hk_runtime_set_metronome_output(engine.pointer(), channel_start.clamp(0, 31), channel_count) };
    Ok(())
}

#[tauri::command]
fn configure_metronome(
    enabled: bool,
    bpm: f32,
    volume: f32,
    click_sound: i32,
    accent_enabled: bool,
    double_time_enabled: bool,
    time_signature_numerator: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe {
        hk_runtime_configure_metronome(
            engine.pointer(),
            enabled as i32,
            bpm.clamp(60.0, 600.0),
            volume.clamp(0.0, 1.0),
            click_sound.clamp(1, 3),
            accent_enabled as i32,
            double_time_enabled as i32,
            time_signature_numerator.clamp(1, 16),
        )
    };
    Ok(())
}

#[tauri::command]
fn set_output_gain(db: f32, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe { hk_runtime_set_output_gain(engine.pointer(), db, enabled as i32) };
    Ok(())
}

#[tauri::command]
fn stop_all_notes(state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe { hk_runtime_stop_all_notes(engine.pointer()) };
    Ok(())
}

#[tauri::command]
fn set_compatibility_mode(enabled: bool, state: State<'_, AppState>) {
    state.compatibility_mode.store(enabled, Ordering::Release);
    if let Ok(engine) = state.engine.current() {
        unsafe { hk_runtime_set_compatibility_mode(engine.pointer(), enabled as i32) };
    }
}

#[tauri::command]
fn set_seamless_preset_switching(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let engine = state.engine.current()?;
    unsafe {
        hk_runtime_set_seamless_preset_switching(
            engine.pointer(),
            enabled as i32,
            soundfont_cache_budget_bytes(),
        )
    };
    Ok(())
}

// Um cache de SF2 retem bancos de amostras inteiros. Acima disto ele disputa
// RAM com o timbre que esta tocando, e e essa disputa que empurra as amostras
// em uso para o arquivo de paginacao - onde o callback de audio passa a
// esperar disco a cada nota.
fn soundfont_cache_budget_bytes() -> usize {
    const MIB: u64 = 1024 * 1024;
    let physical = memory::physical_bytes();
    if physical == 0 {
        return 0; // o motor aplica o proprio padrao conservador
    }
    (physical / 8).min(768 * MIB) as usize
}

// RAM do computador inteiro, como no app: usada e total, em bytes.
#[tauri::command]
fn memory_usage() -> Result<HashMap<&'static str, f64>, String> {
    let (total, available) = memory::status_bytes();
    if total == 0 {
        return Err("memoria indisponivel".into());
    }
    let used = total.saturating_sub(available);
    let mut result = HashMap::new();
    result.insert("usedBytes", used as f64);
    result.insert("limitBytes", total as f64);
    result.insert("percent", (used as f64 / total as f64) * 100.0);
    Ok(result)
}

// [0] pior bloco desde a ultima leitura, [1] media suavizada, [2] estouros.
// 1.0 significa que o callback consumiu o prazo inteiro do bloco.
#[tauri::command]
fn audio_load(state: State<'_, AppState>) -> Result<Vec<f32>, String> {
    let engine = state.engine.current()?;
    let mut load = vec![0.0; 3];
    unsafe { hk_runtime_audio_load(engine.pointer(), load.as_mut_ptr()) };
    Ok(load)
}

#[tauri::command]
fn set_midi_inputs(
    device_ids: Vec<Option<String>>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut connections = Vec::new();
    for (slot, selected_id) in device_ids.into_iter().take(3).enumerate() {
        let Some(selected_id) = selected_id.filter(|id| !id.is_empty()) else {
            continue;
        };
        let index = selected_id
            .strip_prefix("desktop-midi-")
            .and_then(|value| value.parse::<usize>().ok())
            .ok_or_else(|| "Entrada MIDI inválida.".to_string())?;
        let mut input = MidiInput::new(&format!("Hook Keys MIDI {}", slot + 1))
            .map_err(|error| error.to_string())?;
        input.ignore(Ignore::None);
        let ports = input.ports();
        let port = ports
            .get(index)
            .ok_or_else(|| "A entrada MIDI não está mais conectada.".to_string())?;
        let hub = Arc::clone(&state.engine);
        let compatibility = Arc::clone(&state.compatibility_mode);
        let event_app = app.clone();
        let event_input_id = selected_id.clone();
        let connection = input
            .connect(
                port,
                "Hook Keys",
                move |_, message, _| {
                    if message.len() < 2 {
                        return;
                    }
                    let status = message[0];
                    let data1 = message[1];
                    let data2 = message.get(2).copied().unwrap_or(0);
                    let message_type = status & 0xf0;
                    let blocked_cc = compatibility.load(Ordering::Acquire)
                        && message_type == 0xb0
                        && matches!(data1, 0 | 6 | 7 | 10 | 16 | 32 | 91 | 100 | 101);
                    if !blocked_cc {
                        if let Ok(engine) = hub.current() {
                            unsafe {
                                hk_runtime_send_midi(
                                    engine.pointer(),
                                    slot as u8,
                                    status,
                                    data1,
                                    data2,
                                );
                            }
                        }
                    }
                    if message_type == 0x80 || message_type == 0x90 {
                        let velocity = if message_type == 0x90 { data2 } else { 0 };
                        let _ = event_app.emit(
                            "midiNote",
                            MidiNoteEvent {
                                channel: (status & 0x0f) + 1,
                                input_id: event_input_id.clone(),
                                note_number: data1,
                                velocity,
                            },
                        );
                    } else if message_type == 0xb0 {
                        let _ = event_app.emit(
                            "midiControlChange",
                            MidiControlEvent {
                                channel: (status & 0x0f) + 1,
                                input_id: event_input_id.clone(),
                                controller: data1,
                                value: data2,
                            },
                        );
                    } else if message_type == 0xe0 {
                        let _ = event_app.emit(
                            "midiPitchBend",
                            MidiPitchBendEvent {
                                channel: (status & 0x0f) + 1,
                                input_id: event_input_id.clone(),
                                value: u16::from(data1 & 0x7f) | (u16::from(data2 & 0x7f) << 7),
                            },
                        );
                    }
                },
                (),
            )
            .map_err(|error| error.to_string())?;
        connections.push(connection);
    }
    *state
        .midi
        .lock()
        .map_err(|_| "Falha ao conectar MIDI.".to_string())? = connections;
    Ok(())
}

fn soundfont_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("SoundFonts");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

// Um asset valido e exatamente asset-<64 digitos hexadecimais>.sf2, o mesmo
// nome que begin_sound_font_upload escreve e o unico que o motor chega a
// carregar. Qualquer outra coisa no diretorio e sobra.
fn is_sound_font_asset(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("asset-") else {
        return false;
    };
    let Some(key) = rest.strip_suffix(".sf2") else {
        return false;
    };
    key.len() == 64 && key.bytes().all(|byte| byte.is_ascii_hexdigit())
}

// O esquema antigo gravava o timbre como module-N.sf2, e um download
// interrompido deixa um module-N.sf2.part para tras. Nenhum dos dois volta a
// ser lido, e cada um custa centenas de megabytes de disco. Roda na partida,
// antes de qualquer upload poder comecar.
fn remove_orphan_sound_fonts(app: &AppHandle) {
    let Ok(directory) = soundfont_directory(app) else {
        return;
    };
    let Ok(entries) = fs::read_dir(&directory) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let name = entry.file_name();
        if name.to_str().is_some_and(is_sound_font_asset) {
            continue;
        }
        let _ = fs::remove_file(entry.path());
    }
}

#[tauri::command]
async fn begin_sound_font_upload(
    module_index: usize,
    asset_key: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HashMap<&'static str, bool>, String> {
    if module_index >= 8 {
        return Err("Módulo inválido.".into());
    }
    let directory = soundfont_directory(&app)?;
    if asset_key.len() != 64 || !asset_key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Identificador de timbre inválido.".into());
    }
    let temporary = directory.join(format!("module-{module_index}.sf2.part"));
    let destination = directory.join(format!("asset-{asset_key}.sf2"));
    if destination.exists() {
        let engine = state.engine.current()?;
        let cached_path = destination.clone();
        let loaded = tauri::async_runtime::spawn_blocking(move || {
            let Ok(path) = CString::new(cached_path.to_string_lossy().as_bytes()) else { return false };
            unsafe { hk_runtime_load_soundfont(engine.pointer(), module_index, path.as_ptr()) != 0 }
        }).await.map_err(|error| error.to_string())?;
        if loaded { return Ok(HashMap::from([("cached", true)])); }
    }
    let file = File::create(&temporary).map_err(|error| error.to_string())?;
    state
        .uploads
        .lock()
        .map_err(|_| "Falha ao iniciar o timbre.".to_string())?
        .insert(
            module_index,
            UploadSession {
                file,
                temporary,
                destination,
            },
        );
    Ok(HashMap::from([("cached", false)]))
}

#[tauri::command]
fn append_sound_font_chunk(
    module_index: usize,
    base64: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let bytes = BASE64.decode(base64).map_err(|error| error.to_string())?;
    let mut uploads = state
        .uploads
        .lock()
        .map_err(|_| "Falha no carregamento do timbre.".to_string())?;
    uploads
        .get_mut(&module_index)
        .ok_or_else(|| "Carregamento de timbre inválido.".to_string())?
        .file
        .write_all(&bytes)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn finish_sound_font_upload(module_index: usize, state: State<'_, AppState>) -> Result<(), String> {
    let upload = state
        .uploads
        .lock()
        .map_err(|_| "Falha no carregamento do timbre.".to_string())?
        .remove(&module_index)
        .ok_or_else(|| "Nenhum timbre está sendo carregado.".to_string())?;
    drop(upload.file);
    if upload.destination.exists() {
        fs::remove_file(&upload.destination).map_err(|error| error.to_string())?;
    }
    fs::rename(&upload.temporary, &upload.destination).map_err(|error| error.to_string())?;
    let path = CString::new(upload.destination.to_string_lossy().as_bytes())
        .map_err(|error| error.to_string())?;
    let engine = state.engine.current()?;
    tauri::async_runtime::spawn_blocking(move || {
        if unsafe { hk_runtime_load_soundfont(engine.pointer(), module_index, path.as_ptr()) } != 0 {
            Ok(())
        } else {
            Err("O arquivo SF2 não pôde ser carregado.".into())
        }
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
fn confirm_app_close(app: AppHandle, state: State<'_, AppState>) {
    state.allow_close.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[derive(Serialize)]
struct SaveBackupResult {
    saved: bool,
}

fn safe_backup_file_name(value: &str) -> String {
    let stem = value.trim().strip_suffix(".json").unwrap_or(value.trim());
    let stem: String = stem.chars().map(|character| match character {
        'a'..='z' | 'A'..='Z' | '0'..='9' | ' ' | '-' | '_' => character,
        _ => '-',
    }).collect();
    let stem = stem.trim_matches([' ', '-', '_']);
    format!("{}.json", if stem.is_empty() { "Hook Keys Backup" } else { stem })
}

#[tauri::command]
async fn save_backup(file_name: String, content: String) -> Result<SaveBackupResult, String> {
    const MAX_BACKUP_BYTES: usize = 16 * 1024 * 1024;
    if content.is_empty() || content.len() > MAX_BACKUP_BYTES {
        return Err("O arquivo de backup é inválido ou muito grande.".into());
    }
    let file_name = safe_backup_file_name(&file_name);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Backup Hook Keys", &["json"])
            .set_file_name(&file_name)
            .save_file()
        else {
            return Ok(SaveBackupResult { saved: false });
        };
        fs::write(path, content.as_bytes()).map_err(|error| error.to_string())?;
        Ok(SaveBackupResult { saved: true })
    }).await.map_err(|error| error.to_string())?
}

// A thread de audio le amostras espalhadas por centenas de megabytes. Quando o
// Windows apara o working set do processo - e numa maquina de 8 GB ele apara -
// cada leitura vira falta de pagina resolvida em disco e o callback fica
// parado esperando I/O. O processo aparece com 0% de CPU enquanto o som corta.
#[cfg(windows)]
mod memory {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Luid {
        low_part: u32,
        high_part: i32,
    }

    #[repr(C)]
    struct LuidAndAttributes {
        luid: Luid,
        attributes: u32,
    }

    #[repr(C)]
    struct TokenPrivileges {
        privilege_count: u32,
        privileges: [LuidAndAttributes; 1],
    }

    #[repr(C)]
    #[derive(Default)]
    struct MemoryStatusEx {
        length: u32,
        memory_load: u32,
        total_physical: u64,
        available_physical: u64,
        total_page_file: u64,
        available_page_file: u64,
        total_virtual: u64,
        available_virtual: u64,
        available_extended_virtual: u64,
    }

    unsafe extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
        fn LookupPrivilegeValueW(system: *const u16, name: *const u16, luid: *mut Luid) -> i32;
        fn AdjustTokenPrivileges(
            token: *mut c_void,
            disable_all: i32,
            new_state: *const TokenPrivileges,
            buffer_length: u32,
            previous_state: *mut TokenPrivileges,
            return_length: *mut u32,
        ) -> i32;
        fn CloseHandle(object: *mut c_void) -> i32;
        fn SetProcessWorkingSetSizeEx(
            process: *mut c_void,
            minimum: usize,
            maximum: usize,
            flags: u32,
        ) -> i32;
        fn GlobalMemoryStatusEx(buffer: *mut MemoryStatusEx) -> i32;
    }

    const TOKEN_QUERY: u32 = 0x0008;
    const TOKEN_ADJUST_PRIVILEGES: u32 = 0x0020;
    const SE_PRIVILEGE_ENABLED: u32 = 0x0002;
    const QUOTA_LIMITS_HARDWS_MIN_ENABLE: u32 = 0x0001;

    pub fn physical_bytes() -> u64 {
        status_bytes().0
    }

    // (total, disponivel). Zero quando o Windows nao responde.
    pub fn status_bytes() -> (u64, u64) {
        let mut status = MemoryStatusEx {
            length: std::mem::size_of::<MemoryStatusEx>() as u32,
            ..Default::default()
        };
        if unsafe { GlobalMemoryStatusEx(&mut status) } == 0 {
            return (0, 0);
        }
        (status.total_physical, status.available_physical)
    }

    // SeIncreaseWorkingSetPrivilege ja pertence ao usuario comum; falta apenas
    // habilita-lo no token deste processo.
    fn enable_working_set_privilege() {
        let name: Vec<u16> = "SeIncreaseWorkingSetPrivilege"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let mut token: *mut c_void = std::ptr::null_mut();
            if OpenProcessToken(
                GetCurrentProcess(),
                TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
                &mut token,
            ) == 0
            {
                return;
            }
            let mut luid = Luid::default();
            if LookupPrivilegeValueW(std::ptr::null(), name.as_ptr(), &mut luid) != 0 {
                let privileges = TokenPrivileges {
                    privilege_count: 1,
                    privileges: [LuidAndAttributes {
                        luid,
                        attributes: SE_PRIVILEGE_ENABLED,
                    }],
                };
                AdjustTokenPrivileges(
                    token,
                    0,
                    &privileges,
                    0,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
            }
            CloseHandle(token);
        }
    }

    // O minimo nao reserva nada: apenas impede o corte enquanto o processo
    // realmente usa a memoria. Por isso pode ser generoso sem tirar RAM de
    // quem esta ao lado.
    pub fn pin_working_set() {
        const GIB: u64 = 1024 * 1024 * 1024;
        let physical = physical_bytes();
        if physical == 0 {
            return;
        }
        let minimum = (physical / 100 * 35).min(3 * GIB / 2) as usize;
        let maximum = (physical / 100 * 60).min(3 * GIB) as usize;
        if minimum == 0 || maximum <= minimum {
            return;
        }
        enable_working_set_privilege();
        unsafe {
            let process = GetCurrentProcess();
            if SetProcessWorkingSetSizeEx(
                process,
                minimum,
                maximum,
                QUOTA_LIMITS_HARDWS_MIN_ENABLE,
            ) == 0
            {
                // Sem o privilegio o minimo vira apenas uma dica, que ja reduz
                // muito a frequencia do corte.
                SetProcessWorkingSetSizeEx(process, minimum, maximum, 0);
            }
        }
    }
}

#[cfg(not(windows))]
mod memory {
    pub fn physical_bytes() -> u64 {
        0
    }
    pub fn status_bytes() -> (u64, u64) {
        (0, 0)
    }
    pub fn pin_working_set() {}
}

fn main() {
    memory::pin_working_set();
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            remove_orphan_sound_fonts(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if !state.allow_close.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("hook-keys://close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            list_audio_output_devices,
            list_midi_devices,
            set_audio_output_device,
            set_midi_input_enabled,
            audio_output_status,
            module_meter_levels,
            module_analysis,
            audio_load,
            memory_usage,
            set_midi_inputs,
            configure_module,
            set_module_gain,
            configure_module_effects,
            configure_module_envelope,
            configure_module_modulation,
            configure_glide,
            configure_velocity_limits,
            configure_trance_gate,
            begin_preset_transition,
            commit_preset_transition,
            configure_synth,
            send_midi,
            set_tempo,
            configure_metronome,
            set_metronome_output,
            set_output_gain,
            set_compatibility_mode,
            set_seamless_preset_switching,
            stop_all_notes,
            begin_sound_font_upload,
            append_sound_font_chunk,
            finish_sound_font_upload,
            clone_sound_font,
            unload_sound_font,
            save_backup,
            confirm_app_close,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Hook Keys");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_keeps_only_checksum_named_sound_fonts() {
        let key = "a".repeat(64);
        assert!(is_sound_font_asset(&format!("asset-{key}.sf2")));
        assert!(!is_sound_font_asset("module-0.sf2"));
        assert!(!is_sound_font_asset("module-5.sf2.part"));
        assert!(!is_sound_font_asset(&format!("asset-{key}.sf2.part")));
        assert!(!is_sound_font_asset(&format!("asset-{}.sf2", "a".repeat(63))));
        assert!(!is_sound_font_asset(&format!("asset-{}.sf2", "z".repeat(64))));
        assert!(!is_sound_font_asset("asset-.sf2"));
    }

    #[test]
    fn backup_file_name_cannot_escape_the_native_save_dialog() {
        assert_eq!(safe_backup_file_name("Hook Keys Backup 2026-09-14.json"), "Hook Keys Backup 2026-09-14.json");
        assert_eq!(safe_backup_file_name("../segredo.json"), "segredo.json");
        assert_eq!(safe_backup_file_name("<>:.json"), "Hook Keys Backup.json");
    }

    #[test]
    fn diagnostic_real_sf2_six_note_chord() {
        let Ok(soundfont) = std::env::var("HOOK_KEYS_DIAGNOSTIC_SF2") else { return };
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        let path = CString::new(soundfont).expect("path");
        let loading_started = std::time::Instant::now();
        assert_ne!(unsafe { hk_runtime_load_soundfont(engine.pointer(), 0, path.as_ptr()) }, 0);
        let loading_elapsed = loading_started.elapsed();
        assert_ne!(unsafe {
            hk_runtime_configure_module(
                engine.pointer(), 0, 1, 0, 0, 127, 0, 1, 1, 0.0, 64,
                127, 127, 127, 127, 127, 0, 2,
            )
        }, 0);
        for note in [48, 52, 55, 60, 64, 67] {
            assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, note, 127) }, 0);
        }
        let mut output = vec![0.0_f32; 512 * 2];
        let mut maximum_callback = std::time::Duration::ZERO;
        let render_started = std::time::Instant::now();
        let mut peak = 0.0_f32;
        for _ in 0..200 {
            let callback_started = std::time::Instant::now();
            unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 512, 2) };
            maximum_callback = maximum_callback.max(callback_started.elapsed());
            peak = output.iter().fold(peak, |value, sample| value.max(sample.abs()));
        }
        println!(
            "SF2_DIAGNOSTIC loading={loading_elapsed:?} render_200={:?} max_callback={maximum_callback:?} peak={peak}",
            render_started.elapsed(),
        );
        assert!(output.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn shared_engine_loads_sf2_and_renders_audio() {
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        let soundfont = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../native-engine/third_party/TinySoundFont/examples/florestan-subset.sf2");
        let path = CString::new(soundfont.to_string_lossy().as_bytes()).expect("path");
        assert_ne!(
            unsafe { hk_runtime_load_soundfont(engine.pointer(), 0, path.as_ptr()) },
            0
        );
        assert_ne!(
            unsafe {
                hk_runtime_configure_module(
                    engine.pointer(),
                    0,
                    1,
                    0,
                    0,
                    127,
                    0,
                    1,
                    1,
                    0.0,
                    64,
                    0,
                    8,
                    32,
                    72,
                    127,
                    2,
                    2,
                )
            },
            0
        );
        assert_ne!(
            unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, 60, 110) },
            0
        );
        let mut output = vec![0.0_f32; 4096 * 4];
        unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 4096, 4) };
        assert!(output
            .chunks_exact(4)
            .all(|frame| frame[0] == 0.0 && frame[1] == 0.0));
        assert!(output
            .chunks_exact(4)
            .any(|frame| frame[2].abs() > 0.00001 || frame[3].abs() > 0.00001));
    }

    #[test]
    fn synth_module_renders_without_a_soundfont() {
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        assert_ne!(unsafe {
            hk_runtime_configure_module(
                engine.pointer(), 7, 1, 0, 0, 127, 0, 1, 1, 0.0, 64,
                0, 32, 64, 96, 127, 0, 2,
            )
        }, 0);
        assert_ne!(unsafe {
            hk_runtime_configure_synth(
                engine.pointer(), 1, 2, 1, 1, 1, 1, 0.65, 0.35, 7.0, 0.0, 0.0,
                180.0, 0.72, 250.0, 7200.0, 0.18, 0.24, 4.0, 0.0, 45.0, 0, 0,
            )
        }, 0);
        assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, 60, 110) }, 0);
        let mut output = vec![0.0_f32; 4096 * 2];
        unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 4096, 2) };
        assert!(output.iter().any(|sample| sample.abs() > 0.00001));
    }

    #[test]
    fn six_note_chord_renders_without_dynamic_gain_reduction() {
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        assert_ne!(unsafe {
            hk_runtime_configure_module(
                engine.pointer(), 7, 1, 0, 0, 127, 0, 1, 1, 0.0, 64,
                127, 127, 127, 127, 127, 0, 2,
            )
        }, 0);
        assert_ne!(unsafe {
            hk_runtime_configure_synth(
                engine.pointer(), 0, 0, 1, 1, 0, 1, 1.0, 1.0, 7.0, 0.0, 0.0,
                15_000.0, 1.0, 300.0, 20_000.0, 0.0, 0.0, 7.55, 0.0, 0.0, 0, 0,
            )
        }, 0);
        for note in [48, 52, 55, 60, 64, 67] {
            assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, note, 127) }, 0);
        }
        let mut output = vec![0.0_f32; 4096 * 2];
        unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 4096, 2) };
        let peak = output.iter().fold(0.0_f32, |value, sample| value.max(sample.abs()));
        assert!(peak > 0.1, "the chord remains audible");
        assert!(peak.is_finite(), "the polyphonic mix must remain finite: {peak}");
    }

    #[test]
    fn synth_oscillators_can_be_disabled_independently() {
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        assert_ne!(unsafe {
            hk_runtime_configure_module(
                engine.pointer(), 7, 1, 0, 0, 127, 0, 1, 1, 0.0, 64,
                0, 32, 64, 96, 127, 0, 2,
            )
        }, 0);
        assert_ne!(unsafe {
            hk_runtime_configure_synth(
                engine.pointer(), 1, 2, 0, 0, 1, 1, 0.65, 0.35, 7.0, 0.0, 0.0,
                180.0, 0.72, 250.0, 7200.0, 0.18, 0.24, 4.0, 0.0, 45.0, 0, 0,
            )
        }, 0);
        assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, 60, 110) }, 0);
        let mut muted = vec![0.0_f32; 1024 * 2];
        unsafe { hk_runtime_render(engine.pointer(), muted.as_mut_ptr(), 1024, 2) };
        assert!(muted.iter().all(|sample| sample.abs() <= 0.00001));

        assert_ne!(unsafe {
            hk_runtime_configure_synth(
                engine.pointer(), 1, 2, 1, 0, 1, 1, 0.65, 0.35, 7.0, 0.0, 0.0,
                180.0, 0.72, 250.0, 7200.0, 0.18, 0.24, 4.0, 0.0, 45.0, 0, 0,
            )
        }, 0);
        assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, 60, 110) }, 0);
        let mut audible = vec![0.0_f32; 1024 * 2];
        unsafe { hk_runtime_render(engine.pointer(), audible.as_mut_ptr(), 1024, 2) };
        assert!(audible.iter().any(|sample| sample.abs() > 0.00001));
    }

    #[test]
    fn metronome_renders_through_the_shared_output() {
        let engine = NativeRuntime::new(48_000.0, 512).expect("runtime");
        unsafe {
            hk_runtime_configure_metronome(engine.pointer(), 1, 120.0, 1.0, 1, 1, 0, 4);
        }
        let mut output = vec![0.0_f32; 2048 * 2];
        unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 2048, 2) };
        assert!(output.iter().any(|sample| sample.abs() > 0.00001));
    }
}
