use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, Instant};

// Bit 0: a callback owns the engine. Bit 1: stream handoff forbids entry.
#[derive(Default)]
pub struct CallbackGate(AtomicU8);

pub struct CallbackGuard<'a>(&'a CallbackGate);

impl CallbackGate {
    pub fn enter(&self) -> Option<CallbackGuard<'_>> {
        self.0.compare_exchange(0, 1, Ordering::Acquire, Ordering::Relaxed)
            .ok().map(|_| CallbackGuard(self))
    }

    // Control thread only. CPAL's pause merely queues a command on Windows;
    // wait for the last old callback before starting another on the same DSP.
    pub fn suspend_and_wait(&self) -> bool {
        self.0.fetch_or(2, Ordering::AcqRel);
        let deadline = Instant::now() + Duration::from_millis(500);
        while self.0.load(Ordering::Acquire) != 2 {
            if Instant::now() >= deadline { return false; }
            std::thread::sleep(Duration::from_millis(1));
        }
        true
    }

    pub fn resume(&self) { self.0.fetch_and(1, Ordering::Release); }
}

impl Drop for CallbackGuard<'_> {
    fn drop(&mut self) { self.0.0.fetch_sub(1, Ordering::Release); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handoff_waits_for_callback_and_blocks_new_entries() {
        let gate = CallbackGate::default();
        let active = gate.enter().unwrap();
        assert!(gate.enter().is_none());
        std::thread::scope(|scope| {
            let waiting = scope.spawn(|| gate.suspend_and_wait());
            while gate.0.load(Ordering::Acquire) != 3 { std::thread::yield_now(); }
            assert!(gate.enter().is_none());
            drop(active);
            assert!(waiting.join().unwrap());
        });
        assert!(gate.enter().is_none());
        gate.resume();
        assert!(gate.enter().is_some());
    }
}
