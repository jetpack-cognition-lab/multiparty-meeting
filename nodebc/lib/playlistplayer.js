const { EventEmitter } = require('events')
const { sequelize, User, Track, Playlist, PlaylistItem, Vote } = require('./models/plb-models')
const Sequelize = require('sequelize')
const Op = Sequelize.Op

class PlaylistPlayer extends EventEmitter {
  constructor(playlist, fileRoot, soupClient) {
    super()
    this.playlist = playlist
    this.state = 'STOPPED'
    this.currentItem = null
    this.pipeline = null
    this.fileRoot = fileRoot
    this.soupClient = soupClient
    this.soupClient.on('play_done', this.playDoneHandler.bind(this))
  }

  async playDoneHandler() {
    if (this.state !== 'STOPPED') {
      this.state = 'WAITING'
      console.log("PLAY_DONE")
      await this.soupClient.stopCurrentTrack()
      if (this.currentItem) {
        this.currentItem.played = true
        this.currentItem.playedToEnd = true
        this.currentItem.playedAt = new Date()
        this.currentItem.Track.createPlay()
        await this.currentItem.save()
      }
      await new Promise(r => setTimeout(r, 100))
    }
    this.playNext()
  }

  async createPipelineForTrack(track) {
    await this.soupClient.stopProducers()
    await this.soupClient.startProducers()
    const {
      videoTransportIp,
      videoTransportPort,
      videoTransportRtcpPort,
      videoPt,
      videoSSRC,
      audioTransportIp,
      audioTransportPort,
      audioTransportRtcpPort,
      audioPt,
      audioSSRC,
    } = this.soupClient.transportOpts

    console.log("transportOpts:", this.soupClient.transportOpts)

    let isVideo = false
    if (
      track.filepath.match(/\.mkv$/)
      || track.filepath.match(/\.mp4$/)
      || track.filepath.match(/\.m4v$/)
    ) { isVideo = true }



    let command
    let args
    if (isVideo) {
      let demux = 'qtdemux name=demux'
      if (track.filepath.match(/\.mkv$/)) {
        demux = 'matroskademux name=demux'
      }



      command = '/usr/bin/ffmpeg'
      args = [
        '-re',
        '-v',
        'info',
        '-stream_loop',
        '0',
        '-i',
        `${this.fileRoot}/${track.filepath}`,
        '-map',
        '0:a:0',
        '-acodec',
        'libopus',
        '-ab',
        '128k',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-map',
        '0:v:0',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'scale=w=640:h=480:force_original_aspect_ratio=decrease',

        '-c:v',
        'libvpx',
        '-b:v',
        '2M',
        '-deadline',
        'realtime',
        '-cpu-used',
        '4',

        // '-strict',
        // 'experimental',
        // '-c:v',
        // 'libvpx-vp9',
        // '-b:v',
        // '1M',
        // '-minrate',
        // '1M',
        // '-maxrate',
        // '1M',
        // '-deadline',
        // 'realtime',
        // '-cpu-used',
        // '4',

        // '-c:v',
        // 'libx264',
        // '-profile:v',
        // 'baseline',
        // '-b:v',
        // '1M',
        // '-preset',
        // 'fast',

        '-f',
        'tee',
        `[select=a:f=rtp:ssrc=${audioSSRC}:payload_type=${audioPt}]rtp://${audioTransportIp}:${audioTransportPort}|[select=v:f=rtp:ssrc=${videoSSRC}:payload_type=${videoPt}]rtp://${videoTransportIp}:${videoTransportPort}\?pkt_size=1200`,
      ]

    } else {
      command = '/usr/bin/ffmpeg'
      args = [
        '-re',
        '-v',
        'info',
        '-stream_loop',
        '0',
        '-i',
        `${this.fileRoot}/${track.filepath}`,
        '-map',
        '0:a:0',
        '-acodec',
        'libopus',
        '-ab',
        '128k',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-f',
        'tee',
        `[select=a:f=rtp:ssrc=${audioSSRC}:payload_type=${audioPt}]rtp://${audioTransportIp}:${audioTransportPort}\?pkt_size=1200`
      ]
    }
    // console.log("command:", command)
    // console.log("args:", args)
    // this.soupClient.execGstCommand(command)  
    this.soupClient.execGstCommand2(command, args)
  }

  async getNextPlaylistItem() {
    const count = await this.playlist.countPlaylistItems()
    if (count === 0) {
      this.soupClient.sendChatMessage(`The playlist is empty`)
      return
    }

    // if we have a current Item, get the sort value and try to get the next item
    // if there is none, loop around and get the first (lowest sort) of the playlist.
    // (for a playlist in random mode (not yet implemented), get a random entry every time)
    let next
    if (this.currentItem) {
      next = await this.playlist.getPlaylistItems({ where: { sort: { [Op.gt]: this.currentItem.sort } }, include: [Track], order: [['sort', 'ASC']], limit: 1 })
      if (next.length > 0) {
        next = next[0]
        return next
      }
    }
    // wrap playlist around
    next = await this.playlist.getPlaylistItems({ include: [Track], order: [['sort', 'ASC']], limit: 1 })
    next = next[0]
    return next
  }

  async skip() {
    if (this.currentItem) {
      this.currentItem.playedToEnd = false
      this.currentItem.save()
    }
    this.soupClient.stopCurrentTrack()
  }

  async stop() {
    this.state = 'STOPPED'
    if (this.currentItem) {
      this.currentItem.playedToEnd = false
      this.currentItem.save()
    }
    await this.soupClient.stopCurrentTrack()
    this.currentItem = null
  }

  async start() {
    if (this.state === 'STOPPED') {
      await this.play()
      this.soupClient.sendChatMessage(`Started.`)
    } else {
      this.soupClient.sendChatMessage(`Already started.`)
    }
  }

  async playNext() {
    if (this.state === 'WAITING') {
      try {
        this.playlist = await Playlist.findByPk(this.playlist.id)
        this.currentItem = await this.getNextPlaylistItem()
        console.log("currentItem:", this.currentItem.id)
        this.soupClient.sendChatMessage(`Playing ${this.currentItem.Track.filepath}`)
        this.soupClient.sendRequest("changeDisplayName", { "displayName": this.currentItem.Track.name })

        this.currentItem.played = true
        this.currentItem.playedToEnd = true
        this.currentItem.playedAt = new Date()
        this.currentItem.Track.createPlay()
        await this.currentItem.save()

        this.state = 'PLAYING'
        this.createPipelineForTrack(this.currentItem.Track)
        console.log("created pipeline:", this.currentItem.id)
      } catch (e) {
        console.log("catcheds error:", e)
        this.soupClient.sendChatMessage(`Error ${e}`)
        this.state = 'STOPPED'
        this.currentItem = null
      }
    }
  }

  async play() {
    console.log("playlist: PLAY!")
    // get a fresh version of the playlist from mthe database
    this.playlist = await Playlist.findByPk(this.playlist.id)
    console.log("playlist:", this.playlist)
    // set state to 'PLAYING'
    this.state = 'WAITING'
    this.playNext()
  }
}


module.exports = {
  PlaylistPlayer
}

