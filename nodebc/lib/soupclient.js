const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')
const { EventEmitter } = require('events')

//const gst = require('node-gstreamer-launch')

class SoupClient extends EventEmitter {
  constructor(
    url, room, name
  ) {
    super()
    this.name = name
    this.url = url
    this.roomId = room

    this.routerRtpCapabilities = undefined
    this.joinresp = undefined
    this.transportOpts = undefined
    this.gstProcess = undefined
    this.playing = false
    this.peerId = (Math.random() +1).toString(36).substr(2, 7)
    this.joined = false

    // socketio client
    this.client = undefined

    process.on('SIGINT', async function () {
      console.log("CONTWOL ZEE WAS PWESSED")
      try {
        await sendRequest('closeProducer', { producerId: this.transportOpts.audioProducer.id })
        await sendRequest('closeProducer', { producerId: this.transportOpts.videoProducer.id })
      } catch(error) {}
      // do some cleanup here?
      process.exit(0)
    })
  }

  async connect() {
    ////////////////////////////////////////
    this.client = socketio(`${this.url}?peerId=${this.peerId}peerId&roomId=${this.roomId}`)
    // this.client = socketio(`https://soup.jetpack.cl:5443?peerId=${peerId}peerId&roomId=${roomId}`)
    // const client = socketio(`https://space.miniclub.space:3443?peerId=${peerId}peerId&roomId=${roomId}`)

    this.client.on('connect', function () {
      console.log("connected")
      this.emit('connected')
    })

    this.client.on('event', function (data) {
      console.log("got event", data)
      this.emit('event', data)
    })

    this.client.on('notification', this.notificationHandler.bind(this))

    this.client.on('disconnect', function () {
      console.log("disconnect")
      this.joined = false
      this.emit('disconnect')
    })
  }

  async notificationHandler(notification) {
    try {
      switch (notification.method) {
        case 'roomReady':
        {
          console.log("roomReady received")
          this.emit(notification.method, notification.data)
          // join room
          await this.joinRoom()
          this.joined = true
          this.emit('ready')
          break;
        }
        default:
        {
          console.log("notification received", notification)
          this.emit(notification.method, notification.data)
          break;
        }
      }
    } catch (error) {
      console.error('error on socket "notification" event failed: "', error);
      await sendChatMessage(`Shit: Error ${JSON.stringify(error)}`)
    }  
  }

  async stopCurrentTrack() {
    // console.log(state.gstProcess)
    console.log("stop track")
    await this.stopProducers()      

    // await sendRequest('pauseProducer', { producerId: state.transportOpts.audioProducer.id })
    // await sendRequest('pauseProducer', { producerId: state.transportOpts.videoProducer.id })
    if (this.gstProcess) {
      this.gstProcess.kill('SIGTERM', {
        forceKillAfterTimeout: 2000
      })
    }
    this.gstProcess = null
    this.playing = false
  }

  async sendChatMessage(message) {
    await this.sendRequest(
      'chatMessage',
      {
        chatMessage: {
          type: "message",
          text: message,
          time: new Date().valueOf(),
          name: this.name,
          sender: 'response',
          picture: null
        }
      }
    )
  }

  async execGstCommand(command) {
    try {
      const result = execa.command(command, {shell: false, env: {'GST_DEBUG': '2'}})

      result.on('exit', () => {
        console.log("exited", result)
        this.stopProducers()
        this.gstProcess = null
        this.playing = false
        this.emit('play_done')
      })
      this.gstProcess = result
      this.playing = true

      await result
      console.log('res:', result.stdout)
      console.log('err:', result.stderr)

    } catch (error) {
      this.playing = false
      this.emit('play_done')
      //await stopProducers()      
      console.log("catched error in execGstCommand: ", error)
    }
  }

  async stopProducers() {
    if (this.transportOps) {
      await this.sendRequest('closeProducer', {producerId: this.transportOpts.audioProducer.id })
      await this.sendRequest('closeProducer', {producerId: this.transportOpts.videoProducer.id })
      await this.sendRequest('closeTransport', {transportId: this.transportOpts.audioTransportId })
      await this.sendRequest('closeTransport', {transportId: this.transportOpts.videoTransportId })
    }
  }

  async startProducers() {
    console.log("startproducers", this.transportOpts)

    // create a transport for audio
    console.log("createPlainTransport")
    const audioTransportInfo = await this.sendRequest(
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
    console.log("createPlainTransport")
    const videoTransportInfo = await this.sendRequest(
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
    const audioProducer = await this.sendRequest(
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
    // await this.sendRequest('pauseProducer', { producerId: audioProducer.id })

    const videoProducer = await this.sendRequest(
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
    // await this.sendRequest('pauseProducer', {producerId: videoProducer.id })
    this.transportOpts = {
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

  async joinRoom() {
    this.routerRtpCapabilities = await this.sendRequest('getRouterRtpCapabilities')
    this.joinresp = await this.sendRequest(
      'join',
      {
        displayName: this.name,
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
    console.log(this.joinresp)
  }

  timeoutCallback(callback) {
    let called = false

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
      clearTimeout(interval)
      callback(...args)
    }
  }

  async sendRequest(method, data) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject('No socket connection.');
      }
      else {
        this.client.emit(
          'request',
          { method, data },
          this.timeoutCallback((err, response) => {
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
}

module.exports = { SoupClient }