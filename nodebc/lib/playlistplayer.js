const { EventEmitter } = require('events')
const { sequelize, User, Track, Playlist, PlaylistItem, Vote } = require('./models/plb-models')
const { Sequelize } = require('sequelize')

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
        '-c:v',
        'libvpx',
        '-b:v',
        '2000k',
        '-deadline',
        'realtime',
        '-cpu-used',
        '4',
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
    // if (count === 0) {
    //   throw new Error('empty playlist')
    // }

    let next = await this.playlist.getPlaylistItems({ where: { played: false }, include: [Track], order: [['sort', 'ASC']], limit: 1 })
    if (next.length > 0) {
      next = next[0]
    } else {
      // we have no unplayed items, create a new one from a random track
      const track = await Track.findOne({ state: 'READY', order: [Sequelize.literal('RANDOM()')] })
      // console.log('track:', track)
      const maxPli = await this.playlist.getPlaylistItems({ order: [['sort', 'DESC']], limit: 1 })
      // console.log('maxPli:', maxPli)
      next = await track.createPlaylistItem({
        sort: 1.0 + (maxPli[0] && maxPli[0].sort > 0 ? maxPli[0].sort : 0),
        PlaylistId: this.playlist.id
      })
      next.Track = track
      next = await next.save()
      // console.log('next:', next)

      // next = await this.playlist.getPlaylistItems({include: [Track], order: [Sequelize.literal('RANDOM()')], limit: 1})
      // next = next[0]
    }
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
    await this.soupClient.stopCurrentTrack()
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

