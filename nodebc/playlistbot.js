const config = require('./config');
const socketio = require('socket.io-client')
const faker = require('faker')
const execa = require('execa')
const mkdirp = require('mkdirp')
const { SoupClient } = require('./lib/soupclient')
const { PlaylistPlayer } = require('./lib/playlistplayer')
const { sequelize, User, Track, Playlist, PlaylistItem, Vote, Play } = require('./lib/models/plb-models')
const moment = require('moment')
const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/
const Sequelize = require('sequelize')
const Op = Sequelize.Op
const playlistsorter = 0
async function main() {

  const ensureTrackIsQueued = async (playlist, track, user) => {
    const count = await playlist.countPlaylistItems()
    console.log("count:", count)
    let sort
    if (count === 0) {
      // empty playlist
      sort = 1.0
    } else if (!playlistPlayer.currentItem) {
      // stopped playlist, put at end
      const x = await playlist.getPlaylistItems({ order: [['sort', 'DESC']], limit: 1 })
      console.log("no current:", x[0].sort)
      sort = x[0].sort + 1.0
    } else {
      // we have a currentItem, check for potential next item
      const currentItem = playlistPlayer.currentItem
      const next = await playlist.getPlaylistItems({ where: { sort: { [Op.gt]: currentItem.sort } }, order: [['sort', 'ASC']], limit: 1 })
      if (next.length === 0) {
        console.log("c:", currentItem.sort)
        // no next items, put at end
        sort = currentItem.sort + 1.0
      } else {
        // calculate a sort value between current and next
        const n = next[0]
        console.log("c + n:", currentItem.sort, n.sort)
        sort = currentItem.sort + (n.sort - currentItem.sort) / 2
      }
    }
    console.log("sort:", sort)

    // const x = await playlist.getPlaylistItems({ order: [['sort', 'DESC']], limit: 1 })
    // // console.log("x:", x)
    // let sort = 1.0
    // if (x.length > 0) {
    //   sort = x[0].sort + 1.0
    // }
    // // console.log("sort:", sort)
    pli = await playlist.createPlaylistItem({ sort, TrackId: track.id })
    if (user) {
      pli.setUser(user)
    }
    await pli.save()
    // console.log("pli", pli)
  }

  const handleCommand = async function (playlist, chatMessage) {
    if (!soupClient.joined) {
      console.log('Not joined')
      return
    }

    // submit new track + add it to the playlist
    if (matched = chatMessage.text.match(urlRegex)) {
      const url = matched[1]

      const [user, created] = await User.findOrCreate({
        where: { name: chatMessage.name }
      })

      let track = await Track.findOne({ where: { url } })

      if (!track) {
        console.log(`Track for ${url} not found, creating a new one`)
        track = await Track.create({ url, state: 'ADDED' })
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

        const dlres = await execa(config.youtubedlbin, dlcommand, { shell: true })
        console.log('res:', dlres.stdout)
        // match ffmpeg output to get the final file name

        const re = new RegExp('\\[ffmpeg\\] Merging formats into "(.*)"')
        const dlmatches = dlres.stdout.match(re)
        console.log('dlmatches', re, dlmatches ? dlmatches[1] : dlmatches)

        const re2 = new RegExp('\\[download\\] (.*) has already been downloaded')
        const dlmatches2 = dlres.stdout.match(re2)
        console.log('dlmatches2', re2, dlmatches2 ? dlmatches2[1] : dlmatches2)

        const re3 = new RegExp('\\[download\\] Destination: (.*)')
        const dlmatches3 = dlres.stdout.match(re3)
        console.log('dlmatches2', re3, dlmatches3 ? dlmatches3[1] : dlmatches3)

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
          throw (new Error('could not get file name after download'))
        }
      } catch (e) {
        track.state = 'FAILED'
        await track.save()
        // this should be used for direct downloads, those fail on youtube-dl
        console.log("catched", e)
        return
      }
      await soupClient.sendChatMessage(`@${chatMessage.name}: Your *track ${track.name}* is ready`)
      await ensureTrackIsQueued(playlist, track, user)
      await soupClient.sendChatMessage(`@${chatMessage.name}: *${track.name}* is queued to play`)
      const filename = `${config.trackDataRoot || '.'}/`
    }

    // list playlist items
    else if (matched = chatMessage.text.match(/^list/)) {
      // plis = await pl.getPlaylistItems({include: [ {model: Track, include: [User] }]})

      const items = await playlist.getPlaylistItems({
        include: [
          { model: Track, include: [User, Play, Vote] },
          { model: User }
        ], order: [
          ['sort', 'ASC']
        ],
        // limit: 500
      })
      console.log("items:", items.length)
      // console.log("tracks:", items.map(i => i.Track))


      let ret = `<h3>${playlistPlayer.playlist.name}</h3>`
      ret += `<table class="playlistbot"><thead><tr><td>id</td><td></td><td>played at</td><td>sort</td></tr></thead><tbody>`

      items.forEach(i => {
        // console.log(playlistPlayer.currentItem, i.id)
        // const c = playlistPlayer.currentItem && i.id === playlistPlayer.currentItem.id ? '**' : ''
        // return `* ${c}${i.Track.name} (Plays: ${i.Track.Plays.length})${c} srt:${i.sort} pl:${i.played}`
        ret += `<tr>`
        ret += `<td style="border: 1px solid #888;">`
        ret += i.Track.id.substr(0, 6)
        ret += `</td>`
        ret += `<td>`
        ret += playlistPlayer.currentItem && i.id === playlistPlayer.currentItem.id ? '🚶<em>' : ''
        ret += i.Track.name
        ret += playlistPlayer.currentItem && i.id === playlistPlayer.currentItem.id ? '</em>🚶' : ''
        ret += `</td>`
        ret += `<td>`
        ret += i.played ? `${moment(i.playedAt).format('YYYYMMDDhhmmss')}` : '✴'
        ret += `</td>`
        ret += `<td>`
        ret += `${i.sort}`
        ret += `</td>`
        ret += `</tr>`
      })
      ret += `</tbody></table>`
      ret += playlistPlayer.currentItem ? '' : `Playlist is stopped.`
      await soupClient.sendChatMessage(ret)
    }

    // skip item
    else if (matched = chatMessage.text.match(/^next/)) {
      await playlistPlayer.skip()
    }

    // stop current playlist
    else if (matched = chatMessage.text.match(/^stop/)) {
      await playlistPlayer.stop()
    }

    // start current playlist
    else if (matched = chatMessage.text.match(/^start/)) {
      await playlistPlayer.start()
    }

    // info about curren track
    else if (matched = chatMessage.text.match(/^info/)) {
      let ret = ''
      if (playlistPlayer.currentItem) {
        const plays = await playlistPlayer.currentItem.Track.countPlays()
        ret += `
**${playlistPlayer.currentItem.Track.name}**<br>
<small>url=${playlistPlayer.currentItem.Track.url}<br>
id=${playlistPlayer.currentItem.Track.id.substr(0, 6)}<br>
playcount=${plays} </small>
`
      } else {
        ret += "The playlist is stopped."
      }
      await soupClient.sendChatMessage(ret)
    }

    // add existing track
    else if (matched = chatMessage.text.match(/^add (......)$/)) {
      const id = matched[1]
      const track = await Track.findOne({ where: { id: { [Op.like]: `${id}%` } } })
      console.log('track:', track)
      if (!track) {
        await soupClient.sendChatMessage(`track not found`)
        return
      }
      await ensureTrackIsQueued(playlist, track)
      await soupClient.sendChatMessage(`*${track.name}* is queued to play`)
    }

    // list tracks
    else if (matched = chatMessage.text.match(/^tracks/)) {
      let tracks = await Track.findAll({ include: [User, Play, Vote], order: [['name', 'ASC']] })
      let ret = `<table class="playlistbot"><thead><tr><td>id</td><td></td><td>plays</td></tr></thead><tbody>`
      tracks.forEach(t => {
        ret += `<tr>`
        ret += `<td style="border: 1px solid #AAA; background-color: #777">`
        ret += t.id.substr(0, 6)
        ret += `</td>`
        ret += `<td>`
        ret += t.name
        ret += `</td>`
        ret += `<td>`
        ret += t.Plays.length
        ret += `</td>`
        ret += `</tr>`
      })
      ret += `</tbody></table>`
      await soupClient.sendChatMessage(ret)

    }

    // delete track
    else if (matched = chatMessage.text.match(/^dt (......)$/)) {
      const id = matched[1]
      const track = await Track.findOne({ where: { id: { [Op.like]: `${id}%` } } })
      console.log('track:', track)
      if (!track) {
        await soupClient.sendChatMessage(`track not found`)
        return
      }
      const playlistItems = await PlaylistItem.findAll({ where: { TrackId: track.id } })
      playlistItems.forEach(async (pli) => {
        await pli.destroy()
      })
      const plays = await Play.findAll({ where: { TrackId: track.id } })
      plays.forEach(async (p) => {
        await p.destroy()
      })
      const votes = await Vote.findAll({ where: { TrackId: track.id } })
      votes.forEach(async (v) => {
        await v.destroy()
      })
      await track.destroy()
      await soupClient.sendChatMessage(`*${track.name}* has been removed`)
    }

    // clear playlist
    else if (matched = chatMessage.text.match(/^cpl$/)) {
      await playlistPlayer.stop()
      await PlaylistItem.destroy({ where: { PlaylistId: playlist.id } })
      await soupClient.sendChatMessage(`Playlist *${playlist.name}* has been emptied`)
    }

    // addN
    else if (matched = chatMessage.text.match(/^addn (\d*)$/)) {
      const count = parseInt(matched[1])
      const items = await playlist.getPlaylistItems({ include: [Track] })
      const excludeIds = items.map(i => i.Track.id)
      const tracks = await Track.findAll({ where: { id: { [Op.notIn]: excludeIds } }, limit: count, order: [Sequelize.literal('RANDOM()')] })
      console.log("tracks:", tracks.map(t => t.name))
      for (const track of tracks) {
        await ensureTrackIsQueued(playlist, track)
      }
      await soupClient.sendChatMessage(`${tracks.length} Tracks have been added fro mthe pool`)
    }

    else if (matched = chatMessage.text.match(/^del (......)$/)) {
      const id = matched[1]
      const track = await Track.findOne({ where: { id: { [Op.like]: `${id}%` } } })
      console.log('track to delete:', track.id)
      if (!track) {
        await soupClient.sendChatMessage(`item not found`)
        return
      }
      const playlistItems = await PlaylistItem.findAll({ where: { TrackId: track.id, PlaylistId: playlistPlayer.playlist.id } })
      for (const pli of playlistItems) {
        console.log("pli:", pli)
        await pli.destroy()
      }
      await soupClient.sendChatMessage(`*${track.name}* has been removed from playlist.`)
    }


    // unknown
    else {
      await soupClient.sendChatMessage(`### Commands:
* Add an arbitrary url to the track pool and enqueue it in the current playlist:
\`\`\`
${config.commandPrefix} http://example.com/something_nice
\`\`\`

* Start player:
\`\`\`
${config.commandPrefix} start
\`\`\`

* Stop player:
\`\`\`
${config.commandPrefix} stop
\`\`\`

* Skip to next item:
\`\`\`
${config.commandPrefix} next
\`\`\`

* show current playlist:
\`\`\`
${config.commandPrefix} list
\`\`\`

* clear current playlist:
\`\`\`
${config.commandPrefix} cpl
\`\`\`

* add N random tracks from the pool to the current playlist:
\`\`\`
${config.commandPrefix} addn <N>
\`\`\`

* show current playing track:
\`\`\`
${config.commandPrefix} info
\`\`\`

* enqueue track:
\`\`\`
${config.commandPrefix} add <track id>
\`\`\`

* show current track pool:
\`\`\`
${config.commandPrefix} tracks
\`\`\`

* delete track from track pool:
\`\`\`
${config.commandPrefix} dt <track id>
\`\`\`

* remove item from current playlist:
\`\`\`
${config.commandPrefix} delete <track id>
\`\`\`


`
      )
    }
  }

  ////////////////////////////////////////

  console.log(config)

  await mkdirp(config.trackDataRoot)

  const initDatabase = config.initDatabase || false

  await User.sync({ force: initDatabase })
  await Track.sync({ force: initDatabase })
  await Playlist.sync({ force: initDatabase })
  await PlaylistItem.sync({ force: initDatabase })
  await Vote.sync({ force: initDatabase })
  await Play.sync({ force: initDatabase })
  // seed a default playlist
  const [playlist, created] = await Playlist.findOrCreate({
    where: { name: 'default' }
  })
  console.log("ensured playlist", playlist.name)

  console.log("All models were synchronized successfully.");

  //////////////////////////////////////////
  const roomId = config.roomName || 'miniclub'
  const displayName = "PlaylistBot"
  const url = config.mainurl || 'https://soup.jetpack.cl:5443'

  const soupClient = new SoupClient(url, roomId, displayName)
  const playlistPlayer = new PlaylistPlayer(playlist, config.trackDataRoot, soupClient)

  soupClient.on('ready', async () => {
    console.log("ready.")
    // playlistPlayer.play()
    await soupClient.sendChatMessage(`Hello. Type \`${config.commandPrefix} help\` for help.`)
  })

  soupClient.on('chatMessage', async function (data) {
    try {
      const { peerId, chatMessage } = data
      // console.log("got chat message: ", data)
      const re = new RegExp(`${config.commandPrefix} (.*)`, 'i')
      if (chatMessage.type === 'message' && (matched = chatMessage.text.match(re))) {
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
  } catch (e) {
    console.log(e)
  }
})()