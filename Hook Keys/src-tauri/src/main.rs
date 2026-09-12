use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    BufferSize, BuildStreamError, Device, SampleFormat, Stream, StreamConfig,
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
    fn hk_runtime_create(sample_rate: f64, maximum_block_frames: usize) -> *mut c_void;
    fn hk_runtime_destroy(handle: *mut c_void);
    fn hk_runtime_load_soundfont(
        handle: *mut c_void,
        module_index: usize,
        path: *const c_char,
    ) -> i32;
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
        polyphony: i32,
        velocity_curve0: i32,
        velocity_curve1: i32,
        velocity_curve2: i32,
        velocity_curve3: i32,
        velocity_curve4: i32,
        output_channel_start: i32,
        output_channel_count: i32,
    ) -> i32;
    fn hk_runtime_configure_effects(
        handle: *mut c_void,
        module_index: usize,
        cutoff_hz: f32,
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
    ) -> i32;
    fn hk_runtime_configure_envelope(
        handle: *mut c_void,
        module_index: usize,
        attack_ms: f32,
        hold_ms: f32,
        decay_ms: f32,
        release_ms: f32,
    ) -> i32;
    fn hk_runtime_configure_synth(
        handle: *mut c_void,
        oscillator1: i32,
        oscillator2: i32,
        voice_mode: i32,
        lfo_target: i32,
        oscillator_mix: f32,
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
    ) -> i32;
    fn hk_runtime_set_tempo(handle: *mut c_void, bpm: f32) -> i32;
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
}

struct NativeRuntime(NonNull<c_void>);
unsafe impl Send for NativeRuntime {}
unsafe impl Sync for NativeRuntime {}

impl NativeRuntime {
    fn new(sample_rate: f64, block_frames: usize) -> Result<Self, String> {
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
    engine: Arc<EngineHub>,
    audio: Mutex<Option<AudioRuntime>>,
    midi: Mutex<Vec<MidiInputConnection<()>>>,
    uploads: Mutex<HashMap<usize, UploadSession>>,
    compatibility_mode: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            engine: Arc::new(EngineHub(RwLock::new(None))),
            audio: Mutex::new(None),
            midi: Mutex::new(Vec::new()),
            uploads: Mutex::new(HashMap::new()),
            compatibility_mode: Arc::new(AtomicBool::new(false)),
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthConfig {
    oscillator1: i32,
    oscillator2: i32,
    voice_mode: i32,
    lfo_target: i32,
    oscillator_mix: f32,
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectsConfig {
    module_index: usize,
    cutoff_hz: f32,
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
}

fn audio_devices() -> Vec<(Device, AudioDevice)> {
    cpal::default_host()
        .output_devices()
        .map(|devices| {
            devices
                .enumerate()
                .filter_map(|(index, device)| {
                    let name = device.description().ok()?.name().to_owned();
                    let channels = device
                        .supported_output_configs()
                        .ok()?
                        .map(|config| config.channels())
                        .max()
                        .unwrap_or(2)
                        .clamp(1, 32);
                    let id = format!("desktop-audio-{index}-{name}");
                    Some((device, AudioDevice { id, name, channels }))
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
) -> Result<(), String> {
    let device = select_device(device_id)?;
    let requested_channels = requested_channels.clamp(1, 32);
    let supported = device
        .supported_output_configs()
        .map_err(|error| error.to_string())?;
    let selected = supported
        .filter(|config| config.channels() == requested_channels)
        .max_by_key(|config| config.max_sample_rate())
        .map(|config| {
            let preferred = 48_000;
            if config.min_sample_rate() <= preferred && config.max_sample_rate() >= preferred {
                config.with_sample_rate(preferred)
            } else {
                config.with_max_sample_rate()
            }
        })
        .ok_or_else(|| {
            "A saída selecionada não oferece a quantidade de canais solicitada.".to_string()
        })?;

    let channels = selected.channels();
    let sample_rate = selected.sample_rate();
    let sample_format = selected.sample_format();
    let engine = Arc::new(NativeRuntime::new(
        sample_rate as f64,
        buffer_size.max(512) as usize,
    )?);
    let mut config: StreamConfig = selected.into();
    config.buffer_size = BufferSize::Fixed(buffer_size.clamp(32, 512));

    let stream = build_audio_stream(
        &device,
        &config,
        sample_format,
        Arc::clone(&engine),
        channels,
    )
    .or_else(|_| {
        config.buffer_size = BufferSize::Default;
        build_audio_stream(
            &device,
            &config,
            sample_format,
            Arc::clone(&engine),
            channels,
        )
    })
    .map_err(|error| error.to_string())?;
    stream.play().map_err(|error| error.to_string())?;

    let mut audio = state
        .audio
        .lock()
        .map_err(|_| "Falha ao alterar a saída de áudio.".to_string())?;
    *state
        .engine
        .0
        .write()
        .map_err(|_| "Falha ao ativar o motor de áudio.".to_string())? = Some(Arc::clone(&engine));
    *audio = Some(AudioRuntime {
        _stream: stream,
        _engine: engine,
    });
    Ok(())
}

fn build_audio_stream(
    device: &Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    engine: Arc<NativeRuntime>,
    channels: u16,
) -> Result<Stream, BuildStreamError> {
    let channel_count = channels as usize;
    match sample_format {
        SampleFormat::F32 => device.build_output_stream(
            config,
            move |output: &mut [f32], _| unsafe {
                hk_runtime_render(
                    engine.pointer(),
                    output.as_mut_ptr(),
                    output.len() / channel_count,
                    channel_count,
                )
            },
            |error| eprintln!("Hook Keys audio: {error}"),
            None,
        ),
        SampleFormat::I16 => {
            let mut scratch = Vec::<f32>::new();
            device.build_output_stream(
                config,
                move |output: &mut [i16], _| {
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
                |error| eprintln!("Hook Keys audio: {error}"),
                None,
            )
        }
        SampleFormat::U16 => {
            let mut scratch = Vec::<f32>::new();
            device.build_output_stream(
                config,
                move |output: &mut [u16], _| {
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
                |error| eprintln!("Hook Keys audio: {error}"),
                None,
            )
        }
        _ => Err(BuildStreamError::StreamConfigNotSupported),
    }
}

#[tauri::command]
fn initialize(
    buffer_size: u32,
    state: State<'_, AppState>,
) -> Result<HashMap<&'static str, bool>, String> {
    let ready = state
        .audio
        .lock()
        .map_err(|_| "Motor de áudio indisponível.".to_string())?
        .is_some();
    if !ready {
        start_audio(&state, "", 2, buffer_size)?;
    }
    Ok(HashMap::from([("ready", true)]))
}

#[tauri::command]
fn set_audio_output_device(
    device_id: String,
    channels: u16,
    buffer_size: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    start_audio(&state, &device_id, channels, buffer_size)
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
    let ok = unsafe {
        hk_runtime_configure_effects(
            engine.pointer(),
            config.module_index,
            config.cutoff_hz,
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
            config.voice_mode,
            config.lfo_target,
            config.oscillator_mix,
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
                        && matches!(data1, 0 | 6 | 7 | 10 | 16 | 32 | 100 | 101);
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

#[tauri::command]
fn begin_sound_font_upload(
    module_index: usize,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if module_index >= 8 {
        return Err("Módulo inválido.".into());
    }
    let directory = soundfont_directory(&app)?;
    let temporary = directory.join(format!("module-{module_index}.sf2.part"));
    let destination = directory.join(format!("module-{module_index}.sf2"));
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
    Ok(())
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
fn finish_sound_font_upload(module_index: usize, state: State<'_, AppState>) -> Result<(), String> {
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
    if unsafe { hk_runtime_load_soundfont(engine.pointer(), module_index, path.as_ptr()) } != 0 {
        Ok(())
    } else {
        Err("O arquivo SF2 não pôde ser carregado.".into())
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            initialize,
            list_audio_output_devices,
            list_midi_devices,
            set_audio_output_device,
            set_midi_inputs,
            configure_module,
            configure_module_effects,
            configure_module_envelope,
            configure_synth,
            send_midi,
            set_tempo,
            configure_metronome,
            set_output_gain,
            set_compatibility_mode,
            stop_all_notes,
            begin_sound_font_upload,
            append_sound_font_chunk,
            finish_sound_font_upload,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Hook Keys");
}

#[cfg(test)]
mod tests {
    use super::*;

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
                engine.pointer(), 1, 2, 1, 1, 0.35, 7.0, 0.0, 0.0,
                180.0, 0.72, 250.0, 7200.0, 0.18, 0.24, 4.0, 0.0, 45.0,
            )
        }, 0);
        assert_ne!(unsafe { hk_runtime_send_midi(engine.pointer(), 0, 0x90, 60, 110) }, 0);
        let mut output = vec![0.0_f32; 4096 * 2];
        unsafe { hk_runtime_render(engine.pointer(), output.as_mut_ptr(), 4096, 2) };
        assert!(output.iter().any(|sample| sample.abs() > 0.00001));
    }
}
