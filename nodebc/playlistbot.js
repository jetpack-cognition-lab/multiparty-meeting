const config = require('./config');
const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')
const { SoupClient } = require('./lib/soupclient')
const { sequelize, User, Track, Playlist, PlaylistItem, Play, Vote} = require('./lib/plb-models')

async function main() {

  const startYoutubeGst = async function (url) {
    await soupClient.startProducers()
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
    } = soupClient.transportOpts

    const formatcmd = [
      '--list-formats',
      url 
    ]


    console.log('getting formats')
    const formatres = await execa('/usr/bin/youtube-dl', formatcmd)
    console.log('got it', formatres.stdout)
    lines = formatres.stdout.split(/\n/)
    let format = null
    let isVideo = false
    lines.forEach((line) => {
      if (line.match(/^format/)) { return }
      parts = line.split(/\s+/)
      const f = parts[0]
      switch (f) {
        case 'http_mp3_128':
        case 'mp3':
        case 'mp3-128':
          format = f
          isVideo = false
          break
        default:
          break
      }
    })
    // attempt a youtube donwload if nothing matched

    if (!format) {
      format = "18"
      isVideo = true
    }

    const ytdlcmd = [
      `-f ${format}`,
      '-4',
      '--get-url',
      url 
    ]

    
    console.log("chosen format", format)

    console.log('getting yturl')
    const ytres = await execa('/usr/bin/youtube-dl', ytdlcmd)
    console.log('got it', ytres.stdout)
    const yturl = ytres.stdout.replace(/([;'"`#$&*?<>\\])/g, "\\$1")

    let command

    if (isVideo) {
      // ! avdec_aac ! audioconvert \
      command = `/usr/bin/gst-launch-1.0 \
        rtpbin name=rtpbin latency=1000 rtp-profile=avpf \
        souphttpsrc is-live=true location=${yturl} \
         ! qtdemux name=demux \
        demux.video_0 \
         ! queue \
         ! decodebin \
         ! videoconvert \
         ! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4 \
         ! rtpvp8pay pt=${videoPt} ssrc=${videoSSRC} picture-id-mode=2 \
         ! rtpbin.send_rtp_sink_0 \
        rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort} \
        rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportRtcpPort} sync=false async=false \
        demux.audio_0 \
         ! queue \
         ! decodebin \
         ! audioresample \
         ! audioconvert \
         ! opusenc \
         ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
         ! rtpbin.send_rtp_sink_1 \
        rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
        rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false \
      `
    } else {
      command = `/usr/bin/gst-launch-1.0 \
        rtpbin name=rtpbin latency=1000 rtp-profile=avpf \
        souphttpsrc is-live=true location=${yturl} \
         ! queue ! decodebin ! audioconvert \
         ! audioresample \
         ! audioconvert \
         ! opusenc \
         ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
         ! rtpbin.send_rtp_sink_1 \
        rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
        rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false \
      `
    }
    console.log(command)
    await soupClient.execGstCommand(command)
  }

  const handleCommand = async function(command) {
    if (!soupClient.joined) {
      console.log('Not joined')
      return
    }

    // play command
    if (matched = command.match(/^play (.*)/)) {
      console.log("play command received")
      const url = matched[1]
      // if (!url.match(/^(http(s)??\:\/\/)?(www\.)?((youtube\.com\/watch\?v=)|(youtu.be\/))([a-zA-Z0-9\-_])+/)) {
      //  console.log(`play url did not match: ${url}`)
      //  await sendChatMessage(`This does not look like a youtube URL to me: ${url}. I will not play it.`)
      //  return
      // }

      if (soupClient.playing === true) {
        console.log("stopping current track")
        await soupClient.sendChatMessage(`Stopping the currently running track ${soupClient.url}.`)
        await soupClient.stopCurrentTrack()
      }
      await soupClient.sendChatMessage(`Attempt on youtube video ${url}`)
      await soupClient.startYoutubeGst(url)
      soupClient.url = url
      await soupClient.sendChatMessage(`Playing youtube video ${url}`)
    }

    // stop command
    else if (matched = command.match(/^stop/)) {
      // console.log(soupClient)
      if (soupClient.playing === true) {
        await soupClient.sendChatMessage(`I am stopping the currently running track ${state.url}.`)
        console.log("stopping current track")
        await soupClient.stopCurrentTrack()
      }
    }

    // unknown
    else {
      console.log(`ignoring ${command}`)
    }
  }

  ////////////////////////////////////////

  await User.sync({force: true})
  await Track.sync({force: true})
  await Playlist.sync({force: true})
  await PlaylistItem.sync({force: true})
  await Play.sync({force: true})
  await Vote.sync({force: true})
  // seed a playlist
  const [playlist, created] = await Playlist.findOrCreate({
    where: { name: 'default' }
  })
  console.log("ensured playlist", playlist.name)

  console.log("All models were synchronized successfully.");

  //////////////////////////////////////////
  const roomId = 'miniclub'
  const displayName = "PlaylistBot"
  const url = config.mainurl || 'https://soup.jetpack.cl:5443'

  const soupClient = new SoupClient(url, roomId, displayName)

  soupClient.on('chatMessage', async function (data) {
    try {
      const { peerId, chatMessage } = data
      console.log("got chat message: ", data)
      if (chatMessage.type === 'message') {
        console.log("got chat message of type 'text': ", chatMessage.text)
        await handleCommand(chatMessage.text)
      }
    }
    catch (error) {
      console.error('error on chatMessage failed: ', error);
      await sendChatMessage(`Shit: Error ${JSON.stringify(error)}`)
    }
  })


  soupClient.on('disconnect', function () {
    console.log("disconnect")
  })

  await soupClient.connect()

  // keep running
  await new Promise(function () { })
  console.log('This text will never be printed')
}

(async () => {
  try {
    await main()
  } catch(e) {
    console.log(e)
  }
})()