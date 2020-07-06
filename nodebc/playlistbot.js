const config = require('./config');
const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')
const mkdirp = require('mkdirp')
const { SoupClient } = require('./lib/soupclient')
const { PlaylistPlayer } = require('./lib/playlistplayer')
const { sequelize, User, Track, Playlist, PlaylistItem, Vote} = require('./lib/plb-models')

const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

const playlistsorter = 0

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
    const formatres = await execa(config.youtubedlbin, formatcmd)
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

  const ensureTrackIsQueued = async (playlist, track, user) => {
    // search for playlistitem that has the track
    const x = await playlist.getPlaylistItems({order: [['sort', 'DESC']], limit: 1})
    console.log("x:", x)
    let sort = 1.0
    if (x.length > 0) {
      sort = x[0].sort + 1.0
    }
    console.log("sort:", sort)
    pli = await playlist.createPlaylistItem({sort, UserId: user.id, TrackId: track.id})
    .then(pli => pli.save())
    console.log("pli", pli)
  }

  const handleCommand = async function(playlist, chatMessage) {
    if (!soupClient.joined) {
      console.log('Not joined')
      return
    }

    // play command
    if (matched = chatMessage.text.match(urlRegex)) {
      console.log("playlist item url command received")
      const url = matched[1]

      const [user, created] = await User.findOrCreate({
        where: { name: chatMessage.name }
      })

      let track = await Track.findOne({where: {url}})

      if (!track) {
        console.log(`Track for ${url} not found, creating a new one`)
        track = await Track.create({url, state: 'ADDED'})
        .then(t => t.setUser(user))
        .then(t => t.save())
      } else {
        console.log(`Track for ${url} already exists`, track)
        // allow retries
        if (track.state === 'FAILED') {
          await soupClient.sendChatMessage(`@${chatMessage.name}: Retrying failed track`)
          track.state = 'ADDED'
          await track.save()
        } else {
          await soupClient.sendChatMessage(`@${chatMessage.name}: *${track.name}* is already known and the current state of it is ${track.state}`)
          if (track.state === 'READY') {
            await ensureTrackIsQueued(playlist, track, user)
            await soupClient.sendChatMessage(`@${chatMessage.name}: *${track.name}* is queued to play`)
          }
          return
        }
      }
      console.log("track to download:", track)


      try {
        const dlcommand = [
          `--verbose`, 
          `-f 'bestvideo[ext=mp4,height<=?1080]+bestaudio[ext=m4a]/best[ext=mp4]/best'`,
          `-o '${config.trackDataRoot}/%(title)s.%(ext)s'`,
          `--write-description`, 
          `--write-info-json`, 
          `-4`,
          url 
        ]
        console.log('downloading', dlcommand)

        track.state = 'DOWNLOADING'
        await track.save()

        const dlres = await execa(config.youtubedlbin, dlcommand, {shell: true})
        console.log('res:', dlres.stdout)
        // match ffmpeg output to get the final file name
        
        const re = new RegExp('\\[ffmpeg\\] Merging formats into "(.*)"')
        const dlmatches = dlres.stdout.match(re)
        console.log('dlmatches', re, dlmatches ? dlmatches[1]: dlmatches)

        const re2 = new RegExp('\\[download\\] (.*) has already been downloaded')
        const dlmatches2 = dlres.stdout.match(re2)
        console.log('dlmatches2', re2, dlmatches2 ? dlmatches2[1]: dlmatches2)

        const re3 = new RegExp('\\[download\\] Destination: (.*)')
        const dlmatches3 = dlres.stdout.match(re3)
        console.log('dlmatches2', re3, dlmatches3 ? dlmatches3[1]: dlmatches3)

        if (dlmatches && dlmatches[1]) {
          track.filepath = dlmatches[1].replace(config.trackDataRoot + '/', '')
          track.name = track.filepath
          track.state = 'READY'
          await track.save()
        } else if (dlmatches2 && dlmatches2[1]) {
          track.filepath = dlmatches2[1].replace(config.trackDataRoot + '/', '')
          track.name = track.filepath
          track.state = 'READY'
          await track.save()
        } else if (dlmatches3 && dlmatches3[1]) {
          track.filepath = dlmatches3[1].replace(config.trackDataRoot + '/', '')
          track.name = track.filepath
          track.state = 'READY'
          await track.save()
        } else {
          throw(new Error('could not get file name after download'))
        }
      } catch(e) {
        track.state = 'FAILED'
        await track.save()
        // this should be used for direct downloads, those fail on youtube-dl
        console.log("catched", e)
        return
      }

      // console.log("all tracks:", await Track.findAll())
      await soupClient.sendChatMessage(`@${chatMessage.name}: Your *track ${track.name}* is ready`)
      await ensureTrackIsQueued(playlist, track, user)
      await soupClient.sendChatMessage(`@${chatMessage.name}: *${track.name}* is queued to play`)

      // lines = formatres.stdout.split(/\n/)
      // let format = null
      // let isVideo = false
      // lines.forEach((line) => {
      //   if (line.match(/^format/)) { return }
      //   parts = line.split(/\s+/)
      //   const f = parts[0]
      //   switch (f) {
      //     case 'http_mp3_128':
      //     case 'mp3':
      //     case 'mp3-128':
      //       format = f
      //       isVideo = false
      //       break
      //     default:
      //       break
      //   }
      // })

      const filename = `${config.trackDataRoot || '.'}/`

      // // if (!url.match(/^(http(s)??\:\/\/)?(www\.)?((youtube\.com\/watch\?v=)|(youtu.be\/))([a-zA-Z0-9\-_])+/)) {
      // //  console.log(`play url did not match: ${url}`)
      // //  await sendChatMessage(`This does not look like a youtube URL to me: ${url}. I will not play it.`)
      // //  return
      // // }


      // if (soupClient.playing === true) {
      //   console.log("stopping current track")
      //   await soupClient.sendChatMessage(`Stopping the currently running track ${soupClient.url}.`)
      //   await soupClient.stopCurrentTrack()
      // }
      // await soupClient.sendChatMessage(`Attempt on youtube video ${url}`)
      // await soupClient.startYoutubeGst(url)
      // soupClient.url = url
      // await soupClient.sendChatMessage(`Playing youtube video ${url}`)
    }


    else if (matched = chatMessage.text.match(/^list/)) {
      // plis = await pl.getPlaylistItems({include: [ {model: Track, include: [User] }]})

      const items = await playlist.getPlaylistItems({
        include: [
          {model: Track, include: [User] },
          {model: User}
        ], order: [
          ['sort', 'DESC']
        ]
      })
      console.log("items:", items)
      console.log("tracks:", items.map(i => i.Track))
      const reply = items.map(i => `* ${i.Track.name}<br>  (subm. by _@${i.Track.User.name}_)`).join("\n")
      await soupClient.sendChatMessage(`### Playlist:\n${reply}`)
    }

    else if (matched = chatMessage.text.match(/^next/)) {
      await playlistPlayer.skip()
    }

    else if (matched = chatMessage.text.match(/^stop/)) {
      await playlistPlayer.stop()
    }

    else if (matched = chatMessage.text.match(/^start/)) {
      await playlistPlayer.start()
    }

    // unknown
    else {
      await soupClient.sendChatMessage(`### Commands:
* Add an arbitrary url to the playlist:
\`\`\`
/plb http://example.com/something_nice
\`\`\`

* Skip to next item:
\`\`\`
/plb n
\`\`\`

* Stop playing:
\`\`\`
/plb stop
\`\`\``
)
    }
  }

  ////////////////////////////////////////

  console.log(config)

  await mkdirp(config.trackDataRoot)

  const initDatabase = config.initDatabase || false

  await User.sync({force: initDatabase})
  await Track.sync({force: initDatabase})
  await Playlist.sync({force: initDatabase})
  await PlaylistItem.sync({force: initDatabase})
  await Vote.sync({force: initDatabase})
  // seed a default playlist
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
  const playlistPlayer = new PlaylistPlayer(playlist, config.trackDataRoot, soupClient)

  soupClient.on('ready', async () => {
    console.log("ready! starting playlist player")
    playlistPlayer.play()
  })

  soupClient.on('chatMessage', async function (data) {
    try {
      const { peerId, chatMessage } = data
      // console.log("got chat message: ", data)
      if (chatMessage.type === 'message' && (matched = chatMessage.text.match(/^\/plb (.*)/))) {
        // console.log("got chat command: ", matched[1])
        chatMessage.text = matched[1]
        await handleCommand(playlist, chatMessage)
      }
    }
    catch (error) {
      console.error('error on chatMessage failed: ', error);
      await soupClient.sendChatMessage(`Shit: Error ${JSON.stringify(error)}`)
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