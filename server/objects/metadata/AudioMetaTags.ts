import type { AudioMetaTagsJsonObject, AudioMetaTagsProbePayload } from '../../types'

const TAG_KEYS = [
  'tagAlbum',
  'tagAlbumSort',
  'tagArtist',
  'tagArtistSort',
  'tagGenre',
  'tagTitle',
  'tagTitleSort',
  'tagSeries',
  'tagSeriesPart',
  'tagGrouping',
  'tagTrack',
  'tagDisc',
  'tagSubtitle',
  'tagAlbumArtist',
  'tagDate',
  'tagComposer',
  'tagPublisher',
  'tagComment',
  'tagDescription',
  'tagEncoder',
  'tagEncodedBy',
  'tagIsbn',
  'tagLanguage',
  'tagASIN',
  'tagItunesId',
  'tagPodcastType',
  'tagEpisodeType',
  'tagOverdriveMediaMarker',
  'tagOriginalYear',
  'tagReleaseCountry',
  'tagReleaseType',
  'tagReleaseStatus',
  'tagISRC',
  'tagMusicBrainzTrackId',
  'tagMusicBrainzAlbumId',
  'tagMusicBrainzAlbumArtistId',
  'tagMusicBrainzArtistId'
] as const

type TagKey = (typeof TAG_KEYS)[number]

class AudioMetaTags {
  tagAlbum: string | null = null
  tagAlbumSort: string | null = null
  tagArtist: string | null = null
  tagArtistSort: string | null = null
  tagGenre: string | null = null
  tagTitle: string | null = null
  tagTitleSort: string | null = null
  tagSeries: string | null = null
  tagSeriesPart: string | null = null
  tagGrouping: string | null = null
  tagTrack: string | null = null
  tagDisc: string | null = null
  tagSubtitle: string | null = null
  tagAlbumArtist: string | null = null
  tagDate: string | null = null
  tagComposer: string | null = null
  tagPublisher: string | null = null
  tagComment: string | null = null
  tagDescription: string | null = null
  tagEncoder: string | null = null
  tagEncodedBy: string | null = null
  tagIsbn: string | null = null
  tagLanguage: string | null = null
  tagASIN: string | null = null
  tagItunesId: string | null = null
  tagPodcastType: string | null = null
  tagEpisodeType: string | null = null
  tagOverdriveMediaMarker: string | null = null
  tagOriginalYear: string | null = null
  tagReleaseCountry: string | null = null
  tagReleaseType: string | null = null
  tagReleaseStatus: string | null = null
  tagISRC: string | null = null
  tagMusicBrainzTrackId: string | null = null
  tagMusicBrainzAlbumId: string | null = null
  tagMusicBrainzAlbumArtistId: string | null = null
  tagMusicBrainzArtistId: string | null = null

  constructor(metadata?: Partial<AudioMetaTagsJsonObject> | null) {
    if (metadata) {
      this.construct(metadata)
    }
  }

  toJSON(): AudioMetaTagsJsonObject {
    const json: AudioMetaTagsJsonObject = {}
    for (const key of TAG_KEYS) {
      if (this[key]) {
        json[key] = this[key]
      }
    }
    return json
  }

  get trackNumAndTotal(): { number: number | null; total: number | null } {
    const data: { number: number | null; total: number | null } = {
      number: null,
      total: null
    }

    if (this.tagTrack) {
      const trackParts = this.tagTrack.split('/').map((part) => Number(part))
      if (trackParts.length > 0) {
        data.number = !isNaN(trackParts[0]) ? Math.trunc(trackParts[0]) : null
      }
      if (trackParts.length > 1) {
        data.total = !isNaN(trackParts[1]) ? trackParts[1] : null
      }
    }

    return data
  }

  get discNumAndTotal(): { number: number | null; total: number | null } {
    const data: { number: number | null; total: number | null } = {
      number: null,
      total: null
    }

    if (this.tagDisc) {
      const discParts = this.tagDisc.split('/').map((p) => Number(p))
      if (discParts.length > 0) {
        data.number = !isNaN(discParts[0]) ? Math.trunc(discParts[0]) : null
      }
      if (discParts.length > 1) {
        data.total = !isNaN(discParts[1]) ? discParts[1] : null
      }
    }

    return data
  }

  get discNumber(): number | null {
    return this.discNumAndTotal.number
  }
  get discTotal(): number | null {
    return this.discNumAndTotal.total
  }
  get trackNumber(): number | null {
    return this.trackNumAndTotal.number
  }
  get trackTotal(): number | null {
    return this.trackNumAndTotal.total
  }

  construct(metadata: Partial<AudioMetaTagsJsonObject>): void {
    this.tagAlbum = metadata.tagAlbum || null
    this.tagAlbumSort = metadata.tagAlbumSort || null
    this.tagArtist = metadata.tagArtist || null
    this.tagArtistSort = metadata.tagArtistSort || null
    this.tagGenre = metadata.tagGenre || null
    this.tagTitle = metadata.tagTitle || null
    this.tagTitleSort = metadata.tagTitleSort || null
    this.tagSeries = metadata.tagSeries || null
    this.tagSeriesPart = metadata.tagSeriesPart || null
    this.tagGrouping = metadata.tagGrouping || null
    this.tagTrack = metadata.tagTrack || null
    this.tagDisc = metadata.tagDisc || null
    this.tagSubtitle = metadata.tagSubtitle || null
    this.tagAlbumArtist = metadata.tagAlbumArtist || null
    this.tagDate = metadata.tagDate || null
    this.tagComposer = metadata.tagComposer || null
    this.tagPublisher = metadata.tagPublisher || null
    this.tagComment = metadata.tagComment || null
    this.tagDescription = metadata.tagDescription || null
    this.tagEncoder = metadata.tagEncoder || null
    this.tagEncodedBy = metadata.tagEncodedBy || null
    this.tagIsbn = metadata.tagIsbn || null
    this.tagLanguage = metadata.tagLanguage || null
    this.tagASIN = metadata.tagASIN || null
    this.tagItunesId = metadata.tagItunesId || null
    this.tagPodcastType = metadata.tagPodcastType || null
    this.tagEpisodeType = metadata.tagEpisodeType || null
    this.tagOverdriveMediaMarker = metadata.tagOverdriveMediaMarker || null
    this.tagOriginalYear = metadata.tagOriginalYear || null
    this.tagReleaseCountry = metadata.tagReleaseCountry || null
    this.tagReleaseType = metadata.tagReleaseType || null
    this.tagReleaseStatus = metadata.tagReleaseStatus || null
    this.tagISRC = metadata.tagISRC || null
    this.tagMusicBrainzTrackId = metadata.tagMusicBrainzTrackId || null
    this.tagMusicBrainzAlbumId = metadata.tagMusicBrainzAlbumId || null
    this.tagMusicBrainzAlbumArtistId = metadata.tagMusicBrainzAlbumArtistId || null
    this.tagMusicBrainzArtistId = metadata.tagMusicBrainzArtistId || null
  }

  setData(payload: AudioMetaTagsProbePayload): void {
    this.tagAlbum = payload.file_tag_album || null
    this.tagAlbumSort = payload.file_tag_albumsort || null
    this.tagArtist = payload.file_tag_artist || null
    this.tagArtistSort = payload.file_tag_artistsort || null
    this.tagGenre = payload.file_tag_genre || null
    this.tagTitle = payload.file_tag_title || null
    this.tagTitleSort = payload.file_tag_titlesort || null
    this.tagSeries = payload.file_tag_series || null
    this.tagSeriesPart = payload.file_tag_seriespart || null
    this.tagGrouping = payload.file_tag_grouping || null
    this.tagTrack = payload.file_tag_track || null
    this.tagDisc = payload.file_tag_disc || null
    this.tagSubtitle = payload.file_tag_subtitle || null
    this.tagAlbumArtist = payload.file_tag_albumartist || null
    this.tagDate = payload.file_tag_date || null
    this.tagComposer = payload.file_tag_composer || null
    this.tagPublisher = payload.file_tag_publisher || null
    this.tagComment = payload.file_tag_comment || null
    this.tagDescription = payload.file_tag_description || null
    this.tagEncoder = payload.file_tag_encoder || null
    this.tagEncodedBy = payload.file_tag_encodedby || null
    this.tagIsbn = payload.file_tag_isbn || null
    this.tagLanguage = payload.file_tag_language || null
    this.tagASIN = payload.file_tag_asin || null
    this.tagItunesId = payload.file_tag_itunesid || null
    this.tagPodcastType = payload.file_tag_podcasttype || null
    this.tagEpisodeType = payload.file_tag_episodetype || null
    this.tagOverdriveMediaMarker = payload.file_tag_overdrive_media_marker || null
    this.tagOriginalYear = payload.file_tag_originalyear || null
    this.tagReleaseCountry = payload.file_tag_releasecountry || null
    this.tagReleaseType = payload.file_tag_releasetype || null
    this.tagReleaseStatus = payload.file_tag_releasestatus || null
    this.tagISRC = payload.file_tag_isrc || null
    this.tagMusicBrainzTrackId = payload.file_tag_musicbrainz_trackid || null
    this.tagMusicBrainzAlbumId = payload.file_tag_musicbrainz_albumid || null
    this.tagMusicBrainzAlbumArtistId = payload.file_tag_musicbrainz_albumartistid || null
    this.tagMusicBrainzArtistId = payload.file_tag_musicbrainz_artistid || null
  }

  updateData(payload: AudioMetaTagsProbePayload): boolean {
    const dataMap: Record<string, string | null> = {
      tagAlbum: payload.file_tag_album || null,
      tagAlbumSort: payload.file_tag_albumsort || null,
      tagArtist: payload.file_tag_artist || null,
      tagArtistSort: payload.file_tag_artistsort || null,
      tagGenre: payload.file_tag_genre || null,
      tagTitle: payload.file_tag_title || null,
      tagTitleSort: payload.file_tag_titlesort || null,
      tagSeries: payload.file_tag_series || null,
      tagSeriesPart: payload.file_tag_seriespart || null,
      tagGrouping: payload.file_tag_grouping || null,
      tagTrack: payload.file_tag_track || null,
      tagDisc: payload.file_tag_disc || null,
      tagSubtitle: payload.file_tag_subtitle || null,
      tagAlbumArtist: payload.file_tag_albumartist || null,
      tagDate: payload.file_tag_date || null,
      tagComposer: payload.file_tag_composer || null,
      tagPublisher: payload.file_tag_publisher || null,
      tagComment: payload.file_tag_comment || null,
      tagDescription: payload.file_tag_description || null,
      tagEncoder: payload.file_tag_encoder || null,
      tagEncodedBy: payload.file_tag_encodedby || null,
      tagIsbn: payload.file_tag_isbn || null,
      tagLanguage: payload.file_tag_language || null,
      tagASIN: payload.file_tag_asin || null,
      tagItunesId: payload.file_tag_itunesid || null,
      tagPodcastType: payload.file_tag_podcasttype || null,
      tagEpisodeType: payload.file_tag_episodetype || null,
      tagOverdriveMediaMarker: payload.file_tag_overdrive_media_marker || null,
      tagOriginalYear: payload.file_tag_originalyear || null,
      tagReleaseCountry: payload.file_tag_releasecountry || null,
      tagReleaseType: payload.file_tag_releasetype || null,
      tagReleaseStatus: payload.file_tag_releasestatus || null,
      tagISRC: payload.file_tag_isrc || null,
      tagMusicBrainzTrackId: payload.file_tag_musicbrainz_trackid || null,
      tagMusicBrainzAlbumId: payload.file_tag_musicbrainz_albumid || null,
      tagMusicBrainzAlbumArtistId: payload.file_tag_musicbrainz_albumartistid || null,
      tagMusicBrainzArtistId: payload.file_tag_musicbrainz_artistid || null
    }

    let hasUpdates = false
    for (const key of TAG_KEYS) {
      const val = dataMap[key]
      if (val !== this[key]) {
        this[key] = val
        hasUpdates = true
      }
    }
    return hasUpdates
  }

  clone(): AudioMetaTags {
    return new AudioMetaTags(this.toJSON())
  }

  isEqual(audioFileMetadata?: AudioMetaTags | null): boolean {
    if (!audioFileMetadata || typeof audioFileMetadata.toJSON !== 'function') return false
    const otherJson = audioFileMetadata.toJSON()
    const thisJson = this.toJSON()
    for (const key of Object.keys(thisJson) as (keyof AudioMetaTagsJsonObject)[]) {
      if (thisJson[key] !== otherJson[key]) return false
    }
    for (const key of Object.keys(otherJson) as (keyof AudioMetaTagsJsonObject)[]) {
      if (thisJson[key] !== otherJson[key]) return false
    }
    return true
  }
}

export = AudioMetaTags
