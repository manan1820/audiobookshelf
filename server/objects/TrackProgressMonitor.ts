import type { ProgressCallback, TrackFinishedCallback, TrackStartedCallback } from '../types'

class TrackProgressMonitor {
  trackDurations: number[]
  totalDuration: number
  trackStartedCallback: TrackStartedCallback
  progressCallback: ProgressCallback
  trackFinishedCallback: TrackFinishedCallback
  currentTrackIndex: number
  cummulativeProgress: number
  currentTrackPercentage: number
  currentTrackProgress: number
  numTracks: number
  allTracksFinished: boolean

  constructor(
    trackDurations: number[],
    trackStartedCallback: TrackStartedCallback,
    progressCallback: ProgressCallback,
    trackFinishedCallback: TrackFinishedCallback
  ) {
    this.trackDurations = trackDurations
    this.totalDuration = trackDurations.reduce((total, duration) => total + duration, 0)
    this.trackStartedCallback = trackStartedCallback
    this.progressCallback = progressCallback
    this.trackFinishedCallback = trackFinishedCallback
    this.currentTrackIndex = -1
    this.cummulativeProgress = 0
    this.currentTrackPercentage = 0
    this.currentTrackProgress = 0
    this.numTracks = this.trackDurations.length
    this.allTracksFinished = false
    this.#moveToNextTrack()
  }

  #outsideCurrentTrack(progress: number): boolean {
    this.currentTrackProgress = progress - this.cummulativeProgress
    return this.currentTrackProgress >= this.currentTrackPercentage
  }

  #moveToNextTrack(): void {
    if (this.currentTrackIndex >= 0) this.#trackFinished()
    this.currentTrackIndex++
    this.cummulativeProgress += this.currentTrackPercentage
    if (this.currentTrackIndex >= this.numTracks) {
      this.allTracksFinished = true
      return
    }
    this.currentTrackPercentage = (this.trackDurations[this.currentTrackIndex] / this.totalDuration) * 100
    this.#trackStarted()
  }

  #trackStarted(): void {
    this.trackStartedCallback(this.currentTrackIndex)
  }

  #progressUpdated(totalProgress: number): void {
    const progressInTrack = (this.currentTrackProgress / this.currentTrackPercentage) * 100
    this.progressCallback(this.currentTrackIndex, progressInTrack, totalProgress)
  }

  #trackFinished(): void {
    this.trackFinishedCallback(this.currentTrackIndex)
  }

  update(totalProgress: number): void {
    while (this.#outsideCurrentTrack(totalProgress) && !this.allTracksFinished) {
      this.#moveToNextTrack()
    }
    if (!this.allTracksFinished) {
      this.#progressUpdated(totalProgress)
    }
  }

  finish(): void {
    this.update(101)
  }
}

export = TrackProgressMonitor
