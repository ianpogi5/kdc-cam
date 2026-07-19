# Changelog

All notable changes to KDC Cam are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- The stamp's timestamp now includes the day of the week (e.g. "Monday").

## [1.2.1] - 2026-07-18

### Fixed
- The timestamp burned into videos now ticks second by second while recording
  (and the location stays live), instead of staying frozen at the moment the
  recording started.

## [1.2.0] - 2026-07-18

### Added
- The stamp's timestamp now includes seconds, so consecutive captures are
  distinguishable and video stamps don't look frozen.
- Landscape support: rotate the phone and the camera UI follows; photos and
  videos come out upright with the stamp along the bottom edge, on both the
  back and front cameras.
- A brief shutter flash when taking a photo, so there's visible confirmation
  of the capture.

### Fixed
- The screen no longer dims or locks while the camera is open or a video is
  recording.

## [1.1.0] - 2026-06-21
### Added
- Swipe left or right while viewing a photo or video to move to the next or
  previous capture.
- Delete button while viewing a photo or video, with a confirmation prompt.

### Fixed
- Front-camera videos now burn the stamp upright and correctly positioned along
  the bottom (it could previously come out upside down).
- The hardware back button now returns to the previous screen instead of exiting
  the app while browsing the gallery or viewing a capture.

## [1.0.0] - 2026-06-20
### Added
- Take photos and record videos with a live GPS location (reverse-geocoded
  address + coordinates) and timestamp stamped across the bottom.
- The stamp is **burned into both photos and videos in real time** (CameraX), so
  it survives sharing and export — videos save instantly with no re-encode.
- Built-in gallery to browse, play, and delete captures.
- Captures are also saved to the device's photo library.
- Screen stays at full brightness while recording.
