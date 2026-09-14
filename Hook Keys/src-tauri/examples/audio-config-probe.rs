// Read-only driver inventory. Does not open a stream or change device settings.
use cpal::{traits::{DeviceTrait, HostTrait}, SampleFormat};
#[path = "../src/audio_config.rs"]
mod audio_config;

fn main() {
    let host = cpal::default_host();
    for device in host.output_devices().expect("output devices") {
        println!("DEVICE {}", device.description().map(|d| d.name().to_owned()).unwrap_or_default());
        if let Ok(default) = device.default_output_config() {
            println!("  default: {} Hz, {} channels, {:?}, {:?}", default.sample_rate(), default.channels(), default.sample_format(), default.buffer_size());
        }
        if let Ok(configs) = device.supported_output_configs() {
            let configs: Vec<_> = configs.collect();
            let channels = device.default_output_config().map(|c| c.channels()).unwrap_or(2);
            if let Some(selected) = audio_config::select_config(
                device.default_output_config().ok(), configs.clone(), channels, false, 48_000) {
                println!("  Hook Keys selected: {} Hz, {} channels", selected.sample_rate(), selected.channels());
            }
            for config in configs.into_iter().filter(|c| matches!(c.sample_format(), SampleFormat::F32 | SampleFormat::F64)) {
                println!("  supported: {}..{} Hz, {} channels, {:?}", config.min_sample_rate(), config.max_sample_rate(), config.channels(), config.sample_format());
            }
        }
    }
}
