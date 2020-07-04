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
  state: {type: DataTypes.STRING, allowNull: false, default: 'ADDED'}
}, { sequelize, indexes: [
  { fields: ['type'] },
  { fields: ['state'] }
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
  sort:{type: DataTypes.FLOAT, allowNull: false}
}, { sequelize, indexes: [
  { fields: ['sort'] }
]});

class Play extends Model {}
Play.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  playedToEnd: {type: DataTypes.BOOLEAN, defaultValue: false}
}, { sequelize, indexes: [
  { fields: ['playedToEnd'] }
]})

class Vote extends Model {}
Vote.init({
  id: {type: DataTypes.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
  value: DataTypes.INTEGER
}, { sequelize })


User.hasMany(Track)
Track.belongsTo(User, {foreignKey: {name: 'submitUser', type: DataTypes.UUID}})
Track.hasMany(PlaylistItem)
Track.hasMany(Vote)
Track.hasMany(Play)
Vote.belongsTo(Track, {foreignKey: {type: DataTypes.UUID}})
Play.belongsTo(Track, {foreignKey: {type: DataTypes.UUID}})
PlaylistItem.belongsTo(Track, {foreignKey: {type: DataTypes.UUID}})
Playlist.hasMany(PlaylistItem)



module.exports = {
  sequelize,
  User,
  Track,
  Playlist,
  PlaylistItem,
  Play,
  Vote
}

