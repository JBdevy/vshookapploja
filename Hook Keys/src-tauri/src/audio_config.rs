use cpal::{SampleFormat, SupportedStreamConfig, SupportedStreamConfigRange};

// Keep the stream within the DSP's supported range. Otherwise the native
// runtime clamps its own clock while the device consumes samples faster.
pub const MIN_SAMPLE_RATE: u32 = 8_000;
pub const MAX_SAMPLE_RATE: u32 = 384_000;

fn supported_format(format: SampleFormat) -> bool {
    matches!(format, SampleFormat::F32 | SampleFormat::F64 | SampleFormat::I16 | SampleFormat::U16)
}

pub fn usable_default(config: &SupportedStreamConfig, channels: u16, default_layout: bool) -> bool {
    (1..=32).contains(&config.channels())
        && (default_layout || config.channels() == channels)
        && (MIN_SAMPLE_RATE..=MAX_SAMPLE_RATE).contains(&config.sample_rate())
        && supported_format(config.sample_format())
}

pub fn select_config(
    default: Option<SupportedStreamConfig>,
    ranges: impl IntoIterator<Item = SupportedStreamConfigRange>,
    channels: u16,
    default_layout: bool,
) -> Option<SupportedStreamConfig> {
    if let Some(config) = default.as_ref().filter(|c| usable_default(c, channels, default_layout)) {
        return Some(config.clone());
    }
    let preferred = default.as_ref().map(|c| c.sample_rate())
        .filter(|rate| (MIN_SAMPLE_RATE..=MAX_SAMPLE_RATE).contains(rate))
        .unwrap_or(48_000);
    ranges.into_iter().filter_map(|range| {
        if range.channels() != channels || !supported_format(range.sample_format()) { return None; }
        let min = range.min_sample_rate().max(MIN_SAMPLE_RATE);
        let max = range.max_sample_rate().min(MAX_SAMPLE_RATE);
        if min > max { return None; }
        let rate = [preferred, 48_000, 44_100].into_iter()
            .find(|rate| (min..=max).contains(rate))
            .unwrap_or_else(|| preferred.clamp(min, max));
        // Rate compatibility precedes sample format and range maximum. WASAPI
        // advertises each convertible rate separately, including 1,536,000 Hz.
        let preference = if rate == preferred { 0 } else if rate == 48_000 { 1 }
            else if rate == 44_100 { 2 } else { 3 };
        let format = if range.sample_format() == SampleFormat::F32 { 0 }
            else if range.sample_format() == SampleFormat::F64 { 1 } else { 2 };
        Some(((preference, rate.abs_diff(preferred), format), range.with_sample_rate(rate)))
    }).min_by_key(|(rank, _)| *rank).map(|(_, config)| config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpal::SupportedBufferSize;

    fn range(channels: u16, min: u32, max: u32) -> SupportedStreamConfigRange {
        SupportedStreamConfigRange::new(channels, min, max, SupportedBufferSize::Unknown, SampleFormat::F32)
    }

    #[test]
    fn named_device_keeps_its_native_clock_despite_high_resampling_rates() {
        for rate in [44_100, 48_000, 96_000] {
            let default = range(2, rate, rate).with_sample_rate(rate);
            let selected = select_config(Some(default), [range(2, rate, rate), range(2, 1_536_000, 1_536_000)], 2, false).unwrap();
            assert_eq!(selected.sample_rate(), rate);
        }
    }

    #[test]
    fn discrete_rates_choose_48000_even_when_default_query_fails() {
        let selected = select_config(None, [range(2, 1_536_000, 1_536_000), range(2, 192_000, 192_000), range(2, 48_000, 48_000), range(2, 44_100, 44_100)], 2, false).unwrap();
        assert_eq!(selected.sample_rate(), 48_000);
    }

    #[test]
    fn multichannel_route_preserves_default_clock_and_requested_channels() {
        let selected = select_config(Some(range(2, 44_100, 44_100).with_sample_rate(44_100)),
            [range(8, 8_000, 1_536_000)], 8, false).unwrap();
        assert_eq!(selected.sample_rate(), 44_100);
        assert_eq!(selected.channels(), 8);
    }

    #[test]
    fn unsupported_rates_cannot_silently_diverge_from_dsp_clock() {
        let default = range(2, 1_536_000, 1_536_000).with_sample_rate(1_536_000);
        assert!(select_config(Some(default), [range(2, 1_536_000, 1_536_000), range(2, 5_512, 5_512)], 2, false).is_none());
    }
}
