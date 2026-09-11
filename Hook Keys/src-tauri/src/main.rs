use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

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

#[tauri::command]
fn list_audio_output_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    host.output_devices().map(|devices| devices.enumerate().filter_map(|(index, device)| {
        let name = device.name().ok()?;
        let channels = device.supported_output_configs().ok()?
            .map(|config| config.channels()).max().unwrap_or(2).clamp(1, 32);
        Some(AudioDevice { id: format!("desktop-audio-{index}-{name}"), name, channels })
    }).collect()).unwrap_or_default()
}

#[tauri::command]
fn list_midi_input_devices() -> Vec<MidiDevice> {
    let Ok(input) = midir::MidiInput::new("Hook Keys") else { return vec![] };
    input.ports().iter().enumerate().map(|(index, port)| MidiDevice {
        id: format!("desktop-midi-{index}"),
        name: input.port_name(port).unwrap_or_else(|_| format!("MIDI {}", index + 1)),
    }).collect()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_audio_output_devices, list_midi_input_devices])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar Hook Keys");
}

