import { expect } from 'chai'
import sinon from 'sinon'
import fs from '../../../server/libs/fsExtra'
import EventEmitter from 'events'
import { generateFFMetadata, addCoverAndMetadataToFile } from '../../../server/utils/ffmpegHelpers'
import { FFMetadataChapter } from '../../../server/types'
import Ffmpeg from '../../../server/libs/fluentFfmpeg'

declare global {
  var isWin: boolean | undefined
}

global.isWin = process.platform === 'win32'

interface TestSetup {
  audioFilePath: string
  coverFilePath: string | null
  metadataFilePath: string
  track: number
  mimeType: string
  ffmpegStub: EventEmitter & {
    input: sinon.SinonStub
    outputOptions: sinon.SinonStub
    output: sinon.SinonStub
    run: sinon.SinonStub
  }
  copyStub: sinon.SinonStub
  fsRemoveStub: sinon.SinonStub
}

describe('generateFFMetadata', () => {
  function createTestSetup(): { metadata: Record<string, string>; chapters: FFMetadataChapter[] } {
    const metadata = {
      title: 'My Audiobook',
      artist: 'John Doe',
      album: 'Best Audiobooks'
    }

    const chapters: FFMetadataChapter[] = [
      { start: 0, end: 1000, title: 'Chapter 1' },
      { start: 1000, end: 2000, title: 'Chapter 2' }
    ]

    return { metadata, chapters }
  }

  let metadata: Record<string, string>
  let chapters: FFMetadataChapter[] | null
  beforeEach(() => {
    const input = createTestSetup()
    metadata = input.metadata
    chapters = input.chapters
  })

  it('should generate ffmetadata content with chapters', () => {
    const result = generateFFMetadata(metadata, chapters)

    expect(result).to.equal(
      ';FFMETADATA1\ntitle=My Audiobook\nartist=John Doe\nalbum=Best Audiobooks\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000000\ntitle=Chapter 1\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=1000000\nEND=2000000\ntitle=Chapter 2\n'
    )
  })

  it('should generate ffmetadata content without chapters', () => {
    chapters = null

    const result = generateFFMetadata(metadata, chapters)

    expect(result).to.equal(';FFMETADATA1\ntitle=My Audiobook\nartist=John Doe\nalbum=Best Audiobooks\n')
  })

  it('should handle chapters with no title', () => {
    chapters = [
      { start: 0, end: 1000 },
      { start: 1000, end: 2000 }
    ]

    const result = generateFFMetadata(metadata, chapters)

    expect(result).to.equal(
      ';FFMETADATA1\ntitle=My Audiobook\nartist=John Doe\nalbum=Best Audiobooks\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000000\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=1000000\nEND=2000000\n'
    )
  })

  it('should handle metadata escaping special characters (=, ;, #,  and a newline)', () => {
    metadata.title = 'My Audiobook; with = special # characters\n'
    chapters![0]!.title = 'Chapter #1'

    const result = generateFFMetadata(metadata, chapters)

    expect(result).to.equal(
      ';FFMETADATA1\ntitle=My Audiobook\\; with \\= special \\# characters\\\n\nartist=John Doe\nalbum=Best Audiobooks\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000000\ntitle=Chapter \\#1\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=1000000\nEND=2000000\ntitle=Chapter 2\n'
    )
  })
})

describe('addCoverAndMetadataToFile', () => {
  function createTestSetup(): TestSetup {
    const audioFilePath = '/path/to/audio/file.mp3'
    const coverFilePath = '/path/to/cover/image.jpg'
    const metadataFilePath = '/path/to/metadata/file.txt'
    const track = 1
    const mimeType = 'audio/mpeg'

    const ffmpegStub = new EventEmitter() as EventEmitter & {
      input: sinon.SinonStub
      outputOptions: sinon.SinonStub
      output: sinon.SinonStub
      run: sinon.SinonStub
    }
    ffmpegStub.input = sinon.stub().returnsThis()
    ffmpegStub.outputOptions = sinon.stub().returnsThis()
    ffmpegStub.output = sinon.stub().returnsThis()
    ffmpegStub.run = sinon.stub().callsFake(() => {
      ffmpegStub.emit('end')
    })
    const copyStub = sinon.stub().resolves()
    const fsRemoveStub = sinon.stub(fs, 'remove').resolves()

    return { audioFilePath, coverFilePath, metadataFilePath, track, mimeType, ffmpegStub, copyStub, fsRemoveStub }
  }

  let audioFilePath: string
  let coverFilePath: string | null
  let metadataFilePath: string
  let track: number
  let mimeType: string
  let ffmpegStub: TestSetup['ffmpegStub']
  let copyStub: sinon.SinonStub
  let fsRemoveStub: sinon.SinonStub

  beforeEach(() => {
    const input = createTestSetup()
    audioFilePath = input.audioFilePath
    coverFilePath = input.coverFilePath
    metadataFilePath = input.metadataFilePath
    track = input.track
    mimeType = input.mimeType
    ffmpegStub = input.ffmpegStub
    copyStub = input.copyStub
    fsRemoveStub = input.fsRemoveStub
  })

  it('should add cover image and metadata to audio file', async () => {
    // Act
    await addCoverAndMetadataToFile(
      audioFilePath,
      coverFilePath,
      metadataFilePath,
      track,
      mimeType,
      null,
      ffmpegStub as unknown as Ffmpeg.FfmpegCommand,
      copyStub
    )

    // Assert
    expect(ffmpegStub.input.calledThrice).to.be.true
    expect(ffmpegStub.input.getCall(0).args[0]).to.equal(audioFilePath)
    expect(ffmpegStub.input.getCall(1).args[0]).to.equal(metadataFilePath)
    expect(ffmpegStub.input.getCall(2).args[0]).to.equal(coverFilePath)

    expect(ffmpegStub.outputOptions.callCount).to.equal(4)
    expect(ffmpegStub.outputOptions.getCall(0).args[0]).to.deep.equal([
      '-map 0:a',
      '-map_metadata 1',
      '-map_metadata 0',
      '-map_chapters 1',
      '-c copy'
    ])
    expect(ffmpegStub.outputOptions.getCall(1).args[0]).to.deep.equal(['-metadata track=1'])
    expect(ffmpegStub.outputOptions.getCall(2).args[0]).to.deep.equal(['-id3v2_version 3'])
    expect(ffmpegStub.outputOptions.getCall(3).args[0]).to.deep.equal([
      '-map 2:v',
      '-disposition:v:0 attached_pic',
      '-metadata:s:v',
      'title=Cover',
      '-metadata:s:v',
      'comment=Cover'
    ])

    expect(ffmpegStub.output.calledOnce).to.be.true
    expect(ffmpegStub.output.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')

    expect(ffmpegStub.run.calledOnce).to.be.true

    expect(copyStub.calledOnce).to.be.true
    expect(copyStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')
    expect(copyStub.firstCall.args[1]).to.equal('/path/to/audio/file.mp3')
    expect(fsRemoveStub.calledOnce).to.be.true
    expect(fsRemoveStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')

    // Restore the stub
    sinon.restore()
  })

  it('should handle missing cover image', async () => {
    // Arrange
    coverFilePath = null

    // Act
    await addCoverAndMetadataToFile(
      audioFilePath,
      coverFilePath,
      metadataFilePath,
      track,
      mimeType,
      null,
      ffmpegStub as unknown as Ffmpeg.FfmpegCommand,
      copyStub
    )

    // Assert
    expect(ffmpegStub.input.calledTwice).to.be.true
    expect(ffmpegStub.input.getCall(0).args[0]).to.equal(audioFilePath)
    expect(ffmpegStub.input.getCall(1).args[0]).to.equal(metadataFilePath)

    expect(ffmpegStub.outputOptions.callCount).to.equal(4)
    expect(ffmpegStub.outputOptions.getCall(0).args[0]).to.deep.equal([
      '-map 0:a',
      '-map_metadata 1',
      '-map_metadata 0',
      '-map_chapters 1',
      '-c copy'
    ])
    expect(ffmpegStub.outputOptions.getCall(1).args[0]).to.deep.equal(['-metadata track=1'])
    expect(ffmpegStub.outputOptions.getCall(2).args[0]).to.deep.equal(['-id3v2_version 3'])
    expect(ffmpegStub.outputOptions.getCall(3).args[0]).to.deep.equal(['-map 0:v?'])

    expect(ffmpegStub.output.calledOnce).to.be.true
    expect(ffmpegStub.output.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')

    expect(ffmpegStub.run.calledOnce).to.be.true

    expect(copyStub.callCount).to.equal(1)
    expect(copyStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')
    expect(copyStub.firstCall.args[1]).to.equal('/path/to/audio/file.mp3')
    expect(fsRemoveStub.calledOnce).to.be.true
    expect(fsRemoveStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')

    // Restore the stub
    sinon.restore()
  })

  it('should handle error during ffmpeg execution', async () => {
    // Arrange
    ffmpegStub.run = sinon.stub().callsFake(() => {
      ffmpegStub.emit('error', new Error('FFmpeg error'))
    })

    // Act
    try {
      await addCoverAndMetadataToFile(
        audioFilePath,
        coverFilePath,
        metadataFilePath,
        track,
        mimeType,
        null,
        ffmpegStub as unknown as Ffmpeg.FfmpegCommand,
        copyStub
      )
      expect.fail('Expected an error to be thrown')
    } catch (error: unknown) {
      // Assert
      expect((error as Error).message).to.equal('FFmpeg error')
    }

    // Assert
    expect(ffmpegStub.input.calledThrice).to.be.true
    expect(ffmpegStub.input.getCall(0).args[0]).to.equal(audioFilePath)
    expect(ffmpegStub.input.getCall(1).args[0]).to.equal(metadataFilePath)
    expect(ffmpegStub.input.getCall(2).args[0]).to.equal(coverFilePath)

    expect(ffmpegStub.outputOptions.callCount).to.equal(4)
    expect(ffmpegStub.outputOptions.getCall(0).args[0]).to.deep.equal([
      '-map 0:a',
      '-map_metadata 1',
      '-map_metadata 0',
      '-map_chapters 1',
      '-c copy'
    ])
    expect(ffmpegStub.outputOptions.getCall(1).args[0]).to.deep.equal(['-metadata track=1'])
    expect(ffmpegStub.outputOptions.getCall(2).args[0]).to.deep.equal(['-id3v2_version 3'])
    expect(ffmpegStub.outputOptions.getCall(3).args[0]).to.deep.equal([
      '-map 2:v',
      '-disposition:v:0 attached_pic',
      '-metadata:s:v',
      'title=Cover',
      '-metadata:s:v',
      'comment=Cover'
    ])

    expect(ffmpegStub.output.calledOnce).to.be.true
    expect(ffmpegStub.output.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.mp3')

    expect(ffmpegStub.run.calledOnce).to.be.true

    expect(copyStub.called).to.be.false
    expect(fsRemoveStub.called).to.be.false

    // Restore the stub
    sinon.restore()
  })

  it('should handle m4b embedding', async () => {
    // Arrange
    mimeType = 'audio/mp4'
    audioFilePath = '/path/to/audio/file.m4b'

    // Act
    await addCoverAndMetadataToFile(
      audioFilePath,
      coverFilePath,
      metadataFilePath,
      track,
      mimeType,
      null,
      ffmpegStub as unknown as Ffmpeg.FfmpegCommand,
      copyStub
    )

    // Assert
    expect(ffmpegStub.input.calledThrice).to.be.true
    expect(ffmpegStub.input.getCall(0).args[0]).to.equal(audioFilePath)
    expect(ffmpegStub.input.getCall(1).args[0]).to.equal(metadataFilePath)
    expect(ffmpegStub.input.getCall(2).args[0]).to.equal(coverFilePath)

    expect(ffmpegStub.outputOptions.callCount).to.equal(4)
    expect(ffmpegStub.outputOptions.getCall(0).args[0]).to.deep.equal([
      '-map 0:a',
      '-map_metadata 1',
      '-map_metadata 0',
      '-map_chapters 1',
      '-c copy'
    ])
    expect(ffmpegStub.outputOptions.getCall(1).args[0]).to.deep.equal(['-metadata track=1'])
    expect(ffmpegStub.outputOptions.getCall(2).args[0]).to.deep.equal(['-f mp4'])
    expect(ffmpegStub.outputOptions.getCall(3).args[0]).to.deep.equal([
      '-map 2:v',
      '-disposition:v:0 attached_pic',
      '-metadata:s:v',
      'title=Cover',
      '-metadata:s:v',
      'comment=Cover'
    ])

    expect(ffmpegStub.output.calledOnce).to.be.true
    expect(ffmpegStub.output.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.m4b')

    expect(ffmpegStub.run.calledOnce).to.be.true

    expect(copyStub.calledOnce).to.be.true
    expect(copyStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.m4b')
    expect(copyStub.firstCall.args[1]).to.equal('/path/to/audio/file.m4b')
    expect(fsRemoveStub.calledOnce).to.be.true
    expect(fsRemoveStub.firstCall.args[0]).to.equal('/path/to/audio/file.tmp.m4b')

    // Restore the stub
    sinon.restore()
  })
})
