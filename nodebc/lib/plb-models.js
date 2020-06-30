const { Sequelize, Model, DataTypes } = require('sequelize')

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite3'
});


class User extends Model {}
User.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  name: DataTypes.STRING
}, { sequelize, indexes: [
  { fields: ['name'] }
] });

class Track extends Model {}
Track.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  name: DataTypes.STRING,
  artist: DataTypes.STRING,
  filepath: DataTypes.STRING,
  url: DataTypes.STRING,
  type: DataTypes.STRING,
  submitUserId: {
    type: DataTypes.UUID, 
    references: {
      model: User,
      key: 'id',
    }
  }
}, { sequelize, indexes: [
  { fields: ['type'] }
]});

class Playlist extends Model {}
Playlist.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  name: {type: DataTypes.STRING}
}, { sequelize, indexes: [
  { fields: ['name'] }
]});


class PlaylistItem extends Model {}
PlaylistItem.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  sort:{type: DataTypes.FLOAT, allowNull: false},
  playlistId: {
    type: DataTypes.UUID, 
    references: {
      model: Playlist,
      key: 'id',
    }
  },
  createdById: {
    type: DataTypes.UUID, 
    references: {
      model: User,
      key: 'id',
    }
  },
  trackId: {
    type: DataTypes.UUID, 
    references: {
      model: Track,
      key: 'id',
    }
  }
}, { sequelize, indexes: [
  { fields: ['sort'] }
]});

class Play extends Model {}
Play.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  playedToEnd: {type: DataTypes.BOOLEAN, defaultValue: false},
  trackId: {
    type: DataTypes.UUID, 
    references: {
      model: Track,
      key: 'id',
    }
  }
}, { sequelize, indexes: [
  { fields: ['playedToEnd'] }
]})

class Vote extends Model {}
Vote.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  value: DataTypes.INTEGER,
  voterId: {
    type: DataTypes.UUID, 
    references: {
      model: User,
      key: 'id',
    }
  },
  playlistItemId: {
    type: DataTypes.UUID, 
    references: {
      model: PlaylistItem,
      key: 'id',
    }
  }
}, { sequelize })

module.exports = {
  sequelize,
  User,
  Track,
  Playlist,
  PlaylistItem,
  Play,
  Vote
}