const config = require('./config');
const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')
const { SoupClient } = require('./lib/soupclient')

// console.log(SoupClient)

async function main() {

  const startJackSource = async function (url) {
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

    const command = `gst-launch-1.0 -v -m \
      rtpbin name=rtpbin latency=1000 rtp-profile=avpf \
      jackaudiosrc ${config.jackSourceOptions || ''}" \
        ! audioconvert \
        ! audioresample \
        ! audiorate \
        ! audio/x-raw,format=S16LE,rate=48000,channels=2 \
        ! opusenc bitrate=128000 inband-fec=1 \
        ! rtpopuspay ssrc=${audioSSRC} pt=${audioPt} mtu=1400 \
        ! rtprtxqueue name=rtprtxqueue max-size-time=400 max-size-packets=0 \
        ! rtpbin.send_rtp_sink_0 \
      rtpbin.send_rtp_src_0 \
        ! udpsink name=rtp_udpsink host=${audioTransportIp} port=${audioTransportPort} \
      rtpbin.send_rtcp_src_0 \
        ! udpsink name=rtcp_udpsink host=${audioTransportIp} port=${audioTransportPort} sync=false async=false\
    `
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

  const roomId = 'miniclub'
  const displayName = faker.name.firstName()
  const url = config.mainurl

  const soupClient = new SoupClient(url, roomId, displayName)

  soupClient.on('chatMessage', async function (data) {
    try {
      const { peerId, chatMessage } = data
      console.log("sc got chat message: ", data)
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

  soupClient.on("ready", async () => {
    console.log("client is ready")
    await startJackSource()
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

