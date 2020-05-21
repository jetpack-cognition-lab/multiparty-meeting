const socketio = require('socket.io-client')
//const gst = require('node-gstreamer-launch')
const { exec } = require("child_process")

const MEDIA_FILE = '/home/andi/Dropbox/abendschau_luise.mp4'

async function main() {

  process.on('SIGINT', async function () {
    console.log("CONTWOL ZEE WAS PWESSED")
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
    const displayName = "Dr. Schlunzmayer"

    const joinresp = await sendRequest(
      'join',
      {
        displayName: displayName,
        rtpCapabilities: {
          codecs:
            [],
          headerExtensions:
            []
        }
      }
    )

    console.log(joinresp)

    // get the rtp caps 
    const routerRtpCapabilities = await sendRequest('getRouterRtpCapabilities');
    // console.log("routerRtpCapabilities: ", routerRtpCapabilities)

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

    // CONNECT not needed for plain transport 
    // if it was created with comedia option set to true.

    // // connect audio
    // await sendRequest(
    //   'connectPlainTransport',
    //   {
    //     transportId: audioTransportId,
    //     dtlsParameters
    //   }
    // )
    // console.log("connected audio transport id " + audioTransportId)

    // connect video
    // await sendRequest(
    //   'connectPlainTransport',
    //   {
    //     transportId: videoTransportId,
    //     dtlsParameters
    //   }
    // )
    // console.log("connected video transport id " + videoTransportId)


    // payload scraped from chrome
    // const x = {
    //   "transportId": "fc29d873-833f-4837-9d2d-f9d3a0b24336",
    //   "kind": "audio",
    //   "rtpParameters": {
    //     "codecs": [
    //       {
    //         "mimeType": "audio/opus",
    //         "payloadType": 111,
    //         "clockRate": 48000,
    //         "channels": 2,
    //         "parameters": {
    //           "minptime": 10,
    //           "useinbandfec": 1,
    //           "sprop-stereo": 1,
    //           "usedtx": 1
    //         },
    //         "rtcpFeedback": [
    //           { "type": "transport-cc", "parameter": "" }
    //         ]
    //       }
    //     ],
    //     "headerExtensions": [
    //       { "uri": "urn:ietf:params:rtp-hdrext:sdes:mid", "id": 4, "encrypt": false, "parameters": {} },
    //       { "uri": "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time", "id": 2, "encrypt": false, "parameters": {} },
    //       { "uri": "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01", "id": 3, "encrypt": false, "parameters": {} },
    //       { "uri": "urn:ietf:params:rtp-hdrext:ssrc-audio-level", "id": 1, "encrypt": false, "parameters": {} }
    //     ],
    //     "encodings": [
    //       { "ssrc": 95572979, "dtx": false }
    //     ],
    //     "rtcp": {
    //       "cname": "UZMNzMKvYVw7OM2i",
    //       "reducedSize": true
    //     },
    //     "mid": "0"
    //   },
    //   "appData": { "source": "mic" }
    // }

    // produce
    const audioProducer = await sendRequest(
      'produce',
      {
        transportId: audioTransportId,
        kind: 'audio',
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

    // payload scraped from chrome
    // const x = {
    //   "method": "produce",
    //   "data": {
    //     "transportId": "34d20cea-aab7-4782-a4d2-93bfac1825c3",
    //     "kind": "video",
    //     "rtpParameters": {
    //       "codecs": [
    //         { "mimeType": "video/VP8", "payloadType": 96, "clockRate": 90000, "parameters": {}, "rtcpFeedback": [{ "type": "goog-remb", "parameter": "" }, { "type": "transport-cc", "parameter": "" }, { "type": "ccm", "parameter": "fir" }, { "type": "nack", "parameter": "" }, { "type": "nack", "parameter": "pli" }] },
    //         { "mimeType": "video/rtx", "payloadType": 97, "clockRate": 90000, "parameters": { "apt": 96 }, "rtcpFeedback": [] }
    //       ],
    //       "headerExtensions": [
    //         { "uri": "urn:ietf:params:rtp-hdrext:sdes:mid", "id": 4, "encrypt": false, "parameters": {} },
    //         { "uri": "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id", "id": 5, "encrypt": false, "parameters": {} },
    //         { "uri": "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id", "id": 6, "encrypt": false, "parameters": {} },
    //         { "uri": "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time", "id": 2, "encrypt": false, "parameters": {} },
    //         { "uri": "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01", "id": 3, "encrypt": false, "parameters": {} },
    //         { "uri": "http://tools.ietf.org/html/draft-ietf-avtext-framemarking-07", "id": 8, "encrypt": false, "parameters": {} },
    //         { "uri": "urn:3gpp:video-orientation", "id": 13, "encrypt": false, "parameters": {} },
    //         { "uri": "urn:ietf:params:rtp-hdrext:toffset", "id": 14, "encrypt": false, "parameters": {} }
    //       ],
    //       "encodings": [
    //         { "active": true, "scaleResolutionDownBy": 4, "rid": "r0", "scalabilityMode": "S1T3", "dtx": false },
    //         { "active": true, "scaleResolutionDownBy": 2, "rid": "r1", "scalabilityMode": "S1T3", "dtx": false },
    //         { "active": true, "scaleResolutionDownBy": 1, "rid": "r2", "scalabilityMode": "S1T3", "dtx": false }
    //       ],
    //       "rtcp": { "cname": "", "reducedSize": true },
    //       "mid": "1"
    //     },
    //     "appData": { "source": "webcam" }
    //   }
    // }


    const videoProducer = await sendRequest(
      'produce',
      {
        transportId: videoTransportId,
        kind: 'video',
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

    return {
      videoTransportIp,
      videoTransportPort,
      videoTransportRtcpPort,
      videoPt: 101,
      videoSSRC: 2222,
      audioTransportIp,
      audioTransportPort,
      audioTransportRtcpPort,
      audioPt: 100,
      audioSSRC: 1111,
      videoProducer,
      audioProducer
    }
  }

  const startGst = function (opts) {
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
      audioSSRC
    } = opts

    // const command = `gst-launch-1.0 \
    // 	rtpbin name=rtpbin \
    //   filesrc location=${MEDIA_FILE} \
    //   ! qtdemux name=demux \
    //   demux.video_0 \
    //   ! queue \
    //   ! decodebin \
    //   ! videoconvert \
    //   ! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4 \
    //   ! rtpvp8pay pt=${videoPt} ssrc=${videoSSRC} picture-id-mode=2 \
    //   ! rtpbin.send_rtp_sink_0 \
    //   rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort} \
    //   rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportRtcpPort} sync=false async=false \
    //   demux.audio_0 \
    //   ! queue \
    //   ! decodebin \
    //   ! audioresample \
    //   ! audioconvert \
    //   ! opusenc \
    //   ! rtpopuspay pt=${audioPt} ssrc=${audioSSRC} \
    //   ! rtpbin.send_rtp_sink_1 \
    //   rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} \
    //   rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportRtcpPort} sync=false async=false
    // `

    const command = `gst-launch-1.0 -v -m \
      rtpbin name=rtpbin latency=200 rtp-profile=avpf \
      audiotestsrc \
        ! "audio/x-raw" \
        ! audioresample \
        ! "audio/x-raw",format=S16LE,rate=48000,channels=2 \
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
    // exec(command, (error, stdout, stderr) => {
    //   if (error) {
    //     console.log(`error: ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.log(`stderr: ${stderr}`);
    //     return;
    //   }
    //   console.log(`stdout: ${stdout}`);
    // })
  }

  ////////////////////////////////////////

  const client = socketio('https://space.miniclub.space:3443?peerId=shlumpf&roomId=miniclub')

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
            const gstOpts = await joinRoom({ joinVideo: true })

            // start streamer pipeline
            startGst(gstOpts)

            break;
          }

        case 'activeSpeaker':
          {
            console.log("got activeSpeaker notification: ", notification.data)
          }


        case 'chatMessage':
          {
            const { peerId, chatMessage } = notification.data;

            // store.dispatch(
            //   chatActions.addResponseMessage({ ...chatMessage, peerId }));

            // if (
            //   !store.getState().toolarea.toolAreaOpen ||
            //   (store.getState().toolarea.toolAreaOpen &&
            //     store.getState().toolarea.currentToolTab !== 'chat')
            // ) // Make sound
            // {
            //   store.dispatch(
            //     roomActions.setToolbarsVisible(true));
            //   this._soundNotification();
            // }

            break;
          }

        default:
          {
            console.error('unknown notification.method ', notification.method);
          }
      }
    }
    catch (error) {
      console.error('error on socket "notification" event failed: "', error);
    }
  })

  client.on('disconnect', function () {
    console.log("disconnect")
  })

  // keep running
  await new Promise(function () { })
  console.log('This text will never be printed')
}

main()