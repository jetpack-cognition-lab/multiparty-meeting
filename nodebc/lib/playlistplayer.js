const { EventEmitter } = require('events')
const { sequelize, User, Track, Playlist, PlaylistItem, Vote} = require('./models/plb-models')
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
    ) {isVideo = true}


    let command
    if (isVideo) {
      let demux = 'qtdemux name=demux'
      if (track.filepath.match(/\.mkv$/)) {
        demux = 'matroskademux name=demux'
      }

      // ! vp8enc target-bitrate=2000000 deadline=1 cpu-used=4 \
      // ! rtpvp8pay pt=${videoPt} ssrc=${videoSSRC} picture-id-mode=2 \
         // ! x264enc qp-min=18 \
         // ! rtph264pay pt=${videoPt} ssrc=${videoSSRC} \

      command = `/usr/bin/gst-launch-1.0 \
        rtpbin name=rtpbin latency=2000 rtp-profile=avpf \
        filesrc location="${this.fileRoot}/${track.filepath}" \
         ! ${demux} \
        demux.video_0 \
         ! queue \
         ! decodebin \
         ! videoconvert \
         ! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4 \
         ! queue \
         ! rtpvp8pay pt=${videoPt} ssrc=${videoSSRC} picture-id-mode=2 \
         ! rtpbin.send_rtp_sink_0 \
        rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort} \
        rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportRtcpPort} sync=false async=false \
        demux.audio_0 \
         ! queue \
         ! decodebin \
         ! audioresample \
         ! audioconvert \
         ! opusenc bitrate=128000 \
         ! queue \
         ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
         ! rtpbin.send_rtp_sink_1 \
        rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
        rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false \
      `
    } else {
      command = `/usr/bin/gst-launch-1.0 \
        rtpbin name=rtpbin latency=2000 rtp-profile=avpf \
        filesrc location="${this.fileRoot}/${track.filepath}" \
         ! queue ! decodebin ! audioconvert \
         ! audioresample \
         ! audioconvert \
         ! opusenc bitrate=128000 \
         ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
         ! rtpbin.send_rtp_sink_1 \
        rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
        rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false \
      `
    }
    console.log("command:", command)
    this.soupClient.execGstCommand(command)  
  }

  async getNextPlaylistItem() {
    const count = await this.playlist.countPlaylistItems()
    // if (count === 0) {
    //   throw new Error('empty playlist')
    // }

    let next = await this.playlist.getPlaylistItems({where: {played: false}, include: [Track], order: [['sort', 'ASC']], limit: 1})
    if (next.length > 0) {
      next = next[0]
    } else {
      // we have no unplayed items, create a new one from a random track
      const track = await Track.findOne({ state: 'READY', order: [Sequelize.literal('RANDOM()')] })
      console.log('track:', track)
      const maxPli = await this.playlist.getPlaylistItems({order: [['sort', 'DESC']], limit: 1})
      console.log('maxPli:', maxPli)
      next = await track.createPlaylistItem({
        sort: 1.0 + (maxPli[0] && maxPli[0].sort > 0 ? maxPli[0].sort : 0),
        PlaylistId: this.playlist.id
      })
      next.Track = track
      next = await next.save()
      console.log('next:', next)

      // next = await this.playlist.getPlaylistItems({include: [Track], order: [Sequelize.literal('RANDOM()')], limit: 1})
      // next = next[0]
    }
    return next
  }

  async skip() {
    await this.soupClient.stopCurrentTrack()
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
        // if (this.currentItem) {
        //   this.currentItem.played = true
        //   this.currentItem.playedToEnd = true
        //   this.currentItem.playedAt = new Date()
        //   this.currentItem.Track.createPlay()
        //   await this.currentItem.save()
        //   // const play = this.currentItem.Track.
        // }
        this.playlist = await Playlist.findByPk(this.playlist.id)
        this.currentItem = await this.getNextPlaylistItem()
        console.log("currentItem:", this.currentItem.id)
        this.soupClient.sendChatMessage(`Playing ${this.currentItem.Track.filepath}`)
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
