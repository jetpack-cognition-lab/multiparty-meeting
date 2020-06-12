const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')

//const gst = require('node-gstreamer-launch')

async function main() {

  process.on('SIGINT', async function () {
    console.log("CONTWOL ZEE WAS PWESSED")
    try {
      await sendRequest('closeProducer', { producerId: state.transportOpts.audioProducer.id })
      await sendRequest('closeProducer', { producerId: state.transportOpts.videoProducer.id })
    } catch(error) {}

    // do some cleanup here?
    process.exit(0)
  })

  const timeoutCallback = function (callback) {
    let called = false;

    const interval = setTimeout(
      () => {
        if (called)
          return;
        called = true;
        callback(new Error('Request timeout.'));
      },
      5000
    );

    return (...args) => {
      if (called)
        return;
      called = true;
      clearTimeout(interval);

      callback(...args);
    };
  }

  const sendRequest = function (method, data) {
    return new Promise((resolve, reject) => {
      if (!client) {
        reject('No socket connection.');
      }
      else {
        client.emit(
          'request',
          { method, data },
          timeoutCallback((err, response) => {
            if (err) {
              reject(err)
            }
            else {
              resolve(response)
            }
          })
        )
      }
    })
  }

  const joinRoom = async function () {
    // get the rtp caps 
    state.routerRtpCapabilities = await sendRequest('getRouterRtpCapabilities');

    const joinresp = await sendRequest(
      'join',
      {
        displayName: displayName,
        rtpCapabilities: {
          codecs:
            [{
              'mimeType': 'audio/opus',
              'clockRate': 48000,
              'kind': 'audio',
              'preferredPayloadType': 100,
              'channels': 2,
              'parameters': { 'useinbandfec': 1 },
              'rtcpFeedback': []
            },
            {
              'mimeType': 'video/VP8',
              'clockRate': 90000,
              'kind': 'video',
              'preferredPayloadType': 101,
              'parameters': {},
              'rtcpFeedback': [{ 'type': 'nack' }]
            },
            {
              'mimeType': 'video/VP9',
              'clockRate': 90000,
              'kind': 'video',
              'preferredPayloadType': 103,
              'parameters': {},
              'rtcpFeedback': [{ 'type': 'nack' }]
            },
            {
              'mimeType': 'video/H264',
              'clockRate': 90000,
              'kind': 'video',
              'preferredPayloadType': 107,
              'parameters': { 'packetization-mode': 1, 'profile-level-id': '42e01f', 'level-asymmetry-allowed': 1 },
              'rtcpFeedback': [{ 'type': 'nack' }]
            },
            {
              'mimeType': 'video/H265',
              'clockRate': 90000,
              'kind': 'video',
              'preferredPayloadType': 109,
              'parameters': {},
              'rtcpFeedback': [{ 'type': 'nack' }]
            }
            ],
          headerExtensions:
            []
        }
      }
    )
    console.log(joinresp)
  }

  const startProducers = async function() {
    console.log("startproducers", state.transportOpts)

    // transports
    // create a transport for audio
    const audioTransportInfo = await sendRequest(
      'createPlainTransport',
      {
        producing: true,
        consuming: false
      });

    const audioTransportId = audioTransportInfo.id
    const audioTransportIp = audioTransportInfo.ip
    const audioTransportPort = audioTransportInfo.port
    const audioTransportRtcpPort = audioTransportInfo.rtcpPort

    console.log("audio transportInfo:", audioTransportInfo)

    // create a transport for video
    const videoTransportInfo = await sendRequest(
      'createPlainTransport',
      {
        producing: true,
        consuming: false
      });

    const videoTransportId = videoTransportInfo.id
    const videoTransportIp = videoTransportInfo.ip
    const videoTransportPort = videoTransportInfo.port
    const videoTransportRtcpPort = videoTransportInfo.rtcpPort

    console.log("video transportInfo:", videoTransportInfo)

    // produce
    const audioProducer = await sendRequest(
      'produce',
      {
        transportId: audioTransportId,
        kind: 'audio',
        appData: {
          source: 'mic'
        },
        rtpParameters: {
          encodings: [
            {
              ssrc: 1111
            }
          ],
          codecs: [
            {
              name: "Opus",
              mimeType: "audio/opus",
              payloadType: 100, // "dynamic type" in rtp
              channels: 2,
              clockRate: 48000,
              rtcpFeedback: [
                {
                  type: 'nack'
                }
              ],
              parameters: {
                useinbandfec: 1,
                "sprop-stereo": 1
              },
            }
          ]
        }
      }
    )
    console.log("audioproducer: ", audioProducer)
    // await sendRequest('pauseProducer', { producerId: audioProducer.id })

    const videoProducer = await sendRequest(
      'produce',
      {
        transportId: videoTransportId,
        kind: 'video',
        appData: {
          source: 'webcam'
        },

        rtpParameters: {
          codecs: [
            {
              name: "VP8",
              mimeType: "video/VP8",
              payloadType: 101, // "dynamic type" in rtp
              clockRate: 90000,
              rtcpFeedback: [
                { type: 'nack' },
                { type: 'nack', parameter: 'pli' },
                { type: 'ccm', parameter: 'fir' },
              ]
            }
          ],
          encodings: [
            {
              ssrc: 2222
            }
          ]
        }
      }
    )
    console.log("videoproducer: ", videoProducer)
    // await sendRequest('pauseProducer', {producerId: videoProducer.id })
    state.transportOpts = {
      videoTransportId,
      videoTransportIp,
      videoTransportPort,
      videoTransportRtcpPort,
      videoPt: 101,
      videoSSRC: 2222,
      videoProducer,
      audioTransportId,
      audioTransportIp,
      audioTransportPort,
      audioTransportRtcpPort,
      audioPt: 100,
      audioSSRC: 1111,
      audioProducer
    }
  }

  const stopProducers = async function() {
    await sendRequest('closeProducer', {producerId: state.transportOpts.audioProducer.id })
    await sendRequest('closeProducer', {producerId: state.transportOpts.videoProducer.id })
    await sendRequest('closeTransport', {transportId: state.transportOpts.audioTransportId })
    await sendRequest('closeTransport', {transportId: state.transportOpts.videoTransportId })
  }

  const startJackGst = async function () {
    await startProducers()
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
    } = state.transportOpts

    const command = `gst-launch-1.0 -v -m \
      rtpbin name=rtpbin latency=1000 rtp-profile=avpf \
      jackaudiosrc connect=1 port-pattern="system:capture_1(3|4)" \
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
    await execGstCommand(command)
  }

  const startYoutubeGst = async function (url) {
    await startProducers()
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
    } = state.transportOpts

    ytdlcmd = [
      '-f 18', 
      '--get-url',
      url 
    ]

    console.log('getting yturl')
    const ytres = await execa('/usr/bin/youtube-dl', ytdlcmd)
    console.log('got it', ytres.stdout)
    const yturl = ytres.stdout.replace(/([;'"`#$&*?<>\\])/g, "\\$1")

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
       ! queue ! avdec_aac ! audioconvert \
       ! decodebin \
       ! audioresample \
       ! audioconvert \
       ! opusenc \
       ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
       ! rtpbin.send_rtp_sink_1 \
      rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
      rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false \
    `


    // https://www.youtube.com/watch?v=QNIIOr3g8lQ

    console.log(command)
    await execGstCommand(command)
  }

  const execGstCommand = async function(command) {
    try {
      const result = execa.command(command, {shell: false, env: {'GST_DEBUG': '2'}})
      result.on('exit', () => {
        console.log("exited", result)
        stopProducers()
        state.gstProcess = null
        state.playing = false
      })
      state.gstProcess = result
      state.playing = true
    } catch (error) {
      //await stopProducers()      
      console.log(error)
    }
  }

  const sendChatMessage = async function(message) {
    await sendRequest(
      'chatMessage',
      {
        chatMessage: {
          type: "message",
          text: message,
          time: new Date().valueOf(),
          name: displayName,
          sender: 'response',
          picture: null
        }
      }
    )
  }

  const stopCurrentTrack = async function() {
    // console.log(state.gstProcess)
    console.log("stop track")
    await stopProducers()      

    // await sendRequest('pauseProducer', { producerId: state.transportOpts.audioProducer.id })
    // await sendRequest('pauseProducer', { producerId: state.transportOpts.videoProducer.id })
    if (state.gstProcess) {
      state.gstProcess.kill('SIGTERM', {
        forceKillAfterTimeout: 2000
      })
    }
    state.gstProcess = null
    state.playing = false
  }

  const handleCommand = async function(command) {
    if (!state.joined) {
      console.log('Not joined')
      return
    }

    // play command
    if (matched = command.match(/^play (.*)/)) {
      console.log("play command received")
      const url = matched[1]
      if (!url.match(/^(http(s)??\:\/\/)?(www\.)?((youtube\.com\/watch\?v=)|(youtu.be\/))([a-zA-Z0-9\-_])+/)) {
        console.log(`play url did not match: ${url}`)
        await sendChatMessage(`This does not look like a youtube URL to me: ${url}. I will not play it.`)
        return
      }

      if (state.playing === true) {
        console.log("stopping current track")
        await sendChatMessage(`Stopping the currently running track ${state.url}.`)
        await stopCurrentTrack()
      }
      await sendChatMessage(`Attempt on youtube video ${url}`)
      await startYoutubeGst(url)
      state.url = url
      await sendChatMessage(`Playing youtube video ${url}`)
    }

    // stop command
    else if (matched = command.match(/^stop/)) {
      // console.log(state)
      if (state.playing === true) {
        await sendChatMessage(`I am stopping the currently running track ${state.url}.`)
        console.log("stopping current track")
        await stopCurrentTrack()
      }
    }

    // unknown
    else {
      console.log(`ignoring ${command}`)
    }
  }

  ////////////////////////////////////////

  const peerId = (Math.random() +1).toString(36).substr(2, 7)
  const roomId = 'miniclub'
  const displayName = "Playerbot" // faker.name.findName()

  const state = {
    joined: false,
    playing: false,
    url: null,
    transportOpts: null
  }

  const client = socketio(`https://space.miniclub.space:3443?peerId=${peerId}peerId&roomId=${roomId}`)

  client.on('connect', function () {
    console.log("connected")
  })

  client.on('event', function (data) {
    console.log("got event", data)
  })

  client.on('notification', async function (notification) {
    try {
      switch (notification.method) {

        case 'roomReady':
          {
            console.log("roomReady received")
            
            // join room
            await joinRoom({ joinVideo: true })
            state.joined = true

            // start streamer pipeline
            // startGst(gstOpts)

            break;
          }

        case 'activeSpeaker':
          {
            //console.log("got activeSpeaker notification: ", notification.data)
            break
          }

        case 'chatMessage':
          {
            const { peerId, chatMessage } = notification.data
            console.log("got chat message: ", notification.data)

            if (chatMessage.type === 'message') {
              console.log("got chat message: ", chatMessage.text)
              await handleCommand(chatMessage.text)
            }
            break
          }

        default:
          {
            console.error('unknown notification.method ', notification.method);
          }
      }
    }
    catch (error) {
      console.error('error on socket "notification" event failed: "', error);
      await sendChatMessage(`Shit: Error`)
    }
  })

  client.on('disconnect', function () {
    console.log("disconnect")
  })

  await startJackGst()

  // keep running
  await new Promise(function () { })
  console.log('This text will never be printed')
}

main()