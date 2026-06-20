# Changelog

All notable changes to KDC Cam are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
