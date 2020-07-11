'use strict';
const { Sequelize, Model, DataTypes } = require('sequelize')

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // User
    await queryInterface.createTable('Users', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })
    await queryInterface.addIndex('Users', ['name'])

    await queryInterface.createTable('Tracks', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      name: DataTypes.STRING,
      artist: DataTypes.STRING,
      filepath: DataTypes.STRING,
      url: DataTypes.STRING,
      type: DataTypes.STRING,
      state: {type: DataTypes.STRING, allowNull: false, default: 'ADDED'},
      'UserId': {
        type: Sequelize.UUID,
        references: {
          model: 'Users',
          key: 'id',
        },
        allowNull: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })

    await queryInterface.addIndex('Tracks', ['type'])
    await queryInterface.addIndex('Tracks', ['state'])


    await queryInterface.createTable('Playlists', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      name: DataTypes.STRING,
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })
    await queryInterface.addIndex('Playlists', ['name'])


    await queryInterface.createTable('PlaylistItems', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      sort: {type: DataTypes.FLOAT, allowNull: false},
      played: {type: DataTypes.BOOLEAN, defaultValue: false},
      playedToEnd: {type: DataTypes.BOOLEAN, defaultValue: false},
      playedAt: {type: DataTypes.DATE},
      'PlaylistId': {
        type: Sequelize.UUID,
        references: {
          model: 'Playlists',
          key: 'id',
        },
        allowNull: false,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      'TrackId': {
        type: Sequelize.UUID,
        references: {
          model: 'Tracks',
          key: 'id',
        },
        allowNull: false,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      'UserId': {
        type: Sequelize.UUID,
        references: {
          model: 'Users',
          key: 'id',
        },
        allowNull: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })

    await queryInterface.addIndex('PlaylistItems', ['sort'])
    await queryInterface.addIndex('PlaylistItems', ['played'])
    await queryInterface.addIndex('PlaylistItems', ['playedToEnd'])
    await queryInterface.addIndex('PlaylistItems', ['playedAt'])

    await queryInterface.createTable('Votes', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      value: DataTypes.INTEGER,
      'UserId': {
        type: Sequelize.UUID,
        references: {
          model: 'Users',
          key: 'id',
        },
        allowNull: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      'TrackId': {
        type: Sequelize.UUID,
        references: {
          model: 'Tracks',
          key: 'id',
        },
        allowNull: false,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })

    await queryInterface.createTable('Plays', {
      id: {
        type: DataTypes.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true
      },
      'TrackId': {
        type: Sequelize.UUID,
        references: {
          model: 'Tracks',
          key: 'id',
        },
        allowNull: false,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Users');
  }
}

